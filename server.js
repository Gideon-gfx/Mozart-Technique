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
const geo = require('./data/geo');
const currency = require('./data/currency');
const tutors = require('./data/tutors');
const assignments = require('./data/assignments');
const taxonomy = require('./data/taxonomy');
const assessments = require('./data/assessments');
const curriculum = require('./data/curriculum');
const reels = require('./data/reels');
const certificates = require('./data/certificates');
const payments = require('./data/payments');
const payouts = require('./data/payouts');
const chat = require('./data/chat');
const supportChat = require('./data/support-chat');
const orientation = require('./data/orientation');
const orgChat = require('./data/org-chat');
const allowedLocations = require('./data/allowed-locations');
const organizations = require('./data/organizations');
const mailer = require('./data/mailer');
const stripeClient = require('./data/stripe-client');
const realtime = require('./data/realtime');
const mongoPersistence = require('./data/mongo-persistence');
const googleCalendar = require('./data/google-calendar');
const { geocodeAddress, reverseGeocode, distanceKm } = require('./data/geocode');

const MOZART_AI_PROMPT = `You are Mozart AI, a friendly guide for Mozart Techniques. You may answer only about Mozart Techniques features and how to use them, or music learning, instruments, practice and theory. For all other topics, politely say you can help with Mozart Techniques or music only. Never invent site features, payment status, policies or account information. Never ask for passwords, bank details, card details or private keys. Be kind with complaints and suggest the “Talk to a person” option for account-specific issues, disputes or payments.`;

async function askMozartAi(messages) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'qwen3.8', stream: false, messages: [{ role: 'system', content: MOZART_AI_PROMPT }, ...messages] }),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const payload = await response.json();
  const answer = String(payload?.message?.content || '').trim();
  if (!answer) throw new Error('Ollama returned an empty reply');
  return answer.slice(0, 2500);
}

const app = express();
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set - using an insecure development default. Set it in a .env file for production.');
}

// The web client ID is what the browser sign-in button uses. Native apps
// get their own client IDs from Google (an Android app can't use the web
// one), but they authenticate against this same backend - so token
// verification has to accept any of our client IDs as a valid audience,
// while the login page itself only ever advertises the web one.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
if (!GOOGLE_CLIENT_ID) {
  console.warn('GOOGLE_CLIENT_ID is not set - Google sign-in will stay disabled on the login page.');
}
const GOOGLE_AUDIENCES = [
  GOOGLE_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
].filter(Boolean);
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

// Redirect removed placement-quiz routes to the dashboard so user-facing
// direct access no longer exposes the legacy quiz flow.
app.use((req, res, next) => {
  if (req.path.toLowerCase() === '/placement-quiz' || req.path.toLowerCase() === '/placement-quiz.html') {
    return res.redirect('/dashboard');
  }
  next();
});

// Used for post-recorded online classes, physical/studio lesson recordings,
// and video-library clips - all the same "upload a video file" shape.
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

// Chat attachments: documents, images, video clips, camera captures and
// voice notes all land here. Deliberately permissive on type (it's a file
// people send each other) but hard-blocks the handful of extensions a
// browser or OS might execute if someone opened one, since these are served
// back from our own origin.
const CHAT_UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads', 'chat');
fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

const BLOCKED_UPLOAD_EXT = new Set([
  '.html', '.htm', '.svg', '.xhtml', // render as markup on our origin
  '.js', '.mjs', '.php', '.jsp', '.asp', '.aspx',
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.sh',
]);

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CHAT_UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (BLOCKED_UPLOAD_EXT.has(path.extname(file.originalname).toLowerCase())) {
      return cb(new Error('That file type is not allowed.'));
    }
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

const PHOTO_UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads', 'photos');
fs.mkdirSync(PHOTO_UPLOAD_DIR, { recursive: true });

// Tutor profile photos - shown on tutor cards/profiles across the site.
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PHOTO_UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Please upload an image file.'));
    cb(null, true);
  },
});

// dashboard/admin/etc. must only be reachable through the gated routes
// below (which check auth/role), never by raw filename. Path is lowercased
// since Windows/macOS filesystems are case-insensitive - express.static
// would otherwise serve "/Dashboard.html" even though this list only
// spells the lowercase form.
const GATED_HTML_FILES = [
  '/dashboard.html', '/admin.html', '/become-tutor.html', '/become-sponsor.html',
  '/orientation.html', '/tutor-evaluation.html',
  '/chat.html', '/library.html', '/messages.html',
];
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

function requireTutorProfilePage(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  const profile = tutors.findByUserId(user.id);
  if (!profile) {
    return res.redirect('/become-tutor');
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

// Approved tutors can manage content, but only for subjects they're
// approved to teach.
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

function publicUser(user) {
  const tutorProfile = tutors.findByUserId(user.id);
  const org = organizations.findByUserId(user.id);
  const hasSponsorOrg = Boolean(org && org.status === 'approved');
  const hasSponsorAccess = Boolean(user.sponsor || hasSponsorOrg);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    supportAgent: Boolean(user.supportAgent || user.role === 'support_agent'),
    countryCode: user.countryCode || null,
    photoUrl: user.photoUrl || (tutorProfile && tutorProfile.photoUrl) || null,
    hasTutorProfile: Boolean(tutorProfile),
    tutorProfileId: tutorProfile ? tutorProfile.id : null,
    tutorStatus: tutorProfile ? tutorProfile.status : null,
    sponsor: user.sponsor || null,
    hasSponsorOrg,
    hasSponsorAccess,
  };
}

// Notifies every admin of a new tutor/org/student request - both in-app
// (the bell icon) and by real email, so an admin can see it land in their
// inbox before they even open the admin panel. excludeUserId keeps an
// admin from getting an alert about their own submission (e.g. an admin
// account applying to tutor).
function notifyAdmins({ type, message, subject, excludeUserId }) {
  store.listUsers()
    .filter((u) => u.role === 'admin' && u.id !== excludeUserId)
    .forEach((admin) => {
      store.addNotification(admin.id, { type, message });
      mailer.sendMail({ to: admin.email, subject: subject || 'Mozart Techniques - New request', text: message });
    });
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

// A GPS-verified location (see /api/geo/set-location below) always wins
// over IP/profile-based resolution when present - it's the same
// reverse-geocoding source as a tutor's own location, so comparing names
// directly is more reliable than round-tripping through an ISO code. Stored
// on the session, not the account, so it works for anonymous visitors too.
async function getGeoInfo(req) {
  if (req.session && req.session.gpsCountry) {
    const name = req.session.gpsCountry;
    const code = geo.countryCodeForName(name) || await resolveCountryCode(req);
    const info = geo.getCountryInfo(code);
    return { countryCode: code, name, currency: info.currency, symbol: info.symbol };
  }
  const countryCode = await resolveCountryCode(req);
  const info = geo.getCountryInfo(countryCode);
  return { countryCode, name: info.name, currency: info.currency, symbol: info.symbol };
}

// Location bridge: a visitor only sees tutors located in their own country.
// Tutor country comes from the geocoded address they applied with
// (locality.country - a full name, e.g. "Nigeria"); the viewer's country
// comes from the same IP/profile resolution already used for currency. A
// tutor with no geocoded country (legacy/incomplete data) is never hidden -
// there's nothing to compare against, so excluding them would just be a
// silent data-gap bug, not a real boundary.
function sameCountry(a, b) {
  return Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}
function inViewerCountry(tutor, viewerCountryName) {
  const tutorCountry = tutor.locality && tutor.locality.country;
  return sameCountry(tutorCountry, viewerCountryName);
}

function notifySupportAgents({ message, subject, excludeUserId, href = '/support-agent' }) {
  store.listUsers()
    .filter((u) => (u.supportAgent || u.role === 'support_agent') && u.id !== excludeUserId)
    .forEach((agent) => {
      store.addNotification(agent.id, { type: 'support_request', message, href });
      mailer.sendMail({ to: agent.email, subject: subject || 'Mozart Techniques - New live support request', text: message });
    });
}

function isSupportAgent(user) {
  return Boolean(user && (user.supportAgent || user.role === 'support_agent' || user.role === 'admin'));
}
function requireSupportAgentPage(req, res, next) {
  if (!isSupportAgent(currentUser(req))) return res.redirect('/dashboard');
  next();
}
function requireSupportAgentApi(req, res, next) {
  if (!isSupportAgent(currentUser(req))) return res.status(403).json({ success: false, error: 'Support-agent access required.' });
  next();
}

function isPrimaryAdmin(user) {
  return Boolean(user && user.role === 'admin' && !user.adminCountryCode);
}

function countryForUser(user) {
  return user && (user.countryCode || (user.studentProfile && user.studentProfile.locality && user.studentProfile.locality.countryCode)) || null;
}

function canManageUser(admin, user) {
  return isPrimaryAdmin(admin) || Boolean(admin && admin.adminCountryCode && admin.adminCountryCode === countryForUser(user));
}

function requirePrimaryAdminApi(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'You must be signed in.' });
  if (!isPrimaryAdmin(user)) return res.status(403).json({ success: false, error: 'Only the platform administrator can manage country administrators.' });
  next();
}

// --- PAGE ROUTES ---
app.get(['/', '/home'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'home.html'));
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

app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'privacy-policy.html'));
});

app.get('/terms-of-service', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'terms-of-service.html'));
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
  const user = currentUser(req);
  if (user && user.role !== 'admin') {
    const org = organizations.findByUserId(user.id);
    if (org && org.status === 'approved') {
      return res.redirect('/ngo-dashboard');
    }
  }
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get(/^\/dashboard(\/.*)?$/, requireAuthPage, (req, res) => {
  const user = currentUser(req);
  if (user && user.role !== 'admin') {
    const org = organizations.findByUserId(user.id);
    if (org && org.status === 'approved') {
      return res.redirect('/ngo-dashboard');
    }
  }
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get('/ngo-dashboard', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'ngo-dashboard.html'));
});

app.get('/edit-profile', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'edit-profile.html'));
});

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.get('/become-tutor', requireAuthPage, (req, res) => {
  const user = currentUser(req);
  if (user && tutors.findByUserId(user.id)) {
    return res.redirect('/tutor');
  }
  res.sendFile(path.join(PUBLIC_DIR, 'become-tutor.html'));
});

app.get('/tutor', requireTutorProfilePage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'tutor.html'));
});

// Public per-tutor page by slug (e.g. /tutor/jane-doe) and nested profile routes
app.get('/tutor/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'tutor.html'));
});

app.get(/^\/tutor\/[a-zA-Z0-9_-]+(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'tutor.html'));
});

app.get('/become-sponsor', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'become-sponsor.html'));
});

// Publicly browsable - no login required, so anyone can see the roster of
// approved tutors before creating an account. Login is only required at the
// point of actually submitting a request to a tutor.
app.get('/find-tutor', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'find-tutor.html'));
});

app.get('/orientation', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  res.sendFile(path.join(PUBLIC_DIR, 'orientation-hub.html'));
});

app.get('/tutor-evaluation', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  if (!tutors.findByUserId(user.id)) return res.redirect('/become-tutor');
  res.sendFile(path.join(PUBLIC_DIR, 'tutor-evaluation.html'));
});

// Public certificate verification - no login required, so a certificate
// can be checked by anyone who has the link/code. Legacy feature (see
// data/certificates.js) but still real and still verifiable.
app.get('/certificate/:code', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'certificate.html'));
});

// Public tutor profile - no login required to browse. Requesting the tutor
// still requires an account.
app.get('/tutors/:id', (req, res) => {
  const tutor = tutors.findById(req.params.id);
  if (!tutor || tutor.status !== 'approved' || tutor.expelled) return res.redirect('/find-tutor');
  // Serve the unified tutor page (same as the dashboard) but client-side
  // will render it read-only for public viewers. This lets /tutors/:id and
  // /tutor/:slug share the same layout and styling.
  res.sendFile(path.join(PUBLIC_DIR, 'tutor.html'));
});

app.get(/^\/tutors\/[0-9]+(\/.*)?$/, (req, res) => {
  const match = req.path.match(/^\/tutors\/([0-9]+)(?:\/.*)?$/);
  const id = match && match[1];
  const tutor = tutors.findById(id);
  if (!tutor || tutor.status !== 'approved' || tutor.expelled) return res.redirect('/find-tutor');
  res.sendFile(path.join(PUBLIC_DIR, 'tutor.html'));
});

// Public per-student page by slug (e.g. /student/john-doe)
app.get('/student/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'student.html'));
});

// The conversation list - everyone you're matched with, like opening a
// messaging app before picking a thread.
app.get('/messages', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'messages.html'));
});

// Chat only opens for the two participants on the assignment.
function serveChatPage(req, res) {
  const user = currentUser(req);
  const record = assignments.findById(req.params.id);
  if (!record) return res.redirect('/messages');
  const tutorProfile = tutors.findByUserId(user.id);
  const isParticipant = record.studentId === user.id || (tutorProfile && record.tutorId === tutorProfile.id);
  if (!isParticipant) return res.redirect('/messages');
  res.sendFile(path.join(PUBLIC_DIR, 'chat.html'));
}

app.get('/messages/chat/:id', requireAuthPage, serveChatPage);
// Kept so older links (notifications, emails already sent) still work.
app.get('/chat/:id', requireAuthPage, serveChatPage);

app.get('/support-agent', requireAuthPage, requireSupportAgentPage, (req, res) => {
  const page = fs.readFileSync(path.join(PUBLIC_DIR, 'support-agent.html'), 'utf8')
    .replace('</body>', '<script src="/assets/attachment-render.js"></script></body>');
  res.type('html').send(page);
});

app.get('/library', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'library.html'));
});
app.get('/schedule', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'schedule.html'));
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

  store.addNotification(user.id, { type: 'welcome', message: `Welcome to Mozart Techniques, ${user.name}!` });

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
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_AUDIENCES });
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

// --- MOZART AI / HUMAN SUPPORT ---
app.get('/api/mozart-ai/thread', requireAuthApi, (req, res) => {
  res.json({ success: true, thread: supportChat.getOrCreate(currentUser(req)) });
});

app.post('/api/mozart-ai/message', requireAuthApi, async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1600);
  if (!text) return res.status(400).json({ success: false, error: 'Please enter a message.' });
  const thread = supportChat.getOrCreate(currentUser(req));
  const needsAgentNotification = !['waiting_for_agent', 'assigned'].includes(thread.status);
  const added = supportChat.addMessage(thread.id, { sender: 'user', text });
  const escalated = added.thread.status === 'waiting_for_agent' || added.thread.status === 'assigned'
    ? added.thread : supportChat.escalate(thread.id);
  if (needsAgentNotification) {
    const user = currentUser(req);
    notifySupportAgents({ message: `New live support request from ${user.name || user.email}.`, subject: 'Mozart Techniques - New live support request', excludeUserId: user.id, href: '/support-agent' });
  }
  res.json({ success: true, thread: escalated, reply: null });
});

