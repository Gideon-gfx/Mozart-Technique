require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const { OAuth2Client } = require('google-auth-library');
const webpush = require('web-push');

const store = require('./data/store');
const geo = require('./data/geo');
const currency = require('./data/currency');
const tutors = require('./data/tutors');
const assignments = require('./data/assignments');
const taxonomy = require('./data/taxonomy');
const { categoryMatchesQuery, matchesAnyCategory } = require('./data/searchSynonyms');
const polls = require('./data/polls');
const teachingTiers = require('./data/teachingTiers');
const credentialCrosswalk = require('./data/credentialCrosswalk');
const certModules = require('./data/certModules');
const externalCredentials = require('./data/externalCredentials');
const practicumReviews = require('./data/practicumReviews');
const tierEngine = require('./data/tierEngine');
const quizAssignments = require('./data/quizAssignments');
const assessments = require('./data/assessments');
const curriculum = require('./data/curriculum');
const reels = require('./data/reels');
const certificates = require('./data/certificates');
const payments = require('./data/payments');
const payouts = require('./data/payouts');
const chat = require('./data/chat');
const supportChat = require('./data/support-chat');
const orientation = require('./data/orientation');
const orientationProgress = require('./data/orientation-progress');
const orgChat = require('./data/org-chat');
const { REACTIONS, isValidReaction } = require('./data/reaction-emoji');
const reports = require('./data/reports');
const games = require('./data/games');
const orgContent = require('./data/org-content');
const allowedLocations = require('./data/allowed-locations');
const organizations = require('./data/organizations');
const products = require('./data/products');
const orders = require('./data/orders');
const addresses = require('./data/addresses');
const productReviews = require('./data/productReviews');
const performers = require('./data/performers');
const performerPosts = require('./data/performer-posts');
const marketplaceRequests = require('./data/marketplaceRequests');
const marketplaceOffers = require('./data/marketplaceOffers');
const marketplaceChat = require('./data/marketplace-chat');
const tutorOffers = require('./data/tutorOffers');
const marketplaceMatching = require('./data/marketplaceMatching');
const benchmarkRates = require('./data/benchmarkRates');
const mailer = require('./data/mailer');
const newsletter = require('./data/newsletter');
const stripeClient = require('./data/stripe-client');
const stripePaymentProfile = require('./data/stripe-payment-profile');
const cloudinaryClient = require('./data/cloudinary-client');
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
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:mozarttechniques@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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

// Every signed-in request, any role, web or app - store.markSeen() is
// day-granular and self-guards its own writes, so this is cheap even
// running on literally every request. This is what the "gone quiet for
// 2-3 weeks" win-back email (checkReengagementEmails, below) reads from -
// separate from markActive()'s student-dashboard streak/badge tracking,
// which shouldn't fire for a tutor or sponsor just checking their own
// dashboard.
app.use((req, res, next) => {
  if (req.session && req.session.userId) store.markSeen(req.session.userId);
  next();
});

// When Cloudinary is configured, every upload goes there (and survives
// redeploys); otherwise this falls back to the original local-disk
// behavior, unchanged. Decided once at boot since it depends only on env
// vars. See resolveUploadedFileUrl() below for the matching read side.
const USE_CLOUDINARY = cloudinaryClient.isConfigured();
if (USE_CLOUDINARY) {
  console.log('Cloudinary configured - uploads will persist across redeploys.');
} else {
  console.warn('Cloudinary is not configured - uploads (photos, videos, etc.) are stored on local disk only and WILL BE LOST on the next redeploy. Set CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET to fix this.');
}

function diskOrMemoryStorage(diskDir) {
  if (USE_CLOUDINARY) return multer.memoryStorage();
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, diskDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
  });
}

// The single place every upload route resolves req.file into a permanent
// URL - Cloudinary's secure_url when configured, the old local /uploads/...
// path otherwise. `folder` matches the old local uploads/<folder>/ dirs.
async function resolveUploadedFileUrl(file, folder) {
  if (!file) return null;
  if (!USE_CLOUDINARY) return `/uploads/${folder}/${file.filename}`;
  // Cloudinary has no separate "audio" resource type - audio (voice notes,
  // music clips) has to go up as 'video', the same as clips, or it lands in
  // 'raw' storage instead: no transcoding, no correct audio Content-Type, no
  // range-request streaming, which is why a voice note uploaded that way
  // would fail to play back even though the upload itself "succeeded".
  const resourceType = file.mimetype.startsWith('image/') ? 'image' : (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) ? 'video' : 'raw';
  const result = await cloudinaryClient.uploadBuffer(file.buffer, { folder, resourceType });
  return result.secure_url;
}

// Chat attachment URLs must point at our own upload pipeline (either the old
// local-disk path or a Cloudinary URL under our chat folder) - never an
// arbitrary URL, which would let anyone render attacker-controlled content
// inside someone else's thread. Accepts both storage backends since
// USE_CLOUDINARY can differ between where a file was uploaded and where this
// check runs (e.g. local dev vs production).
function isOwnChatAttachmentUrl(url) {
  if (typeof url !== 'string') return false;
  return url.startsWith('/uploads/chat/') || /^https:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video|raw)\/upload\/.*\/mozart-techniques\/chat\//.test(url);
}

// Blocks exchanging contact info (email/phone) inside any chat surface -
// students and tutors are expected to keep lesson coordination and payment
// on-platform rather than moving it off to avoid fees/matching. Applied at
// send time on every chat surface (lesson chat, group chat, org chat) so it
// can't be bypassed by picking a different thread type. Deliberately a
// heuristic, not a perfect filter, tuned to two distinct phone shapes
// rather than "any 7+ digits" (which flagged lesson times, dates, prices,
// order numbers - ordinary numbers in ordinary sentences):
//   1. Punctuated groups (555-123-4567, 555.123.4567, +234 803 123 4567) -
//      the group/separator pattern itself is distinctly phone-shaped, no
//      other kind of number in normal chat is written that way.
//   2. A bare run of 9+ digits with no separators at all - long enough
//      that a date (8 digits, YYYYMMDD), a price, or an order/reference
//      number essentially never reaches it, while an unformatted phone
//      number (most are 10-13 digits) still does.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_FORMATTED_RE = /(?:\+?\d{1,3}[\s.-])?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}\b/;
const PHONE_BARE_RE = /\d{9,15}/;
function containsContactInfo(text) {
  if (!text) return false;
  if (EMAIL_RE.test(text)) return true;
  if (PHONE_FORMATTED_RE.test(text)) return true;
  if (PHONE_BARE_RE.test(text)) return true;
  return false;
}

// Shared by every chat-send route (lesson chat and every org-chat surface)
// so a poll's shape only ever needs validating in one place.
function validatePollInput(poll) {
  if (!poll) return { poll: null, error: null };
  const question = String(poll.question || '').trim();
  const options = Array.isArray(poll.options) ? poll.options.map((o) => String(o || '').trim()).filter(Boolean) : [];
  if (!question || options.length < 2 || options.length > 6) {
    return { poll: null, error: 'A poll needs a question and between 2 and 6 options.' };
  }
  return { poll: { question, options }, error: null };
}

function validateLocationInput(location) {
  if (!location) return { location: null, error: null };
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { location: null, error: 'A valid location is required.' };
  return { location: { lat, lng }, error: null };
}

// Used for post-recorded online classes, physical/studio lesson recordings,
// and video-library clips - all the same "upload a video file" shape.
const videoUpload = multer({
  storage: diskOrMemoryStorage(VIDEO_UPLOAD_DIR),
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
  storage: diskOrMemoryStorage(CHAT_UPLOAD_DIR),
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
  storage: diskOrMemoryStorage(CERT_UPLOAD_DIR),
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
  storage: diskOrMemoryStorage(PHOTO_UPLOAD_DIR),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Please upload an image file.'));
    cb(null, true);
  },
});

const PRODUCT_IMAGE_UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads', 'products');
fs.mkdirSync(PRODUCT_IMAGE_UPLOAD_DIR, { recursive: true });

// Store product cover/gallery photos, uploaded one at a time from the admin
// product form (cover image + any number of extra images).
const productImageUpload = multer({
  storage: diskOrMemoryStorage(PRODUCT_IMAGE_UPLOAD_DIR),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Please upload an image file.'));
    cb(null, true);
  },
});

const PERFORMER_VIDEO_UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads', 'performer-videos');
fs.mkdirSync(PERFORMER_VIDEO_UPLOAD_DIR, { recursive: true });

// Performer portfolio video clips. Reachable pre-approval (requireAuthApi
// only, like the photo/certificate uploads), unlike the tutor videoUpload
// instance whose every call site is gated behind requireApprovedTutorApi -
// exposing that 500MB/already-vetted-only instance at a much lower trust
// bar would be a worse abuse surface, so this gets its own smaller instance.
const performerVideoUpload = multer({
  storage: diskOrMemoryStorage(PERFORMER_VIDEO_UPLOAD_DIR),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB - short performer clips, not full lesson recordings
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) return cb(new Error('Please upload a video file.'));
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
  '/orientation.html', '/tutor-evaluation.html', '/notifications.html',
  '/chat.html', '/library.html', '/messages.html', '/store-profile.html',
  '/order-confirmation.html', '/become-performer.html', '/performance-requests.html',
  '/my-organization.html', '/sponsor-dashboard.html',
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
  const user = store.findById(req.session.userId);
  // A primary owner can intentionally open their Country Admin console. The
  // client signal can only narrow that owner's real permissions (and only
  // when a country scope exists); it can never grant a non-admin anything.
  if (user && req.get('X-Mozart-Admin-View') === 'country' && user.adminCountryCode) {
    return { ...user, forceCountryAdminScope: true };
  }
  return user;
}

// expo-file-system's native uploadAsync (mobile/src/utils/uploadFile.ts)
// doesn't share this app's cookie jar the way fetch() does - it builds its
// own OkHttp client with a fresh, never-populated ReactCookieJarContainer,
// so every upload from it arrives with no session cookie at all and would
// otherwise always fail with "You must be signed in" despite the user
// genuinely being logged in. A short-lived, single-use token - minted
// through a normal (cookie-authenticated) API call right before the
// upload starts, then passed back as a query param on the upload request
// itself - substitutes for the missing cookie on exactly these routes.
const uploadTokens = new Map(); // token -> { userId, expiresAt }
const UPLOAD_TOKEN_TTL_MS = 2 * 60 * 1000;

function hydrateUploadToken(req, res, next) {
  if (!req.session || !req.session.userId) {
    const token = req.query.uploadToken;
    if (token) {
      const entry = uploadTokens.get(token);
      if (entry && entry.expiresAt > Date.now()) {
        uploadTokens.delete(token);
        req.session = req.session || {};
        req.session.userId = entry.userId;
      }
    }
  }
  next();
}

app.post('/api/uploads/token', requireAuthApi, (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  uploadTokens.set(token, { userId: currentUser(req).id, expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS });
  res.json({ success: true, token });
});

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

function requirePerformerProfilePage(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  const profile = performers.findByUserId(user.id);
  if (!profile) {
    return res.redirect('/become-performer');
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

// Any signed-up user with a performer profile, approved or not - mirrors
// requireTutorProfileApi for pre-approval/pre-activation routes.
function requirePerformerProfileApi(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'You must be signed in.' });
  const profile = performers.findByUserId(user.id);
  if (!profile) return res.status(403).json({ success: false, error: 'No performer application on file.' });
  req.performerProfile = profile;
  next();
}

// Mirrors requireApprovedTutorApi, plus the one-time activation fee -
// performers have no grandfathered population (this feature is brand new),
// so the fee check is live from day one, unlike the tutor gate below.
function requireApprovedPerformerApi(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'You must be signed in.' });
  const profile = performers.findByUserId(user.id);
  if (!profile || profile.status !== 'approved' || profile.suspended) {
    return res.status(403).json({ success: false, error: 'Approved performer access required.' });
  }
  if (!profile.activationPaid) {
    return res.status(402).json({ success: false, error: 'A one-time activation fee is required to access your performer dashboard.', code: 'activation_required' });
  }
  req.performerProfile = profile;
  next();
}

function availableProfileDisplayRoles(user, tutorProfile, performerProfile, org, tutorMemberships, studentMemberships) {
  const roles = [{ key: 'student', label: 'Student' }];
  if (tutorProfile && tutorProfile.status === 'approved') roles.push({ key: 'tutor', label: 'Tutor' });
  if (performerProfile && performerProfile.status === 'approved') roles.push({ key: 'performer', label: 'Performer' });
  for (const membership of tutorMemberships) roles.push({ key: `org_tutor:${membership.id}`, label: `Org Tutor · ${membership.name || 'Organization'}` });
  for (const membership of studentMemberships) roles.push({ key: `org_student:${membership.id}`, label: `Org Student · ${membership.name || 'Organization'}` });
  if (org && org.status === 'approved') {
    roles.push({ key: 'organization', label: org.sponsorType === 'ngo' ? 'Organization' : 'Sponsor' });
  }
  if (user.role === 'admin') {
    if (isPrimaryAdmin(user)) roles.push({ key: 'main_admin', label: 'Main Admin' });
    if (user.adminCountryCode) roles.push({ key: 'country_admin', label: 'Country Admin' });
    if (!isPrimaryAdmin(user) && !user.adminCountryCode) roles.push({ key: 'admin', label: 'Admin' });
  }
  if (user.supportAgent || user.role === 'support_agent') roles.push({ key: 'support_agent', label: 'Support Agent' });
  if (user.role === 'demo') roles.push({ key: 'demo', label: 'Demo' });
  return roles;
}

function publicUser(user) {
  const tutorProfile = tutors.findByUserId(user.id);
  const performerProfile = performers.findByUserId(user.id);
  const org = organizations.findByUserId(user.id);
  const hasSponsorOrg = Boolean(org && org.status === 'approved');
  const memberships = user.organizationMemberships || (user.sponsor ? [user.sponsor] : []);
  const hasSponsorAccess = Boolean(memberships.length || hasSponsorOrg);
  // Which of those organizations this account holds a *tutor* code for
  // (org.members' own per-membership role, not the user-level
  // organizationMemberships list, which isn't role-tagged) - lets the
  // Profile menu show one real "<Org name> Tutor" row per organization a
  // tutor has redeemed a code for, instead of one generic destination.
  const organizationTutorMemberships = tutorProfile
    ? organizationMembershipsForUser(user)
        .filter((o) => (o.members || []).some((m) => Number(m.studentId) === Number(user.id) && m.role === 'tutor'))
        .map((o) => ({ id: o.id, name: o.name || o.contactName }))
    : [];
  // A student linked to an NGO/Institution (not an Individual Sponsor - a
  // different relationship, see become-sponsor.html's own form split) gets
  // its own "<Org name> Student" row in Profile, the same way a linked
  // tutor gets "<Org name> Tutor" above - independent of it, since the same
  // account could hold both relationships to different organizations.
  const organizationStudentMemberships = organizationMembershipsForUser(user)
    .filter((o) => o.sponsorType === 'ngo' && (o.members || []).some((m) => Number(m.studentId) === Number(user.id) && m.role !== 'tutor'))
    .map((o) => ({ id: o.id, name: o.name || o.contactName }));
  const displayRoles = availableProfileDisplayRoles(user, tutorProfile, performerProfile, org, organizationTutorMemberships, organizationStudentMemberships);
  const displayRoleKey = displayRoles.some((role) => role.key === user.profileDisplayRoleKey) ? user.profileDisplayRoleKey : 'student';
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    displayRoles,
    displayRoleKey,
    // Country Admin (scoped to one country) and Main Admin (supersedes
    // every country restriction) are two different destinations on
    // Profile, not one generic "Admin" row - an account can hold both at
    // once (isPrimaryAdmin here doesn't require adminCountryCode to be
    // unset, just that this account's email is on the owner allowlist).
    adminCountryCode: user.adminCountryCode || null,
    // Resolved once here (same curated list resolveRegionFilter itself
    // reads) so the mobile app can show a real country name/flag without
    // needing its own copy of the country database.
    adminCountryName: user.adminCountryCode && geo.COUNTRY_CURRENCY[user.adminCountryCode] ? geo.COUNTRY_CURRENCY[user.adminCountryCode].name : null,
    isPrimaryAdmin: isPrimaryAdmin(user),
    supportAgent: Boolean(user.supportAgent || user.role === 'support_agent'),
    countryCode: user.countryCode || null,
    photoUrl: user.photoUrl || (tutorProfile && tutorProfile.photoUrl) || null,
    hasTutorProfile: Boolean(tutorProfile),
    tutorProfileId: tutorProfile ? tutorProfile.id : null,
    tutorStatus: tutorProfile ? tutorProfile.status : null,
    // Gates the mandatory Tutor Orientation modal - true exactly once, the
    // first time an approved tutor's own dashboard would otherwise be
    // reachable, until they tap "I Understand & Agree" on its final screen.
    // Distinct from the existing orientationCompleted/orientation-posts
    // system (data/tutors.js's apply()) - that's an unrelated admin content
    // feed + quiz, not this onboarding gate.
    needsTutorOrientation: Boolean(tutorProfile && tutorProfile.status === 'approved' && !tutorProfile.tutorOrientationAcceptedAt),
    isSuperTutor: Boolean(tutorProfile && tutors.isSuperTutor(tutorProfile)),
    hasPerformerProfile: Boolean(performerProfile),
    performerProfileId: performerProfile ? performerProfile.id : null,
    performerStatus: performerProfile ? performerProfile.status : null,
    isSuperArtist: Boolean(performerProfile && performers.isSuperArtist(performerProfile)),
    // Mirrors needsTutorOrientation above, for the Performer Orientation modal.
    needsPerformerOrientation: Boolean(performerProfile && performerProfile.status === 'approved' && !performerProfile.performerOrientationAcceptedAt),
    sponsor: user.sponsor || null,
    organizationMemberships: memberships,
    hasSponsorOrg,
    hasSponsorAccess,
    // The account's own sponsor organization application status (Individual
    // Sponsor or NGO/Institution) - null until they've actually applied, so
    // the Dashboard's RoleStatusBanner can show the same pending/approved/
    // rejected treatment tutor/performer applications already get.
    sponsorOrgStatus: org ? org.status : null,
    // The owned org's own kind ('individual' or 'ngo') - lets Profile show
    // the right ONE destination for the account's single owned org: "Sponsor
    // Dashboard" for an Individual Sponsor, "Organization Dashboard" (its
    // own separate mode/tabs, not a relabeled Sponsor Dashboard) for an
    // NGO/Institution.
    sponsorOrgType: org ? org.sponsorType || null : null,
    // Only meaningful when sponsorOrgType is 'ngo' - which of the two forms
    // an NGO/Institution filled in on the application decides whether the
    // Organization Dashboard itself is labeled "NGO Dashboard" or
    // "Institution Dashboard", not a generic "Organization Dashboard".
    sponsorOrgKind: org ? org.organizationType || null : null,
    // The org's own registered/approved name - Profile labels the
    // Organization Dashboard row with this (e.g. "Slum2School Dashboard")
    // instead of the generic "NGO Dashboard"/"Institution Dashboard".
    sponsorOrgName: org ? (org.name || org.contactName || null) : null,
    organizationTutorMemberships,
    organizationStudentMemberships,
    // Gates the mobile app's first-run feature walkthrough (OnboardingScreen,
    // shown post-login rather than the copy of it AuthStack shows before
    // sign-in). Defaults true for every account, including ones that existed
    // before this field did (undefined !== false) - the app was mid-build
    // when this was added and every existing user should see the walkthrough
    // at least once too, not just newly-created accounts. Web ignores this;
    // there's no equivalent walkthrough there.
    needsAppOnboarding: user.needsAppOnboarding !== false,
    // Which per-dashboard coachmark tours (student home, tutor home, Find a
    // Tutor, etc.) this account has already clicked through - see
    // markTourSeen. Empty for every existing account until each screen's
    // tour is actually reached and finished.
    seenTours: user.seenTours || [],
  };
}

function organizationMembershipsForUser(user) {
  const memberships = user.organizationMemberships || (user.sponsor ? [user.sponsor] : []);
  return memberships.map((membership) => organizations.findById(membership.orgId)).filter((org) => org && org.status === 'approved' && (org.members || []).some((member) => Number(member.studentId) === Number(user.id)));
}

// Resolves which organization a request should act within: the org's own
// login gets full access (unchanged, existing behavior); a tutor or student
// who redeemed that org's access code falls back to membership, for the
// read-mostly, member-scoped routes below (library viewing, classroom group
// chat) - org-content management (create/edit/delete library items,
// folders, monthly amount, etc.) stays owner-only and does not use this.
function resolveOrgForUser(user) {
  const owned = organizations.findByUserId(user.id);
  if (owned) return owned;
  const memberships = organizationMembershipsForUser(user);
  return memberships[0] || null;
}

// The single access-check behind every generic /api/org-chat/... route
// (edit/delete/react/pin/set-meeting-link) - resolves whether the caller is
// the org itself, a tutor participant, or a student participant of this one
// conversation, without the route needing to know which surface (org
// dashboard, group chat, student's "my org" page, tutor's org panel) is
// calling. Tutor participants are keyed by tutor PROFILE id (matching how
// org-chat conversations already store them, e.g. server.js:3330), student
// participants by their user id.
// preferredRole exists for the (real) case where one account holds more
// than one relationship to the same conversation - it owns the org AND
// also has its own tutor profile linked to it. Without a hint, a message
// sent from Org Tutor mode would still resolve as role 'org' (checked
// first below) and never mark readByTutor true on its own message,
// making every message that account sends show up as unread for the
// tutor side. The caller passes whichever mode it's actually in
// (RoleModeContext) so the right side of a shared identity gets credited;
// unset (or a role that doesn't actually apply here) falls back to the
// original org > tutor > student priority.
function resolveOrgChatAccess(user, conversationId, preferredRole) {
  const conversation = orgChat.findById(conversationId);
  if (!conversation) return null;
  const org = organizations.findByUserId(user.id);
  const tutorProfile = tutors.findByUserId(user.id);
  const candidates = [];
  if (org && org.id === conversation.orgId) {
    candidates.push({ conversation, role: 'org', participantId: org.id, participantName: org.name || org.contactName });
  }
  if (tutorProfile && conversation.participants.some((p) => p.type === 'tutor' && Number(p.id) === tutorProfile.id)) {
    candidates.push({ conversation, role: 'tutor', participantId: tutorProfile.id, participantName: tutorProfile.name });
  }
  if (conversation.participants.some((p) => p.type === 'student' && Number(p.id) === user.id)) {
    candidates.push({ conversation, role: 'student', participantId: user.id, participantName: user.name });
  }
  if (!candidates.length) return null;
  if (preferredRole) {
    const preferred = candidates.find((c) => c.role === preferredRole);
    if (preferred) return preferred;
  }
  return candidates[0];
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

function tutorCountryName(tutor) {
  if (tutor && tutor.locality && tutor.locality.country) {
    return String(tutor.locality.country).trim();
  }
  const text = tutor && (tutor.address || tutor.city || '');
  if (!text) return null;
  const value = String(text).trim();
  if (!value) return null;
  if (/nigeria/i.test(value)) return 'Nigeria';
  if (/ghana/i.test(value)) return 'Ghana';
  if (/canada/i.test(value)) return 'Canada';
  if (/united kingdom|uk|england|scotland|wales|northern ireland/i.test(value)) return 'United Kingdom';
  if (/united states|usa|america/i.test(value)) return 'United States';
  return null;
}

function inViewerCountry(tutor, viewerCountryName) {
  const tutorCountry = tutorCountryName(tutor);
  // Missing legacy location data should not hide an otherwise approved tutor.
  // Once both countries are known, keep the country boundary enforced.
  return !tutorCountry || !viewerCountryName || sameCountry(tutorCountry, viewerCountryName);
}

// Same precedence both /api/orientation and /api/orientation/posts use to
// pick whose orientation a signed-in account sees - resolved from the
// account itself, not the current RoleModeContext mode, matching
// orientation-hub.html's own server-driven behavior. Tutor is checked
// before sponsor: an approved tutor who also redeemed an organization code
// (Organization Tutor) still gets their tutor orientation/questionnaire,
// not the plain "sponsored student" bucket - "sponsor" here means a
// student whose access is funded by an org, not a tutor with org access.
function resolveOrientationAudience(user) {
  return user.role === 'admin'
    ? 'admin'
    : user.role === 'support_agent'
      ? 'support_agent'
      : organizations.findByUserId(user.id)
        ? 'organization'
        : tutors.findByUserId(user.id)
          ? 'tutor'
          : user.sponsor
            ? 'sponsor'
            : 'student';
}

// Every real user account whose resolveOrientationAudience() resolves to
// the given audience - used to fan out a notification to everyone a new
// orientation post targets.
function usersForOrientationAudience(audience) {
  return store.listUsers().filter((u) => resolveOrientationAudience(u) === audience);
}

// A post has a quiz iff questions were attached to it via the
// 'orientation-post' assessments key. Shared by /api/orientation/status,
// the withdrawal gate below, and the quiz submit route so "does this post
// need a pass, or just a Finished tap" is decided the same way everywhere.
function orientationPostQuestions(postId) {
  return assessments.getQuestionsForAdmin('orientation-post', String(postId));
}

// Every required post targeted at `user`'s own resolved audience, with
// this user's completion state layered on - the single source of truth
// for both /api/orientation/status and the tutor withdrawal gate.
function requiredOrientationStatus(user) {
  const audience = resolveOrientationAudience(user);
  const required = orientation.list(audience).filter((p) => p.required);
  const posts = required.map((post) => {
    const questions = orientationPostQuestions(post.id);
    const hasQuiz = questions.length > 0;
    const progress = orientationProgress.getProgress(user.id, post.id);
    const done = orientationProgress.isPostDone(user.id, post, hasQuiz);
    return {
      id: post.id,
      title: post.title,
      hasQuiz,
      finished: Boolean(progress && progress.finishedAt),
      passed: Boolean(progress && progress.passed),
      attempts: (progress && progress.attempts) || 0,
      bestScore: (progress && progress.bestScore) || 0,
      done,
    };
  });
  return { audience, posts, blocked: posts.some((p) => !p.done) };
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
  // The platform owner(s) must keep access to every account even after a
  // country is selected on their profile - Country administrators otherwise
  // stay limited to their own country. PRIMARY_ADMIN_EMAIL accepts a
  // comma-separated list so more than one account can hold unrestricted
  // "Main Admin" access at once, not just a single hardcoded owner.
  const ownerEmails = String(process.env.PRIMARY_ADMIN_EMAIL || 'mozarttechniques@gmail.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(user && !user.forceCountryAdminScope && user.role === 'admin' && (!user.adminCountryCode || ownerEmails.includes(String(user.email || '').trim().toLowerCase())));
}

// Sent alongside web push (see sendPushNotifications below) - `channelId`
// routes to the Android notification channel the app creates on launch,
// and `threadId` is what makes iOS stack multiple notifications from this
// app into one expandable group instead of a separate banner each time
// (Android does the equivalent automatically once an app has a few
// un-grouped notifications showing, no extra field needed there). No
// `tag` is set on purpose - that field *replaces* a previously-shown
// notification instead of accumulating alongside it, which is the
// opposite of what "notifications stacking under the first" means.
const EXPO_PUSH_THREAD_ID = 'mozart-notifications';

async function sendExpoPushNotifications(user, pending) {
  const tokens = user.expoPushTokens || [];
  if (!tokens.length || !pending.length) return;
  // Sent so the app-icon badge is right even if the app never opens to
  // trigger the client's own foreground badge sync (NotificationsContext) -
  // this is the count *after* the notifications this send delivers arrive.
  const badgeCount = (user.notifications || []).filter((item) => !item.read).length;
  const messages = [];
  tokens.forEach((token) => {
    pending.forEach((notification) => {
      messages.push({
        to: token,
        title: 'Mozart Techniques',
        body: notification.message,
        sound: 'default',
        channelId: 'default',
        threadId: EXPO_PUSH_THREAD_ID,
        badge: badgeCount,
        data: { href: notification.href },
      });
    });
  });
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const data = await response.json().catch(() => null);
    // A token Expo reports as no longer registered (app uninstalled, etc.)
    // is pruned so future sends don't keep retrying it.
    const invalidTokens = new Set();
    if (data && Array.isArray(data.data)) {
      data.data.forEach((ticket, index) => {
        if (ticket && ticket.status === 'error' && ticket.details && ticket.details.error === 'DeviceNotRegistered') {
          invalidTokens.add(messages[index].to);
        }
      });
    }
    if (invalidTokens.size) {
      const refreshed = store.findById(user.id);
      if (refreshed) refreshed.expoPushTokens = (refreshed.expoPushTokens || []).filter((token) => !invalidTokens.has(token));
    }
  } catch {
    // Best-effort, same as the web-push loop below - a failed send here
    // doesn't retry, matching the existing behavior for web subscriptions.
  }
}

async function sendPushNotifications(user) {
  if (!user) return;
  const pending = (user.notifications || []).filter((item) => item.pushPending).slice(0, 10);
  if (!pending.length) return;
  const hasWebPush = VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && (user.pushSubscriptions || []).length;
  const hasExpoPush = (user.expoPushTokens || []).length;
  if (!hasWebPush && !hasExpoPush) return;

  if (hasWebPush) {
    const active = [];
    for (const subscription of user.pushSubscriptions) {
      try {
        for (const notification of pending) await webpush.sendNotification(subscription, JSON.stringify({ title: 'Mozart Techniques', body: notification.message, icon: '/mozartLogo.jpg', data: { href: notification.href } }));
        active.push(subscription);
      }
      catch (error) { if (error.statusCode !== 404 && error.statusCode !== 410) active.push(subscription); }
    }
    if (active.length !== (user.pushSubscriptions || []).length) {
      const refreshed = store.findById(user.id);
      if (refreshed) refreshed.pushSubscriptions = active;
    }
  }

  if (hasExpoPush) await sendExpoPushNotifications(user, pending);

  pending.forEach((notification) => store.clearPushPending(user.id, notification.id));
}

setInterval(() => store.listUsers().filter((user) => ((user.pushSubscriptions || []).length || (user.expoPushTokens || []).length) && (user.notifications || []).some((item) => item.pushPending)).forEach((user) => sendPushNotifications(user).catch(() => {})), 5000);

// user.countryCode (IP-detected at signup) is the fast path, but it's only
// ever set on the plain /api/signup flow - Google sign-up never sets it (see
// /api/auth/google), and plenty of real accounts predate/skip it - so for
// most tutors and performers this fell through to nothing, which is why a
// Country Admin was seeing empty tutor/user lists for their own country
// instead of the real, full set. Falls through to whichever profile this
// account actually has a geocoded locality on (student/tutor/performer),
// converting the country NAME each of those stores (locality.country, e.g.
// "Nigeria") to the ISO code canManageUser compares against - the same
// conversion countryForOrganization already does for organizations.
function countryForUser(user) {
  if (!user) return null;
  if (user.countryCode) return user.countryCode;
  const studentCountryName = user.studentProfile && user.studentProfile.locality && user.studentProfile.locality.country;
  if (studentCountryName) return geo.countryCodeForName(studentCountryName);
  const tutorProfile = tutors.findByUserId(user.id);
  if (tutorProfile && tutorProfile.locality && tutorProfile.locality.country) return geo.countryCodeForName(tutorProfile.locality.country);
  const performerProfile = performers.findByUserId(user.id);
  if (performerProfile && performerProfile.locality && performerProfile.locality.country) return geo.countryCodeForName(performerProfile.locality.country);
  return null;
}

function canManageUser(admin, user) {
  return isPrimaryAdmin(admin) || Boolean(admin && admin.adminCountryCode && admin.adminCountryCode === countryForUser(user));
}

// A Country Admin is a local moderator, never a peer administrator. Keep
// privileged accounts out of both their list and their mutation surface even
// if one happens to share the same country code.
function canCountryAdminViewUser(admin, user) {
  if (!canManageUser(admin, user)) return false;
  return isPrimaryAdmin(admin) || !['admin', 'demo', 'country_admin'].includes(user && user.role);
}

function countryForOrganization(organization) {
  const countryName = organization && organization.locality && organization.locality.country;
  return countryName ? geo.countryCodeForName(countryName) : null;
}

function canManageOrganization(admin, organization) {
  return isPrimaryAdmin(admin) || Boolean(
    admin && admin.adminCountryCode && admin.adminCountryCode === countryForOrganization(organization),
  );
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

// The reset flow is now OTP-based (a 6-digit code entered by hand, see
// forgot-password.html) instead of a clickable link with a token in the
// URL, so there's no more standalone token-bearing link to land on -
// redirect anyone with an old bookmarked link to the flow that replaced it.
app.get('/reset-password', (req, res) => {
  res.redirect('/forgot-password');
});

app.get('/dashboard', requireAuthPage, (req, res) => {
  const user = currentUser(req);
  if (user && user.role !== 'admin') {
    const org = organizations.findByUserId(user.id);
    if (org && org.status === 'approved') {
      return res.redirect(org.sponsorType === 'individual' ? '/sponsor-dashboard' : `/${organizationSlug(org.name || org.contactName)}`);
    }
  }
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get('/notifications', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'notifications.html'));
});
app.get('/notifications.html', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'notifications.html'));
});

app.get(/^\/dashboard(\/.*)?$/, requireAuthPage, (req, res) => {
  const user = currentUser(req);
  if (user && user.role !== 'admin') {
    const org = organizations.findByUserId(user.id);
    if (org && org.status === 'approved') {
      return res.redirect(org.sponsorType === 'individual' ? '/sponsor-dashboard' : `/${organizationSlug(org.name || org.contactName)}`);
    }
  }
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get('/ngo-dashboard', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'ngo-dashboard.html'));
});

function organizationSlug(value) {
  return String(value || 'organization').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'organization';
}

// NGO dashboards use the organization's readable name as their URL while
// retaining /ngo-dashboard for existing bookmarks and integrations.
app.get(/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/, requireAuthPage, (req, res, next) => {
  const user = currentUser(req);
  const org = user && organizations.findByUserId(user.id);
  const requestedSlug = req.path.slice(1);
  if (org && org.sponsorType === 'ngo' && org.status === 'approved' && organizationSlug(org.name || org.contactName) === requestedSlug) {
    return res.sendFile(path.join(PUBLIC_DIR, 'ngo-dashboard.html'));
  }
  next();
});

app.get('/sponsor-dashboard', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'sponsor-dashboard.html'));
});

app.get('/my-organization', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'my-organization.html'));
});

// Organization student pages use the organization's readable name in the
// URL, while the page still resolves the actual organization from the signed-in
// student's membership. Keep the legacy route above for existing bookmarks.
app.get(/^\/[a-z0-9]+(?:-[a-z0-9]+)*-student$/, requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'my-organization.html'));
});

app.get('/edit-profile', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'edit-profile.html'));
});

// Full-page account menu - what the avatar in the header links to (see
// nav-auth.js), replacing what used to be a dropdown so the web app has the
// same dedicated Profile destination the mobile app does.
app.get('/profile', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'profile.html'));
});

app.get('/payment-methods', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'payment-methods.html'));
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

app.get('/tutor/my-profile', requireTutorProfilePage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'edit-profile.html'));
});

app.get('/org-tutor', requireTutorProfilePage, (req, res) => {
  const user = currentUser(req);
  if (!organizationMembershipsForUser(user).length) return res.redirect('/tutor');
  res.sendFile(path.join(PUBLIC_DIR, 'org-tutor.html'));
});

app.get('/tutor-dashboard.html', requireTutorProfilePage, (req, res) => {
  res.redirect(currentUser(req).sponsor ? '/org-tutor' : '/tutor');
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

// --- Performance Marketplace pages (mirror the tutor page routes above) ---

app.get('/become-performer', requireAuthPage, (req, res) => {
  const user = currentUser(req);
  if (user && performers.findByUserId(user.id)) {
    return res.redirect('/performer');
  }
  res.sendFile(path.join(PUBLIC_DIR, 'become-performer.html'));
});

app.get('/performer', requirePerformerProfilePage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'performer.html'));
});

app.get('/performer/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'performer.html'));
});

// Publicly browsable - no login required, matches /find-tutor's posture.
app.get('/find-performer', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'find-performer.html'));
});

app.get('/performers/:id', (req, res) => {
  const performer = performers.findBySlug(req.params.id);
  if (!performer || performer.status !== 'approved' || performer.suspended) return res.redirect('/find-performer');
  const slug = performers.publicSlug(performer);
  if (req.params.id !== slug) return res.redirect(302, `/performers/${encodeURIComponent(slug)}`);
  res.sendFile(path.join(PUBLIC_DIR, 'performer.html'));
});

// A requester's own posted event requests and the offers/responses on them.
app.get('/performance-requests', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'performance-requests.html'));
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
app.get('/messages/chat', requireAuthPage, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'chat.html')));
app.get('/messages/group', requireAuthPage, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'group-chat.html')));
app.get('/messages/group/:id', requireAuthPage, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'group-chat.html')));
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
app.get('/teacher-education', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'teacher-education.html'));
});
app.get('/library/:id', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'library.html'));
});
app.get('/schedule', requireAuthPage, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'schedule.html'));
});

// Existing accounts never get a mobile-flavored welcome email at signup
// time - they signed up on the web, sometimes years before the app existed.
// This sends that same email once, the first time such an account is used
// from the app (any login route, password or Google), so every user
// encountering the app gets the same orientation a brand-new mobile signup
// already gets - not on every login, just the first one.
function maybeSendMobileReturnEmail(user, req) {
  if (req.get('X-Mozart-Client') !== 'mobile' || user.mobileWelcomeEmailSentAt) return;
  mailer.sendWelcomeEmail(user, true).catch((err) => console.error('Mobile return email failed:', err.message));
  store.markMobileWelcomeEmailSent(user.id);
}

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
  // Fire-and-forget - sendWelcomeEmail/sendMail already catch and log their
  // own errors, so a slow or misconfigured mail server can never delay or
  // fail this response, and registration always succeeds regardless.
  const isMobileSignup = req.get('X-Mozart-Client') === 'mobile';
  mailer.sendWelcomeEmail(user, isMobileSignup).catch((err) => console.error('Welcome email failed:', err.message));
  // Prevents maybeSendMobileReturnEmail from sending a second, near-
  // identical email the moment this same account next logs into the app.
  if (isMobileSignup) store.markMobileWelcomeEmailSent(user.id);

  res.json({ success: true, user: publicUser(user) });
});

// The footer newsletter form on every public page (public/assets/
// footer.js) - no login required, just an email address. Idempotent
// (resubscribing is a success, not an error) and always tries to send the
// confirmation email regardless of whether this address was already on
// the list, so re-submitting still gets you a fresh "you're subscribed"
// email if the first one got lost.
app.post('/api/newsletter/subscribe', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
  }
  const { alreadySubscribed } = newsletter.subscribe(email);
  mailer.sendNewsletterConfirmationEmail(email).catch((err) => console.error('Newsletter confirmation email failed:', err.message));
  res.json({ success: true, alreadySubscribed });
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
  maybeSendMobileReturnEmail(user, req);
  res.json({ success: true, user: publicUser(user) });
});

app.get('/api/config', (req, res) => {
  res.json({ success: true, googleClientId: GOOGLE_CLIENT_ID });
});

// Emails a 6-digit OTP (data/store.js's createResetToken) via the same
// Gmail transporter the welcome email uses. Awaited here (unlike the
// welcome email) since the request's whole point is getting that code to
// the user - but sendMail() still never throws, so a failed send just
// comes back as sent:false rather than a 500. In non-production, the code
// also rides along in the response as devCode purely so local development
// keeps working without a real inbox to check - never present in prod.
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });

  const user = store.createResetToken(email);
  if (!user) {
    return res.status(404).json({ success: false, error: 'No account found with that email.' });
  }
  const { sent } = await mailer.sendPasswordResetEmail(user, user.resetToken);
  res.json({
    success: true,
    emailSent: sent,
    ...(process.env.NODE_ENV !== 'production' ? { devCode: user.resetToken } : {}),
  });
});

// Lets the client check a code on its own screen, before the person has
// even typed a new password yet - reuses findByResetToken's same lookup
// as reset-password below, just without consuming it (no password change
// happens here).
app.post('/api/auth/verify-reset-code', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: 'Reset code is required.' });
  if (!store.findByResetToken(token)) {
    return res.status(400).json({ success: false, error: 'This code is invalid or has expired.' });
  }
  res.json({ success: true });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'Reset code and new password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
  }
  if (!store.findByResetToken(token)) {
    return res.status(400).json({ success: false, error: 'This code is invalid or has expired.' });
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
      // Same first-time-registration event as the password signup route
      // above, just reached via Google instead - same reusable function,
      // same fire-and-forget guarantee.
      const isMobileSignup = req.get('X-Mozart-Client') === 'mobile';
      mailer.sendWelcomeEmail(user, isMobileSignup).catch((err) => console.error('Welcome email failed:', err.message));
      if (isMobileSignup) store.markMobileWelcomeEmailSent(user.id);
    }
  }

  req.session.userId = user.id;
  maybeSendMobileReturnEmail(user, req);
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

app.post('/api/mozart-ai/attachment', hydrateUploadToken, requireAuthApi, (req, res) => {
  chatUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Could not upload that file.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file first.' });
    const thread = supportChat.getOrCreate(currentUser(req));
    const attachment = { name: req.file.originalname, type: req.file.mimetype, size: req.file.size, url: await resolveUploadedFileUrl(req.file, 'chat') };
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
app.post('/api/support-agent/threads/:id/attachment', hydrateUploadToken, requireSupportAgentApi, (req, res) => {
  chatUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || 'Could not upload that file.' });
    const agent = currentUser(req); const thread = supportChat.findById(req.params.id);
    if (!thread) return res.status(404).json({ success: false, error: 'Support conversation not found.' });
    if (agent.role !== 'admin' && thread.assignedAgentId !== agent.id) return res.status(403).json({ success: false, error: 'Claim this conversation before sending a file.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file first.' });
    const attachment = { name: req.file.originalname, type: req.file.mimetype, size: req.file.size, url: await resolveUploadedFileUrl(req.file, 'chat') };
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
  // Also corrects the account's own countryCode, not just this session -
  // countryCode is set once at signup from an IP-based guess (server.js's
  // /api/signup), which mobile-carrier/VPN IPs can easily get wrong and
  // nothing else ever revisits. Without this, a real GPS fix here only
  // lasts until the next login, since a fresh session has no gpsCountry of
  // its own and resolveCountryCode falls straight back to that same stale
  // stored code.
  if (req.session && req.session.userId) {
    const code = geo.countryCodeForName(resolved.country);
    if (code) store.setCountry(req.session.userId, code);
  }
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

// Display preference only: this badge never changes permissions or account roles.
app.post('/api/profile/display-role', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const roleKey = String((req.body && req.body.roleKey) || '');
  const allowed = publicUser(user).displayRoles;
  if (!allowed.some((role) => role.key === roleKey)) {
    return res.status(400).json({ success: false, error: 'That role is not available on your account.' });
  }
  const updated = store.setProfileDisplayRole(user.id, roleKey);
  res.json({ success: true, user: publicUser(updated) });
});

app.post('/api/profile/photo', hydrateUploadToken, requireAuthApi, photoUpload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }
  const user = currentUser(req);
  const photoPath = await resolveUploadedFileUrl(req.file, 'photos');
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

app.get('/api/payment-method', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  const mode = stripeClient.getMode();
  if (!client || !mode) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  const user = currentUser(req);
  try {
    const profile = await stripePaymentProfile.resolveProfile(user, client, mode);
    res.json({ success: true, hasCard: Boolean(profile && profile.paymentMethodId), brand: profile && profile.brand || null, last4: profile && profile.last4 || null });
  } catch (error) {
    console.error('Could not load saved payment method:', error.message);
    res.status(502).json({ success: false, error: 'Could not check your saved card right now. Please try again.' });
  }
});

app.post('/api/payment-method/setup-intent', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  const mode = stripeClient.getMode();
  if (!client || !mode) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });

  const user = currentUser(req);
  try {
    const profile = await stripePaymentProfile.resolveProfile(user, client, mode, { createCustomer: true });
    const setupIntent = await client.setupIntents.create({
      customer: profile.customerId, usage: 'off_session', payment_method_types: ['card'],
    });
    res.json({ success: true, clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error('Could not start card setup:', err.message);
    res.status(502).json({ success: false, error: 'Could not start card setup. Please try again.' });
  }
});

app.post('/api/payment-method/confirm', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  const mode = stripeClient.getMode();
  if (!client || !mode) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });

  const { setupIntentId } = req.body || {};
  if (!setupIntentId) return res.status(400).json({ success: false, error: 'Missing setup intent.' });

  const user = currentUser(req);
  try {
    const setupIntent = await client.setupIntents.retrieve(setupIntentId);
    const profile = await stripePaymentProfile.resolveProfile(user, client, mode);
    if (setupIntent.status !== 'succeeded' || !profile || setupIntent.customer !== profile.customerId || setupIntent.livemode !== (mode === 'live')) {
      return res.status(400).json({ success: false, error: 'Card setup was not completed.' });
    }
    const paymentMethod = await client.paymentMethods.retrieve(setupIntent.payment_method);
    if (paymentMethod.customer !== profile.customerId) return res.status(400).json({ success: false, error: 'Card setup was not completed.' });
    const updated = store.setStripePaymentMethod(user.id, {
      mode, customerId: profile.customerId,
      paymentMethodId: paymentMethod.id,
      brand: paymentMethod.card ? paymentMethod.card.brand : null,
      last4: paymentMethod.card ? paymentMethod.card.last4 : null,
    });
    const saved = store.getStripePaymentMethod(updated, mode);
    res.json({ success: true, brand: saved.brand, last4: saved.last4 });
  } catch (err) {
    console.error('Could not confirm card setup:', err.message);
    res.status(502).json({ success: false, error: 'Could not confirm your card. Please try again.' });
  }
});

app.delete('/api/payment-method', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const client = stripeClient.getClient();
  const mode = stripeClient.getMode();
  if (!client || !mode) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  try {
    const profile = await stripePaymentProfile.resolveProfile(user, client, mode);
    if (profile && profile.paymentMethodId) await client.paymentMethods.detach(profile.paymentMethodId);
    store.clearStripePaymentMethod(user.id, mode);
    res.json({ success: true });
  } catch (error) {
    console.error('Could not remove saved card:', error.message);
    res.status(502).json({ success: false, error: 'Could not remove your card right now. Please try again.' });
  }
});

// Stripe-hosted card setup: replacing a card means saving a new card, then
// using its PaymentMethod for future approved lesson charges.
app.post('/api/payment-method/checkout', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  const mode = stripeClient.getMode();
  if (!client || !mode) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  const user = currentUser(req);
  try {
    const profile = await stripePaymentProfile.resolveProfile(user, client, mode, { createCustomer: true });
    const session = await client.checkout.sessions.create({
      mode: 'setup', currency: 'usd', payment_method_types: ['card'],
      managed_payments: { enabled: false },
      customer: profile.customerId, client_reference_id: String(user.id),
      success_url: `${publicAppUrl(req)}/api/payment-method/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicAppUrl(req)}/payment-methods?card=cancelled`,
      metadata: { type: 'save-card', userId: String(user.id) },
    });
    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Could not open Stripe card setup:', error.message);
    res.status(502).json({ success: false, error: 'Could not open Stripe card setup. Please try again.' });
  }
});

app.get('/api/payment-method/checkout-success', requireAuthPage, async (req, res) => {
  const client = stripeClient.getClient();
  const mode = stripeClient.getMode();
  const user = currentUser(req);
  if (!client || !mode || !req.query.session_id) return res.redirect('/payment-methods?card=error');
  try {
    const session = await client.checkout.sessions.retrieve(req.query.session_id);
    const profile = await stripePaymentProfile.resolveProfile(user, client, mode);
    if (session.mode !== 'setup' || session.status !== 'complete' || session.livemode !== (mode === 'live') ||
        session.client_reference_id !== String(user.id) || !profile || session.customer !== profile.customerId ||
        !session.setup_intent || !session.metadata || session.metadata.type !== 'save-card' ||
        session.metadata.userId !== String(user.id)) {
      return res.redirect('/payment-methods?card=error');
    }
    const setupIntent = await client.setupIntents.retrieve(session.setup_intent);
    if (setupIntent.status !== 'succeeded' || setupIntent.livemode !== (mode === 'live') ||
        setupIntent.customer !== profile.customerId || !setupIntent.payment_method) {
      return res.redirect('/payment-methods?card=error');
    }
    const paymentMethod = await client.paymentMethods.retrieve(setupIntent.payment_method);
    if (paymentMethod.customer !== profile.customerId) return res.redirect('/payment-methods?card=error');
    store.setStripePaymentMethod(user.id, {
      mode, customerId: profile.customerId, paymentMethodId: paymentMethod.id,
      brand: paymentMethod.card ? paymentMethod.card.brand : null,
      last4: paymentMethod.card ? paymentMethod.card.last4 : null,
    });
    return res.redirect('/payment-methods?card=saved');
  } catch (error) {
    console.error('Could not finish Stripe card setup:', error.message);
    return res.redirect('/payment-methods?card=error');
  }
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

// Only the signed-in user's saved coordinates; never part of the public roster.
app.get('/api/profile/map-origin', requireAuthApi, (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const user = currentUser(req);
  const profile = user.studentProfile || tutors.findByUserId(user.id) || {};
  const lat = Number(profile.lat), lng = Number(profile.lng);
  const valid = profile.lat != null && profile.lng != null && profile.lat !== '' && profile.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  res.json({ success: true, location: valid ? { lat, lng } : null });
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

app.get('/api/push/public-key', (req, res) => res.json({ success: Boolean(VAPID_PUBLIC_KEY), publicKey: VAPID_PUBLIC_KEY || null }));

app.post('/api/push/subscribe', requireAuthApi, (req, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(503).json({ success: false, error: 'Push notifications are not configured.' });
  const subscription = req.body && req.body.subscription;
  if (!subscription || !subscription.endpoint || !subscription.keys) return res.status(400).json({ success: false, error: 'Invalid push subscription.' });
  store.setPushSubscription(currentUser(req).id, subscription);
  res.json({ success: true });
});

app.delete('/api/push/subscribe', requireAuthApi, (req, res) => {
  store.removePushSubscription(currentUser(req).id, String(req.body && req.body.endpoint || ''));
  res.json({ success: true });
});

// Native (Expo) push token registration - mirrors the web subscribe/
// unsubscribe pair above, just with a flat token string instead of a
// subscription object.
app.post('/api/push/expo-token', requireAuthApi, (req, res) => {
  const token = req.body && req.body.token;
  if (!token || typeof token !== 'string') return res.status(400).json({ success: false, error: 'Invalid push token.' });
  store.setExpoPushToken(currentUser(req).id, token);
  res.json({ success: true });
});

app.delete('/api/push/expo-token', requireAuthApi, (req, res) => {
  store.removeExpoPushToken(currentUser(req).id, String(req.body && req.body.token || ''));
  res.json({ success: true });
});

// Dismisses the mobile app's first-run feature walkthrough for this
// account permanently (see publicUser's needsAppOnboarding) - called once
// it's finished or skipped, not on every screen of it.
app.post('/api/me/onboarding-complete', requireAuthApi, (req, res) => {
  const updated = store.markAppOnboardingSeen(currentUser(req).id);
  res.json({ success: true, user: publicUser(updated) });
});

// Marks one per-dashboard coachmark tour finished (see publicUser's
// seenTours) - :tourId is client-defined, not validated against a fixed
// list, since new tours get added on the client side over time.
app.post('/api/me/tours/:tourId/seen', requireAuthApi, (req, res) => {
  const updated = store.markTourSeen(currentUser(req).id, String(req.params.tourId));
  res.json({ success: true, user: publicUser(updated) });
});

app.post('/api/notifications/read-all', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const updated = store.markNotificationsRead(user.id);
  res.json({ success: true, notifications: updated.notifications || [] });
});

app.post('/api/notifications/:id/read', requireAuthApi, (req, res) => {
  const updated = store.markNotificationRead(currentUser(req).id, req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Notification not found.' });
  res.json({ success: true });
});

// Site-wide search across approved tutors - public, no login required.
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ success: true, tutors: [], videos: [] });

  const geoInfo = await getGeoInfo(req);
  const matchedTutors = tutors.listApproved().filter((t) => inViewerCountry(t, geoInfo.name) && (
    t.name.toLowerCase().includes(q)
    // Also resolves everyday terms like "singing"/"voice" to the Vocals
    // category (see data/searchSynonyms.js), not just an exact/substring
    // match against the taxonomy string itself.
    || matchesAnyCategory(t.categories, q)
    || (t.genres || []).some((g) => g.toLowerCase().includes(q))
    || (t.bio || '').toLowerCase().includes(q)
  )).slice(0, 12);

  const tutorResults = await Promise.all(matchedTutors.map(async (t) => ({
    id: t.id, name: t.name, categories: t.categories, city: t.city, teachesOnline: t.teachesOnline, photoUrl: t.photoUrl || null,
    bio: t.bio, hourlyRateUsd: t.hourlyRateUsd,
    hourlyRateLocal: Math.round((await currency.convertFromUsd(t.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
    currency: geoInfo.currency, symbol: geoInfo.symbol, avgRating: tutors.avgRating(t),
  })));

  const libraryUrlMatch = q.match(/[?&]item=([^&]+)/i);
  const librarySearchTerm = libraryUrlMatch ? decodeURIComponent(libraryUrlMatch[1]).toLowerCase() : q;
  const matchedVideos = reels.listActive()
    .filter((item) => {
      const ownerAllowed = (item.ownerScope || 'mozart') === 'mozart' || item.ownerScope === 'tutor';
      if (!ownerAllowed) return false;
      const searchText = [item.title, item.description, item.category, item.genre, librarySlug(item.title), item.url].filter(Boolean).join(' ').toLowerCase();
      return searchText.includes(q) || searchText.includes(librarySearchTerm) || categoryMatchesQuery(item.category, q) || categoryMatchesQuery(item.category, librarySearchTerm);
    })
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      category: item.category,
      genre: item.genre,
      url: item.url,
      isFile: Boolean(item.isFile),
      ownerScope: item.ownerScope || 'mozart',
      ownerName: item.ownerScope === 'tutor' ? (tutors.findByUserId(item.addedBy)?.name || 'Tutor') : 'Mozart Techniques',
    }));

  res.json({ success: true, tutors: tutorResults, videos: matchedVideos });
});

// --- POLLS: one-off admin-broadcast opinion polls (data/polls.js) ---
// Separate from Tutor/Performer Orientation (mandatory, one screen) and
// from Orientation Updates' quiz questions (graded, audience-scoped) - a
// poll has no correct answer and goes to every signed-in user once.
app.post('/api/admin/polls', requireAdminApi, (req, res) => {
  const { question, options } = req.body || {};
  const cleanQuestion = String(question || '').trim();
  const cleanOptions = Array.isArray(options) ? options.map((o) => String(o || '').trim()).filter(Boolean) : [];
  if (!cleanQuestion) return res.status(400).json({ success: false, error: 'Enter a question.' });
  if (cleanOptions.length < 2) return res.status(400).json({ success: false, error: 'Add at least 2 options.' });
  const poll = polls.create({ question: cleanQuestion, options: cleanOptions, createdByUserId: currentUser(req).id });
  res.json({ success: true, poll: polls.results(poll) });
});

app.get('/api/admin/polls', requireAdminApi, (req, res) => {
  res.json({ success: true, polls: polls.listAll().map(polls.results) });
});

app.post('/api/admin/polls/:id/close', requireAdminApi, (req, res) => {
  const poll = polls.close(req.params.id);
  if (!poll) return res.status(404).json({ success: false, error: 'Poll not found.' });
  res.json({ success: true, poll: polls.results(poll) });
});

app.delete('/api/admin/polls/:id', requireAdminApi, (req, res) => {
  const ok = polls.remove(req.params.id);
  if (!ok) return res.status(404).json({ success: false, error: 'Poll not found.' });
  res.json({ success: true });
});

// The next poll this user hasn't seen yet (question/options only - no
// counts, this is the respondent's view, not the admin's).
app.get('/api/polls/active', requireAuthApi, (req, res) => {
  const poll = polls.nextForUser(currentUser(req).id);
  if (!poll) return res.json({ success: true, poll: null });
  res.json({ success: true, poll: { id: poll.id, question: poll.question, options: poll.options } });
});

app.post('/api/polls/:id/respond', requireAuthApi, (req, res) => {
  const poll = polls.findById(req.params.id);
  if (!poll || !poll.active) return res.status(404).json({ success: false, error: 'Poll not found.' });
  const optionIndex = Number(req.body?.optionIndex);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
    return res.status(400).json({ success: false, error: 'Invalid option.' });
  }
  polls.respond(poll.id, currentUser(req).id, optionIndex);
  res.json({ success: true });
});

// Closed without answering - still marks it seen so it never shows again.
app.post('/api/polls/:id/dismiss', requireAuthApi, (req, res) => {
  const poll = polls.findById(req.params.id);
  if (!poll) return res.status(404).json({ success: false, error: 'Poll not found.' });
  polls.markSeen(poll.id, currentUser(req).id);
  res.json({ success: true });
});

// --- TEACHER EDUCATION: admin-assigned quizzes, the MT certification +
// external-credential portal, and the tier-equivalency engine. Tutor
// identity throughout is the tutor PROFILE id (tutors.findById), not the
// user id - same convention req.tutorProfile already uses everywhere else
// in this file. ---

// Part 0 - shown next to every tier reference on both the teacher portal
// and the admin console, per the spec's own instruction to answer "what
// can I teach at this tier" before anyone has to ask.
app.get('/api/teaching-tiers', (req, res) => {
  res.json({ success: true, tiers: teachingTiers.listAll() });
});

// --- Credential crosswalk (Part 3.3) ---
app.get('/api/credential-crosswalk', (req, res) => {
  const { q } = req.query;
  res.json({ success: true, rows: credentialCrosswalk.search(q) });
});
app.get('/api/admin/credential-crosswalk', requireAdminApi, (req, res) => {
  res.json({ success: true, rows: credentialCrosswalk.listAll({ activeOnly: false }), policyVersion: credentialCrosswalk.currentPolicyVersion() });
});
app.post('/api/admin/credential-crosswalk', requireAdminApi, (req, res) => {
  const { body, credentialName, credentialType, bodysOwnAnchor, disciplineScope, mtPoints, proposedTier, sourceUrl, verificationMethod } = req.body || {};
  if (!body || !credentialName || !credentialType || !proposedTier) return res.status(400).json({ success: false, error: 'body, credentialName, credentialType and proposedTier are required.' });
  if (!teachingTiers.findByCode(proposedTier)) return res.status(400).json({ success: false, error: 'Unknown tier code.' });
  const row = credentialCrosswalk.create({ body, credentialName, credentialType, bodysOwnAnchor, disciplineScope, mtPoints, proposedTier, sourceUrl, verificationMethod });
  res.json({ success: true, row });
});
app.post('/api/admin/credential-crosswalk/:id', requireAdminApi, (req, res) => {
  if (req.body?.proposedTier && !teachingTiers.findByCode(req.body.proposedTier)) return res.status(400).json({ success: false, error: 'Unknown tier code.' });
  const row = credentialCrosswalk.update(req.params.id, req.body || {});
  if (!row) return res.status(404).json({ success: false, error: 'Crosswalk row not found.' });
  res.json({ success: true, row });
});
app.post('/api/admin/credential-crosswalk/:id/active', requireAdminApi, (req, res) => {
  const row = credentialCrosswalk.setActive(req.params.id, req.body?.active !== false);
  if (!row) return res.status(404).json({ success: false, error: 'Crosswalk row not found.' });
  res.json({ success: true, row });
});

// --- Foundation / specialist cert modules ---
app.get('/api/teacher-ed/modules', requireTutorProfileApi, (req, res) => {
  res.json({ success: true, modules: certModules.listModules(), dimensions: certModules.listDimensions() });
});
app.post('/api/teacher-ed/modules/:code/attempt', requireTutorProfileApi, (req, res) => {
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const attempt = certModules.recordAttempt(req.tutorProfile.id, req.params.code, answers);
  if (!attempt) return res.status(404).json({ success: false, error: 'Module not found.' });
  const completedAssignments = quizAssignments.markCompletedIfPassed(req.tutorProfile.id, req.params.code);
  res.json({ success: true, attempt, assignmentsCompleted: completedAssignments.length });
});
app.get('/api/admin/cert-modules', requireAdminApi, (req, res) => {
  res.json({ success: true, modules: certModules.listModules({ activeOnly: false }), dimensions: certModules.listDimensions() });
});
app.post('/api/admin/cert-modules', requireAdminApi, (req, res) => {
  const { code, title, dimensions, resource, kind } = req.body || {};
  if (!code || !title) return res.status(400).json({ success: false, error: 'code and title are required.' });
  const module = certModules.createModule({ code, title, dimensions: dimensions || [], resource: resource || null, kind });
  if (!module) return res.status(409).json({ success: false, error: 'A module with that code already exists.' });
  res.json({ success: true, module });
});
app.post('/api/admin/cert-modules/:code/questions', requireAdminApi, (req, res) => {
  const { text, options, correctIndex, dimension } = req.body || {};
  if (!text || !Array.isArray(options) || options.length < 2 || correctIndex == null || !dimension) {
    return res.status(400).json({ success: false, error: 'text, at least 2 options, correctIndex and dimension are required.' });
  }
  const question = certModules.addQuestion(req.params.code, { text, options, correctIndex: Number(correctIndex), dimension });
  if (!question) return res.status(404).json({ success: false, error: 'Module not found.' });
  res.json({ success: true, question });
});
app.post('/api/admin/cert-modules/:code/active', requireAdminApi, (req, res) => {
  const module = certModules.setModuleActive(req.params.code, req.body?.active !== false);
  if (!module) return res.status(404).json({ success: false, error: 'Module not found.' });
  res.json({ success: true, module });
});

// --- Quiz assignments: admin-pushed content (Part 1) ---
app.get('/api/teacher-ed/my-assignments', requireTutorProfileApi, (req, res) => {
  quizAssignments.sweepOverdue();
  res.json({ success: true, items: quizAssignments.listQueue({ tutorId: req.tutorProfile.id }) });
});
app.post('/api/teacher-ed/my-assignments/:id/start', requireTutorProfileApi, (req, res) => {
  const item = quizAssignments.findQueueItem(req.params.id);
  if (!item || item.assignedTo !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  res.json({ success: true, item: quizAssignments.markStarted(item.id) });
});
app.get('/api/admin/quiz-assignments', requireAdminApi, (req, res) => {
  quizAssignments.sweepOverdue();
  const { tutorId, orgId } = req.query;
  res.json({ success: true, items: quizAssignments.listQueue({ tutorId: tutorId || undefined, orgId: orgId || undefined }) });
});
app.post('/api/admin/quiz-assignments', requireAdminApi, (req, res) => {
  const { orgId, assignedTo, targetType, targetId, reason, dueAt } = req.body || {};
  if (!assignedTo || !targetType || !targetId) return res.status(400).json({ success: false, error: 'assignedTo, targetType and targetId are required.' });
  const item = quizAssignments.assign({ orgId: orgId || null, assignedByUserId: currentUser(req).id, assignedTo, targetType, targetId, reason, dueAt: dueAt || null });
  const tutor = tutors.findById(assignedTo);
  if (tutor) {
    store.addNotification(tutor.userId, {
      type: 'quiz_assignment',
      message: reason ? `New professional development item: ${reason}` : 'You have a new professional development item assigned.',
      href: '/teacher-education',
    });
  }
  res.json({ success: true, item });
});
app.post('/api/admin/quiz-assignments/:id/waive', requireAdminApi, (req, res) => {
  const item = quizAssignments.waive(req.params.id, currentUser(req).id, req.body?.reason);
  if (!item) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  res.json({ success: true, item });
});
app.post('/api/admin/quiz-assignments/:id/remind', requireAdminApi, (req, res) => {
  const item = quizAssignments.findQueueItem(req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'Assignment not found.' });
  const tutor = tutors.findById(item.assignedTo);
  if (tutor) {
    store.addNotification(tutor.userId, {
      type: 'quiz_assignment',
      message: `Reminder: ${item.reason || 'a professional development item'} is due${item.dueAt ? ` ${new Date(item.dueAt).toLocaleDateString()}` : ''}.`,
      href: '/teacher-education',
    });
  }
  res.json({ success: true });
});

app.get('/api/admin/quiz-assignment-rules', requireAdminApi, (req, res) => {
  res.json({ success: true, rules: quizAssignments.listRules() });
});
app.post('/api/admin/quiz-assignment-rules', requireAdminApi, (req, res) => {
  const { orgId, trigger, filter, targetType, targetIds, cadence } = req.body || {};
  if (!trigger || !targetType || !Array.isArray(targetIds) || !targetIds.length) {
    return res.status(400).json({ success: false, error: 'trigger, targetType and at least one targetId are required.' });
  }
  const rule = quizAssignments.createRule({ orgId: orgId || null, trigger, filter: filter || {}, targetType, targetIds, cadence: cadence || null, createdByUserId: currentUser(req).id });
  res.json({ success: true, rule });
});
app.post('/api/admin/quiz-assignment-rules/:id/active', requireAdminApi, (req, res) => {
  const rule = quizAssignments.setRuleActive(req.params.id, req.body?.active !== false);
  if (!rule) return res.status(404).json({ success: false, error: 'Rule not found.' });
  res.json({ success: true, rule });
});
// Runs every manual-trigger and new_hire-trigger rule against every
// approved tutor right now, rather than waiting for a scheduled job this
// deployment has no cron runner for - the admin console's "Run rules now"
// button.
app.post('/api/admin/quiz-assignment-rules/run', requireAdminApi, (req, res) => {
  const candidates = tutors.listApproved().map((t) => ({ id: t.id, categories: t.categories, orgId: null }));
  const queued = [
    ...quizAssignments.applyRules('manual', candidates, currentUser(req).id),
    ...quizAssignments.applyRules('new_hire', candidates, currentUser(req).id),
    ...quizAssignments.applyRules('low_score', candidates, currentUser(req).id),
    ...quizAssignments.applyRules('recurring', candidates, currentUser(req).id),
  ];
  queued.forEach((item) => {
    const tutor = tutors.findById(item.assignedTo);
    if (tutor) store.addNotification(tutor.userId, { type: 'quiz_assignment', message: item.reason, href: '/teacher-education' });
  });
  res.json({ success: true, queuedCount: queued.length });
});

// --- External credential submission + review (Part 2.2/2.4) ---
app.get('/api/teacher-ed/my-credentials', requireTutorProfileApi, (req, res) => {
  res.json({ success: true, submissions: externalCredentials.listForTutor(req.tutorProfile.id) });
});
app.post('/api/teacher-ed/credentials', requireTutorProfileApi, (req, res) => {
  const { crosswalkId, evidenceUrl, issuingBodyRef } = req.body || {};
  if (!crosswalkId) return res.status(400).json({ success: false, error: 'Select the credential you\'re submitting.' });
  const submission = externalCredentials.submit({ tutorId: req.tutorProfile.id, crosswalkId, evidenceUrl, issuingBodyRef });
  if (!submission) return res.status(404).json({ success: false, error: 'That credential is not on the crosswalk list.' });
  res.json({ success: true, submission });
});
app.get('/api/admin/external-credentials', requireAdminApi, (req, res) => {
  const { pendingOnly } = req.query;
  res.json({ success: true, submissions: pendingOnly ? externalCredentials.listPending() : externalCredentials.listAll() });
});
app.post('/api/admin/external-credentials/:id/verify', requireAdminApi, (req, res) => {
  const submission = externalCredentials.verify(req.params.id, currentUser(req).id, { note: req.body?.note, expiresAt: req.body?.expiresAt || null });
  if (!submission) return res.status(404).json({ success: false, error: 'Submission not found.' });
  const tutor = tutors.findById(submission.tutorId);
  if (tutor) store.addNotification(tutor.userId, { type: 'credential_review', message: `Your ${submission.crosswalkSnapshot.credentialName} submission was verified.`, href: '/teacher-education' });
  res.json({ success: true, submission });
});
app.post('/api/admin/external-credentials/:id/reject', requireAdminApi, (req, res) => {
  const submission = externalCredentials.reject(req.params.id, currentUser(req).id, req.body?.reason);
  if (!submission) return res.status(404).json({ success: false, error: 'Submission not found.' });
  const tutor = tutors.findById(submission.tutorId);
  if (tutor) store.addNotification(tutor.userId, { type: 'credential_review', message: `Your ${submission.crosswalkSnapshot.credentialName} submission needs attention: ${req.body?.reason || 'see the review note'}.`, href: '/teacher-education' });
  res.json({ success: true, submission });
});
app.post('/api/admin/external-credentials/:id/more-evidence', requireAdminApi, (req, res) => {
  const submission = externalCredentials.requestMoreEvidence(req.params.id, currentUser(req).id, req.body?.note);
  if (!submission) return res.status(404).json({ success: false, error: 'Submission not found.' });
  const tutor = tutors.findById(submission.tutorId);
  if (tutor) store.addNotification(tutor.userId, { type: 'credential_review', message: `More evidence needed for your ${submission.crosswalkSnapshot.credentialName} submission.`, href: '/teacher-education' });
  res.json({ success: true, submission });
});

// --- Practicum review (Part 3.5) ---
app.get('/api/teacher-ed/my-practicum', requireTutorProfileApi, (req, res) => {
  res.json({ success: true, reviews: practicumReviews.listForTutor(req.tutorProfile.id) });
});
app.post('/api/teacher-ed/practicum', requireTutorProfileApi, (req, res) => {
  const { stage, videoUrl, lessonPlanUrl, outcomeNote } = req.body || {};
  const review = practicumReviews.submit({ tutorId: req.tutorProfile.id, stage, videoUrl, lessonPlanUrl, outcomeNote });
  if (!review) return res.status(400).json({ success: false, error: 'Invalid practicum stage.' });
  res.json({ success: true, review });
});
app.post('/api/admin/practicum-reviews/:id/approve', requireAdminApi, (req, res) => {
  const review = practicumReviews.approve(req.params.id, currentUser(req).id, req.body?.note);
  if (!review) return res.status(404).json({ success: false, error: 'Review not found.' });
  const tutor = tutors.findById(review.tutorId);
  if (tutor) store.addNotification(tutor.userId, { type: 'practicum_review', message: `Your ${review.stage.replace('_', ' ')} practicum review was approved.`, href: '/teacher-education' });
  res.json({ success: true, review });
});
app.post('/api/admin/practicum-reviews/:id/reject', requireAdminApi, (req, res) => {
  const review = practicumReviews.reject(req.params.id, currentUser(req).id, req.body?.reason);
  if (!review) return res.status(404).json({ success: false, error: 'Review not found.' });
  const tutor = tutors.findById(review.tutorId);
  if (tutor) store.addNotification(tutor.userId, { type: 'practicum_review', message: `Your ${review.stage.replace('_', ' ')} practicum review needs attention: ${req.body?.reason || 'see the review note'}.`, href: '/teacher-education' });
  res.json({ success: true, review });
});

// One shared review queue for both credential verification and practicum
// review (Part 2.4/3.5's explicit instruction to build this once), composed
// from the two underlying modules rather than merged into one table.
app.get('/api/admin/review-queue', requireAdminApi, (req, res) => {
  const credentialItems = externalCredentials.listPending().map((s) => ({ kind: 'credential', ...s }));
  const practicumItems = practicumReviews.listPending().map((r) => ({ kind: 'practicum', ...r }));
  const items = [...credentialItems, ...practicumItems].sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  res.json({ success: true, items });
});

// --- Tier standing + appeals (Part 2.3/2.5/3.4) ---
app.get('/api/teacher-ed/standing', requireTutorProfileApi, (req, res) => {
  res.json({ success: true, standing: tierEngine.computeStanding(req.tutorProfile.id) });
});
app.get('/api/admin/tutors/:tutorId/standing', requireAdminApi, (req, res) => {
  const tutor = tutors.findById(req.params.tutorId);
  if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found.' });
  res.json({ success: true, standing: tierEngine.computeStanding(tutor.id) });
});
// A low-friction "ask a human to look at this again" button (Part 2.5) -
// reopens the rejected item back into the same shared review queue with an
// appeal note attached, rather than a support email buried in a help page.
app.post('/api/teacher-ed/appeals', requireTutorProfileApi, (req, res) => {
  const { kind, id, message } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ success: false, error: 'Explain what you\'d like reviewed again.' });
  let record = null;
  if (kind === 'credential') {
    const submission = externalCredentials.findById(id);
    if (!submission || submission.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Submission not found.' });
    record = externalCredentials.requestMoreEvidence(id, currentUser(req).id, `Teacher appeal: ${message}`);
  } else if (kind === 'practicum') {
    const review = practicumReviews.findById(id);
    if (!review || review.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Review not found.' });
    // practicumReviews has no "more evidence" state - resubmit straight
    // back into the pending queue with the appeal note visible.
    record = practicumReviews.submit({ tutorId: review.tutorId, stage: review.stage, videoUrl: review.videoUrl, lessonPlanUrl: review.lessonPlanUrl, outcomeNote: `${review.outcomeNote || ''}\n\nAppeal: ${message}`.trim() });
  } else {
    return res.status(400).json({ success: false, error: 'Unknown appeal kind.' });
  }
  store.listUsers().filter((u) => u.role === 'admin').forEach((admin) => {
    store.addNotification(admin.id, { type: 'appeal', message: `${req.tutorProfile.name} appealed a ${kind} review decision.`, href: '/admin' });
  });
  res.json({ success: true, record });
});

// --- TUTORS: applications, browsing, and matching ---
// A tutor's approval status lives on the tutor profile, not the user's
// role, since the same account can be both a student and a tutor.
app.get('/api/categories', (req, res) => {
  res.json({ success: true, categories: taxonomy.loadSubjects() });
});

app.post('/api/admin/categories', requireAdminApi, (req, res) => {
  const name = String(req.body && (req.body.name || req.body.subject) || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Subject name is required.' });
  if (name.length > 80) return res.status(400).json({ success: false, error: 'Subject name is too long.' });
  const subjects = taxonomy.loadSubjects();
  if (subjects.some((subject) => subject.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ success: false, error: 'That subject already exists.' });
  }
  res.json({ success: true, categories: taxonomy.addSubject(name) });
});

app.get('/api/taxonomy', (req, res) => {
  res.json({
    success: true,
    subjects: taxonomy.loadSubjects(),
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

// The rest of a tutor's editable public-facing details, same
// self-service pattern as /categories and /hourly-rate above.
app.post('/api/tutors/me/profile', requireTutorProfileApi, (req, res) => {
  const { bio, qualifications, city, genres, teachesOnline, inPersonVenue, publicExactLocation, phone } = req.body || {};
  if (publicExactLocation !== undefined && typeof publicExactLocation !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid map sharing permission.' });
  if (genres !== undefined && !Array.isArray(genres)) return res.status(400).json({ success: false, error: 'Invalid genres.' });
  const updated = tutors.setProfileDetails(req.tutorProfile.id, { bio, qualifications, city, genres, teachesOnline, inPersonVenue, publicExactLocation, phone });
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
    avgRating: tutors.avgRating(t), ratingCount: t.ratingCount || 0, isSuperTutor: tutors.isSuperTutor(t),
  };
  res.json({ success: true, profile });
});

app.post('/api/uploads/certificate', requireAuthApi, (req, res) => {
  certUpload.single('certificate')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 15MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'certificates') });
  });
});

app.post('/api/uploads/photo', hydrateUploadToken, requireAuthApi, (req, res) => {
  photoUpload.single('photo')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 8MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a photo to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'photos') });
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
  const configuredIsLoopback = configured && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configured);
  // A configured BASE_URL of "localhost" only resolves for a browser
  // running on this same machine - a phone on the LAN hitting this server
  // by its real IP can never reach "localhost" back (that just means the
  // phone itself), which silently breaks any Stripe success_url/cancel_url
  // built from it (the redirect after payment goes nowhere, so the wallet/
  // bill never gets credited via that path - only the client's own
  // verify-after-close fallback can save it, and only if the user notices
  // the browser needs closing manually). Trust the configured loopback
  // value only when the *incoming* request also came in via loopback (a
  // desktop browser on this same machine); otherwise use the host the
  // request actually reached this server on, which a remote device is
  // already proven able to reach, since that's how its request got here.
  if (configured && (!configuredIsLoopback || !req || /^(localhost|127\.0\.0\.1)$/i.test(String(req.hostname || '')))) {
    return configured.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'production') return 'https://mozarttechniques.com';
  return req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:3000';
}

async function refreshTutorConnectStatus(tutor) {
  const client = stripeClient.getClient();
  if (!client || !tutor || !tutor.stripeConnectAccountId) return tutor;
  const account = await client.v2.core.accounts.retrieve(tutor.stripeConnectAccountId, {
    include: ['configuration.recipient', 'requirements'],
  });
  return tutors.setStripeConnectAccount(tutor.id, account);
}

function stripeConnectError(err) {
  const messages = {
    accounts_v2_access_blocked: 'Stripe Connect Accounts v2 is not enabled for the Mozart Techniques Stripe platform.',
    platform_registration_required: 'Stripe Connect must be activated in the Mozart Techniques Stripe Dashboard before tutors can connect.',
    connect_profile_not_submitted: 'The Mozart Techniques Stripe platform profile must be completed before tutors can connect.',
    connect_identity_not_verified: 'Stripe must verify the Mozart Techniques platform before tutors can connect.',
    capability_not_available_in_country: 'Stripe Connect payouts are not available for this tutor country.',
    capability_not_available_in_platform_country: 'Stripe Connect payouts are not available for this platform country.',
    cross_border_connected_account_creation_not_allowed: 'Stripe does not permit this cross-border connected-account payout route.',
  };
  return messages[err && err.code] || 'Stripe could not start or update this payout setup. Please try again or contact support.';
}

function tutorRecipientConfiguration() {
  return { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } };
}

function connectAccountIncludes() {
  return ['configuration.recipient', 'requirements'];
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
    const refreshedTutor = await refreshTutorConnectStatus(tutor);
    if (!refreshedTutor.stripeConnectTransfersEnabled || !refreshedTutor.stripeConnectPayoutsEnabled) {
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
    res.json({
      success: true,
      configured: Boolean(stripeClient.getClient()),
      accountId: profile.stripeConnectAccountId || null,
      accountVersion: profile.stripeConnectAccountVersion || null,
      detailsSubmitted: Boolean(profile.stripeConnectDetailsSubmitted),
      payoutsEnabled: Boolean(profile.stripeConnectPayoutsEnabled),
      transfersEnabled: Boolean(profile.stripeConnectTransfersEnabled),
      requirementsDue: profile.stripeConnectRequirementsDue || [],
    });
  } catch (err) {
    res.status(400).json({ success: false, error: stripeConnectError(err) });
  }
});

async function createTutorConnectOnboardingLink(req) {
  const client = stripeClient.getClient();
  if (!client) throw Object.assign(new Error('Stripe is not configured on this server yet.'), { code: 'stripe_not_configured' });

  const user = currentUser(req);
  let profile = req.tutorProfile;
  let account;
  if (profile.stripeConnectAccountId) {
    // The stored acct_ ID is authoritative: update/reuse it, including an
    // existing v1 account that Stripe has made available to Accounts v2.
    account = await client.v2.core.accounts.update(profile.stripeConnectAccountId, {
      configuration: tutorRecipientConfiguration(),
      include: connectAccountIncludes(),
    });
  } else {
    account = await client.v2.core.accounts.create({
      contact_email: user.email,
      display_name: profile.name || user.name || 'Mozart Techniques tutor',
      dashboard: 'express',
      identity: { country: stripeConnectCountry(user) },
      defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
      configuration: tutorRecipientConfiguration(),
      metadata: {
        mozart_role: 'tutor',
        mozart_tutor_id: String(profile.id),
        mozart_user_id: String(user.id),
      },
      include: connectAccountIncludes(),
    }, { idempotencyKey: `mozart-tutor-connect-v2-${profile.id}` });
  }

  profile = tutors.setStripeConnectAccount(profile.id, account);
  const baseUrl = publicAppUrl(req);
  const link = await client.v2.core.accountLinks.create({
    account: profile.stripeConnectAccountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['recipient'],
        refresh_url: `${baseUrl}/api/tutors/me/stripe-connect/refresh`,
        return_url: `${baseUrl}/api/tutors/me/stripe-connect/return`,
        collection_options: { fields: 'eventually_due', future_requirements: 'include' },
      },
    },
  });
  return { profile, link };
}

app.post('/api/tutors/me/stripe-connect/onboard', requireApprovedTutorApi, async (req, res) => {
  try {
    const { profile, link } = await createTutorConnectOnboardingLink(req);
    res.json({ success: true, url: link.url, accountId: profile.stripeConnectAccountId });
} catch (err) {
  console.error('========== STRIPE CONNECT ERROR ==========');
  console.error('Code:', err?.code);
  console.error('Type:', err?.type);
  console.error('Message:', err?.message);
  console.error('Param:', err?.param);
  console.error('Raw:', err);
  console.error('==========================================');

  res.status(err?.code === 'stripe_not_configured' ? 503 : 400).json({
    success: false,
    error: err?.message || stripeConnectError(err),
    code: err?.code || 'stripe_connect_error'
  });
}
});

app.get('/api/tutors/me/stripe-connect/refresh', requireApprovedTutorApi, async (req, res) => {
  try {
    const { link } = await createTutorConnectOnboardingLink(req);
    res.redirect(link.url);
  } catch (err) {
    console.warn('Stripe Connect onboarding refresh failed:', err.code || err.type || err.message);
    res.redirect('/tutor?connect=error');
  }
});

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
  const user = currentUser(req);
  if (requiredOrientationStatus(user).blocked) {
    return res.status(403).json({ success: false, error: 'Complete your required orientation before requesting a withdrawal.' });
  }
  if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount.' });
  if (!user.payoutDetails) return res.status(400).json({ success: false, error: 'Add your bank payout details before requesting withdrawal.' });
  const withdrawable = Math.round(((tutor.balanceUsd || 0) - payouts.pendingAmountForTutor(tutor.id)) * 100) / 100;
  if (amount > withdrawable) return res.status(400).json({ success: false, error: `You can request up to $${withdrawable.toFixed(2)}.` });
  const payout = payouts.create({ tutorId: tutor.id, tutorUserId: user.id, tutorName: tutor.name, amountUsd: amount, payoutDetails: user.payoutDetails });
  notifyAdmins({ type: 'payout-request', subject: 'Payout request', message: `Tutor ${tutor.name} requested payout of $${amount.toFixed(2)}. Payout request #${payout.id}.` });
  store.addNotification(tutor.userId, { type: 'payout-request', message: `Requested payout of $${amount.toFixed(2)}. Admin will process it.` });
  res.json({ success: true, payout });
});

// Tutor group chats: tutors can create group chats for their course students
app.get('/api/tutors/me/group-chats', requireApprovedTutorApi, (req, res) => {
  const profile = req.tutorProfile;
  const chats = orgChat.listForTutor(profile.id).filter((c) => c.type === 'tutor-group').map((c) => ({
    id: c.id,
    name: c.title,
    course: c.course,
    studentCount: (c.participants || []).filter(p => p.type === 'student').length,
    createdAt: c.createdAt
  }));
  res.json({ success: true, chats });
});

app.post('/api/tutors/me/group-chats', requireApprovedTutorApi, (req, res) => {
  const profile = req.tutorProfile;
  const { course, groupName, studentIds, groupImageUrl } = req.body || {};
  if (!course) return res.status(400).json({ success: false, error: 'Choose a course.' });
  if (!Array.isArray(studentIds) || !studentIds.length) return res.status(400).json({ success: false, error: 'At least one student is required.' });
  const validStudents = studentIds.filter(id => assignments.listAll().some(a => a.tutorId === profile.id && a.studentId === id && a.category === course));
  if (!validStudents.length) return res.status(400).json({ success: false, error: 'Those students are not registered for this course.' });
  const normalizedImage = typeof groupImageUrl === 'string' ? groupImageUrl.trim() : '';
  const conversation = orgChat.getOrCreateTutorGroupConversation(profile.id, { course, groupName, studentIds: validStudents, groupImageUrl: normalizedImage || null });
  res.json({ success: true, conversation });
});

app.post('/api/tutors/me/group-chats/:id/messages', requireApprovedTutorApi, (req, res) => {
  const profile = req.tutorProfile;
  const conversationId = Number(req.params.id);
  const conversation = orgChat.listForTutor(profile.id).find(c => c.id === conversationId && c.type === 'tutor-group');
  if (!conversation) return res.status(404).json({ success: false, error: 'Group chat not found.' });
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ success: false, error: 'Message required.' });
  const message = orgChat.sendMessage(conversation.id, { senderId: profile.userId, senderType: 'tutor', senderName: profile.name, text });
  res.json({ success: true, message });
});

function tutorGroupAccess(user, conversationId) {
  const conversation = orgChat.findById(conversationId);
  if (!conversation || conversation.type !== 'tutor-group') return null;
  const tutor = tutors.findByUserId(user.id);
  if (tutor && Number(conversation.tutorId) === Number(tutor.id)) return { conversation, role: 'tutor', name: tutor.name };
  const participant = (conversation.participants || []).find((entry) => entry.type === 'student' && Number(entry.id) === Number(user.id));
  return participant ? { conversation, role: 'student', name: user.name || participant.name || 'Student' } : null;
}

app.get('/api/group-chats', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const tutor = tutors.findByUserId(user.id);
  const prefs = store.getThreadPrefs(user.id);
  const chats = (tutor ? orgChat.listForTutor(tutor.id) : [])
    .filter((item) => item.type === 'tutor-group')
    .concat((!tutor ? [] : []));
  const studentChats = orgChat.listAll ? orgChat.listAll() : [];
  const visible = tutor ? chats : studentChats.filter((item) => item.type === 'tutor-group' && (item.participants || []).some((entry) => entry.type === 'student' && Number(entry.id) === Number(user.id)));
  const rows = visible.map((item) => {
    const lastAt = (item.messages || []).slice(-1)[0]?.createdAt || item.createdAt;
    const threadKey = `group:${item.id}`;
    return {
      id: item.id, name: item.title, course: item.course,
      studentCount: (item.participants || []).filter((entry) => entry.type === 'student').length,
      lastAt, lastMessage: (item.messages || []).slice(-1)[0]?.text || '',
      photoUrl: item.groupImageUrl || item.photoUrl || null,
      threadKey, hiddenAt: prefs.hiddenThreads[threadKey] || null,
      favorite: prefs.favoriteThreadIds.includes(threadKey),
      archived: prefs.archivedThreadIds.includes(threadKey),
      pinned: prefs.pinnedThreadIds.includes(threadKey),
      muted: (() => { const m = prefs.mutedThreads[threadKey]; return Boolean(m && (m.until === null || new Date(m.until) > new Date())); })(),
      mutedUntil: (() => { const m = prefs.mutedThreads[threadKey]; return m && m.until && (new Date(m.until) > new Date()) ? m.until : null; })(),
    };
  })
    .filter((row) => !(row.hiddenAt && new Date(row.lastAt) <= new Date(row.hiddenAt)))
    .sort((a, b) => (b.pinned - a.pinned) || (new Date(b.lastAt) - new Date(a.lastAt)));
  res.json({ success: true, chats: rows });
});

app.get('/api/group-chats/:id', requireAuthApi, (req, res) => {
  const access = tutorGroupAccess(currentUser(req), req.params.id);
  if (!access) return res.status(404).json({ success: false, error: 'Group chat not found.' });
const members = (access.conversation.participants || []).map((participant) => {
    const tutor = participant.type === 'tutor' ? tutors.findById(participant.id) : null;
    const user = participant.type === 'student' ? store.findById(participant.id) : tutor && store.findById(tutor.userId);
    return { ...participant, name: tutor?.name || user?.name || participant.name || (participant.type === 'tutor' ? 'Tutor' : 'Student'), photoUrl: participant.photoUrl || tutor?.photoUrl || user?.photoUrl || null, roleLabel: participant.type === 'tutor' ? 'Admin' : 'Student' };
  });
  res.json({ success: true, group: { ...access.conversation, photoUrl: access.conversation.groupImageUrl || access.conversation.photoUrl || null }, members, role: access.role, messages: orgChat.getMessages(access.conversation.id) });
});

app.post('/api/group-chats/:id/meeting', requireAuthApi, (req, res) => {
  const access = tutorGroupAccess(currentUser(req), req.params.id);
  if (!access || access.role !== 'tutor') return res.status(403).json({ success: false, error: 'Only the tutor can start a group meeting.' });
  const meetingLink = String(req.body?.meetingLink || '').trim();
  if (!/^https?:\/\//i.test(meetingLink)) return res.status(400).json({ success: false, error: 'Paste a full Google Meet link beginning with https://.' });
  const group = orgChat.setMeetingLink(access.conversation.id, meetingLink);
  res.json({ success: true, group });
});
app.delete('/api/group-chats/:id/members/:type/:memberId', requireAuthApi, (req, res) => {
  const access = tutorGroupAccess(currentUser(req), req.params.id);
  if (!access || access.role !== 'tutor') return res.status(403).json({ success: false, error: 'Only the tutor can remove members.' });
  if (req.params.type === 'tutor' && Number(req.params.memberId) === Number(access.conversation.tutorId)) return res.status(400).json({ success: false, error: 'The tutor cannot be removed.' });
  const updated = orgChat.removeParticipant(req.params.id, req.params.memberId, req.params.type);
  res.json({ success: Boolean(updated), group: updated });
});
app.post('/api/group-chats/:id/messages', requireAuthApi, (req, res) => {
  const access = tutorGroupAccess(currentUser(req), req.params.id);
  const { text: rawText, attachment, replyToId, poll, location, libraryItem } = req.body || {};
  const text = String(rawText || '').trim();
  if (!access) return res.status(404).json({ success: false, error: 'Group chat not found.' });
  if (!text && !attachment && !poll && !location && !libraryItem) return res.status(400).json({ success: false, error: 'Write a message, attach a file, a poll, a location, or a library clip.' });
  if (attachment && !isOwnChatAttachmentUrl(attachment.url)) return res.status(400).json({ success: false, error: 'Attach files through the upload endpoint.' });
  const { poll: safePoll, error: pollError } = validatePollInput(poll);
  if (pollError) return res.status(400).json({ success: false, error: pollError });
  const { location: safeLocation, error: locationError } = validateLocationInput(location);
  if (locationError) return res.status(400).json({ success: false, error: locationError });
  const safeLibraryItem = libraryItem && libraryItem.title && libraryItem.url
    ? { title: String(libraryItem.title).trim().slice(0, 200), url: String(libraryItem.url).trim() }
    : null;
  const message = orgChat.sendMessage(access.conversation.id, {
    senderId: currentUser(req).id, senderType: access.role, senderName: access.name, text, attachment,
    replyToId: replyToId || null, poll: safePoll, location: safeLocation, libraryItem: safeLibraryItem,
  });
  res.json({ success: true, message });
});
// Admin's region filter is now a multi-select dropdown rather than one
// pill at a time - `regions` is a comma-separated list of country names
// (falls back to the older singular `region` param for compatibility).
// An empty set means "All countries", matching the previous no-filter
// behavior.
function parseRegionFilter(req) {
  const raw = String(req.query.regions || req.query.region || '').trim();
  if (!raw) return null;
  const set = new Set(raw.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean));
  return set.size ? set : null;
}

// A country admin gets no "all countries" option on Analytics/Payouts/
// Activity - unlike the tutor/user/performer lists (scoped via
// canManageUser, keyed by ISO country CODE), these routes filter by
// country NAME via the client-supplied ?regions= param, so a country
// admin's own ?regions= choice can't be trusted. For a non-primary admin,
// this ignores whatever the client sent and forces the filter to their
// own country (resolved from adminCountryCode, an ISO code, via the same
// curated currency list countryCodeForName reads) - only Main Admin can
// pass an arbitrary/empty regions filter to see other countries or all of
// them.
function resolveRegionFilter(req, admin) {
  if (isPrimaryAdmin(admin)) return parseRegionFilter(req);
  const ownCountry = admin && admin.adminCountryCode && geo.COUNTRY_CURRENCY[admin.adminCountryCode]
    ? geo.COUNTRY_CURRENCY[admin.adminCountryCode].name
    : null;
  return new Set(ownCountry ? [ownCountry.toLowerCase()] : ['__none__']);
}

app.get('/api/admin/payouts', requireAdminApi, (req, res) => {
  const regionSet = resolveRegionFilter(req, currentUser(req));
  const list = payouts.listAll().filter((item) => {
    if (!regionSet) return true;
    const tutor = tutors.findById(item.tutorId);
    return regionSet.has(String(tutor && tutor.locality && tutor.locality.country || '').toLowerCase());
  });
  res.json({ success: true, payouts: list });
});
app.get('/store', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'store.html'));
});
app.get('/category', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'category.html'));
});
app.get('/product', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'product.html'));
});
app.get('/store-profile', requireAuthPage, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'store-profile.html'));
});
app.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});
app.get('/store-privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'store-privacy.html'));
});
app.get('/order-confirmation', requireAuthPage, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order-confirmation.html'));
});

// ==================== STORE (E-COMMERCE) ====================

const STORE_CATEGORIES = [
  { key: 'scripts-scores', title: 'Sheet Music & Scores', description: 'Printed and digital scores for every instrument and skill level.', image: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=1600&q=80' },
  { key: 'instruments', title: 'Instruments', description: 'Guitars, keyboards, strings, and more from trusted makers.', image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1600&q=80' },
  { key: 'accessories', title: 'Accessories', description: 'Cases, straps, tuners, and everything else your practice needs.', image: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=1600&q=80' },
  { key: 'digital-products', title: 'Digital Products', description: 'Downloadable lessons, backing tracks, and practice tools.', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1600&q=80' },
  { key: 'books-learning', title: 'Books & Learning', description: 'Method books and guides to build your musical foundation.', image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1600&q=80' },
];

async function storeProductSummary(product, geoInfo) {
  const priceLocal = Math.round((await currency.convertFromUsd(product.priceUsd, geoInfo.currency)) * 100) / 100;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    coverImage: product.coverImage,
    priceUsd: product.priceUsd,
    priceLocal,
    currency: geoInfo.currency,
    symbol: geoInfo.symbol,
    avgRating: productReviews.avgRating(product.id),
    reviewCount: productReviews.countFor(product.id),
    inStock: products.totalStock(product) > 0,
    createdAt: product.createdAt,
  };
}

// Every color needs a name and at least one country with real stock -
// otherwise the color x country matrix has no meaningful entry a buyer
// could ever purchase.
function validateProductColors(colors) {
  if (!Array.isArray(colors) || !colors.length) return 'Add at least one color.';
  for (const color of colors) {
    if (!color || !String(color.name || '').trim()) return 'Every color needs a name.';
    if (!Array.isArray(color.stock) || !color.stock.some((s) => Number(s.quantity) > 0)) {
      return `Add at least one country with stock for "${color.name}".`;
    }
  }
  return null;
}

// --- Public store browsing (geo-aware pricing, works for anonymous visitors) ---

app.get('/api/store/categories', (req, res) => {
  const active = products.listAll({ status: 'active' });
  const categories = STORE_CATEGORIES.map((cat) => ({
    ...cat,
    productCount: active.filter((p) => p.category === cat.key).length,
  }));
  res.json({ success: true, categories });
});

app.get('/api/store/products', async (req, res) => {
  const { category, q, sort, page } = req.query;
  let list = products.listAll({ status: 'active', category: category || undefined });
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle));
  }
  if (sort === 'price-asc') list = list.slice().sort((a, b) => a.priceUsd - b.priceUsd);
  else if (sort === 'price-desc') list = list.slice().sort((a, b) => b.priceUsd - a.priceUsd);
  else if (sort === 'new') list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  else {
    list = list.slice().sort((a, b) => (productReviews.countFor(b.id) - productReviews.countFor(a.id))
      || (new Date(b.createdAt) - new Date(a.createdAt)));
  }

  const pageSize = 24;
  const pageNum = Math.max(1, Number(page) || 1);
  const paged = list.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  const geoInfo = await getGeoInfo(req);
  const summaries = await Promise.all(paged.map((p) => storeProductSummary(p, geoInfo)));
  res.json({ success: true, products: summaries, total: list.length, page: pageNum, pageSize, hasMore: pageNum * pageSize < list.length });
});

app.post('/api/store/products/batch', async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ success: false, error: 'Invalid request.' });
  const geoInfo = await getGeoInfo(req);
  const results = await Promise.all(items.map(async (item) => {
    const product = products.findById(item.productId);
    if (!product || product.status !== 'active') return { productId: item.productId, colorId: item.colorId, active: false };
    const color = product.colors.find((c) => c.id === item.colorId);
    const priceLocal = Math.round((await currency.convertFromUsd(product.priceUsd, geoInfo.currency)) * 100) / 100;
    return {
      productId: product.id, colorId: color ? color.id : null, active: true,
      productName: product.name, productSlug: product.slug, image: product.coverImage,
      colorName: color ? color.name : null, colorHex: color ? color.hex : null,
      unitPriceUsd: product.priceUsd, unitPriceLocal: priceLocal,
      currency: geoInfo.currency, symbol: geoInfo.symbol,
      stockForViewerCountry: color ? products.stockFor(product, color.id, geoInfo.countryCode) : 0,
    };
  }));
  res.json({ success: true, items: results });
});

app.get('/api/store/products/:id/reviews', (req, res) => {
  const reviews = productReviews.listByProduct(req.params.id);
  res.json({ success: true, reviews, avgRating: productReviews.avgRating(req.params.id), reviewCount: reviews.length });
});

app.get('/api/store/products/:slug', async (req, res) => {
  const product = products.findBySlug(req.params.slug);
  if (!product || product.status !== 'active') return res.status(404).json({ success: false, error: 'Product not found.' });
  const geoInfo = await getGeoInfo(req);
  const priceLocal = Math.round((await currency.convertFromUsd(product.priceUsd, geoInfo.currency)) * 100) / 100;
  const colors = product.colors.map((color) => ({
    id: color.id, name: color.name, hex: color.hex,
    stockForViewerCountry: products.stockFor(product, color.id, geoInfo.countryCode),
  }));
  const related = await Promise.all(
    products.listAll({ status: 'active', category: product.category })
      .filter((p) => p.id !== product.id)
      .slice(0, 4)
      .map((p) => storeProductSummary(p, geoInfo)),
  );
  res.json({
    success: true,
    product: {
      id: product.id, slug: product.slug, name: product.name, category: product.category,
      description: product.description, images: product.images, coverImage: product.coverImage,
      priceUsd: product.priceUsd, priceLocal, currency: geoInfo.currency, symbol: geoInfo.symbol,
      colors, avgRating: productReviews.avgRating(product.id), reviewCount: productReviews.countFor(product.id),
      viewerCountry: geoInfo.countryCode,
    },
    related,
  });
});

// --- Reviews (signed-in shopper) ---

app.post('/api/store/products/:id/reviews', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const productId = Number(req.params.id);
  const product = products.findById(productId);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
  if (productReviews.findByUserAndProduct(user.id, productId)) {
    return res.status(409).json({ success: false, error: 'You already reviewed this product. Edit your existing review instead.' });
  }
  const { rating, text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ success: false, error: 'Please write a review.' });
  const review = productReviews.create({ productId, userId: user.id, userName: user.name || user.email, rating, text });
  res.json({ success: true, review });
});

app.put('/api/store/reviews/:id', requireAuthApi, (req, res) => {
  const { rating, text } = req.body || {};
  const review = productReviews.update(req.params.id, currentUser(req).id, { rating, text });
  if (!review) return res.status(404).json({ success: false, error: 'Review not found.' });
  res.json({ success: true, review });
});

app.delete('/api/store/reviews/:id', requireAuthApi, (req, res) => {
  const removed = productReviews.remove(req.params.id, currentUser(req).id);
  if (!removed) return res.status(404).json({ success: false, error: 'Review not found.' });
  res.json({ success: true });
});

app.get('/api/store/my-reviews', requireAuthApi, (req, res) => {
  const reviews = productReviews.listByUser(currentUser(req).id).map((review) => {
    const product = products.findById(review.productId);
    return { ...review, productName: product ? product.name : 'Deleted product', productSlug: product ? product.slug : null, productImage: product ? product.coverImage : null };
  });
  res.json({ success: true, reviews });
});

// --- Address book (signed-in shopper; checkout requires at least one) ---

app.get('/api/store/addresses', requireAuthApi, (req, res) => {
  res.json({ success: true, addresses: addresses.listByUser(currentUser(req).id) });
});

app.post('/api/store/addresses', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const { label, fullName, phone, country, state, city, street, postalCode, isDefault } = req.body || {};
  if (!fullName || !phone || !country || !city || !street) {
    return res.status(400).json({ success: false, error: 'Full name, phone, country, city and street are required.' });
  }
  const countryInfo = geo.COUNTRY_CURRENCY[String(country).toUpperCase()];
  const address = addresses.create(user.id, { label, fullName, phone, country, countryName: countryInfo ? countryInfo.name : country, state, city, street, postalCode, isDefault });
  res.json({ success: true, address });
});

app.put('/api/store/addresses/:id', requireAuthApi, (req, res) => {
  const fields = { ...(req.body || {}) };
  if (fields.country) {
    const countryInfo = geo.COUNTRY_CURRENCY[String(fields.country).toUpperCase()];
    fields.countryName = countryInfo ? countryInfo.name : fields.country;
  }
  const address = addresses.update(req.params.id, currentUser(req).id, fields);
  if (!address) return res.status(404).json({ success: false, error: 'Address not found.' });
  res.json({ success: true, address });
});

app.delete('/api/store/addresses/:id', requireAuthApi, (req, res) => {
  const removed = addresses.remove(req.params.id, currentUser(req).id);
  if (!removed) return res.status(404).json({ success: false, error: 'Address not found.' });
  res.json({ success: true });
});

app.post('/api/store/addresses/:id/default', requireAuthApi, (req, res) => {
  const address = addresses.setDefault(req.params.id, currentUser(req).id);
  if (!address) return res.status(404).json({ success: false, error: 'Address not found.' });
  res.json({ success: true, address });
});

// --- Orders, inbox & recently viewed (signed-in shopper) ---

app.get('/api/store/orders', requireAuthApi, (req, res) => {
  res.json({ success: true, orders: orders.listByUser(currentUser(req).id) });
});

app.get('/api/store/orders/:id', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const idParam = req.params.id;
  const order = /^\d+$/.test(idParam) ? orders.findById(idParam) : orders.findByOrderNumber(idParam);
  if (!order || order.userId !== user.id) return res.status(404).json({ success: false, error: 'Order not found.' });
  res.json({ success: true, order });
});

app.get('/api/store/inbox', requireAuthApi, (req, res) => {
  const userOrders = orders.listByUser(currentUser(req).id);
  const feed = userOrders.flatMap((order) => order.statusHistory
    .filter((entry) => entry.status !== 'pending_payment')
    .map((entry) => ({ orderId: order.id, orderNumber: order.orderNumber, status: entry.status, message: entry.message, at: entry.at })));
  feed.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ success: true, inbox: feed });
});

app.post('/api/store/recently-viewed', requireAuthApi, (req, res) => {
  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ success: false, error: 'productId is required.' });
  store.recordRecentlyViewed(currentUser(req).id, productId);
  res.json({ success: true });
});

app.get('/api/store/recently-viewed', requireAuthApi, async (req, res) => {
  const entries = store.getRecentlyViewed(currentUser(req).id);
  const geoInfo = await getGeoInfo(req);
  const summaries = [];
  for (const entry of entries) {
    const product = products.findById(entry.productId);
    if (product && product.status === 'active') summaries.push(await storeProductSummary(product, geoInfo));
  }
  res.json({ success: true, products: summaries });
});

// --- Checkout ---

app.post('/api/store/checkout', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });

  const user = currentUser(req);
  const { items: rawItems, addressId } = req.body || {};
  if (!Array.isArray(rawItems) || !rawItems.length) return res.status(400).json({ success: false, error: 'Your cart is empty.' });

  const address = addressId ? addresses.findById(addressId) : null;
  if (!address || address.userId !== user.id) {
    return res.status(400).json({ success: false, error: 'Add a delivery address before checking out.', code: 'no_address' });
  }

  const items = [];
  for (const raw of rawItems) {
    const product = products.findById(raw.productId);
    const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
    if (!product || product.status !== 'active') {
      return res.status(400).json({ success: false, error: 'One of the items in your cart is no longer available.' });
    }
    const color = product.colors.find((c) => c.id === raw.colorId);
    if (!color) {
      return res.status(400).json({ success: false, error: `Please choose a color for "${product.name}".` });
    }
    const available = products.stockFor(product, color.id, address.country);
    if (available < quantity) {
      return res.status(400).json({
        success: false,
        error: `Only ${available} of "${product.name}" (${color.name}) left for delivery to ${address.countryName || address.country}.`,
      });
    }
    items.push({
      productId: product.id, productName: product.name, productSlug: product.slug,
      colorId: color.id, colorName: color.name, colorHex: color.hex,
      countryCode: address.country, quantity,
      unitPriceUsd: product.priceUsd, lineTotalUsd: Math.round(product.priceUsd * quantity * 100) / 100,
      image: product.coverImage,
    });
  }

  const subtotalUsd = Math.round(items.reduce((sum, item) => sum + item.lineTotalUsd, 0) * 100) / 100;
  const geoInfo = await getGeoInfo(req);
  const displayTotal = Math.round((await currency.convertFromUsd(subtotalUsd, geoInfo.currency)) * 100) / 100;

  const order = orders.createPending({
    userId: user.id,
    items,
    addressId: address.id,
    addressSnapshot: {
      label: address.label, fullName: address.fullName, phone: address.phone, country: address.country,
      countryName: address.countryName, state: address.state, city: address.city, street: address.street, postalCode: address.postalCode,
    },
    subtotalUsd, totalUsd: subtotalUsd,
    displayCurrency: geoInfo.currency, displaySymbol: geoInfo.symbol, displayTotal,
  });

  try {
    const session = await client.checkout.sessions.create({
      mode: 'payment',
      // Managed Payments (this Stripe account's default) requires a Stripe
      // Tax product tax_code on every line item unless explicitly disabled;
      // store products aren't registered with Stripe Tax, so opt out here -
      // same simple card checkout as the rest of this app's Stripe flows.
      managed_payments: { enabled: false },
      line_items: items.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: { name: `${item.productName} - ${item.colorName}` },
          unit_amount: Math.round(item.unitPriceUsd * 100),
        },
        quantity: item.quantity,
      })),
      customer_email: user.email,
      success_url: `${publicAppUrl(req)}/api/store/checkout/success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicAppUrl(req)}/cart`,
      metadata: { type: 'store-order', orderId: String(order.id) },
    });
    orders.attachStripeSession(order.id, session.id);
    res.json({ success: true, url: session.url });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Could not start checkout.' });
  }
});

// Stripe charges in USD always (avoids per-currency minor-unit handling for
// a global storefront) - session.amount_total confirms USD paid; stock is
// only decremented here, after payment is actually confirmed, so an
// abandoned checkout never holds inventory hostage. Guarded by
// order.status so a refreshed success page can't double-decrement.
app.get('/api/store/checkout/success', async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.redirect('/cart?order=error');
  const { sessionId } = req.query;
  if (!sessionId) return res.redirect('/cart?order=error');

  try {
    const session = await client.checkout.sessions.retrieve(sessionId);
    if (!session.metadata || session.metadata.type !== 'store-order') return res.redirect('/cart?order=error');
    const order = orders.findById(session.metadata.orderId);
    if (!order) return res.redirect('/cart?order=error');
    if (session.payment_status !== 'paid') return res.redirect('/cart?order=pending');

    if (order.status === 'pending_payment') {
      let shortItem = null;
      for (const item of order.items) {
        const result = products.decrementStock(item.productId, item.colorId, item.countryCode, item.quantity);
        if (!result.success) { shortItem = item; break; }
      }
      const paymentIntentId = stripeObjectId(session.payment_intent);
      if (shortItem) {
        orders.markFlagged(order.id, `Insufficient stock for ${shortItem.productName} (${shortItem.colorName}) after payment.`);
        notifyAdmins({ type: 'store_order_flagged', message: `Order ${order.orderNumber} needs attention: stock ran out after payment.`, subject: 'Mozart Techniques Store - order needs attention' });
      } else {
        orders.markPaid(order.id, { paymentIntentId });
      }
      store.addNotification(order.userId, { type: 'store_order_paid', message: `Your order ${order.orderNumber} has been paid and is being processed.`, href: '/store-profile?tab=orders' });
    }
    res.redirect(`/order-confirmation?order=${order.orderNumber}`);
  } catch (err) {
    console.error('Store checkout success error:', err.message);
    res.redirect('/cart?order=error');
  }
});

// --- Admin: products, reviews, orders ---

app.get('/api/admin/products', requireAdminApi, (req, res) => {
  const list = products.listAll(req.query.status ? { status: req.query.status } : {});
  const withStats = list.map((p) => ({ ...p, totalStock: products.totalStock(p), avgRating: productReviews.avgRating(p.id), reviewCount: productReviews.countFor(p.id) }));
  res.json({ success: true, products: withStats });
});

app.post('/api/admin/products', requireAdminApi, (req, res) => {
  const { name, category, description, priceUsd, coverImage, images, colors, status } = req.body || {};
  if (!name || !category || !coverImage) return res.status(400).json({ success: false, error: 'Name, category and a cover image are required.' });
  const colorError = validateProductColors(colors);
  if (colorError) return res.status(400).json({ success: false, error: colorError });
  const product = products.create({ name, category, description, priceUsd, coverImage, images, colors, status, createdBy: currentUser(req).id });
  // A live product (not a draft) pops up on every signed-in user's
  // dashboard - see QuickSearchSheet/NotificationBubbles-adjacent handling
  // on mobile and nav-auth.js's poll on web, both keyed off type:'new_product'.
  if (product.status !== 'draft') {
    store.listUsers().forEach((u) => {
      store.addNotification(u.id, { type: 'new_product', message: product.name, href: `/product?slug=${product.slug}`, imageUrl: product.coverImage });
    });
  }
  res.json({ success: true, product });
});

app.get('/api/admin/products/:id', requireAdminApi, (req, res) => {
  const product = products.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
  res.json({ success: true, product });
});

app.put('/api/admin/products/:id', requireAdminApi, (req, res) => {
  const { name, category, description, priceUsd, coverImage, images, colors, status } = req.body || {};
  if (colors != null) {
    const colorError = validateProductColors(colors);
    if (colorError) return res.status(400).json({ success: false, error: colorError });
  }
  const product = products.update(req.params.id, { name, category, description, priceUsd, coverImage, images, colors, status });
  if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
  res.json({ success: true, product });
});

app.delete('/api/admin/products/:id', requireAdminApi, (req, res) => {
  const product = products.archive(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
  res.json({ success: true, product });
});

app.post('/api/admin/products/upload-image', hydrateUploadToken, requireAdminApi, (req, res) => {
  productImageUpload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 8MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose an image to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'products') });
  });
});

app.get('/api/admin/products/:id/reviews', requireAdminApi, (req, res) => {
  res.json({ success: true, reviews: productReviews.listByProduct(req.params.id) });
});

app.post('/api/admin/products/reviews/:reviewId/reply', requireAdminApi, (req, res) => {
  const admin = currentUser(req);
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'Please enter a reply.' });
  const review = productReviews.addReply(req.params.reviewId, { adminId: admin.id, adminName: admin.name || 'Mozart Techniques', text });
  if (!review) return res.status(404).json({ success: false, error: 'Review not found.' });
  const product = products.findById(review.productId);
  store.addNotification(review.userId, { type: 'store_review_reply', message: `Mozart Techniques replied to your review of "${product ? product.name : 'a product'}".`, href: '/store-profile?tab=ratings' });
  res.json({ success: true, review });
});

app.get('/api/admin/orders', requireAdminApi, (req, res) => {
  res.json({ success: true, orders: orders.listAll(req.query.status ? { status: req.query.status } : {}) });
});

app.get('/api/admin/orders/:id', requireAdminApi, (req, res) => {
  const order = orders.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
  res.json({ success: true, order });
});

const ADMIN_SETTABLE_ORDER_STATUSES = ['processing', 'shipped', 'delivered', 'cancelled'];
app.post('/api/admin/orders/:id/status', requireAdminApi, (req, res) => {
  const { status, message } = req.body || {};
  if (!ADMIN_SETTABLE_ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid order status.' });
  }
  const order = orders.setStatus(req.params.id, status, message);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
  store.addNotification(order.userId, { type: 'store_order_update', message: message || `Your order ${order.orderNumber} is now ${status}.`, href: '/store-profile?tab=orders' });
  res.json({ success: true, order });
});

// ==================== END STORE ====================

// ==================== PERFORMANCE MARKETPLACE ====================

const ACTIVATION_FEE_USD = 1.5;

function performerPublicSummary(p) {
  const hourlyRateUsd = Number(p.hourlyRateUsd) || (p.rateUnit === 'per_hour' ? Number(p.baseRateUsd) || 0 : 0);
  const eventRateUsd = Number(p.eventRateUsd) || (p.rateUnit !== 'per_hour' ? Number(p.baseRateUsd) || 0 : 0);
  return {
    slug: performers.publicSlug(p),
    id: p.id, name: p.name, performerType: p.performerType, groupSize: p.groupSize,
    categories: p.categories, city: p.city, locality: p.locality, photoUrl: p.photoUrl,
    baseRateUsd: p.baseRateUsd, rateUnit: p.rateUnit, hourlyRateUsd, eventRateUsd, bio: p.bio, experienceYears: p.experienceYears,
    avgRating: performers.avgRating(p), ratingCount: p.ratingCount || 0, isSuperArtist: performers.isSuperArtist(p),
  };
}

function performerFullPublicView(p) {
  const hourlyRateUsd = Number(p.hourlyRateUsd) || (p.rateUnit === 'per_hour' ? Number(p.baseRateUsd) || 0 : 0);
  const eventRateUsd = Number(p.eventRateUsd) || (p.rateUnit !== 'per_hour' ? Number(p.baseRateUsd) || 0 : 0);
  return {
    id: p.id, name: p.name, performerType: p.performerType, groupSize: p.groupSize, categories: p.categories,
    city: p.city, locality: p.locality, bio: p.bio, experienceYears: p.experienceYears, qualifications: p.qualifications,
    styleTags: p.styleTags, baseRateUsd: p.baseRateUsd, rateUnit: p.rateUnit, hourlyRateUsd, eventRateUsd, photoUrl: p.photoUrl,
    galleryPhotos: p.galleryPhotos, videoClips: p.videoClips, socialLinks: p.socialLinks,
    avgRating: performers.avgRating(p), ratingCount: p.ratingCount || 0, isSuperArtist: performers.isSuperArtist(p),
  };
}

// Performer earnings remain in USD internally because Stripe, payouts and
// marketplace negotiations use that canonical amount.  Responses include a
// local display amount so a performer never has to mentally convert their
// own per-event or hourly rate.
async function performerRateForViewer(p, geoInfo) {
  const hourlyRateUsd = Number(p.hourlyRateUsd) || (p.rateUnit === 'per_hour' ? Number(p.baseRateUsd) || 0 : 0);
  const eventRateUsd = Number(p.eventRateUsd) || (p.rateUnit !== 'per_hour' ? Number(p.baseRateUsd) || 0 : 0);
  const [hourlyRateLocal, eventRateLocal] = await Promise.all([
    currency.convertFromUsd(hourlyRateUsd, geoInfo.currency),
    currency.convertFromUsd(eventRateUsd, geoInfo.currency),
  ]);
  const baseRateLocal = p.rateUnit === 'per_hour' ? hourlyRateLocal : eventRateLocal;
  return {
    baseRateLocal: Math.round(baseRateLocal * 100) / 100,
    hourlyRateUsd,
    eventRateUsd,
    hourlyRateLocal: Math.round(hourlyRateLocal * 100) / 100,
    eventRateLocal: Math.round(eventRateLocal * 100) / 100,
    currency: geoInfo.currency,
    symbol: geoInfo.symbol,
  };
}

function decoratedOfferForRequester(offer) {
  const performer = performers.findById(offer.performerId);
  return {
    ...offer,
    performerName: performer ? performer.name : 'Performer',
    performerPhotoUrl: performer ? performer.photoUrl : null,
    performerBio: performer ? performer.bio : null,
    performerCity: performer ? performer.city : null,
  };
}

function summarizeOfferCounts(offers) {
  const counts = { invited: 0, accepted: 0, countered: 0, declined: 0, expired: 0, selected: 0, not_selected: 0 };
  offers.forEach((o) => { if (counts[o.status] != null) counts[o.status] += 1; });
  return counts;
}

function notifyMatchingPerformers(req, request, matches) {
  matches.forEach(({ performer }) => {
    const details = [
      `${request.eventType} - ${request.performerCategory}`,
      `Date: ${request.eventDate || 'TBD'}`,
      `Duration: ${request.eventDurationHours || 'TBD'} hour(s)`,
      `Location: ${request.eventLocation}`,
      `Budget: $${request.proposedAmountUsd}`,
      request.notes ? `Details: ${request.notes}` : null,
      request.eventMedia && request.eventMedia.length ? `${request.eventMedia.length} event media attachment(s) included.` : null,
    ].filter(Boolean).join(' | ');
    store.addNotification(performer.userId, {
      type: 'marketplace_request_invite',
      message: `New booking request: ${details}`,
      href: '/performer?tab=requests',
    });
    const performerUser = store.findById(performer.userId);
    if (performerUser && performerUser.email) {
      mailer.sendMail({
        to: performerUser.email,
        subject: 'Mozart Techniques - New booking request',
        text: `A new booking request matches your profile.\n\n${details.replaceAll(' | ', '\n')}\n\nRespond in your Performer Dashboard: ${publicAppUrl(req)}/performer`,
      });
    }
  });
}

function notifyRequesterOfResponse(offer, kind) {
  const request = marketplaceRequests.findById(offer.requestId);
  const performer = performers.findById(offer.performerId);
  if (!request || !performer) return;
  store.addNotification(request.requesterId, {
    type: kind === 'accepted' ? 'marketplace_offer_accepted' : 'marketplace_offer_countered',
    message: `${performer.name} ${kind === 'accepted' ? 'accepted your offer' : 'sent a counter-offer'} for your "${request.eventType}" booking request.`,
    href: '/performance-requests',
  });
}

// --- Taxonomy (public read, admin-gated append) ---

app.get('/api/performer-categories', (req, res) => {
  res.json({ success: true, categories: taxonomy.loadPerformerCategories() });
});

app.post('/api/admin/performer-categories', requireAdminApi, (req, res) => {
  const name = String((req.body && req.body.category) || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ success: false, error: 'Category name is required.' });
  const existing = taxonomy.loadPerformerCategories();
  if (existing.some((c) => c.toLowerCase() === name.toLowerCase())) return res.status(409).json({ success: false, error: 'That category already exists.' });
  res.json({ success: true, categories: taxonomy.addPerformerCategory(name) });
});

// A performer applying who doesn't see their own category in the list can
// add it themselves (any signed-in user, not admin-only) - it's saved to
// the same shared list the admin route above appends to, so it immediately
// shows up as a real filter chip on Find a Performer for everyone, not just
// a value stored on that one performer's own record.
app.post('/api/performer-categories', requireAuthApi, (req, res) => {
  const name = String((req.body && req.body.category) || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ success: false, error: 'Category name is required.' });
  const existing = taxonomy.loadPerformerCategories();
  const match = existing.find((c) => c.toLowerCase() === name.toLowerCase());
  if (match) return res.json({ success: true, categories: existing, category: match });
  res.json({ success: true, categories: taxonomy.addPerformerCategory(name), category: name });
});

app.get('/api/event-types', (req, res) => {
  res.json({ success: true, eventTypes: taxonomy.loadEventTypes() });
});

app.post('/api/admin/event-types', requireAdminApi, (req, res) => {
  const name = String((req.body && req.body.eventType) || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ success: false, error: 'Event type name is required.' });
  const existing = taxonomy.loadEventTypes();
  if (existing.some((e) => e.toLowerCase() === name.toLowerCase())) return res.status(409).json({ success: false, error: 'That event type already exists.' });
  res.json({ success: true, eventTypes: taxonomy.addEventType(name) });
});

app.get('/api/benchmark-rates', async (req, res) => {
  const { category, country } = req.query;
  if (!category) return res.status(400).json({ success: false, error: 'category is required.' });
  const geoInfo = await getGeoInfo(req);
  const rate = benchmarkRates.getRate(category, country || geoInfo.countryCode);
  if (!rate) return res.json({ success: true, rate: null });
  const amountLocal = Math.round((await currency.convertFromUsd(rate.amountUsd, geoInfo.currency)) * 100) / 100;
  res.json({ success: true, rate: { category: rate.category, amountUsd: rate.amountUsd, amountLocal, currency: geoInfo.currency, symbol: geoInfo.symbol } });
});

app.get('/api/admin/benchmark-rates', requireAdminApi, (req, res) => {
  res.json({ success: true, rates: benchmarkRates.listAll() });
});

app.post('/api/admin/benchmark-rates', requireAdminApi, (req, res) => {
  const { category, country, amountUsd } = req.body || {};
  if (!category || !amountUsd) return res.status(400).json({ success: false, error: 'Category and amount are required.' });
  const rate = benchmarkRates.setRate({ category, country: country || null, amountUsd, updatedByUserId: currentUser(req).id });
  res.json({ success: true, rate });
});

// --- Public performer browsing ---

app.get('/api/performers', async (req, res) => {
  const { category, city } = req.query;
  let list = performers.listApproved();
  if (category) list = list.filter((p) => (p.categories || []).includes(category));
  if (city) list = list.filter((p) => (p.city || '').toLowerCase().includes(String(city).toLowerCase()));
  const geoInfo = await getGeoInfo(req);
  res.json({ success: true, performers: await Promise.all(list.map(async (p) => ({ ...performerPublicSummary(p), ...(await performerRateForViewer(p, geoInfo)) }))) });
});

app.get('/api/performers/:id/public', async (req, res) => {
  const performer = performers.findById(req.params.id);
  if (!performer || performer.status !== 'approved' || performer.suspended) return res.status(404).json({ success: false, error: 'Performer not found.' });
  const geoInfo = await getGeoInfo(req);
  res.json({ success: true, performer: { ...performerFullPublicView(performer), ...(await performerRateForViewer(performer, geoInfo)) } });
});

app.get('/api/performers/slug/:slug', async (req, res) => {
  const performer = performers.findBySlug(req.params.slug);
  if (!performer || performer.status !== 'approved' || performer.suspended) return res.status(404).json({ success: false, error: 'Performer not found.' });
  const geoInfo = await getGeoInfo(req);
  res.json({ success: true, performer: { ...performerFullPublicView(performer), ...(await performerRateForViewer(performer, geoInfo)) } });
});

function publicPerformerPost(post, viewerId) {
  const performer = performers.findById(post.performerId);
  if (!performer || performer.status !== 'approved' || performer.suspended) return null;
  const reactions = Array.isArray(post.reactions) ? post.reactions : [];
  const comments = Array.isArray(post.comments) ? post.comments : [];
  return {
    id: post.id,
    text: post.text || '',
    mediaUrl: post.mediaUrl || null,
    mediaType: post.mediaType || 'text',
    createdAt: post.createdAt,
    updatedAt: post.updatedAt || post.createdAt,
    performer: performerPublicSummary(performer),
    reactionCount: reactions.length,
    reactedByCurrentUser: reactions.some((reaction) => Number(reaction.userId) === Number(viewerId)),
    comments: comments.map((comment) => ({
      id: comment.id,
      userId: comment.userId,
      userName: comment.userName || 'Mozart Techniques member',
      userPhotoUrl: comment.userPhotoUrl || null,
      text: comment.text,
      createdAt: comment.createdAt,
    })),
  };
}

// Marketplace messages open only after a performer has accepted an offer or
// a requester has selected their counter-offer.  A plain counter-offer is
// still a negotiation, not a confirmed booking, so it cannot open a chat.
const MARKETPLACE_CHAT_STATUSES = new Set(['accepted', 'selected']);

function eligibleMarketplaceChatOffer(offer, request, performer) {
  if (!offer || !request || !performer) return false;
  if (!MARKETPLACE_CHAT_STATUSES.has(offer.status)) return false;
  if (request.status === 'cancelled') return false;
  if (Number(offer.requestId) !== Number(request.id) || Number(offer.performerId) !== Number(performer.id)) return false;
  // An accepted offer is chat-enabled while the requester is deciding.  A
  // counter-offer becomes chat-enabled only when it has actually been
  // selected, preventing unconfirmed negotiations from becoming DMs.
  if (offer.status === 'accepted') return request.status === 'open';
  return request.status === 'closed' && Number(request.selectedOfferId) === Number(offer.id);
}

function ensureMarketplaceConversation(offer) {
  const request = marketplaceRequests.findById(offer && offer.requestId);
  const performer = performers.findById(offer && offer.performerId);
  if (!eligibleMarketplaceChatOffer(offer, request, performer)) return null;
  return marketplaceChat.getOrCreateConversation({ offer, request, performer });
}

// The persistent conversation only stores a historical snapshot.  Every API
// request re-resolves the live offer, request and performer before returning
// it, so a cancelled/not-selected booking immediately loses message access.
function resolveMarketplaceConversationAccess(user, conversationId) {
  const conversation = marketplaceChat.findById(conversationId);
  if (!conversation) return null;
  const offer = marketplaceOffers.findById(conversation.offerId);
  const request = marketplaceRequests.findById(conversation.requestId);
  const performer = performers.findById(conversation.performerId);
  if (!eligibleMarketplaceChatOffer(offer, request, performer)) return null;
  if (Number(request.requesterId) === Number(user.id)) {
    return { conversation, offer, request, performer, role: 'requester' };
  }
  if (Number(performer.userId) === Number(user.id)) {
    return { conversation, offer, request, performer, role: 'performer' };
  }
  return null;
}

function marketplaceConversationSummary(access, user) {
  const { conversation, offer, request, performer, role } = access;
  const requester = store.findById(request.requesterId);
  const client = {
    id: request.requesterId,
    userId: request.requesterId,
    name: (requester && requester.name) || request.requesterName || 'Requester',
    photoUrl: (requester && requester.photoUrl) || null,
    role: 'requester',
  };
  const otherParty = role === 'performer'
    ? client
    : {
      id: performer.userId,
      userId: performer.userId,
      name: performer.name || 'Performer',
      photoUrl: performer.photoUrl || null,
      role: 'performer',
    };
  const messages = conversation.messages || [];
  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  return {
    id: conversation.id,
    offerId: offer.id,
    requestId: request.id,
    role,
    client,
    requester: client,
    participant: otherParty,
    otherParty,
    eventType: request.eventType || 'Performance booking',
    eventDate: request.eventDate || null,
    eventLocation: request.eventLocation || null,
    status: offer.status,
    amountUsd: offer.counterAmountUsd || offer.proposedAmountUsd || 0,
    booking: {
      eventType: request.eventType || 'Performance booking',
      eventDate: request.eventDate || null,
      eventLocation: request.eventLocation || null,
      status: offer.status,
      amountUsd: offer.status === 'selected' || offer.status === 'accepted'
        ? (offer.counterAmountUsd || offer.proposedAmountUsd || 0)
        : 0,
    },
    unreadCount: marketplaceChat.unreadCount(conversation, role),
    lastMessage: lastMessage
      ? { id: lastMessage.id, text: lastMessage.text, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt }
      : null,
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt || conversation.createdAt,
    updatedAt: conversation.lastMessageAt || conversation.createdAt,
  };
}

function eligibleMarketplaceConversationAccessesForUser(user) {
  const candidateOffers = [];
  const seenOfferIds = new Set();
  const addOffer = (offer) => {
    if (!offer || seenOfferIds.has(Number(offer.id))) return;
    seenOfferIds.add(Number(offer.id));
    const request = marketplaceRequests.findById(offer.requestId);
    const performer = performers.findById(offer.performerId);
    if (!eligibleMarketplaceChatOffer(offer, request, performer)) return;
    const isRequester = Number(request.requesterId) === Number(user.id);
    const isPerformer = Number(performer.userId) === Number(user.id);
    if (!isRequester && !isPerformer) return;
    candidateOffers.push(offer);
  };

  marketplaceRequests.listByRequester(user.id)
    .forEach((request) => marketplaceOffers.listByRequest(request.id).forEach(addOffer));
  const performer = performers.findByUserId(user.id);
  if (performer) marketplaceOffers.listByPerformer(performer.id).forEach(addOffer);

  return candidateOffers
    .map((offer) => ensureMarketplaceConversation(offer))
    .filter(Boolean)
    .map((conversation) => resolveMarketplaceConversationAccess(user, conversation.id))
    .filter(Boolean);
}

// A public, social-style portfolio feed used by Find a Performer.  It is
// signed-in so reactions and comments are attributable and can be moderated.
app.get('/api/performer-posts', requireAuthApi, (req, res) => {
  const viewer = currentUser(req);
  const posts = performerPosts.listAll()
    .map((post) => publicPerformerPost(post, viewer.id))
    .filter(Boolean);
  res.json({ success: true, posts });
});

app.get('/api/performers/me/posts', requirePerformerProfileApi, (req, res) => {
  const viewer = currentUser(req);
  const posts = performerPosts.listByPerformer(req.performerProfile.id)
    .map((post) => ({
      ...post,
      reactionCount: Array.isArray(post.reactions) ? post.reactions.length : 0,
      reactedByCurrentUser: (post.reactions || []).some((reaction) => Number(reaction.userId) === Number(viewer.id)),
    }));
  res.json({ success: true, posts });
});

app.post('/api/performers/me/posts', requirePerformerProfileApi, (req, res) => {
  const { text, mediaUrl, mediaType } = req.body || {};
  const cleanText = String(text || '').trim();
  const cleanUrl = String(mediaUrl || '').trim();
  if (!cleanText && !cleanUrl) return res.status(400).json({ success: false, error: 'Add a caption, a photo, or a video before posting.' });
  const post = performerPosts.create({ performerId: req.performerProfile.id, text: cleanText, mediaUrl: cleanUrl, mediaType });
  res.status(201).json({ success: true, post });
});

app.delete('/api/performers/me/posts/:id', requirePerformerProfileApi, (req, res) => {
  if (!performerPosts.remove(req.params.id, req.performerProfile.id)) return res.status(404).json({ success: false, error: 'Post not found.' });
  res.json({ success: true });
});

app.post('/api/performer-posts/:id/reaction', requireAuthApi, (req, res) => {
  const viewer = currentUser(req);
  const post = performerPosts.findById(req.params.id);
  if (!post || !publicPerformerPost(post, viewer.id)) return res.status(404).json({ success: false, error: 'Post not found.' });
  const updated = performerPosts.toggleReaction(post.id, viewer.id);
  res.json({ success: true, post: publicPerformerPost(updated, viewer.id) });
});

app.post('/api/performer-posts/:id/comments', requireAuthApi, (req, res) => {
  const viewer = currentUser(req);
  const post = performerPosts.findById(req.params.id);
  if (!post || !publicPerformerPost(post, viewer.id)) return res.status(404).json({ success: false, error: 'Post not found.' });
  const result = performerPosts.addComment(post.id, {
    userId: viewer.id,
    userName: viewer.name,
    userPhotoUrl: viewer.photoUrl,
    text: req.body && req.body.text,
  });
  if (!result) return res.status(400).json({ success: false, error: 'Write a comment before sending it.' });
  res.status(201).json({ success: true, post: publicPerformerPost(result.post, viewer.id) });
});

// --- Performer profile (signed-in) ---

app.get('/api/performers/me', requireAuthApi, async (req, res) => {
  const profile = performers.findByUserId(currentUser(req).id);
  if (!profile) return res.json({ success: true, profile: null });
  const geoInfo = await getGeoInfo(req);
  res.json({ success: true, profile: { ...profile, ...(await performerRateForViewer(profile, geoInfo)) } });
});

app.post('/api/performers/apply', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  if (performers.findByUserId(user.id)) {
    return res.status(409).json({ success: false, error: 'You already have a performer application on file.' });
  }
  const {
    performerType, groupSize, categories, city, address, phone, travelRadiusKm,
    bio, experienceYears, qualifications, styleTags, baseRateUsd, rateUnit, photoUrl, socialLinks, agreementAccepted,
  } = req.body || {};
  if (performerType === 'group' && (!Number.isInteger(Number(groupSize)) || Number(groupSize) < 2)) return res.status(400).json({ success: false, error: "Group size can't be lower than 2 and must be a whole number." });
  if (!Array.isArray(categories) || !categories.length) return res.status(400).json({ success: false, error: 'Choose at least one performer category.' });
  if (!city || !bio || !photoUrl) return res.status(400).json({ success: false, error: 'City, bio and a profile photo are required.' });
  if (!baseRateUsd || Number(baseRateUsd) <= 0) return res.status(400).json({ success: false, error: 'Set your rate.' });
  if (agreementAccepted !== true) return res.status(400).json({ success: false, error: 'Accept the performer agreement before applying.' });

  const profile = await performers.apply({
    userId: user.id, name: String(req.body.name || user.name).trim().slice(0, 100) || user.name, email: user.email, phone, performerType, groupSize, categories,
    city, address, travelRadiusKm, bio, experienceYears, qualifications, styleTags, baseRateUsd, rateUnit,
    photoUrl, socialLinks, agreementAccepted,
  });

  notifyAdmins({
    type: 'performer-application',
    subject: `New performer application - ${user.name}`,
    message: `New performer application from ${user.name} (${user.email}) - review it in the admin panel.`,
  });

  res.json({ success: true, profile });
});

app.post('/api/performers/me/categories', requirePerformerProfileApi, (req, res) => {
  const validCategories = taxonomy.loadPerformerCategories();
  const canonicalCategories = new Map(validCategories.map((category) => [category.toLowerCase(), category]));
  const categories = Array.isArray(req.body.categories)
    ? [...new Set(req.body.categories
      .map((category) => canonicalCategories.get(String(category).trim().toLowerCase()))
      .filter(Boolean))]
    : [];
  if (!categories.length) return res.status(400).json({ success: false, error: 'Choose at least one category.' });
  res.json({ success: true, profile: performers.setCategories(req.performerProfile.id, categories) });
});

// Keep this separate from the reviewed performer application.  A performer
// can refresh their public introduction, but cannot use this route to alter
// approval-sensitive identity, category, location, or payment information.
app.post('/api/performers/me/about', requirePerformerProfileApi, async (req, res) => {
  const body = req.body || {};
  const current = req.performerProfile;
  if (body.bio != null && typeof body.bio !== 'string') {
    return res.status(400).json({ success: false, error: 'Bio must be text.' });
  }
  if (body.qualifications != null && typeof body.qualifications !== 'string') {
    return res.status(400).json({ success: false, error: 'Qualifications must be text.' });
  }
  if (body.experienceYears != null && (!Number.isFinite(Number(body.experienceYears)) || Number(body.experienceYears) < 0 || Number(body.experienceYears) > 100)) {
    return res.status(400).json({ success: false, error: 'Experience must be between 0 and 100 years.' });
  }
  if (body.styleTags != null && !Array.isArray(body.styleTags)) {
    return res.status(400).json({ success: false, error: 'Styles must be a list.' });
  }

  const bio = body.bio == null ? String(current.bio || '') : body.bio.trim();
  const qualifications = body.qualifications == null ? String(current.qualifications || '') : body.qualifications.trim();
  if (bio.length > 1500) return res.status(400).json({ success: false, error: 'Bio can be up to 1,500 characters.' });
  if (qualifications.length > 800) return res.status(400).json({ success: false, error: 'Qualifications can be up to 800 characters.' });

  const tagSource = body.styleTags == null ? (current.styleTags || []) : body.styleTags;
  const tagsByKey = new Map();
  for (const value of tagSource) {
    if (typeof value !== 'string') return res.status(400).json({ success: false, error: 'Each style must be text.' });
    const tag = value.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > 50) return res.status(400).json({ success: false, error: 'Each style can be up to 50 characters.' });
    if (!tagsByKey.has(tag.toLowerCase())) tagsByKey.set(tag.toLowerCase(), tag);
  }
  const styleTags = [...tagsByKey.values()];
  if (styleTags.length > 12) return res.status(400).json({ success: false, error: 'Add up to 12 styles.' });

  const profile = performers.updateAbout(current.id, {
    bio,
    experienceYears: body.experienceYears == null ? current.experienceYears : Number(body.experienceYears),
    qualifications,
    styleTags,
  });
  const geoInfo = await getGeoInfo(req);
  res.json({ success: true, profile: { ...profile, ...(await performerRateForViewer(profile, geoInfo)) } });
});

app.post('/api/performers/me/rate', requirePerformerProfileApi, async (req, res) => {
  const { baseRateUsd, baseRateLocal, rateUnit, hourlyRateLocal, eventRateLocal } = req.body || {};
  const hasNewRates = hourlyRateLocal != null || eventRateLocal != null;
  const suppliedRate = baseRateLocal != null ? baseRateLocal : baseRateUsd;
  if (hasNewRates) {
    const validHourly = hourlyRateLocal == null || hourlyRateLocal === '' || Number(hourlyRateLocal) >= 0;
    const validEvent = eventRateLocal == null || eventRateLocal === '' || Number(eventRateLocal) >= 0;
    if (!validHourly || !validEvent || (!Number(hourlyRateLocal) && !Number(eventRateLocal))) {
      return res.status(400).json({ success: false, error: 'Enter a valid hourly or event rate.' });
    }
  } else if (!suppliedRate || Number(suppliedRate) <= 0) {
    return res.status(400).json({ success: false, error: 'Enter a valid rate.' });
  }
  const geoInfo = await getGeoInfo(req);
  const profile = hasNewRates
    ? performers.setRate(req.performerProfile.id, {
      hourlyRateUsd: Number(hourlyRateLocal) > 0 ? await currency.convertToUsd(Number(hourlyRateLocal), geoInfo.currency) : 0,
      eventRateUsd: Number(eventRateLocal) > 0 ? await currency.convertToUsd(Number(eventRateLocal), geoInfo.currency) : 0,
    })
    : performers.setRate(req.performerProfile.id, {
      baseRateUsd: baseRateLocal != null ? await currency.convertToUsd(Number(baseRateLocal), geoInfo.currency) : Number(baseRateUsd),
      rateUnit,
    });
  res.json({ success: true, profile: { ...profile, ...(await performerRateForViewer(profile, geoInfo)) } });
});

app.post('/api/performers/me/photo', requirePerformerProfileApi, (req, res) => {
  const { photoUrl } = req.body || {};
  if (!photoUrl) return res.status(400).json({ success: false, error: 'A photo URL is required.' });
  res.json({ success: true, profile: performers.setPhoto(req.performerProfile.id, photoUrl) });
});

app.post('/api/performers/me/gallery', requirePerformerProfileApi, (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ success: false, error: 'An image URL is required.' });
  res.json({ success: true, profile: performers.addGalleryPhoto(req.performerProfile.id, url) });
});

app.delete('/api/performers/me/gallery', requirePerformerProfileApi, (req, res) => {
  const { url } = req.body || {};
  res.json({ success: true, profile: performers.removeGalleryPhoto(req.performerProfile.id, url) });
});

app.post('/api/performers/me/videos', requirePerformerProfileApi, (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ success: false, error: 'A video URL is required.' });
  const cleanUrl = String(url).trim();
  const isUploadedClip = cleanUrl.startsWith('/uploads/performer-videos/');
  let isPublicLink = false;
  try { isPublicLink = ['http:', 'https:'].includes(new URL(cleanUrl).protocol); } catch { /* handled below */ }
  if (!isUploadedClip && !isPublicLink) return res.status(400).json({ success: false, error: 'Use an uploaded clip or a valid http(s) video link.' });
  res.json({ success: true, profile: performers.addVideo(req.performerProfile.id, cleanUrl) });
});

app.delete('/api/performers/me/videos', requirePerformerProfileApi, (req, res) => {
  const { url } = req.body || {};
  res.json({ success: true, profile: performers.removeVideo(req.performerProfile.id, url) });
});

app.post('/api/performers/me/social-links', requirePerformerProfileApi, (req, res) => {
  res.json({ success: true, profile: performers.setSocialLinks(req.performerProfile.id, req.body || {}) });
});

// Records acceptance of the mandatory 14-screen Performer Orientation modal
// (mobile/src/data/performerOrientationContent.ts) - mirrors tutors' own
// /api/tutors/me/tutor-orientation/acknowledge. requirePerformerProfileApi
// (not requireApprovedPerformerApi) on purpose - the modal itself only ever
// triggers once status is 'approved', before the separate activation fee is
// necessarily paid, so this shouldn't 402 on an unpaid-but-approved performer.
app.post('/api/performers/me/performer-orientation/acknowledge', requirePerformerProfileApi, (req, res) => {
  const { version } = req.body || {};
  const updated = performers.acknowledgePerformerOrientation(req.performerProfile.id, version);
  if (!updated) return res.status(404).json({ success: false, error: 'Performer profile not found.' });
  res.json({ success: true, performerOrientationAcceptedAt: updated.performerOrientationAcceptedAt, performerOrientationVersion: updated.performerOrientationVersion });
});

app.post('/api/uploads/performer-video', hydrateUploadToken, requireAuthApi, (req, res) => {
  performerVideoUpload.single('video')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Video is too large (max 200MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a video to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'performer-videos') });
  });
});

// --- One-time activation fee (both roles share one Stripe success handler) ---

app.post('/api/performers/me/activation-fee/checkout', requirePerformerProfileApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  const profile = req.performerProfile;
  if (profile.status !== 'approved') return res.status(400).json({ success: false, error: 'Your performer application is not approved yet.' });
  if (profile.activationPaid) return res.status(400).json({ success: false, error: 'Activation fee already paid.' });
  const user = currentUser(req);
  try {
    const session = await client.checkout.sessions.create({
      mode: 'payment',
      managed_payments: { enabled: false },
      line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Mozart Techniques - Performer Activation Fee' }, unit_amount: Math.round(ACTIVATION_FEE_USD * 100) }, quantity: 1 }],
      customer_email: user.email,
      success_url: `${publicAppUrl(req)}/api/activation-fee/checkout/success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicAppUrl(req)}/performer`,
      metadata: { type: 'activation-fee', role: 'performer', profileId: String(profile.id) },
    });
    res.json({ success: true, url: session.url });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Could not start checkout.' });
  }
});

app.post('/api/tutors/me/activation-fee/checkout', requireTutorProfileApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  const profile = req.tutorProfile;
  if (profile.status !== 'approved') return res.status(400).json({ success: false, error: 'Your tutor application is not approved yet.' });
  if (profile.activationPaid) return res.status(400).json({ success: false, error: 'Activation fee already paid.' });
  const user = currentUser(req);
  try {
    const session = await client.checkout.sessions.create({
      mode: 'payment',
      managed_payments: { enabled: false },
      line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Mozart Techniques - Tutor Activation Fee' }, unit_amount: Math.round(ACTIVATION_FEE_USD * 100) }, quantity: 1 }],
      customer_email: user.email,
      success_url: `${publicAppUrl(req)}/api/activation-fee/checkout/success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicAppUrl(req)}/tutor`,
      metadata: { type: 'activation-fee', role: 'tutor', profileId: String(profile.id) },
    });
    res.json({ success: true, url: session.url });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Could not start checkout.' });
  }
});

app.get('/api/activation-fee/checkout/success', async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.redirect('/dashboard?activation=error');
  const { sessionId } = req.query;
  if (!sessionId) return res.redirect('/dashboard?activation=error');
  try {
    const session = await client.checkout.sessions.retrieve(sessionId);
    if (!session.metadata || session.metadata.type !== 'activation-fee') return res.redirect('/dashboard?activation=error');
    if (session.payment_status !== 'paid') return res.redirect('/dashboard?activation=pending');
    const { role, profileId } = session.metadata;
    if (role === 'performer') {
      const profile = performers.findById(profileId);
      if (profile && !profile.activationPaid) {
        performers.markActivationPaid(profile.id);
        store.addNotification(profile.userId, { type: 'marketplace_activation_paid', message: 'Activation fee received - your Performer Dashboard is now unlocked.', href: '/performer' });
      }
      return res.redirect('/performer?activation=success');
    }
    if (role === 'tutor') {
      const profile = tutors.findById(profileId);
      if (profile && !profile.activationPaid) {
        tutors.markActivationPaid(profile.id);
        store.addNotification(profile.userId, { type: 'marketplace_activation_paid', message: 'Activation fee received - your Tutor Dashboard is now unlocked.', href: '/tutor' });
      }
      return res.redirect('/tutor?activation=success');
    }
    res.redirect('/dashboard?activation=error');
  } catch (err) {
    console.error('Activation fee checkout success error:', err.message);
    res.redirect('/dashboard?activation=error');
  }
});

// --- Marketplace requests (requester side) ---

app.post('/api/marketplace/requests', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const { eventType, performerCategory, eventDate, eventDurationHours, eventLocation, radiusKm, proposedAmountUsd, notes, phone, eventMedia, performerId } = req.body || {};
  if (!eventType || !performerCategory || !eventLocation || !proposedAmountUsd) {
    return res.status(400).json({ success: false, error: 'Event type, performer category, location and a proposed amount are required.' });
  }
  if (performerId) {
    const target = performers.findById(performerId);
    if (!target || target.status !== 'approved' || target.suspended || !target.activationPaid) {
      return res.status(400).json({ success: false, error: 'This performer is not available to book right now.' });
    }
    if (target.userId === user.id) {
      return res.status(400).json({ success: false, error: "You can't request yourself." });
    }
  }
  const { request, matches } = await marketplaceRequests.create({
    requesterId: user.id, requesterName: user.name, requesterEmail: user.email, requesterPhone: phone,
    eventType, performerCategory, eventDate, eventDurationHours, eventLocation, radiusKm, proposedAmountUsd, notes, eventMedia,
    targetPerformerId: performerId || undefined,
  });
  const invites = marketplaceOffers.createInvites(request.id, request.proposedAmountUsd, matches);
  notifyMatchingPerformers(req, request, matches);
  res.json({ success: true, request, invitedCount: invites.length, locationResolved: Boolean(request.lat) });
});

app.get('/api/marketplace/requests/mine', requireAuthApi, (req, res) => {
  const list = marketplaceRequests.listByRequester(currentUser(req).id).map((r) => ({
    ...r,
    offers: marketplaceOffers.listByRequest(r.id).map(decoratedOfferForRequester),
  }));
  res.json({ success: true, requests: list });
});

app.get('/api/marketplace/requests/:id', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const request = marketplaceRequests.findById(req.params.id);
  if (!request || (request.requesterId !== user.id && user.role !== 'admin')) return res.status(404).json({ success: false, error: 'Request not found.' });
  const offers = marketplaceOffers.listByRequest(request.id).map(decoratedOfferForRequester);
  res.json({ success: true, request, offers });
});

// A requester rates the performer they booked, once the request has reached
// 'closed' (a performer was actually selected) - this feeds the same
// avgRating/isSuperArtist eligibility performers.js already computes for
// tutors' "SuperTutor" badge.
app.post('/api/marketplace/requests/:id/rate-performer', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const request = marketplaceRequests.findById(req.params.id);
  if (!request || request.requesterId !== user.id) return res.status(404).json({ success: false, error: 'Request not found.' });
  if (request.status !== 'closed' || !request.selectedPerformerId) return res.status(400).json({ success: false, error: 'Select and book a performer before rating them.' });
  if (request.performerRating) return res.status(400).json({ success: false, error: 'You already rated this booking.' });
  const score = Number(req.body && req.body.score);
  if (!Number.isFinite(score) || score < 1 || score > 5) return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5.' });
  performers.addRating(request.selectedPerformerId, { score });
  const updated = marketplaceRequests.setPerformerRating(request.id, score);
  res.json({ success: true, request: updated });
});

app.post('/api/marketplace/requests/:id/cancel', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const request = marketplaceRequests.findById(req.params.id);
  if (!request || request.requesterId !== user.id) return res.status(404).json({ success: false, error: 'Request not found.' });
  res.json({ success: true, request: marketplaceRequests.cancel(request.id) });
});

app.post('/api/marketplace/requests/:id/select', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const request = marketplaceRequests.findById(req.params.id);
  if (!request || request.requesterId !== user.id) return res.status(404).json({ success: false, error: 'Request not found.' });
  if (request.status !== 'open') return res.status(400).json({ success: false, error: 'This request is no longer open.' });
  const { offerId } = req.body || {};
  const offer = marketplaceOffers.findById(offerId);
  if (!offer || offer.requestId !== request.id) return res.status(404).json({ success: false, error: 'Offer not found.' });
  if (!['accepted', 'countered'].includes(offer.status)) return res.status(400).json({ success: false, error: 'You can only select an offer that has been accepted or countered.' });

  const selectedOffer = marketplaceOffers.select(offer.id);
  marketplaceOffers.markOthersNotSelected(request.id, offer.id);
  const updated = marketplaceRequests.selectOffer(request.id, offer);
  const conversation = ensureMarketplaceConversation(selectedOffer || offer);

  const performer = performers.findById(offer.performerId);
  if (performer) {
    store.addNotification(performer.userId, {
      type: 'marketplace_offer_selected',
      message: `You were selected for the "${request.eventType}" booking on ${request.eventDate || 'the requested date'}.`,
      href: '/performer?tab=requests',
    });
  }
  marketplaceOffers.listByRequest(request.id)
    .filter((o) => o.status === 'not_selected')
    .forEach((o) => {
      const p = performers.findById(o.performerId);
      if (p) store.addNotification(p.userId, { type: 'marketplace_offer_not_selected', message: `The requester chose another performer for the "${request.eventType}" booking.`, href: '/performer?tab=requests' });
    });

  res.json({ success: true, request: updated, conversation: conversation ? marketplaceConversationSummary({
    conversation,
    offer: selectedOffer || offer,
    request: updated || request,
    performer: performers.findById((selectedOffer || offer).performerId),
    role: 'requester',
  }, user) : null });
});

// --- Marketplace offers (performer side) ---

app.get('/api/marketplace/offers/mine', requireApprovedPerformerApi, (req, res) => {
  const list = marketplaceOffers.listByPerformer(req.performerProfile.id).map((o) => ({
    ...o,
    request: marketplaceRequests.findById(o.requestId),
  }));
  res.json({ success: true, offers: list });
});

app.post('/api/marketplace/offers/:id/accept', requireApprovedPerformerApi, (req, res) => {
  const offer = marketplaceOffers.findById(req.params.id);
  if (!offer || offer.performerId !== req.performerProfile.id) return res.status(404).json({ success: false, error: 'Offer not found.' });
  if (offer.status !== 'invited') return res.status(400).json({ success: false, error: 'This invite is no longer open.' });
  const updated = marketplaceOffers.accept(offer.id);
  notifyRequesterOfResponse(offer, 'accepted');
  const conversation = ensureMarketplaceConversation(updated);
  const request = marketplaceRequests.findById(updated.requestId);
  res.json({ success: true, offer: updated, conversation: conversation && request ? marketplaceConversationSummary({
    conversation,
    offer: updated,
    request,
    performer: req.performerProfile,
    role: 'performer',
  }, currentUser(req)) : null });
});

app.post('/api/marketplace/offers/:id/counter', requireApprovedPerformerApi, (req, res) => {
  const offer = marketplaceOffers.findById(req.params.id);
  if (!offer || offer.performerId !== req.performerProfile.id) return res.status(404).json({ success: false, error: 'Offer not found.' });
  if (offer.status !== 'invited') return res.status(400).json({ success: false, error: 'This invite is no longer open.' });
  const { amountUsd, note } = req.body || {};
  if (!amountUsd || Number(amountUsd) <= 0) return res.status(400).json({ success: false, error: 'Enter a counter-offer amount.' });
  const updated = marketplaceOffers.counter(offer.id, { amountUsd, note });
  notifyRequesterOfResponse(offer, 'countered');
  res.json({ success: true, offer: updated });
});

app.post('/api/marketplace/offers/:id/decline', requireApprovedPerformerApi, (req, res) => {
  const offer = marketplaceOffers.findById(req.params.id);
  if (!offer || offer.performerId !== req.performerProfile.id) return res.status(404).json({ success: false, error: 'Offer not found.' });
  if (offer.status !== 'invited') return res.status(400).json({ success: false, error: 'This invite is no longer open.' });
  res.json({ success: true, offer: marketplaceOffers.decline(offer.id) });
});

// --- Marketplace messages -------------------------------------------------
// A confirmed booking gets a dedicated, private text thread.  The list is
// deliberately derived from live accepted/selected offers on every read;
// changing an offer to not-selected/cancelled immediately removes it from
// both people's inboxes even though its historical rows remain in storage.
app.get('/api/marketplace/chats', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const chats = eligibleMarketplaceConversationAccessesForUser(user)
    .map((access) => marketplaceConversationSummary(access, user))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ success: true, chats });
});

app.get('/api/marketplace/chats/:id/messages', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  let access = resolveMarketplaceConversationAccess(user, req.params.id);
  if (!access) return res.status(403).json({ success: false, error: 'This booking conversation is unavailable.' });
  marketplaceChat.markRead(access.conversation.id, access.role);
  // Re-read so unreadCount reflects the markRead we just committed.
  access = resolveMarketplaceConversationAccess(user, req.params.id);
  const chatSummary = marketplaceConversationSummary(access, user);
  res.json({ success: true, chat: chatSummary, conversation: chatSummary, messages: marketplaceChat.getMessages(access.conversation.id) });
});

app.post('/api/marketplace/chats/:id/messages', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  let access = resolveMarketplaceConversationAccess(user, req.params.id);
  if (!access) return res.status(403).json({ success: false, error: 'This booking conversation is unavailable.' });

  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'Write a message before sending.' });
  if (text.length > 2000) return res.status(400).json({ success: false, error: 'Messages can be at most 2,000 characters.' });
  if (containsContactInfo(text)) {
    return res.status(400).json({ success: false, error: "Sharing an email address or phone number in chat isn't allowed - keep booking coordination on Mozart Techniques." });
  }

  const message = marketplaceChat.sendMessage(access.conversation.id, {
    senderId: user.id,
    senderRole: access.role,
    senderName: user.name || (access.role === 'performer' ? access.performer.name : access.request.requesterName),
    text,
  });
  if (!message) return res.status(404).json({ success: false, error: 'Conversation not found.' });

  const recipientId = access.role === 'performer' ? access.request.requesterId : access.performer.userId;
  const href = access.role === 'performer' ? '/performance-requests?tab=messages' : '/performer?tab=messages';
  if (recipientId && Number(recipientId) !== Number(user.id)) {
    store.addNotification(recipientId, {
      type: 'marketplace_chat',
      message: `New message from ${user.name || 'your booking contact'} about your ${access.request.eventType || 'performance booking'}.`,
      href,
    });
  }

  access = resolveMarketplaceConversationAccess(user, req.params.id);
  const chatSummary = marketplaceConversationSummary(access, user);
  res.json({ success: true, message, chat: chatSummary, conversation: chatSummary });
});

// --- Admin: performer moderation + marketplace oversight ---

app.get('/api/admin/performers', requireAdminApi, (req, res) => {
  const admin = currentUser(req);
  const scoped = performers.listAll().filter((profile) => canManageUser(admin, store.findById(profile.userId)));
  res.json({ success: true, performers: scoped });
});

app.post('/api/admin/performers/:id/status', requireAdminApi, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status.' });
  const profile = performers.findById(req.params.id);
  if (!profile || !canManageUser(currentUser(req), store.findById(profile.userId))) return res.status(403).json({ success: false, error: 'You can only review performers in your country.' });
  const updated = performers.setStatus(req.params.id, status, currentUser(req).id);
  if (!updated) return res.status(404).json({ success: false, error: 'Application not found.' });
  if (status === 'approved') {
    const message = 'Your performer application has been approved! Pay the one-time $1.50 activation fee to unlock your Performer Dashboard.';
    store.addNotification(updated.userId, { type: 'performer', message, href: '/performer' });
    mailer.sendStatusUpdateEmail(updated, {
      subject: 'Your Mozart Techniques performer application was approved',
      heading: "You're approved!",
      approved: true,
      message: [
        `Congratulations - you're approved to perform on Mozart Techniques${(updated.categories || []).length ? ` as ${updated.categories.join(', ')}` : ''}. Event organizers can now find and book you.`,
        'One step left: pay the one-time $1.50 activation fee from your Performer Dashboard to unlock it. While you\'re there, take a look at your Orientation & Policies - professional conduct, booking expectations, and how payouts work.',
        'Your dashboard has the full detail on all of this, plus every message tied to your account - this email is just the headline.',
      ],
      resources: [
        { title: 'Terms of Service', description: 'What you’re agreeing to as a performer on Mozart Techniques.', href: `${mailer.APP_URL}/terms-of-service` },
        { title: 'Orientation & Policies', description: 'Professional conduct, booking expectations, and how payouts work.', href: `${mailer.APP_URL}/orientation` },
      ],
      ctaLabel: 'Go to Performer Dashboard',
      ctaHref: `${mailer.APP_URL}/performer`,
    }).catch((err) => console.error('Status update email failed:', err.message));
  } else if (status === 'rejected') {
    const message = 'Your performer application was not approved this time.';
    store.addNotification(updated.userId, { type: 'performer', message });
    mailer.sendStatusUpdateEmail(updated, {
      subject: 'An update on your Mozart Techniques performer application',
      heading: 'Application update',
      approved: false,
      message,
    }).catch((err) => console.error('Status update email failed:', err.message));
  }
  res.json({ success: true, performer: updated });
});

app.post('/api/admin/performers/:id/suspend', requireAdminApi, (req, res) => {
  const profile = performers.findById(req.params.id);
  if (!profile || !canManageUser(currentUser(req), store.findById(profile.userId))) return res.status(403).json({ success: false, error: 'You can only manage performers in your country.' });
  const updated = performers.suspend(req.params.id, (req.body && req.body.reason) || null);
  res.json({ success: true, performer: updated });
});

app.post('/api/admin/performers/:id/unsuspend', requireAdminApi, (req, res) => {
  const profile = performers.findById(req.params.id);
  if (!profile || !canManageUser(currentUser(req), store.findById(profile.userId))) return res.status(403).json({ success: false, error: 'You can only manage performers in your country.' });
  res.json({ success: true, performer: performers.unsuspend(req.params.id) });
});

app.get('/api/admin/marketplace/requests', requireAdminApi, (req, res) => {
  const admin = currentUser(req);
  const list = marketplaceRequests.listAll()
    .filter((request) => canManageUser(admin, store.findById(request.requesterId)))
    .map((r) => ({ ...r, offerCounts: summarizeOfferCounts(marketplaceOffers.listByRequest(r.id)) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, requests: list });
});

app.get('/api/admin/marketplace/requests/:id', requireAdminApi, (req, res) => {
  const request = marketplaceRequests.findById(req.params.id);
  if (!request) return res.status(404).json({ success: false, error: 'Request not found.' });
  if (!canManageUser(currentUser(req), store.findById(request.requesterId))) return res.status(403).json({ success: false, error: 'You can only view requests from your country.' });
  res.json({ success: true, request, offers: marketplaceOffers.listByRequest(request.id).map(decoratedOfferForRequester) });
});

// ==================== END PERFORMANCE MARKETPLACE ====================

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
  const { name, contactName, email, phone, registrationNumber, address, description, sponsorType, organizationType, numStudents, numTutors } = req.body || {};
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
    certificateUrl = await resolveUploadedFileUrl(req.file, 'certificates');
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
    numStudents: type === 'ngo' ? parseInt(numStudents) || 0 : null,
    numTutors: type === 'ngo' ? parseInt(numTutors) || 0 : null,
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

app.get('/api/organizations/me', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) return res.status(404).json({ success: false, error: 'No organization found.' });
  const students = organizations.getStudentsForOrganization(org.id).map((member) => { const student = store.findById(member.studentId); return { ...member, id: member.studentId, name: student?.name || member.studentName || 'Student', studentName: student?.name || member.studentName || 'Student', email: student?.email || '', role: 'Student' }; });
  const studentIds = new Set(students.map((student) => Number(student.id)));
  const tutorProfiles = new Map();
  organizations.getTutorsForOrganization(org.id).forEach((userId) => {
    const tutor = tutors.findByUserId(userId);
    if (tutor) tutorProfiles.set(tutor.id, tutor);
  });
  assignments.listAll().forEach((assignment) => {
    if (!studentIds.has(Number(assignment.studentId)) || !assignment.tutorId) return;
    const tutor = tutors.findById(assignment.tutorId);
    if (tutor) tutorProfiles.set(tutor.id, tutor);
  });
  const tutorsForOrg = Array.from(tutorProfiles.values()).map((tutor) => ({ id: tutor.id, userId: tutor.userId, name: tutor.name, email: tutor.email || '', role: 'Tutor', photoUrl: tutor.photoUrl || null }));
  // monthlyAmount is stored and charged in USD; convert only for display,
  // same pattern as tutor hourly rates / store prices (getGeoInfo + convertFromUsd).
  const geoInfo = await getGeoInfo(req);
  const monthlyAmountLocal = Math.round((await currency.convertFromUsd(org.monthlyAmount || 0, geoInfo.currency)) * 100) / 100;
  const walletBalanceLocal = Math.round((await currency.convertFromUsd(org.walletBalanceUsd || 0, geoInfo.currency)) * 100) / 100;
  res.json({
    success: true,
    organization: { ...org, students, tutors: tutorsForOrg, members: students, monthlyAmountLocal, walletBalanceUsd: org.walletBalanceUsd || 0, walletBalanceLocal, localCurrency: geoInfo.currency, localSymbol: geoInfo.symbol },
    subscriptionActive: organizations.isSubscriptionActive(org),
  });
});

app.post('/api/organizations/me/generate-code', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) return res.status(404).json({ success: false, error: 'No organization application on file.' });
  if (!organizations.isSubscriptionActive(org)) {
    return res.status(403).json({ success: false, error: 'Your subscription is not active yet - an admin needs to confirm payment first.' });
  }
  const entry = organizations.generateOrganizationCode(org.id, req.body && req.body.role, { name: req.body && req.body.name, email: req.body && req.body.email });
  res.json({ success: true, entry });
});

app.get('/api/organizations/me/codes', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const codes = organizations.listCodes(org.id);
  const refreshNames = (items) => items.map((entry) => {
    const user = entry.redeemedBy ? store.findById(entry.redeemedBy) : null;
    return user ? { ...entry, redeemedName: user.name } : entry;
  });
  res.json({ success: true, students: refreshNames(codes.students), tutors: refreshNames(codes.tutors) });
});

app.delete('/api/organizations/me/codes/:code', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const removed = organizations.deleteCode(org.id, req.params.code);
  if (!removed) return res.status(404).json({ success: false, error: 'Access code not found.' });
  res.json({ success: true, entry: removed });
});

app.post('/api/organizations/me/profile', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const updated = organizations.updateProfile(org.id, req.body || {});
  res.json({ success: true, organization: updated });
});

// The Sponsor tab's own notification bell - only things related to the
// account's own organization (application/subscription updates), not its
// whole notification history (lesson requests, chat pings, etc., which
// belong to the regular Notifications screen). Every notification sent for
// an org application/subscription event already carries type:'organization'
// (see the admin approval route and checkout/success above), so that field
// alone is enough to scope this, unlike the org-tutor case, which also
// needs an href check for a different reason (its own notifications share
// the account with a tutor profile's - see /api/organizations/tutor-workspace).
app.get('/api/organizations/me/notifications', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) return res.status(404).json({ success: false, error: 'No organization found.' });
  const notifications = (user.notifications || [])
    .filter((item) => item.type === 'organization')
    .map((item) => ({ ...item }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ success: true, notifications });
});

app.post('/api/organizations/me/logo', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  photoUpload.single('photo')(req, res, async (error) => {
    if (error) return res.status(400).json({ success: false, error: error.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose an image to upload.' });
    const logoUrl = await resolveUploadedFileUrl(req.file, 'photos');
    res.json({ success: true, organization: organizations.updateProfile(org.id, { logoUrl }) });
  });
});

app.post('/api/organizations/me/invite', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  const email = String(req.body && req.body.email || '').trim().toLowerCase();
  const role = req.body && req.body.role === 'tutor' ? 'tutor' : 'student';
  if (!org || org.status !== 'approved' || !organizations.isSubscriptionActive(org)) return res.status(403).json({ success: false, error: 'An active organization subscription is required.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, error: 'Enter a valid Gmail address.' });
  const entry = organizations.generateOrganizationCode(org.id, role);
  organizations.markCodeInvited(org.id, entry.code, email);
  const redeemLink = `${publicAppUrl(req)}/dashboard?redeem=${encodeURIComponent(entry.code)}`;
  res.json({ success: true, code: entry.code, redeemLink, organizationName: org.name || org.contactName });
});

app.post('/api/redeem-code', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const { code } = req.body || {};
  if (!code || !code.trim()) return res.status(400).json({ success: false, error: 'Enter a code.' });
  const expectedRole = user.role === 'tutor' ? 'tutor' : user.role === 'student' ? 'student' : null;
  const result = organizations.redeemCode(code, user.id, user.name, expectedRole);
  if (result.error === 'not-found') return res.status(404).json({ success: false, error: 'That code was not recognized.' });
  if (result.error === 'already-redeemed') return res.status(409).json({ success: false, error: 'That code has already been used.' });
  if (result.error === 'wrong-role') return res.status(403).json({ success: false, error: 'This code is for a different organization role.' });
  // An Individual Sponsor's org record has no org.name (see organizations.js
  // apply()) - fall back to contactName so a sponsored student never sees
  // a literal "null" here, matching every other org.name display in this
  // file (search results, chat headers, notifications).
  const orgDisplayName = result.org.name || result.org.contactName;
  store.setSponsor(user.id, { orgId: result.org.id, orgName: orgDisplayName });
  store.addNotification(user.id, {
    type: 'organization',
    message: `You're now linked to ${orgDisplayName}. ${result.entry.role === 'tutor' ? 'Your Organization Tutor workspace is ready.' : 'Your sponsored access is now active.'}`,
    href: result.entry.role === 'tutor' ? '/org-tutor' : '/dashboard',
  });
  res.json({ success: true, orgId: result.org.id, orgName: orgDisplayName, organizationMemberships: store.findById(user.id).organizationMemberships });
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
    const amount = isMonthly ? Number(org.monthlyAmount) * 100 : Number(org.monthlyAmount) * 12 * 0.99 * 100; // Yearly plan is 1% below twelve monthly payments.
    // org.name is null for an Individual Sponsor (see organizations.js
    // apply()) - fall back to contactName so their Stripe checkout page
    // never shows a literal "null" as the product name.
    const orgDisplayName = org.name || org.contactName;

    const session = await client.checkout.sessions.create({
      // Managed Payments (this Stripe account's default) rejects an
      // explicit payment_method_types and requires a Stripe Tax product
      // tax_code otherwise - opt out to keep the existing simple card flow.
      managed_payments: { enabled: false },
      mode: isMonthly ? 'subscription' : 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${orgDisplayName} - ${isMonthly ? 'Monthly' : 'Yearly'} Subscription` },
          unit_amount: amount,
          ...(isMonthly && {
            recurring: { interval: 'month', interval_count: 1 }
          })
        },
        quantity: 1,
      }],
      customer_email: org.email,
      success_url: `${publicAppUrl(req)}/api/organizations/checkout/success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicAppUrl(req)}${org.sponsorType === 'individual' ? '/sponsor-dashboard' : '/ngo-dashboard'}`,
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
    return (record.sessions || []).filter((session) => session.paymentStatus === 'held').map((session) => ({ assignmentId: record.id, sessionId: session.id, studentName: record.studentName, tutorName: record.tutorName, category: record.category, durationMinutes: session.durationMinutes, totalUsd: session.totalUsd, loggedAt: session.loggedAt }));
  });
  res.json({ success: true, bills });
});

app.post('/api/organizations/lesson-bills/:assignmentId/:sessionId/checkout', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient(); const org = organizations.findByUserId(currentUser(req).id); const record = assignments.findById(req.params.assignmentId); const lesson = record && (record.sessions || []).find((item) => item.id === Number(req.params.sessionId)); const student = record && store.findById(record.studentId);
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  if (!org || !organizations.isSubscriptionActive(org) || !student || !student.sponsor || student.sponsor.orgId !== org.id || !coveredOrganizationForAssignment(record, student) || !lesson || lesson.paymentStatus !== 'held') return res.status(404).json({ success: false, error: 'Sponsored lesson bill not found.' });
  const checkout = await client.checkout.sessions.create({ managed_payments: { enabled: false }, mode: 'payment', line_items: [{ price_data: { currency: 'usd', product_data: { name: `${record.category} lesson for ${record.studentName}` }, unit_amount: Math.round(lesson.totalUsd * 100) }, quantity: 1 }], customer_email: org.email, success_url: `${publicAppUrl(req)}/api/organizations/checkout/success?sessionId={CHECKOUT_SESSION_ID}`, cancel_url: `${publicAppUrl(req)}${org.sponsorType === 'individual' ? '/sponsor-dashboard' : '/ngo-dashboard'}`, metadata: { type: 'lesson-bill', orgId: String(org.id), assignmentId: String(record.id), sessionId: String(lesson.id) } });
  res.json({ success: true, url: checkout.url });
});

// Loads real money into the sponsor's own wallet (walletBalanceUsd) - a
// separate charge from both the lesson-bills checkout above and the
// admin-facing subscription checkout below. Once funded, covered lessons
// draw from this balance automatically as they're logged (see the
// auto-debit in POST /api/assignments/:id/sessions) instead of needing a
// manual per-lesson checkout.
app.post('/api/organizations/wallet/topup-checkout', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(404).json({ success: false, error: 'No approved organization found.' });
  const amountUsd = Number(req.body && req.body.amountUsd);
  if (!amountUsd || amountUsd < 5) return res.status(400).json({ success: false, error: 'Enter an amount of at least $5.' });
  const checkout = await client.checkout.sessions.create({
    managed_payments: { enabled: false },
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', product_data: { name: `Wallet top-up for ${org.name || org.contactName}` }, unit_amount: Math.round(amountUsd * 100) }, quantity: 1 }],
    customer_email: org.email,
    success_url: `${publicAppUrl(req)}/api/organizations/checkout/success?sessionId={CHECKOUT_SESSION_ID}`,
    // Includes the session id (unlike a plain cancel) so the dashboard can
    // report the cancellation back to topup-cancel-notify below and get a
    // "your top-up didn't go through" email - Stripe's cancel_url is a pure
    // client-side redirect otherwise, with no server-side hook of its own.
    cancel_url: `${publicAppUrl(req)}${org.sponsorType === 'individual' ? '/sponsor-dashboard' : '/ngo-dashboard'}?payment=cancelled&topupSession={CHECKOUT_SESSION_ID}`,
    metadata: { type: 'wallet-topup', orgId: String(org.id), amountUsd: String(amountUsd) },
  });
  res.json({ success: true, url: checkout.url, sessionId: checkout.id });
});

// Fallback for when the success_url redirect above never reaches this
// server (very possible on a local/LAN dev server, or spotty connectivity
// right as Stripe redirects the in-app browser) - the mobile client calls
// this once its checkout browser closes, regardless of whether the
// redirect already fired. creditWallet's stripeSessionId guard makes
// crediting the same session twice a no-op either way.
app.post('/api/organizations/wallet/topup-verify', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  if (!client) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org) return res.status(404).json({ success: false, error: 'No organization found.' });
  const sessionId = req.body && req.body.sessionId;
  if (!sessionId) return res.status(400).json({ success: false, error: 'Missing session id.' });
  try {
    const session = await client.checkout.sessions.retrieve(sessionId);
    const isOwnTopup = session.metadata && session.metadata.type === 'wallet-topup' && Number(session.metadata.orgId) === org.id;
    if (session.payment_status !== 'paid' || !isOwnTopup) {
      // The mobile app always calls this once its checkout browser closes,
      // whether the payment went through or the user backed out - so this
      // branch is where a genuine cancellation/failure surfaces for mobile
      // (the web flow's equivalent is topup-cancel-notify below, since a
      // browser redirect never hits the server on its own).
      if (isOwnTopup) {
        const amountUsd = Number(session.metadata.amountUsd);
        mailer.sendStatusUpdateEmail(
          { email: org.email, name: org.contactName || org.name },
          {
            subject: 'Wallet top-up unsuccessful',
            heading: 'Wallet top-up unsuccessful',
            approved: false,
            message: [`We couldn't complete your $${amountUsd.toFixed(2)} wallet top-up.`, 'The checkout was closed before the payment finished, so your wallet was not charged.'],
          }
        ).catch(() => {});
      }
      return res.status(400).json({ success: false, error: 'That checkout has not been paid yet.' });
    }
    const amountUsd = Number(session.metadata.amountUsd);
    const updated = organizations.creditWallet(org.id, amountUsd, session.id);
    if (!updated.alreadyProcessed) {
      store.addNotification(updated.userId, {
        type: 'organization',
        message: `Your wallet was topped up with $${amountUsd.toFixed(2)}. New balance: $${updated.walletBalanceUsd.toFixed(2)}.`,
      });
      mailer.sendStatusUpdateEmail(
        { email: org.email, name: org.contactName || org.name },
        {
          subject: 'Wallet top-up successful',
          heading: 'Wallet top-up successful',
          approved: true,
          message: [`Your wallet was topped up with $${amountUsd.toFixed(2)}.`, `New balance: $${updated.walletBalanceUsd.toFixed(2)}.`],
          ctaLabel: 'View your dashboard',
          ctaHref: `${publicAppUrl(req)}${org.sponsorType === 'individual' ? '/sponsor-dashboard' : '/ngo-dashboard'}`,
        }
      ).catch(() => {});
    }
    res.json({ success: true, walletBalanceUsd: updated.walletBalanceUsd });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// The web wallet-topup checkout's cancel_url includes the session id so the
// dashboard can report a cancellation back here once it detects
// ?payment=cancelled - see the comment on that cancel_url above. Best
// effort: any failure here just means no email goes out, nothing else
// depends on this route.
app.post('/api/organizations/wallet/topup-cancel-notify', requireAuthApi, async (req, res) => {
  const client = stripeClient.getClient();
  const org = organizations.findByUserId(currentUser(req).id);
  const sessionId = req.body && req.body.sessionId;
  if (!client || !org || !sessionId) return res.json({ success: true });
  try {
    const session = await client.checkout.sessions.retrieve(sessionId);
    if (session.metadata && session.metadata.type === 'wallet-topup' && Number(session.metadata.orgId) === org.id && session.payment_status !== 'paid') {
      const amountUsd = Number(session.metadata.amountUsd);
      mailer.sendStatusUpdateEmail(
        { email: org.email, name: org.contactName || org.name },
        {
          subject: 'Wallet top-up unsuccessful',
          heading: 'Wallet top-up unsuccessful',
          approved: false,
          message: [`We couldn't complete your $${amountUsd.toFixed(2)} wallet top-up.`, 'The checkout was closed before the payment finished, so your wallet was not charged.'],
        }
      ).catch(() => {});
    }
  } catch (err) {
    // Best-effort notification only - ignore.
  }
  res.json({ success: true });
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
    // Every checkout this app creates stamps orgId into metadata - resolve
    // the org up front so every branch below sends an Individual Sponsor
    // back to /sponsor-dashboard instead of the NGO/Institution-only
    // /ngo-dashboard.
    const metaOrgId = Number(session.metadata && session.metadata.orgId);
    const metaOrg = metaOrgId ? organizations.findById(metaOrgId) : null;
    const dest = metaOrg && metaOrg.sponsorType === 'individual' ? '/sponsor-dashboard' : '/ngo-dashboard';
    if (session.payment_status !== 'paid') {
      return res.redirect(`${dest}?payment=pending`);
    }

    if (session.metadata && session.metadata.type === 'lesson-bill') {
      const record = assignments.findById(session.metadata.assignmentId);
      const lesson = record && (record.sessions || []).find((item) => item.id === Number(session.metadata.sessionId));
      const org = organizations.findById(Number(session.metadata.orgId));
      const student = record && store.findById(record.studentId);
      if (!record || !lesson || lesson.paymentStatus !== 'held' || !org || !student || !student.sponsor || student.sponsor.orgId !== org.id || !coveredOrganizationForAssignment(record, student)) return res.redirect(`${dest}?payment=error`);
      const released = assignments.confirmSession(record.id, lesson.id);
      if (!released) return res.redirect(`${dest}?payment=error`);
      const paymentIntentId = stripeObjectId(session.payment_intent);
      await releaseTutorEarnings(record, lesson, { paymentIntentId, payerType: 'organization', organizationId: org.id });
      return res.redirect(`${dest}?payment=success`);
    }

    if (session.metadata && session.metadata.type === 'wallet-topup') {
      const orgId = Number(session.metadata.orgId);
      const amountUsd = Number(session.metadata.amountUsd);
      const updated = organizations.creditWallet(orgId, amountUsd, session.id);
      if (!updated) return res.redirect(`${dest}?payment=error`);
      if (updated.alreadyProcessed) return res.redirect(`${dest}?payment=success`);
      store.addNotification(updated.userId, {
        type: 'organization',
        message: `Your wallet was topped up with $${amountUsd.toFixed(2)}. New balance: $${updated.walletBalanceUsd.toFixed(2)}.`,
      });
      if (metaOrg) {
        mailer.sendStatusUpdateEmail(
          { email: metaOrg.email, name: metaOrg.contactName || metaOrg.name },
          {
            subject: 'Wallet top-up successful',
            heading: 'Wallet top-up successful',
            approved: true,
            message: [`Your wallet was topped up with $${amountUsd.toFixed(2)}.`, `New balance: $${updated.walletBalanceUsd.toFixed(2)}.`],
            ctaLabel: 'View your dashboard',
            ctaHref: `${publicAppUrl(req)}${dest}`,
          }
        ).catch(() => {});
      }
      return res.redirect(`${dest}?payment=success`);
    }

    const orgId = Number(session.metadata && session.metadata.orgId);
    const billingPeriod = session.metadata && session.metadata.billingPeriod;
    const org = organizations.findById(orgId);
    if (!org || !['monthly', 'yearly'].includes(billingPeriod)) return res.redirect(`${dest}?payment=error`);
    // Activate only for the period actually paid for in Stripe Checkout.
    const updated = organizations.activateSubscription(orgId, billingPeriod === 'monthly' ? 1 : 12);
    if (!updated) {
      return res.redirect(`${dest}?payment=error`);
    }

    store.addNotification(updated.userId, {
      type: 'organization',
      message: `Payment confirmed! Your subscription is active through ${new Date(updated.subscriptionEndAt).toLocaleDateString()}. You can now generate access codes.`,
    });

    res.redirect(`${dest}?payment=success`);
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
  for (const tutorUserId of organizations.getTutorsForOrganization(org.id)) {
    const tutor = tutors.findByUserId(tutorUserId);
    if (tutor && !tutor.expelled) {
      orgTutors.set(tutor.id, { id: tutor.id, userId: tutor.userId, name: tutor.name, status: tutor.status || 'pending', categories: tutor.categories || [], phone: tutor.phone || null, email: tutor.email || null, profileUrl: tutor.photoUrl || null, studentCount: 0 });
    }
  }
  const allAssignments = assignments.listAll();
  
  for (const assignment of allAssignments) {
    if (studentIds.includes(assignment.studentId) && assignment.tutorId) {
      const tutor = tutors.findById(assignment.tutorId);
      if (tutor && !tutor.expelled) {
        if (!orgTutors.has(tutor.id)) {
          orgTutors.set(tutor.id, {
            id: tutor.id,
            userId: tutor.userId,
            name: tutor.name,
            status: tutor.status || 'pending',
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

// Feeds the Sponsor Dashboard's "Assign a Tutor" picker - each sponsored
// student plus the courses they're already taking or have requested
// (there's no separate "preferred courses" field on a student profile, so
// their own assignment history is the closest real signal of interest).
app.get('/api/organizations/students-for-assignment', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org) return res.status(404).json({ success: false, error: 'No organization found.' });
  const students = organizations.getStudentsForOrganization(org.id).map((member) => {
    const student = store.findById(member.studentId);
    const preferredCategories = [...new Set(assignments.listForStudent(member.studentId).map((a) => a.category))];
    return {
      id: member.studentId,
      name: (student && student.name) || member.studentName || 'Student',
      photoUrl: student && student.studentProfile ? student.studentProfile.photoUrl || student.photoUrl || null : null,
      preferredCategories,
    };
  });
  res.json({ success: true, students });
});

// Organization classroom directory: real students linked by access code and
// approved tutors teaching those students.
app.get('/api/organizations/members', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) return res.status(404).json({ success: false, error: 'No organization found.' });

  const students = organizations.getStudentsForOrganization(org.id).map((member) => {
    const student = store.findById(member.studentId);
    return {
      id: member.studentId,
      name: (student && student.name) || member.studentName || 'Student',
      email: student ? student.email : '',
      role: 'Student',
      photoUrl: student && student.studentProfile ? student.studentProfile.photoUrl || student.photoUrl || null : null,
      profile: student ? { ageGroup: student.studentProfile && student.studentProfile.ageGroup, sex: student.studentProfile && student.studentProfile.sex, city: student.city || null } : null,
    };
  });
  const tutorsById = new Map();
  for (const tutorUserId of organizations.getTutorsForOrganization(org.id)) {
    const tutor = tutors.findByUserId(tutorUserId);
    if (tutor && !tutor.expelled) tutorsById.set(tutor.id, {
      id: tutor.id,
      name: tutor.name,
      email: tutor.email || '',
      role: 'Tutor',
      status: tutor.status || 'pending',
      photoUrl: tutor.photoUrl || null,
      profile: { categories: tutor.categories || [], bio: tutor.bio || '', city: tutor.city || null, experienceYears: tutor.experienceYears || 0 },
    });
  }
  assignments.listAll().forEach((assignment) => {
    if (!students.some((student) => student.id === assignment.studentId) || !assignment.tutorId) return;
    const tutor = tutors.findById(assignment.tutorId);
    if (tutor && !tutor.expelled) tutorsById.set(tutor.id, {
      id: tutor.id,
      name: tutor.name,
      email: tutor.email || '',
      role: 'Tutor',
      status: tutor.status || 'pending',
      photoUrl: tutor.photoUrl || null,
      profile: { categories: tutor.categories || [], bio: tutor.bio || '', city: tutor.city || null, experienceYears: tutor.experienceYears || 0 },
    });
  });
  res.json({ success: true, students, tutors: Array.from(tutorsById.values()) });
});

app.delete('/api/organizations/members/:studentId', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Organization access required.' });
  const removed = organizations.removeMember(org.id, req.params.studentId);
  if (removed) store.clearSponsor(Number(req.params.studentId), org.id);
  res.json({ success: removed });
});

// Get all org conversations
app.get('/api/organizations/conversations', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  // The mobile Sponsor Dashboard passes audience=student to keep its inbox
  // a sponsor<->student space only, fully separate from Org Tutor mode's
  // tutor-facing conversations (its own direct-with-the-org thread,
  // classroom groups) even though both surfaces share this org account.
  // ngo-dashboard.html calls this same route with no audience filter,
  // since "message tutors individually" is a real feature there - this
  // stays opt-in so that keeps working exactly as before.
  const studentsOnly = req.query.audience === 'student';
  const conversations = orgChat.listForOrganization(org.id)
    .filter((conv) => !studentsOnly || (conv.type === 'group' ? !(conv.participants || []).some((p) => p.type === 'tutor') : Boolean(conv.studentId)))
    .map((conv) => {
      const lastMessage = conv.messages && conv.messages.length ? conv.messages[conv.messages.length - 1] : null;
      const title = conv.type === 'group' ? conv.title : conv.participants.find((p) => p.type !== 'org')?.name || 'Conversation';
      return {
        id: conv.id,
        type: conv.type || 'direct',
        title,
        participants: conv.participants || [],
        tutorId: conv.tutorId || null,
        studentId: conv.studentId || null,
        lastMessage: lastMessage ? lastMessage.text : 'No messages yet',
        lastMessageAt: lastMessage ? lastMessage.createdAt : conv.createdAt,
        unreadCount: orgChat.getUnreadCount(conv.id, 'org'),
        createdAt: conv.createdAt,
      };
    });

  res.json({ success: true, conversations });
});

app.get('/api/organizations/conversations/:id/messages', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  const conversationId = Number(req.params.id);
  const conversation = orgChat.listForOrganization(org.id).find((conv) => conv.id === conversationId);
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found.' });
  }

  const messages = orgChat.getMessages(conversationId);
  res.json({ success: true, messages, conversation });
});

app.post('/api/organizations/conversations/:targetId/message', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  const { text, type, targetType, name, attachment, replyToId, poll, location } = req.body || {};
  if ((!text || !text.trim()) && !attachment && !poll && !location) {
    return res.status(400).json({ success: false, error: 'Message text, an attachment, a poll, or a location is required.' });
  }
  if (attachment && !isOwnChatAttachmentUrl(attachment.url)) return res.status(400).json({ success: false, error: 'Attach files through the upload endpoint.' });
  const { poll: safePoll, error: pollError } = validatePollInput(poll);
  if (pollError) return res.status(400).json({ success: false, error: pollError });
  const { location: safeLocation, error: locationError } = validateLocationInput(location);
  if (locationError) return res.status(400).json({ success: false, error: locationError });

  const targetId = Number(req.params.targetId);
  const resolvedType = targetType || type || 'tutor';
  const conversation = orgChat.getOrCreateConversation(org.id, {
    type: resolvedType,
    tutorId: resolvedType === 'tutor' ? targetId : null,
    studentId: resolvedType === 'student' ? targetId : null,
    name,
    title: name || 'Conversation',
  });

  const message = orgChat.sendMessage(conversation.id, {
    senderId: user.id,
    senderType: 'org',
    senderName: org.name || org.contactName,
    text: String(text || '').trim(),
    attachment: attachment || null,
    replyToId: replyToId || null, poll: safePoll, location: safeLocation,
  });

  res.json({ success: true, message, conversation });
});

// Opens (creating if needed) the org's 1:1 thread with a tutor/student
// without requiring a first message - lets the Sponsor Dashboard's Students
// tab jump straight into an empty chat, the same way tapping a name in
// ngo-dashboard.html's classroom roster does before anyone has typed
// anything yet.
app.post('/api/organizations/conversations/:targetId/open', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }
  const targetId = Number(req.params.targetId);
  const { targetType, name } = req.body || {};
  const resolvedType = targetType === 'student' ? 'student' : 'tutor';
  const conversation = orgChat.getOrCreateConversation(org.id, {
    type: resolvedType,
    tutorId: resolvedType === 'tutor' ? targetId : null,
    studentId: resolvedType === 'student' ? targetId : null,
    name,
    title: name || 'Conversation',
  });
  res.json({ success: true, conversation });
});

app.post('/api/organizations/group-chat', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const isOwner = Boolean(organizations.findByUserId(user.id));
  const org = resolveOrgForUser(user);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  const { groupName, members, groupImageUrl } = req.body || {};
  if (!groupName || !groupName.trim()) {
    return res.status(400).json({ success: false, error: 'Group name is required.' });
  }

  const normalizedMembers = Array.isArray(members) ? members.filter((member) => member && member.id && member.type).map((member) => ({
    id: Number(member.id),
    type: member.type,
    name: member.name || (member.type === 'tutor' ? 'Tutor' : 'Student')
  })) : [];

  // A tutor creating their own classroom group chat needs to actually be
  // in it - the org's own dashboard picks members explicitly and doesn't
  // need this, since the org itself isn't a chat "member."
  if (!isOwner) {
    const tutorProfile = tutors.findByUserId(user.id);
    if (tutorProfile && !normalizedMembers.some((m) => m.type === 'tutor' && m.id === tutorProfile.id)) {
      normalizedMembers.unshift({ id: tutorProfile.id, type: 'tutor', name: tutorProfile.name || 'Tutor' });
    }
  }

  if (!normalizedMembers.length) {
    return res.status(400).json({ success: false, error: 'Add at least one tutor or student.' });
  }

  const conversation = orgChat.getOrCreateConversation(org.id, {
    groupName: groupName.trim(),
    members: normalizedMembers,
    groupImageUrl: typeof groupImageUrl === 'string' ? groupImageUrl.trim() || null : null,
  });

  res.json({ success: true, conversation });
});

app.post('/api/organizations/conversations/:id/send', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org) {
    return res.status(404).json({ success: false, error: 'No organization found.' });
  }

  const { text, attachment, replyToId, poll, location } = req.body || {};
  if ((!text || !text.trim()) && !attachment && !poll && !location) {
    return res.status(400).json({ success: false, error: 'Message text, an attachment, a poll, or a location is required.' });
  }
  if (attachment && !isOwnChatAttachmentUrl(attachment.url)) return res.status(400).json({ success: false, error: 'Attach files through the upload endpoint.' });
  const { poll: safePoll, error: pollError } = validatePollInput(poll);
  if (pollError) return res.status(400).json({ success: false, error: pollError });
  const { location: safeLocation, error: locationError } = validateLocationInput(location);
  if (locationError) return res.status(400).json({ success: false, error: locationError });

  const conversationId = Number(req.params.id);
  const conversation = orgChat.listForOrganization(org.id).find((item) => item.id === conversationId);
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found.' });
  }

  const message = orgChat.sendMessage(conversationId, {
    senderId: user.id,
    senderType: 'org',
    senderName: org.name || org.contactName,
    text: String(text || '').trim(),
    attachment: attachment || null,
    replyToId: replyToId || null, poll: safePoll, location: safeLocation,
  });

  res.json({ success: true, message, conversation });
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

// --- STUDENT SIDE: viewing and messaging the organization that sponsors them ---
// A student who redeemed an org's access code has zero UI to interact with
// that org today beyond the redeem widget - these routes back the new
// "My Organization" page (content feed + a direct conversation with the org).

app.get('/api/organizations/mine', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = resolveOrgForUser(user);
  if (!org) return res.status(404).json({ success: false, error: 'You are not linked to an organization yet.' });
  // The org's own country flag (Org Student mode's header) - a fixed fact
  // about the organization, unlike CountryFlag elsewhere which reads the
  // *viewer's* own device/IP location.
  const orgCountryCode = org.locality && org.locality.country ? geo.countryCodeForName(org.locality.country) : null;
  res.json({
    success: true,
    organization: {
      id: org.id, name: org.name, contactName: org.contactName, email: org.email, phone: org.phone,
      organizationType: org.organizationType, subscriptionStatus: org.subscriptionStatus, logoUrl: org.logoUrl || null,
      address: org.address || null, events: org.events || [], countryCode: orgCountryCode,
    },
  });
});

app.get('/api/organizations/mine/conversation', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = resolveOrgForUser(user);
  if (!org) return res.status(404).json({ success: false, error: 'You are not linked to an organization yet.' });
  const conversation = orgChat.getOrCreateConversation(org.id, { type: 'student', studentId: user.id, name: user.name });
  orgChat.markRead(conversation.id, 'student');
  res.json({ success: true, conversation, organizationName: org.name || org.contactName, organizationLogoUrl: org.logoUrl || null });
});

app.post('/api/organizations/mine/conversation/message', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = resolveOrgForUser(user);
  if (!org) return res.status(404).json({ success: false, error: 'You are not linked to an organization yet.' });
  const { text, attachment, replyToId, poll, location } = req.body || {};
  if ((!text || !text.trim()) && !attachment && !poll && !location) {
    return res.status(400).json({ success: false, error: 'Message text, an attachment, a poll, or a location is required.' });
  }
  if (attachment && !isOwnChatAttachmentUrl(attachment.url)) return res.status(400).json({ success: false, error: 'Attach files through the upload endpoint.' });
  const { poll: safePoll, error: pollError } = validatePollInput(poll);
  if (pollError) return res.status(400).json({ success: false, error: pollError });
  const { location: safeLocation, error: locationError } = validateLocationInput(location);
  if (locationError) return res.status(400).json({ success: false, error: locationError });

  const conversation = orgChat.getOrCreateConversation(org.id, { type: 'student', studentId: user.id, name: user.name });
  const message = orgChat.sendMessage(conversation.id, {
    senderId: user.id, senderType: 'student', senderName: user.name,
    text: String(text || '').trim(), attachment: attachment || null,
    replyToId: replyToId || null, poll: safePoll, location: safeLocation,
  });
  store.addNotification(org.userId, {
    type: 'organization',
    message: `${user.name} sent your organization a message.`,
    href: '/ngo-dashboard',
  });
  res.json({ success: true, message, conversation: orgChat.findById(conversation.id) });
});

// --- GENERIC ORG-CHAT MESSAGE ACTIONS ---
// One set of routes, keyed by conversation id, shared by every org-chat
// surface (org dashboard, group chat, a student's "my org" page, a tutor's
// org panel) instead of duplicating edit/delete/react/pin logic per page -
// resolveOrgChatAccess() above works out whether the caller is the org
// itself, a tutor participant, or a student participant.

const ORG_CHAT_ROLE_FIELD = { org: 'readByOrg', tutor: 'readByTutor', student: 'readByStudent' };

// A group conversation can have several recipients but the read-state is
// still only tracked per role (not per participant) - so "seen by someone
// else" here means any role other than the sender's own has polled the
// thread since, the same conservative signal used for 1:1 org/tutor and
// org/student conversations.
function orgMessageSeenByOthers(message) {
  return Object.entries(ORG_CHAT_ROLE_FIELD)
    .filter(([role]) => role !== message.senderType)
    .some(([, field]) => Boolean(message[field]));
}

function loadOrgChatMessage(req, res) {
  const user = currentUser(req);
  const access = resolveOrgChatAccess(user, req.params.convId, req.query.asRole);
  if (!access) { res.status(403).json({ success: false, error: 'Not your conversation.' }); return null; }
  const message = (access.conversation.messages || []).find((m) => Number(m.id) === Number(req.params.msgId));
  if (!message) { res.status(404).json({ success: false, error: 'Message not found.' }); return null; }
  return { ...access, user, message };
}

// Generic list/send, usable by any participant (org, tutor, or student) of
// a conversation - the org-owner-scoped /api/organizations/conversations/...
// routes only ever worked for the org's own login; this pair is what lets a
// participant who ISN'T the org (e.g. a tutor viewing the org's direct
// message to them) read and reply without needing org ownership.
app.get('/api/org-chat/conversations/:convId/messages', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const access = resolveOrgChatAccess(user, req.params.convId, req.query.asRole);
  if (!access) return res.status(403).json({ success: false, error: 'Not your conversation.' });
  orgChat.markRead(access.conversation.id, access.role);
  res.json({ success: true, messages: orgChat.getMessages(access.conversation.id), conversation: orgChat.findById(access.conversation.id) });
});

app.post('/api/org-chat/conversations/:convId/messages', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const access = resolveOrgChatAccess(user, req.params.convId, req.body && req.body.asRole);
  if (!access) return res.status(403).json({ success: false, error: 'Not your conversation.' });
  const { text, attachment, replyToId, poll, location, libraryItem } = req.body || {};
  if ((!text || !text.trim()) && !attachment && !poll && !location && !libraryItem) {
    return res.status(400).json({ success: false, error: 'Message text, an attachment, a poll, a location, or a library clip is required.' });
  }
  if (attachment && !isOwnChatAttachmentUrl(attachment.url)) return res.status(400).json({ success: false, error: 'Attach files through the upload endpoint.' });
  const { poll: safePoll, error: pollError } = validatePollInput(poll);
  if (pollError) return res.status(400).json({ success: false, error: pollError });
  const { location: safeLocation, error: locationError } = validateLocationInput(location);
  if (locationError) return res.status(400).json({ success: false, error: locationError });
  const safeLibraryItem = libraryItem && libraryItem.title && libraryItem.url
    ? { title: String(libraryItem.title).trim().slice(0, 200), url: String(libraryItem.url).trim() }
    : null;
  const message = orgChat.sendMessage(access.conversation.id, {
    senderId: user.id, senderType: access.role, senderName: access.participantName,
    text: String(text || '').trim(), attachment: attachment || null,
    replyToId: replyToId || null, poll: safePoll, location: safeLocation, libraryItem: safeLibraryItem,
  });
  res.json({ success: true, message, conversation: orgChat.findById(access.conversation.id) });
});

app.put('/api/org-chat/conversations/:convId/messages/:msgId', requireAuthApi, (req, res) => {
  const ctx = loadOrgChatMessage(req, res);
  if (!ctx) return;
  if (ctx.message.senderId !== ctx.user.id) return res.status(403).json({ success: false, error: 'You can only edit your own messages.' });
  if (Date.now() - new Date(ctx.message.createdAt).getTime() > EDIT_WINDOW_MS) {
    return res.status(409).json({ success: false, error: 'This message is more than 30 minutes old and can no longer be edited.' });
  }
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'Message text is required.' });
  const updated = orgChat.editMessage(ctx.conversation.id, ctx.message.id, ctx.user.id, text);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  res.json({ success: true, message: updated });
});

app.delete('/api/org-chat/conversations/:convId/messages/:msgId', requireAuthApi, (req, res) => {
  const ctx = loadOrgChatMessage(req, res);
  if (!ctx) return;
  if (ctx.message.senderId !== ctx.user.id) return res.status(403).json({ success: false, error: 'You can only delete your own messages.' });
  if (Date.now() - new Date(ctx.message.createdAt).getTime() > DELETE_EVERYONE_WINDOW_MS) {
    return res.status(409).json({ success: false, error: 'This message is more than 10 minutes old and can only be deleted for you.' });
  }
  if (orgMessageSeenByOthers(ctx.message)) {
    return res.status(409).json({ success: false, error: 'This message has already been seen and can only be deleted for you.' });
  }
  const updated = orgChat.deleteMessage(ctx.conversation.id, ctx.message.id, ctx.user.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  res.json({ success: true, message: updated });
});

app.post('/api/org-chat/conversations/:convId/messages/:msgId/delete-for-me', requireAuthApi, (req, res) => {
  const ctx = loadOrgChatMessage(req, res);
  if (!ctx) return;
  const updated = orgChat.deleteForMe(ctx.conversation.id, ctx.message.id, ctx.user.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  res.json({ success: true, message: updated });
});

app.post('/api/org-chat/conversations/:convId/messages/:msgId/react', requireAuthApi, (req, res) => {
  const ctx = loadOrgChatMessage(req, res);
  if (!ctx) return;
  const emoji = String((req.body && req.body.emoji) || '');
  if (!isValidReaction(emoji)) return res.status(400).json({ success: false, error: 'Not a supported reaction.' });
  const updated = orgChat.addReaction(ctx.conversation.id, ctx.message.id, ctx.user.id, ctx.role, emoji);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  const justReacted = (updated.reactions || []).some((r) => r.userId === ctx.user.id && r.emoji === emoji);
  if (justReacted && ctx.message.senderId !== ctx.user.id) {
    store.addNotification(ctx.message.senderId, { type: 'chat', message: `${ctx.participantName} reacted ${emoji} to your message.` });
  }
  res.json({ success: true, message: updated });
});

app.post('/api/org-chat/conversations/:convId/messages/:msgId/poll-vote', requireAuthApi, (req, res) => {
  const ctx = loadOrgChatMessage(req, res);
  if (!ctx) return;
  if (!ctx.message.poll) return res.status(400).json({ success: false, error: 'This message is not a poll.' });
  const optionId = Number(req.body && req.body.optionId);
  if (!ctx.message.poll.options.some((o) => o.id === optionId)) return res.status(400).json({ success: false, error: 'Not a valid poll option.' });
  const updated = orgChat.votePoll(ctx.conversation.id, ctx.message.id, ctx.user.id, optionId);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  res.json({ success: true, message: updated });
});

app.post('/api/org-chat/conversations/:convId/messages/:msgId/pin', requireAuthApi, (req, res) => {
  const ctx = loadOrgChatMessage(req, res);
  if (!ctx) return;
  const updated = orgChat.togglePin(ctx.conversation.id, ctx.message.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  res.json({ success: true, message: updated });
});

// Real fix for the org call button, which used to just paste the link into
// a plain-text message - mirrors the already-correct group-chat pattern
// (server.js's /api/group-chats/:id/meeting) but generalized to any
// conversation type via resolveOrgChatAccess.
app.post('/api/org-chat/conversations/:convId/meeting', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const access = resolveOrgChatAccess(user, req.params.convId);
  if (!access) return res.status(403).json({ success: false, error: 'Not your conversation.' });
  const meetingLink = String((req.body && req.body.meetingLink) || '').trim();
  if (!/^https?:\/\//i.test(meetingLink)) return res.status(400).json({ success: false, error: 'Paste a full Google Meet link beginning with https://.' });
  const conversation = orgChat.setMeetingLink(access.conversation.id, meetingLink);
  res.json({ success: true, conversation });
});

// Tutor-scoped list of every org conversation they participate in (direct
// with the org, plus any org group chats) - closes the gap where a tutor
// linked to an organization had no route at all to see its direct messages
// (orgChat.listForTutor() elsewhere is filtered to course groups only).
app.get('/api/organizations/mine/conversations', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const tutorProfile = tutors.findByUserId(user.id);
  if (!tutorProfile) return res.status(404).json({ success: false, error: 'No tutor profile found.' });
  const org = resolveOrgForUser(user);
  if (!org) return res.status(404).json({ success: false, error: 'You are not linked to an organization yet.' });
  const prefs = store.getThreadPrefs(user.id);
  const direct = orgChat.getOrCreateConversation(org.id, { type: 'tutor', tutorId: tutorProfile.id, name: tutorProfile.name });
  const groups = orgChat.listForOrganization(org.id).filter((c) => c.type === 'group' && c.participants.some((p) => p.type === 'tutor' && Number(p.id) === tutorProfile.id));
  const conversations = [direct, ...groups].map((c) => {
    const threadKey = `org:${c.id}`;
    const muted = prefs.mutedThreads[threadKey];
    const stillMuted = muted && (muted.until === null || new Date(muted.until) > new Date());
    return {
      ...c,
      unreadCount: orgChat.getUnreadCount(c.id, 'tutor'),
      threadKey,
      hiddenAt: prefs.hiddenThreads[threadKey] || null,
      favorite: prefs.favoriteThreadIds.includes(threadKey),
      archived: prefs.archivedThreadIds.includes(threadKey),
      pinned: prefs.pinnedThreadIds.includes(threadKey),
      muted: Boolean(stillMuted),
      mutedUntil: stillMuted && muted.until ? muted.until : null,
    };
  }).filter((c) => !(c.hiddenAt && new Date((c.messages || []).slice(-1)[0]?.createdAt || c.createdAt) <= new Date(c.hiddenAt)));
  res.json({ success: true, conversations, organizationName: org.name || org.contactName });
});

// --- ORGANIZATION PRIVATE CONTENT (videos, photos, info, games) ---

// Get private content for an organization (visible only to students and tutors linked to that org)
app.get('/api/organizations/:orgId/private-content', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const orgId = Number(req.params.orgId);
  const org = organizations.findById(orgId);
  
  if (!org) {
    return res.status(404).json({ success: false, error: 'Organization not found.' });
  }
  
  // Students receive general organization content; admins and approved tutors
  // can also receive items explicitly marked as shared.
  const isOrgAdmin = org.userId === user.id;
  const students = organizations.getStudentsForOrganization(orgId);
  const isMember = students.some((s) => s.studentId === user.id);
  const tutorProfile = tutors.findByUserId(user.id);
  const orgStudentIds = new Set(students.map((student) => Number(student.studentId)));
  const isOrgTutor = Boolean(tutorProfile && tutorProfile.status === 'approved' && assignments.listAll().some((record) => orgStudentIds.has(Number(record.studentId)) && Number(record.tutorId) === Number(tutorProfile.id)));
  const isApprovedTutor = Boolean(isOrgTutor || (tutorProfile && user.sponsor && Number(user.sponsor.orgId) === orgId));
  
  if (!isOrgAdmin && !isMember && !isApprovedTutor) {
    return res.status(403).json({ success: false, error: 'You do not have access to this content.' });
  }
  
  const allowedCategories = new Set();
  if (isMember) assignments.listForStudent(user.id).forEach((record) => { if (record.category) allowedCategories.add(record.category); });
  if (tutorProfile) (tutorProfile.categories || []).forEach((category) => allowedCategories.add(category));
  const content = orgContent.listForOrg(orgId).filter((item) => (
    isOrgAdmin || isApprovedTutor || (item.visibility !== 'shared' && (!item.category || allowedCategories.has(item.category)))
  ));
  res.json({ success: true, content, isOrgAdmin });
});

app.get('/api/organizations/tutor-workspace', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const tutor = tutors.findByUserId(user.id);
  const orgs = organizationMembershipsForUser(user);
  const requestedOrgId = req.query.orgId ? Number(req.query.orgId) : null;
  const org = (requestedOrgId && orgs.find((item) => item.id === requestedOrgId)) || orgs[0];
  if (!tutor || !org) return res.status(403).json({ success: false, error: 'Organization tutor access required.' });
  const orgStudents = organizations.getStudentsForOrganization(org.id).map((member) => {
    const student = store.findById(member.studentId);
    return { ...member, studentName: student?.name || member.studentName || 'Student', email: student?.email || '', studentPhotoUrl: student?.photoUrl || null };
  });
  const tutorRecords = assignments.listForTutor(tutor.id);
  const requestedStudentIds = new Set(tutorRecords.map((record) => Number(record.studentId)));
  assignments.listAll().filter((record) => (record.preferredTutorIds || []).includes(tutor.id)).forEach((record) => requestedStudentIds.add(Number(record.studentId)));
  const students = orgStudents.filter((member) => requestedStudentIds.has(Number(member.studentId)));
  const studentIds = new Set(students.map((member) => Number(member.studentId)));
  const assignmentsForOrg = tutorRecords.filter((record) => studentIds.has(Number(record.studentId)));
  const requests = assignments.listAll().filter((record) => record.status === 'pending' && (record.preferredTutorIds || []).includes(tutor.id) && studentIds.has(Number(record.studentId)));
  const content = orgContent.listForOrg(org.id)
    .filter((item) => item.visibility !== 'shared' || item.createdByUserId === user.id)
    .map((item) => ({ ...item, reactions: item.reactions || [], myReaction: (item.reactions || []).find((r) => r.userId === user.id)?.emoji || null }));
  const isOrgOwner = Boolean(organizations.findByUserId(user.id));
  // Org Tutor's own notification bell should only ever show things
  // related to this organization - not the account's whole notification
  // history (lesson requests, chat pings, etc., which belong to the
  // regular Notifications screen). type:'organization' is NOT that signal -
  // it's used everywhere else in this file for owner-only concerns (wallet
  // top-ups, subscription payments, an org chat ping or content submission
  // TO the owner - see /api/organizations/me/notifications above, which
  // scopes the Sponsor tab's own bell by that exact type). Matching on it
  // here previously leaked an org owner's own wallet/subscription
  // notifications into their Tutor Dashboard whenever the same account
  // held both relationships to an org. Only an explicit /org-tutor href
  // (nothing currently sets one) should ever qualify.
  const orgNotifications = (user.notifications || []).filter((item) => String(item.href || '').startsWith('/org-tutor'));
  // content/events below are regenerated fresh on every request, not read
  // from user.notifications, so their `read` state has to come from this
  // per-org cursor rather than a per-item flag - see markOrgTutorNotificationsRead.
  const orgReadAt = user.orgTutorNotificationsReadAt && user.orgTutorNotificationsReadAt[org.id] ? new Date(user.orgTutorNotificationsReadAt[org.id]) : null;
  const isReadByCursor = (createdAt) => Boolean(orgReadAt && createdAt && new Date(createdAt) <= orgReadAt);
  const notifications = [
    ...orgNotifications.map((item) => ({ ...item })),
    ...content.map((item) => ({ id: `content-${item.id}`, type: item.type, message: `${item.createdByName} posted ${item.type}: ${item.title}`, createdAt: item.createdAt, href: `/org-tutor?orgId=${org.id}#feeds`, read: isReadByCursor(item.createdAt) })),
    ...(org.events || []).map((item) => ({ id: `event-${item.id}`, type: 'event', message: `Event scheduled: ${item.title}`, createdAt: item.createdAt || item.scheduledAt, href: `/org-tutor?orgId=${org.id}#schedules`, read: isReadByCursor(item.createdAt || item.scheduledAt) })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ success: true, organization: { id: org.id, name: org.name || org.contactName, logoUrl: org.logoUrl || null, address: org.address || null }, organizations: orgs.map((item) => ({ id: item.id, name: item.name || item.contactName, logoUrl: item.logoUrl || null, address: item.address || null })), students, assignments: assignmentsForOrg, requests, content, events: org.events || [], notifications, isOrgOwner });
});

app.post('/api/organizations/tutor-workspace/notifications/read-all', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const tutor = tutors.findByUserId(user.id);
  const orgs = organizationMembershipsForUser(user);
  const requestedOrgId = req.query.orgId ? Number(req.query.orgId) : null;
  const org = (requestedOrgId && orgs.find((item) => item.id === requestedOrgId)) || orgs[0];
  if (!tutor || !org) return res.status(403).json({ success: false, error: 'Organization tutor access required.' });
  store.markOrgTutorNotificationsRead(user.id, org.id);
  res.json({ success: true });
});

// A tutor or student reacts to an organization's feed/announcement post -
// same fixed 5-emoji set as chat, one reaction per user per post.
app.post('/api/organizations/content/:id/react', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const item = orgContent.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'Post not found.' });
  const org = organizations.findById(item.orgId);
  const isMember = Boolean(org) && (organizationMembershipsForUser(user).some((membership) => membership.id === org.id) || org.userId === user.id);
  if (!isMember) return res.status(403).json({ success: false, error: 'Not your organization.' });
  const emoji = String((req.body && req.body.emoji) || '');
  if (!isValidReaction(emoji)) return res.status(400).json({ success: false, error: 'Not a supported reaction.' });
  const updated = orgContent.addReaction(item.id, user.id, emoji);
  res.json({ success: true, item: { ...updated, myReaction: (updated.reactions || []).find((r) => r.userId === user.id)?.emoji || null } });
});

app.get('/api/organizations/library', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = resolveOrgForUser(user);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const isOrgOwner = org.userId === user.id;
  // Org-owner view gets how many tutors have sent something back for a
  // "every tutor must fill this form" item; a tutor viewer gets whether
  // *they* already have, so the UI can swap "Upload response" for
  // "Submitted" instead of inviting a duplicate.
  const decorate = (item) => ({
    ...item,
    source: 'organization',
    ...(isOrgOwner ? { submissionCount: orgContent.listSubmissionsFor(item.id).length } : {}),
    ...(!isOrgOwner ? { mySubmission: orgContent.listSubmissionsFor(item.id).find((s) => s.createdByUserId === user.id) || null } : {}),
  });
  const content = orgContent.listForOrg(org.id).filter((item) => item.libraryItem === true).map(decorate);
  const studentIds = new Set(organizations.getStudentsForOrganization(org.id).map((member) => Number(member.studentId)));
  const tutorUserIds = new Set(assignments.listAll().filter((record) => studentIds.has(Number(record.studentId)) && record.tutorId).map((record) => {
    const tutor = tutors.findById(record.tutorId);
    return tutor && tutor.userId;
  }).filter(Boolean));
  // A reel's own shape (title/description/url/addedBy) doesn't match what
  // the library list renders (title/text/fileUrl-or-url) - decorated the
  // same way regardless of whose reel it is, so the client's renderer never
  // has to know these came from a different data source than org content.
  const decorateReel = (item) => ({ ...item, text: item.description || '', fileUrl: item.isFile ? item.url : null, url: item.isFile ? null : item.url, source: 'tutor' });
  const tutorItems = reels.listActive().filter((item) => item.ownerScope === 'tutor' && tutorUserIds.has(item.addedBy)).map(decorateReel);
  const sort = (items) => items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  let mine;
  let shared;
  if (isOrgOwner) {
    // Unchanged from before: "mine" is the org's own posted content, and
    // "shared" is anything explicitly marked shared plus every relevant
    // tutor's video library, all mixed for the owner to browse.
    mine = content.filter((item) => item.createdByUserId === org.userId);
    shared = [...content.filter((item) => item.visibility === 'shared'), ...tutorItems];
  } else {
    // A tutor's own view: "mine" is *their* video uploads (not the org's),
    // and "shared" is what *they've* sent back to the org (a filled form, a
    // requested document) rather than the org's own shared posts.
    mine = reels.listActive().filter((item) => item.ownerScope === 'tutor' && item.addedBy === user.id).map(decorateReel);
    shared = orgContent.listForOrg(org.id).filter((item) => item.visibility === 'submission' && item.createdByUserId === user.id).map((item) => ({ ...item, source: 'submission' }));
  }
  // "General" is the shared browsing/attach surface either role sees: the
  // org's own posted library content plus every relevant tutor's videos.
  const general = [...content, ...tutorItems];
  res.json({ success: true, organizationName: org.name || org.contactName, folders: org.folders || [], general: sort(general), mine: sort(mine), shared: sort(shared) });
});

// A tutor's own "share something with the org" upload from the Shared tab -
// not tied to a specific requiresSubmission item (see the submissions route
// below for that case), just a document/link they want the org to have.
app.post('/api/organizations/:orgId/library/shared-uploads', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const orgId = Number(req.params.orgId);
  const org = organizations.findById(orgId);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const tutorProfile = tutors.findByUserId(user.id);
  const orgStudentIds = new Set(organizations.getStudentsForOrganization(orgId).map((student) => Number(student.studentId)));
  const isApprovedTutor = Boolean(tutorProfile && tutorProfile.status === 'approved' && (
    assignments.listAll().some((record) => orgStudentIds.has(Number(record.studentId)) && Number(record.tutorId) === Number(tutorProfile.id))
    || (user.sponsor && Number(user.sponsor.orgId) === orgId)
  ));
  if (!isApprovedTutor) return res.status(403).json({ success: false, error: 'Approved organization tutor access required.' });
  const { title, url, fileUrl, text } = req.body || {};
  if (!url && !fileUrl) return res.status(400).json({ success: false, error: 'Add a URL or choose a file to share.' });
  const item = orgContent.create({
    orgId, type: 'document', title: title && String(title).trim() ? String(title).trim().slice(0, 200) : 'Shared upload',
    text: text || '', url: url || null, fileUrl: fileUrl || null,
    visibility: 'submission', createdByUserId: user.id, createdByName: tutorProfile.name || user.name,
    replyToId: null,
  });
  store.addNotification(org.userId, {
    type: 'organization',
    message: `${tutorProfile.name || user.name} shared "${item.title}" with your organization.`,
    href: '/ngo-dashboard#library',
  });
  res.json({ success: true, item });
});

// A tutor sends something back for a library item the org flagged
// requiresSubmission (e.g. a filled-out form) - stored as another
// org-content row, keyed back to the original via replyToId, but never
// libraryItem:true so it never shows up as a browsable entry on its own.
app.post('/api/organizations/:orgId/library/:itemId/submissions', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const orgId = Number(req.params.orgId);
  const org = organizations.findById(orgId);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const originalItem = orgContent.listForOrg(orgId).find((item) => item.id === Number(req.params.itemId) && item.libraryItem === true);
  if (!originalItem) return res.status(404).json({ success: false, error: 'Library item not found.' });

  const tutorProfile = tutors.findByUserId(user.id);
  const orgStudentIds = new Set(organizations.getStudentsForOrganization(orgId).map((student) => Number(student.studentId)));
  const isApprovedTutor = Boolean(tutorProfile && tutorProfile.status === 'approved' && (
    assignments.listAll().some((record) => orgStudentIds.has(Number(record.studentId)) && Number(record.tutorId) === Number(tutorProfile.id))
    || (user.sponsor && Number(user.sponsor.orgId) === orgId)
  ));
  if (!isApprovedTutor) return res.status(403).json({ success: false, error: 'Approved organization tutor access required.' });

  const { url, fileUrl, text } = req.body || {};
  if (!url && !fileUrl) return res.status(400).json({ success: false, error: 'Add a URL or choose a file to send back.' });

  const item = orgContent.create({
    orgId, type: originalItem.type, title: `Response: ${originalItem.title}`,
    text: text || '', url: url || null, fileUrl: fileUrl || null,
    visibility: 'submission', createdByUserId: user.id, createdByName: tutorProfile.name || user.name,
    replyToId: originalItem.id,
  });
  store.addNotification(org.userId, {
    type: 'organization',
    message: `${tutorProfile.name || user.name} sent back "${originalItem.title}".`,
    href: '/ngo-dashboard#library',
  });
  res.json({ success: true, item });
});

// Org-owner view of every submission sent back for one library item.
app.get('/api/organizations/library/:itemId/submissions', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const originalItem = orgContent.listForOrg(org.id).find((item) => item.id === Number(req.params.itemId) && item.libraryItem === true);
  if (!originalItem) return res.status(404).json({ success: false, error: 'Library item not found.' });
  res.json({ success: true, item: originalItem, submissions: orgContent.listSubmissionsFor(originalItem.id) });
});

app.post('/api/organizations/library/folders', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const name = String(req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Folder name is required.' });
  res.json({ success: true, folder: organizations.addFolder(org.id, name) });
});

app.put('/api/organizations/library/:contentId', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const contentId = Number(req.params.contentId);
  const existing = orgContent.listForOrg(org.id).find((item) => item.id === contentId);
  if (!existing) return res.status(404).json({ success: false, error: 'Library item not found.' });
  const item = orgContent.updateById(contentId, req.body || {});
  res.json({ success: true, item });
});

app.delete('/api/organizations/library/:contentId', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const contentId = Number(req.params.contentId);
  const existing = orgContent.listForOrg(org.id).find((item) => item.id === contentId);
  if (!existing) return res.status(404).json({ success: false, error: 'Library item not found.' });
  orgContent.removeById(contentId);
  res.json({ success: true });
});
app.post('/api/organizations/library', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const { title, category, url, fileUrl, type, visibility, folderId, text, requiresSubmission } = req.body || {};
  if (!String(title || '').trim()) return res.status(400).json({ success: false, error: 'Name is required.' });
  if (!url && !fileUrl) return res.status(400).json({ success: false, error: 'Add a URL or choose a file.' });
  const selectedType = ['photo', 'video', 'document', 'info'].includes(type) ? type : 'info';
  const item = orgContent.create({
    orgId: org.id,
    type: selectedType,
    title: String(title).trim(),
    text: text || '',
    category: category ? String(category).trim() : null,
    url: url ? String(url).trim() : null,
    fileUrl: fileUrl || null,
    visibility: visibility === 'shared' ? 'shared' : 'general',
    folderId: folderId || null,
    libraryItem: true,
    requiresSubmission: Boolean(requiresSubmission),
    createdByUserId: org.userId,
    createdByName: org.name || org.contactName,
  });
  res.json({ success: true, item });
});

// Upload media file for organization content
app.post('/api/organizations/upload-media', hydrateUploadToken, requireAuthApi, (req, res) => {
  const user = currentUser(req);
  // resolveOrgForUser (not the stricter organizations.findByUserId) so an
  // affiliated tutor can use this too - needed for sending a file back on
  // a library item that requires a submission, not just the org's own
  // library uploads.
  const org = resolveOrgForUser(user);
  if (!org || org.status !== 'approved') {
    return res.status(403).json({ success: false, error: 'You must have an approved organization to upload.' });
  }

  // Handle both photo and video uploads
  const mediaType = req.query.type || 'photo'; // 'photo', 'video', or 'document'
  const uploader = mediaType === 'video' ? videoUpload : mediaType === 'document' ? chatUpload : photoUpload;
  
  uploader.single('media')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large (max ${mediaType === 'video' ? '500MB' : '8MB'}).`
        : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file to upload.' });

    const folder = mediaType === 'video' ? 'videos' : mediaType === 'document' ? 'chat' : 'photos';
    const url = await resolveUploadedFileUrl(req.file, folder);

    res.json({ success: true, url, mediaType });
  });
});

// Create organization content item (info, game link, photo, video)
app.post('/api/organizations/private-content', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org || org.status !== 'approved') {
    return res.status(403).json({ success: false, error: 'You must have an approved organization.' });
  }

  const { type, title, text, url, fileUrl, coverUrl, category, visibility } = req.body || {};
  if (!type || !['info', 'video', 'photo', 'document', 'game', 'feed', 'announcement', 'notification'].includes(type)) {
    return res.status(400).json({ success: false, error: 'Invalid content type.' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Title is required.' });
  }

  const item = orgContent.create({
    orgId: org.id,
    type,
    title: title.trim(),
    text: text ? text.trim() : '',
    url: url && type === 'game' ? url.trim() : null,
    // 'announcement' can carry a document (or any file) attachment too -
    // not just the photo/video types a Feed post uses.
    fileUrl: fileUrl && ['photo', 'video', 'document', 'announcement'].includes(type) ? fileUrl : null,
    coverUrl: coverUrl || null,
    category: category ? String(category).trim() : null,
    visibility: ['general', 'shared'].includes(visibility) ? visibility : 'general',
    createdByUserId: user.id,
    createdByName: org.name || org.contactName,
  });

  if (['announcement', 'notification'].includes(type) || visibility === 'general') {
    const recipients = new Set(organizations.getStudentsForOrganization(org.id).map((member) => Number(member.studentId)));
    assignments.listAll().forEach((record) => {
      if (!recipients.has(Number(record.studentId)) || !record.tutorId) return;
      const tutor = tutors.findById(record.tutorId);
      if (tutor) recipients.add(Number(tutor.userId));
    });
    recipients.forEach((userId) => store.addNotification(userId, { type: type === 'announcement' ? 'announcement' : 'organization', message: `${org.name || org.contactName} posted ${type}: ${title.trim()}.`, href: '/ngo-dashboard#classroom' }));
  }

  res.json({ success: true, item });
});

// Delete organization content (org admin only)
app.delete('/api/organizations/private-content/:contentId', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org || org.status !== 'approved') {
    return res.status(403).json({ success: false, error: 'You must have an approved organization.' });
  }

  const contentId = Number(req.params.contentId);
  const content = orgContent.listForOrg(org.id).find((c) => c.id === contentId);
  if (!content) {
    return res.status(404).json({ success: false, error: 'Content not found.' });
  }

  const deleted = orgContent.removeById(contentId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Failed to delete content.' });
  }

  res.json({ success: true, message: 'Content deleted.' });
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
  const user = currentUser(req);
  const content = curriculum.getForCategory(curriculum.ORIENTATION_KEY);
  // Include sponsor/organization context if tutor redeemed a code
  const sponsor = user.sponsor || null;
  res.json({
    success: true,
    content,
    questions: assessments.getQuestionsForTaker('orientation', null),
    completed: req.tutorProfile.orientationCompleted,
    reward: req.tutorProfile.orientationReward,
    sponsor,
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

// Records acceptance of the mandatory 14-screen Tutor Orientation modal
// (mobile/src/data/tutorOrientationContent.ts) - a distinct, separate
// feature from the orientation content-feed/quiz routes above despite the
// similar name; that one is an ongoing admin content feed, this is a
// one-time gate before an approved tutor's dashboard is reachable at all.
app.post('/api/tutors/me/tutor-orientation/acknowledge', requireApprovedTutorApi, (req, res) => {
  const { version } = req.body || {};
  const updated = tutors.acknowledgeTutorOrientation(req.tutorProfile.id, version);
  if (!updated) return res.status(404).json({ success: false, error: 'Tutor profile not found.' });
  res.json({ success: true, tutorOrientationAcceptedAt: updated.tutorOrientationAcceptedAt, tutorOrientationVersion: updated.tutorOrientationVersion });
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
  const { category, genre, ageGroup, city, lessonType, orgId } = req.query;
  let list = tutors.listApproved();
  // Org Student mode's own Find a Tutor scopes the marketplace down to
  // just that organization's linked tutors, instead of every Mozart tutor -
  // the whole point of that mode is staying inside the org's own roster.
  if (orgId) {
    const orgTutorUserIds = new Set(organizations.getTutorsForOrganization(Number(orgId)));
    list = list.filter((t) => orgTutorUserIds.has(Number(t.userId)));
  }
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
    city: t.city, teachesOnline: t.teachesOnline, inPersonVenue: t.inPersonVenue, photoUrl: t.photoUrl || store.findById(t.userId)?.photoUrl || null,
    mapLocation: require('./data/tutor-map-location')(t),
    location: { area: t.locality?.area || null, city: t.locality?.city || null, state: t.locality?.state || null, country: t.locality?.country || null },
    hourlyRateUsd: t.hourlyRateUsd,
    hourlyRateLocal: Math.round((await currency.convertFromUsd(t.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
    currency: geoInfo.currency, symbol: geoInfo.symbol,
    avgRating: tutors.avgRating(t),
    avgProfessionalism: tutors.avgProfessionalism(t),
    experienceYears: t.experienceYears,
    bio: t.bio,
    ratingCount: t.ratingCount || 0,
    isSuperTutor: tutors.isSuperTutor(t),
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
  const viewer = currentUser(req);
  const isOwner = Boolean(viewer) && viewer.id === tutor.userId;
  const geoInfo = await getGeoInfo(req);
  // Country-visibility is a discovery/search rule (don't show a tutor to
  // students outside their serving country) - it should never hide a
  // tutor's own profile from themselves, which is all "My Profile" is.
  if (!isOwner && !inViewerCountry(tutor, geoInfo.name)) {
    return res.status(404).json({ success: false, error: 'Tutor not found.' });
  }
  const addressUnlocked = Boolean(viewer) && (
    viewer.role === 'admin'
    || isOwner
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
    currency: geoInfo.currency,
    symbol: geoInfo.symbol,
    candidates: await Promise.all(candidates.map(async (c) => ({
      id: c.tutor.id, name: c.tutor.name, bio: c.tutor.bio, city: c.tutor.city, photoUrl: c.tutor.photoUrl || null,
      teachesOnline: c.tutor.teachesOnline, experienceYears: c.tutor.experienceYears, inPersonVenue: c.tutor.inPersonVenue,
      hourlyRateUsd: c.tutor.hourlyRateUsd,
      hourlyRateLocal: Math.round((await currency.convertFromUsd(c.tutor.hourlyRateUsd, geoInfo.currency)) * 100) / 100,
      avgRating: tutors.avgRating(c.tutor), avgProfessionalism: tutors.avgProfessionalism(c.tutor),
      distanceKm: c.distanceKm != null ? Math.round(c.distanceKm * 10) / 10 : null,
      localityMatch: type === 'online' ? (c.localityScore >= 1 ? 'same city' : c.localityScore >= 0.66 ? 'same region' : c.localityScore >= 0.33 ? 'same country' : null) : null,
    }))),
  });
});

app.post('/api/tutor-requests', requireAuthApi, async (req, res) => {
  const { category, categories, genre, ageGroup, desiredLevel, city, lessonType, phone, notes, preferredTutorIds } = req.body || {};
  const requestedCategories = [...new Set((Array.isArray(categories) ? categories : [category]).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!requestedCategories.length) return res.status(400).json({ success: false, error: 'Choose at least one subject.' });
  const type = assignments.LESSON_TYPES.includes(lessonType) ? lessonType : null;
  if (!type) return res.status(400).json({ success: false, error: 'Choose online, physical, or in-studio lessons.' });
  if (type !== 'online' && !city) return res.status(400).json({ success: false, error: 'Provide your city for in-person lessons.' });
  const suggestedAmountUsd = req.body.suggestedAmountUsd != null && req.body.suggestedAmountUsd !== ''
    ? Math.max(0, Number(req.body.suggestedAmountUsd) || 0)
    : null;

  const user = currentUser(req);
  // A sponsor can submit this same request on behalf of one of their own
  // sponsored students ("Assign a Tutor" on the Sponsor Dashboard) instead
  // of the student self-requesting - the tutor still goes through the
  // normal accept/decline flow below, just addressed to a different
  // student than the caller. Only ever allowed for a student actually
  // linked to the caller's own organization.
  let actingStudent = user;
  if (req.body.assignStudentId) {
    const org = organizations.findByUserId(user.id);
    const targetStudent = store.findById(req.body.assignStudentId);
    const isLinkedToOrg = Boolean(org && targetStudent && targetStudent.sponsor && targetStudent.sponsor.orgId === org.id);
    if (!isLinkedToOrg) return res.status(403).json({ success: false, error: 'You can only assign a tutor to one of your sponsored students.' });
    actingStudent = targetStudent;
  }
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
  const selectedTutors = requestTutorIds.map((id) => tutors.findById(id)).filter(Boolean);
  if (selectedTutors.length && requestedCategories.some((selectedCategory) => selectedTutors.some((tutor) => !(tutor.categories || []).includes(selectedCategory)))) {
    return res.status(400).json({ success: false, error: 'Each selected course must be taught by the chosen tutor.' });
  }

  // Negotiate (broadcast) requests carry the student's exact address, if
  // they've ever shared their precise location (the same GPS reverse-geocode
  // the "Use my current location" button sets - data/store.js's
  // setRealLocation), so a candidate tutor can judge reachability before
  // accepting. The direct "request this one tutor" flow deliberately never
  // sets this, keeping its existing reveal-only-once-matched behavior.
  const isNegotiate = !requestTutorIds.length;
  // Only physical/studio lessons need the tutor to actually travel or know
  // where to meet - an online negotiate request has no reason to expose
  // the student's home address.
  const studentFullAddress = (isNegotiate && type !== 'online') ? (actingStudent.studentProfile && actingStudent.studentProfile.fullAddress) || null : null;

  const studentGeo = city ? await geocodeAddress(city) : null;
  const requestsWithCandidates = requestedCategories.map((selectedCategory) => {
    const candidates = assignments.generateCandidates({
      category: selectedCategory, genre, ageGroup, level: desiredLevel, studentCoords: studentGeo, studentLocality: studentGeo, lessonType: type,
    }).filter((c) => inViewerCountry(c.tutor, geoInfo.name) && c.tutor.id !== selfTutorId);
    const request = assignments.createRequest({
      studentId: actingStudent.id, studentName: actingStudent.name, studentEmail: actingStudent.email,
      category: selectedCategory, genre, ageGroup, desiredLevel, city, lessonType: type, phone, notes,
      preferredTutorIds: requestTutorIds, candidateIds: candidates.map((c) => c.tutor.id),
      intakeResponses: Array.isArray(req.body.intakeResponses) ? req.body.intakeResponses : [], studentCountry: geoInfo.name,
      suggestedAmountUsd, studentFullAddress,
    });
    return { request, candidates };
  });
  const requests = requestsWithCandidates.map((item) => item.request);
  const amountSuffix = suggestedAmountUsd ? ` - they suggested $${suggestedAmountUsd.toFixed(2)}/hr` : '';

  notifyAdmins({
    type: 'tutor-request',
    subject: `New tutor request - ${requestedCategories.join(', ')}`,
    message: `New tutor request from ${actingStudent.name} for ${requestedCategories.join(', ')}${amountSuffix} - match them in the admin panel.`,
    excludeUserId: user.id,
  });

  if (!isNegotiate) {
    requestTutorIds.forEach((id) => {
      const preferredTutor = tutors.findById(id);
      if (preferredTutor && preferredTutor.status === 'approved') {
        store.addNotification(preferredTutor.userId, { type: 'tutor-request', message: `${actingStudent.name} requested you for ${requestedCategories.join(', ')}${amountSuffix}. Open your Tutor Profile to review and accept the requests.`, href: '/tutor' });
      }
    });
  } else {
    // InDrive-style negotiate: no specific tutor was chosen, so the request
    // fans out to every matching candidate tutor as a structured offer (see
    // data/tutorOffers.js) - each can accept, counter with their own rate,
    // or decline, independently; the student then reviews every response
    // and picks one (POST /api/tutor-requests/:id/select).
    const notifiedUserIds = new Set();
    requestsWithCandidates.forEach(({ request, candidates }) => {
      if (candidates.length) tutorOffers.createInvites(request.id, suggestedAmountUsd, candidates);
      candidates.forEach(({ tutor }) => {
        if (notifiedUserIds.has(tutor.userId)) return;
        notifiedUserIds.add(tutor.userId);
        store.addNotification(tutor.userId, {
          type: 'tutor-request',
          message: `New ${request.category} student request near you${amountSuffix}. Open your Tutor Profile to review, accept, or counter.`,
          href: '/tutor?tab=negotiate',
        });
        const tutorUser = store.findById(tutor.userId);
        if (tutorUser && tutorUser.email) {
          mailer.sendMail({
            to: tutorUser.email,
            subject: 'Mozart Techniques - New student request',
            text: `A student is looking for a ${request.category} tutor${amountSuffix}.\n\nReview and respond in your Tutor Dashboard: ${publicAppUrl(req)}/tutor?tab=negotiate`,
          });
        }
      });
    });
  }

  store.addNotification(actingStudent.id, {
    type: 'tutor-request',
    message: isNegotiate
      ? `Your requests for ${requestedCategories.join(', ')} have been sent to matching tutors near you. You will be notified as they respond.`
      : `Your requests for ${requestedCategories.join(', ')} have been sent to your chosen tutor. You will be notified when they accept.`,
    href: isNegotiate ? '/find-tutor?tab=negotiate' : '/dashboard',
  });
  if (actingStudent.id !== user.id) {
    store.addNotification(user.id, {
      type: 'organization',
      message: `You matched ${actingStudent.name} with a ${requestedCategories.join(', ')} tutor. They'll be notified once the tutor accepts.`,
    });
  }

  const suggestedAmountLocal = suggestedAmountUsd != null
    ? Math.round((await currency.convertFromUsd(suggestedAmountUsd, geoInfo.currency)) * 100) / 100
    : null;

  res.json({
    success: true, request: requests[0], requests,
    suggestedAmountLocal, currency: geoInfo.currency, symbol: geoInfo.symbol,
  });
});

// --- Negotiate flow: student reviews every tutor's response and picks one ---

app.get('/api/tutor-requests/mine', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const geoInfo = await getGeoInfo(req);
  const myRequests = assignments.listAll().filter((r) => r.studentId === user.id && !(r.preferredTutorIds || []).length);
  const requests = await Promise.all(myRequests.map(async (r) => {
    const offers = tutorOffers.listByRequest(r.id);
    const decorated = await Promise.all(offers.map(async (offer) => {
      const tutor = tutors.findById(offer.tutorId);
      const amountUsd = offer.status === 'countered' ? offer.counterAmountUsd : offer.suggestedAmountUsd;
      return {
        ...offer,
        tutorName: tutor ? tutor.name : 'Tutor',
        tutorPhotoUrl: tutor ? tutor.photoUrl || null : null,
        tutorBio: tutor ? tutor.bio : null,
        tutorCity: tutor ? tutor.city : null,
        tutorHourlyRateUsd: tutor ? tutor.hourlyRateUsd : null,
        avgRating: tutor ? tutors.avgRating(tutor) : null,
        amountLocal: amountUsd != null ? Math.round((await currency.convertFromUsd(amountUsd, geoInfo.currency)) * 100) / 100 : null,
      };
    }));
    return { ...r, offers: decorated };
  }));
  res.json({ success: true, requests, currency: geoInfo.currency, symbol: geoInfo.symbol });
});

// Lets a student withdraw their own request before any tutor is matched -
// only while it's still 'pending'; once a tutor is assigned this route
// won't touch it (that's a real assignment by then, not a delete-able draft).
app.delete('/api/tutor-requests/:id', requireAuthApi, (req, res) => {
  const respondedOffers = tutorOffers.listByRequest(req.params.id)
    .filter((o) => ['accepted', 'countered', 'invited'].includes(o.status));
  const removed = assignments.removeRequest(req.params.id, currentUser(req).id);
  if (!removed) return res.status(404).json({ success: false, error: 'Request not found or no longer pending.' });
  tutorOffers.removeByRequest(req.params.id);
  respondedOffers.forEach((offer) => {
    const tutor = tutors.findById(offer.tutorId);
    if (tutor) store.addNotification(tutor.userId, { type: 'tutor-request', message: `The student withdrew their "${removed.category}" request.` });
  });
  res.json({ success: true });
});

app.post('/api/tutor-requests/:id/select', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const request = assignments.findById(req.params.id);
  if (!request || request.studentId !== user.id) return res.status(404).json({ success: false, error: 'Request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ success: false, error: 'This request is no longer open.' });
  const { offerId } = req.body || {};
  const offer = tutorOffers.findById(offerId);
  if (!offer || offer.requestId !== request.id) return res.status(404).json({ success: false, error: 'Offer not found.' });
  if (!['accepted', 'countered'].includes(offer.status)) return res.status(400).json({ success: false, error: 'You can only pick a tutor who accepted or countered.' });
  const tutor = tutors.findById(offer.tutorId);
  if (!tutor) return res.status(404).json({ success: false, error: 'Tutor not found.' });

  tutorOffers.select(offer.id);
  tutorOffers.markOthersNotSelected(request.id, offer.id);
  // A countered offer's counterAmountUsd is what the student is actually
  // selecting (they're choosing this offer BECAUSE of the countered rate);
  // an accepted offer means the tutor agreed to the student's own
  // suggestedAmountUsd as-is. Falls back to the tutor's live rate only if
  // this request never carried a suggested amount at all.
  const agreedRateUsd = offer.status === 'countered'
    ? offer.counterAmountUsd
    : (offer.suggestedAmountUsd != null ? offer.suggestedAmountUsd : tutor.hourlyRateUsd);
  const updated = assignments.assignTutor(request.id, tutor, offer.distanceKm, agreedRateUsd);

  store.addNotification(tutor.userId, { type: 'tutor-request', message: `${user.name} picked you for their ${updated.category} request. Your dashboard is ready.`, href: '/tutor' });
  tutorOffers.listByRequest(request.id)
    .filter((o) => o.status === 'not_selected')
    .forEach((o) => {
      const other = tutors.findById(o.tutorId);
      if (other) store.addNotification(other.userId, { type: 'tutor-request', message: `The "${updated.category}" student request was matched with another tutor.` });
    });

  res.json({ success: true, request: updated });
});

// --- Negotiate flow: tutor side - review invites, accept/counter/decline ---

app.get('/api/tutor-offers/mine', requireApprovedTutorApi, async (req, res) => {
  const geoInfo = await getGeoInfo(req);
  const offers = tutorOffers.listByTutor(req.tutorProfile.id);
  const decorated = await Promise.all(offers.map(async (offer) => {
    const request = assignments.findById(offer.requestId);
    const amountUsd = offer.status === 'countered' ? offer.counterAmountUsd : offer.suggestedAmountUsd;
    return {
      ...offer,
      request,
      suggestedAmountLocal: offer.suggestedAmountUsd != null ? Math.round((await currency.convertFromUsd(offer.suggestedAmountUsd, geoInfo.currency)) * 100) / 100 : null,
      amountLocal: amountUsd != null ? Math.round((await currency.convertFromUsd(amountUsd, geoInfo.currency)) * 100) / 100 : null,
    };
  }));
  res.json({ success: true, offers: decorated.filter((o) => o.request), currency: geoInfo.currency, symbol: geoInfo.symbol });
});

app.post('/api/tutor-offers/:id/accept', requireApprovedTutorApi, (req, res) => {
  const offer = tutorOffers.findById(req.params.id);
  if (!offer || offer.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Offer not found.' });
  if (offer.status !== 'invited') return res.status(400).json({ success: false, error: 'This request is no longer open.' });
  const updated = tutorOffers.accept(offer.id);
  const request = assignments.findById(offer.requestId);
  if (request) store.addNotification(request.studentId, { type: 'tutor-request', message: `${req.tutorProfile.name} accepted your ${request.category} request at your suggested rate. Review and pick a tutor from your requests.`, href: '/find-tutor?tab=negotiate' });
  res.json({ success: true, offer: updated });
});

app.post('/api/tutor-offers/:id/counter', requireApprovedTutorApi, (req, res) => {
  const offer = tutorOffers.findById(req.params.id);
  if (!offer || offer.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Offer not found.' });
  if (offer.status !== 'invited') return res.status(400).json({ success: false, error: 'This request is no longer open.' });
  const { amountUsd, note } = req.body || {};
  if (!amountUsd || Number(amountUsd) <= 0) return res.status(400).json({ success: false, error: 'Enter a counter-offer amount.' });
  const updated = tutorOffers.counter(offer.id, { amountUsd, note });
  const request = assignments.findById(offer.requestId);
  if (request) store.addNotification(request.studentId, { type: 'tutor-request', message: `${req.tutorProfile.name} sent a counter-offer for your ${request.category} request.`, href: '/find-tutor?tab=negotiate' });
  res.json({ success: true, offer: updated });
});

app.post('/api/tutor-offers/:id/decline', requireApprovedTutorApi, (req, res) => {
  const offer = tutorOffers.findById(req.params.id);
  if (!offer || offer.tutorId !== req.tutorProfile.id) return res.status(404).json({ success: false, error: 'Offer not found.' });
  if (offer.status !== 'invited') return res.status(400).json({ success: false, error: 'This request is no longer open.' });
  res.json({ success: true, offer: tutorOffers.decline(offer.id) });
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
    // Direct "request this specific tutor" requests only. Negotiate
    // (broadcast) requests use the structured tutorOffers flow instead
    // (GET /api/tutor-offers/mine) - that one supports counter-offers and
    // lets the student compare every response, rather than instant-assigning
    // to whichever tutor accepts first.
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
  const isEligible = record && (record.preferredTutorIds || []).includes(req.tutorProfile.id);
  if (!record || record.status !== 'pending' || !isEligible) {
    return res.status(404).json({ success: false, error: 'Student request not found.' });
  }
  // The direct "request this tutor" flow has no counter-offer step - accepting
  // means accepting the student's own suggestedAmountUsd as-is, if they set one.
  const agreedRateUsd = record.suggestedAmountUsd != null ? record.suggestedAmountUsd : req.tutorProfile.hourlyRateUsd;
  const updated = assignments.assignTutor(record.id, req.tutorProfile, null, agreedRateUsd);
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
  const { category, genre, q } = req.query;
  const requestedItem = String(req.query.item || '').trim().toLowerCase();
  if (requestedItem) {
    const item = reels.listActive().find((entry) => librarySlug(entry.title) === requestedItem || String(entry.title || '').trim().toLowerCase() === requestedItem);
    if (!item) return res.status(404).json({ success: false, error: 'Library item not found.' });
    const organizationUser = Boolean(user.sponsor || organizations.findByUserId(user.id));
    if (user.role !== 'admin' && !organizationUser && item.category && !enrolledCategoriesForUser(user).has(item.category)) {
      return res.status(403).json({ success: false, error: 'You do not have access to this library item.' });
    }
    return res.json({ success: true, item, items: [item] });
  }
  const searchTerm = String(q || '').trim().toLowerCase();
  let items = reels.listActive({ category: category || null, genre: genre || null }).filter((item) => (item.ownerScope || 'mozart') === 'mozart');
  const organizationUser = Boolean(user.sponsor || organizations.findByUserId(user.id));
  if (user.role !== 'admin' && !organizationUser) {
    const allowed = enrolledCategoriesForUser(user);
    items = items.filter((item) => !item.category || allowed.has(item.category));
  }
  if (searchTerm) {
    items = items.filter((item) => {
      const haystack = [item.title, item.description, item.category, item.genre, item.url].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(searchTerm) || categoryMatchesQuery(item.category, searchTerm);
    });
  }
  items = [...items].sort((a, b) => {
    const aKey = String(a.title || '').trim();
    const bKey = String(b.title || '').trim();
    const aIsAlpha = /^[A-Za-z]/.test(aKey) ? 0 : 1;
    const bIsAlpha = /^[A-Za-z]/.test(bKey) ? 0 : 1;
    if (aIsAlpha !== bIsAlpha) return aIsAlpha - bIsAlpha;
    return aKey.toLowerCase().localeCompare(bKey.toLowerCase());
  });
  res.json({ success: true, items });
});

// Lets the library page (and any other UI) know which subjects this user
// is actually enrolled in, so it only offers those as filter options
// instead of the entire taxonomy.
app.get('/api/library/my-subjects', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  if (user.role === 'admin') return res.json({ success: true, subjects: taxonomy.SUBJECTS, isAdmin: true });
  if (user.sponsor || organizations.findByUserId(user.id)) return res.json({ success: true, subjects: taxonomy.SUBJECTS, isOrganization: true });
  res.json({ success: true, subjects: Array.from(enrolledCategoriesForUser(user)), isAdmin: false });
});

// A tutor's upload panel must show only clips they personally added. The
// public library remains subject-scoped for students and other tutors.
app.get('/api/library/mine', requireAuthApi, (req, res) => {
  const profile = tutors.findByUserId(currentUser(req).id);
  const items = profile ? reels.listAll().filter((item) => item.ownerScope === 'tutor' && item.addedBy === currentUser(req).id && item.status === 'active') : [];
  res.json({ success: true, items });
});

app.get('/api/library/shared', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const allowed = enrolledCategoriesForUser(user);
  const isOrganizationUser = Boolean(user.sponsor || organizations.findByUserId(user.id));
  const items = reels.listActive().filter((item) => item.ownerScope === 'tutor' && (isOrganizationUser || !item.category || allowed.has(item.category)));
  res.json({ success: true, items });
});

function librarySlug(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

app.get('/api/library/item/:slug', (req, res) => {
  const item = reels.listActive().find((entry) => librarySlug(entry.title) === String(req.params.slug || '').toLowerCase());
  if (!item || (item.ownerScope || 'mozart') !== 'mozart') return res.status(404).json({ success: false, error: 'Library item not found.' });
  res.json({ success: true, item });
});

app.get('/api/library/:id', requireAuthApi, (req, res) => {
  if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ success: false, error: 'Library item not found.' });
  const item = reels.findById(req.params.id);
  const user = currentUser(req);
  if (!item || item.status !== 'active' || (item.ownerScope || 'mozart') !== 'mozart') {
    return res.status(404).json({ success: false, error: 'Library item not found.' });
  }
  const organizationUser = Boolean(user.sponsor || organizations.findByUserId(user.id));
  if (user.role !== 'admin' && !organizationUser && item.category && !enrolledCategoriesForUser(user).has(item.category)) {
    return res.status(403).json({ success: false, error: 'You do not have access to this library item.' });
  }
  res.json({ success: true, item });
});

app.post('/api/library/upload', requireApprovedTutorApi, (req, res) => {
  videoUpload.single('video')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Video is too large (max 500MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a video file to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'videos') });
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
  return res.status(403).json({ success: false, error: 'Tutor uploads are shared only with matched students through chat.' });
});

app.get('/api/tutor-library/:assignmentId', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  if (req.params.assignmentId === 'mine') {
    const profile = tutors.findByUserId(user.id);
    return res.json({ success: true, items: profile ? reels.listAll().filter((item) => item.ownerScope === 'tutor' && item.addedBy === user.id && item.status === 'active') : [] });
  }
  const record = assignments.findById(req.params.assignmentId);
  const role = assignmentParticipantRole(user, record);
  if (!role) return res.status(403).json({ success: false, error: 'Not your assignment.' });
  const tutor = tutors.findById(record.tutorId);
  const items = tutor ? reels.listActive().filter((item) => item.ownerScope === 'tutor' && item.addedBy === tutor.userId && (!item.category || item.category === record.category)) : [];
  res.json({ success: true, items });
});
app.post('/api/tutor-library', requireApprovedTutorApi, (req, res) => {
  const { title, description, url, category, isFile } = req.body || {};
  if (!title || !url) return res.status(400).json({ success: false, error: 'Title and link/file are required.' });
  if (category && !(req.tutorProfile.categories || []).includes(category)) return res.status(403).json({ success: false, error: 'Choose one of your teaching subjects.' });
  const item = reels.create({ title, description, url, category: category || null, addedBy: currentUser(req).id, isFile, ownerScope: 'tutor' });
  res.json({ success: true, item });
});

app.post('/api/tutor-library/upload', hydrateUploadToken, requireApprovedTutorApi, (req, res) => {
  videoUpload.single('video')(req, res, async (err) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ success: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'Video is too large (max 500MB).' : err.message });
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a video file to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'videos') });
  });
});

app.get('/api/tutor-library/mine', requireApprovedTutorApi, (req, res) => {
  res.json({ success: true, items: reels.listAll().filter((item) => item.ownerScope === 'tutor' && item.addedBy === currentUser(req).id && item.status === 'active') });
});

app.post('/api/tutor-library/:id', requireApprovedTutorApi, (req, res) => {
  const item = reels.findById(req.params.id);
  if (!item || item.ownerScope !== 'tutor' || item.addedBy !== currentUser(req).id) return res.status(404).json({ success: false, error: 'Tutor library item not found.' });
  const { title, description, category } = req.body || {};
  if (!title || !category || !(req.tutorProfile.categories || []).includes(category)) return res.status(400).json({ success: false, error: 'Use a title and one of your teaching subjects.' });
  res.json({ success: true, item: reels.update(item.id, { title, description, category }) });
});

app.delete('/api/tutor-library/:id', requireApprovedTutorApi, (req, res) => {
  const item = reels.findById(req.params.id);
  if (!item || item.ownerScope !== 'tutor' || item.addedBy !== currentUser(req).id) return res.status(404).json({ success: false, error: 'Tutor library item not found.' });
  reels.remove(item.id);
  res.json({ success: true });
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
  // Bill this specific assignment's locked-in agreedRateUsd (set when the
  // tutor was matched - see assignTutor()), not the tutor's live public
  // profile rate, which may have since changed or simply differ from what
  // this particular student negotiated.
  const session = assignments.addSession(record.id, {
    curriculumTitle: curriculumContent ? curriculumContent.title : null,
    teacherNotes, assignmentText, reels: resolvedReels, recordingUrl, durationMinutes: billableMinutes,
    hourlyRateUsd: record.agreedRateUsd != null ? record.agreedRateUsd : req.tutorProfile.hourlyRateUsd, isFreeTrial,
  });
  tutors.incrementLessonsCompleted(req.tutorProfile.id);
  chat.send(record.id, { senderId: currentUser(req).id, senderRole: 'tutor', text: `🔔 Class ended. You spent ${session.durationMinutes} minute${session.durationMinutes === 1 ? '' : 's'} with ${record.tutorName} today.${isFreeTrial ? ' This first class is free.' : ` Lesson bill: $${session.totalUsd.toFixed(2)}.`}` });

  // Student payments must go through an explicit Stripe Checkout and student
  // confirmation flow. We intentionally do not silently charge a saved card
  // when a class is logged, because the user must choose to pay from the
  // checkout page before the lesson is released.
  const student = store.findById(record.studentId);

  const sponsoringOrganization = coveredOrganizationForAssignment(record, student);
  // A sponsor's wallet (walletBalanceUsd - "load money in, lessons draw it
  // down automatically") pays a covered lesson the instant it's logged,
  // ahead of the manual per-lesson Stripe Checkout in /api/organizations/
  // lesson-bills - that one only ever sees a bill once the wallet can't
  // cover it (or hasn't been funded at all).
  const autoDebitedOrg = !isFreeTrial && sponsoringOrganization ? organizations.debitWallet(sponsoringOrganization.id, session.totalUsd) : null;
  if (autoDebitedOrg) {
    const released = assignments.confirmSession(record.id, session.id);
    await releaseTutorEarnings(record, released.session, { payerType: 'organization', organizationId: sponsoringOrganization.id });
    store.addNotification(sponsoringOrganization.userId, {
      type: 'organization',
      message: `$${session.totalUsd.toFixed(2)} auto-paid from your wallet for ${record.studentName}'s ${record.category} lesson with ${req.tutorProfile.name}. Wallet balance: $${autoDebitedOrg.walletBalanceUsd.toFixed(2)}.`,
    });
    store.addNotification(record.studentId, {
      type: 'lesson',
      message: `${req.tutorProfile.name} completed your ${record.category} lesson. Your sponsor covered the bill.`,
    });
  } else if (!isFreeTrial && sponsoringOrganization) {
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
  if (record.lessonType === 'physical' && !record.studentSawTutor) return res.status(400).json({ success: false, error: 'The student must confirm seeing you before the lesson starts.' });
  if (record.lessonType === 'studio' && !record.tutorSawStudent) return res.status(400).json({ success: false, error: 'Confirm that the student has arrived before starting the lesson.' });
  const started = assignments.startLesson(record.id, req.tutorProfile.id);
  if (!started) return res.status(400).json({ success: false, error: 'Only active assignments can start a lesson.' });
  chat.send(record.id, { senderId: currentUser(req).id, senderRole: 'tutor', text: `🔔 ${req.tutorProfile.name} started your ${record.category} class. The lesson clock is now running.` });
  res.json({ success: true, lessonStartedAt: started.lessonStartedAt });
});

app.post('/api/assignments/:id/reach-destination', requireApprovedTutorApi, (req, res) => {
  const record = assignments.markTutorReached(req.params.id, req.tutorProfile.id);
  if (!record) return res.status(400).json({ success: false, error: 'This is not an active in-person lesson.' });
  res.json({ success: true, record });
});

app.post('/api/assignments/:id/confirm-tutor-seen', requireAuthApi, (req, res) => {
  const record = assignments.confirmStudentSawTutor(req.params.id, currentUser(req).id);
  if (!record) return res.status(400).json({ success: false, error: 'The tutor has not marked arrival yet.' });
  res.json({ success: true, record });
});

app.post('/api/assignments/:id/reach-studio', requireAuthApi, (req, res) => {
  const record = assignments.markStudentReachedStudio(req.params.id, currentUser(req).id);
  if (!record) return res.status(400).json({ success: false, error: 'This is not an active studio lesson.' });
  res.json({ success: true, record });
});

app.post('/api/assignments/:id/confirm-student-seen', requireApprovedTutorApi, (req, res) => {
  const record = assignments.confirmTutorSawStudent(req.params.id, req.tutorProfile.id);
  if (!record) return res.status(400).json({ success: false, error: 'The student has not marked arrival yet.' });
  res.json({ success: true, record });
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

  const client = stripeClient.getClient();
  const mode = stripeClient.getMode();
  if (!client || !mode) return res.status(503).json({ success: false, error: 'Payments are not configured yet.' });

  let paymentProfile;
  try {
    paymentProfile = await stripePaymentProfile.resolveProfile(user, client, mode, { createCustomer: true });
  } catch (error) {
    console.error('Could not load lesson payment customer:', error.message);
    return res.status(502).json({ success: false, error: 'Could not prepare your payment. Please try again.' });
  }

  // First payment: explicit Checkout saves/authorizes the card. Later
  // payments: charge the saved card automatically off-session.
  if (paymentProfile.paymentMethodId) {
    try {
      const paymentIntent = await client.paymentIntents.create({
        amount: Math.round(Number(pending.totalUsd || 0) * 100),
        currency: 'usd',
        customer: paymentProfile.customerId,
        payment_method: paymentProfile.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { type: 'student-lesson', assignmentId: String(record.id), sessionId: String(pending.id), studentId: String(user.id) },
      });
      const result = assignments.confirmSession(record.id, pending.id);
      if (!result) return res.status(400).json({ success: false, error: 'Session was already confirmed.' });
      await releaseTutorEarnings(record, result.session, { paymentIntentId: paymentIntent.id });
      return res.json({ success: true, paidAutomatically: true, session: result.session });
    } catch (error) {
      const code = error && error.code;
      if (code === 'resource_missing') store.clearStripePaymentMethod(user.id, mode);
      const messageByCode = {
        resource_missing: 'Your saved card is no longer available. Please add or change your card and try again.',
        card_declined: 'Your saved card was declined. Please use another card or contact your bank.',
        insufficient_funds: 'Your saved card has insufficient funds for this lesson payment.',
        expired_card: 'Your saved card has expired. Please update it before trying again.',
        incorrect_cvc: 'Your card security code could not be verified. Please update the saved card.',
        authentication_required: 'Your bank needs an extra security check before this card can be charged.',
      };
      return res.status(402).json({
        success: false,
        error: messageByCode[code] || (error && error.message) || 'The saved card could not be charged.',
        code: code || 'payment_failed',
      });
    }
  }

  try {
    // Use a Stripe Customer for Checkout as well.  `setup_future_usage`
    // tells Stripe to retain the card for the later, student-approved
    // off-session lesson payments above; no card details ever enter our DB.
    const checkout = await client.checkout.sessions.create({
      managed_payments: { enabled: false }, mode: 'payment',
      line_items: [{ price_data: { currency: 'usd', product_data: { name: `${record.category} lesson` }, unit_amount: Math.round(Number(pending.totalUsd || 0) * 100) }, quantity: 1 }],
      customer: paymentProfile.customerId,
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: { type: 'student-lesson', assignmentId: String(record.id), sessionId: String(pending.id), studentId: String(user.id) },
      },
      success_url: `${publicAppUrl(req)}/api/assignments/${record.id}/sessions/${pending.id}/checkout-success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicAppUrl(req)}/messages/chat?name=${encodeURIComponent(record.tutorName || '')}&payment=cancel`,
      metadata: { type: 'student-lesson', assignmentId: String(record.id), sessionId: String(pending.id), studentId: String(user.id) },
    });
    return res.json({ success: true, checkoutUrl: checkout.url, redirectToCheckout: true });
  } catch (error) {
    return res.status(502).json({ success: false, error: error.message || 'Stripe Checkout could not be opened.' });
  }
});

app.post('/api/assignments/:id/sessions/:sessionId/cancel', requireApprovedTutorApi, (req, res) => {
  const session = assignments.cancelSession(req.params.id, req.params.sessionId, req.tutorProfile.id);
  if (!session) return res.status(400).json({ success: false, error: 'Only a pending held bill can be cancelled.' });
  res.json({ success: true, session });
});

app.get('/api/assignments/:id/sessions/:sessionId/checkout-success', async (req, res) => {
  const client = stripeClient.getClient();
  const session = client && req.query.sessionId ? await client.checkout.sessions.retrieve(req.query.sessionId) : null;
  const record = assignments.findById(req.params.id);
  const lesson = record && (record.sessions || []).find((item) => item.id === Number(req.params.sessionId));
  if (!session || session.payment_status !== 'paid' || !record || !lesson || lesson.paymentStatus !== 'held' || session.metadata.studentId !== String(record.studentId)) {
    return res.redirect(record ? `/messages/chat?name=${encodeURIComponent(record.tutorName || '')}&payment=error` : '/messages?payment=error');
  }
  // Checkout can save the card for future student-approved automatic
  // payments. Store only Stripe IDs and masked display information.
  try {
    const paymentIntent = session.payment_intent ? await client.paymentIntents.retrieve(session.payment_intent) : null;
    const paymentMethod = paymentIntent && paymentIntent.payment_method ? await client.paymentMethods.retrieve(paymentIntent.payment_method) : null;
    if (paymentMethod && paymentMethod.id) {
      store.setStripePaymentMethod(record.studentId, {
        mode: stripeClient.getMode(), customerId: session.customer,
        paymentMethodId: paymentMethod.id,
        brand: paymentMethod.card ? paymentMethod.card.brand : null,
        last4: paymentMethod.card ? paymentMethod.card.last4 : null,
      });
    }
  } catch (error) {
    console.warn('Checkout payment succeeded but its reusable card could not be saved:', error.message);
  }
  const result = assignments.confirmSession(record.id, lesson.id);
  if (result) await releaseTutorEarnings(record, result.session, { paymentIntentId: session.payment_intent });
  res.redirect(`/messages/chat?name=${encodeURIComponent(record.tutorName || '')}&payment=${result ? 'success' : 'error'}`);
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

app.get('/api/calendar/connect', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  if (!tutors.findByUserId(user.id) && !organizations.findByUserId(user.id)) return res.status(403).json({ success: false, error: 'Tutor or organization access required.' });
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

// A tutor ending their own side of an assignment - same effect as the
// existing admin-only end route (data/assignments.js's endAssignment), just
// scoped to the tutor who owns the record instead of requiring an admin.
app.post('/api/assignments/:id/end', requireApprovedTutorApi, (req, res) => {
  const record = assignments.findById(req.params.id);
  if (!record || record.tutorId !== req.tutorProfile.id) {
    return res.status(404).json({ success: false, error: 'Assignment not found.' });
  }
  if (record.status !== 'active') {
    return res.status(400).json({ success: false, error: 'Only an active assignment can be ended.' });
  }
  const updated = assignments.endAssignment(record.id);
  store.addNotification(record.studentId, { type: 'tutor', message: `${req.tutorProfile.name} ended your ${record.category} lessons.` });
  res.json({ success: true, request: updated });
});

app.get('/api/organizations/events', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const events = Array.isArray(org.events) ? [...org.events].sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0)) : [];
  res.json({ success: true, events });
});

app.post('/api/organizations/events/:id/link', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  const meetLink = String(req.body && req.body.meetLink || '').trim();
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  if (meetLink && !/^https?:\/\//i.test(meetLink)) return res.status(400).json({ success: false, error: 'Meeting link must start with http:// or https://.' });
  const updated = organizations.updateEvent(org.id, req.params.id, meetLink);
  if (!updated) return res.status(404).json({ success: false, error: 'Meeting not found.' });
  res.json({ success: true, event: updated });
});

app.get('/api/organizations/performance', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const studentIds = new Set(organizations.getStudentsForOrganization(org.id).map((member) => Number(member.studentId)));
  const records = assignments.listAll().filter((record) => studentIds.has(Number(record.studentId)));
  const completedLessons = records.reduce((total, record) => total + (record.sessions || []).filter((session) => session.status === 'completed' || session.paymentStatus === 'released').length, 0);
  res.json({ success: true, activeLessons: records.filter((record) => record.status === 'active').length, completedLessons, memberCount: studentIds.size });
});

app.get('/api/organizations/notifications', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const activity = [
    ...(user.notifications || []).map((item) => ({ message: item.message, createdAt: item.createdAt, type: item.type })),
    ...orgContent.listForOrg(org.id).map((item) => ({ message: `${item.createdByName} posted ${item.type}: ${item.title}`, createdAt: item.createdAt, type: item.type })),
    ...(org.events || []).map((item) => ({ message: `Event scheduled: ${item.title}`, createdAt: item.createdAt || item.scheduledAt, type: 'event' })),
    ...(org.members || []).map((item) => ({ message: `${item.studentName || 'A student'} joined the organization`, createdAt: item.redeemedAt, type: 'member' })),
    ...orgChat.listForOrganization(org.id).map((item) => ({ message: `Conversation updated: ${item.title}`, createdAt: item.createdAt, type: 'message' })),
  ].filter((item) => item.message).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ success: true, notifications: activity });
});

app.post('/api/organizations/classrooms', requireAuthApi, (req, res) => {
  const org = organizations.findByUserId(currentUser(req).id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  const name = String(req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ success: false, error: 'Classroom name is required.' });
  const classroom = organizations.addClassroom(org.id, { name });
  res.json({ success: true, classroom });
});

app.post('/api/organizations/events', requireAuthApi, async (req, res) => {
  const user = currentUser(req);
  const org = organizations.findByUserId(user.id);
  if (!org || org.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved organization access required.' });
  // Not every event is a video call to join - a flyer for a recital, a gig
  // announcement, general event awareness - meetLink stays optional and
  // description/flyerUrl cover the rest, same "real workflow" event record
  // either way (one org.events array, not a separate concept per kind).
  const { title, startISO, durationMinutes, attendeeEmails, meetLink, description, flyerUrl } = req.body || {};
  if (!title || !startISO || Number.isNaN(Date.parse(startISO))) return res.status(400).json({ success: false, error: 'Event title and valid date/time are required.' });
  try {
    const attendees = Array.isArray(attendeeEmails) ? attendeeEmails : [];
    let calendarDetails = {};
    if (user.googleCalendar && user.googleCalendar.refreshToken) {
      const event = await googleCalendar.createLessonEvent({ refreshToken: user.googleCalendar.refreshToken, summary: title.trim(), description: `Mozart Techniques organization meeting for ${org.name}.`, startISO, durationMinutes: Number(durationMinutes) || 60, attendeeEmails: [...new Set([user.email, ...attendees].filter(Boolean))] });
      calendarDetails = { meetLink: event.meetLink, calendarEventId: event.eventId };
    }
    const saved = organizations.addEvent(org.id, {
      title: title.trim(),
      scheduledAt: new Date(startISO).toISOString(),
      durationMinutes: Number(durationMinutes) || 60,
      attendeeEmails: attendees,
      meetLink: meetLink && String(meetLink).trim() || null,
      description: description ? String(description).trim() : null,
      flyerUrl: flyerUrl || null,
      ...calendarDetails,
    });
    const recipients = new Set(organizations.getStudentsForOrganization(org.id).map((member) => Number(member.studentId)));
    assignments.listAll().forEach((record) => {
      if (!recipients.has(Number(record.studentId)) || !record.tutorId) return;
      const tutor = tutors.findById(record.tutorId);
      if (tutor) recipients.add(Number(tutor.userId));
    });
    recipients.forEach((userId) => store.addNotification(userId, { type: 'event', message: `${org.name || org.contactName} scheduled an event: ${title.trim()}.`, href: '/ngo-dashboard#classroom' }));
    res.json({ success: true, event: saved });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
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

// Fetches a shared link's page metadata (title/description/image) so chat
// can render a rich preview card, the way WhatsApp/iMessage do, instead of
// just underlined link text. Deliberately tolerant: any failure (bad url,
// timeout, non-HTML response) resolves as success:true, preview:null
// rather than an error - the client just shows the plain link text then,
// same as if this endpoint didn't exist.
const LINK_PREVIEW_CACHE = new Map(); // url -> { data, expiresAt }
const LINK_PREVIEW_CACHE_TTL_MS = 60 * 60 * 1000;
const LINK_PREVIEW_TIMEOUT_MS = 5000;
const LINK_PREVIEW_MAX_BYTES = 200000; // the <head> metadata is always near the top - no need to read a whole large page

function extractMetaTag(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match) return match[1];
  }
  return null;
}

app.get('/api/link-preview', requireAuthApi, async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ success: false, error: 'Missing url.' });
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.json({ success: true, preview: null });
  }
  if (!['http:', 'https:'].includes(target.protocol)) return res.json({ success: true, preview: null });
  // This fetches an arbitrary URL a user typed into chat - block the
  // obvious loopback/private-network targets so the endpoint can't be used
  // to probe this server's own internal network.
  const hostname = target.hostname.toLowerCase();
  if (
    hostname === 'localhost' || hostname === '0.0.0.0' || hostname.endsWith('.local')
    || /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    return res.json({ success: true, preview: null });
  }

  const cached = LINK_PREVIEW_CACHE.get(target.href);
  if (cached && cached.expiresAt > Date.now()) return res.json({ success: true, preview: cached.data });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(target.href, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MozartTechniquesBot/1.0; +https://mozarttechniques.com)' },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) {
      return res.json({ success: true, preview: null });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let bytesRead = 0;
    while (bytesRead < LINK_PREVIEW_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.length;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    try { reader.cancel(); } catch {}

    const title = extractMetaTag(html, 'og:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || null;
    const description = extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description');
    let image = extractMetaTag(html, 'og:image');
    if (image && !/^https?:\/\//i.test(image)) {
      try { image = new URL(image, target.href).href; } catch { image = null; }
    }

    const data = {
      url: target.href,
      title: title ? title.trim().slice(0, 200) : null,
      description: description ? description.trim().slice(0, 300) : null,
      image: image || null,
      siteName: extractMetaTag(html, 'og:site_name') || target.hostname,
    };
    if (!data.title && !data.description && !data.image) {
      return res.json({ success: true, preview: null });
    }
    LINK_PREVIEW_CACHE.set(target.href, { data, expiresAt: Date.now() + LINK_PREVIEW_CACHE_TTL_MS });
    res.json({ success: true, preview: data });
  } catch {
    res.json({ success: true, preview: null });
  }
});

// Uploads a chat attachment and returns its URL - the caller then sends a
// normal message referencing it, so an abandoned upload never becomes a
// half-sent message in the thread.
app.post('/api/chat/upload', hydrateUploadToken, requireAuthApi, (req, res) => {
  chatUpload.single('file')(req, res, async (err) => {
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
        url: await resolveUploadedFileUrl(req.file, 'chat'),
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

  const otherPartyUserId = role === 'student' ? (tutors.findById(record.tutorId) || {}).userId : record.studentId;
  if (otherPartyUserId && store.isBlockedPair(user.id, otherPartyUserId)) {
    return res.status(403).json({ success: false, error: "You can't message this person." });
  }

  const { text, libraryItemId, attachment, replyToId, poll, location } = req.body || {};
  if ((!text || !text.trim()) && !libraryItemId && !attachment && !poll && !location) {
    return res.status(400).json({ success: false, error: 'Message text, a file, a tagged clip, a poll, or a location is required.' });
  }
  if (containsContactInfo(text) || (poll && (containsContactInfo(poll.question) || (poll.options || []).some(containsContactInfo)))) {
    return res.status(400).json({ success: false, error: "Sharing an email address or phone number in chat isn't allowed - keep lesson coordination and payment on Mozart Techniques." });
  }
  // Only accept an attachment that points at our own upload directory -
  // otherwise this field would let anyone render an arbitrary URL inside
  // someone else's thread.
  let safeAttachment = null;
  if (attachment && isOwnChatAttachmentUrl(attachment.url)) {
    safeAttachment = attachment;
  } else if (attachment) {
    return res.status(400).json({ success: false, error: 'Attach files through the upload endpoint.' });
  }
  if (location && record.lessonType === 'online') {
    return res.status(400).json({ success: false, error: 'Location sharing is only available for in-person lessons.' });
  }
  const { poll: safePoll, error: pollError } = validatePollInput(poll);
  if (pollError) return res.status(400).json({ success: false, error: pollError });
  const { location: safeLocation, error: locationError } = validateLocationInput(location);
  if (locationError) return res.status(400).json({ success: false, error: locationError });
  let replyTo = null;
  if (replyToId) {
    replyTo = chat.findById(replyToId);
    if (!replyTo || replyTo.assignmentId !== record.id) return res.status(400).json({ success: false, error: 'That message no longer exists.' });
  }

  const candidateLibraryItem = libraryItemId ? reels.findById(libraryItemId) : null;
  if (candidateLibraryItem && candidateLibraryItem.category && candidateLibraryItem.category !== record.category) {
    return res.status(403).json({ success: false, error: 'That library clip is not available for this course.' });
  }
  if (candidateLibraryItem && candidateLibraryItem.ownerScope === 'tutor' && (role !== 'tutor' || candidateLibraryItem.addedBy !== user.id)) {
    return res.status(403).json({ success: false, error: 'That tutor library clip is not available for this course.' });
  }
  if (candidateLibraryItem && (candidateLibraryItem.ownerScope || 'mozart') === 'mozart' && role !== 'tutor') {
    return res.status(403).json({ success: false, error: 'Only tutors can share Mozart library clips in this chat.' });
  }
  const libraryItem = candidateLibraryItem;
  if (libraryItem) {
    libraryItem.href = `/library?item=${encodeURIComponent(String(libraryItem.title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}`;
  }
  const message = chat.send(record.id, {
    senderId: user.id, senderRole: role, text: (text || '').trim(), libraryItem, attachment: safeAttachment,
    replyToId: replyTo ? replyTo.id : null, poll: safePoll, location: safeLocation,
  });

  const recipientId = role === 'student' ? tutors.findById(record.tutorId).userId : record.studentId;
  store.addNotification(recipientId, { type: 'chat', message: `New message from ${user.name} about your ${record.category} lesson.`, href: `/messages/chat?name=${encodeURIComponent(user.name)}` });

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

// Edit/delete/pin all share the same access check: the requester must be a
// participant (student or tutor) in the assignment thread the message
// belongs to, resolved the same way as the message list/send routes above.
function loadOwnMessage(req, res) {
  const user = currentUser(req);
  const record = assignments.findById(req.params.id);
  const role = assignmentParticipantRole(user, record);
  if (!role) { res.status(403).json({ success: false, error: 'Not your assignment.' }); return null; }
  const message = chat.findById(req.params.messageId);
  if (!message || message.assignmentId !== record.id) { res.status(404).json({ success: false, error: 'Message not found.' }); return null; }
  return { user, record, role, message };
}

// Shared editing/delete-for-everyone time windows, used by both the
// assignment chat and every org-chat surface so the rule reads the same
// everywhere: edits are allowed for 30 minutes after sending; deleting for
// everyone (not just for yourself) is allowed for 10 minutes, and only
// before the recipient has actually seen it - whichever comes first.
const EDIT_WINDOW_MS = 30 * 60 * 1000;
const DELETE_EVERYONE_WINDOW_MS = 10 * 60 * 1000;
function messageAgeMs(message) { return Date.now() - new Date(message.createdAt).getTime(); }

app.put('/api/assignments/:id/messages/:messageId', requireAuthApi, (req, res) => {
  const ctx = loadOwnMessage(req, res);
  if (!ctx) return;
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'Message text is required.' });
  if (ctx.message.senderId !== ctx.user.id) return res.status(403).json({ success: false, error: 'You can only edit your own messages.' });
  if (messageAgeMs(ctx.message) > EDIT_WINDOW_MS) {
    return res.status(409).json({ success: false, error: 'This message is more than 30 minutes old and can no longer be edited.' });
  }
  const updated = chat.editMessage(ctx.message.id, ctx.user.id, text);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  realtime.broadcast(ctx.record.id, { type: 'message_edited', assignmentId: ctx.record.id, message: updated });
  res.json({ success: true, message: updated });
});

// "Delete for everyone" only works within 10 minutes of sending, and only
// before the other party has seen the thread since this message arrived -
// readByStudent/readByTutor are per-message flags only ever bulk-flipped by
// chat.markRead() on a thread fetch, so the recipient's own flag on this
// exact row is a reliable "have they polled since this landed" signal
// without needing a new field.
function recipientHasSeenMessage(message) {
  const recipientField = message.senderRole === 'student' ? 'readByTutor' : 'readByStudent';
  return Boolean(message[recipientField]);
}

app.delete('/api/assignments/:id/messages/:messageId', requireAuthApi, (req, res) => {
  const ctx = loadOwnMessage(req, res);
  if (!ctx) return;
  if (ctx.message.senderId !== ctx.user.id) return res.status(403).json({ success: false, error: 'You can only delete your own messages.' });
  if (messageAgeMs(ctx.message) > DELETE_EVERYONE_WINDOW_MS) {
    return res.status(409).json({ success: false, error: 'This message is more than 10 minutes old and can only be deleted for you.' });
  }
  if (recipientHasSeenMessage(ctx.message)) {
    return res.status(409).json({ success: false, error: 'This message has already been seen and can only be deleted for you.' });
  }
  const updated = chat.deleteMessage(ctx.message.id, ctx.user.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  realtime.broadcast(ctx.record.id, { type: 'message_deleted', assignmentId: ctx.record.id, messageId: updated.id });
  res.json({ success: true, message: updated });
});

app.post('/api/assignments/:id/messages/:messageId/delete-for-me', requireAuthApi, (req, res) => {
  const ctx = loadOwnMessage(req, res);
  if (!ctx) return;
  const updated = chat.deleteForMe(ctx.message.id, ctx.user.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  res.json({ success: true, message: updated });
});

app.post('/api/assignments/:id/messages/:messageId/react', requireAuthApi, (req, res) => {
  const ctx = loadOwnMessage(req, res);
  if (!ctx) return;
  const emoji = String((req.body && req.body.emoji) || '');
  if (!isValidReaction(emoji)) return res.status(400).json({ success: false, error: 'Not a supported reaction.' });
  const updated = chat.addReaction(ctx.message.id, ctx.user.id, ctx.role, emoji);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  realtime.broadcast(ctx.record.id, { type: 'message_reacted', assignmentId: ctx.record.id, message: updated });
  // Only notify the other party, and only when they actually added a
  // reaction (not when they removed their own) - a toggle-off shouldn't
  // ping anyone.
  const justReacted = (updated.reactions || []).some((r) => r.userId === ctx.user.id && r.emoji === emoji);
  if (justReacted && ctx.message.senderId !== ctx.user.id) {
    store.addNotification(ctx.message.senderId, { type: 'chat', message: `${ctx.user.name} reacted ${emoji} to your message.`, href: `/messages/chat?name=${encodeURIComponent(ctx.user.name)}` });
  }
  res.json({ success: true, message: updated });
});

app.post('/api/assignments/:id/messages/:messageId/poll-vote', requireAuthApi, (req, res) => {
  const ctx = loadOwnMessage(req, res);
  if (!ctx) return;
  if (!ctx.message.poll) return res.status(400).json({ success: false, error: 'This message is not a poll.' });
  const optionId = Number(req.body && req.body.optionId);
  if (!ctx.message.poll.options.some((o) => o.id === optionId)) return res.status(400).json({ success: false, error: 'Not a valid poll option.' });
  const updated = chat.votePoll(ctx.message.id, ctx.user.id, optionId);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  realtime.broadcast(ctx.record.id, { type: 'message_poll_vote', assignmentId: ctx.record.id, message: updated });
  res.json({ success: true, message: updated });
});

app.post('/api/assignments/:id/messages/:messageId/pin', requireAuthApi, (req, res) => {
  const ctx = loadOwnMessage(req, res);
  if (!ctx) return;
  const updated = chat.togglePin(ctx.message.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Message not found.' });
  realtime.broadcast(ctx.record.id, { type: 'message_pinned', assignmentId: ctx.record.id, messageId: updated.id, pinned: updated.pinned });
  res.json({ success: true, message: updated });
});

// --- Thread preferences (favorite/archive/pin/mute/mark-unread/clear/delete/block) ---
// One small family of routes shared by both thread types (a direct
// assignment thread and a tutor-group chat) - resolves participancy the
// same way each type's own routes already do, then delegates to store.js's
// per-user preference toggles. Thread keys are `assignment:<id>` /
// `group:<id>`, matching what /api/conversations and /api/group-chats key
// their rows by below.
function resolveThreadContext(req, res) {
  const user = currentUser(req);
  const type = req.params.type;
  const id = Number(req.params.id);
  if (type === 'assignment') {
    const record = assignments.findById(id);
    const role = assignmentParticipantRole(user, record);
    if (!role) { res.status(403).json({ success: false, error: 'Not your thread.' }); return null; }
    const otherPartyUserId = role === 'student' ? (tutors.findById(record.tutorId) || {}).userId : record.studentId;
    return { user, type, id, role, threadKey: `assignment:${id}`, otherPartyUserId };
  }
  if (type === 'group') {
    const access = tutorGroupAccess(user, id);
    if (!access) { res.status(403).json({ success: false, error: 'Not your thread.' }); return null; }
    return { user, type, id, role: access.role, threadKey: `group:${id}`, otherPartyUserId: null };
  }
  if (type === 'org') {
    const access = resolveOrgChatAccess(user, id);
    if (!access) { res.status(403).json({ success: false, error: 'Not your thread.' }); return null; }
    return { user, type, id, role: access.role, threadKey: `org:${id}`, otherPartyUserId: null };
  }
  res.status(400).json({ success: false, error: 'Unknown thread type.' });
  return null;
}

app.post('/api/threads/:type/:id/favorite', requireAuthApi, (req, res) => {
  const ctx = resolveThreadContext(req, res);
  if (!ctx) return;
  res.json({ success: true, favorite: store.toggleFavoriteThread(ctx.user.id, ctx.threadKey) });
});

app.post('/api/threads/:type/:id/archive', requireAuthApi, (req, res) => {
  const ctx = resolveThreadContext(req, res);
  if (!ctx) return;
  res.json({ success: true, archived: store.toggleArchivedThread(ctx.user.id, ctx.threadKey) });
});

app.post('/api/threads/:type/:id/pin', requireAuthApi, (req, res) => {
  const ctx = resolveThreadContext(req, res);
  if (!ctx) return;
  res.json({ success: true, pinned: store.togglePinnedThread(ctx.user.id, ctx.threadKey) });
});

app.post('/api/threads/:type/:id/mute', requireAuthApi, (req, res) => {
  const ctx = resolveThreadContext(req, res);
  if (!ctx) return;
  const duration = req.body && req.body.duration;
  if (duration && !['8h', '1w', 'always'].includes(duration)) return res.status(400).json({ success: false, error: 'Not a valid mute duration.' });
  res.json({ success: true, muted: store.setMutedThread(ctx.user.id, ctx.threadKey, duration || null) });
});

app.post('/api/threads/:type/:id/mark-unread', requireAuthApi, (req, res) => {
  const ctx = resolveThreadContext(req, res);
  if (!ctx) return;
  if (ctx.type === 'assignment') chat.markUnread(ctx.id, ctx.role);
  else orgChat.markUnread(ctx.id, ctx.role);
  res.json({ success: true });
});

app.post('/api/threads/:type/:id/clear', requireAuthApi, (req, res) => {
  const ctx = resolveThreadContext(req, res);
  if (!ctx) return;
  if (ctx.type === 'assignment') chat.clearForUser(ctx.id, ctx.user.id);
  else orgChat.clearForUser(ctx.id, ctx.user.id);
  res.json({ success: true });
});

app.post('/api/threads/:type/:id/delete', requireAuthApi, (req, res) => {
  const ctx = resolveThreadContext(req, res);
  if (!ctx) return;
  if (ctx.type === 'assignment') chat.clearForUser(ctx.id, ctx.user.id);
  else orgChat.clearForUser(ctx.id, ctx.user.id);
  store.hideThread(ctx.user.id, ctx.threadKey);
  res.json({ success: true });
});

app.post('/api/threads/:type/:id/block', requireAuthApi, (req, res) => {
  const ctx = resolveThreadContext(req, res);
  if (!ctx) return;
  if (ctx.type !== 'assignment' || !ctx.otherPartyUserId) return res.status(400).json({ success: false, error: 'Blocking only applies to a direct chat.' });
  res.json({ success: true, blocked: store.toggleBlockedUser(ctx.user.id, ctx.otherPartyUserId) });
});

// Marks every direct + group + org-chat thread this user is part of as read
// in one call, backing "Mark all as read" in the messages-list "..." menu
// (and the same menu on the Org Tutor dashboard's Messages panel).
app.post('/api/threads/mark-all-read', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const tutorProfile = tutors.findByUserId(user.id);
  const org = organizations.findByUserId(user.id);
  assignments.listAll().forEach((record) => {
    const role = record.studentId === user.id ? 'student' : (tutorProfile && record.tutorId === tutorProfile.id ? 'tutor' : null);
    if (role) chat.markRead(record.id, role);
  });
  // Any org-chat conversation this account has a role in - org owner,
  // tutor participant (course groups + org-created groups + the tutor's own
  // channel with the org), or student participant - not just tutor-group,
  // which used to leave every other org-chat type permanently unread.
  orgChat.listAll().forEach((conv) => {
    let role = null;
    if (org && org.id === conv.orgId) role = 'org';
    else if (tutorProfile && conv.participants.some((p) => p.type === 'tutor' && Number(p.id) === tutorProfile.id)) role = 'tutor';
    else if (conv.participants.some((p) => p.type === 'student' && Number(p.id) === user.id)) role = 'student';
    if (role) orgChat.markRead(conv.id, role);
  });
  res.json({ success: true });
});

// The reported user is resolved from threadKey server-side rather than
// trusted from the client - a direct assignment thread always has exactly
// one "other party", and resolving it here (instead of the tutor-profile-id
// vs user-id mixup a client would have to untangle) also means a client
// can't report an arbitrary, unrelated user id.
app.post('/api/reports', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const { threadKey, reason } = req.body || {};
  if (!reason || !reason.trim()) return res.status(400).json({ success: false, error: 'Tell us what happened.' });

  const assignmentMatch = String(threadKey || '').match(/^assignment:(\d+)$/);
  const orgMatch = String(threadKey || '').match(/^org:(\d+)$/);

  let reportedUserId = null;
  if (assignmentMatch) {
    const record = assignments.findById(assignmentMatch[1]);
    const role = assignmentParticipantRole(user, record);
    if (!role) return res.status(403).json({ success: false, error: 'Not your thread.' });
    reportedUserId = role === 'student' ? (tutors.findById(record.tutorId) || {}).userId : record.studentId;
  } else if (orgMatch) {
    // Reports from an org-chat thread (Organization Dashboard, Org Tutor,
    // Org Student messages) - a real, common source of reports that only
    // ever matched the assignment-chat pattern above before, so every
    // org-chat report silently 400'd and never reached this table (never
    // showed up for admin at all). Group threads have no single "other
    // party" to report, so those still aren't supported here.
    const myAccess = resolveOrgChatAccess(user, orgMatch[1]);
    if (!myAccess) return res.status(403).json({ success: false, error: 'Not your thread.' });
    const conversation = myAccess.conversation;
    if (conversation.type === 'group' || conversation.type === 'tutor-group') {
      return res.status(400).json({ success: false, error: 'Reporting is only available in a direct chat.' });
    }
    if (myAccess.role === 'org') {
      const participant = conversation.participants[0];
      reportedUserId = participant
        ? (participant.type === 'tutor' ? (tutors.findById(participant.id) || {}).userId : Number(participant.id))
        : null;
    } else {
      const org = organizations.findById(conversation.orgId);
      reportedUserId = org ? org.userId : null;
    }
  } else {
    return res.status(400).json({ success: false, error: 'Reporting is only available in a direct chat.' });
  }

  if (!reportedUserId) return res.status(400).json({ success: false, error: 'Could not resolve who to report.' });
  const report = reports.create({ reporterId: user.id, reportedUserId, threadKey, reason });
  const reportedUser = store.findById(reportedUserId);
  notifyAdmins({
    type: 'user-report',
    subject: 'New user report',
    message: `${user.name} reported ${reportedUser ? reportedUser.name : 'a user'}: "${report.reason}"`,
  });
  res.json({ success: true, report });
});

// --- Classroom mini-games ---
// Any signed-in student can play; if they're linked to an organization the
// session is also tagged with that org's id so it shows up on the org's
// leaderboard. Playing never requires an org link - it's a standalone
// feature that happens to roll up into a classroom view when one exists.
const GAME_TIERS = ['beginner', 'intermediate', 'advanced'];
app.post('/api/games/note-recognition/session', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const { tier, score, correctCount, totalCount } = req.body || {};
  if (!GAME_TIERS.includes(tier)) return res.status(400).json({ success: false, error: 'Not a valid tier.' });
  if (!Number.isFinite(score) || !Number.isFinite(correctCount) || !Number.isFinite(totalCount)) {
    return res.status(400).json({ success: false, error: 'Missing score data.' });
  }
  const org = resolveOrgForUser(user);
  const session = games.recordSession({
    orgId: org ? org.id : null,
    studentUserId: user.id,
    studentName: user.name,
    gameType: 'note-recognition',
    tier,
    score: Math.max(0, Math.round(score)),
    correctCount: Math.max(0, Math.round(correctCount)),
    totalCount: Math.max(0, Math.round(totalCount)),
  });
  res.json({ success: true, session });
});

app.get('/api/games/note-recognition/my-history', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  res.json({ success: true, sessions: games.listForStudent(user.id).slice(0, 20) });
});

// One row per student, their single best score - the org-wide leaderboard
// Org Student mode's Games tab shows, scoped to whichever org the caller
// (owner or a member) belongs to.
app.get('/api/games/note-recognition/leaderboard', requireAuthApi, (req, res) => {
  const org = resolveOrgForUser(currentUser(req));
  if (!org) return res.status(404).json({ success: false, error: 'You are not linked to an organization yet.' });
  const bestByStudent = new Map();
  games.listForOrg(org.id).forEach((session) => {
    const existing = bestByStudent.get(session.studentUserId);
    if (!existing || session.score > existing.score) bestByStudent.set(session.studentUserId, session);
  });
  const leaderboard = Array.from(bestByStudent.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((s) => ({ studentUserId: s.studentUserId, studentName: s.studentName, score: s.score, tier: s.tier, playedAt: s.playedAt }));
  res.json({ success: true, leaderboard });
});

// Org owner or a tutor linked to that org can view the classroom leaderboard.
app.get('/api/organizations/:orgId/games/leaderboard', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const org = organizations.findById(Number(req.params.orgId));
  if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });
  const isOwner = org.userId === user.id;
  const isLinkedTutor = organizationMembershipsForUser(user).some((membership) => membership.id === org.id);
  if (!isOwner && !isLinkedTutor) return res.status(403).json({ success: false, error: 'Not your organization.' });
  const sessions = games.listForOrg(org.id);
  const byStudent = new Map();
  sessions.forEach((s) => {
    const existing = byStudent.get(s.studentUserId) || { studentUserId: s.studentUserId, studentName: s.studentName, bestScore: 0, roundsPlayed: 0 };
    existing.bestScore = Math.max(existing.bestScore, s.score);
    existing.roundsPlayed += 1;
    byStudent.set(s.studentUserId, existing);
  });
  const leaderboard = [...byStudent.values()].sort((a, b) => b.bestScore - a.bestScore);
  res.json({ success: true, leaderboard, recentSessions: sessions.slice(0, 25) });
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
  const prefs = store.getThreadPrefs(user.id);

  const conversations = assignments.listAll()
    .map((record) => {
      const role = record.studentId === user.id
        ? 'student'
        : (tutorProfile && record.tutorId === tutorProfile.id ? 'tutor' : null);
      if (!role || !record.tutorId) return null;

      // The other person, from this user's point of view.
      let name;
      let photoUrl = null;
      let otherPartyUserId = null;
      if (role === 'student') {
        const theirTutor = tutors.findById(record.tutorId);
        name = record.tutorName;
        photoUrl = theirTutor ? theirTutor.photoUrl || null : null;
        otherPartyUserId = theirTutor ? theirTutor.userId : null;
      } else {
        const theirStudent = store.findById(record.studentId);
        name = record.studentName;
        photoUrl = theirStudent ? theirStudent.photoUrl || null : null;
        otherPartyUserId = record.studentId;
      }

      const messages = chat.listForAssignment(record.id);
      const last = messages[messages.length - 1] || null;
      const lastLabel = last
        ? (last.text
          || ({ image: 'Photo', video: 'Video', audio: 'Voice note' }[last.attachment && last.attachment.kind] || (last.attachment ? last.attachment.name : ''))
          || (last.libraryItem ? `Clip: ${last.libraryItem.title}` : ''))
        : '';
      const lastAt = last ? last.createdAt : (record.assignedAt || record.createdAt);

      const threadKey = `assignment:${record.id}`;
      // A thread "deleted" from the list reappears once it has activity
      // newer than when it was hidden, rather than staying gone forever.
      const hiddenAt = prefs.hiddenThreads[threadKey];
      if (hiddenAt && new Date(lastAt) <= new Date(hiddenAt)) return null;

      const muted = prefs.mutedThreads[threadKey];
      const stillMuted = muted && (muted.until === null || new Date(muted.until) > new Date());

      return {
        assignmentId: record.id,
        role,
        name,
        photoUrl,
        otherPartyUserId,
        category: record.category,
        status: record.status,
        lessonType: record.lessonType,
        lastMessage: lastLabel,
        lastAt,
        unread: chat.unreadCountForRole(record.id, role),
        favorite: prefs.favoriteThreadIds.includes(threadKey),
        archived: prefs.archivedThreadIds.includes(threadKey),
        pinned: prefs.pinnedThreadIds.includes(threadKey),
        // `muted` covers "muted forever" (mutedUntil stays null in that
        // case) as well as a timed mute - mutedUntil alone can't tell "not
        // muted" and "muted forever" apart, since both are null.
        muted: Boolean(stillMuted),
        mutedUntil: stillMuted && muted.until ? muted.until : null,
        blocked: otherPartyUserId ? prefs.blockedUserIds.includes(otherPartyUserId) : false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.pinned - a.pinned) || (new Date(b.lastAt) - new Date(a.lastAt)));

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
    if (count > 0) threads.push({ assignmentId: record.id, category: record.category, count, otherPartyName: role === 'student' ? record.tutorName : record.studentName });
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
    const message = 'Your tutor application has been approved! Set up your Stripe payout account from the Tutor Dashboard so paid classes can be paid automatically.';
    store.addNotification(updated.userId, { type: 'tutor', message });
    // The in-app notification above stays a one-line bell alert on purpose
    // (that surface has no room for more) - the email is the detailed
    // version, since that's the one the user actually asked to carry the
    // full picture: what they were approved for, the policies they're
    // agreeing to, and where to go for everything else.
    mailer.sendStatusUpdateEmail(updated, {
      subject: 'Your Mozart Techniques tutor application was approved',
      heading: "You're approved!",
      approved: true,
      message: [
        `Congratulations - you're approved to teach ${(updated.categories || []).join(', ') || 'on Mozart Techniques'}. Students can now find and book you.`,
        'Before your first lesson, set up your Stripe payout account so paid classes pay out automatically, and complete your Tutor Orientation - a short walkthrough of platform policies, safeguarding expectations, and how lessons/payouts work, which you\'ll be asked to agree to on your first visit to the Tutor Dashboard.',
        'Your dashboard has the full detail on all of this - approved subjects, payout setup, orientation, and every message tied to your account - this email is just the headline.',
      ],
      resources: [
        { title: 'Terms of Service', description: 'What you’re agreeing to as a tutor on Mozart Techniques.', href: `${mailer.APP_URL}/terms-of-service` },
        { title: 'Orientation & Policies', description: 'Platform standards, safeguarding, and how matching/payouts work.', href: `${mailer.APP_URL}/orientation` },
      ],
      ctaLabel: 'Go to Tutor Dashboard',
      ctaHref: `${mailer.APP_URL}/tutor-dashboard.html`,
    }).catch((err) => console.error('Status update email failed:', err.message));
  } else if (status === 'rejected') {
    const message = 'Your tutor application was not approved this time.';
    store.addNotification(updated.userId, { type: 'tutor', message });
    mailer.sendStatusUpdateEmail(updated, {
      subject: 'An update on your Mozart Techniques tutor application',
      heading: 'Application update',
      approved: false,
      message,
    }).catch((err) => console.error('Status update email failed:', err.message));
  }
  res.json({ success: true, tutor: updated });
});

app.get('/api/admin/organizations', requireAdminApi, (req, res) => {
  const admin = currentUser(req);
  res.json({ success: true, organizations: organizations.listAll().filter((organization) => canManageOrganization(admin, organization)) });
});

app.post('/api/admin/organizations/:id/status', requireAdminApi, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status.' });
  }
  const organization = organizations.findById(req.params.id);
  if (!organization || !canManageOrganization(currentUser(req), organization)) return res.status(403).json({ success: false, error: 'You can only review organizations in your country.' });
  const updated = organizations.setStatus(req.params.id, status, currentUser(req).id);
  if (!updated) return res.status(404).json({ success: false, error: 'Application not found.' });

  if (status === 'approved') {
    const message = 'Your organization application has been approved! Complete your annual subscription to start sponsoring students.';
    store.addNotification(updated.userId, { type: 'organization', message });
    mailer.sendStatusUpdateEmail({ ...updated, name: updated.name || updated.contactName }, {
      subject: 'Your Mozart Techniques organization application was approved',
      heading: "You're approved!",
      approved: true,
      message: [
        `Congratulations - ${updated.name || updated.contactName}'s application to sponsor students on Mozart Techniques has been approved.`,
        updated.sponsorType === 'individual'
          ? 'Your Sponsor Dashboard is ready - you can generate access codes for the students you sponsor right away.'
          : 'One step left: complete your annual subscription to unlock access codes for the students you sponsor and your organization\'s Classroom.',
        'Your dashboard has the full detail on all of this - subscription status, access codes, and every message tied to your account - this email is just the headline.',
      ],
      resources: [
        { title: 'Terms of Service', description: 'What you’re agreeing to as a sponsoring organization.', href: `${mailer.APP_URL}/terms-of-service` },
      ],
      ctaLabel: updated.sponsorType === 'individual' ? 'Go to Sponsor Dashboard' : 'Complete Your Subscription',
      ctaHref: `${mailer.APP_URL}${updated.sponsorType === 'individual' ? '/sponsor-dashboard' : '/become-sponsor'}`,
    }).catch((err) => console.error('Status update email failed:', err.message));
  } else if (status === 'rejected') {
    const message = 'Your organization application was not approved this time.';
    store.addNotification(updated.userId, { type: 'organization', message });
    mailer.sendStatusUpdateEmail({ ...updated, name: updated.name || updated.contactName }, {
      subject: 'An update on your Mozart Techniques organization application',
      heading: 'Application update',
      approved: false,
      message,
    }).catch((err) => console.error('Status update email failed:', err.message));
  }
  res.json({ success: true, organization: updated });
});

// Admin confirms the (simulated) annual subscription payment - see
// data/organizations.js for why this isn't a live payment charge.
app.post('/api/admin/organizations/:id/activate', requireAdminApi, (req, res) => {
  const months = Number(req.body && req.body.months) === 1 ? 1 : 12;
  const organization = organizations.findById(req.params.id);
  if (!organization || !canManageOrganization(currentUser(req), organization)) return res.status(403).json({ success: false, error: 'You can only manage organizations in your country.' });
  const updated = organizations.activateSubscription(req.params.id, months);
  if (!updated) return res.status(404).json({ success: false, error: 'Organization not found.' });
  store.addNotification(updated.userId, {
    type: 'organization',
    message: `Your ${months === 1 ? 'monthly' : 'yearly'} subscription is active through ${new Date(updated.subscriptionEndAt).toLocaleDateString()}. You can now generate access codes for the students you sponsor.`,
  });
  res.json({ success: true, organization: updated });
});

app.post('/api/admin/organizations/:id/monthly-amount', requireAdminApi, (req, res) => {
  const { monthlyAmount } = req.body || {};
  if (monthlyAmount == null) return res.status(400).json({ success: false, error: 'Monthly amount is required.' });
  
  const organization = organizations.findById(req.params.id);
  if (!organization || !canManageOrganization(currentUser(req), organization)) return res.status(403).json({ success: false, error: 'You can only manage organizations in your country.' });
  const updated = organizations.setMonthlyAmount(req.params.id, monthlyAmount);
  if (!updated) return res.status(404).json({ success: false, error: 'Organization not found.' });
  
  store.addNotification(updated.userId, {
    type: 'organization',
    message: `Your monthly subscription amount has been set to $${monthlyAmount} USD. Choose to pay monthly or yearly when you activate your subscription.`,
  });
  res.json({ success: true, organization: updated });
});

app.post('/api/admin/organizations/:id/code-sent', requireAdminApi, (req, res) => {
  const organization = organizations.findById(req.params.id);
  if (!organization || !canManageOrganization(currentUser(req), organization)) return res.status(403).json({ success: false, error: 'You can only manage organizations in your country.' });
  const updated = organizations.markCodeSent(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Organization not found.' });
  store.addNotification(updated.userId, {
    type: 'organization',
    message: 'Your sponsor access code has been sent to your organization after payment confirmation.',
  });
  res.json({ success: true, organization: updated });
});

app.delete('/api/admin/organizations/:id', requireAdminApi, (req, res) => {
  const organization = organizations.findById(req.params.id);
  if (!organization || !canManageOrganization(currentUser(req), organization)) return res.status(403).json({ success: false, error: 'You can only manage organizations in your country.' });
  const removed = organizations.removeById(req.params.id);
  if (!removed) return res.status(404).json({ success: false, error: 'Organization application not found.' });
  (removed.members || []).forEach((member) => store.clearSponsor(Number(member.studentId), removed.id));
  res.json({ success: true });
});

app.post('/api/admin/tutors/:id/expel', requireAdminApi, (req, res) => {
  const tutor = tutors.findById(req.params.id);
  if (!tutor || !canManageUser(currentUser(req), store.findById(tutor.userId))) return res.status(403).json({ success: false, error: 'You can only manage tutors in your country.' });
  const updated = tutors.expel(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Tutor not found.' });
  assignments.listForTutor(updated.id).filter((r) => r.status === 'active').forEach((r) => assignments.endAssignment(r.id));
  store.addNotification(updated.userId, { type: 'tutor', message: 'Your tutor account has been discontinued.' });
  res.json({ success: true, tutor: updated });
});

app.post('/api/admin/tutors/:id/clear-flag', requireAdminApi, (req, res) => {
  const tutor = tutors.findById(req.params.id);
  if (!tutor || !canManageUser(currentUser(req), store.findById(tutor.userId))) return res.status(403).json({ success: false, error: 'You can only manage tutors in your country.' });
  const updated = tutors.clearFlag(req.params.id);
  if (!updated) return res.status(404).json({ success: false, error: 'Tutor not found.' });
  res.json({ success: true, tutor: updated });
});

app.post('/api/admin/users/:id/clear-flag', requireAdminApi, (req, res) => {
  const user = store.findById(Number(req.params.id));
  if (!user || !canCountryAdminViewUser(currentUser(req), user)) return res.status(403).json({ success: false, error: 'You can only manage users in your country.' });
  const updated = store.clearStudentFlag(Number(req.params.id));
  if (!updated) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true });
});

// A single feed of every lesson logged platform-wide, newest first - lets
// admin monitor all tutor/student activity in one place rather than having
// to open each assignment individually.
app.get('/api/admin/activity', requireAdminApi, (req, res) => {
  const regionSet = resolveRegionFilter(req, currentUser(req));
  const sessions = assignments.listAll().filter((r) => !regionSet || regionSet.has(String(r.studentCountry || (store.findById(r.studentId)?.country) || '').toLowerCase())).flatMap((r) => (r.sessions || []).map((s) => ({
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
  const regionSet = resolveRegionFilter(req, currentUser(req));
  const allRecords = assignments.listAll().filter((r) => !regionSet || regionSet.has(String(r.studentCountry || (store.findById(r.studentId)?.country) || '').toLowerCase()));
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
  const admin = currentUser(req);
  const regionSet = resolveRegionFilter(req, admin);
  // A Country Admin's own reading isn't the platform's revenue/lesson
  // numbers (that stays a Main Admin view) - it's a record of their own
  // moderation work: how many tutor/organization/performer applications
  // THEY personally approved or rejected. Computed for every admin (cheap),
  // but the mobile app only leads with it for a non-primary admin.
  const myActions = {
    tutorsApproved: tutors.listAll().filter((t) => t.reviewedByUserId === admin.id && t.status === 'approved').length,
    tutorsRejected: tutors.listAll().filter((t) => t.reviewedByUserId === admin.id && t.status === 'rejected').length,
    organizationsApproved: organizations.listAll().filter((o) => o.reviewedByUserId === admin.id && o.status === 'approved').length,
    organizationsRejected: organizations.listAll().filter((o) => o.reviewedByUserId === admin.id && o.status === 'rejected').length,
    performersApproved: performers.listAll().filter((p) => p.reviewedByUserId === admin.id && p.status === 'approved').length,
    performersRejected: performers.listAll().filter((p) => p.reviewedByUserId === admin.id && p.status === 'rejected').length,
  };
  const assignmentInRegion = (assignmentId) => {
    if (!regionSet) return true;
    const record = assignments.findById(assignmentId);
    return regionSet.has(String(record && (record.studentCountry || (store.findById(record.studentId)?.country)) || '').toLowerCase());
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

  const tutorLeaderboard = tutors.listAll().filter((t) => !regionSet || regionSet.has(String(t.locality && t.locality.country || '').toLowerCase()))
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
      totalUsers: store.listUsers().filter((user) => !regionSet || regionSet.has(String((user.studentProfile && user.studentProfile.locality && user.studentProfile.locality.country) || user.country || '').toLowerCase())).length,
      activeTutors: tutors.listApproved().filter((tutor) => !regionSet || regionSet.has(String(tutor.locality && tutor.locality.country || '').toLowerCase())).length,
      lessonsLogged,
    },
    revenueByDay,
    topSubjects,
    tutorLeaderboard,
    myActions,
    isPrimaryAdmin: isPrimaryAdmin(admin),
  });
});

app.get('/api/admin/flagged', requireAdminApi, (req, res) => {
  const admin = currentUser(req);
  const flaggedTutors = tutors.listAll().filter((t) => t.flagged && !t.expelled && canManageUser(admin, store.findById(t.userId)));
  const flaggedStudents = store.listUsers().filter((u) => u.rating && u.rating.flagged && canCountryAdminViewUser(admin, u));
  res.json({
    success: true,
    tutors: flaggedTutors,
    students: flaggedStudents.map((u) => ({ id: u.id, name: u.name, email: u.email, rating: u.rating })),
  });
});

app.get('/api/admin/reports', requireAdminApi, (req, res) => {
  const admin = currentUser(req);
  const rows = reports.listAll().map((report) => {
    const reporter = store.findById(report.reporterId);
    const reported = store.findById(report.reportedUserId);
    if (!canCountryAdminViewUser(admin, reporter) || !canCountryAdminViewUser(admin, reported)) return null;
    return { ...report, reporterName: reporter ? reporter.name : null, reportedUserName: reported ? reported.name : null };
  }).filter(Boolean);
  res.json({ success: true, reports: rows });
});

app.post('/api/admin/reports/:id/resolve', requireAdminApi, (req, res) => {
  const existing = reports.listAll().find((report) => Number(report.id) === Number(req.params.id));
  if (!existing) return res.status(404).json({ success: false, error: 'Report not found.' });
  const admin = currentUser(req);
  if (!canCountryAdminViewUser(admin, store.findById(existing.reporterId)) || !canCountryAdminViewUser(admin, store.findById(existing.reportedUserId))) return res.status(403).json({ success: false, error: 'You can only manage reports from your country.' });
  const report = reports.setStatus(req.params.id, 'resolved');
  res.json({ success: true, report });
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

  // No negotiation context on an admin-initiated match - honor the
  // student's own suggestedAmountUsd if they set one, else the tutor's rate.
  const agreedRateUsd = record.suggestedAmountUsd != null ? record.suggestedAmountUsd : tutor.hourlyRateUsd;
  const updated = assignments.assignTutor(req.params.id, tutor, distKm, agreedRateUsd);
  if (!updated) return res.status(404).json({ success: false, error: 'Request not found.' });
  if (tutor.orientationBonusPending) tutors.clearOrientationBonus(tutor.id);

  store.addNotification(updated.studentId, { type: 'tutor', message: `You've been matched with ${tutor.name} for ${updated.category}. Check your email/contact details.` });
  store.addNotification(tutor.userId, { type: 'tutor', message: `You've been matched with a new student (${updated.studentName}) for ${updated.category}.` });
  res.json({ success: true, request: updated });
});

app.post('/api/admin/tutor-requests/:id/end', requireAdminApi, (req, res) => {
  const existing = assignments.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: 'Request not found.' });
  const admin = currentUser(req);
  const assignedTutor = existing.tutorId ? tutors.findById(existing.tutorId) : null;
  if (!canManageUser(admin, store.findById(existing.studentId)) || (assignedTutor && !canManageUser(admin, store.findById(assignedTutor.userId)))) return res.status(403).json({ success: false, error: 'You can only manage matches in your country.' });
  const record = assignments.endAssignment(req.params.id);
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
    questions: assessments.getQuestionsForAdmin('orientation', audience === 'tutor' ? null : audience),
  });
});

app.post('/api/admin/orientation', requireAdminApi, (req, res) => {
  const { title, notes, videoUrl, rewardType, questions, audience = 'tutor' } = req.body || {};
  if (!['tutor', 'student', 'admin', 'sponsor', 'organization', 'support_agent'].includes(audience)) return res.status(400).json({ success: false, error: 'Invalid orientation audience.' });
  const key = audience === 'tutor' ? curriculum.ORIENTATION_KEY : `orientation-${audience}`;
  const content = curriculum.setForCategory(key, { title, notes, videoUrl, rewardType });
  const saved = Array.isArray(questions) ? assessments.setQuestions('orientation', audience === 'tutor' ? null : audience, questions) : assessments.getQuestionsForAdmin('orientation', audience === 'tutor' ? null : audience);
  res.json({ success: true, content, questions: saved });
});

app.post('/api/admin/orientation/upload', hydrateUploadToken, requireAdminApi, (req, res) => {
  videoUpload.single('video')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'Video is too large (max 500MB).' : err.message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a video file to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'videos') });
  });
});

// A second, more permissive upload for orientation *posts* (not the
// one-time content above) - documents, letters, images, anything besides
// the handful of extensions chatUpload already blocks for being
// executable/markup. Kept separate from the video-only uploader above
// since a 500MB video allowance has no reason to apply to a PDF.
app.post('/api/admin/orientation/posts/upload-file', hydrateUploadToken, requireAdminApi, (req, res) => {
  chatUpload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 50MB).' : err.message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a file to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'chat'), name: req.file.originalname });
  });
});

app.get('/api/orientation', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const audience = resolveOrientationAudience(user);
  const key = audience === 'tutor' ? curriculum.ORIENTATION_KEY : `orientation-${audience}`;
  res.json({ success: true, audience, content: curriculum.getForCategory(key), questions: assessments.getQuestionsForTaker('orientation', audience === 'tutor' ? null : audience) });
});

// The dated, reactable orientation "updates" feed - separate from the
// single onboarding content/quiz above, which stays a one-time thing.
// Audience is resolved the same server-side way as /api/orientation.
// Normalizes reactions/comments to always be arrays (older posts predate
// one or both fields) and tags the caller's own reaction/progress - shared
// by every route below that returns post(s) to a specific viewer, so the
// client always knows whether THIS user has already finished/passed a
// post without a separate round trip per post.
function withViewerState(post, userId) {
  const hasQuiz = orientationPostQuestions(post.id).length > 0;
  const progress = orientationProgress.getProgress(userId, post.id);
  return {
    ...post,
    reactions: post.reactions || [],
    comments: post.comments || [],
    myReaction: (post.reactions || []).find((r) => r.userId === userId)?.emoji || null,
    hasQuiz,
    finished: Boolean(progress && progress.finishedAt),
    passed: Boolean(progress && progress.passed),
    attempts: (progress && progress.attempts) || 0,
    done: orientationProgress.isPostDone(userId, post, hasQuiz),
  };
}

app.get('/api/orientation/posts', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const audience = resolveOrientationAudience(user);
  const posts = orientation.list(audience).map((post) => withViewerState(post, user.id));
  res.json({ success: true, audience, posts });
});

app.post('/api/orientation/posts/:id/react', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const emoji = String((req.body && req.body.emoji) || '');
  if (!isValidReaction(emoji)) return res.status(400).json({ success: false, error: 'Not a supported reaction.' });
  const post = orientation.addReaction(req.params.id, user.id, emoji);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  res.json({ success: true, post: withViewerState(post, user.id) });
});

// Anyone who can see the post (i.e. it's their resolved audience, or
// they're an admin) can comment on it - matches the reaction route's own
// access model, just requireAuthApi rather than gating by audience match,
// since a comment referencing a post id the caller can't otherwise see
// leaks nothing back to them beyond the post they already named.
app.post('/api/orientation/posts/:id/comment', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'Write a comment first.' });
  if (text.length > 1000) return res.status(400).json({ success: false, error: 'Comment is too long.' });
  const post = orientation.addComment(req.params.id, { userId: user.id, userName: user.name, text });
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  res.json({ success: true, post: withViewerState(post, user.id) });
});

app.delete('/api/orientation/posts/:id/comment/:commentId', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const post = orientation.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  const comment = (post.comments || []).find((c) => c.id === Number(req.params.commentId));
  if (!comment) return res.status(404).json({ success: false, error: 'Comment not found.' });
  if (comment.userId !== user.id && user.role !== 'admin') return res.status(403).json({ success: false, error: 'You can only delete your own comments.' });
  const updated = orientation.removeComment(req.params.id, req.params.commentId);
  res.json({ success: true, post: withViewerState(updated, user.id) });
});

// Marks a post viewed - the only completion step for a post with no quiz;
// for one with a quiz it just unlocks the quiz UI (passing is what marks
// that one done, see /quiz/submit below).
app.post('/api/orientation/posts/:id/finish', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const post = orientation.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  const record = orientationProgress.markFinished(user.id, post.id);
  res.json({ success: true, progress: record });
});

app.get('/api/orientation/posts/:id/quiz', requireAuthApi, (req, res) => {
  const post = orientation.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  res.json({ success: true, questions: assessments.getQuestionsForTaker('orientation-post', String(post.id)) });
});

// Grades the attempt and records it either way. A passing attempt (>=70%)
// additionally gets each question's correct option index back so the
// client can show green/red - a failing one gets only the score, so a
// wrong attempt never leaks which options were right.
app.post('/api/orientation/posts/:id/quiz/submit', requireAuthApi, (req, res) => {
  const user = currentUser(req);
  const post = orientation.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  const answers = Array.isArray(req.body && req.body.answers) ? req.body.answers : [];
  const result = assessments.grade('orientation-post', String(post.id), answers);
  if (!result) return res.status(400).json({ success: false, error: 'This post has no quiz.' });
  const passed = result.score >= 0.7;
  orientationProgress.recordAttempt(user.id, post.id, { correct: result.correct, total: result.total, score: result.score, passed });
  if (!passed) return res.json({ success: true, passed: false, correct: result.correct, total: result.total, score: result.score });
  const questions = orientationPostQuestions(post.id);
  const review = questions.map((q, i) => ({ question: q.question, options: q.options, correctIndex: q.correctIndex, yourAnswer: Number(answers[i]) }));
  res.json({ success: true, passed: true, correct: result.correct, total: result.total, score: result.score, review });
});

// Every required post targeted at the caller's own resolved audience, with
// completion state - drives the recurring reminder and the Orientation
// screen's own per-post state, same underlying data the withdrawal gate
// checks for tutors.
app.get('/api/orientation/status', requireAuthApi, (req, res) => {
  res.json({ success: true, ...requiredOrientationStatus(currentUser(req)) });
});

const ORIENTATION_AUDIENCES = ['tutor', 'student', 'admin', 'sponsor', 'organization', 'support_agent'];

// Admin's manage view - every posted update across every audience (or one,
// via ?audience=), unlike GET /api/orientation/posts which resolves the
// caller's own single audience. Used to show what's already been sent
// (including who reacted/commented) alongside the composer, and to power
// its delete buttons.
app.get('/api/admin/orientation/posts', requireAdminApi, (req, res) => {
  const audience = req.query.audience;
  if (audience && !ORIENTATION_AUDIENCES.includes(audience)) return res.status(400).json({ success: false, error: 'Invalid orientation audience.' });
  const admin = currentUser(req);
  res.json({ success: true, posts: orientation.listAll(audience).map((post) => withViewerState(post, admin.id)) });
});

// Accepts either `audiences` (an array, optionally including 'all') or the
// older single `audience` string, so existing callers keep working. 'all'
// expands to every real audience rather than being stored as its own
// bucket, since GET /api/orientation/posts resolves one real audience per
// viewer and has no notion of an 'all' catch-all to match against. One
// post record is created per resolved audience - simplest way to reuse the
// existing single-audience `list()`/`add()` shape without changing it.
app.post('/api/admin/orientation/posts', requireAdminApi, (req, res) => {
  const { audience, audiences, title, notes, videoUrl, attachmentUrl, attachmentName, required, questions } = req.body || {};
  const requested = Array.isArray(audiences) ? audiences : audience ? [audience] : [];
  const resolved = requested.includes('all') ? ORIENTATION_AUDIENCES : requested;
  const targets = [...new Set(resolved)].filter((a) => ORIENTATION_AUDIENCES.includes(a));
  if (!targets.length) return res.status(400).json({ success: false, error: 'Choose at least one dashboard to send this to.' });
  if (!title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Enter a title.' });
  const admin = currentUser(req);
  const posts = targets.map((a) =>
    orientation.add({
      audience: a,
      title: String(title).trim(),
      notes: notes ? String(notes).trim() : '',
      videoUrl: videoUrl ? String(videoUrl).trim() : null,
      attachmentUrl: attachmentUrl ? String(attachmentUrl).trim() : null,
      attachmentName: attachmentUrl && attachmentName ? String(attachmentName).trim() : null,
      required: Boolean(required),
      createdByName: admin.name,
      reactions: [],
      comments: [],
    }),
  );
  // Same question set attached to every fanned-out post (one per target
  // audience) - keyed per post id in assessments.js so each still grades
  // independently even though the content is identical.
  if (Array.isArray(questions) && questions.length) {
    posts.forEach((post) => assessments.setQuestions('orientation-post', String(post.id), questions));
  }
  // Real notification per targeted user, not just a UI toast to the admin -
  // this is what NotificationBubbles/NotificationsScreen pick up as the
  // "pop up card" pointing them at the Orientation screen.
  posts.forEach((post) => {
    usersForOrientationAudience(post.audience).forEach((u) => {
      store.addNotification(u.id, { type: 'orientation', message: post.title, href: '/orientation' });
    });
  });
  res.json({ success: true, posts, post: posts[0] });
});

// Attaches/replaces a per-post quiz after the post already exists - kept
// separate from creation so the admin can add questions to a post that
// went out without any (or edit them later) without duplicating the
// create-and-notify logic above.
app.post('/api/admin/orientation/posts/:id/quiz', requireAdminApi, (req, res) => {
  const post = orientation.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  const questions = Array.isArray(req.body && req.body.questions) ? req.body.questions : [];
  const saved = assessments.setQuestions('orientation-post', String(post.id), questions);
  res.json({ success: true, questions: saved });
});

app.delete('/api/admin/orientation/posts/:id', requireAdminApi, (req, res) => {
  const removed = orientation.remove(req.params.id);
  if (!removed) return res.status(404).json({ success: false, error: 'Post not found.' });
  res.json({ success: true });
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
  res.json({ success: true, items: reels.listAll().filter((item) => (item.ownerScope || 'mozart') === 'mozart') });
});

app.post('/api/admin/library', requireAdminApi, (req, res) => {
  const { title, url, category, genre, isFile } = req.body || {};
  if (!title || !url) return res.status(400).json({ success: false, error: 'Title and link are required.' });
  const user = currentUser(req);
  const item = reels.create({ title, url, category, genre, addedBy: user.id, isFile });
  res.json({ success: true, item });
});

app.post('/api/admin/library/upload', hydrateUploadToken, requireAdminApi, (req, res) => {
  videoUpload.single('video')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Video is too large (max 500MB).' : err.message;
      return res.status(400).json({ success: false, error: message });
    }
    if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a video file to upload.' });
    res.json({ success: true, url: await resolveUploadedFileUrl(req.file, 'videos') });
  });
});

app.post('/api/admin/library/:id', requireAdminApi, (req, res) => {
  const { title, url, category, genre, isFile } = req.body || {};
  const item = reels.update(req.params.id, { title, url, category, genre, isFile });
  if (!item) return res.status(404).json({ success: false, error: 'Item not found.' });
  res.json({ success: true, item });
});

app.delete('/api/admin/library/:id', requireAdminApi, (req, res) => {
  const item = reels.remove(req.params.id);
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
  users = users.filter((user) => canCountryAdminViewUser(admin, user));
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
  if (!canCountryAdminViewUser(admin, target)) return res.status(403).json({ success: false, error: 'You can only manage users in your country.' });
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

// Win-back email: anyone who hasn't been seen (store.markSeen - the global
// "any signed-in request" middleware near the top of this file) in 2-3
// weeks gets the same "quick hello" reminder that was first sent as a
// one-off blast to the existing user base (data/mailer.js's
// sendReminderEmail). lastReengagementEmailAt gates it to once per quiet
// period: if it was already sent AFTER their last real activity, this
// check leaves them alone - only a user who came back and then went quiet
// again gets a second one, never a daily repeat of the same email.
const REENGAGEMENT_THRESHOLD_DAYS = 14;
const REENGAGEMENT_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function checkReengagementEmails() {
  const now = Date.now();
  for (const user of store.listUsers()) {
    if (!user.email) continue;
    const lastActive = new Date(user.lastSeenAt || user.createdAt);
    if (Number.isNaN(lastActive.getTime())) continue;
    const daysSinceActive = (now - lastActive.getTime()) / 86400000;
    if (daysSinceActive < REENGAGEMENT_THRESHOLD_DAYS) continue;
    const alreadySentSinceLastActive = user.lastReengagementEmailAt
      && new Date(user.lastReengagementEmailAt).getTime() > lastActive.getTime();
    if (alreadySentSinceLastActive) continue;
    try {
      const result = await mailer.sendReminderEmail(user);
      if (result.sent) store.markReengagementEmailSent(user.id);
    } catch (err) {
      console.error('Re-engagement email failed for', user.email, ':', err.message);
    }
  }
}

setInterval(() => {
  checkReengagementEmails().catch((err) => console.error('Re-engagement check failed:', err.message));
}, REENGAGEMENT_CHECK_INTERVAL_MS);
// Also run shortly after boot rather than waiting a full interval - a
// server that gets restarted daily (or more) during development should
// never let qualifying users go unnoticed just because the interval never
// got the chance to fire.
setTimeout(() => {
  checkReengagementEmails().catch((err) => console.error('Re-engagement check failed:', err.message));
}, 60 * 1000);

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
  // Local development should continue even when MongoDB is unreachable so the
  // app still serves its JSON-backed data. Production remains strict unless an
  // explicit local fallback flag is enabled.
  if (process.env.NODE_ENV !== 'production' && process.env.MONGO_PERSISTENCE !== 'true' && !process.env.MONGODB_URI) {
    return { connected: false, mode: 'local-development' };
  }

  const result = await mongoPersistence.initialize();
  const isLocalRuntime =
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_LOCAL_FALLBACK === 'true' ||
    /localhost|127\.0\.0\.1/i.test(String(process.env.BASE_URL || ''));

  if (!result.connected && !isLocalRuntime) {
    throw new Error('Production app requires MongoDB connectivity. Startup aborted to prevent silent user data loss.');
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
