// Tutor applications. A user applies with their qualifications; an admin
// reviews and approves/rejects. Approval status is tracked here rather than
// as a user role, since a tutor can also be an enrolled student.
const fs = require('fs');
const path = require('path');
const { geocodeAddress } = require('./geocode');

const DATA_FILE = path.join(__dirname, 'tutors.json');
const MIN_RATINGS_BEFORE_FLAG = 3;
const FLAG_THRESHOLD = 2.5; // out of 5

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, tutors: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, tutors: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().tutors;
}

function listApproved() {
  return listAll().filter((t) => t.status === 'approved' && !t.expelled);
}

function findById(id) {
  return listAll().find((t) => t.id === Number(id)) || null;
}

function findByUserId(userId) {
  return listAll().find((t) => t.userId === userId) || null;
}

function slugify(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function findBySlug(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase();
  return listAll().find((t) => String(t.id) === s || slugify(t.name) === s) || null;
}

async function apply({
  userId, name, email, categories, levels, genres, ageGroups, city, address, teachesOnline, phone,
  qualifications, experienceYears, bio, hourlyRateUsd, commuteRadiusKm, certificateUrl, inPersonVenue, photoUrl, agreementAccepted,
}) {
  const db = load();
  const coords = address || city ? await geocodeAddress(address || city) : null;
  const tutor = {
    id: db.nextId++,
    userId,
    name,
    email,
    categories: Array.isArray(categories) ? categories : [],
    levels: Array.isArray(levels) ? levels : [],
    genres: Array.isArray(genres) ? genres : [],
    ageGroups: Array.isArray(ageGroups) ? ageGroups : [],
    city: city || null,
    address: address || null,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    locality: coords ? { city: coords.city, state: coords.state, country: coords.country } : null,
    teachesOnline: Boolean(teachesOnline),
    commuteRadiusKm: Math.max(1, Number(commuteRadiusKm) || 10),
    // Whether in-person lessons happen at the student's place, the tutor's
    // own studio, or the tutor is open to either.
    inPersonVenue: ['student_location', 'tutor_studio', 'either'].includes(inPersonVenue) ? inPersonVenue : 'either',
    phone: phone || null,
    qualifications: qualifications || '',
    certificateUrl: certificateUrl || null,
    photoUrl: photoUrl || null,
    experienceYears: Number(experienceYears) || 0,
    hourlyRateUsd: Math.max(0, Number(hourlyRateUsd) || 0),
    bio: bio || '',
    agreementAcceptedAt: agreementAccepted ? new Date().toISOString() : null,
    studentIntakeQuestions: [],
    status: 'pending',
    // Self-declared per-category levels above are a starting point; a
    // passed qualification evaluation (see data/assessments.js,
    // kind 'teacher-eval') is what actually unlocks teaching a level.
    approvedLevelByCategory: {},
    lastEvaluatedAtByCategory: {},
    orientationCompleted: false,
    orientationCompletedAt: null,
    orientationReward: null,
    orientationBonusPending: false,
    ratingSum: 0,
    ratingCount: 0,
    professionalismSum: 0,
    professionalismCount: 0,
    lessonsCompletedCount: 0,
    balanceUsd: 0,
    totalEarnedUsd: 0,
    stripeConnectAccountId: null,
    stripeConnectOnboardingComplete: false,
    stripeConnectPayoutsEnabled: false,
    stripeConnectDetailsSubmitted: false,
    stripeConnectUpdatedAt: null,
    approvedByUserId: null,
    flagged: false,
    flaggedAt: null,
    expelled: false,
    createdAt: new Date().toISOString(),
  };
  db.tutors.push(tutor);
  persist(db);
  return tutor;
}

function setStatus(id, status, reviewedByUserId = null) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.status = status;
  tutor.reviewedAt = new Date().toISOString();
  if (status === 'approved' && reviewedByUserId) tutor.approvedByUserId = Number(reviewedByUserId);
  persist(db);
  return tutor;
}

function setStripeConnectAccount(id, account) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.stripeConnectAccountId = account && account.id ? account.id : tutor.stripeConnectAccountId;
  tutor.stripeConnectOnboardingComplete = Boolean(account && account.details_submitted);
  tutor.stripeConnectPayoutsEnabled = Boolean(account && account.payouts_enabled);
  tutor.stripeConnectDetailsSubmitted = Boolean(account && account.details_submitted);
  tutor.stripeConnectUpdatedAt = new Date().toISOString();
  persist(db);
  return tutor;
}

// A qualification evaluation result unlocks teaching that level (and every
// level below it) for that category. Re-evaluating to teach higher is only
// allowed once 12 months have passed since the last evaluation in that
// category - callers should check canReevaluate() before letting a tutor in.
function setApprovedLevel(id, category, level) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  if (!tutor.approvedLevelByCategory) tutor.approvedLevelByCategory = {};
  if (!tutor.lastEvaluatedAtByCategory) tutor.lastEvaluatedAtByCategory = {};
  tutor.approvedLevelByCategory[category] = level;
  tutor.lastEvaluatedAtByCategory[category] = new Date().toISOString();
  persist(db);
  return tutor;
}