app.post('/api/mozart-ai/attachment', requireAuthApi, (req, res) => {
  chatUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Could not upload that file.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file first.' });
    const thread = supportChat.getOrCreate(currentUser(req));
    const attachment = { name: req.file.originalname, type: req.file.mimetype, size: req.file.size, url: `/uploads/chat/${req.file.filename}` };
    const added = supportChat.addMessage(thread.id, { sender: 'user', text: `Attachment: ${req.file.originalname}`, attachment });
    res.json({ success: true, thread: added.thread, message: added.message });
  });
});

app.post('/api/mozart-ai/escalate', requireAuthApi, (req, res) => {
  try {
    const thread = supportChat.getOrCreate(currentUser(req));
    const escalated = supportChat.escalate(thread.id);
    const user = currentUser(req);
    try {
      notifyAdmins({ type: 'support_request', subject: 'Mozart Techniques - Support request', message: `${user.name || user.email} requested human support in Mozart AI.`, excludeUserId: user.id });
    } catch (error) {
      console.warn('Support notification could not be sent:', error.message);
    }
    res.json({ success: true, thread: escalated });
  } catch (error) {
    console.error('Support handoff failed:', error.message);
    res.status(500).json({ success: false, error: 'Unable to create the support request. Please try again.' });
  }
});

app.get('/api/admin/support-threads', requireAdminApi, (req, res) => {
  res.json({ success: true, threads: supportChat.listAll() });
});

app.post('/api/admin/support-threads/:id/message', requireAdminApi, (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1600);
  if (!text) return res.status(400).json({ success: false, error: 'Please enter a reply.' });
  const added = supportChat.addMessage(req.params.id, { sender: 'admin', adminId: currentUser(req).id, text });
  if (!added) return res.status(404).json({ success: false, error: 'Support conversation not found.' });
  store.addNotification(added.thread.userId, { type: 'support_reply', message: 'Mozart Techniques support replied to your live support request.', href: '/dashboard?open-live-support=1' });
  res.json({ success: true, thread: added.thread });
});

app.get('/api/support-agent/threads', requireSupportAgentApi, (req, res) => {
  const agent = currentUser(req);
  const threads = supportChat.listAll()
    .filter((thread) => agent.role === 'admin' || thread.status === 'waiting_for_agent' || thread.assignedAgentId === agent.id)
    .map((thread) => {
      const customer = store.findById(thread.userId);
      return { ...thread, customerRole: customer ? (customer.role || 'user') : 'user', customerSupportAgent: Boolean(customer && customer.supportAgent) };
    });
  res.json({ success: true, threads });
});
app.post('/api/support-agent/threads/:id/claim', requireSupportAgentApi, (req, res) => {
  const result = supportChat.claim(req.params.id, currentUser(req));
  if (!result) return res.status(404).json({ success: false, error: 'Support conversation not found.' });
  if (result.error) return res.status(409).json({ success: false, error: result.error });
  res.json({ success: true, thread: result.thread });
});
app.post('/api/support-agent/threads/:id/message', requireSupportAgentApi, (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1600);
  if (!text) return res.status(400).json({ success: false, error: 'Please enter a reply.' });
  const agent = currentUser(req);
  const thread = supportChat.findById(req.params.id);
  if (!thread) return res.status(404).json({ success: false, error: 'Support conversation not found.' });
  if (agent.role !== 'admin' && thread.assignedAgentId !== agent.id) return res.status(403).json({ success: false, error: 'Claim this conversation before replying.' });
  const added = supportChat.addMessage(thread.id, { sender: 'agent', adminId: agent.id, text });
  store.addNotification(added.thread.userId, { type: 'support_reply', message: 'A Mozart Techniques support agent replied to your live support request.', href: '/dashboard?open-live-support=1' });
  res.json({ success: true, thread: added.thread });
});
app.post('/api/support-agent/threads/:id/attachment', requireSupportAgentApi, (req, res) => {
  chatUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Could not upload that file.' });
    const agent = currentUser(req); const thread = supportChat.findById(req.params.id);
    if (!thread) return res.status(404).json({ success: false, error: 'Support conversation not found.' });
    if (agent.role !== 'admin' && thread.assignedAgentId !== agent.id) return res.status(403).json({ success: false, error: 'Claim this conversation before sending a file.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file first.' });
    const attachment = { name: req.file.originalname, type: req.file.mimetype, size: req.file.size, url: `/uploads/chat/${req.file.filename}` };
    const added = supportChat.addMessage(thread.id, { sender: 'agent', adminId: agent.id, text: `Attachment: ${req.file.originalname}`, attachment });
    store.addNotification(added.thread.userId, { type: 'support_reply', message: `${agent.name || 'A Mozart Techniques support agent'} sent you a file.`, href: '/dashboard?open-live-support=1' });
    res.json({ success: true, thread: added.thread, message: added.message });
  });
});
app.post('/api/support-agent/threads/:id/close', requireSupportAgentApi, (req, res) => {
  const agent = currentUser(req); const thread = supportChat.findById(req.params.id);
  if (!thread) return res.status(404).json({ success: false, error: 'Support conversation not found.' });
  if (agent.role !== 'admin' && thread.assignedAgentId !== agent.id) return res.status(403).json({ success: false, error: 'Only the assigned agent can close this conversation.' });
  res.json({ success: true, thread: supportChat.close(thread.id) });
});

// --- GEO / CURRENCY API ---
app.get('/api/geo', async (req, res) => {
  const geoInfo = await getGeoInfo(req);
  res.json({ success: true, ...geoInfo, countries: geo.listCountries() });
});

// Browser GPS -> country, stored on the session so the location bridge and
// currency work for anonymous visitors too (no account needed). This is the
// primary country signal - IP lookup can't resolve anything on localhost or
// private networks, and a VPN makes it wrong - so asking the browser
// directly on first visit is what actually pins a visitor to a country.
app.post('/api/geo/set-location', async (req, res) => {
  const { lat, lng } = req.body || {};
  if (lat == null || lng == null) return res.status(400).json({ success: false, error: 'Coordinates are required.' });

  const resolved = await reverseGeocode(lat, lng);
  if (!resolved || !resolved.country) {
    return res.status(400).json({ success: false, error: 'Could not resolve your location.' });
  }

  req.session.gpsCountry = resolved.country;
  const geoInfo = await getGeoInfo(req);
  res.json({ success: true, ...geoInfo, city: resolved.city, state: resolved.state });
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

app.post('/api/profile/name', requireAuthApi, (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'Name is required.' });
  }
  const user = currentUser(req);
  const updated = store.setName(user.id, String(name).trim());
  res.json({ success: true, user: publicUser(updated) });
});

app.post('/api/profile/photo', requireAuthApi, photoUpload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }
  const user = currentUser(req);
  const photoPath = `/uploads/photos/${req.file.filename}`;
  store.setPhoto(user.id, photoPath);
  // Tutor cards and public tutor profiles read their image from the tutor
  // profile, not the user account. Keep both records in sync when a tutor
  // changes their picture from Edit Profile.
  const tutorProfile = tutors.findByUserId(user.id);
  if (tutorProfile) tutors.setPhoto(tutorProfile.id, photoPath);
  res.json({ success: true, photoUrl: photoPath });
});

// --- STRIPE: card on file, used to authorize (hold) and later capture
// escrow payments. Mozart Techniques' own Stripe account collects every
// charge directly - there's no per-tutor Connect account, so a tutor's
// payout stays an internal balance an admin settles separately (unchanged
// from before Stripe was wired in).
app.get('/api/stripe/config', (req, res) => {
  res.json({ success: true, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null });
});

app.get('/api/payment-method', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  res.json({
    success: true,
    hasCard: Boolean(user.stripePaymentMethodId),
    brand: user.cardBrand || null,
    last4: user.cardLast4 || null,
  });
});

app.post('/api/payment-method/setup-intent', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });

  const user = currentUser(req);
  try {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await client.customers.create({ email: user.email, name: user.name });
      customerId = customer.id;
      store.setStripePaymentMethod(user.id, {
        customerId, paymentMethodId: user.stripePaymentMethodId, brand: user.cardBrand, last4: user.cardLast4,
      });
    }
    const setupIntent = await client.setupIntents.create({
      customer: customerId, usage: 'off_session', payment_method_types: ['card'],
    });
    res.json({ success: true, clientSecret: setupIntent.client_secret });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/payment-method/confirm', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });

  const { setupIntentId } = req.body || {};
  if (!setupIntentId) return res.status(400).json({ success: false, error: 'Missing setup intent.' });

  const user = currentUser(req);
  try {
    const setupIntent = await client.setupIntents.retrieve(setupIntentId);
    if (setupIntent.status !== 'succeeded' || setupIntent.customer !== user.stripeCustomerId) {
      return res.status(400).json({ success: false, error: 'Card setup was not completed.' });
    }
    const paymentMethod = await client.paymentMethods.retrieve(setupIntent.payment_method);
    const updated = store.setStripePaymentMethod(user.id, {
      customerId: user.stripeCustomerId,
      paymentMethodId: paymentMethod.id,
      brand: paymentMethod.card ? paymentMethod.card.brand : null,
      last4: paymentMethod.card ? paymentMethod.card.last4 : null,
    });
    res.json({ success: true, brand: updated.cardBrand, last4: updated.cardLast4 });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/payment-method', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const client = stripeClient.getClient();
  if (client && user.stripePaymentMethodId) {
    try { await client.paymentMethods.detach(user.stripePaymentMethodId); } catch { /* best-effort */ }
  }
  store.clearStripePaymentMethod(user.id);
  res.json({ success: true });
});

// Resolves real browser GPS coordinates to a city/state/country and saves
// it as the user's public location. Enforces the launch-city allow-list
// (Nigeria: Lagos/Port Harcourt/Abuja/Kano only; every other country is
// unrestricted) - a disallowed city still saves the real location (so nine
// out of ten "you're not in a launch city yet" cases are honest, not
// silently dropped) but the response flags it so the client can explain.
app.post('/api/profile/location', requireAuthApi, async (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ success: false, error: 'Latitude and longitude are required.' });
  }
  const resolved = await reverseGeocode(lat, lng);
  if (!resolved) {
    return res.status(502).json({ success: false, error: 'Could not resolve that location. Try again in a moment.' });
  }

  const user = currentUser(req);
  await store.setRealLocation(user.id, resolved);
  const tutorProfile = tutors.findByUserId(user.id);
  if (tutorProfile) tutors.setRealLocation(tutorProfile.id, resolved);

  const allowed = allowedLocations.isCityAllowed(resolved.country, resolved);
  res.json({
    success: true,
    location: { ...resolved, canonicalCity: allowedLocations.canonicalCity(resolved.country, resolved) },
    allowed,
    allowedCities: allowedLocations.getAllowedCities(resolved.country),
  });
});

app.get('/api/dashboard', requireAuthApi, async (req, res) => {
  const user = store.markActive(currentUser(req).id);
  const geoInfo = await getGeoInfo(req);
  const studentAssignments = assignments.listForStudent(user.id);
  const pendingTutorRequests = studentAssignments
    .filter((r) => r.status === 'pending')
    .map((r) => ({
      id: r.id,
      category: r.category,
      lessonType: r.lessonType,
      city: r.city,
      notes: r.notes,
      createdAt: r.createdAt,
      status: r.status,
      preferredTutorIds: r.preferredTutorIds || [],
    }));
  const enrolledCourses = studentAssignments
    .filter((r) => r.status === 'active' || r.status === 'pending')
    .map((r) => ({
      id: r.id,
      category: r.category,
      level: r.desiredLevel || 'Verified',
      title: `${r.category} ${r.lessonType ? `(${r.lessonType})` : ''}`.trim(),
      slug: `course-${r.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.id}`,
      status: r.status === 'active' ? 'verified' : 'pending',
      statusText: r.status === 'active' ? 'Verified' : 'Tutor request pending',
      lessonType: r.lessonType,
      tutorName: r.tutorName || null,
      tutorId: r.tutorId || null,
      requestedTutorNames: (r.preferredTutorIds || []).map((id) => tutors.findById(id)).filter(Boolean).map((t) => t.name),
    }));
  res.json({
    success: true,
    user: publicUser(user),
    geo: geoInfo,
    rating: user.rating || null,
    placements: user.placements || {},
    studentProfile: user.studentProfile || null,
    certificates: certificates.listForUser(user.id),
    streak: user.streak || { count: 0 },
    badges: store.getBadges(user),
    sponsor: user.sponsor || null,
    pendingTutorRequests,
    enrolledCourses,
  });
});

// --- CERTIFICATES (legacy - see data/certificates.js) ---
app.get('/api/my-certificates', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  res.json({ success: true, certificates: certificates.listForUser(user.id) });
});

app.get('/api/certificate/:code', (req, res) => {
  const certificate = certificates.findByCode(req.params.code);
  if (!certificate) return res.status(404).json({ success: false, error: 'Certificate not found.' });
  res.json({ success: true, certificate });
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

// Site-wide search across approved tutors - public, no login required.
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ success: true, tutors: [] });

  const geoInfo = await getGeoInfo(req);
  const matchedTutors = tutors.listApproved().filter((t) => inViewerCountry(t, geoInfo.name) && (
    t.name.toLowerCase().includes(q)
    || t.categories.some((c) => c.toLowerCase().includes(q))
    || (t.genres || []).some((g) => g.toLowerCase().includes(q))
    || (t.bio || '').toLowerCase().includes(q)
  )).slice(0, 12);

  const tutorResults = await Promise.all(matchedTutors.map(async (t) => ({
    id: t.id, name: t.name, categories: t.categories, city: t.city, teachesOnline: t.teachesOnline, photoUrl: t.photoUrl || null,
    bio: t.bio, hourlyRateUsd: t.hourlyRateUsd,
    hourlyRateLocal: Math.round((await currency.convertFromUsd(t.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
    currency: geoInfo.currency, symbol: geoInfo.symbol, avgRating: tutors.avgRating(t),
  })));

  res.json({ success: true, tutors: tutorResults });
});

// --- TUTORS: applications, browsing, and matching ---
// A tutor's approval status lives on the tutor profile, not the user's
// role, since the same account can be both a student and a tutor.
app.get('/api/categories', (req, res) => {
  res.json({ success: true, categories: taxonomy.SUBJECTS });
});

app.get('/api/taxonomy', (req, res) => {
  res.json({
    success: true,
    subjects: taxonomy.SUBJECTS,
    genres: taxonomy.GENRES,
    ageGroups: taxonomy.AGE_GROUPS,
    levels: taxonomy.LEVELS,
    lessonTypes: assignments.LESSON_TYPES,
  });
});

app.get('/api/tutors/me', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const profile = tutors.findByUserId(user.id);
  res.json({ success: true, profile });
});

app.post('/api/tutors/me/categories', requireTutorProfileApi, (req, res) => {
  const categories = Array.isArray(req.body.categories)
    ? [...new Set(req.body.categories.map((category) => String(category).trim()).filter((category) => taxonomy.SUBJECTS.includes(category)))]
    : [];
  if (!categories.length) return res.status(400).json({ success: false, error: 'Choose at least one course.' });
  const updated = tutors.setCategories(req.tutorProfile.id, categories);
  res.json({ success: true, profile: updated });
});

