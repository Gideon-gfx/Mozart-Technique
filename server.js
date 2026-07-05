require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const { OAuth2Client } = require('google-auth-library');

const store = require('./data/store');
const { COURSES, getCourse, getCategories, getSuggestions } = require('./data/courses');
const geo = require('./data/geo');
const currency = require('./data/currency');
const content = require('./data/content');
const qna = require('./data/qna');
const aiCoach = require('./data/ai-coach');
const tutors = require('./data/tutors');
const assignments = require('./data/assignments');
const quizzes = require('./data/quizzes');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set - using an insecure development default. Set it in a .env file for production.');
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
if (!GOOGLE_CLIENT_ID) {
  console.warn('GOOGLE_CLIENT_ID is not set - Google sign-in will stay disabled on the login page.');
}
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

app.use(express.json());

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'dev-insecure-secret-change-me'],
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  sameSite: 'lax',
}));

const PUBLIC_DIR = path.join(__dirname, 'public');
const VIDEO_UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads', 'videos');
fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, VIDEO_UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) return cb(new Error('Please upload a video file.'));
    cb(null, true);
  },
});

// dashboard/payment/video/admin must only be reachable through the gated
// routes below (which check auth, role, and purchase state), never by raw
// filename. Path is lowercased since Windows/macOS filesystems are
// case-insensitive - express.static would otherwise serve "/Dashboard.html"
// even though this list only spells the lowercase form.
const GATED_HTML_FILES = ['/dashboard.html', '/payment.html', '/video.html', '/admin.html', '/become-tutor.html', '/find-tutor.html', '/manage-quizzes.html'];
app.use((req, res, next) => {
  if (GATED_HTML_FILES.includes(req.path.toLowerCase())) {
    return res.redirect('/login');
  }
  next();
});

app.use(express.static(PUBLIC_DIR));

// --- AUTH HELPERS ---
function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  return store.findById(req.session.userId);
}

function requireAuthPage(req, res, next) {
  if (!currentUser(req)) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

function requireAuthApi(req, res, next) {
  if (!currentUser(req)) {
    return res.status(401).json({ success: false, error: 'You must be signed in.' });
  }
  next();
}

function requireAdminPage(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  if (user.role !== 'admin') return res.redirect('/dashboard');
  next();
}

function requireAdminApi(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'You must be signed in.' });
  if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin access required.' });
  next();
}

// Approved tutors can author quiz questions, but only for courses in
// subjects they're approved to teach - not the whole catalog like admin.
function requireApprovedTutorApi(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'You must be signed in.' });
  const profile = tutors.findByUserId(user.id);
  if (!profile || profile.status !== 'approved') {
    return res.status(403).json({ success: false, error: 'Approved tutor access required.' });
  }
  req.tutorProfile = profile;
  next();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    countryCode: user.countryCode || null,
    purchasedCourses: user.purchasedCourses,
  };
}

// Demo/admin accounts can reach every purchasable course without paying.
function canAccessCourse(user, courseId) {
  return store.hasFullAccess(user) || user.purchasedCourses.includes(courseId);
}

// Country resolution order: signed-in user's saved preference, then a
// best-effort IP lookup (which cannot resolve anything on localhost/private
// networks), then a hardcoded default. Never throws.
async function resolveCountryCode(req) {
  const user = currentUser(req);
  if (user && user.countryCode) return user.countryCode;
  const fromIp = await geo.lookupCountryByIp(req.ip);
  return fromIp || geo.DEFAULT_COUNTRY;
}

async function getGeoInfo(req) {
  const countryCode = await resolveCountryCode(req);
  const info = geo.getCountryInfo(countryCode);
  return { countryCode, name: info.name, currency: info.currency, symbol: info.symbol };
}

async function localizeCourse(req, course) {
  const geoInfo = await getGeoInfo(req);
  const localPrice = await currency.convertFromUsd(course.price, geoInfo.currency);
  return {
    ...course,
    countryCode: geoInfo.countryCode,
    currency: geoInfo.currency,
    symbol: geoInfo.symbol,
    localPrice: Math.round(localPrice * 100) / 100,
  };
}

