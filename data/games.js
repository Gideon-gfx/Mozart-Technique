// Classroom mini-games - one game session record per completed round. Kept
// deliberately generic (gameType field) so a second game can reuse this
// same table later without a schema change.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'games.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, sessions: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, sessions: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function recordSession({ orgId, studentUserId, studentName, gameType, tier, score, correctCount, totalCount }) {
  const db = load();
  const session = {
    id: db.nextId++,
    orgId: orgId || null,
    studentUserId,
    studentName,
    gameType,
    tier,
    score,
    correctCount,
    totalCount,
    playedAt: new Date().toISOString(),
  };
  db.sessions.push(session);
  persist(db);
  return session;
}

function listForOrg(orgId) {
  return load().sessions
    .filter((s) => Number(s.orgId) === Number(orgId))
    .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
}

function listForStudent(studentUserId) {
  return load().sessions
    .filter((s) => Number(s.studentUserId) === Number(studentUserId))
    .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
}

module.exports = { recordSession, listForOrg, listForStudent };
