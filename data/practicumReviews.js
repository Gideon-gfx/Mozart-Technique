// Part 3.5: the practicum floor neither path (MT-native or external
// credential) can substitute for - a reviewed teaching-evidence submission
// (video + lesson plan + student outcome note) required before Advanced or
// Professional tier actually unlocks. Deliberately its OWN data module,
// not a reuse of data/assignments.js (that's real tutor-student lesson
// bookings, a different concept entirely - reusing it here would have
// mixed practicum review rows into live lesson data).
//
// Reviewed through the same admin screen as externalCredentials.js's
// pending submissions (Part 2.4's "one shared review queue for both"), by
// composing the two lists in the API layer rather than merging the tables.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'practicumReviews.json');

const STAGES = ['advanced_specialist', 'professional'];

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, reviews: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, reviews: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().reviews;
}

function listForTutor(tutorId) {
  return load().reviews.filter((r) => r.tutorId === Number(tutorId));
}

function listPending() {
  return load().reviews.filter((r) => r.status === 'pending');
}

function findById(id) {
  return load().reviews.find((r) => r.id === Number(id)) || null;
}

function submit({ tutorId, stage, videoUrl, lessonPlanUrl, outcomeNote }) {
  if (!STAGES.includes(stage)) return null;
  const db = load();
  const review = {
    id: db.nextId++,
    tutorId: Number(tutorId),
    stage,
    videoUrl: videoUrl || null,
    lessonPlanUrl: lessonPlanUrl || null,
    outcomeNote: outcomeNote || null,
    status: 'pending',
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
    submittedAt: new Date().toISOString(),
  };
  db.reviews.push(review);
  persist(db);
  return review;
}

function approve(id, adminUserId, note) {
  const db = load();
  const review = db.reviews.find((r) => r.id === Number(id));
  if (!review) return null;
  review.status = 'passed';
  review.reviewedByUserId = Number(adminUserId);
  review.reviewedAt = new Date().toISOString();
  review.reviewNote = note || null;
  persist(db);
  return review;
}

function reject(id, adminUserId, reason) {
  const db = load();
  const review = db.reviews.find((r) => r.id === Number(id));
  if (!review) return null;
  review.status = 'rejected';
  review.reviewedByUserId = Number(adminUserId);
  review.reviewedAt = new Date().toISOString();
  review.reviewNote = reason || null;
  persist(db);
  return review;
}

// Has this tutor ever passed a review at this stage - tierEngine.js's
// +20pts "Advanced-Specialist practicum passed" / "Professional
// cohort/mentorship signed off" inputs (spec 3.4).
function hasPassedStage(tutorId, stage) {
  return listForTutor(tutorId).some((r) => r.stage === stage && r.status === 'passed');
}

module.exports = { STAGES, listAll, listForTutor, listPending, findById, submit, approve, reject, hasPassedStage };
