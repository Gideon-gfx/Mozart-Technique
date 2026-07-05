// Tutor requests and student<->tutor assignments. A student submits a
// request (subject + location or online); an admin - acting as the
// middleman - matches it to an approved tutor, which activates the
// assignment. Both sides can see the match once active.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'assignments.json');

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

function createRequest({ studentId, studentName, studentEmail, category, city, online, phone, notes, preferredTutorId }) {
  const db = load();
  const record = {
    id: db.nextId++,
    studentId,
    studentName,
    studentEmail,
    category,
    city: city || null,
    online: Boolean(online),
    phone: phone || null,
    notes: notes || '',
    preferredTutorId: preferredTutorId || null,
    tutorId: null,
    tutorName: null,
    tutorEmail: null,
    tutorPhone: null,
    status: 'pending', // pending -> active -> ended
    createdAt: new Date().toISOString(),
  };
  db.records.push(record);
  persist(db);
  return record;
}

function assignTutor(requestId, tutor) {
  const db = load();
  const record = db.records.find((r) => r.id === Number(requestId));
  if (!record) return null;
  record.tutorId = tutor.id;
  record.tutorName = tutor.name;
  record.tutorEmail = tutor.email;
  record.tutorPhone = tutor.phone || null;
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

module.exports = { listAll, listForStudent, listForTutor, findById, createRequest, assignTutor, endAssignment };
