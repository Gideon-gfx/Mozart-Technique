// Admin-authored "first 15 minutes" curriculum per subject category. Every
// lesson opens with this fixed, Mozart Technique-curated segment; whatever a
// tutor teaches after that is their own plan. The platform can't enforce
// timing on a lesson happening off-platform - its job is just to hand the
// tutor the required opening material when they log a session.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'curriculum.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function getForCategory(category) {
  const db = load();
  return db[category] || null;
}

function setForCategory(category, { title, notes, videoUrl, rewardType }) {
  const db = load();
  db[category] = {
    title: title || `${category} - Opening Segment`,
    notes: notes || '',
    videoUrl: videoUrl || '',
    // Only meaningful for the reserved ORIENTATION_KEY entry, where it picks
    // the one-time reward a tutor gets for completing orientation.
    rewardType: rewardType || null,
    updatedAt: new Date().toISOString(),
  };
  persist(db);
  return db[category];
}

// Orientation content/quiz reward isn't tied to a subject category, so it's
// stored under this reserved key in the same content store.
const ORIENTATION_KEY = '__orientation__';

module.exports = { getForCategory, setForCategory, ORIENTATION_KEY };