// --- PAGE ROUTES ---
app.get(['/', '/home'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'home.html'));
});

app.get('/courses', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'courses.html'));
});

app.get('/about', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'about.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'contact.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'reset-password.html'));
});

app.get('/dashboard', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.get('/become-tutor', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'become-tutor.html'));
});

app.get('/find-tutor', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'find-tutor.html'));
});

app.get('/manage-quizzes', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  const profile = tutors.findByUserId(user.id);
  if (!profile || profile.status !== 'approved') return res.redirect('/dashboard');
  res.sendFile(path.join(PUBLIC_DIR, 'manage-quizzes.html'));
});

// Public course details - no login required to browse what a course covers.
// Only enrolling (via /payment/:id) requires an account.
app.get('/courses/:id', (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.redirect('/courses');
  res.sendFile(path.join(PUBLIC_DIR, 'course-detail.html'));
});

// A course must be picked before paying; without one, send the learner
// back to the catalog instead of showing an empty payment form.
app.get('/payment', requireAuthPage, (req, res) => {
  res.redirect('/courses');
});

app.get('/payment/:id', requireAuthPage, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course || !course.purchasable) return res.redirect('/courses');

  const user = currentUser(req);
  if (canAccessCourse(user, course.id)) {
    return res.redirect(`/video/${course.slug}`);
  }
  res.sendFile(path.join(PUBLIC_DIR, 'payment.html'));
});

app.get('/video/:id', requireAuthPage, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.redirect('/courses');

  const user = currentUser(req);
  if (!canAccessCourse(user, course.id)) {
    return res.redirect(`/payment/${course.slug}`);
  }
  res.sendFile(path.join(PUBLIC_DIR, 'video.html'));
});

// --- AUTH API ---
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
  }
  if (store.findByEmail(email)) {
    return res.status(409).json({ success: false, error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const countryCode = (await geo.lookupCountryByIp(req.ip)) || null;
  const user = store.createUser({ name, email, passwordHash, countryCode });
  req.session.userId = user.id;

  store.addNotification(user.id, { type: 'welcome', message: `Welcome to Mozart Technique, ${user.name}!` });

  res.json({ success: true, user: publicUser(user) });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const user = store.findByEmail(email);
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ success: false, error: 'Invalid email or password.' });
  }

  req.session.userId = user.id;
  res.json({ success: true, user: publicUser(user) });
});

app.get('/api/config', (req, res) => {
  res.json({ success: true, googleClientId: GOOGLE_CLIENT_ID });
});

