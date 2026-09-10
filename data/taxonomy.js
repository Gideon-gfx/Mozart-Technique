// Shared vocabulary for the tutor marketplace: subjects, musical genres,
// student age bands, and the 5-tier skill ladder used for placement/
// qualification.
const SUBJECTS = [
  // Keyboard & voice
  'Piano', 'Organ', 'Vocals', 'Choral Techniques',
  // Strings
  'Violin', 'Viola', 'Cello', 'Double Bass', 'Guitar',
  // Woodwind
  'Flute', 'Piccolo', 'Recorder', 'Clarinet', 'Saxophone', 'Oboe', 'Bassoon',
  // Brass
  'Trumpet', 'Trombone', 'French Horn', 'Tuba', 'Flugel Horn', 'Euphonium',
  // Percussion
  'Drums', 'Xylophone', 'Talking Drum', 'Percussive Instruments (Native)',
  // Study & performance
  'Composition', 'Form & Analysis', 'Conducting', 'Music Theory and Extra Curricula Activities', 'Music History', 'Dance',
  // Studio
  'DJing', 'Production',
];

const fs = require('fs');
const path = require('path');

const SUBJECTS_FILE = path.join(__dirname, 'subjects.json');

function loadSubjects() {
  try {
    if (!fs.existsSync(SUBJECTS_FILE)) return SUBJECTS.slice();
    const saved = JSON.parse(fs.readFileSync(SUBJECTS_FILE, 'utf8'));
    return Array.isArray(saved.subjects) && saved.subjects.length ? saved.subjects : SUBJECTS.slice();
  } catch {
    return SUBJECTS.slice();
  }
}

function saveSubjects(subjects) {
  const unique = [...new Set(subjects.map((subject) => String(subject).trim()).filter(Boolean))];
  fs.writeFileSync(SUBJECTS_FILE, JSON.stringify({ subjects: unique }, null, 2));
  return unique;
}

function addSubject(subject) {
  const updated = saveSubjects([...loadSubjects(), subject]);
  SUBJECTS.splice(0, SUBJECTS.length, ...updated);
  return SUBJECTS.slice();
}

const GENRES = ['Classical', 'Jazz', 'Musical Theatre', 'Gospel', 'Folk', 'Pop', 'Rock', 'World Music'];

const AGE_GROUPS = [
  { id: 'kid', label: 'Kids (up to 14)' },
  { id: 'adult', label: 'Adults (15+)' },
];

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Professional', 'Virtuoso'];

// Maps a 0..1 quiz score to a suggested rung on the ladder. Used for both a
// student's placement quiz and a tutor's qualification evaluation - in both
// cases the quiz result is a starting point, not the final word (a teacher's
// first-lesson evaluation can override a student's placement).
function levelForScore(score) {
  if (score >= 0.95) return 'Virtuoso';
  if (score >= 0.80) return 'Professional';
  if (score >= 0.60) return 'Advanced';
  if (score >= 0.40) return 'Intermediate';
  return 'Beginner';
}

// Performance Marketplace vocabulary - same admin-appendable-list shape as
// SUBJECTS above, for performer categories and event types. Callers should
// prefer loadPerformerCategories()/loadEventTypes() (always a fresh disk
// read) over the static PERFORMER_CATEGORIES/EVENT_TYPES exports below,
// which - like the SUBJECTS export above - only reflect what was on disk
// when this module was first required, not any addPerformerCategory/
// addEventType call made since.
const PERFORMER_CATEGORIES_DEFAULT = [
  'Solo Musician', 'Live Band', 'DJ', 'Solo Vocalist', 'Dance Troupe', 'Theater Actor', 'MC / Host', 'Comedian',
];
const EVENT_TYPES_DEFAULT = [
  'Wedding', 'Corporate Event', 'Birthday Party', 'Concert', 'Private Party', 'Festival', 'Religious Ceremony', 'Other',
];

const PERFORMER_CATEGORIES_FILE = path.join(__dirname, 'performer-categories.json');
const EVENT_TYPES_FILE = path.join(__dirname, 'event-types.json');

function loadPerformerCategories() {
  try {
    if (!fs.existsSync(PERFORMER_CATEGORIES_FILE)) return PERFORMER_CATEGORIES_DEFAULT.slice();
    const saved = JSON.parse(fs.readFileSync(PERFORMER_CATEGORIES_FILE, 'utf8'));
    return Array.isArray(saved.categories) && saved.categories.length ? saved.categories : PERFORMER_CATEGORIES_DEFAULT.slice();
  } catch {
    return PERFORMER_CATEGORIES_DEFAULT.slice();
  }
}

function savePerformerCategories(categories) {
  const unique = [...new Set(categories.map((c) => String(c).trim()).filter(Boolean))];
  fs.writeFileSync(PERFORMER_CATEGORIES_FILE, JSON.stringify({ categories: unique }, null, 2));
  return unique;
}

function addPerformerCategory(category) {
  return savePerformerCategories([...loadPerformerCategories(), category]);
}

function loadEventTypes() {
  try {
    if (!fs.existsSync(EVENT_TYPES_FILE)) return EVENT_TYPES_DEFAULT.slice();
    const saved = JSON.parse(fs.readFileSync(EVENT_TYPES_FILE, 'utf8'));
    return Array.isArray(saved.eventTypes) && saved.eventTypes.length ? saved.eventTypes : EVENT_TYPES_DEFAULT.slice();
  } catch {
    return EVENT_TYPES_DEFAULT.slice();
  }
}

function saveEventTypes(eventTypes) {
  const unique = [...new Set(eventTypes.map((e) => String(e).trim()).filter(Boolean))];
  fs.writeFileSync(EVENT_TYPES_FILE, JSON.stringify({ eventTypes: unique }, null, 2));
  return unique;
}

function addEventType(eventType) {
  return saveEventTypes([...loadEventTypes(), eventType]);
}

module.exports = {
  SUBJECTS: loadSubjects(), GENRES, AGE_GROUPS, LEVELS, levelForScore, loadSubjects, addSubject,
  PERFORMER_CATEGORIES: loadPerformerCategories(), loadPerformerCategories, addPerformerCategory,
  EVENT_TYPES: loadEventTypes(), loadEventTypes, addEventType,
};
