// Tutor requests and student<->tutor assignments. A student submits a
// request (subject + location or online); an admin - acting as the
// middleman - matches it to an approved tutor, which activates the
// assignment. Both sides can see the match once active.
const fs = require('fs');
const path = require('path');
const { distanceKm, localityScore } = require('./geocode');
const tutors = require('./tutors');

const DATA_FILE = path.join(__dirname, 'assignments.json');
const IN_PERSON_RADIUS_KM = 10;

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
function scoreTutor(tutor, { category, genre, ageGroup, level, studentCoords, studentLocality, online }) {
  if (!tutor.categories.includes(category)) return null;
  if (genre && tutor.genres && tutor.genres.length && !tutor.genres.includes(genre)) return null;
  if (ageGroup && tutor.ageGroups && tutor.ageGroups.length && !tutor.ageGroups.includes(ageGroup)) return null;

  const approvedLevel = tutor.approvedLevelByCategory && tutor.approvedLevelByCategory[category];
  if (level && approvedLevel && LEVEL_ORDER.indexOf(approvedLevel) < LEVEL_ORDER.indexOf(level)) return null;

  let dKm = null;
  let locality = 0;
  if (!online) {
    const tutorCoords = (tutor.lat != null && tutor.lng != null) ? { lat: tutor.lat, lng: tutor.lng } : null;
    dKm = distanceKm(studentCoords, tutorCoords);
    if (dKm != null && dKm > (tutor.commuteRadiusKm || IN_PERSON_RADIUS_KM)) return null;
    if (dKm == null && !tutor.teachesOnline) return null; // no coords to compare and they don't offer a fallback online option
  } else {
    if (!tutor.teachesOnline) return null;
    locality = localityScore(studentLocality, tutor.locality);
  }

  const avgRating = tutor.ratingCount ? tutor.ratingSum / tutor.ratingCount : 3.5; // neutral prior for untested tutors
  const avgProfessionalism = tutor.professionalismCount ? tutor.professionalismSum / tutor.professionalismCount : 3.5;
  const proximityScore = online ? locality : (dKm == null ? 0.5 : Math.max(0, 1 - dKm / IN_PERSON_RADIUS_KM));
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
function generateCandidates({ category, genre, ageGroup, level, studentCoords, studentLocality, online, limit = 6 }) {
  return tutors.listApproved()
    .map((tutor) => {
      const result = scoreTutor(tutor, { category, genre, ageGroup, level, studentCoords, studentLocality, online });
      return result ? { tutor, ...result } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function createRequest({
  studentId, studentName, studentEmail, category, genre, ageGroup, desiredLevel,
  city, online, phone, notes, preferredTutorIds, candidateIds,
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
    online: Boolean(online),
    phone: phone || null,
    notes: notes || '',
    preferredTutorIds: Array.isArray(preferredTutorIds) ? preferredTutorIds.map(Number) : [],
    candidateIds: Array.isArray(candidateIds) ? candidateIds : [],
    tutorId: null,
    tutorName: null,
    tutorEmail: null,
    tutorPhone: null,
    matchDistanceKm: null,
    meetingLink: null,
    status: 'pending', // pending -> active -> ended
    sessions: [],
    createdAt: new Date().toISOString(),
  };
  db.records.push(record);
  persist(db);
  return record;
}

// The tutor sets/updates their own externally-created meeting link (Zoom,
// Google Meet, etc.) for online lessons - the platform doesn't create or
// host meetings itself.
function setMeetingLink(requestId, meetingLink) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  record.meetingLink = meetingLink || null;
  persist(db);
  return record;
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

// Logs one completed lesson: the fixed curated opening segment the tutor
// used, their own notes, and the assignment they set (optionally tagging
// technique reels). Reels are stored as a resolved {id,title,url} snapshot
// taken at logging time, so the assignment still shows what was actually
// assigned even if that reel is later replaced or marked broken. Triggers
// the two-way rating prompt.
function addSession(requestId, { curriculumTitle, teacherNotes, assignmentText, reels }) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  if (!record.sessions) record.sessions = [];
  const session = {
    id: (record.sessions.reduce((max, s) => Math.max(max, s.id), 0)) + 1,
    curriculumTitle: curriculumTitle || null,
    teacherNotes: teacherNotes || '',
    assignmentText: assignmentText || '',
    reels: Array.isArray(reels) ? reels.map((r) => ({ id: r.id, title: r.title, url: r.url })) : [],
    loggedAt: new Date().toISOString(),
    studentRating: null,
    tutorRating: null,
  };
  record.sessions.push(session);
  persist(db);
  return session;
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
  generateCandidates, addSession, rateSession, setMeetingLink, listReviewsForTutor, LEVEL_ORDER,
};
