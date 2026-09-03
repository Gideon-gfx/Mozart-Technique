const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { geocodeAddress } = require('./geocode');

const DATA_FILE = path.join(__dirname, 'users.json');
const MIN_RATINGS_BEFORE_FLAG = 3;
const FLAG_THRESHOLD = 2.5; // out of 5
const LIVE_ACCOUNT_EMAILS = new Set([
  'mozarttechniques@gmail.com',
  'emmanuelsolomontenore@gmail.com',
  'gabrielsolomon781@gmail.com',
]);

function load() {
  if (!fs.existsSync(DATA_FILE)) return { users: [], nextId: 1 };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { users: [], nextId: 1 };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function findByEmail(email) {
  const db = load();
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function findById(id) {
  const db = load();
  return db.users.find((u) => u.id === id) || null;
}

function findByGoogleId(googleId) {
  const db = load();
  return db.users.find((u) => u.googleId === googleId) || null;
}

function createUser({ name, email, passwordHash = null, googleId = null, role = 'user', countryCode = null }) {
  const db = load();
  const user = {
    id: db.nextId++,
    name,
    email,
    passwordHash,
    googleId,
    role,
    countryCode,
    purchasedCourses: [],
    progress: {}, // courseId -> array of completed lesson indices
    streak: { count: 0, lastActiveDate: null },
    notifications: [],
    nextNotificationId: 1,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  persist(db);
  return user;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, local-independent enough for this use
}

// Bumps the daily activity streak - called once per dashboard visit. A
// streak increments once per calendar day of activity; missing a day
// resets it back to 1 on the next active day.
function markActive(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;

  if (!user.streak) user.streak = { count: 0, lastActiveDate: null };
  const today = todayStamp();
  if (user.streak.lastActiveDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    user.streak.count = user.streak.lastActiveDate === yesterday ? user.streak.count + 1 : 1;
    user.streak.lastActiveDate = today;
    persist(db);
  }
  return user;
}

function getBadges(user) {
  const badges = [];
  if ((user.streak && user.streak.count) >= 3) badges.push({ id: 'streak-3', label: '3-Day Streak', icon: 'fa-fire' });
  if ((user.streak && user.streak.count) >= 7) badges.push({ id: 'streak-7', label: '7-Day Streak', icon: 'fa-fire' });
  if ((user.streak && user.streak.count) >= 30) badges.push({ id: 'streak-30', label: '30-Day Streak', icon: 'fa-fire' });
  return badges;
}

function addNotification(userId, { type, message, href = null }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.notifications) user.notifications = [];
  if (!user.nextNotificationId) user.nextNotificationId = 1;
  user.notifications.unshift({
    id: user.nextNotificationId++,
    type,
    message,
    href,
    read: false,
    createdAt: new Date().toISOString(),
  });
  user.notifications = user.notifications.slice(0, 50); // cap history
  persist(db);
  return user;
}

function markNotificationsRead(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  (user.notifications || []).forEach((n) => { n.read = true; });
  persist(db);
  return user;
}

function markNotificationRead(userId, notificationId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  const notification = (user.notifications || []).find((item) => item.id === Number(notificationId));
  if (!notification) return null;
  notification.read = true;
  persist(db);
  return user;
}

function setCountry(userId, countryCode) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.countryCode = countryCode;
  persist(db);
  return user;
}

function setName(userId, name) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.name = name;
  persist(db);
  return user;
}

function setPhoto(userId, photoUrl) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.photoUrl = photoUrl;
  persist(db);
  return user;
}

// A student's saved card, used to authorize (hold) and later capture escrow
// payments off-session when a tutor logs/confirms a lesson. Only the
// non-sensitive display bits (brand/last4) and Stripe's own IDs are stored
// here - the actual card details live entirely on Stripe's side.
function setStripePaymentMethod(userId, { customerId, paymentMethodId, brand, last4 }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.stripeCustomerId = customerId;
  user.stripePaymentMethodId = paymentMethodId;
  user.cardBrand = brand || null;
  user.cardLast4 = last4 || null;
  persist(db);
  return user;
}

// Connect account data is deliberately limited to Stripe identifiers and
// status flags. Bank account and identity details remain only with Stripe.
function setStripeConnectAccount(userId, account) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.stripeConnectAccountId = account && account.id ? account.id : user.stripeConnectAccountId;
  user.stripeConnectOnboardingComplete = Boolean(account && account.details_submitted);
  user.stripeConnectPayoutsEnabled = Boolean(account && account.payouts_enabled);
  user.stripeConnectDetailsSubmitted = Boolean(account && account.details_submitted);
  user.stripeConnectUpdatedAt = new Date().toISOString();
  persist(db);
  return user;
}