app.post('/api/tutors/me/hourly-rate', requireTutorProfileApi, (req, res) => {
  const hourlyRateUsd = Number(req.body && req.body.hourlyRateUsd);
  if (!Number.isFinite(hourlyRateUsd) || hourlyRateUsd <= 0) {
    return res.status(400).json({ success: false, error: 'Enter a valid hourly rate.' });
  }
  const updated = tutors.setHourlyRate(req.tutorProfile.id, hourlyRateUsd);
  res.json({ success: true, profile: updated });
});

app.get('/api/tutors/me/intake-form', requireTutorProfileApi, (req, res) => {
  res.json({ success: true, questions: req.tutorProfile.studentIntakeQuestions || [] });
});

app.post('/api/tutors/me/intake-form', requireTutorProfileApi, async (req, res) => {
  const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
  const normalized = questions
    .filter((q) => q && String(q.question || '').trim())
    .map((q) => ({
      question: String(q.question).trim(),
      placeholder: String(q.placeholder || '').trim(),
    }));
  const updated = tutors.setIntakeQuestions(req.tutorProfile.id, normalized);
  res.json({ success: true, questions: updated.studentIntakeQuestions || [] });
});

app.get('/api/tutors/:id/intake-form', requireAuthApi, async (req, res) => {
  const tutor = tutors.findById(req.params.id);
  const geoInfo = await getGeoInfo(req);
  if (!tutor || tutor.status !== 'approved' || tutor.expelled || !inViewerCountry(tutor, geoInfo.name)) {
    return res.status(404).json({ success: false, error: 'Tutor not found.' });
  }
  res.json({ success: true, questions: tutor.studentIntakeQuestions || [] });
});

// Fetch a tutor profile by slug for public pages
app.get('/api/tutors/slug/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const t = tutors.findBySlug(slug);
  const geoInfo = await getGeoInfo(req);
  if (!t || t.status !== 'approved' || t.expelled || !inViewerCountry(t, geoInfo.name)) {
    return res.status(404).json({ success: false, error: 'Tutor not found.' });
  }
  // expose a safe public shape
  const profile = {
    id: t.id, name: t.name, categories: t.categories, city: t.city, teachesOnline: t.teachesOnline,
    photoUrl: t.photoUrl || null, bio: t.bio, hourlyRateUsd: t.hourlyRateUsd, hourlyRateLocal: t.hourlyRateUsd,
  };
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

app.post('/api/uploads/photo', requireAuthApi, (req, res) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 8MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a photo to upload.' });
    res.json({ success: true, url: `/uploads/photos/${req.file.filename}` });
  });
});

// Lets an already-approved tutor add/change their photo later, since the
// application form's photo is optional and many tutors will apply first.
app.post('/api/tutors/me/photo', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const profile = tutors.findByUserId(user.id);
  if (!profile) return res.status(404).json({ success: false, error: 'No tutor profile on file.' });
  const { photoUrl } = req.body || {};
  if (!photoUrl) return res.status(400).json({ success: false, error: 'A photo URL is required.' });
  res.json({ success: true, profile: tutors.setPhoto(profile.id, photoUrl) });
});

app.post('/api/tutors/apply', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  if (tutors.findByUserId(user.id)) {
    return res.status(409).json({ success: false, error: 'You already have a tutor application on file.' });
  }

  const {
    categories, levels, genres, ageGroups, city, address, teachesOnline, phone,
    qualifications, experienceYears, bio, hourlyRateUsd, commuteRadiusKm, certificateUrl, inPersonVenue, photoUrl, agreementAccepted,
  } = req.body || {};
  if (!Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ success: false, error: 'Choose at least one subject you can teach.' });
  }
  if (!Array.isArray(genres) || !genres.length || !Array.isArray(ageGroups) || !ageGroups.length || !Array.isArray(levels) || !levels.length) {
    return res.status(400).json({ success: false, error: 'Choose at least one genre, age group, and teaching level.' });
  }
  if (!qualifications || !qualifications.trim()) {
    return res.status(400).json({ success: false, error: 'Describe your qualifications.' });
  }
  if (!city || !address || !phone || !bio || !certificateUrl || !photoUrl || experienceYears === '' || experienceYears == null || !commuteRadiusKm || !inPersonVenue) {
    return res.status(400).json({ success: false, error: 'Complete every required field, including your photo and CV/certificate upload.' });
  }
  if (agreementAccepted !== true) return res.status(400).json({ success: false, error: 'Read and accept the Tutor Agreement before applying.' });
  if (!hourlyRateUsd || Number(hourlyRateUsd) <= 0) {
    return res.status(400).json({ success: false, error: 'Set your hourly rate.' });
  }

  const profile = await tutors.apply({
    userId: user.id, name: user.name, email: user.email,
    categories, levels, genres, ageGroups, city, address, teachesOnline, phone,
    qualifications, experienceYears, bio, hourlyRateUsd, commuteRadiusKm, certificateUrl, inPersonVenue, photoUrl, agreementAccepted,
  });

  notifyAdmins({
    type: 'tutor-application',
    subject: `New tutor application - ${user.name}`,
    message: `New tutor application from ${user.name} (${user.email}) - review it in the admin panel.`,
    excludeUserId: user.id,
  });

  res.json({ success: true, profile });
});

app.get('/api/tutors/me/payouts', requireTutorProfileApi, (req, res) => {
  const user = currentUser(req);
  res.json({ success: true, payoutDetails: user.payoutDetails || null, payouts: payouts.listForTutor(req.tutorProfile.id), availableBalanceUsd: req.tutorProfile.balanceUsd || 0, pendingAmountUsd: payouts.pendingAmountForTutor(req.tutorProfile.id) });
});

function stripeConnectCountry(user) {
  const value = String((user && (user.countryCode || user.country)) || process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'NG').trim();
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return ({ nigeria: 'NG', 'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB' }[value.toLowerCase()] || process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'NG').toUpperCase();
}

function publicAppUrl(req) {
  const configured = process.env.BASE_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return 'https://mozarttechniques.com';
  return req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:3000';
}

async function refreshTutorConnectStatus(tutor) {
  const client = stripeClient.getClient();
  if (!client || !tutor || !tutor.stripeConnectAccountId) return tutor;
  const account = await client.accounts.retrieve(tutor.stripeConnectAccountId);
  return tutors.setStripeConnectAccount(tutor.id, account);
}

function stripeObjectId(value) {
  return typeof value === 'string' ? value : (value && value.id) || null;
}

// Our platform collects the class payment.  Once the student (or their
// organization) confirms it, this moves the tutor's 90% share to their own
// Stripe Express account.  `source_transaction` ties the transfer to the
// exact captured card charge, so Stripe waits for those funds to settle
// rather than using unrelated platform balance.
async function tryAutomaticTutorTransfer(record, session, paymentIntentId) {
  if (!paymentIntentId || !session || session.stripeTransferId) return null;
  const client = stripeClient.getClient();
  const tutor = tutors.findById(record.tutorId);
  if (!client || !tutor || !tutor.stripeConnectAccountId) {
    assignments.setSessionStripeTransfer(record.id, session.id, { status: 'manual_available' });
    return null;
  }

  try {
    const account = await client.accounts.retrieve(tutor.stripeConnectAccountId);
    const refreshedTutor = tutors.setStripeConnectAccount(tutor.id, account);
    if (!refreshedTutor.stripeConnectPayoutsEnabled) {
      assignments.setSessionStripeTransfer(record.id, session.id, { status: 'pending_setup' });
      return null;
    }

    const intent = await client.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    if (intent.status !== 'succeeded') {
      assignments.setSessionStripeTransfer(record.id, session.id, { status: 'failed', error: 'Payment is not captured yet.' });
      return null;
    }
    const chargeId = stripeObjectId(intent.latest_charge);
    if (!chargeId) {
      assignments.setSessionStripeTransfer(record.id, session.id, { status: 'failed', error: 'Stripe did not return the captured charge.' });
      return null;
    }

    const amount = Math.round(Number(session.tutorPayoutUsd || 0) * 100);
    if (amount <= 0) return null;
    const transfer = await client.transfers.create({
      amount,
      currency: 'usd',
      destination: refreshedTutor.stripeConnectAccountId,
      source_transaction: chargeId,
      transfer_group: `mozart_lesson_${record.id}_${session.id}`,
      metadata: {
        mozart_assignment_id: String(record.id),
        mozart_session_id: String(session.id),
        mozart_tutor_id: String(tutor.id),
      },
    }, { idempotencyKey: `mozart-transfer-${record.id}-${session.id}` });
    assignments.setSessionStripeTransfer(record.id, session.id, { transferId: transfer.id, status: 'automatic' });
    return transfer;
  } catch (err) {
    // The earnings remain in Mozart's manual wallet rather than disappearing
    // if Stripe needs more verification, a country is unsupported, or a
    // transfer is temporarily unavailable.
    assignments.setSessionStripeTransfer(record.id, session.id, { status: 'manual_available', error: err.message || 'Automatic transfer failed.' });
    return null;
  }
}

async function releaseTutorEarnings(record, session, { paymentIntentId = null, payerType = 'student', organizationId = null } = {}) {
  const payoutUsd = session.tutorPayoutUsd != null ? session.tutorPayoutUsd : session.totalUsd;
  const transfer = await tryAutomaticTutorTransfer(record, session, paymentIntentId || session.paymentIntentId);
  const tutor = tutors.findById(record.tutorId);
  if (!transfer) tutors.creditBalance(record.tutorId, payoutUsd);
  payments.record({
    studentId: record.studentId, studentName: record.studentName,
    tutorId: record.tutorId, tutorName: record.tutorName,
    category: record.category, lessonType: record.lessonType,
    priceUsd: session.totalUsd, platformFeeUsd: session.platformFeeUsd || 0, tutorPayoutUsd: payoutUsd,
    assignmentId: record.id, sessionId: session.id, payerType, organizationId,
    payoutMethod: transfer ? 'stripe_connect' : 'manual_wallet',
    stripeTransferId: transfer ? transfer.id : null,
  });
  if (tutor) {
    const message = transfer
      ? `${record.studentName}'s ${record.category} lesson payment was sent to your Stripe payout account.`
      : `${record.studentName} confirmed your ${record.category} lesson - $${payoutUsd} released to your manual withdrawal balance.`;
    store.addNotification(tutor.userId, { type: 'payment', message });
  }
  return { payoutUsd, transfer };
}

// A sponsor pays only when the learner is taught by a tutor linked to that
// same organization. A sponsored learner can still choose an outside tutor,
// but that lesson follows the normal student payment flow.
function coveredOrganizationForAssignment(record, student) {
  if (!record || !student || !student.sponsor) return null;
  const tutor = tutors.findById(record.tutorId);
  const tutorUser = tutor && store.findById(tutor.userId);
  if (!tutorUser || !tutorUser.sponsor || tutorUser.sponsor.orgId !== student.sponsor.orgId) return null;
  const org = organizations.findById(student.sponsor.orgId);
  return org && organizations.isSubscriptionActive(org) ? org : null;
}

app.get('/api/tutors/me/stripe-connect', requireApprovedTutorApi, async (req, res) => {
  try {
    const profile = await refreshTutorConnectStatus(req.tutorProfile);
    res.json({ success: true, configured: Boolean(stripeClient.getClient()), accountId: profile.stripeConnectAccountId || null, detailsSubmitted: Boolean(profile.stripeConnectDetailsSubmitted), payoutsEnabled: Boolean(profile.stripeConnectPayoutsEnabled) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Could not read Stripe payout status.' });
  }
});

app.post('/api/tutors/me/stripe-connect/onboard', requireApprovedTutorApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Stripe is not configured on this server yet.' });
  try {
    const user = currentUser(req);
    let profile = req.tutorProfile;
    if (!profile.stripeConnectAccountId) {
      const account = await client.accounts.create({ type: 'express', country: stripeConnectCountry(user), email: user.email, metadata: { mozart_role: 'tutor', mozart_tutor_id: String(profile.id), mozart_user_id: String(user.id) } });
      profile = tutors.setStripeConnectAccount(profile.id, account);
    }
    const baseUrl = publicAppUrl(req);
    const link = await client.accountLinks.create({ account: profile.stripeConnectAccountId, refresh_url: `${baseUrl}/api/tutors/me/stripe-connect/refresh`, return_url: `${baseUrl}/api/tutors/me/stripe-connect/return`, type: 'account_onboarding' });
    res.json({ success: true, url: link.url, accountId: profile.stripeConnectAccountId });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Could not start Stripe payout setup.' });
  }
});

app.get('/api/tutors/me/stripe-connect/refresh', requireApprovedTutorApi, (req, res) => res.redirect('/tutor?connect=retry'));

app.get('/api/tutors/me/stripe-connect/return', requireApprovedTutorApi, async (req, res) => {
  try {
    const before = req.tutorProfile;
    const profile = await refreshTutorConnectStatus(before);
    if (profile.stripeConnectPayoutsEnabled && !before.stripeConnectPayoutsEnabled) store.addNotification(profile.userId, { type: 'payout', message: 'Your Stripe payout account is ready. Eligible class earnings can now be paid automatically.' });
    res.redirect(`/tutor?connect=${profile.stripeConnectPayoutsEnabled ? 'ready' : 'pending'}`);
  } catch (err) { res.redirect('/tutor?connect=error'); }
});

app.post('/api/tutors/me/payout-details', requireTutorProfileApi, (req, res) => {
  const { accountName, bankName, accountNumber } = req.body || {};
  if (!accountName || !bankName || !accountNumber) return res.status(400).json({ success: false, error: 'Account name, bank name, and account number are required.' });
  store.setPayoutDetails(currentUser(req).id, { accountName: String(accountName).trim(), bankName: String(bankName).trim(), accountNumber: String(accountNumber).trim() });
  res.json({ success: true });
});

// A withdrawal is a recorded request for manual bank settlement. No money is
// sent automatically until the platform has a verified payout provider.
app.post('/api/tutors/me/withdraw', requireTutorProfileApi, (req, res) => {
  const amount = Number(req.body && req.body.amount) || 0;
  const tutor = req.tutorProfile;
  if (!tutor) return res.status(404).json({ success: false, error: 'No tutor profile.' });
  if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount.' });
  const user = currentUser(req);
  if (!user.payoutDetails) return res.status(400).json({ success: false, error: 'Add your bank payout details before requesting withdrawal.' });
  const withdrawable = Math.round(((tutor.balanceUsd || 0) - payouts.pendingAmountForTutor(tutor.id)) * 100) / 100;
  if (amount > withdrawable) return res.status(400).json({ success: false, error: `You can request up to $${withdrawable.toFixed(2)}.` });
  const payout = payouts.create({ tutorId: tutor.id, tutorUserId: user.id, tutorName: tutor.name, amountUsd: amount, payoutDetails: user.payoutDetails });
  notifyAdmins({ type: 'payout-request', subject: 'Payout request', message: `Tutor ${tutor.name} requested payout of $${amount.toFixed(2)}. Payout request #${payout.id}.` });
  store.addNotification(tutor.userId, { type: 'payout-request', message: `Requested payout of $${amount.toFixed(2)}. Admin will process it.` });
  res.json({ success: true, payout });
});

app.get('/api/admin/payouts', requireAdminApi, (req, res) => {
  const region = String(req.query.region || '').trim().toLowerCase();
  const list = payouts.listAll().filter((item) => {
    if (!region) return true;
    const tutor = tutors.findById(item.tutorId);
    return String(tutor && tutor.locality && tutor.locality.country || '').toLowerCase() === region;
  });
  res.json({ success: true, payouts: list });
});

// Admin: process a payout request and debit tutor balance
app.post('/api/admin/payouts/:tutorId/process', requireAdminApi, (req, res) => {
  const tutorId = Number(req.params.tutorId);
  const amount = Number(req.body && req.body.amount) || 0;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount.' });
  const tutor = tutors.findById(tutorId);
  if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found.' });
  if ((tutor.balanceUsd || 0) < amount) return res.status(400).json({ success: false, error: 'Insufficient balance.' });
  const updated = tutors.debitBalance(tutorId, amount);
  store.addNotification(tutor.userId, { type: 'payout-processed', message: `Your payout of $${amount.toFixed(2)} has been processed.` });
  notifyAdmins({ type: 'payout-processed', subject: 'Payout processed', message: `Processed payout of $${amount.toFixed(2)} for tutor ${tutor.name}.` });
  res.json({ success: true, tutor: updated });
});

// --- NGO / ORGANIZATION SPONSORSHIPS: an org applies, an admin approves
// the application and separately activates a 1-year subscription once
// payment is confirmed (simulated, same as the rest of this app's
// payments), then the org can generate access codes for the students it
// sponsors. A student redeems a code to link their account to the org. ---
app.post('/api/organizations/apply', requireAuthApi, certUpload.single('certificate'), async (req, res) => {
  const user = currentUser(req);
  const existing = organizations.findByUserId(user.id);
  if (existing && existing.status !== 'rejected') {
    return res.status(409).json({ success: false, error: 'You already have an organization application on file.' });
  }
  if (existing && existing.status === 'rejected') {
    organizations.removeByUserId(user.id);
  }
  const { name, contactName, email, phone, registrationNumber, address, description, sponsorType, organizationType } = req.body || {};
  if (!contactName || !contactName.trim()) return res.status(400).json({ success: false, error: 'A contact person is required.' });
  if (!email || !email.trim() || !email.includes('@')) return res.status(400).json({ success: false, error: 'A valid email is required.' });
  
  const type = sponsorType || 'individual';
  
  // For NGO/Institution type - all fields are required
  if (type === 'ngo') {
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Organization name is required for NGO/Institution type.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, error: 'Phone number is required for NGO/Institution type.' });
    }
    if (!registrationNumber || !registrationNumber.trim()) {
      return res.status(400).json({ success: false, error: 'Registration number is required for NGO/Institution type.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Certificate upload is required for NGO/Institution type.' });
    }
  }

  let certificateUrl = null;
  if (req.file) {
    certificateUrl = `/uploads/certificates/${req.file.filename}`;
  }

  const org = await organizations.apply({
    userId: user.id, 
    name: type === 'ngo' ? name.trim() : null, 
    contactName: contactName.trim(), 
    email: email.trim(),
    phone, 
    registrationNumber, 
    address, 
    description,
    sponsorType: type,
    organizationType: organizationType || 'ngo',
    certificateUrl,
  });

  const displayName = type === 'ngo' ? org.name : `${org.contactName} (Individual Sponsor)`;
  notifyAdmins({
    type: 'org-application',
    subject: `New sponsor application - ${displayName}`,
    message: `New sponsor application from ${displayName} - review it in the admin panel.`,
    excludeUserId: user.id,
  });

  res.json({ success: true, organization: org });
});

