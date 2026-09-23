// The footer newsletter form (public/assets/footer.js) - previously just
// `onsubmit="return false;"` with no backend at all. Deliberately simple:
// one email list, no double opt-in/unsubscribe token yet (add those
// alongside a real unsubscribe route when this grows beyond a first pass).
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'newsletter.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { subscribers: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { subscribers: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().subscribers;
}

// Idempotent - resubmitting an already-subscribed email is a normal,
// expected case (someone re-checks the footer form) and should still
// resolve as a successful subscription, not an error.
function subscribe(email) {
  const db = load();
  const normalized = String(email).trim().toLowerCase();
  const existing = db.subscribers.find((s) => s.email === normalized);
  if (existing) return { subscriber: existing, alreadySubscribed: true };
  const subscriber = { email: normalized, subscribedAt: new Date().toISOString() };
  db.subscribers.push(subscriber);
  persist(db);
  return { subscriber, alreadySubscribed: false };
}

module.exports = { listAll, subscribe };
