// Course completion certificates. Issued automatically the moment a student
// finishes a course (either by completing all lessons directly, or by
// passing the final quiz). Each certificate has a random verification code
// that resolves on a public, no-login page - so a certificate can be shared
// or checked by anyone, the way a real credential works.
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
