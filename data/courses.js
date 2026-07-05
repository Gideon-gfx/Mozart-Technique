// Server-side course catalog. Mirrors the ids used in courses.html so
// /payment/:id and /video/:id can validate and price purchases without
// trusting anything the client sends. Also backs the public course-detail
// page, so descriptions live here rather than only in courses.html.
const COURSES = [
  { id: 101, title: 'Classical Piano Beginner', category: 'Piano', level: 'Beginner', price: 12, purchasable: true, description: 'Master foundational piano techniques and read your first sheet music.' },
  { id: 102, title: 'Classical Piano Intermediate', category: 'Piano', level: 'Intermediate', price: 18, purchasable: true, description: 'Advance your sight-reading and explore intermediate repertoire.' },
  { id: 103, title: 'Classical Piano Professional', category: 'Piano', level: 'Professional', price: 25, purchasable: true, description: 'In-depth study of concerto performance and advanced technical proficiency.' },

  { id: 201, title: 'Vocals Beginner', category: 'Vocals', level: 'Beginner', price: 10, purchasable: true, description: 'Learn basic breath control, posture, and simple vocal warm-ups.' },
  { id: 202, title: 'Vocals Intermediate', category: 'Vocals', level: 'Intermediate', price: 16, purchasable: true, description: 'Develop pitch control, dynamics, and expand your vocal range.' },
  { id: 203, title: 'Vocals Professional', category: 'Vocals', level: 'Professional', price: 22, purchasable: true, description: 'Master studio techniques, stage presence, and complex repertoire.' },

  { id: 301, title: 'Ballet Beginner', category: 'Dance', level: 'Beginner', price: 10, purchasable: true, description: 'Introduction to foundational ballet positions and barre exercises.' },
  { id: 302, title: 'Ballet Intermediate', category: 'Dance', level: 'Intermediate', price: 15, purchasable: true, description: 'Focus on centre work, simple turns, and choreography integration.' },
  { id: 303, title: 'Ballet Professional', category: 'Dance', level: 'Professional', price: 20, purchasable: true, description: 'Advanced pointe work, complex variations, and audition preparation.' },

  { id: 304, title: 'Hip Hop Dance Beginner', category: 'Dance', level: 'Beginner', price: 10, purchasable: true, description: 'Learn basic grooves, body isolations, and simple routines.' },
  { id: 305, title: 'Hip Hop Dance Intermediate', category: 'Dance', level: 'Intermediate', price: 15, purchasable: true, description: 'Focus on complex rhythm, musicality, and developing your personal style.' },
  { id: 306, title: 'Hip Hop Dance Professional', category: 'Dance', level: 'Professional', price: 20, purchasable: true, description: 'Choreography creation, freestyle techniques, and stage performance readiness.' },

  { id: 307, title: 'Tap Dance Beginner', category: 'Dance', level: 'Beginner', price: 10, purchasable: true, description: 'First steps in tap: shuffles, flaps, and basic time steps.' },
  { id: 308, title: 'Tap Dance Intermediate', category: 'Dance', level: 'Intermediate', price: 15, purchasable: true, description: 'Complex rhythm patterns, riffs, and creating intricate sounds.' },
  { id: 309, title: 'Tap Dance Professional', category: 'Dance', level: 'Professional', price: 20, purchasable: true, description: 'Advanced rhythmic structures, improvisation, and stage routines.' },

  { id: 310, title: 'Salsa Dancing Beginner', category: 'Dance', level: 'Beginner', price: 10, purchasable: true, description: 'Learn the basic step, lead/follow fundamentals, and simple turns.' },
  { id: 311, title: 'Salsa Dancing Intermediate', category: 'Dance', level: 'Intermediate', price: 15, purchasable: true, description: 'Cross body leads, complex shines, and turn patterns.' },
  { id: 312, title: 'Salsa Dancing Professional', category: 'Dance', level: 'Professional', price: 20, purchasable: true, description: 'Master acrobatics, body movement, and performance skills.' },

  { id: 401, title: 'Guitar Beginner', category: 'Guitar', level: 'Beginner', price: 12, purchasable: true, description: 'Learn basic chords, strumming patterns, and your first songs.' },
  { id: 402, title: 'Guitar Intermediate', category: 'Guitar', level: 'Intermediate', price: 18, purchasable: true, description: 'Explore barre chords, fingerpicking, and music theory integration.' },
  { id: 403, title: 'Guitar Professional', category: 'Guitar', level: 'Professional', price: 25, purchasable: true, description: 'Master lead soloing, advanced scale applications, and improvisation.' },

  { id: 501, title: 'Drums Beginner', category: 'Drums', level: 'Beginner', price: 10, purchasable: true, description: 'Stick technique, basic coordination, and essential rock/pop beats.' },
  { id: 502, title: 'Drums Intermediate', category: 'Drums', level: 'Intermediate', price: 15, purchasable: true, description: 'Poly-rhythms, dynamic control, and Latin/Jazz rhythms.' },
  { id: 503, title: 'Drums Professional', category: 'Drums', level: 'Professional', price: 22, purchasable: true, description: 'Advanced session drumming, sight-reading, and double bass techniques.' },

  { id: 601, title: 'Violin Beginner', category: 'Violin', level: 'Beginner', price: 12, purchasable: true, description: 'Proper hold, bowing technique, and learning your first scales.' },
  { id: 602, title: 'Violin Intermediate', category: 'Violin', level: 'Intermediate', price: 18, purchasable: true, description: 'Vibrato, position changes, and intermediate repertoire study.' },
  { id: 603, title: 'Violin Professional', category: 'Violin', level: 'Professional', price: 25, purchasable: true, description: 'Master concerto movements, complex bowing, and ensemble performance.' },

  { id: 701, title: 'Trumpet Beginner', category: 'Brass Instruments', level: 'Beginner', price: 10, purchasable: true, description: 'Embouchure formation, basic tone production, and simple melodies.' },
  { id: 702, title: 'Trumpet Intermediate', category: 'Brass Instruments', level: 'Intermediate', price: 15, purchasable: true, description: 'Expanding range, advanced scales, and musicality.' },
  { id: 703, title: 'Trumpet Professional', category: 'Brass Instruments', level: 'Professional', price: 20, purchasable: true, description: 'Jazz improvisation, lead playing, and high-range execution.' },

  { id: 704, title: 'Trombone Beginner', category: 'Brass Instruments', level: 'Beginner', price: 10, purchasable: true, description: 'Slide technique, proper breathing, and reading tenor clef basics.' },
  { id: 705, title: 'Trombone Intermediate', category: 'Brass Instruments', level: 'Intermediate', price: 15, purchasable: true, description: 'Advanced slide control, glissandos, and sight-reading.' },
  { id: 706, title: 'Trombone Professional', category: 'Brass Instruments', level: 'Professional', price: 20, purchasable: true, description: 'Advanced orchestral excerpts and jazz solo techniques.' },

  { id: 707, title: 'French Horn Beginner', category: 'Brass Instruments', level: 'Beginner', price: 10, purchasable: true, description: 'Introduction to hand stopping, key mechanism, and warm-ups.' },
  { id: 708, title: 'French Horn Intermediate', category: 'Brass Instruments', level: 'Intermediate', price: 15, purchasable: true, description: 'Lip slurs, transposition, and intermediate ensemble pieces.' },
  { id: 709, title: 'French Horn Professional', category: 'Brass Instruments', level: 'Professional', price: 20, purchasable: true, description: 'High-range mastery and complex orchestral repertoire.' },

  { id: 710, title: 'Tuba Beginner', category: 'Brass Instruments', level: 'Beginner', price: 10, purchasable: true, description: 'Basic breath support, valve control, and reading bass clef.' },
  { id: 711, title: 'Tuba Intermediate', category: 'Brass Instruments', level: 'Intermediate', price: 15, purchasable: true, description: 'Intermediate scales, tone quality development, and duets.' },
  { id: 712, title: 'Tuba Professional', category: 'Brass Instruments', level: 'Professional', price: 20, purchasable: true, description: 'Mastering complex technical passages and orchestral audition material.' },

  { id: 713, title: 'Saxophone Beginner', category: 'Brass Instruments', level: 'Beginner', price: 10, purchasable: true, description: 'Fingering charts, embouchure, and learning your first jazz standard.' },
  { id: 714, title: 'Saxophone Intermediate', category: 'Brass Instruments', level: 'Intermediate', price: 15, purchasable: true, description: 'Improvisation basics, chord changes, and advanced articulation.' },
  { id: 715, title: 'Saxophone Professional', category: 'Brass Instruments', level: 'Professional', price: 20, purchasable: true, description: 'Advanced altissimo, bebop phrasing, and professional performance techniques.' },

  { id: 801, title: 'DJing Beginner', category: 'DJing', level: 'Beginner', price: 15, purchasable: true, description: 'Intro to software, beat matching basics, and track structure.' },
  { id: 802, title: 'DJing Intermediate', category: 'DJing', level: 'Intermediate', price: 0, purchasable: false, description: 'Advanced EQing, filter use, and seamless beat matching (Coming Soon).' },
  { id: 803, title: 'DJing Professional', category: 'DJing', level: 'Professional', price: 0, purchasable: false, description: 'A comprehensive guide to mixing, scratching, and performance (Coming Soon).' },

  { id: 901, title: 'Studio Engineering Beginner', category: 'Production', level: 'Beginner', price: 0, purchasable: false, description: 'Learn microphone placement, gain staging, and basic mixing concepts (Coming Soon).' },
  { id: 902, title: 'Studio Engineering Intermediate', category: 'Production', level: 'Intermediate', price: 0, purchasable: false, description: 'Advanced compression, EQ techniques, and buss processing (Coming Soon).' },
  { id: 903, title: 'Studio Engineering Professional', category: 'Production', level: 'Professional', price: 0, purchasable: false, description: 'Mastering for various platforms and professional studio workflow (Coming Soon).' },

  { id: 1001, title: 'Music Theory - Grade 1', category: 'Music Theory', level: 'Beginner', price: 10, purchasable: true, description: 'Fundamentals of rhythm, simple clefs, and basic intervals.' },
  { id: 1002, title: 'Music Theory - Grade 2', category: 'Music Theory', level: 'Beginner', price: 10, purchasable: true, description: 'Time signatures, simple transposition, and key signatures up to two accidentals.' },
  { id: 1003, title: 'Music Theory - Grade 3', category: 'Music Theory', level: 'Beginner', price: 10, purchasable: true, description: 'All major and minor keys, alto/tenor clefs introduced.' },
  { id: 1004, title: 'Music Theory - Grade 4', category: 'Music Theory', level: 'Intermediate', price: 15, purchasable: true, description: 'Ornaments, double-sharps/flats, and melodic decoration.' },
  { id: 1005, title: 'Music Theory - Grade 5', category: 'Music Theory', level: 'Intermediate', price: 15, purchasable: true, description: 'Full transposition, composition in four parts, and irregular time signatures.' },
  { id: 1006, title: 'Music Theory - Grade 6', category: 'Music Theory', level: 'Intermediate', price: 0, purchasable: false, description: 'Introduction to compositional forms and advanced harmonic analysis.' },
  { id: 1007, title: 'Music Theory - Grade 7', category: 'Music Theory', level: 'Professional', price: 0, purchasable: false, description: 'Figured bass realization, advanced chromaticism, and fugue study.' },
  { id: 1008, title: 'Music Theory - Grade 8', category: 'Music Theory', level: 'Professional', price: 0, purchasable: false, description: 'Degree level theoretical studies, advanced score reading, and history.' },
];

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Human-readable slugs for URLs (e.g. /courses/classical-piano-beginner).
// Numeric ids remain the canonical key for purchases/sessions internally.
COURSES.forEach((course) => {
  course.slug = slugify(course.title);
});

