const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { geocodeAddress } = require('./geocode');

const DATA_FILE = path.join(__dirname, 'users.json');
const MIN_RATINGS_BEFORE_FLAG = 3;
const FLAG_THRESHOLD = 2.5; // out of 5

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
    // Separate from streak above (that one's gamification - daily
    // count, resets on a missed day, drives badges). This is a plain
    // "were they seen at all today" marker, updated for every signed-in
    // request regardless of role (see server.js's global middleware),
    // used only to tell whether someone's gone quiet for the
    // win-back email - see checkReengagementEmails below.
    lastSeenAt: null,
    lastReengagementEmailAt: null,
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

// Called from server.js's global "any signed-in request" middleware, for
// every role (student, tutor, performer, sponsor, admin) - not just the
// student dashboard visit markActive() above is scoped to. Day-granular
// (same as markActive) since the only thing reading this cares about
// weeks of inactivity, not minutes - so this writes at most once per user
// per day no matter how many requests they make.
function markSeen(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  const today = todayStamp();
  if (user.lastSeenAt !== today) {
    user.lastSeenAt = today;
    persist(db);
  }
}

function markReengagementEmailSent(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  user.lastReengagementEmailAt = new Date().toISOString();
  persist(db);
}

function getBadges(user) {
  const badges = [];
  if ((user.streak && user.streak.count) >= 3) badges.push({ id: 'streak-3', label: '3-Day Streak', icon: 'fa-fire' });
  if ((user.streak && user.streak.count) >= 7) badges.push({ id: 'streak-7', label: '7-Day Streak', icon: 'fa-fire' });
  if ((user.streak && user.streak.count) >= 30) badges.push({ id: 'streak-30', label: '30-Day Streak', icon: 'fa-fire' });
  return badges;
}

function addNotification(userId, { type, message, href = null, imageUrl = null }) {
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
    // Optional - only ever set for notification types that display an
    // image (e.g. 'new_product', a store cover image). null for every
    // other type, same as href already is.
    imageUrl,
    read: false,
    createdAt: new Date().toISOString(),
    pushPending: true,
  });
  user.notifications = user.notifications.slice(0, 50); // cap history
  persist(db);
  return user;
}

// Recently-viewed store products, capped and most-recent-first - same
// per-user-record shape as notifications above, kept here rather than in a
// new data file since it's inherently tied to a real account, not a browser.
function recordRecentlyViewed(userId, productId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!Array.isArray(user.recentlyViewedProducts)) user.recentlyViewedProducts = [];
  user.recentlyViewedProducts = [
    { productId: Number(productId), viewedAt: new Date().toISOString() },
    ...user.recentlyViewedProducts.filter((entry) => entry.productId !== Number(productId)),
  ].slice(0, 24);
  persist(db);
  return user;
}

function getRecentlyViewed(userId) {
  const user = load().users.find((u) => u.id === userId);
  return (user && user.recentlyViewedProducts) || [];
}

function clearPushPending(userId, notificationId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  const notification = (user.notifications || []).find((item) => item.id === Number(notificationId));
  if (notification) notification.pushPending = false;
  persist(db);
  return user;
}

function setPushSubscription(userId, subscription) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.pushSubscriptions) user.pushSubscriptions = [];
  const key = subscription && subscription.endpoint;
  if (!key) return user;
  user.pushSubscriptions = user.pushSubscriptions.filter((item) => item.endpoint !== key);
  user.pushSubscriptions.push(subscription);
  persist(db);
  return user;
}

function removePushSubscription(userId, endpoint) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.pushSubscriptions = (user.pushSubscriptions || []).filter((item) => item.endpoint !== endpoint);
  persist(db);
  return user;
}

// Native (Expo) push tokens, same shape/lifecycle as web's pushSubscriptions
// above but a flat string per device instead of a subscription object. A
// token is also stripped from every OTHER account first - the same
// physical device can only usefully deliver to whichever account is
// currently signed in, so a stale token left on a previous account would
// otherwise keep notifying someone who signed out of this device.
function setExpoPushToken(userId, token) {
  const db = load();
  db.users.forEach((u) => {
    if (u.id !== userId && Array.isArray(u.expoPushTokens)) u.expoPushTokens = u.expoPushTokens.filter((t) => t !== token);
  });
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!Array.isArray(user.expoPushTokens)) user.expoPushTokens = [];
  user.expoPushTokens = user.expoPushTokens.filter((t) => t !== token);
  user.expoPushTokens.push(token);
  persist(db);
  return user;
}

function removeExpoPushToken(userId, token) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.expoPushTokens = (user.expoPushTokens || []).filter((t) => t !== token);
  persist(db);
  return user;
}

function markAppOnboardingSeen(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.needsAppOnboarding = false;
  persist(db);
  return user;
}