app.get('/api/organizations/me', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  res.json({ success: true, organization: org, subscriptionActive: org ? organizations.isSubscriptionActive(org) : false });
});

app.post('/api/organizations/me/generate-code', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) return res.status(404).json({ success: false, error: 'No organization application on file.' });
  if (!organizations.isSubscriptionActive(org)) {
    return res.status(403).json({ success: false, error: 'Your subscription is not active yet - an admin needs to confirm payment first.' });
  }
  const entry = organizations.generateStudentCode(org.id);
  res.json({ success: true, entry });
});

app.post('/api/redeem-code', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const { code } = req.body || {};
  if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Enter a code.' });
  const result = organizations.redeemCode(code, user.id, user.name);
  if (result.error === 'not-found') return res.status(404).json({ success: false, error: 'That code was not recognized.' });
  if (result.error === 'already-redeemed') return res.status(409).json({ success: false, error: 'That code has already been used.' });
  store.setSponsor(user.id, { orgId: result.org.id, orgName: result.org.name });
  res.json({ success: true, orgName: result.org.name });
});

app.get('/api/organizations/me', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org || org.status !== 'approved') {
    return res.status(404).json({ success: false, error: 'No approved organization found.' });
  }
  res.json({ success: true, organization: org });
});

app.post('/api/organizations/checkout', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });

  const user = currentUser(req);
  const { billingPeriod } = req.body || {}; // 'monthly' or 'yearly'
  if (!billingPeriod || !['monthly', 'yearly'].includes(billingPeriod)) {
    return res.status(400).json({ success: false, error: 'Invalid billing period.' });
  }

  const org = organizations.findByUserId(user.id);
  if (!org || org.status !== 'approved') {
    return res.status(404).json({ success: false, error: 'No approved organization found.' });
  }
  if (!org.monthlyAmount || Number(org.monthlyAmount) <= 0) return res.status(400).json({ success: false, error: 'Your subscription amount has not been set by an administrator.' });

  try {
    const isMonthly = billingPeriod === 'monthly';
    const amount = isMonthly ? org.monthlyAmount * 100 : org.monthlyAmount * 12 * 100; // Convert to cents
    const description = isMonthly 
      ? `Monthly subscription for ${org.name}`
      : `Yearly subscription for ${org.name}`;

    const session = await client.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: isMonthly ? 'subscription' : 'payment',
      line_items: [{
        price_data: {
          currency: 'ngn',
          product_data: { name: `${org.name} - ${isMonthly ? 'Monthly' : 'Yearly'} Subscription` },
          unit_amount: amount,
          ...(isMonthly && {
            recurring: { interval: 'month', interval_count: 1 }
          })
        },
        quantity: 1,
      }],
      customer_email: org.email,
      success_url: `${publicAppUrl(req)}/api/organizations/checkout/success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicAppUrl(req)}/ngo-dashboard`,
      metadata: { orgId: org.id, billingPeriod },
    });

    res.json({ success: true, sessionId: session.id, url: session.url });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/organizations/lesson-bills', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org) return res.status(404).json({ success: false, error: 'No organization found.' });
  const bills = assignments.listAll().flatMap((record) => {
    const student = store.findById(record.studentId);
    if (!student || !student.sponsor || student.sponsor.orgId !== org.id || !coveredOrganizationForAssignment(record, student)) return [];
    return (record.sessions || []).filter((session) => session.paymentStatus === 'held').map((session) => ({ assignmentId: record.id, sessionId: session.id, studentName: record.studentName, tutorName: record.tutorName, category: record.category, durationMinutes: session.durationMinutes, totalUsd: session.totalUsd }));
  });
  res.json({ success: true, bills });
});

app.post('/api/organizations/lesson-bills/:assignmentId/:sessionId/checkout', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient(); const org = organizations.findByUserId(currentUser(req).id); const record = assignments.findById(req.params.assignmentId); const lesson = record && (record.sessions || []).find((item) => item.id === Number(req.params.sessionId)); const student = record && store.findById(record.studentId);
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  if (!org || !organizations.isSubscriptionActive(org) || !student || !student.sponsor || student.sponsor.orgId !== org.id || !coveredOrganizationForAssignment(record, student) || !lesson || lesson.paymentStatus !== 'held') return res.status(404).json({ success: false, error: 'Sponsored lesson bill not found.' });
  const checkout = await client.checkout.sessions.create({ payment_method_types: ['card'], mode: 'payment', line_items: [{ price_data: { currency: 'usd', product_data: { name: `${record.category} lesson for ${record.studentName}` }, unit_amount: Math.round(lesson.totalUsd * 100) }, quantity: 1 }], customer_email: org.email, success_url: `${publicAppUrl(req)}/api/organizations/checkout/success?sessionId={CHECKOUT_SESSION_ID}`, cancel_url: `${publicAppUrl(req)}/ngo-dashboard`, metadata: { type: 'lesson-bill', orgId: String(org.id), assignmentId: String(record.id), sessionId: String(lesson.id) } });
  res.json({ success: true, url: checkout.url });
});

app.get('/api/organizations/checkout/success', async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) {
    return res.redirect('/ngo-dashboard?payment=error');
  }

  const { sessionId } = req.query;
  if (!sessionId) {
    return res.redirect('/ngo-dashboard?payment=error');
  }

  try {
    const session = await client.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.redirect('/ngo-dashboard?payment=pending');
    }

    if (session.metadata && session.metadata.type === 'lesson-bill') {
      const record = assignments.findById(session.metadata.assignmentId);
      const lesson = record && (record.sessions || []).find((item) => item.id === Number(session.metadata.sessionId));
      const org = organizations.findById(Number(session.metadata.orgId));
      const student = record && store.findById(record.studentId);
      if (!record || !lesson || lesson.paymentStatus !== 'held' || !org || !student || !student.sponsor || student.sponsor.orgId !== org.id || !coveredOrganizationForAssignment(record, student)) return res.redirect('/ngo-dashboard?payment=error');
      const released = assignments.confirmSession(record.id, lesson.id);
      if (!released) return res.redirect('/ngo-dashboard?payment=error');
      const paymentIntentId = stripeObjectId(session.payment_intent);
      await releaseTutorEarnings(record, lesson, { paymentIntentId, payerType: 'organization', organizationId: org.id });
      return res.redirect('/ngo-dashboard?payment=success');
    }

    const orgId = Number(session.metadata && session.metadata.orgId);
    const billingPeriod = session.metadata && session.metadata.billingPeriod;
    const org = organizations.findById(orgId);
    if (!org || !['monthly', 'yearly'].includes(billingPeriod)) return res.redirect('/ngo-dashboard?payment=error');
    // Activate only for the period actually paid for in Stripe Checkout.
    const updated = organizations.activateSubscription(orgId, billingPeriod === 'monthly' ? 1 : 12);
    if (!updated) {
      return res.redirect('/ngo-dashboard?payment=error');
    }

    store.addNotification(updated.userId, {
      type: 'organization',
      message: `Payment confirmed! Your subscription is active through ${new Date(updated.subscriptionEndAt).toLocaleDateString()}. You can now generate access codes.`,
    });

    res.redirect('/ngo-dashboard?payment=success');
  } catch (err) {
    res.redirect('/ngo-dashboard?payment=error');
  }
});

// --- ORGANIZATION-TO-TUTOR MESSAGING: Organizations can message tutors who teach their sponsored students ---

// Get tutors for an organization (those teaching org's students)
app.get('/api/organizations/tutors', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  // Get all students linked to this organization
  const students = organizations.getStudentsForOrganization(org.id);
  const studentIds = students.map((s) => s.studentId);

  // Find all tutors assigned to these students
  const orgTutors = new Map();
  const allAssignments = assignments.listAll();
  
  for (const assignment of allAssignments) {
    if (studentIds.includes(assignment.studentId) && assignment.tutorId) {
      const tutor = tutors.findById(assignment.tutorId);
      if (tutor && tutor.status === 'approved') {
        if (!orgTutors.has(tutor.id)) {
          orgTutors.set(tutor.id, {
            id: tutor.id,
            userId: tutor.userId,
            name: tutor.name,
            categories: tutor.categories || [],
            phone: tutor.phone || null,
            email: tutor.email || null,
            profileUrl: tutor.photo ? `/uploads/photos/${tutor.photo}` : null,
            studentCount: 0,
          });
        }
        // Increment student count for this tutor
        const tutorData = orgTutors.get(tutor.id);
        tutorData.studentCount += 1;
      }
    }
  }

  res.json({ success: true, tutors: Array.from(orgTutors.values()) });
});

// Get conversations for organization
app.get('/api/organizations/conversations', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  const conversations = orgChat.listForOrganization(org.id);
  const convWithTutors = conversations.map((conv) => {
    const tutor = tutors.findById(conv.tutorId);
    return {
      id: conv.id,
      tutorId: conv.tutorId,
      tutorName: tutor ? tutor.name : 'Unknown Tutor',
      lastMessage: conv.messages && conv.messages.length > 0 
        ? conv.messages[conv.messages.length - 1].text 
        : 'No messages yet',
      lastMessageAt: conv.messages && conv.messages.length > 0
        ? conv.messages[conv.messages.length - 1].createdAt
        : conv.createdAt,
      unreadCount: orgChat.getUnreadCount(conv.id, 'org'),
      createdAt: conv.createdAt,
    };
  });

  res.json({ success: true, conversations: convWithTutors });
});

// Get messages for a specific conversation
app.get('/api/organizations/conversations/:id/messages', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  const conversationId = req.params.id;
  const messages = orgChat.getMessages(conversationId);
  
  // Verify user has access to this conversation
  const conv = messages.length > 0 ? orgChat.getOrCreateConversation(org.id, 0) : null;
  
  res.json({ success: true, messages });
});

// Send a message from organization to tutor
app.post('/api/organizations/conversations/:tutorId/message', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, error: 'Message text is required.' });
  }

  const tutorId = Number(req.params.tutorId);
  const tutor = tutors.findById(tutorId);
  if (!tutor) {
    return res.status(404).json({ success: false, error: 'Tutor not found.' });
  }

  // Get or create conversation
  const conv = orgChat.getOrCreateConversation(org.id, tutorId);
  const message = orgChat.sendMessage(conv.id, {
    senderId: user.id,
    senderType: 'org',
    senderName: org.name || org.contactName,
    text: text.trim(),
  });

  res.json({ success: true, message });
});

// Mark conversation as read for organization
app.post('/api/organizations/conversations/:id/mark-read', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  orgChat.markRead(Number(req.params.id), 'org');
  res.json({ success: true });
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
  const { name, ageGroup, genres, city, address, sex, photoUrl, agreementAccepted } = req.body || {};
  const existing = user.studentProfile || {};
  if (!existing.agreementAcceptedAt && agreementAccepted !== true) return res.status(400).json({ success: false, error: 'Read and accept the Student Agreement before saving your profile.' });
  const updated = await store.setStudentProfile(user.id, { name, ageGroup, genres, city, address, sex, photoUrl, agreementAccepted });
  res.json({ success: true, studentProfile: updated.studentProfile });
});