// No SMTP is configured, so there's nowhere to deliver an emailed reset
// link - the reset URL is handed straight back to the requesting browser
// instead. Still token-based and time-limited (1 hour, single-use), just
// delivered in-app rather than by email.
app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });

  const user = store.createResetToken(email);
  if (!user) {
    return res.status(404).json({ success: false, error: 'No account found with that email.' });
  }
  res.json({ success: true, resetUrl: `/reset-password?token=${user.resetToken}` });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'Reset token and new password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
  }
  if (!store.findByResetToken(token)) {
    return res.status(400).json({ success: false, error: 'This reset link is invalid or has expired.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  store.resetPassword(token, passwordHash);
  res.json({ success: true });
});

app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) {
    return res.status(501).json({ success: false, error: 'Google sign-in is not configured on this server.' });
  }

  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ success: false, error: 'Missing Google credential.' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid Google credential.' });
  }

  if (!payload.email_verified) {
    return res.status(401).json({ success: false, error: 'Google account email is not verified.' });
  }

  let user = store.findByGoogleId(payload.sub);
  if (!user) {
    // Same email may already have a password account - link Google to it
    // instead of creating a duplicate.
    user = store.findByEmail(payload.email);
    if (user) {
      user = store.linkGoogleId(user.id, payload.sub);
    } else {
      user = store.createUser({ name: payload.name || payload.email, email: payload.email, googleId: payload.sub });
    }
  }

  req.session.userId = user.id;
  res.json({ success: true, user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get('/api/session', (req, res) => {
  const user = currentUser(req);
  res.json({ success: true, user: user ? publicUser(user) : null });
});

// --- GEO / CURRENCY API ---
app.get('/api/geo', async (req, res) => {
  const geoInfo = await getGeoInfo(req);
  res.json({ success: true, ...geoInfo, countries: geo.listCountries() });
});

app.post('/api/profile/country', requireAuthApi, (req, res) => {
  const { countryCode } = req.body || {};
  if (!countryCode || !geo.COUNTRY_CURRENCY[countryCode]) {
    return res.status(400).json({ success: false, error: 'Unknown country code.' });
  }
  const user = currentUser(req);
  const updated = store.setCountry(user.id, countryCode);
  res.json({ success: true, user: publicUser(updated) });
});

// --- COURSE / PAYMENT API ---
app.get('/api/courses/:id', async (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  res.json({ success: true, course: await localizeCourse(req, course) });
});

// Public syllabus preview - lesson titles only, no video IDs, so browsing a
// course page never leaks watchable content before payment.
app.get('/api/courses/:id/syllabus', (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  const lessons = content.getEffectiveLessons(course.id).map((l) => ({ title: l.title }));
  res.json({ success: true, lessons });
});

app.get('/api/dashboard', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const enrolledCourses = store.hasFullAccess(user)
    ? COURSES.filter((c) => c.purchasable)
    : user.purchasedCourses.map((id) => getCourse(id)).filter(Boolean);
  const geoInfo = await getGeoInfo(req);
  const badges = store.getBadges(user, 4);
  res.json({
    success: true,
    user: publicUser(user),
    enrolledCourses,
    geo: geoInfo,
    streak: user.streak || { count: 0 },
    badges,
  });
});

// Payment requires a signed-in session (requireAuthApi) - there is no way
// to reach this endpoint, and therefore no way to unlock a course video,
// without an account.
app.post('/api/payment', requireAuthApi, async (req, res) => {
  const { courseId, method } = req.body || {};
  const course = getCourse(courseId);
  if (!course || !course.purchasable) {
    return res.status(400).json({ success: false, error: 'This course is not available for purchase.' });
  }

  const user = currentUser(req);
  if (canAccessCourse(user, course.id)) {
    return res.json({ success: true, alreadyPurchased: true, redirect: `/video/${course.slug}` });
  }

  // Simulated payment processing - no real payment provider is wired up.
  // The charge is still authoritatively priced in USD (course.price); the
  // localized amount is only for display in the confirmation message.
  store.addPurchase(user.id, course.id);
  const geoInfo = await getGeoInfo(req);
  const localAmount = Math.round((await currency.convertFromUsd(course.price, geoInfo.currency)) * 100) / 100;

  store.addNotification(user.id, { type: 'payment', message: `Payment received for ${course.title} - enjoy the course!` });

  res.json({
    success: true,
    message: `Payment of ${geoInfo.symbol}${localAmount} (${geoInfo.currency}) via ${method || 'card'} processed.`,
    redirect: `/video/${course.slug}`,
  });
});

app.get('/api/video/:id', requireAuthApi, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });

  const user = currentUser(req);
  if (!canAccessCourse(user, course.id)) {
    return res.status(403).json({ success: false, error: 'Purchase this course to watch its lessons.' });
  }

  const lessons = content.getEffectiveLessons(course.id);
  const completed = (user.progress && user.progress[String(course.id)]) || [];
  res.json({ success: true, course, lessons, completedLessons: completed, streak: user.streak || { count: 0 } });
});

