// User-initiated reports (a chat participant flagging another user to
// admin) - distinct from the existing automatic rating-based flags in
// data/store.js (MIN_RATINGS_BEFORE_FLAG/FLAG_THRESHOLD), which fire on
// their own from a low rolling rating average rather than a person
// explicitly reporting someone.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'reports.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, reports: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, reports: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function create({ reporterId, reportedUserId, threadKey, reason }) {
  const db = load();
  const report = {
    id: db.nextId++,
    reporterId,
    reportedUserId,
    threadKey: threadKey || null,
    reason: String(reason || '').trim(),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  db.reports.push(report);
  persist(db);
  return report;
}

function setStatus(id, status) {
  const db = load();
  const report = db.reports.find((r) => r.id === Number(id));
  if (!report) return null;
  report.status = status;
  persist(db);
  return report;
}

module.exports = { listAll, create, setStatus };
