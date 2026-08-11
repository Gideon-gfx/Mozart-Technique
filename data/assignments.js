// Tutor requests and student<->tutor assignments. A student submits a
// request (subject + lesson type + location or online); an admin - acting
// as the middleman - matches it to an approved tutor, which activates the
// assignment. Both sides can see the match once active.
const fs = require('fs');
const path = require('path');
const { distanceKm, localityScore } = require('./geocode');
const tutors = require('./tutors');

const DATA_FILE = path.join(__dirname, 'assignments.json');
const IN_PERSON_RADIUS_KM = 10;

// Platform-set business rates the escrow math runs on. Change them here if
// the real business rates differ.
const TRAVEL_FEE_USD = 15; // flat per-lesson transportation fee (physical only), paid by the student on top of the lesson price
const PLATFORM_COMMISSION_RATE = 0.10; // Mozart Techniques' cut of the tutor's lesson price (not the travel fee)

const LESSON_TYPES = ['online', 'physical', 'studio'];

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, records: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, records: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().records;
}

function listForStudent(studentId) {
  return listAll().filter((r) => r.studentId === studentId);
}

function listForTutor(tutorId) {
  return listAll().filter((r) => r.tutorId === tutorId);
}

function findById(id) {
  return listAll().find((r) => r.id === Number(id)) || null;
}

// Every rating a tutor has ever received, with a comment, across every
// student they've taught - powers their public profile page. Only the
// student's first name is surfaced, not their full name or email.
function listReviewsForTutor(tutorId) {
  return listForTutor(Number(tutorId))
    .flatMap((r) => (r.sessions || []).map((s) => ({ session: s, category: r.category, studentName: r.studentName })))
    .filter(({ session }) => session.studentRating && session.studentRating.comment)
    .map(({ session, category, studentName }) => ({
      studentFirstName: (studentName || 'A student').split(' ')[0],
      category,
      score: session.studentRating.score,
      professionalism: session.studentRating.professionalism,
      comment: session.studentRating.comment,
      ratedAt: session.studentRating.ratedAt,
    }))
    .sort((a, b) => new Date(b.ratedAt) - new Date(a.ratedAt));
}

const LEVEL_ORDER = ['Beginner', 'Intermediate', 'Advanced', 'Professional', 'Virtuoso'];

// Scores an approved tutor's fit for a request: closer, better-rated, more
// professional, more experienced, and more productive tutors rank higher.
// Existing tutors earn their higher ranking through ratings/professionalism/
// lesson volume ("productivity"); brand-new tutors compete mainly on
// proximity and qualification match, per the "new teachers compensated by
// proximity + qualification" rule. For online requests there's no commute
// radius to check, but a same-city/region/country match still nudges the
// score - locality is a soft preference, never a hard filter, for online.
function scoreTutor(tutor, { category, genre, ageGroup, level, studentCoords, studentLocality, lessonType }) {
  if (!tutor.categories.includes(category)) return null;
  if (genre && tutor.genres && tutor.genres.length && !tutor.genres.includes(genre)) return null;
  if (ageGroup && tutor.ageGroups && tutor.ageGroups.length && !tutor.ageGroups.includes(ageGroup)) return null;

  const approvedLevel = tutor.approvedLevelByCategory && tutor.approvedLevelByCategory[category];
  if (level && approvedLevel && LEVEL_ORDER.indexOf(approvedLevel) < LEVEL_ORDER.indexOf(level)) return null;

  let dKm = null;
  let locality = 0;
  if (lessonType === 'online') {
    if (!tutor.teachesOnline) return null;
    // Location bridge: online lessons still can't cross a country boundary.
    // Only a hard filter when both sides actually have a resolved country -
    // missing data on either end falls back to the older soft-preference
    // behavior rather than silently excluding someone.
    const studentCountry = studentLocality && studentLocality.country;
    const tutorCountry = tutor.locality && tutor.locality.country;
    if (studentCountry && tutorCountry && String(studentCountry).trim().toLowerCase() !== String(tutorCountry).trim().toLowerCase()) {
      return null;
    }
    locality = localityScore(studentLocality, tutor.locality);
  } else {
    // physical = tutor travels to the student; studio = student travels to
    // the tutor. A tutor who only offers one venue can't fill a request for
    // the other.
    const venue = tutor.inPersonVenue || 'either';
    if (lessonType === 'physical' && venue === 'tutor_studio') return null;
    if (lessonType === 'studio' && venue === 'student_location') return null;

    const tutorCoords = (tutor.lat != null && tutor.lng != null) ? { lat: tutor.lat, lng: tutor.lng } : null;
    dKm = distanceKm(studentCoords, tutorCoords);
    if (dKm != null && dKm > (tutor.commuteRadiusKm || IN_PERSON_RADIUS_KM)) return null;
    if (dKm == null && !tutor.teachesOnline) return null; // no coords to compare and they don't offer a fallback online option
  }

  const avgRating = tutor.ratingCount ? tutor.ratingSum / tutor.ratingCount : 3.5; // neutral prior for untested tutors
  const avgProfessionalism = tutor.professionalismCount ? tutor.professionalismSum / tutor.professionalismCount : 3.5;
  const proximityScore = lessonType === 'online' ? locality : (dKm == null ? 0.5 : Math.max(0, 1 - dKm / IN_PERSON_RADIUS_KM));
  const qualificationScore = approvedLevel ? (LEVEL_ORDER.indexOf(approvedLevel) + 1) / LEVEL_ORDER.length : 0.3;
  const productivityScore = Math.min(1, (tutor.lessonsCompletedCount || 0) / 20);
  const bonus = tutor.orientationBonusPending ? 0.15 : 0;

  const score = avgRating / 5 * 0.3 + avgProfessionalism / 5 * 0.15 + proximityScore * 0.2
    + qualificationScore * 0.2 + productivityScore * 0.15 + bonus;
  return { score, distanceKm: dKm, avgRating, avgProfessionalism, localityScore: locality };
}

