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
const taxonomy = require('./data/taxonomy');
const assessments = require('./data/assessments');
const curriculum = require('./data/curriculum');
const reels = require('./data/reels');
const certificates = require('./data/certificates');
const payments = require('./data/payments');
const { geocodeAddress, distanceKm } = require('./data/geocode');

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

const CERT_UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads', 'certificates');
fs.mkdirSync(CERT_UPLOAD_DIR, { recursive: true });

const certUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CERT_UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
      return cb(new Error('Please upload an image or PDF.'));
    }
    cb(null, true);
  },
});

// dashboard/payment/video/admin must only be reachable through the gated
// routes below (which check auth, role, and purchase state), never by raw
// filename. Path is lowercased since Windows/macOS filesystems are
// case-insensitive - express.static would otherwise serve "/Dashboard.html"
// even though this list only spells the lowercase form.
const GATED_HTML_FILES = ['/dashboard.html', '/payment.html', '/video.html', '/admin.html', '/become-tutor.html', '/find-tutor.html', '/manage-quizzes.html', '/orientation.html', '/tutor-evaluation.html', '/placement-quiz.html'];
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

app.get('/search', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'search.html'));
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

app.get('/orientation', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  if (!tutors.findByUserId(user.id)) return res.redirect('/become-tutor');
  res.sendFile(path.join(PUBLIC_DIR, 'orientation.html'));
});

app.get('/tutor-evaluation', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  if (!tutors.findByUserId(user.id)) return res.redirect('/become-tutor');
  res.sendFile(path.join(PUBLIC_DIR, 'tutor-evaluation.html'));
});

app.get('/placement-quiz', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'placement-quiz.html'));
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

// Public certificate verification - no login required, so a certificate
// can be checked by anyone who has the link/code.
app.get('/certificate/:code', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'certificate.html'));
});

// Public tutor profile - no login required to browse, same as a course
// detail page. Requesting the tutor still requires an account.
app.get('/tutors/:id', (req, res) => {
  const tutor = tutors.findById(req.params.id);
  if (!tutor || tutor.status !== 'approved' || tutor.expelled) return res.redirect('/find-tutor');
  res.sendFile(path.join(PUBLIC_DIR, 'tutor-profile.html'));
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
    rating: user.rating || null,
    placements: user.placements || {},
    studentProfile: user.studentProfile || null,
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
  payments.record({
    userId: user.id, userName: user.name, courseId: course.id, courseTitle: course.title,
    category: course.category, priceUsd: course.price, method: method || 'card',
  });
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
  const allLessonsComplete = completedLessons.length >= totalLessons;
  const hasQuiz = quizzes.getQuestionsForAdmin(course.id).length > 0;

  // No quiz gate means finishing the lessons is completion - issue the
  // certificate right here. Quiz-gated courses issue it on passing instead
  // (see /api/courses/:id/quiz/submit).
  let certificate = null;
  if (allLessonsComplete && !hasQuiz) {
    certificate = certificates.issue({
      userId: user.id, userName: user.name, courseId: course.id, courseTitle: course.title,
      category: course.category, level: course.level,
    });
  }

  res.json({
    success: true,
    completedLessons,
    streak: updated.streak,
    badges: store.getBadges(updated, totalLessons),
    allLessonsComplete,
    hasQuiz,
    certificate,
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
    const certificate = certificates.issue({
      userId: user.id, userName: user.name, courseId: course.id, courseTitle: course.title,
      category: course.category, level: course.level,
    });
    return res.json({ success: true, passed: true, score: result.score, suggestions, certificate });
  }

  store.resetCourseProgress(user.id, course.id);
  res.json({ success: true, passed: false, score: result.score });
});

// --- CERTIFICATES ---
app.get('/api/my-certificates', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  res.json({ success: true, certificates: certificates.listForUser(user.id) });
});