// --- PROGRESS / STREAKS / BADGES ---
app.post('/api/progress/:id', requireAuthApi, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });

  const user = currentUser(req);
  if (!canAccessCourse(user, course.id)) {
    return res.status(403).json({ success: false, error: 'Purchase this course first.' });
  }

  const { lessonIndex, completed } = req.body || {};
  if (typeof lessonIndex !== 'number') {
    return res.status(400).json({ success: false, error: 'lessonIndex is required.' });
  }

  const updated = store.setLessonProgress(user.id, course.id, lessonIndex, Boolean(completed));
  const totalLessons = content.getEffectiveLessons(course.id).length;
  const completedLessons = updated.progress[String(course.id)] || [];
  res.json({
    success: true,
    completedLessons,
    streak: updated.streak,
    badges: store.getBadges(updated, totalLessons),
    allLessonsComplete: completedLessons.length >= totalLessons,
    hasQuiz: quizzes.getQuestionsForAdmin(course.id).length > 0,
  });
});

// --- FINAL QUIZ ---
// A course with no admin-authored questions has no gate: finishing the
// lessons is enough. A course with questions requires passing before the
// student is congratulated; failing clears their lesson progress so they
// have to work back through the material first.
app.get('/api/courses/:id/quiz', requireAuthApi, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  const user = currentUser(req);
  if (!canAccessCourse(user, course.id)) {
    return res.status(403).json({ success: false, error: 'Purchase this course first.' });
  }
  res.json({ success: true, questions: quizzes.getQuestionsForStudent(course.id) });
});

app.post('/api/courses/:id/quiz/submit', requireAuthApi, async (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  const user = currentUser(req);
  if (!canAccessCourse(user, course.id)) {
    return res.status(403).json({ success: false, error: 'Purchase this course first.' });
  }

  const { answers } = req.body || {};
  const result = quizzes.grade(course.id, Array.isArray(answers) ? answers : []);
  if (!result) return res.status(400).json({ success: false, error: 'This course has no quiz.' });

  store.setQuizResult(user.id, course.id, result);

  if (result.passed) {
    const suggestions = getSuggestions(course.id).map((c) => ({ id: c.id, slug: c.slug, title: c.title, level: c.level }));
    return res.json({ success: true, passed: true, score: result.score, suggestions });
  }

  store.resetCourseProgress(user.id, course.id);
  res.json({ success: true, passed: false, score: result.score });
});

app.get('/api/admin/courses/:id/quiz', requireAdminApi, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  res.json({ success: true, questions: quizzes.getQuestionsForAdmin(course.id) });
});

app.post('/api/admin/courses/:id/quiz', requireAdminApi, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  const { questions } = req.body || {};
  if (!Array.isArray(questions)) {
    return res.status(400).json({ success: false, error: 'Questions must be an array.' });
  }
  const saved = quizzes.setQuestions(course.id, questions);
  res.json({ success: true, questions: saved });
});

// --- APPROVED TUTORS: quiz authoring for their own subjects ---
// Same underlying quiz storage as the admin editor, scoped so a tutor can
// only touch courses in categories they're approved to teach.
function tutorOwnedCourse(req, res) {
  const course = getCourse(req.params.id);
  if (!course) { res.status(404).json({ success: false, error: 'Course not found.' }); return null; }
  if (!req.tutorProfile.categories.includes(course.category)) {
    res.status(403).json({ success: false, error: "You can only manage quizzes for subjects you're approved to teach." });
    return null;
  }
  return course;
}

app.get('/api/tutor/courses', requireApprovedTutorApi, (req, res) => {
  const courses = COURSES
    .filter((c) => c.purchasable && req.tutorProfile.categories.includes(c.category))
    .map((c) => ({ id: c.id, title: c.title, category: c.category, level: c.level }));
  res.json({ success: true, courses });
});

app.get('/api/tutor/courses/:id/quiz', requireApprovedTutorApi, (req, res) => {
  const course = tutorOwnedCourse(req, res);
  if (!course) return;
  res.json({ success: true, questions: quizzes.getQuestionsForAdmin(course.id) });
});