// Generic lesson outline reused across courses (mock content).
const LESSON_TITLES = [
  'Introduction & Fundamentals',
  'Core Technique',
  'Applied Practice',
  'Review & Next Steps',
];

// Accepts either the numeric id or the URL slug.
function getCourse(idOrSlug) {
  const numId = Number(idOrSlug);
  return COURSES.find((c) => c.id === numId || c.slug === idOrSlug) || null;
}

function getLessons(courseId) {
  return LESSON_TITLES.map((title, index) => ({
    index,
    title,
    videoId: 'dQw4w9WgXcQ',
  }));
}

// Single source of truth for category names, reused by tutor applications
// and matching so they line up with the course catalog.
function getCategories() {
  return Array.from(new Set(COURSES.map((c) => c.category))).sort();
}

const LEVEL_ORDER = ['Beginner', 'Intermediate', 'Professional'];

// After finishing a course, suggest the next level up in the same category
// first (natural progression), then fall back to other purchasable courses
// in that category, excluding the one just completed.
function getSuggestions(courseId, limit = 3) {
  const course = getCourse(courseId);
  if (!course) return [];

  const sameCategory = COURSES.filter((c) => c.category === course.category && c.id !== course.id && c.purchasable);
  const currentLevelIndex = LEVEL_ORDER.indexOf(course.level);
  const nextLevel = LEVEL_ORDER[currentLevelIndex + 1];

  const nextLevelCourses = sameCategory.filter((c) => c.level === nextLevel);
  const otherCourses = sameCategory.filter((c) => c.level !== nextLevel);

  return [...nextLevelCourses, ...otherCourses].slice(0, limit);
}

module.exports = { COURSES, getCourse, getLessons, getCategories, getSuggestions };
