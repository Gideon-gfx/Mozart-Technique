// Requests submitted from the public /delete-account page (required by the
// Google Play Data Safety section for any app that supports account
// creation - it must link to a page describing how to request deletion,
// reachable without being logged in or having the app installed). Deletion
// itself is handled manually by the team rather than an automatic purge, so
// this is just a durable, admin-visible queue of who asked and when -
// mirrors the plain load/persist JSON pattern used by marketplaceRequests.js.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'accountDeletionRequests.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, requests: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, requests: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function create({ userId, name, email, reason }) {
  const db = load();
  const request = {
    id: db.nextId++,
    userId: userId || null,
    name: String(name || '').trim().slice(0, 160),
    email: String(email || '').trim().toLowerCase().slice(0, 200),
    reason: String(reason || '').trim().slice(0, 1000),
    status: 'pending', // pending | completed
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  db.requests.push(request);
  persist(db);
  return request;
}

function markCompleted(id) {
  const db = load();
  const request = db.requests.find((r) => r.id === Number(id));
  if (!request) return null;
  request.status = 'completed';
  request.completedAt = new Date().toISOString();
  persist(db);
  return request;
}

module.exports = { listAll, create, markCompleted };
