// A log of every released lesson payment (escrow held -> student confirms
// -> released to tutor). data/tutors.js tracks each tutor's running balance;
// this is the flat historical ledger admin analytics reads from to compute
// real revenue-over-time, since there'd otherwise be no way to know when a
// payment happened or what it was for.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'payments.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, payments: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, payments: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function record({ studentId, studentName, tutorId, tutorName, category, lessonType, priceUsd, platformFeeUsd, tutorPayoutUsd, assignmentId, sessionId }) {
  const db = load();
  const payment = {
    id: db.nextId++,
    studentId,
    studentName,
    tutorId,
    tutorName,
    category,
    lessonType,
    priceUsd, // total charged to the student (lesson + travel fee)
    platformFeeUsd: platformFeeUsd || 0, // Mozart Techniques' 10% commission
    tutorPayoutUsd: tutorPayoutUsd != null ? tutorPayoutUsd : priceUsd, // what actually lands in the tutor's balance
    assignmentId,
    sessionId,
    createdAt: new Date().toISOString(),
  };
  db.payments.push(payment);
  persist(db);
  return payment;
}

function listAll() {
  return load().payments;
}

module.exports = { record, listAll };