// Returns a scored, ranked shortlist of approved tutors for a request - the
// student picks preferences from this list, but the final call is always
// the admin's.
function generateCandidates({ category, genre, ageGroup, level, studentCoords, studentLocality, lessonType, limit = 6 }) {
  return tutors.listApproved()
    .map((tutor) => {
      const result = scoreTutor(tutor, { category, genre, ageGroup, level, studentCoords, studentLocality, lessonType });
      return result ? { tutor, ...result } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function createRequest({
  studentId, studentName, studentEmail, category, genre, ageGroup, desiredLevel,
  city, lessonType, phone, notes, preferredTutorIds, candidateIds, intakeResponses,
}) {
  const db = load();
  const record = {
    id: db.nextId++,
    studentId,
    studentName,
    studentEmail,
    category,
    genre: genre || null,
    ageGroup: ageGroup || null,
    desiredLevel: desiredLevel || null,
    city: city || null,
    lessonType: LESSON_TYPES.includes(lessonType) ? lessonType : 'online',
    phone: phone || null,
    notes: notes || '',
    preferredTutorIds: Array.isArray(preferredTutorIds) ? preferredTutorIds.map(Number) : [],
    candidateIds: Array.isArray(candidateIds) ? candidateIds : [],
    intakeResponses: Array.isArray(intakeResponses) ? intakeResponses : [],
    tutorId: null,
    tutorName: null,
    tutorEmail: null,
    tutorPhone: null,
    matchDistanceKm: null,
    meetingLink: null,
    scheduledAt: null,
    calendarEventId: null,
    status: 'pending', // pending -> active -> ended
    sessions: [],
    createdAt: new Date().toISOString(),
  };
  db.records.push(record);
  persist(db);
  return record;
}

// A tutor can still paste their own externally-created meeting link (Zoom,
// a personal Meet room, etc.) - not every tutor will have connected Google
// Calendar. scheduleSession() below is the preferred path when they have:
// a real Calendar event with an auto-generated Meet link and reminders.
function setMeetingLink(requestId, meetingLink) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  record.meetingLink = meetingLink || null;
  persist(db);
  return record;
}

// Records a real scheduled lesson: a Google Calendar event was created (see
// data/google-calendar.js) with an auto-generated Meet link, so meetingLink
// here IS that Meet link, not a manually pasted one.
function scheduleSession(requestId, { scheduledAt, meetingLink, calendarEventId }) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  record.scheduledAt = scheduledAt;
  record.meetingLink = meetingLink;
  record.calendarEventId = calendarEventId || null;
  persist(db);
  return record;
}

// Class recordings the tutor posts to the student after a lesson. Kept on
// the assignment (not on a specific logged session) so a tutor can share a
// recording without it being tied to escrow/payment state - the student
// just sees everything their tutor has posted for this subject.
function addRecording(requestId, { url, title, postedBy }) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  if (!record.recordings) record.recordings = [];
  const item = {
    id: record.recordings.reduce((max, r) => Math.max(max, r.id), 0) + 1,
    url,
    title,
    postedBy: postedBy || null,
    postedAt: new Date().toISOString(),
  };
  record.recordings.push(item);
  persist(db);
  return item;
}

function assignTutor(requestId, tutor, distKm) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  record.tutorId = tutor.id;
  record.tutorName = tutor.name;
  record.tutorEmail = tutor.email;
  record.tutorPhone = tutor.phone || null;
  record.matchDistanceKm = distKm != null ? Math.round(distKm * 10) / 10 : null;
  record.status = 'active';
  record.assignedAt = new Date().toISOString();
  persist(db);
  return record;
}

function endAssignment(requestId) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  record.status = 'ended';
  record.endedAt = new Date().toISOString();
  persist(db);
  return record;
}