const REEVALUATION_COOLDOWN_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

function canReevaluate(tutor, category) {
  const last = tutor.lastEvaluatedAtByCategory && tutor.lastEvaluatedAtByCategory[category];
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= REEVALUATION_COOLDOWN_MS;
}

function completeOrientation(id, reward) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.orientationCompleted = true;
  tutor.orientationCompletedAt = new Date().toISOString();
  tutor.orientationReward = reward;
  if (reward === 'bonus_student') tutor.orientationBonusPending = true;
  persist(db);
  return tutor;
}

function clearOrientationBonus(id) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.orientationBonusPending = false;
  persist(db);
  return tutor;
}

function incrementLessonsCompleted(id) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.lessonsCompletedCount = (tutor.lessonsCompletedCount || 0) + 1;
  persist(db);
  return tutor;
}

// Records one rating (1-5) from a student after a lesson, and flags the
// tutor for admin review if their rolling average drops too low once
// there's enough of a sample to be meaningful (a single bad rating
// shouldn't sink someone).
function addRating(id, { score, professionalism }) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.ratingSum = (tutor.ratingSum || 0) + Number(score);
  tutor.ratingCount = (tutor.ratingCount || 0) + 1;
  if (professionalism != null) {
    tutor.professionalismSum = (tutor.professionalismSum || 0) + Number(professionalism);
    tutor.professionalismCount = (tutor.professionalismCount || 0) + 1;
  }
  const avg = tutor.ratingSum / tutor.ratingCount;
  if (tutor.ratingCount >= MIN_RATINGS_BEFORE_FLAG && avg < FLAG_THRESHOLD && !tutor.flagged) {
    tutor.flagged = true;
    tutor.flaggedAt = new Date().toISOString();
  }
  persist(db);
  return tutor;
}

function clearFlag(id) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.flagged = false;
  tutor.flaggedAt = null;
  persist(db);
  return tutor;
}

function expel(id) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.expelled = true;
  tutor.status = 'rejected';
  persist(db);
  return tutor;
}

// Credits a tutor's simulated running balance when an escrowed lesson
// payment releases (see data/assignments.js confirmSession). No real money
// moves - this app has no live payment processor - but the balance is
// tracked for real, the same way the rest of "payment" in this app is
// simulated-but-consistent rather than faked away.
function creditBalance(id, amountUsd) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.balanceUsd = Math.round(((tutor.balanceUsd || 0) + amountUsd) * 100) / 100;
  tutor.totalEarnedUsd = Math.round(((tutor.totalEarnedUsd || 0) + amountUsd) * 100) / 100;
  persist(db);
  return tutor;
}

function debitBalance(id, amountUsd) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.balanceUsd = Math.round(((tutor.balanceUsd || 0) - amountUsd) * 100) / 100;
  if (tutor.balanceUsd < 0) tutor.balanceUsd = 0;
  persist(db);
  return tutor;
}

// Updates a tutor's location from real browser GPS coordinates (reverse
// geocoded), rather than the free-text address they typed at application
// time - keeps their city normalized for city-based grouping/matching.
function setRealLocation(id, { lat, lng, city, state, country, fullAddress }) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.lat = lat;
  tutor.lng = lng;
  tutor.locality = { city: city || null, state: state || null, country: country || null };
  if (city) tutor.city = city;
  if (fullAddress) tutor.fullAddress = fullAddress;
  persist(db);
  return tutor;
}

function setPhoto(id, photoUrl) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.photoUrl = photoUrl;
  persist(db);
  return tutor;
}

function setCategories(id, categories) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.categories = Array.isArray(categories) ? categories : [];
  persist(db);
  return tutor;
}

function setHourlyRate(id, hourlyRateUsd) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.hourlyRateUsd = Math.max(0, Number(hourlyRateUsd) || 0);
  persist(db);
  return tutor;
}

function setIntakeQuestions(id, questions) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.studentIntakeQuestions = Array.isArray(questions) ? questions.map((q) => ({
    question: String(q.question || '').trim(),
    placeholder: String(q.placeholder || '').trim(),
  })) : [];
  persist(db);
  return tutor;
}

function avgRating(tutor) {
  return tutor.ratingCount ? tutor.ratingSum / tutor.ratingCount : null;
}

function avgProfessionalism(tutor) {
  return tutor.professionalismCount ? tutor.professionalismSum / tutor.professionalismCount : null;
}

module.exports = {
  listAll, listApproved, findById, findByUserId, apply, setStatus, setStripeConnectAccount,
  setApprovedLevel, canReevaluate, completeOrientation, clearOrientationBonus,
  incrementLessonsCompleted, addRating, clearFlag, expel, avgRating, avgProfessionalism,
  creditBalance, debitBalance, setRealLocation, setPhoto, setCategories, setHourlyRate, setIntakeQuestions, findBySlug,
  MIN_RATINGS_BEFORE_FLAG, FLAG_THRESHOLD,
};