app.post('/api/tutor/courses/:id/quiz', requireApprovedTutorApi, (req, res) => {
  const course = tutorOwnedCourse(req, res);
  if (!course) return;
  const { questions } = req.body || {};
  if (!Array.isArray(questions)) {
    return res.status(400).json({ success: false, error: 'Questions must be an array.' });
  }
  const saved = quizzes.setQuestions(course.id, questions);
  res.json({ success: true, questions: saved });
});

// Suggested next course after finishing this one - same category, next
// level up first, falling back to other purchasable courses in category.
app.get('/api/courses/:id/suggestions', async (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  const suggestions = await Promise.all(getSuggestions(course.id).map((c) => localizeCourse(req, c)));
  res.json({ success: true, suggestions });
});

// --- COURSE Q&A ---
app.get('/api/courses/:id/qna', (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  res.json({ success: true, threads: qna.getByCourse(course.id) });
});

app.post('/api/courses/:id/qna', requireAuthApi, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  const { question } = req.body || {};
  if (!question || !question.trim()) {
    return res.status(400).json({ success: false, error: 'Question text is required.' });
  }
  const user = currentUser(req);
  const thread = qna.addQuestion(course.id, user, question.trim());
  res.json({ success: true, thread });
});

app.post('/api/qna/:threadId/reply', requireAuthApi, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, error: 'Reply text is required.' });
  }
  const user = currentUser(req);
  const thread = qna.addReply(req.params.threadId, user, text.trim());
  if (!thread) return res.status(404).json({ success: false, error: 'Thread not found.' });
  res.json({ success: true, thread });
});

// --- NOTIFICATIONS ---
app.get('/api/notifications', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  res.json({ success: true, notifications: user.notifications || [] });
});

app.post('/api/notifications/read-all', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const updated = store.markNotificationsRead(user.id);
  res.json({ success: true, notifications: updated.notifications || [] });
});

// --- TUTORS: applications, browsing, and matching ---
// A tutor's approval status lives on the tutor profile, not the user's
// role, since the same account can be both a student and a tutor.
app.get('/api/categories', (req, res) => {
  res.json({ success: true, categories: getCategories() });
});

app.get('/api/tutors/me', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const profile = tutors.findByUserId(user.id);
  res.json({ success: true, profile });
});

app.post('/api/tutors/apply', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  if (tutors.findByUserId(user.id)) {
    return res.status(409).json({ success: false, error: 'You already have a tutor application on file.' });
  }

  const { categories, levels, city, teachesOnline, phone, qualifications, experienceYears, bio, hourlyRateUsd } = req.body || {};
  if (!Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ success: false, error: 'Choose at least one subject you can teach.' });
  }
  if (!qualifications || !qualifications.trim()) {
    return res.status(400).json({ success: false, error: 'Describe your qualifications.' });
  }
  if (!city && !teachesOnline) {
    return res.status(400).json({ success: false, error: 'Provide a city or offer online lessons.' });
  }
  if (!hourlyRateUsd || Number(hourlyRateUsd) <= 0) {
    return res.status(400).json({ success: false, error: 'Set your hourly rate.' });
  }

  const profile = tutors.apply({
    userId: user.id, name: user.name, email: user.email,
    categories, levels, city, teachesOnline, phone, qualifications, experienceYears, bio, hourlyRateUsd,
  });

  // No email is configured, so admins are notified in-app instead of by
  // email - every admin account sees new applications in their bell icon.
  store.listUsers()
    .filter((u) => u.role === 'admin')
    .forEach((admin) => store.addNotification(admin.id, {
      type: 'tutor-application',
      message: `New tutor application from ${user.name} (${user.email}) - review it in the admin panel.`,
    }));

  res.json({ success: true, profile });
});