// Public directory of approved tutors, filterable by subject/genre/age
// group/city/lessonType - browsing doesn't require an account, only
// requesting one does. Rates are localized so students compare tutors in
// their own currency.
app.get('/api/tutors', async (req, res) => {
  const { category, genre, ageGroup, city, lessonType } = req.query;
  let list = tutors.listApproved();
  if (category) list = list.filter((t) => t.categories.includes(category));
  if (genre) list = list.filter((t) => !t.genres || !t.genres.length || t.genres.includes(genre));
  if (ageGroup) list = list.filter((t) => !t.ageGroups || !t.ageGroups.length || t.ageGroups.includes(ageGroup));
  if (city) list = list.filter((t) => (t.city || '').toLowerCase().includes(String(city).toLowerCase()));
  if (lessonType === 'online') list = list.filter((t) => t.teachesOnline);
  if (lessonType === 'physical') list = list.filter((t) => t.inPersonVenue !== 'tutor_studio');
  if (lessonType === 'studio') list = list.filter((t) => t.inPersonVenue !== 'student_location');

  const geoInfo = await getGeoInfo(req);
  list = list.filter((t) => inViewerCountry(t, geoInfo.name));
  const localized = await Promise.all(list.map(async (t) => ({
    id: t.id, name: t.name, categories: t.categories, levels: t.levels, genres: t.genres, ageGroups: t.ageGroups,
    city: t.city, teachesOnline: t.teachesOnline, inPersonVenue: t.inPersonVenue, photoUrl: t.photoUrl || null,
    hourlyRateUsd: t.hourlyRateUsd,
    hourlyRateLocal: Math.round((await currency.convertFromUsd(t.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
    currency: geoInfo.currency, symbol: geoInfo.symbol,
    avgRating: tutors.avgRating(t),
    avgProfessionalism: tutors.avgProfessionalism(t),
    experienceYears: t.experienceYears,
    bio: t.bio,
  })));
  localized.sort((a, b) => a.hourlyRateUsd - b.hourlyRateUsd);

  res.json({ success: true, tutors: localized, viewerCountry: geoInfo.name });
});

// City-grouped tutor directory: tutors from the same town/city are
// clustered together, and within a city, ranked by qualification (approved
// level, experience, rating) so a student can compare and pick.
app.get('/api/tutors/directory', async (req, res) => {
  const geoInfo = await getGeoInfo(req);
  const list = tutors.listApproved().filter((t) => inViewerCountry(t, geoInfo.name));

  const groups = {};
  list.forEach((t) => {
    // In a restricted country (e.g. Nigeria), normalize to the launch
    // city's canonical name so tutors aren't fragmented by neighborhood/LGA
    // (Nominatim often resolves "city" that granularly) - see
    // data/allowed-locations.js. Unrestricted countries use the raw city.
    const country = t.locality && t.locality.country;
    const cityKey = (country && allowedLocations.canonicalCity(country, t.locality))
      || (t.locality && t.locality.city) || t.city || 'Online only';
    if (!groups[cityKey]) groups[cityKey] = [];
    groups[cityKey].push(t);
  });

  const qualificationScore = (t) => {
    const bestLevel = Object.values(t.approvedLevelByCategory || {})
      .reduce((max, lvl) => Math.max(max, taxonomy.LEVELS.indexOf(lvl)), -1);
    return (bestLevel + 1) * 100 + (t.experienceYears || 0) * 2 + (tutors.avgRating(t) || 0) * 10;
  };

  const cities = await Promise.all(Object.entries(groups).map(async ([city, tutorsInCity]) => {
    const sorted = tutorsInCity.slice().sort((a, b) => qualificationScore(b) - qualificationScore(a));
    const localized = await Promise.all(sorted.map(async (t) => ({
      id: t.id, name: t.name, categories: t.categories, genres: t.genres,
      teachesOnline: t.teachesOnline, inPersonVenue: t.inPersonVenue, photoUrl: t.photoUrl || null,
      experienceYears: t.experienceYears, bio: t.bio,
      approvedLevelByCategory: t.approvedLevelByCategory,
      hourlyRateUsd: t.hourlyRateUsd,
      hourlyRateLocal: Math.round((await currency.convertFromUsd(t.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
      currency: geoInfo.currency, symbol: geoInfo.symbol,
      avgRating: tutors.avgRating(t), avgProfessionalism: tutors.avgProfessionalism(t),
    })));
    return { city, tutors: localized };
  }));

  cities.sort((a, b) => b.tutors.length - a.tutors.length);
  res.json({ success: true, cities });
});

// Public profile page data - no login required, so a tutor's profile can
// be shared/linked like a real marketplace listing.
// A tutor's exact address is only revealed to a student once they've
// actually applied for in-studio lessons with that specific tutor (pending
// request or matched) - not to anonymous browsers or every signed-in
// student. Studio lessons mean the student travels to the tutor, so the
// address only matters (and should only be exposed) once that's a real
// prospect, not idle browsing.
function studentHasStudioRequestWith(studentId, tutorId) {
  return assignments.listForStudent(studentId).some((r) => (
    r.lessonType === 'studio'
    && (r.tutorId === tutorId || (r.preferredTutorIds || []).includes(tutorId))
  ));
}

app.get('/api/tutors/:id/public', async (req, res) => {
  const tutor = tutors.findById(req.params.id);
  if (!tutor || tutor.status !== 'approved' || tutor.expelled) {
    return res.status(404).json({ success: false, error: 'Tutor not found.' });
  }
  const geoInfo = await getGeoInfo(req);
  if (!inViewerCountry(tutor, geoInfo.name)) {
    return res.status(404).json({ success: false, error: 'Tutor not found.' });
  }
  const viewer = currentUser(req);
  const addressUnlocked = Boolean(viewer) && (
    viewer.role === 'admin'
    || viewer.id === tutor.userId
    || studentHasStudioRequestWith(viewer.id, tutor.id)
  );
  res.json({
    success: true,
    tutor: {
      id: tutor.id, name: tutor.name, categories: tutor.categories, genres: tutor.genres, ageGroups: tutor.ageGroups,
      levels: tutor.levels, approvedLevelByCategory: tutor.approvedLevelByCategory,
      city: tutor.city,
      fullAddress: addressUnlocked ? (tutor.fullAddress || tutor.address || null) : null,
      addressLocked: !addressUnlocked && Boolean(tutor.fullAddress || tutor.address) && tutor.inPersonVenue !== 'student_location',
      teachesOnline: tutor.teachesOnline, inPersonVenue: tutor.inPersonVenue, photoUrl: tutor.photoUrl || null,
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

// Fetch a student profile by slug for public pages
app.get('/api/students/slug/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const s = store.findBySlug(slug);
  if (!s) return res.status(404).json({ success: false, error: 'Student not found.' });
  // expose a safe public shape
  const profile = { id: s.id, name: s.name, photoUrl: s.photoUrl || null };
  res.json({ success: true, profile });
});

// Public student profile data - no login required, limited shape
app.get('/api/students/:id/public', async (req, res) => {
  const student = store.findById(Number(req.params.id));
  if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });
  const viewer = currentUser(req);
  // Only reveal more sensitive studentProfile fields to the student themself or admins
  const canSeeSensitive = viewer && (viewer.role === 'admin' || viewer.id === student.id);
  res.json({
    success: true,
    student: {
      id: student.id,
      name: student.name,
      photoUrl: student.photoUrl || null,
      studentProfile: canSeeSensitive ? (student.studentProfile || null) : {
        ageGroup: student.studentProfile ? student.studentProfile.ageGroup : null,
        city: student.studentProfile ? student.studentProfile.city : null,
      },
    },
  });
});

// Scored shortlist a student picks preferences from before submitting a
// request - always at least the top matches available, capped at 6.
app.get('/api/tutor-requests/candidates', requireAuthApi, async (req, res) => {
  const { category, genre, ageGroup, level, city, lessonType } = req.query;
  if (!category) return res.status(400).json({ success: false, error: 'Choose a subject.' });
  const type = assignments.LESSON_TYPES.includes(lessonType) ? lessonType : 'online';
  const user = currentUser(req);
  const selfTutor = tutors.findByUserId(user.id);
  const selfTutorId = selfTutor ? selfTutor.id : null;
  const geoInfo = await getGeoInfo(req);
  // Geocoding returns {lat,lng,city,state,country} in one shape, so the
  // same resolved object serves as both the in-person distance anchor and
  // the online locality-tier anchor (same city/region/country).
  const studentGeo = city ? await geocodeAddress(city) : null;

  const candidates = assignments.generateCandidates({
    category, genre: genre || null, ageGroup: ageGroup || null, level: level || null,
    studentCoords: studentGeo, studentLocality: studentGeo, lessonType: type,
  }).filter((c) => c.tutor.id !== selfTutorId && inViewerCountry(c.tutor, geoInfo.name));

  res.json({
    success: true,
    candidates: candidates.map((c) => ({
      id: c.tutor.id, name: c.tutor.name, bio: c.tutor.bio, city: c.tutor.city, photoUrl: c.tutor.photoUrl || null,
      teachesOnline: c.tutor.teachesOnline, experienceYears: c.tutor.experienceYears, inPersonVenue: c.tutor.inPersonVenue,
      hourlyRateUsd: c.tutor.hourlyRateUsd, avgRating: tutors.avgRating(c.tutor), avgProfessionalism: tutors.avgProfessionalism(c.tutor),
      distanceKm: c.distanceKm != null ? Math.round(c.distanceKm * 10) / 10 : null,
      localityMatch: type === 'online' ? (c.localityScore >= 1 ? 'same city' : c.localityScore >= 0.66 ? 'same region' : c.localityScore >= 0.33 ? 'same country' : null) : null,
    })),
  });
});

app.post('/api/tutor-requests', requireAuthApi, async (req, res) => {
  const { category, genre, ageGroup, desiredLevel, city, lessonType, phone, notes, preferredTutorIds } = req.body || {};
  if (!category) return res.status(400).json({ success: false, error: 'Choose a subject.' });
  const type = assignments.LESSON_TYPES.includes(lessonType) ? lessonType : null;
  if (!type) return res.status(400).json({ success: false, error: 'Choose online, physical, or in-studio lessons.' });
  if (type !== 'online' && !city) return res.status(400).json({ success: false, error: 'Provide your city for in-person lessons.' });

  const user = currentUser(req);
  const selfTutor = tutors.findByUserId(user.id);
  const selfTutorId = selfTutor ? selfTutor.id : null;
  const requestTutorIds = Array.isArray(preferredTutorIds) ? preferredTutorIds.map(Number) : [];
  const geoInfo = await getGeoInfo(req);
  if (selfTutorId && requestTutorIds.includes(selfTutorId)) {
    return res.status(400).json({ success: false, error: 'You cannot request yourself as a tutor.' });
  }
  if (requestTutorIds.some((id) => {
    const tutor = tutors.findById(id);
    return !tutor || !inViewerCountry(tutor, geoInfo.name);
  })) {
    return res.status(403).json({ success: false, error: 'Tutors can only be requested within your country.' });
  }

  const studentGeo = city ? await geocodeAddress(city) : null;
  const candidates = assignments.generateCandidates({
    category, genre, ageGroup, level: desiredLevel, studentCoords: studentGeo, studentLocality: studentGeo, lessonType: type,
  }).filter((c) => inViewerCountry(c.tutor, geoInfo.name));

  const request = assignments.createRequest({
    studentId: user.id, studentName: user.name, studentEmail: user.email,
    category, genre, ageGroup, desiredLevel, city, lessonType: type, phone, notes,
    preferredTutorIds: requestTutorIds, candidateIds: candidates.map((c) => c.tutor.id),
    intakeResponses: Array.isArray(req.body.intakeResponses) ? req.body.intakeResponses : [], studentCountry: geoInfo.name,
  });

  notifyAdmins({
    type: 'tutor-request',
    subject: `New tutor request - ${category}`,
    message: `New tutor request from ${user.name} for ${category} - match them in the admin panel.`,
    excludeUserId: user.id,
  });

  requestTutorIds.forEach((id) => {
    const preferredTutor = tutors.findById(id);
    if (preferredTutor && preferredTutor.status === 'approved') {
      store.addNotification(preferredTutor.userId, { type: 'tutor-request', message: `${user.name} requested you for ${category}. Open your Tutor Profile to review and accept the request.` });
    }
  });

  store.addNotification(user.id, {
    type: 'tutor-request',
    message: `Your request for ${category} has been sent to your chosen tutor. You will be notified when they accept.`,
  });

  res.json({ success: true, request });
});

app.post('/api/admin/payout-requests/:id/process', requireAdminApi, (req, res) => {
  const request = payouts.listAll().find((item) => item.id === Number(req.params.id));
  if (!request || request.status !== 'requested') return res.status(404).json({ success: false, error: 'Payout request not found.' });
  const tutor = tutors.findById(request.tutorId);
  if (!tutor || (tutor.balanceUsd || 0) < request.amountUsd) return res.status(400).json({ success: false, error: 'Insufficient tutor balance for this payout.' });
  tutors.debitBalance(tutor.id, request.amountUsd);
  const processed = payouts.process(request.id, currentUser(req).id);
  store.addNotification(request.tutorUserId, { type: 'payout-processed', message: `Your withdrawal of $${request.amountUsd.toFixed(2)} has been marked as processed.` });
  res.json({ success: true, payout: processed });
});

app.get('/api/tutors/me/pending-requests', requireApprovedTutorApi, (req, res) => {
  const requests = assignments.listAll()
    .filter((record) => record.status === 'pending' && (record.preferredTutorIds || []).includes(req.tutorProfile.id))
    .map((record) => {
      const student = store.findById(record.studentId);
      const profile = student && student.studentProfile || {};
      return { ...record, studentPhotoUrl: student ? student.photoUrl || null : null, studentAgeGroup: profile.ageGroup || null, studentCity: profile.city || record.city || null, studentBio: profile.bio || null };
    });
  res.json({ success: true, requests });
});

app.post('/api/tutors/me/pending-requests/:id/accept', requireApprovedTutorApi, (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.status !== 'pending' || !(record.preferredTutorIds || []).includes(req.tutorProfile.id)) {
    return res.status(404).json({ success: false, error: 'Student request not found.' });
  }
  const updated = assignments.assignTutor(record.id, req.tutorProfile, null);
  store.addNotification(updated.studentId, { type: 'tutor', message: `${req.tutorProfile.name} accepted your ${updated.category} tutor request. Your dashboard is ready.` });
  res.json({ success: true, request: updated });
});

app.get('/api/my-assignments', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  // For studio lessons (student travels to the tutor), the student needs
  // the tutor's exact address once actually matched.
  const asStudent = assignments.listForStudent(user.id).map((r) => {
    const tutorProfile = r.tutorId ? tutors.findById(r.tutorId) : null;
    const withTutorPhoto = { ...(tutorProfile ? { ...r, tutorPhotoUrl: tutorProfile.photoUrl || null } : r), sponsoredBy: user.sponsor || null };
    if (r.lessonType !== 'studio' || r.status !== 'active' || !r.tutorId) return withTutorPhoto;
    const tutorAddress = tutorProfile ? (tutorProfile.fullAddress || tutorProfile.address) : null;
    return tutorAddress ? { ...withTutorPhoto, tutorFullAddress: tutorAddress } : withTutorPhoto;
  });
  const tutorProfile = tutors.findByUserId(user.id);
  // For physical lessons (tutor travels to the student), the matched tutor
  // needs the student's exact address - the reverse of the studio case,
  // where the student needs the tutor's address. Only surfaced here, to
  // the specific matched tutor, once the lesson is actually active.
  const asTutor = tutorProfile ? assignments.listForTutor(tutorProfile.id).map((r) => {
    const student = store.findById(r.studentId);
    const studentProfile = student ? student.studentProfile || null : null;
    const studentMeta = {
      studentPhotoUrl: student ? student.photoUrl || null : null,
      studentAgeGroup: studentProfile ? studentProfile.ageGroup || null : null,
      studentSex: student ? (student.sex || (studentProfile && studentProfile.sex) || null) : null,
      studentProfile,
    };
    if (r.lessonType === 'physical' && r.status === 'active') {
      const studentAddress = studentProfile ? studentProfile.fullAddress : null;
      return studentAddress ? { ...r, studentFullAddress: studentAddress, ...studentMeta } : { ...r, ...studentMeta };
    }
    return { ...r, ...studentMeta };
  }) : [];
  res.json({ success: true, asStudent, asTutor, tutorProfile });
});

// Student submits intake responses for their request/assignment
app.post('/api/assignments/:id/intake-responses', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const record = assignments.findById(req.params.id);
  if (!record || record.studentId !== user.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  const responses = Array.isArray(req.body.intakeResponses) ? req.body.intakeResponses : [];
  const updated = assignments.setIntakeResponses(record.id, responses);
  if (!updated) return res.status(500).json({ success: false, error: 'Could not save responses.' });
  // Notify tutor/admin for review
  if (record.tutorId) {
    notifyAdmins({ type: 'intake-responses', subject: `Intake responses for assignment ${record.id}`, message: `Student ${user.name} submitted intake responses for ${record.category}.` });
  }
  res.json({ success: true });
});

// --- LESSON SESSIONS, ESCROW-STYLE PAYMENT, AND TWO-WAY RATINGS ---
app.get('/api/curriculum/:category', requireApprovedTutorApi, (req, res) => {
  if (!req.tutorProfile.categories.includes(req.params.category)) {
    return res.status(403).json({ success: false, error: 'Not one of your approved subjects.' });
  }
  res.json({ success: true, content: curriculum.getForCategory(req.params.category) });
});

// --- VIDEO LIBRARY (technique reference clips, taggable into chat) ---
// A student/tutor's "enrolled" subjects: every category they've ever
// requested or been matched in as a student, plus every subject an
// approved-or-pending tutor profile teaches. Library access for non-admins
// is scoped to these subjects (plus subject-less "Any subject" items,
// which stay visible to everyone) - so students and tutors only see
// technique material for the discipline they're actually in.
function enrolledCategoriesForUser(user) {
  const categories = new Set();
  assignments.listForStudent(user.id).forEach((r) => { if (r.category) categories.add(r.category); });
  const tutorProfile = tutors.findByUserId(user.id);
  if (tutorProfile) (tutorProfile.categories || []).forEach((c) => categories.add(c));
  return categories;
}

app.get('/api/library', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const { category, genre } = req.query;
  let items = reels.listActive({ category: category || null, genre: genre || null });
  if (user.role !== 'admin') {
    const allowed = enrolledCategoriesForUser(user);
    items = items.filter((item) => !item.category || allowed.has(item.category));
  }
  res.json({ success: true, items });
});

// Lets the library page (and any other UI) know which subjects this user
// is actually enrolled in, so it only offers those as filter options
// instead of the entire taxonomy.
app.get('/api/library/my-subjects', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  if (user.role === 'admin') return res.json({ success: true, subjects: taxonomy.SUBJECTS, isAdmin: true });
  res.json({ success: true, subjects: Array.from(enrolledCategoriesForUser(user)), isAdmin: false });
});

// A tutor's upload panel must show only clips they personally added. The
// public library remains subject-scoped for students and other tutors.
app.get('/api/library/mine', requireApprovedTutorApi, (req, res) => {
  const items = reels.listAll().filter((item) => (
    item.addedBy === currentUser(req).id
    && item.status === 'active'
  ));
  res.json({ success: true, items });
});

app.post('/api/library/upload', requireApprovedTutorApi, (req, res) => {
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

app.post('/api/library', requireApprovedTutorApi, (req, res) => {
  const { title, description, url, category, genre, isFile } = req.body || {};
  if (!title || !url) return res.status(400).json({ success: false, error: 'Title and link/file are required.' });
  const selectedCategory = category ? String(category).trim() : null;
  const tutorCategories = req.tutorProfile.categories || [];
  if (selectedCategory && !tutorCategories.includes(selectedCategory)) {
    return res.status(403).json({ success: false, error: 'You can only add library videos for your approved subjects.' });
  }
  const item = reels.create({ title, description, url, category: selectedCategory, genre, addedBy: currentUser(req).id, isFile });
  res.json({ success: true, item });
});

app.post('/api/library/:id', requireApprovedTutorApi, (req, res) => {
  const item = reels.findById(req.params.id);
  if (!item || item.addedBy !== currentUser(req).id) return res.status(404).json({ success: false, error: 'Video not found.' });
  const { title, description, category, genre } = req.body || {};
  const selectedCategory = category ? String(category).trim() : null;
  if (!title || !selectedCategory || !(req.tutorProfile.categories || []).includes(selectedCategory)) {
    return res.status(400).json({ success: false, error: 'Use a title and one of your teaching subjects.' });
  }
  res.json({ success: true, item: reels.update(item.id, { title, description, category: selectedCategory, genre }) });
});

app.delete('/api/library/:id', requireApprovedTutorApi, (req, res) => {
  const item = reels.findById(req.params.id);
  if (!item || item.addedBy !== currentUser(req).id) return res.status(404).json({ success: false, error: 'Video not found.' });
  reels.remove(item.id);
  res.json({ success: true });
});

app.post('/api/assignments/:id/sessions', requireApprovedTutorApi, async (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  if (record.status !== 'active') return res.status(400).json({ success: false, error: 'This assignment is not active.' });

  const { teacherNotes, assignmentText, reelIds, recordingUrl, durationMinutes } = req.body || {};
  const timedLesson = !durationMinutes ? assignments.consumeLessonTimer(record.id, req.tutorProfile.id) : null;
  const billableMinutes = timedLesson ? timedLesson.durationMinutes : Number(durationMinutes);
  if (!billableMinutes || billableMinutes <= 0) {
    return res.status(400).json({ success: false, error: 'Lesson duration (minutes) is required.' });
  }
  const curriculumContent = curriculum.getForCategory(record.category);
  const resolvedReels = (Array.isArray(reelIds) ? reelIds : []).map((id) => reels.findById(id)).filter(Boolean);
  // One free introductory class per tutor/student pair. Looking across all
  // assignments prevents a second request for the same tutor from creating
  // another free lesson.
  const hasCompletedClassWithTutor = assignments.listForTutor(req.tutorProfile.id)
    .some((item) => item.studentId === record.studentId && (item.sessions || []).length > 0);
  const isFreeTrial = !hasCompletedClassWithTutor;
  const session = assignments.addSession(record.id, {
    curriculumTitle: curriculumContent ? curriculumContent.title : null,
    teacherNotes, assignmentText, reels: resolvedReels, recordingUrl, durationMinutes: billableMinutes,
    hourlyRateUsd: req.tutorProfile.hourlyRateUsd, isFreeTrial,
  });
  tutors.incrementLessonsCompleted(req.tutorProfile.id);
  chat.send(record.id, { senderId: currentUser(req).id, senderRole: 'tutor', text: `🔔 Class ended. You spent ${session.durationMinutes} minute${session.durationMinutes === 1 ? '' : 's'} with ${record.tutorName} today.${isFreeTrial ? ' This first class is free.' : ` Lesson bill: $${session.totalUsd.toFixed(2)}.`}` });

  // Real Stripe hold, only if the student has a card on file - keeps the
  // simulated (no card) path working exactly as it did before Stripe was
  // wired in, so existing data/flows don't break.
  const student = store.findById(record.studentId);
  if (!isFreeTrial && student && student.stripeCustomerId && student.stripePaymentMethodId) {
    const client = stripeClient.getClient();
    if (client) {
      try {
        const intent = await client.paymentIntents.create({
          amount: Math.round(session.totalUsd * 100),
          currency: 'usd',
          customer: student.stripeCustomerId,
          payment_method: student.stripePaymentMethodId,
          payment_method_types: ['card'],
          off_session: true,
          confirm: true,
          capture_method: 'manual',
          description: `Mozart Techniques lesson - ${record.category}`,
        });
        assignments.setSessionPaymentIntent(record.id, session.id, intent.id);
        session.paymentIntentId = intent.id;
      } catch (err) {
        assignments.setSessionPaymentIntent(record.id, session.id, null, err.message);
        session.paymentError = err.message;
      }
    }
  }

  const sponsoringOrganization = coveredOrganizationForAssignment(record, student);
  if (!isFreeTrial && sponsoringOrganization) {
    store.addNotification(sponsoringOrganization.userId, {
      type: 'payment',
      message: `${req.tutorProfile.name} sent a $${session.totalUsd} ${record.category} lesson bill for sponsored student ${record.studentName}.`,
    });
    store.addNotification(record.studentId, {
      type: 'lesson',
      message: `${req.tutorProfile.name} completed your ${record.category} lesson. Your sponsoring organization will receive the bill.`,
    });
  } else {
    store.addNotification(record.studentId, {
      type: 'lesson',
      message: isFreeTrial ? `${req.tutorProfile.name} completed your free introductory ${record.category} class. No payment is due.` : `${req.tutorProfile.name} sent a ${session.durationMinutes}-minute ${record.category} lesson bill for $${session.totalUsd}. Confirm it to release payment.`,
    });
  }
  res.json({ success: true, session });
});

// The tutor explicitly begins the billable clock only after both people have
// joined the lesson. Starting a Meet alone never creates a charge.
app.post('/api/assignments/:id/lesson-start', requireApprovedTutorApi, (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  const started = assignments.startLesson(record.id, req.tutorProfile.id);
  if (!started) return res.status(400).json({ success: false, error: 'Only active assignments can start a lesson.' });
  chat.send(record.id, { senderId: currentUser(req).id, senderRole: 'tutor', text: `🔔 ${req.tutorProfile.name} started your ${record.category} class. The lesson clock is now running.` });
  res.json({ success: true, lessonStartedAt: started.lessonStartedAt });
});

app.post('/api/assignments/:id/tutor-acknowledgements', requireApprovedTutorApi, (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  const updated = assignments.setTutorAcknowledgements(record.id, req.tutorProfile.id, req.body || {});
  res.json({ success: true, acknowledgements: updated.tutorAcknowledgements });
});

// The student's attestation that the lesson happened as logged - captures
// the real Stripe hold (if one was authorized) and releases the payment to
// the tutor's internal balance. A session with no real hold (student never
// added a card) releases exactly as it did before Stripe was wired in.
app.post('/api/assignments/:id/sessions/:sessionId/confirm', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const record = assignments.findById(req.params.id);
  if (!record || record.studentId !== user.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  if (coveredOrganizationForAssignment(record, user)) return res.status(403).json({ success: false, error: 'Your sponsoring organization is responsible for this lesson bill.' });

  const pending = (record.sessions || []).find((s) => s.id === Number(req.params.sessionId));
  if (!pending || pending.paymentStatus !== 'held') {
    return res.status(400).json({ success: false, error: 'Session not found or already confirmed.' });
  }

  if (pending.paymentIntentId) {
    const client = stripeClient.getClient();
    if (client) {
      try {
        await client.paymentIntents.capture(pending.paymentIntentId);
      } catch (err) {
        return res.status(400).json({ success: false, error: `Payment capture failed: ${err.message}` });
      }
    }
  }

  const result = assignments.confirmSession(record.id, req.params.sessionId);
  if (!result) return res.status(400).json({ success: false, error: 'Session not found or already confirmed.' });

  const { session } = result;
  const settlement = await releaseTutorEarnings(record, session, { paymentIntentId: pending.paymentIntentId });

  res.json({ success: true, session, automaticTransfer: Boolean(settlement.transfer) });
});

// Tutor sets/updates their own externally-created meeting link (Google
// Meet, Zoom, etc.) for an online assignment - shown to the student too.
// The platform doesn't create or host meetings itself.
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

// --- GOOGLE CALENDAR / MEET ---------------------------------------------
// A tutor connects their own Google Calendar once; after that, scheduling a
// lesson creates a real Calendar event on their calendar with an
// auto-generated Meet link, invites the student by email, and lets Google
// send the reminders. Sign In With Google only proves identity (ID token,
// no API access), so this needs its own authorization-code consent flow.

const CALENDAR_STATE_TTL_MS = 15 * 60 * 1000;
function createCalendarState(userId) {
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}`;
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'dev-insecure-secret-change-me')
    .update(payload).digest('base64url');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

function readCalendarState(state) {
  try {
    const decoded = Buffer.from(String(state || ''), 'base64url').toString('utf8');
    const [userId, issuedAt, signature] = decoded.split('.');
    const payload = `${userId}.${issuedAt}`;
    const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'dev-insecure-secret-change-me')
      .update(payload).digest('base64url');
    if (!userId || !issuedAt || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    if (Date.now() - Number(issuedAt) > CALENDAR_STATE_TTL_MS || Number(issuedAt) > Date.now() + 60_000) return null;
    return Number(userId) || null;
  } catch {
    return null;
  }
}

app.get('/api/calendar/status', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const cal = user.googleCalendar;
  res.json({
    success: true,
    configured: googleCalendar.isConfigured(),
    connected: Boolean(cal && cal.refreshToken),
    googleEmail: (cal && cal.googleEmail) || null,
    connectedAt: (cal && cal.connectedAt) || null,
  });
});

app.get('/api/calendar/connect', requireApprovedTutorApi, (req, res) => {
  if (!googleCalendar.isConfigured()) {
    return res.status(503).json({ success: false, error: 'Google Calendar is not configured on this server.' });
  }
  const url = googleCalendar.getAuthUrl(createCalendarState(currentUser(req).id));
  res.redirect(url);
});

// Google redirects the browser straight here, so this responds with a page
// redirect rather than JSON.
app.get('/api/calendar/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect('/tutor?calendar=denied');
  try {
    const tokens = await googleCalendar.exchangeCode(code);
    const userId = readCalendarState(state);
    const user = store.findById(userId);
    // The currently signed-in tutor must be the same person who started
    // consent.  This prevents one user from attaching a calendar to another
    // tutor's account by altering the OAuth callback URL.
    if (!user || !currentUser(req) || currentUser(req).id !== userId || !tutors.findByUserId(userId)) {
      return res.redirect('/tutor?calendar=error');
    }
    // Google only returns a refresh token on the first consent (we force
    // prompt=consent to make it reliable); keep the existing one if this
    // round somehow didn't include a fresh one.
    const existing = user.googleCalendar || {};
    const refreshToken = tokens.refresh_token || existing.refreshToken;
    if (!refreshToken) return res.redirect('/tutor?calendar=error');
    store.setCalendarTokens(userId, { refreshToken, googleEmail: user.email });
    res.redirect('/tutor?calendar=connected');
  } catch (err) {
    console.error('Calendar callback failed:', err.message);
    res.redirect('/tutor?calendar=error');
  }
});

app.post('/api/calendar/disconnect', requireAuthApi, (req, res) => {
  store.clearCalendarTokens(currentUser(req).id);
  res.json({ success: true });
});

// Schedules one online lesson: real Calendar event + Meet link + student
// invite + Calendar reminders. Requires the tutor to have connected their
// calendar first.
app.post('/api/assignments/:id/schedule', requireApprovedTutorApi, async (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) {
    return res.status(404).json({ success: false, error: 'Assignment not found.' });
  }
  const { startISO, durationMinutes } = req.body || {};
  if (!startISO || Number.isNaN(Date.parse(startISO))) {
    return res.status(400).json({ success: false, error: 'Pick a valid date and time.' });
  }

  const user = currentUser(req);
  const cal = user.googleCalendar;
  if (!cal || !cal.refreshToken) {
    return res.status(400).json({ success: false, error: 'Connect your Google Calendar first.' });
  }

  try {
    const { eventId, meetLink } = await googleCalendar.createLessonEvent({
      refreshToken: cal.refreshToken,
      summary: `${record.category} lesson with ${req.tutorProfile.name}`,
      // The host-management note is in the invite body because it's the
      // one place the tutor reliably looks right before the lesson. Meet
      // leaves that toggle off by default on personal accounts, which hands
      // every participant host controls - not what you want in a class,
      // particularly one with a minor in it.
      description: [
        `Mozart Techniques ${record.category} lesson.`,
        `Tutor: ${req.tutorProfile.name}`,
        `Student: ${record.studentName}`,
        '',
        'Tutors: after joining, open Host controls (shield icon) and turn on',
        '"Host management" so only you can mute, remove or admit participants.',
      ].join('\n'),
      startISO,
      durationMinutes: Number(durationMinutes) || 60,
      attendeeEmails: [record.studentEmail, user.email],
    });

    const updated = assignments.scheduleSession(record.id, {
      scheduledAt: new Date(startISO).toISOString(),
      meetingLink: meetLink,
      calendarEventId: eventId,
    });

    const when = new Date(startISO).toLocaleString();
    store.addNotification(record.studentId, {
      type: 'lesson',
      message: `${req.tutorProfile.name} scheduled your ${record.category} lesson for ${when}. A Google Meet link and calendar invite are in your email.`,
    });
    mailer.sendMail({
      to: record.studentEmail,
      subject: `Your ${record.category} lesson is scheduled`,
      text: `${req.tutorProfile.name} scheduled your ${record.category} lesson for ${when}.\n\nJoin here: ${meetLink}\n\nA calendar invite with reminders has been sent to this address.`,
    });

    res.json({ success: true, request: updated, meetLink });
  } catch (err) {
    console.error('Schedule failed:', err.message);
    res.status(400).json({ success: false, error: `Could not create the calendar event: ${err.message}` });
  }
});

// Tutor posts a recorded class to the student after the lesson. Accepts
// either an uploaded file URL (via /api/library/upload) or an external link.
app.post('/api/assignments/:id/recording', requireApprovedTutorApi, (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) {
    return res.status(404).json({ success: false, error: 'Assignment not found.' });
  }
  const { recordingUrl, title } = req.body || {};
  if (!recordingUrl || !/^(https?:\/\/|\/uploads\/)/i.test(recordingUrl)) {
    return res.status(400).json({ success: false, error: 'Provide an uploaded file or a link starting with http:// or https://' });
  }
  const item = assignments.addRecording(record.id, {
    url: recordingUrl,
    title: (title || `${record.category} class recording`).trim(),
    postedBy: req.tutorProfile.name,
  });
  store.addNotification(record.studentId, {
    type: 'lesson',
    message: `${req.tutorProfile.name} posted a class recording for your ${record.category} lesson.`,
  });
  res.json({ success: true, recording: item });
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
  const existing = (record.sessions || []).find((item) => item.id === Number(req.params.sessionId));
  if (!existing) return res.status(404).json({ success: false, error: 'Session not found.' });
  if ((role === 'student' && existing.studentRating) || (role === 'tutor' && existing.tutorRating)) {
    return res.status(400).json({ success: false, error: 'This class has already been rated.' });
  }
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

// --- CHAT: one thread per assignment, social-media-style DMs between the
// matched student and tutor. ---
function assignmentParticipantRole(user, record) {
  if (!record) return null;
  if (record.studentId === user.id) return 'student';
  const tutorProfile = tutors.findByUserId(user.id);
  if (tutorProfile && record.tutorId === tutorProfile.id) return 'tutor';
  return null;
}

app.get('/api/assignments/:id/messages', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const record = assignments.findById(req.params.id);
  const role = assignmentParticipantRole(user, record);
  if (!role) return res.status(403).json({ success: false, error: 'Not your assignment.' });
  chat.markRead(record.id, role);
  res.json({ success: true, messages: chat.listForAssignment(record.id), role });
});

// Uploads a chat attachment and returns its URL - the caller then sends a
// normal message referencing it, so an abandoned upload never becomes a
// half-sent message in the thread.
app.post('/api/chat/upload', requireAuthApi, (req, res) => {
  chatUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 50MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file to send.' });

    const mime = req.file.mimetype || '';
    const kind = mime.startsWith('image/') ? 'image'
      : mime.startsWith('video/') ? 'video'
        : mime.startsWith('audio/') ? 'audio' : 'file';

    res.json({
      success: true,
      attachment: {
        url: `/uploads/chat/${req.file.filename}`,
        name: req.file.originalname,
        mime,
        size: req.file.size,
        kind,
      },
    });
  });
});

app.post('/api/assignments/:id/messages', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const record = assignments.findById(req.params.id);
  const role = assignmentParticipantRole(user, record);
  if (!role) return res.status(403).json({ success: false, error: 'Not your assignment.' });

  const { text, libraryItemId, attachment } = req.body || {};
  if ((!text || !text.trim()) && !libraryItemId && !attachment) {
    return res.status(400).json({ success: false, error: 'Message text, a file, or a tagged clip is required.' });
  }
  // Only accept an attachment that points at our own upload directory -
  // otherwise this field would let anyone render an arbitrary URL inside
  // someone else's thread.
  let safeAttachment = null;
  if (attachment && typeof attachment.url === 'string' && attachment.url.startsWith('/uploads/chat/')) {
    safeAttachment = attachment;
  } else if (attachment) {
    return res.status(400).json({ success: false, error: 'Attach files through the upload endpoint.' });
  }

  const libraryItem = libraryItemId ? reels.findById(libraryItemId) : null;
  const message = chat.send(record.id, {
    senderId: user.id, senderRole: role, text: (text || '').trim(), libraryItem, attachment: safeAttachment,
  });

  const recipientId = role === 'student' ? tutors.findById(record.tutorId).userId : record.studentId;
  store.addNotification(recipientId, { type: 'chat', message: `New message from ${user.name} about your ${record.category} lesson.` });

  // Push to anyone with the thread open. The message is already saved, so
  // this is purely delivery speed - a failed/absent socket costs nothing.
  realtime.broadcast(record.id, { type: 'message', assignmentId: record.id, message });

  // Only email when the recipient isn't actually looking at the thread,
  // otherwise every message in a live back-and-forth would send one.
  if (!realtime.isWatching(record.id, recipientId)) {
    const recipient = store.findById(recipientId);
    if (recipient && recipient.email) {
      const attachmentLabel = safeAttachment
        ? ({ image: 'Sent a photo', video: 'Sent a video', audio: 'Sent a voice note' }[safeAttachment.kind] || `Sent a file: ${safeAttachment.name}`)
        : null;
      const preview = (text || '').trim()
        || attachmentLabel
        || (libraryItem ? `Shared a clip: ${libraryItem.title}` : 'Sent you a message');
      mailer.sendMail({
        to: recipient.email,
        subject: `New message from ${user.name} - ${record.category}`,
        text: `${user.name} sent you a message about your ${record.category} lesson:\n\n"${preview}"\n\nReply here: ${req.protocol}://${req.get('host')}/chat/${record.id}`,
      });
    }
  }

  res.json({ success: true, message });
});

