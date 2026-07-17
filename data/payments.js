// A log of every successful course purchase. This didn't exist before -
// data/store.js only tracks *that* a user owns a course (purchasedCourses),
// not when they bought it or what it cost - so there was no way to compute
// real revenue-over-time. Every payment is appended here in addition to
// being recorded on the user.
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

function record({ userId, userName, courseId, courseTitle, category, priceUsd, method }) {
  const db = load();
  const payment = {
    id: db.nextId++,
    userId,
    userName,
    courseId,
    courseTitle,
    category,
    priceUsd,
    method: method || 'card',
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