// Public and unauthenticated on purpose - a certificate should be
// verifiable by anyone who has the code (an employer, another school),
// not just the person who earned it.
app.get('/api/certificate/:code', (req, res) => {
  const certificate = certificates.findByCode(req.params.code);
  if (!certificate) return res.status(404).json({ success: false, error: 'Certificate not found.' });
  res.json({ success: true, certificate });
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

// --- APPROVED TUTORS: content + quiz authoring for their own subjects ---
// Same underlying storage as the admin editors, scoped so a tutor can only
// touch courses in categories they're approved to teach.
function tutorOwnedCourse(req, res) {
  const course = getCourse(req.params.id);
  if (!course) { res.status(404).json({ success: false, error: 'Course not found.' }); return null; }
  if (!req.tutorProfile.categories.includes(course.category)) {
    res.status(403).json({ success: false, error: "You can only manage content for subjects you're approved to teach." });
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

app.get('/api/tutor/courses/:id/content', requireApprovedTutorApi, (req, res) => {
  const course = tutorOwnedCourse(req, res);
  if (!course) return;
  res.json({ success: true, course, lessons: content.getEffectiveLessons(course.id) });
});

app.post('/api/tutor/courses/:id/content', requireApprovedTutorApi, (req, res) => {
  const course = tutorOwnedCourse(req, res);
  if (!course) return;
  const { lessons } = req.body || {};
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one lesson is required.' });
  }
  const saved = content.setContent(course.id, { lessons });
  res.json({ success: true, lessons: saved.lessons });
});

// Lets an approved tutor upload a video file for one of their own lessons,
// same underlying storage as the admin upload endpoint.
app.post('/api/tutor/upload/video', requireApprovedTutorApi, (req, res) => {
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

// Site-wide search across the course catalog and approved tutors - public,
// no login required, same as browsing either individually.
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ success: true, courses: [], tutors: [] });

  const matchedCourses = COURSES.filter((c) => c.purchasable && (
    c.title.toLowerCase().includes(q)
    || c.category.toLowerCase().includes(q)
    || c.level.toLowerCase().includes(q)
    || (c.description || '').toLowerCase().includes(q)
  )).slice(0, 12);

  const geoInfo = await getGeoInfo(req);
  const courses = await Promise.all(matchedCourses.map((c) => localizeCourse(req, c)));

  const matchedTutors = tutors.listApproved().filter((t) => (
    t.name.toLowerCase().includes(q)
    || t.categories.some((c) => c.toLowerCase().includes(q))
    || (t.genres || []).some((g) => g.toLowerCase().includes(q))
    || (t.bio || '').toLowerCase().includes(q)
  )).slice(0, 12);

  const tutorResults = await Promise.all(matchedTutors.map(async (t) => ({
    id: t.id, name: t.name, categories: t.categories, city: t.city, teachesOnline: t.teachesOnline,
    bio: t.bio, hourlyRateUsd: t.hourlyRateUsd,
    hourlyRateLocal: Math.round((await currency.convertFromUsd(t.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
    currency: geoInfo.currency, symbol: geoInfo.symbol, avgRating: tutors.avgRating(t),
  })));

  res.json({ success: true, courses, tutors: tutorResults });
});

// --- TUTORS: applications, browsing, and matching ---
// A tutor's approval status lives on the tutor profile, not the user's
// role, since the same account can be both a student and a tutor.
app.get('/api/categories', (req, res) => {
  res.json({ success: true, categories: getCategories() });
});

app.get('/api/taxonomy', (req, res) => {
  res.json({ success: true, genres: taxonomy.GENRES, ageGroups: taxonomy.AGE_GROUPS, levels: taxonomy.LEVELS });
});

// Any signed-up user with a tutor profile, approved or not - qualification
// evaluation and orientation happen before/around approval, not just after.
function requireTutorProfileApi(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'You must be signed in.' });
  const profile = tutors.findByUserId(user.id);
  if (!profile) return res.status(403).json({ success: false, error: 'No tutor application on file.' });
  req.tutorProfile = profile;
  next();
}

app.get('/api/tutors/me', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const profile = tutors.findByUserId(user.id);
  res.json({ success: true, profile });
});

app.post('/api/uploads/certificate', requireAuthApi, (req, res) => {
  certUpload.single('certificate')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 15MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file to upload.' });
    res.json({ success: true, url: `/uploads/certificates/${req.file.filename}` });
  });
});

