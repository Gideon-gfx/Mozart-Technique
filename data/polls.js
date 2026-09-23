// One-off, admin-broadcast opinion polls - separate from the Tutor/
// Performer Orientation modals (mandatory, role-gated, one screen each) and
// from Orientation Updates' quiz questions (graded, audience-scoped). A
// poll here has no "correct" answer, goes to every signed-in user
// regardless of role, and each person sees it as a single popup exactly
// once (whether they answer it or dismiss it) - see nextForUser/markSeen.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'polls.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, polls: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, polls: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().polls;
}

function findById(id) {
  return load().polls.find((p) => p.id === Number(id)) || null;
}

function create({ question, options, createdByUserId }) {
  const db = load();
  const poll = {
    id: db.nextId++,
    question,
    options,
    createdByUserId,
    createdAt: new Date().toISOString(),
    active: true,
    // { userId, optionIndex, respondedAt } - one entry per user, at most.
    responses: [],
    // Every user who's had this poll shown to them, whether they answered
    // or dismissed it - the single source of truth for "never show again".
    seenByUserIds: [],
  };
  db.polls.unshift(poll);
  persist(db);
  return poll;
}

function close(id) {
  const db = load();
  const poll = db.polls.find((p) => p.id === Number(id));
  if (!poll) return null;
  poll.active = false;
  persist(db);
  return poll;
}

function remove(id) {
  const db = load();
  const before = db.polls.length;
  db.polls = db.polls.filter((p) => p.id !== Number(id));
  persist(db);
  return db.polls.length < before;
}

// The oldest active poll this user hasn't seen yet, so an earlier poll
// always surfaces before a newer one instead of getting buried by it.
function nextForUser(userId) {
  const candidates = load().polls.filter((p) => p.active && !p.seenByUserIds.includes(Number(userId)));
  if (!candidates.length) return null;
  return candidates.reduce((oldest, p) => (new Date(p.createdAt) < new Date(oldest.createdAt) ? p : oldest));
}

function markSeen(id, userId) {
  const db = load();
  const poll = db.polls.find((p) => p.id === Number(id));
  if (!poll) return null;
  if (!poll.seenByUserIds.includes(Number(userId))) poll.seenByUserIds.push(Number(userId));
  persist(db);
  return poll;
}

function respond(id, userId, optionIndex) {
  const db = load();
  const poll = db.polls.find((p) => p.id === Number(id));
  if (!poll) return null;
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) return null;
  if (!poll.responses.some((r) => r.userId === Number(userId))) {
    poll.responses.push({ userId: Number(userId), optionIndex, respondedAt: new Date().toISOString() });
  }
  if (!poll.seenByUserIds.includes(Number(userId))) poll.seenByUserIds.push(Number(userId));
  persist(db);
  return poll;
}

// Admin-facing shape: aggregate counts only, never who answered what - the
// per-user identities in `responses`/`seenByUserIds` exist purely to
// enforce one-response and one-showing, not for admin display.
function results(poll) {
  const counts = poll.options.map(() => 0);
  poll.responses.forEach((r) => {
    if (counts[r.optionIndex] !== undefined) counts[r.optionIndex] += 1;
  });
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options,
    active: poll.active,
    createdAt: poll.createdAt,
    counts,
    totalResponses: poll.responses.length,
    totalSeen: poll.seenByUserIds.length,
  };
}

module.exports = { listAll, findById, create, close, remove, nextForUser, markSeen, respond, results };
