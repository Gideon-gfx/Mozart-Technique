// Part 2.2/2.4: a teacher's submitted external credential (ABRSM, Trinity,
// MUSON, ...), pending admin verification against credentialCrosswalk.js.
// The submission record doubles as the review-queue item (status==='pending'
// is what the admin review screen lists) rather than a separate queue
// table - same shape every other admin-review feature in this app already
// uses (e.g. tutor applications in data/tutors.js).
const fs = require('fs');
const path = require('path');
const crosswalk = require('./credentialCrosswalk');
const tiers = require('./teachingTiers');

const DATA_FILE = path.join(__dirname, 'externalCredentials.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, submissions: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, submissions: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().submissions;
}

function listForTutor(tutorId) {
  return load().submissions.filter((s) => s.tutorId === Number(tutorId));
}

function listPending() {
  return load().submissions.filter((s) => s.status === 'pending');
}

function findById(id) {
  return load().submissions.find((s) => s.id === Number(id)) || null;
}

function submit({ tutorId, crosswalkId, evidenceUrl, issuingBodyRef }) {
  const row = crosswalk.findById(crosswalkId);
  if (!row) return null;
  const db = load();
  const submission = {
    id: db.nextId++,
    tutorId: Number(tutorId),
    crosswalkId: Number(crosswalkId),
    // Snapshot the crosswalk row's own text at submission time too, so the
    // review screen still shows what the teacher actually claimed even if
    // an admin edits/deactivates that row later.
    crosswalkSnapshot: { body: row.body, credentialName: row.credentialName, bodysOwnAnchor: row.bodysOwnAnchor, verificationMethod: row.verificationMethod },
    evidenceUrl: evidenceUrl || null,
    issuingBodyRef: issuingBodyRef || null,
    status: 'pending',
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
    // Only set once verified - the actual point-in-time award (spec 3.1/3.6).
    mtPointsAwarded: null,
    proposedTierAwarded: null,
    crosswalkRowVersionAwarded: null,
    expiresAt: null,
    submittedAt: new Date().toISOString(),
  };
  db.submissions.push(submission);
  persist(db);
  return submission;
}

function verify(id, adminUserId, { note, expiresAt } = {}) {
  const db = load();
  const submission = db.submissions.find((s) => s.id === Number(id));
  if (!submission) return null;
  const row = crosswalk.findById(submission.crosswalkId);
  submission.status = 'verified';
  submission.reviewedByUserId = Number(adminUserId);
  submission.reviewedAt = new Date().toISOString();
  submission.reviewNote = note || null;
  submission.mtPointsAwarded = row ? row.mtPoints : 0;
  submission.proposedTierAwarded = row ? row.proposedTier : null;
  submission.crosswalkRowVersionAwarded = row ? row.rowVersion : null;
  submission.expiresAt = expiresAt || null;
  persist(db);
  return submission;
}

function reject(id, adminUserId, reason) {
  const db = load();
  const submission = db.submissions.find((s) => s.id === Number(id));
  if (!submission) return null;
  submission.status = 'rejected';
  submission.reviewedByUserId = Number(adminUserId);
  submission.reviewedAt = new Date().toISOString();
  submission.reviewNote = reason || null;
  persist(db);
  return submission;
}

function requestMoreEvidence(id, adminUserId, note) {
  const db = load();
  const submission = db.submissions.find((s) => s.id === Number(id));
  if (!submission) return null;
  submission.status = 'pending';
  submission.reviewedByUserId = Number(adminUserId);
  submission.reviewedAt = new Date().toISOString();
  submission.reviewNote = note || 'More evidence requested.';
  persist(db);
  return submission;
}

// Sweeps verified submissions past their own expiry into 'expired' - called
// lazily wherever a tutor's points are computed (tierEngine.js), same
// pattern as every other lazy-expiry check in this app.
function expireOverdue() {
  const db = load();
  const now = Date.now();
  let changed = false;
  db.submissions.forEach((s) => {
    if (s.status === 'verified' && s.expiresAt && new Date(s.expiresAt).getTime() < now) {
      s.status = 'expired';
      changed = true;
    }
  });
  if (changed) persist(db);
}

// A verified submission's points, capped so it alone can't cross more than
// one tier band above wherever the tutor's MT-native standing already puts
// them (spec 3.4) - anything past that gets clamped to the one-tier-jump
// ceiling and flagged so tierEngine.js can route the rest to practicum
// review instead of granting it outright.
function cappedPoints(submission, tutorNativeTierCode) {
  if (submission.status !== 'verified') return { points: 0, capped: false };
  const nativeTier = tiers.findByCode(tutorNativeTierCode) || tiers.TEACHING_TIERS[0];
  const ceilingTier = tiers.TEACHING_TIERS.find((t) => t.rank === Math.min(nativeTier.rank + 1, 4)) || nativeTier;
  const ceilingPoints = ceilingTier.mtPointsFloor;
  const raw = submission.mtPointsAwarded || 0;
  if (raw <= ceilingPoints) return { points: raw, capped: false };
  return { points: ceilingPoints, capped: true, requiresPracticum: true };
}

module.exports = { listAll, listForTutor, listPending, findById, submit, verify, reject, requestMoreEvidence, expireOverdue, cappedPoints };