function markMobileWelcomeEmailSent(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.mobileWelcomeEmailSentAt = new Date().toISOString();
  persist(db);
  return user;
}

// Tracks which mobile coachmark tours (one per dashboard - student home,
// tutor home, org dashboard, Find a Tutor, etc.) this account has already
// clicked through, so each shows only once per account, same idea as
// needsAppOnboarding but per-screen instead of a single app-wide flag. A
// tourId is any string the client defines (e.g. "student-dashboard").
function markTourSeen(userId, tourId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!Array.isArray(user.seenTours)) user.seenTours = [];
  if (!user.seenTours.includes(tourId)) user.seenTours.push(tourId);
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

// Stripe test and live mode have separate Customers and PaymentMethods. Keep
// their IDs separate even when both environments use the same user database.
// Older single-mode fields are retained only for verified, lazy migration.
function getStripePaymentMethod(user, mode) {
  if (!user || !['test', 'live'].includes(mode)) return null;
  const profile = user.stripePaymentProfiles && user.stripePaymentProfiles[mode];
  return profile && profile.customerId ? {
    customerId: profile.customerId,
    paymentMethodId: profile.paymentMethodId || null,
    brand: profile.brand || null,
    last4: profile.last4 || null,
  } : null;
}

function setStripePaymentMethod(userId, { mode, customerId, paymentMethodId, brand, last4 }) {
  if (!['test', 'live'].includes(mode) || !customerId) throw new Error('A Stripe mode and customer ID are required.');
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.stripePaymentProfiles = user.stripePaymentProfiles || {};
  user.stripePaymentProfiles[mode] = {
    customerId, paymentMethodId: paymentMethodId || null,
    brand: brand || null, last4: last4 || null,
  };
  persist(db);
  return user;
}

function setProfileDisplayRole(userId, roleKey) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.profileDisplayRoleKey = roleKey;
  persist(db);
  return user;
}

// Connect account data is deliberately limited to Stripe identifiers and
// status flags. Bank account and identity details remain only with Stripe.
function setStripeConnectAccount(userId, account) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  const recipientBalance = account && account.configuration && account.configuration.recipient
    && account.configuration.recipient.capabilities && account.configuration.recipient.capabilities.stripe_balance;
  const transfersEnabled = recipientBalance && recipientBalance.stripe_transfers
    ? recipientBalance.stripe_transfers.status === 'active'
    : Boolean(account && account.transfers_enabled);
  const payoutsEnabled = recipientBalance && recipientBalance.payouts
    ? recipientBalance.payouts.status === 'active'
    : Boolean(account && account.payouts_enabled);
  const requirements = (account && account.requirements) || {};
  user.stripeConnectAccountId = account && account.id ? account.id : user.stripeConnectAccountId;
  user.stripeConnectAccountVersion = account && account.object === 'v2.core.account' ? 'v2' : (account && account.object ? 'v1' : user.stripeConnectAccountVersion);
  user.stripeConnectOnboardingComplete = account && account.object === 'v2.core.account'
    ? Boolean(transfersEnabled && payoutsEnabled && !account.closed)
    : Boolean(account && account.details_submitted);
  user.stripeConnectPayoutsEnabled = Boolean(payoutsEnabled);
  user.stripeConnectTransfersEnabled = Boolean(transfersEnabled);
  user.stripeConnectDetailsSubmitted = account && account.object === 'v2.core.account'
    ? Boolean(!(requirements.currently_due || []).length && !account.closed)
    : Boolean(account && account.details_submitted);
  user.stripeConnectRequirementsDue = Array.isArray(requirements.currently_due) ? requirements.currently_due : [];
  user.stripeConnectUpdatedAt = new Date().toISOString();
  persist(db);
  return user;
}

function clearStripePaymentMethod(userId, mode) {
  if (!['test', 'live'].includes(mode)) throw new Error('A Stripe mode is required.');
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  const profile = user.stripePaymentProfiles && user.stripePaymentProfiles[mode];
  if (!profile) return user;
  profile.paymentMethodId = null;
  profile.brand = null;
  profile.last4 = null;
  persist(db);
  return user;
}

function clearStripeCustomer(userId, mode) {
  if (!['test', 'live'].includes(mode)) throw new Error('A Stripe mode is required.');
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user || !user.stripePaymentProfiles || !user.stripePaymentProfiles[mode]) return user || null;
  delete user.stripePaymentProfiles[mode];
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
  return load().users;
}

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes - short-lived since it's now a typeable 6-digit OTP, not an unguessable link token

// A 6-digit OTP emailed to the account (server.js calls mailer.js's
// sendPasswordResetEmail right after this) - short and typeable rather
// than a long link token, since the user now enters it by hand instead of
// clicking through. Still single-use and time-limited (15 min).
function createResetToken(email) {
  const db = load();
  const user = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) return null;
  user.resetToken = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
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