app.post('/api/tutors/apply', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  if (tutors.findByUserId(user.id)) {
    return res.status(409).json({ success: false, error: 'You already have a tutor application on file.' });
  }

  const {
    categories, levels, genres, ageGroups, city, address, teachesOnline, phone,
    qualifications, experienceYears, bio, hourlyRateUsd, commuteRadiusKm, certificateUrl, inPersonVenue,
  } = req.body || {};
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

  const profile = await tutors.apply({
    userId: user.id, name: user.name, email: user.email,
    categories, levels, genres, ageGroups, city, address, teachesOnline, phone,
    qualifications, experienceYears, bio, hourlyRateUsd, commuteRadiusKm, certificateUrl, inPersonVenue,
  });

  // No email is configured, so admins are notified in-app instead of by
  // email - every admin account sees new applications in their bell icon.
  // Excludes the applicant themselves, in case an admin account applies to
  // tutor - they shouldn't get an admin alert about their own application.
  store.listUsers()
    .filter((u) => u.role === 'admin' && u.id !== user.id)
    .forEach((admin) => store.addNotification(admin.id, {
      type: 'tutor-application',
      message: `New tutor application from ${user.name} (${user.email}) - review it in the admin panel.`,
    }));

  res.json({ success: true, profile });
});

// --- TUTOR QUALIFICATION EVALUATION: assigns which levels a tutor may
// teach per subject. First evaluation is always allowed; re-evaluating to
// unlock a higher level is gated to once every 12 months per subject. ---
app.get('/api/tutors/evaluation/:category', requireTutorProfileApi, (req, res) => {
  const category = req.params.category;
  if (!req.tutorProfile.categories.includes(category)) {
    return res.status(403).json({ success: false, error: 'Not one of your applied subjects.' });
  }
  res.json({
    success: true,
    questions: assessments.getQuestionsForTaker('teacher-eval', category),
    canEvaluate: tutors.canReevaluate(req.tutorProfile, category),
    currentLevel: (req.tutorProfile.approvedLevelByCategory || {})[category] || null,
  });
});

app.post('/api/tutors/evaluation/:category/submit', requireTutorProfileApi, (req, res) => {
  const category = req.params.category;
  if (!req.tutorProfile.categories.includes(category)) {
    return res.status(403).json({ success: false, error: 'Not one of your applied subjects.' });
  }
  if (!tutors.canReevaluate(req.tutorProfile, category)) {
    return res.status(429).json({ success: false, error: 'You can re-evaluate this subject 12 months after your last evaluation.' });
  }
  const result = assessments.grade('teacher-eval', category, Array.isArray(req.body.answers) ? req.body.answers : []);
  if (!result) return res.status(400).json({ success: false, error: 'No evaluation is set up for this subject yet.' });
  const level = taxonomy.levelForScore(result.score);
  tutors.setApprovedLevel(req.tutorProfile.id, category, level);
  res.json({ success: true, score: result.score, level });
});

// --- TUTOR ORIENTATION: curated technique-teaching primer + quiz. Passing
// grants a one-time reward (bonus-matched student, or a recorded monetary
// bonus an admin fulfills manually - this app has no payment processing). ---
app.get('/api/tutors/orientation', requireTutorProfileApi, (req, res) => {
  const content = curriculum.getForCategory(curriculum.ORIENTATION_KEY);
  res.json({
    success: true,
    content,
    questions: assessments.getQuestionsForTaker('orientation', null),
    completed: req.tutorProfile.orientationCompleted,
    reward: req.tutorProfile.orientationReward,
  });
});

app.post('/api/tutors/orientation/submit', requireTutorProfileApi, (req, res) => {
  if (req.tutorProfile.orientationCompleted) {
    return res.status(409).json({ success: false, error: 'Orientation already completed.' });
  }
  const result = assessments.grade('orientation', null, Array.isArray(req.body.answers) ? req.body.answers : []);
  if (!result) return res.status(400).json({ success: false, error: 'Orientation is not set up yet.' });
  if (result.score < 0.6) return res.json({ success: true, passed: false, score: result.score });

  const content = curriculum.getForCategory(curriculum.ORIENTATION_KEY);
  const reward = (content && content.rewardType) || 'bonus_student';
  const updated = tutors.completeOrientation(req.tutorProfile.id, reward);
  res.json({ success: true, passed: true, score: result.score, reward: updated.orientationReward });
});