// Logs one completed lesson: duration (for time-based pricing), the fixed
// curated opening segment the tutor used, their own notes, a recording
// (post-recorded online classes, or a physical/studio lesson recording),
// and the assignment they set (optionally tagging library clips). Reels are
// stored as a resolved {id,title,url} snapshot taken at logging time, so
// the lesson still shows what was actually assigned even if that library
// item is later replaced or marked broken.
//
// The tutor logging the session IS their completion attestation - payment
// is priced here and held until the student separately confirms
// (confirmSession) that the lesson actually happened. The student is
// charged priceUsd (lesson) + travelFeeUsd (physical lessons only, flat
// per-lesson fee - a pass-through, not part of Mozart Techniques' cut).
// Mozart Techniques' 10% commission comes out of the tutor's lesson price
// only, never the travel fee, so tutorPayoutUsd = totalUsd - platformFeeUsd.
function addSession(requestId, {
  curriculumTitle, teacherNotes, assignmentText, reels, recordingUrl, durationMinutes, hourlyRateUsd,
}) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  if (!record.sessions) record.sessions = [];

  const minutes = Math.max(0, Number(durationMinutes) || 0);
  const priceUsd = Math.round((Number(hourlyRateUsd) || 0) * (minutes / 60) * 100) / 100;
  const travelFeeUsd = record.lessonType === 'physical' ? TRAVEL_FEE_USD : 0;
  const totalUsd = Math.round((priceUsd + travelFeeUsd) * 100) / 100;
  const platformFeeUsd = Math.round(priceUsd * PLATFORM_COMMISSION_RATE * 100) / 100;
  const tutorPayoutUsd = Math.round((totalUsd - platformFeeUsd) * 100) / 100;

  const session = {
    id: (record.sessions.reduce((max, s) => Math.max(max, s.id), 0)) + 1,
    curriculumTitle: curriculumTitle || null,
    teacherNotes: teacherNotes || '',
    assignmentText: assignmentText || '',
    reels: Array.isArray(reels) ? reels.map((r) => ({ id: r.id, title: r.title, url: r.url })) : [],
    recordingUrl: recordingUrl || null,
    durationMinutes: minutes,
    priceUsd,
    travelFeeUsd,
    totalUsd,
    platformFeeUsd,
    tutorPayoutUsd,
    paymentStatus: 'held', // held -> released
    paymentIntentId: null, // set once a real Stripe hold is authorized - null means simulated/no card on file
    paymentError: null,
    studentConfirmedAt: null,
    releasedAt: null,
    loggedAt: new Date().toISOString(),
    studentRating: null,
    tutorRating: null,
  };
  record.sessions.push(session);
  persist(db);
  return session;
}

function setIntakeResponses(requestId, responses) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  record.intakeResponses = Array.isArray(responses) ? responses : [];
  persist(db);
  return record;
}

// Attaches the real Stripe PaymentIntent id (or a failure reason) to a
// just-logged session, once the caller has attempted to authorize the hold.
function setSessionPaymentIntent(requestId, sessionId, paymentIntentId, paymentError) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  const session = (record.sessions || []).find((s) => s.id === Number(sessionId));
  if (!session) return null;
  session.paymentIntentId = paymentIntentId || null;
  session.paymentError = paymentError || null;
  persist(db);
  return session;
}

// The student's attestation that the lesson happened as logged - releases
// the held payment. Returns the updated session (with pricing) so the
// caller can credit the tutor's balance and log the release; refuses to
// double-release the same session.
function confirmSession(requestId, sessionId) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  const session = (record.sessions || []).find((s) => s.id === Number(sessionId));
  if (!session || session.paymentStatus === 'released') return null;
  session.paymentStatus = 'released';
  session.studentConfirmedAt = new Date().toISOString();
  session.releasedAt = session.studentConfirmedAt;
  persist(db);
  return { record, session };
}

function rateSession(requestId, sessionId, role, { score, professionalism, comment }) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  const session = (record.sessions || []).find((s) => s.id === Number(sessionId));
  if (!session) return null;
  const rating = { score: Number(score), professionalism: professionalism != null ? Number(professionalism) : null, comment: comment || '', ratedAt: new Date().toISOString() };
  if (role === 'student') session.studentRating = rating; // student rates the tutor
  else session.tutorRating = rating; // tutor rates the student
  persist(db);
  return session;
}

module.exports = {
  listAll, listForStudent, listForTutor, findById, createRequest, assignTutor, endAssignment,
  generateCandidates, addSession, confirmSession, setSessionPaymentIntent, rateSession, setMeetingLink, scheduleSession, addRecording, listReviewsForTutor,
  setIntakeResponses,
  LEVEL_ORDER, LESSON_TYPES, TRAVEL_FEE_USD, PLATFORM_COMMISSION_RATE,
};