// Total unread messages across every thread this user is part of - drives
// the unread badge in the nav.
// Every conversation this user is part of, newest activity first - the
// WhatsApp-style list behind /messages. A tutor sees the students matched
// to them; a student sees the tutors they've been matched with. Pending
// (unmatched) requests are excluded because there's nobody to talk to yet.
app.get('/api/conversations', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const tutorProfile = tutors.findByUserId(user.id);

  const conversations = assignments.listAll()
    .map((record) => {
      const role = record.studentId === user.id
        ? 'student'
        : (tutorProfile && record.tutorId === tutorProfile.id ? 'tutor' : null);
      if (!role || !record.tutorId) return null;

      // The other person, from this user's point of view.
      let name;
      let photoUrl = null;
      if (role === 'student') {
        const theirTutor = tutors.findById(record.tutorId);
        name = record.tutorName;
        photoUrl = theirTutor ? theirTutor.photoUrl || null : null;
      } else {
        const theirStudent = store.findById(record.studentId);
        name = record.studentName;
        photoUrl = theirStudent ? theirStudent.photoUrl || null : null;
      }

      const messages = chat.listForAssignment(record.id);
      const last = messages[messages.length - 1] || null;
      const lastLabel = last
        ? (last.text
          || ({ image: 'Photo', video: 'Video', audio: 'Voice note' }[last.attachment && last.attachment.kind] || (last.attachment ? last.attachment.name : ''))
          || (last.libraryItem ? `Clip: ${last.libraryItem.title}` : ''))
        : '';

      return {
        assignmentId: record.id,
        role,
        name,
        photoUrl,
        category: record.category,
        status: record.status,
        lessonType: record.lessonType,
        lastMessage: lastLabel,
        lastAt: last ? last.createdAt : (record.assignedAt || record.createdAt),
        unread: chat.unreadCountForRole(record.id, role),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

  res.json({ success: true, conversations });
});

app.get('/api/messages/unread-count', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const tutorProfile = tutors.findByUserId(user.id);
  let total = 0;
  const threads = [];
  assignments.listAll().forEach((record) => {
    const role = record.studentId === user.id
      ? 'student'
      : (tutorProfile && record.tutorId === tutorProfile.id ? 'tutor' : null);
    if (!role) return;
    const count = chat.unreadCountForRole(record.id, role);
    if (count > 0) threads.push({ assignmentId: record.id, category: record.category, count });
    total += count;
  });
  res.json({ success: true, total, threads });
});



// --- ADMIN: TUTOR REVIEW & MATCHING ---
app.get('/api/admin/tutors', requireAdminApi, (req, res) => {
  const admin = currentUser(req);
  const scoped = tutors.listAll().filter((profile) => canManageUser(admin, store.findById(profile.userId)));
  res.json({ success: true, tutors: scoped });
});

app.post('/api/admin/tutors/:id/status', requireAdminApi, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status.' });
  }
  const profile = tutors.findById(req.params.id);
  if (!profile || !canManageUser(currentUser(req), store.findById(profile.userId))) return res.status(403).json({ success: false, error: 'You can only review tutors in your country.' });
  const updated = tutors.setStatus(req.params.id, status, currentUser(req).id);
  if (!updated) return res.status(404).json({ success: false, error: 'Application not found.' });

  if (status === 'approved') {
    store.addNotification(updated.userId, { type: 'tutor', message: 'Your tutor application has been approved! Set up your Stripe payout account from the Tutor Dashboard so paid classes can be paid automatically.' });
  } else if (status === 'rejected') {
    store.addNotification(updated.userId, { type: 'tutor', message: 'Your tutor application was not approved this time.' });
  }
  res.json({ success: true, tutor: updated });
});