// Public directory of approved tutors, filterable by subject/city/online -
// browsing doesn't require an account, only requesting one does. Rates are
// localized the same way course prices are, so students compare tutors in
// their own currency.
app.get('/api/tutors', async (req, res) => {
  const { category, city, online } = req.query;
  let list = tutors.listApproved();
  if (category) list = list.filter((t) => t.categories.includes(category));
  if (city) list = list.filter((t) => (t.city || '').toLowerCase().includes(String(city).toLowerCase()));
  if (online === 'true') list = list.filter((t) => t.teachesOnline);

  const geoInfo = await getGeoInfo(req);
  const localized = await Promise.all(list.map(async (t) => ({
    id: t.id, name: t.name, categories: t.categories, levels: t.levels,
    city: t.city, teachesOnline: t.teachesOnline, experienceYears: t.experienceYears, bio: t.bio,
    hourlyRateUsd: t.hourlyRateUsd,
    hourlyRateLocal: Math.round((await currency.convertFromUsd(t.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
    currency: geoInfo.currency, symbol: geoInfo.symbol,
  })));
  localized.sort((a, b) => a.hourlyRateUsd - b.hourlyRateUsd);

  res.json({ success: true, tutors: localized });
});

app.post('/api/tutor-requests', requireAuthApi, (req, res) => {
  const { category, city, online, phone, notes, preferredTutorId } = req.body || {};
  if (!category) return res.status(400).json({ success: false, error: 'Choose a subject.' });
  if (!city && !online) return res.status(400).json({ success: false, error: 'Provide your city or choose online.' });

  const user = currentUser(req);
  const request = assignments.createRequest({
    studentId: user.id, studentName: user.name, studentEmail: user.email,
    category, city, online, phone, notes, preferredTutorId,
  });

  store.listUsers()
    .filter((u) => u.role === 'admin')
    .forEach((admin) => store.addNotification(admin.id, {
      type: 'tutor-request',
      message: `New tutor request from ${user.name} for ${category} - match them in the admin panel.`,
    }));

  res.json({ success: true, request });
});

app.get('/api/my-assignments', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const asStudent = assignments.listForStudent(user.id);
  const tutorProfile = tutors.findByUserId(user.id);
  const asTutor = tutorProfile ? assignments.listForTutor(tutorProfile.id) : [];
  res.json({ success: true, asStudent, asTutor, tutorProfile });
});

// --- ADMIN: TUTOR REVIEW & MATCHING ---
app.get('/api/admin/tutors', requireAdminApi, (req, res) => {
  res.json({ success: true, tutors: tutors.listAll() });
});

app.post('/api/admin/tutors/:id/status', requireAdminApi, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status.' });
  }
  const updated = tutors.setStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ success: false, error: 'Application not found.' });

  if (status === 'approved') {
    store.addNotification(updated.userId, { type: 'tutor', message: 'Your tutor application has been approved! Students can now be matched to you.' });
  } else if (status === 'rejected') {
    store.addNotification(updated.userId, { type: 'tutor', message: 'Your tutor application was not approved this time.' });
  }
  res.json({ success: true, tutor: updated });
});

app.get('/api/admin/tutor-requests', requireAdminApi, (req, res) => {
  res.json({ success: true, requests: assignments.listAll() });
});

app.post('/api/admin/tutor-requests/:id/assign', requireAdminApi, (req, res) => {
  const { tutorId } = req.body || {};
  const tutor = tutors.findById(tutorId);
  if (!tutor || tutor.status !== 'approved') {
    return res.status(400).json({ success: false, error: 'Choose an approved tutor.' });
  }
  const record = assignments.assignTutor(req.params.id, tutor);
  if (!record) return res.status(404).json({ success: false, error: 'Request not found.' });

  store.addNotification(record.studentId, { type: 'tutor', message: `You've been matched with ${tutor.name} for ${record.category}. Check your email/contact details.` });
  store.addNotification(tutor.userId, { type: 'tutor', message: `You've been matched with a new student (${record.studentName}) for ${record.category}.` });
  res.json({ success: true, request: record });
});

app.post('/api/admin/tutor-requests/:id/end', requireAdminApi, (req, res) => {
  const record = assignments.endAssignment(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'Request not found.' });
  res.json({ success: true, request: record });
});

