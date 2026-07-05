// Tutor applications. A user applies with their qualifications; an admin
// reviews and approves/rejects. Approval status is tracked here rather than
// as a user role, since a tutor can also be an enrolled student.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'tutors.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, tutors: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, tutors: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().tutors;
}

function listApproved() {
  return listAll().filter((t) => t.status === 'approved');
}

function findById(id) {
  return listAll().find((t) => t.id === Number(id)) || null;
}

function findByUserId(userId) {
  return listAll().find((t) => t.userId === userId) || null;
}

function apply({ userId, name, email, categories, levels, city, teachesOnline, phone, qualifications, experienceYears, bio, hourlyRateUsd }) {
  const db = load();
  const tutor = {
    id: db.nextId++,
    userId,
    name,
    email,
    categories: Array.isArray(categories) ? categories : [],
    levels: Array.isArray(levels) ? levels : [],
    city: city || null,
    teachesOnline: Boolean(teachesOnline),
    phone: phone || null,
    qualifications: qualifications || '',
    experienceYears: Number(experienceYears) || 0,
    hourlyRateUsd: Math.max(0, Number(hourlyRateUsd) || 0),
    bio: bio || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  db.tutors.push(tutor);
  persist(db);
  return tutor;
}

function setStatus(id, status) {
  const db = load();
  const tutor = db.tutors.find((t) => t.id === Number(id));
  if (!tutor) return null;
  tutor.status = status;
  tutor.reviewedAt = new Date().toISOString();
  persist(db);
  return tutor;
}

module.exports = { listAll, listApproved, findById, findByUserId, apply, setStatus };