app.get('/api/admin/organizations', requireAdminApi, (req, res) => {
  res.json({ success: true, organizations: organizations.listAll() });
});

app.post('/api/admin/organizations/:id/status', requireAdminApi, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status.' });
  }
  const updated = organizations.setStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ success: false, error: 'Application not found.' });

  if (status === 'approved') {
    store.addNotification(updated.userId, { type: 'organization', message: 'Your organization application has been approved! Complete your annual subscription to start sponsoring students.' });
  } else if (status === 'rejected') {
    store.addNotification(updated.userId, { type: 'organization', message: 'Your organization application was not approved this time.' });
  }
  res.json({ success: true, organization: updated });
});

// Admin confirms the (simulated) annual subscription payment - see
// data/organizations.js for why this isn't a live payment charge.
app.post('/api/admin/organizations/:id/activate', requireAdminApi, (req, res) => {
  const updated = organizations.activateSubscription(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Organization not found.' });
  store.addNotification(updated.userId, {
    type: 'organization',
    message: `Your annual subscription is active through ${new Date(updated.subscriptionEndAt).toLocaleDateString()}. You can now generate access codes for the students you sponsor.`,
  });
  res.json({ success: true, organization: updated });
});

app.post('/api/admin/organizations/:id/monthly-amount', requireAdminApi, (req, res) => {
  const { monthlyAmount } = req.body || {};
  if (monthlyAmount == null) return res.status(400).json({ success: false, error: 'Monthly amount is required.' });
  
  const updated = organizations.setMonthlyAmount(req.params.id, monthlyAmount);
  if (!updated) return res.status(404).json({ success: false, error: 'Organization not found.' });
  
  store.addNotification(updated.userId, {
    type: 'organization',
    message: `Your monthly subscription amount has been set to ₦${monthlyAmount}. Choose to pay monthly or yearly when you activate your subscription.`,
  });
  res.json({ success: true, organization: updated });
});

app.post('/api/admin/organizations/:id/code-sent', requireAdminApi, (req, res) => {
  const updated = organizations.markCodeSent(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Organization not found.' });
  store.addNotification(updated.userId, {
    type: 'organization',
    message: 'Your sponsor access code has been sent to your organization after payment confirmation.',
  });
  res.json({ success: true, organization: updated });
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
  const region = String(req.query.region || '').trim().toLowerCase();
  const sessions = assignments.listAll().filter((r) => !region || String(r.studentCountry || (store.findById(r.studentId)?.country) || '').toLowerCase() === region).flatMap((r) => (r.sessions || []).map((s) => ({
    ...s,
    requestId: r.id,
    category: r.category,
    lessonType: r.lessonType,
    tutorName: r.tutorName,
    studentName: r.studentName,
  })));
  sessions.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));
  res.json({ success: true, sessions });
});

// A live feed of every chat message platform-wide, newest first - part of
// "admin can see all activities."
app.get('/api/admin/chat-activity', requireAdminApi, (req, res) => {
  const region = String(req.query.region || '').trim().toLowerCase();
  const allRecords = assignments.listAll().filter((r) => !region || String(r.studentCountry || (store.findById(r.studentId)?.country) || '').toLowerCase() === region);
  const messages = allRecords.flatMap((r) => chat.listForAssignment(r.id).map((m) => ({
    ...m, category: r.category, tutorName: r.tutorName, studentName: r.studentName,
  })));
  messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, messages: messages.slice(0, 200) });
});