function clearStripePaymentMethod(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.stripePaymentMethodId = null;
  user.cardBrand = null;
  user.cardLast4 = null;
  persist(db);
  return user;
}

// A tutor's Google Calendar refresh token, from the separate authorization-
// code OAuth flow (see data/google-calendar.js) - lets the server create a
// real Calendar event with a Meet link on the tutor's behalf, independent
// of whether they originally signed up with Google or a password.
function setGoogleCalendarToken(userId, { refreshToken, email }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.googleCalendarRefreshToken = refreshToken;
  user.googleCalendarEmail = email || null;
  user.googleCalendarConnectedAt = new Date().toISOString();
  persist(db);
  return user;
}

function clearGoogleCalendarToken(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.googleCalendarRefreshToken = null;
  user.googleCalendarEmail = null;
  user.googleCalendarConnectedAt = null;
  persist(db);
  return user;
}

// Profile details used for tutor matching: age band, preferred genres, sex,
// and (geocoded) location for in-person proximity matching.
async function setStudentProfile(userId, { name, ageGroup, genres, city, address, sex, photoUrl, agreementAccepted }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  const coords = address || city ? await geocodeAddress(address || city) : null;
  user.studentProfile = user.studentProfile || { ageGroup: null, genres: [], city: null, address: null };
  if (name && String(name).trim()) {
    user.name = String(name).trim();
  }
  user.studentProfile.ageGroup = ageGroup || null;
  user.studentProfile.genres = Array.isArray(genres) ? genres : user.studentProfile.genres || [];
  user.studentProfile.city = city || null;
  user.studentProfile.address = address || null;
  user.studentProfile.sex = sex != null ? (sex || null) : (user.studentProfile.sex || null);
  if (agreementAccepted === true) user.studentProfile.agreementAcceptedAt = new Date().toISOString();
  if (photoUrl) {
    user.photoUrl = photoUrl;
  }
  user.studentProfile.lat = coords ? coords.lat : user.studentProfile.lat || null;
  user.studentProfile.lng = coords ? coords.lng : user.studentProfile.lng || null;
  user.studentProfile.locality = coords ? { city: coords.city, state: coords.state, country: coords.country } : user.studentProfile.locality || null;
  persist(db);
  return user;
}

// Sets a student's location from real browser GPS coordinates (reverse
// geocoded), which is what powers matching/grouping - more reliable than a
// typed address, and required so the platform actually knows where a
// student is (per the "location must be public to the tutor" rule, this is
// shown to a matched tutor, not just used internally).
function setRealLocation(userId, { lat, lng, city, state, country, fullAddress }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.studentProfile) user.studentProfile = { ageGroup: null, genres: [], city: null, address: null };
  user.studentProfile.lat = lat;
  user.studentProfile.lng = lng;
  user.studentProfile.locality = { city: city || null, state: state || null, country: country || null };
  if (city) user.studentProfile.city = city;
  if (fullAddress) user.studentProfile.fullAddress = fullAddress;
  persist(db);
  return user;
}

// Links a student's account to the NGO/organization sponsoring them, once
// they redeem that org's access code (see data/organizations.js).
function setSponsor(userId, { orgId, orgName }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!Array.isArray(user.organizationMemberships)) user.organizationMemberships = user.sponsor ? [user.sponsor] : [];
  const membership = { orgId, orgName, activatedAt: new Date().toISOString() };
  user.organizationMemberships = [membership, ...user.organizationMemberships.filter((entry) => Number(entry.orgId) !== Number(orgId))];
  user.sponsor = membership;
  persist(db);
  return user;
}

function clearSponsor(userId, orgId = null) {
  const db = load();
  const user = db.users.find((entry) => entry.id === userId);
  if (!user) return user;
  const memberships = Array.isArray(user.organizationMemberships) ? user.organizationMemberships : (user.sponsor ? [user.sponsor] : []);
  user.organizationMemberships = orgId == null ? [] : memberships.filter((entry) => Number(entry.orgId) !== Number(orgId));
  user.sponsor = user.organizationMemberships[0] || null;
  persist(db);
  return user;
}

// A placement quiz gives a suggested level; a tutor's first-lesson
// evaluation (finalizePlacement) can override it with the final say.
function setPlacementSuggestion(userId, category, { score, level }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.placements) user.placements = {};
  user.placements[category] = {
    ...(user.placements[category] || {}),
    suggestedScore: score,
    suggestedLevel: level,
    suggestedAt: new Date().toISOString(),
  };
  persist(db);
  return user;
}

function finalizePlacement(userId, category, level, tutorId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.placements) user.placements = {};
  user.placements[category] = {
    ...(user.placements[category] || {}),
    finalLevel: level,
    finalizedBy: tutorId,
    finalizedAt: new Date().toISOString(),
  };
  persist(db);
  return user;
}