// --- Thread preferences (favorite/archive/pin/mute/hide) and blocking ---
// Thread keys are `assignment:<id>` or `group:<id>` - scoped to the two
// thread types /api/conversations and /api/group-chats already expose.
// No persisted "conversation" entity exists separate from those records, so
// these preferences live on the viewing user instead (each side of a thread
// can favorite/archive/mute/pin/hide it independently, same as WhatsApp).

function toggleBlockedUser(userId, targetUserId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!Array.isArray(user.blockedUserIds)) user.blockedUserIds = [];
  const blocked = user.blockedUserIds.includes(targetUserId);
  user.blockedUserIds = blocked
    ? user.blockedUserIds.filter((id) => id !== targetUserId)
    : [...user.blockedUserIds, targetUserId];
  persist(db);
  return !blocked;
}

function isBlockedPair(userId, otherUserId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  const other = db.users.find((u) => u.id === otherUserId);
  return Boolean((user && (user.blockedUserIds || []).includes(otherUserId)) || (other && (other.blockedUserIds || []).includes(userId)));
}

function toggleThreadListField(fieldName) {
  return (userId, threadKey) => {
    const db = load();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return null;
    if (!Array.isArray(user[fieldName])) user[fieldName] = [];
    const on = user[fieldName].includes(threadKey);
    user[fieldName] = on ? user[fieldName].filter((key) => key !== threadKey) : [...user[fieldName], threadKey];
    persist(db);
    return !on;
  };
}
const toggleFavoriteThread = toggleThreadListField('favoriteThreadIds');
const toggleArchivedThread = toggleThreadListField('archivedThreadIds');
const togglePinnedThread = toggleThreadListField('pinnedThreadIds');

const MUTE_DURATIONS = { '8h': 8 * 60 * 60 * 1000, '1w': 7 * 24 * 60 * 60 * 1000 };

function setMutedThread(userId, threadKey, duration) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.mutedThreads) user.mutedThreads = {};
  if (!duration) {
    delete user.mutedThreads[threadKey];
  } else {
    const until = duration === 'always' ? null : new Date(Date.now() + (MUTE_DURATIONS[duration] || 0)).toISOString();
    user.mutedThreads[threadKey] = { until };
  }
  persist(db);
  return user.mutedThreads[threadKey] || null;
}

function hideThread(userId, threadKey) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.hiddenThreads) user.hiddenThreads = {};
  user.hiddenThreads[threadKey] = new Date().toISOString();
  persist(db);
  return user.hiddenThreads[threadKey];
}

// One read for every route/list that needs to annotate threads with the
// caller's own preferences, instead of five separate lookups per row.
function getThreadPrefs(userId) {
  const user = findById(userId);
  if (!user) return { favoriteThreadIds: [], archivedThreadIds: [], pinnedThreadIds: [], mutedThreads: {}, hiddenThreads: {}, blockedUserIds: [] };
  return {
    favoriteThreadIds: user.favoriteThreadIds || [],
    archivedThreadIds: user.archivedThreadIds || [],
    pinnedThreadIds: user.pinnedThreadIds || [],
    mutedThreads: user.mutedThreads || {},
    hiddenThreads: user.hiddenThreads || {},
    blockedUserIds: user.blockedUserIds || [],
  };
}

module.exports = {
  findByEmail, findById, findByGoogleId, createUser, linkGoogleId, setCountry, setName, setProfileDisplayRole, setPhoto,
  setCalendarTokens, clearCalendarTokens,
  markActive, markSeen, markReengagementEmailSent, getBadges, addNotification, recordRecentlyViewed, getRecentlyViewed, clearPushPending, markNotificationsRead, markNotificationRead, setPushSubscription, removePushSubscription, setExpoPushToken, removeExpoPushToken, markAppOnboardingSeen, markMobileWelcomeEmailSent, markTourSeen, setRole, setCountryAdmin, setPayoutDetails, listUsers,
  createResetToken, findByResetToken, resetPassword,
  setStudentProfile, setRealLocation, setSponsor, clearSponsor, setPlacementSuggestion, finalizePlacement, addStudentRating, clearStudentFlag,
  getStripePaymentMethod, setStripePaymentMethod, clearStripePaymentMethod, clearStripeCustomer, setStripeConnectAccount,
  MIN_RATINGS_BEFORE_FLAG, FLAG_THRESHOLD,
  toggleBlockedUser, isBlockedPair, toggleFavoriteThread, toggleArchivedThread, togglePinnedThread,
  setMutedThread, hideThread, getThreadPrefs,
};

// expose slug helpers for public routes
module.exports.slugify = slugify;
module.exports.findBySlug = findBySlug;