// --- STUDENT PROFILE + PLACEMENT ---
app.post('/api/profile/student', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const { ageGroup, genres, city, address } = req.body || {};
  const updated = await store.setStudentProfile(user.id, { ageGroup, genres, city, address });
  res.json({ success: true, studentProfile: updated.studentProfile });
});

app.get('/api/placement/:category', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  res.json({
    success: true,
    questions: assessments.getQuestionsForTaker('placement', req.params.category),
    placement: (user.placements || {})[req.params.category] || null,
  });
});

app.post('/api/placement/:category/submit', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const result = assessments.grade('placement', req.params.category, Array.isArray(req.body.answers) ? req.body.answers : []);
  if (!result) return res.status(400).json({ success: false, error: 'No placement quiz is set up for this subject yet.' });
  const level = taxonomy.levelForScore(result.score);
  store.setPlacementSuggestion(user.id, req.params.category, { score: result.score, level });
  res.json({ success: true, score: result.score, level });
});

// Public directory of approved tutors, filterable by subject/genre/age
// group/city/online - browsing doesn't require an account, only requesting
// one does. Rates are localized the same way course prices are, so students
// compare tutors in their own currency.
app.get('/api/tutors', async (req, res) => {
  const { category, genre, ageGroup, city, online } = req.query;
  let list = tutors.listApproved();
  if (category) list = list.filter((t) => t.categories.includes(category));
  if (genre) list = list.filter((t) => !t.genres || !t.genres.length || t.genres.includes(genre));
  if (ageGroup) list = list.filter((t) => !t.ageGroups || !t.ageGroups.length || t.ageGroups.includes(ageGroup));
  if (city) list = list.filter((t) => (t.city || '').toLowerCase().includes(String(city).toLowerCase()));
  if (online === 'true') list = list.filter((t) => t.teachesOnline);

  const geoInfo = await getGeoInfo(req);
  const localized = await Promise.all(list.map(async (t) => ({
    id: t.id, name: t.name, categories: t.categories, levels: t.levels, genres: t.genres, ageGroups: t.ageGroups,
    city: t.city, teachesOnline: t.teachesOnline, experienceYears: t.experienceYears, bio: t.bio,
    inPersonVenue: t.inPersonVenue,
    hourlyRateUsd: t.hourlyRateUsd,
    hourlyRateLocal: Math.round((await currency.convertFromUsd(t.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
    currency: geoInfo.currency, symbol: geoInfo.symbol,
    avgRating: tutors.avgRating(t),
    avgProfessionalism: tutors.avgProfessionalism(t),
  })));
  localized.sort((a, b) => a.hourlyRateUsd - b.hourlyRateUsd);

  res.json({ success: true, tutors: localized });
});

// Public profile page data - no login required, so a tutor's profile can
// be shared/linked like a real marketplace listing.
app.get('/api/tutors/:id/public', async (req, res) => {
  const tutor = tutors.findById(req.params.id);
  if (!tutor || tutor.status !== 'approved' || tutor.expelled) {
    return res.status(404).json({ success: false, error: 'Tutor not found.' });
  }
  const geoInfo = await getGeoInfo(req);
  res.json({
    success: true,
    tutor: {
      id: tutor.id, name: tutor.name, categories: tutor.categories, genres: tutor.genres, ageGroups: tutor.ageGroups,
      levels: tutor.levels, approvedLevelByCategory: tutor.approvedLevelByCategory,
      city: tutor.city, teachesOnline: tutor.teachesOnline, inPersonVenue: tutor.inPersonVenue,
      experienceYears: tutor.experienceYears, qualifications: tutor.qualifications, bio: tutor.bio,
      hourlyRateUsd: tutor.hourlyRateUsd,
      hourlyRateLocal: Math.round((await currency.convertFromUsd(tutor.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
      currency: geoInfo.currency, symbol: geoInfo.symbol,
      avgRating: tutors.avgRating(tutor), avgProfessionalism: tutors.avgProfessionalism(tutor), ratingCount: tutor.ratingCount,
      lessonsCompletedCount: tutor.lessonsCompletedCount,
      orientationCompleted: tutor.orientationCompleted,
    },
    reviews: assignments.listReviewsForTutor(tutor.id),
  });
});

// Scored shortlist a student picks preferences from before submitting a
// request - always at least the top matches available, capped at 6.
app.get('/api/tutor-requests/candidates', requireAuthApi, async (req, res) => {
  const { category, genre, ageGroup, level, city, online } = req.query;
  if (!category) return res.status(400).json({ success: false, error: 'Choose a subject.' });
  const isOnline = online === 'true';
  // Geocoding returns {lat,lng,city,state,country} in one shape, so the
  // same resolved object serves as both the in-person distance anchor and
  // the online locality-tier anchor (same city/region/country).
  const studentGeo = city ? await geocodeAddress(city) : null;

  const candidates = assignments.generateCandidates({
    category, genre: genre || null, ageGroup: ageGroup || null, level: level || null,
    studentCoords: studentGeo, studentLocality: studentGeo, online: isOnline,
  });

  res.json({
    success: true,
    candidates: candidates.map((c) => ({
      id: c.tutor.id, name: c.tutor.name, bio: c.tutor.bio, city: c.tutor.city,
      teachesOnline: c.tutor.teachesOnline, experienceYears: c.tutor.experienceYears, inPersonVenue: c.tutor.inPersonVenue,
      hourlyRateUsd: c.tutor.hourlyRateUsd, avgRating: tutors.avgRating(c.tutor), avgProfessionalism: tutors.avgProfessionalism(c.tutor),
      distanceKm: c.distanceKm != null ? Math.round(c.distanceKm * 10) / 10 : null,
      localityMatch: isOnline ? (c.localityScore >= 1 ? 'same city' : c.localityScore >= 0.66 ? 'same region' : c.localityScore >= 0.33 ? 'same country' : null) : null,
    })),
  });
});

app.post('/api/tutor-requests', requireAuthApi, async (req, res) => {
  const { category, genre, ageGroup, desiredLevel, city, online, phone, notes, preferredTutorIds } = req.body || {};
  if (!category) return res.status(400).json({ success: false, error: 'Choose a subject.' });
  if (!city && !online) return res.status(400).json({ success: false, error: 'Provide your city or choose online.' });

  const user = currentUser(req);
  const isOnline = Boolean(online);
  const studentGeo = city ? await geocodeAddress(city) : null;
  const candidates = assignments.generateCandidates({
    category, genre, ageGroup, level: desiredLevel, studentCoords: studentGeo, studentLocality: studentGeo, online: isOnline,
  });

  const request = assignments.createRequest({
    studentId: user.id, studentName: user.name, studentEmail: user.email,
    category, genre, ageGroup, desiredLevel, city, online, phone, notes,
    preferredTutorIds, candidateIds: candidates.map((c) => c.tutor.id),
  });

  // Excludes the requester themselves, in case an admin account submits a
  // tutor request - they shouldn't get an admin alert about their own request.
  store.listUsers()
    .filter((u) => u.role === 'admin' && u.id !== user.id)
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

// --- LESSON SESSIONS + TWO-WAY RATINGS ---
app.get('/api/curriculum/:category', requireApprovedTutorApi, (req, res) => {
  if (!req.tutorProfile.categories.includes(req.params.category)) {
    return res.status(403).json({ success: false, error: 'Not one of your approved subjects.' });
  }
  res.json({ success: true, content: curriculum.getForCategory(req.params.category) });
});

app.get('/api/reels', requireAuthApi, (req, res) => {
  const { category, genre } = req.query;
  res.json({ success: true, reels: reels.listActive({ category: category || null, genre: genre || null }) });
});

app.post('/api/assignments/:id/sessions', requireApprovedTutorApi, (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  if (record.status !== 'active') return res.status(400).json({ success: false, error: 'This assignment is not active.' });

  const { teacherNotes, assignmentText, reelIds } = req.body || {};
  const curriculumContent = curriculum.getForCategory(record.category);
  const resolvedReels = (Array.isArray(reelIds) ? reelIds : []).map((id) => reels.findById(id)).filter(Boolean);
  const session = assignments.addSession(record.id, {
    curriculumTitle: curriculumContent ? curriculumContent.title : null,
    teacherNotes, assignmentText, reels: resolvedReels,
  });
  tutors.incrementLessonsCompleted(req.tutorProfile.id);
  store.addNotification(record.studentId, { type: 'lesson', message: `${req.tutorProfile.name} logged a completed lesson for ${record.category}. Rate it from your dashboard!` });
  res.json({ success: true, session });
});

// Tutor sets/updates their own externally-created meeting link (Zoom,
// Google Meet, etc.) for an online assignment - shown to the student too.
app.post('/api/assignments/:id/meeting-link', requireApprovedTutorApi, (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  const { meetingLink } = req.body || {};
  if (meetingLink && !/^https?:\/\//i.test(meetingLink)) {
    return res.status(400).json({ success: false, error: 'Link must start with http:// or https://' });
  }
  const updated = assignments.setMeetingLink(record.id, meetingLink);
  store.addNotification(record.studentId, { type: 'tutor', message: `${req.tutorProfile.name} shared a meeting link for your ${record.category} lesson.` });
  res.json({ success: true, request: updated });
});

app.post('/api/assignments/:id/sessions/:sessionId/rate', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const record = assignments.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'Assignment not found.' });

  const tutorProfile = tutors.findByUserId(user.id);
  const isStudent = record.studentId === user.id;
  const isTutor = tutorProfile && record.tutorId === tutorProfile.id;
  if (!isStudent && !isTutor) return res.status(403).json({ success: false, error: 'Not your assignment.' });

  const { score, professionalism, comment } = req.body || {};
  if (!score || Number(score) < 1 || Number(score) > 5) {
    return res.status(400).json({ success: false, error: 'Score must be 1-5.' });
  }

  const role = isStudent ? 'student' : 'tutor';
  const session = assignments.rateSession(record.id, req.params.sessionId, role, { score, professionalism, comment });
  if (!session) return res.status(404).json({ success: false, error: 'Session not found.' });

  if (role === 'student') tutors.addRating(record.tutorId, { score, professionalism });
  else store.addStudentRating(record.studentId, { score, professionalism });

  res.json({ success: true, session });
});

// A tutor's first-lesson evaluation is the final word on a student's level,
// overriding their online placement-quiz suggestion.
app.post('/api/assignments/:id/placement', requireApprovedTutorApi, (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  const { level } = req.body || {};
  if (!taxonomy.LEVELS.includes(level)) return res.status(400).json({ success: false, error: 'Invalid level.' });
  store.finalizePlacement(record.studentId, record.category, level, req.tutorProfile.id);
  res.json({ success: true });
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

app.post('/api/admin/tutors/:id/expel', requireAdminApi, (req, res) => {
  const updated = tutors.expel(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Tutor not found.' });
  assignments.listForTutor(updated.id).filter((r) => r.status === 'active').forEach((r) => assignments.endAssignment(r.id));
  store.addNotification(updated.userId, { type: 'tutor', message: 'Your tutor account has been discontinued.' });
  res.json({ success: true, tutor: updated });
});

app.post('/api/admin/tutors/:id/clear-flag', requireAdminApi, (req, res) => {
  const updated = tutors.clearFlag(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Tutor not found.' });
  res.json({ success: true, tutor: updated });
});

app.post('/api/admin/users/:id/clear-flag', requireAdminApi, (req, res) => {
  const updated = store.clearStudentFlag(Number(req.params.id));
  if (!updated) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true });
});

// A single feed of every lesson logged platform-wide, newest first - lets
// admin monitor all tutor/student activity in one place rather than having
// to open each assignment individually.
app.get('/api/admin/activity', requireAdminApi, (req, res) => {
  const sessions = assignments.listAll().flatMap((r) => (r.sessions || []).map((s) => ({
    ...s,
    requestId: r.id,
    category: r.category,
    tutorName: r.tutorName,
    studentName: r.studentName,
  })));
  sessions.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  res.json({ success: true, sessions });
});

// Real numbers only - every figure here comes from data already recorded
// elsewhere (payments log, course catalog, tutor/assignment records), never
// a placeholder or estimate.
app.get('/api/admin/analytics', requireAdminApi, (req, res) => {
  const allPayments = payments.listAll();
  const totalRevenueUsd = allPayments.reduce((sum, p) => sum + p.priceUsd, 0);

  const DAYS = 30;
  const dayBuckets = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayBuckets.push(d.toISOString().slice(0, 10));
  }
  const revenueByDay = dayBuckets.map((date) => ({
    date,
    amountUsd: allPayments.filter((p) => p.createdAt.slice(0, 10) === date).reduce((sum, p) => sum + p.priceUsd, 0),
  }));
  const revenue30dUsd = revenueByDay.reduce((sum, d) => sum + d.amountUsd, 0);

  const courseCounts = {};
  allPayments.forEach((p) => {
    if (!courseCounts[p.courseId]) courseCounts[p.courseId] = { courseId: p.courseId, title: p.courseTitle, enrollments: 0 };
    courseCounts[p.courseId].enrollments += 1;
  });
  const topCourses = Object.values(courseCounts).sort((a, b) => b.enrollments - a.enrollments).slice(0, 5);

  const tutorLeaderboard = tutors.listAll()
    .filter((t) => t.ratingCount > 0)
    .map((t) => ({ id: t.id, name: t.name, avgRating: tutors.avgRating(t), ratingCount: t.ratingCount, lessonsCompletedCount: t.lessonsCompletedCount || 0 }))
    .sort((a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount)
    .slice(0, 5);

  const lessonsLogged = assignments.listAll().reduce((sum, r) => sum + (r.sessions || []).length, 0);

  res.json({
    success: true,
    stats: {
      totalRevenueUsd,
      revenue30dUsd,
      totalUsers: store.listUsers().length,
      activeTutors: tutors.listApproved().length,
      lessonsLogged,
    },
    revenueByDay,
    topCourses,
    tutorLeaderboard,
  });
});

app.get('/api/admin/flagged', requireAdminApi, (req, res) => {
  const flaggedTutors = tutors.listAll().filter((t) => t.flagged && !t.expelled);
  const flaggedStudents = store.listUsers().filter((u) => u.rating && u.rating.flagged);
  res.json({
    success: true,
    tutors: flaggedTutors,
    students: flaggedStudents.map((u) => ({ id: u.id, name: u.name, email: u.email, rating: u.rating })),
  });
});

app.get('/api/admin/tutor-requests', requireAdminApi, (req, res) => {
  res.json({ success: true, requests: assignments.listAll() });
});

app.post('/api/admin/tutor-requests/:id/assign', requireAdminApi, async (req, res) => {
  const { tutorId } = req.body || {};
  const tutor = tutors.findById(tutorId);
  if (!tutor || tutor.status !== 'approved') {
    return res.status(400).json({ success: false, error: 'Choose an approved tutor.' });
  }
  const record = assignments.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'Request not found.' });

  let distKm = null;
  if (!record.online && record.city && tutor.lat != null && tutor.lng != null) {
    const studentCoords = await geocodeAddress(record.city);
    distKm = distanceKm(studentCoords, { lat: tutor.lat, lng: tutor.lng });
  }

  const updated = assignments.assignTutor(req.params.id, tutor, distKm);
  if (!updated) return res.status(404).json({ success: false, error: 'Request not found.' });
  if (tutor.orientationBonusPending) tutors.clearOrientationBonus(tutor.id);

  store.addNotification(updated.studentId, { type: 'tutor', message: `You've been matched with ${tutor.name} for ${updated.category}. Check your email/contact details.` });
  store.addNotification(tutor.userId, { type: 'tutor', message: `You've been matched with a new student (${updated.studentName}) for ${updated.category}.` });
  res.json({ success: true, request: updated });
});

app.post('/api/admin/tutor-requests/:id/end', requireAdminApi, (req, res) => {
  const record = assignments.endAssignment(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'Request not found.' });
  res.json({ success: true, request: record });
});

// --- ADMIN: EDUCATIONAL CONTENT (evaluations, orientation, curriculum, reels) ---
app.get('/api/admin/assessments/:kind/:category', requireAdminApi, (req, res) => {
  const { kind, category } = req.params;
  if (!['teacher-eval', 'placement'].includes(kind)) return res.status(400).json({ success: false, error: 'Invalid kind.' });
  res.json({ success: true, questions: assessments.getQuestionsForAdmin(kind, category) });
});

app.post('/api/admin/assessments/:kind/:category', requireAdminApi, (req, res) => {
  const { kind, category } = req.params;
  if (!['teacher-eval', 'placement'].includes(kind)) return res.status(400).json({ success: false, error: 'Invalid kind.' });
  const { questions } = req.body || {};
  if (!Array.isArray(questions)) return res.status(400).json({ success: false, error: 'Questions must be an array.' });
  const saved = assessments.setQuestions(kind, category, questions);
  res.json({ success: true, questions: saved });
});

app.get('/api/admin/orientation', requireAdminApi, (req, res) => {
  res.json({
    success: true,
    content: curriculum.getForCategory(curriculum.ORIENTATION_KEY),
    questions: assessments.getQuestionsForAdmin('orientation', null),
  });
});

app.post('/api/admin/orientation', requireAdminApi, (req, res) => {
  const { title, notes, videoUrl, rewardType, questions } = req.body || {};
  const content = curriculum.setForCategory(curriculum.ORIENTATION_KEY, { title, notes, videoUrl, rewardType });
  const saved = Array.isArray(questions) ? assessments.setQuestions('orientation', null, questions) : assessments.getQuestionsForAdmin('orientation', null);
  res.json({ success: true, content, questions: saved });
});

app.get('/api/admin/curriculum/:category', requireAdminApi, (req, res) => {
  res.json({ success: true, content: curriculum.getForCategory(req.params.category) });
});

app.post('/api/admin/curriculum/:category', requireAdminApi, (req, res) => {
  const { title, notes, videoUrl } = req.body || {};
  const content = curriculum.setForCategory(req.params.category, { title, notes, videoUrl });
  res.json({ success: true, content });
});

app.get('/api/admin/reels', requireAdminApi, (req, res) => {
  res.json({ success: true, reels: reels.listAll() });
});

app.post('/api/admin/reels', requireAdminApi, (req, res) => {
  const { title, url, category, genre } = req.body || {};
  if (!title || !url) return res.status(400).json({ success: false, error: 'Title and link are required.' });
  const user = currentUser(req);
  const reel = reels.create({ title, url, category, genre, addedBy: user.id });
  res.json({ success: true, reel });
});

app.post('/api/admin/reels/:id', requireAdminApi, (req, res) => {
  const { title, url, category, genre } = req.body || {};
  const reel = reels.update(req.params.id, { title, url, category, genre });
  if (!reel) return res.status(404).json({ success: false, error: 'Reel not found.' });
  res.json({ success: true, reel });
});

app.post('/api/admin/reels/:id/status', requireAdminApi, (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'broken'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status.' });
  const reel = reels.setStatus(req.params.id, status);
  if (!reel) return res.status(404).json({ success: false, error: 'Reel not found.' });
  res.json({ success: true, reel });
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
  const httpServer = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  // Without this, a stray EADDRINUSE (e.g. the previous process hasn't
  // released the port yet during a nodemon restart) is an unhandled
  // 'error' event, which crashes the whole process instead of just failing
  // to bind - this logs it clearly and exits on our own terms.
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use - is another instance of the server already running?`);
    } else {
      console.error('Server failed to start:', err);
    }
    process.exit(1);
  });
}).catch((err) => {
  console.error('Failed to seed initial accounts, server did not start:', err);
  process.exit(1);
});