// Records a tutor's rating of a student after a lesson, flagging the
// student for admin review once there's enough of a sample to be
// meaningful and the rolling average is too low.
function addStudentRating(userId, { score, professionalism }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.rating) user.rating = { sum: 0, count: 0, professionalismSum: 0, professionalismCount: 0, flagged: false, flaggedAt: null };
  user.rating.sum += Number(score);
  user.rating.count += 1;
  if (professionalism != null) {
    user.rating.professionalismSum += Number(professionalism);
    user.rating.professionalismCount += 1;
  }
  const avg = user.rating.sum / user.rating.count;
  if (user.rating.count >= MIN_RATINGS_BEFORE_FLAG && avg < FLAG_THRESHOLD && !user.rating.flagged) {
    user.rating.flagged = true;
    user.rating.flaggedAt = new Date().toISOString();
  }
  persist(db);
  return user;
}

function clearStudentFlag(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.rating) return user;
  user.rating.flagged = false;
  user.rating.flaggedAt = null;
  persist(db);
  return user;
}

// Demo and admin accounts get every purchasable course unlocked without
// ever going through payment.
function linkGoogleId(userId, googleId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.googleId = googleId;
  persist(db);
  return user;
}

function setRole(userId, role) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.role = role;
  // Store support access independently of the display role so it remains
  // available for a normal Mozart account even after later role updates.
  if (role === 'support_agent') user.supportAgent = true;
  if (role === 'user' || role === 'demo') user.supportAgent = false;
  if (role !== 'admin') user.adminCountryCode = null;
  persist(db);
  return user;
}

function setPayoutDetails(userId, details) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.payoutDetails = { accountName: details.accountName, bankName: details.bankName, accountNumber: details.accountNumber, updatedAt: new Date().toISOString() };
  persist(db);
  return user;
}

// Country administrators remain normal admin-role users, but their approval
// powers are limited to the country chosen by the platform owner.
function setCountryAdmin(userId, countryCode) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.role = 'admin';
  user.adminCountryCode = countryCode || null;
  persist(db);
  return user;
}

function listUsers() {
  const db = load();
  return db.users.filter((user) => {
    const email = String(user.email || '').trim().toLowerCase();
    return LIVE_ACCOUNT_EMAILS.has(email);
  });
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// No email service is configured, so there's no inbox to deliver a reset
// link to - the caller (server.js) hands the raw link back to the browser
// that requested it instead. Still time-limited and single-use like a real
// email-based flow, just delivered a different way.
function createResetToken(email) {
  const db = load();
  const user = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) return null;
  user.resetToken = crypto.randomBytes(24).toString('hex');
  user.resetTokenExpires = Date.now() + RESET_TOKEN_TTL_MS;
  persist(db);
  return user;
}

function findByResetToken(token) {
  const db = load();
  return db.users.find((u) => u.resetToken === token && u.resetTokenExpires > Date.now()) || null;
}

function resetPassword(token, passwordHash) {
  const db = load();
  const user = db.users.find((u) => u.resetToken === token && u.resetTokenExpires > Date.now());
  if (!user) return null;
  user.passwordHash = passwordHash;
  user.resetToken = null;
  user.resetTokenExpires = null;
  persist(db);
  return user;
}

function slugify(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function findBySlug(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase();
  const db = load();
  return db.users.find((u) => String(u.id) === s || slugify(u.name) === s) || null;
}

// Google Calendar connection for a tutor. Only the refresh token is kept -
// access tokens are short-lived and re-minted from it on demand, so there's
// nothing to expire here. Disconnecting simply drops the token; any events
// already on the tutor's calendar stay where they are.
function setCalendarTokens(userId, { refreshToken, googleEmail }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.googleCalendar = {
    refreshToken,
    googleEmail: googleEmail || null,
    connectedAt: new Date().toISOString(),
  };
  persist(db);
  return user;
}

function clearCalendarTokens(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.googleCalendar = null;
  persist(db);
  return user;
}

module.exports = {
  findByEmail, findById, findByGoogleId, createUser, linkGoogleId, setCountry, setName, setPhoto,
  setCalendarTokens, clearCalendarTokens,
  markActive, getBadges, addNotification, markNotificationsRead, markNotificationRead, setRole, setCountryAdmin, setPayoutDetails, listUsers,
  createResetToken, findByResetToken, resetPassword,
  setStudentProfile, setRealLocation, setSponsor, clearSponsor, setPlacementSuggestion, finalizePlacement, addStudentRating, clearStudentFlag,
  setStripePaymentMethod, clearStripePaymentMethod, setStripeConnectAccount,
  MIN_RATINGS_BEFORE_FLAG, FLAG_THRESHOLD,
};

// expose slug helpers for public routes
module.exports.slugify = slugify;
module.exports.findBySlug = findBySlug;