// --- AI PRACTICE FEEDBACK (inert until ANTHROPIC_API_KEY is set) ---
app.post('/api/practice-feedback', requireAuthApi, async (req, res) => {
  const { courseId, notes } = req.body || {};
  const course = getCourse(courseId);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  if (!notes || !notes.trim()) {
    return res.status(400).json({ success: false, error: 'Describe what you practiced first.' });
  }

  const user = currentUser(req);
  if (!canAccessCourse(user, course.id)) {
    return res.status(403).json({ success: false, error: 'Purchase this course first.' });
  }

  const result = await aiCoach.getPracticeFeedback({
    courseTitle: course.title,
    category: course.category,
    level: course.level,
    notes: notes.trim(),
  });
  res.json({ success: true, ...result });
});

// --- ADMIN: COURSE CONTENT MANAGEMENT ---
app.get('/api/admin/courses', requireAdminApi, (req, res) => {
  res.json({ success: true, courses: COURSES });
});

app.get('/api/admin/courses/:id/content', requireAdminApi, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  res.json({ success: true, course, lessons: content.getEffectiveLessons(course.id) });
});

app.post('/api/admin/courses/:id/content', requireAdminApi, (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) return res.status(404).json({ success: false, error: 'Course not found.' });
  const { lessons } = req.body || {};
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one lesson is required.' });
  }
  const saved = content.setContent(course.id, { lessons });
  res.json({ success: true, lessons: saved.lessons });
});

// Lets an admin upload a video file straight from their computer as an
// alternative to pasting a YouTube ID. The returned URL is a self-hosted
// path under /uploads/videos that gets saved onto the lesson.
app.post('/api/admin/upload/video', requireAdminApi, (req, res) => {
  videoUpload.single('video')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Video is too large (max 500MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a video file to upload.' });
    res.json({ success: true, url: `/uploads/videos/${req.file.filename}` });
  });
});

// --- ADMIN: APPLICANTS / USERS ---
function adminUserView(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    countryCode: user.countryCode || null,
    purchasedCourses: user.purchasedCourses,
    createdAt: user.createdAt,
    authMethod: user.googleId ? 'google' : 'password',
  };
}

app.get('/api/admin/users', requireAdminApi, (req, res) => {
  const search = (req.query.search || '').toLowerCase().trim();
  let users = store.listUsers();
  if (search) {
    users = users.filter((u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
  }
  users = users
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(adminUserView);
  res.json({ success: true, users });
});

app.post('/api/admin/users/:id/role', requireAdminApi, (req, res) => {
  const { role } = req.body || {};
  if (!['user', 'demo', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role.' });
  }
  const updated = store.setRole(Number(req.params.id), role);
  if (!updated) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true, user: adminUserView(updated) });
});

app.post('/api/admin/users/:id/courses', requireAdminApi, (req, res) => {
  const { courseId, action } = req.body || {};
  const course = getCourse(courseId);
  if (!course) return res.status(400).json({ success: false, error: 'Unknown course.' });

  const userId = Number(req.params.id);
  const updated = action === 'revoke'
    ? store.removePurchase(userId, course.id)
    : store.addPurchase(userId, course.id);

  if (!updated) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true, user: adminUserView(updated) });
});

// Seed a demo and an admin account on first boot so there's always a way
// to explore every course without going through payment.
async function seedSpecialAccounts() {
  const seeds = [
    { name: 'Demo Student', email: 'demo@mozarttechnique.com', password: 'DemoPass123', role: 'demo' },
    { name: 'Admin', email: 'admin@mozarttechnique.com', password: 'AdminPass123', role: 'admin' },
  ];

  for (const seed of seeds) {
    if (store.findByEmail(seed.email)) continue;
    const passwordHash = await bcrypt.hash(seed.password, 10);
    store.createUser({ name: seed.name, email: seed.email, passwordHash, role: seed.role });
    console.log(`Seeded ${seed.role} account: ${seed.email} / ${seed.password}`);
  }
}

seedSpecialAccounts().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
