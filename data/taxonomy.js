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
  'Composition', 'Form & Analysis', 'Conducting', 'Music Theory', 'Dance',
  // Studio
  'DJing', 'Production',
];

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

module.exports = { SUBJECTS, GENRES, AGE_GROUPS, LEVELS, levelForScore };
