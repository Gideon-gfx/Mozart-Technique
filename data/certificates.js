// Legacy course-completion certificates from when the platform sold
// packaged video courses. That product is gone, so issue() is no longer
// called from anywhere - but any certificate already earned stays
// verifiable at its code, the way a real credential would.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'certificates.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, certificates: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, certificates: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listForUser(userId) {
  return load().certificates.filter((c) => c.userId === userId);
}

function findByCode(code) {
  return load().certificates.find((c) => c.code === code) || null;
}

function findExisting(userId, courseId) {
  return load().certificates.find((c) => c.userId === userId && c.courseId === courseId) || null;
}

// Idempotent - a student can only earn one certificate per course, no
// matter how many times completion fires (e.g. retaking after a quiz fail).
function issue({ userId, userName, courseId, courseTitle, category, level }) {
  const existing = findExisting(userId, courseId);
  if (existing) return existing;

  const db = load();
  const certificate = {
    id: db.nextId++,
    code: crypto.randomBytes(8).toString('hex'),
    userId,
    userName,
    courseId,
    courseTitle,
    category,
    level,
    issuedAt: new Date().toISOString(),
  };
  db.certificates.push(certificate);
  persist(db);
  return certificate;
}

module.exports = { listForUser, findByCode, findExisting, issue };
