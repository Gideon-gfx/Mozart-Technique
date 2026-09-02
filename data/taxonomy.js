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

module.exports = { SUBJECTS: loadSubjects(), GENRES, AGE_GROUPS, LEVELS, levelForScore, loadSubjects, addSubject };