// Real numbers only - every figure here comes from data already recorded
// elsewhere (the payments ledger, tutor/assignment records), never a
// placeholder or estimate.
app.get('/api/admin/analytics', requireAdminApi, (req, res) => {
  const region = String(req.query.region || '').trim().toLowerCase();
  const assignmentInRegion = (assignmentId) => {
    if (!region) return true;
    const record = assignments.findById(assignmentId);
    return String(record && (record.studentCountry || (store.findById(record.studentId)?.country)) || '').toLowerCase() === region;
  };
  const allPayments = payments.listAll().filter((payment) => assignmentInRegion(payment.assignmentId));
  const totalRevenueUsd = allPayments.reduce((sum, p) => sum + p.priceUsd, 0);
  const platformRevenueUsd = allPayments.reduce((sum, p) => sum + (p.platformFeeUsd || 0), 0);

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

  const subjectCounts = {};
  allPayments.forEach((p) => {
    if (!subjectCounts[p.category]) subjectCounts[p.category] = { category: p.category, lessons: 0, revenueUsd: 0 };
    subjectCounts[p.category].lessons += 1;
    subjectCounts[p.category].revenueUsd += p.priceUsd;
  });
  const topSubjects = Object.values(subjectCounts).sort((a, b) => b.revenueUsd - a.revenueUsd).slice(0, 5);

  const tutorLeaderboard = tutors.listAll().filter((t) => !region || String(t.locality && t.locality.country || '').toLowerCase() === region)
    .filter((t) => t.ratingCount > 0)
    .map((t) => ({ id: t.id, name: t.name, avgRating: tutors.avgRating(t), ratingCount: t.ratingCount, lessonsCompletedCount: t.lessonsCompletedCount || 0, totalEarnedUsd: t.totalEarnedUsd || 0 }))
    .sort((a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount)
    .slice(0, 5);

  const regionalAssignments = assignments.listAll().filter((r) => assignmentInRegion(r.id));
  const lessonsLogged = regionalAssignments.reduce((sum, r) => sum + (r.sessions || []).length, 0);
  const pendingEscrowUsd = regionalAssignments
    .flatMap((r) => r.sessions || [])
    .filter((s) => s.paymentStatus === 'held')
    .reduce((sum, s) => sum + s.totalUsd, 0);

  res.json({
    success: true,
    stats: {
      totalRevenueUsd,
      platformRevenueUsd: Math.round(platformRevenueUsd * 100) / 100,
      revenue30dUsd,
      pendingEscrowUsd: Math.round(pendingEscrowUsd * 100) / 100,
      totalUsers: store.listUsers().filter((user) => !region || String(user.country || '').toLowerCase() === region).length,
      activeTutors: tutors.listApproved().filter((tutor) => !region || String(tutor.locality && tutor.locality.country || '').toLowerCase() === region).length,
      lessonsLogged,
    },
    revenueByDay,
    topSubjects,
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
  const admin = currentUser(req);
  const requests = assignments.listAll().filter((record) => canManageUser(admin, store.findById(record.studentId)));
  res.json({ success: true, requests });
});

app.post('/api/admin/tutor-requests/:id/assign', requireAdminApi, async (req, res) => {
  const { tutorId } = req.body || {};
  const tutor = tutors.findById(tutorId);
  if (!tutor || tutor.status !== 'approved') {
    return res.status(400).json({ success: false, error: 'Choose an approved tutor.' });
  }
  const record = assignments.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'Request not found.' });
  if (!canManageUser(currentUser(req), store.findById(record.studentId)) || !canManageUser(currentUser(req), store.findById(tutor.userId))) {
    return res.status(403).json({ success: false, error: 'You can only match tutors and students from your country.' });
  }
  const studentCountry = record.studentCountry || (store.findById(record.studentId)?.studentProfile?.country) || null;
  const tutorCountry = tutor.locality && tutor.locality.country;
  if (studentCountry && !sameCountry(tutorCountry, studentCountry)) {
    return res.status(400).json({ success: false, error: 'Tutor and student must be in the same country.' });
  }

  let distKm = null;
  if (record.lessonType !== 'online' && record.city && tutor.lat != null && tutor.lng != null) {
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

// --- ADMIN: EDUCATIONAL CONTENT (evaluations, orientation, curriculum, library) ---
app.get('/api/admin/assessments/:kind/:category', requireAdminApi, (req, res) => {
  const { kind, category } = req.params;
  if (kind !== 'teacher-eval') return res.status(400).json({ success: false, error: 'Invalid kind.' });
  res.json({ success: true, questions: assessments.getQuestionsForAdmin(kind, category) });
});

app.post('/api/admin/assessments/:kind/:category', requireAdminApi, (req, res) => {
  const { kind, category } = req.params;
  if (kind !== 'teacher-eval') return res.status(400).json({ success: false, error: 'Invalid kind.' });
  const { questions } = req.body || {};
  if (!Array.isArray(questions)) return res.status(400).json({ success: false, error: 'Questions must be an array.' });
  const saved = assessments.setQuestions(kind, category, questions);
  res.json({ success: true, questions: saved });
});

app.get('/api/admin/orientation', requireAdminApi, (req, res) => {
  const audience = ['tutor', 'student', 'admin', 'sponsor', 'organization', 'support_agent'].includes(req.query.audience) ? req.query.audience : 'tutor';
  const key = audience === 'tutor' ? curriculum.ORIENTATION_KEY : `orientation-${audience}`;
  res.json({
    success: true,
    content: curriculum.getForCategory(key), audience,
    questions: audience === 'tutor' ? assessments.getQuestionsForAdmin('orientation', null) : [],
  });
});

app.post('/api/admin/orientation', requireAdminApi, (req, res) => {
  const { title, notes, videoUrl, rewardType, questions, audience = 'tutor' } = req.body || {};
  if (!['tutor', 'student', 'admin', 'sponsor', 'organization', 'support_agent'].includes(audience)) return res.status(400).json({ success: false, error: 'Invalid orientation audience.' });
  const key = audience === 'tutor' ? curriculum.ORIENTATION_KEY : `orientation-${audience}`;
  const content = curriculum.setForCategory(key, { title, notes, videoUrl, rewardType });
  const saved = audience === 'tutor' && Array.isArray(questions) ? assessments.setQuestions('orientation', null, questions) : [];
  res.json({ success: true, content, questions: saved });
});

app.get('/api/orientation', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const audience = user.role === 'admin' ? 'admin' : user.role === 'support_agent' ? 'support_agent' : organizations.findByUserId(user.id) ? 'organization' : user.sponsor ? 'sponsor' : tutors.findByUserId(user.id) ? 'tutor' : 'student';
  const key = audience === 'tutor' ? curriculum.ORIENTATION_KEY : `orientation-${audience}`;
  res.json({ success: true, audience, content: curriculum.getForCategory(key) });
});

app.get('/api/admin/curriculum/:category', requireAdminApi, (req, res) => {
  res.json({ success: true, content: curriculum.getForCategory(req.params.category) });
});

app.post('/api/admin/curriculum/:category', requireAdminApi, (req, res) => {
  const { title, notes, videoUrl } = req.body || {};
  const content = curriculum.setForCategory(req.params.category, { title, notes, videoUrl });
  res.json({ success: true, content });
});

app.get('/api/admin/library', requireAdminApi, (req, res) => {
  res.json({ success: true, items: reels.listAll() });
});

app.post('/api/admin/library', requireAdminApi, (req, res) => {
  const { title, url, category, genre, isFile } = req.body || {};
  if (!title || !url) return res.status(400).json({ success: false, error: 'Title and link are required.' });
  const user = currentUser(req);
  const item = reels.create({ title, url, category, genre, addedBy: user.id, isFile });
  res.json({ success: true, item });
});

app.post('/api/admin/library/upload', requireAdminApi, (req, res) => {
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

app.post('/api/admin/library/:id', requireAdminApi, (req, res) => {
  const { title, url, category, genre, isFile } = req.body || {};
  const item = reels.update(req.params.id, { title, url, category, genre, isFile });
  if (!item) return res.status(404).json({ success: false, error: 'Item not found.' });
  res.json({ success: true, item });
});

app.post('/api/admin/library/:id/status', requireAdminApi, (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'broken'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status.' });
  const item = reels.setStatus(req.params.id, status);
  if (!item) return res.status(404).json({ success: false, error: 'Item not found.' });
  res.json({ success: true, item });
});

// --- ADMIN: APPLICANTS / USERS ---
function adminUserView(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    supportAgent: Boolean(user.supportAgent || user.role === 'support_agent'),
    countryCode: user.countryCode || null,
    adminCountryCode: user.adminCountryCode || null,
    studentProfile: user.studentProfile || null,
    createdAt: user.createdAt,
    authMethod: user.googleId ? 'google' : 'password',
  };
}

app.get('/api/admin/users', requireAdminApi, (req, res) => {
  const search = (req.query.search || '').toLowerCase().trim();
  let users = store.listUsers();
  const admin = currentUser(req);
  users = users.filter((user) => canManageUser(admin, user));
  if (search) {
    users = users.filter((u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
  }
  users = users
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(adminUserView);
  res.json({ success: true, users, isPrimaryAdmin: isPrimaryAdmin(admin) });
});

app.post('/api/admin/users/:id/role', requireAdminApi, (req, res) => {
  const admin = currentUser(req);
  const { role } = req.body || {};
  if (!['user', 'demo', 'admin', 'support_agent', 'country_admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role.' });
  }
  const target = store.findById(Number(req.params.id));
  if (!target) return res.status(404).json({ success: false, error: 'User not found.' });
  if (!canManageUser(admin, target)) return res.status(403).json({ success: false, error: 'You can only manage users in your country.' });
  if (['admin', 'demo', 'country_admin'].includes(role) && !isPrimaryAdmin(admin)) {
    return res.status(403).json({ success: false, error: 'Only the main administrator can grant Admin or Demo access.' });
  }
  let updated;
  if (role === 'country_admin') {
    const countryCode = countryForUser(target);
    if (!countryCode) return res.status(400).json({ success: false, error: 'This user needs a verified country first.' });
    updated = store.setCountryAdmin(target.id, countryCode);
  } else {
    updated = store.setRole(target.id, role);
  }
  if (!updated) return res.status(404).json({ success: false, error: 'User not found.' });
  if (role === 'support_agent') store.addNotification(updated.id, { type: 'support_agent', message: 'You now have access to the Mozart Techniques Support Agent inbox.' });
  res.json({ success: true, user: adminUserView(updated) });
});

app.post('/api/admin/users/:id/country-admin', requirePrimaryAdminApi, (req, res) => {
  const target = store.findById(Number(req.params.id));
  if (!target) return res.status(404).json({ success: false, error: 'User not found.' });
  const countryCode = countryForUser(target);
  if (!countryCode) return res.status(400).json({ success: false, error: 'This user needs a verified country on their profile first.' });
  const updated = store.setCountryAdmin(target.id, countryCode);
  store.addNotification(updated.id, { type: 'admin', message: `You are now the Mozart Techniques country administrator for ${countryCode}. You can review people from your country.` });
  res.json({ success: true, user: adminUserView(updated) });
});

// Seed a demo and an admin account on first boot so there's always a way
// to explore the platform.
async function seedSpecialAccounts() {
  const seeds = [
    { name: 'Demo Student', email: 'demo@mozarttechnique.com', password: 'DemoPass123', role: 'demo' },
    { name: 'Admin', email: 'mozarttechniques@gmail.com', password: '@Mozarttechniques2026$', role: 'admin' },
  ];

  for (const seed of seeds) {
    if (store.findByEmail(seed.email)) continue;
    const passwordHash = await bcrypt.hash(seed.password, 10);
    store.createUser({ name: seed.name, email: seed.email, passwordHash, role: seed.role });
    console.log(`Seeded ${seed.role} account: ${seed.email} / ${seed.password}`);
  }
}

// On Windows, a nodemon restart kills the old process and immediately
// starts a new one - but the OS can take a moment to actually release the
// listening socket, so the new process's first bind attempt sometimes hits
// a transient EADDRINUSE even though nothing else is really holding the
// port. Retrying a few times with a short delay lets that race resolve on
// its own instead of nodemon reporting a false "app crashed" every time a
// file is saved. A genuinely occupied port (a real other instance) still
// fails clearly once the retries are exhausted.
const PORT_RETRY_ATTEMPTS = 10;
const PORT_RETRY_DELAY_MS = 400;

// Keep unknown URLs inside Mozart Techniques. This comes after every valid
// route above, so it only handles paths that truly do not exist.
app.use((req, res) => {
  if (req.method !== 'GET') return res.status(404).json({ success: false, error: 'Route not available.' });
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'not-found.html'));
});

function startServer(attempt = 1) {
  const httpServer = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Attached only after the port is actually bound. Attaching earlier
    // routes a failed bind through the WebSocketServer, which has no error
    // listener of its own, so EADDRINUSE became an unhandled 'error' and
    // killed the process instead of reaching the retry logic below.
    //
    // The authorization check is the same one the REST chat routes use,
    // passed in so there's a single definition of "is this your
    // conversation" rather than two that can drift apart.
    realtime.attach(httpServer, {
      canAccess(userId, assignmentId) {
        const record = assignments.findById(assignmentId);
        if (!record) return false;
        if (record.studentId === userId) return true;
        const tutorProfile = tutors.findByUserId(userId);
        return Boolean(tutorProfile && record.tutorId === tutorProfile.id);
      },
    });
  });
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < PORT_RETRY_ATTEMPTS) {
      console.log(`Port ${PORT} still releasing from a previous instance - retrying (${attempt}/${PORT_RETRY_ATTEMPTS})...`);
      setTimeout(() => startServer(attempt + 1), PORT_RETRY_DELAY_MS);
      return;
    }
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is still in use after ${PORT_RETRY_ATTEMPTS} retries - is another instance of the server already running?`);
    } else {
      console.error('Server failed to start:', err);
    }
    process.exit(1);
  });
}

async function initializePersistence() {
  // Use Atlas whenever a connection string is configured. If MongoDB is
  // unreachable or the Atlas network is blocked, the app should keep serving
  // from the local JSON snapshot files instead of crashing the whole process.
  if (process.env.NODE_ENV !== 'production' && process.env.MONGO_PERSISTENCE !== 'true' && !process.env.MONGODB_URI) {
    return { connected: false, mode: 'local-development' };
  }

  const result = await mongoPersistence.initialize();
  if (!result.connected && process.env.NODE_ENV === 'production') {
    console.warn('Production MongoDB connection failed; continuing with local JSON persistence for this instance.');
  }
  return result;
}

initializePersistence().then((result) => {
  if (result.connected) {
    mongoPersistence.installWriteThroughHook();
    console.log('MongoDB persistence enabled for JSON snapshots.');
  } else {
    console.warn('MongoDB persistence is disabled in development; local JSON files are in use.');
  }
  return seedSpecialAccounts();
}).then(() => {
  startServer();
}).catch((err) => {
  console.error('Failed to seed initial accounts, server did not start:', err);
  process.exit(1);
});
