// Free-text search (e.g. "/api/search"'s ?q=) only ever matched a query
// against the literal taxonomy string ("Vocals", "DJing", ...), so a search
// for "singing" or "voice" never surfaced a Vocals tutor/course. This maps
// each canonical category (data/taxonomy.js) to the everyday terms people
// actually search for, so those terms resolve back to the real category.
// Keys are lowercased canonical category names; values are lowercased
// alternate terms (the canonical name itself doesn't need to be repeated -
// callers already substring-match against it directly).
const CATEGORY_SYNONYMS = {
  // Keyboard & voice
  'piano': ['keys', 'keyboard'],
  'organ': ['pipe organ', 'keyboard organ'],
  'vocals': ['singing', 'sing', 'voice', 'vocal', 'singer', 'vocal lessons'],
  'choral techniques': ['choir', 'chorus', 'choral'],
  // Strings
  'violin': ['fiddle'],
  'cello': ['violoncello'],
  'double bass': ['upright bass', 'contrabass', 'string bass'],
  'guitar': ['acoustic guitar', 'electric guitar', 'bass guitar'],
  // Woodwind
  'saxophone': ['sax'],
  // Brass
  'french horn': ['horn'],
  'flugel horn': ['flugelhorn'],
  // Percussion
  'drums': ['drumming', 'percussion', 'drum kit', 'drummer'],
  'xylophone': ['marimba'],
  'talking drum': ['gangan'],
  'percussive instruments (native)': ['native percussion', 'traditional drums'],
  // Study & performance
  'composition': ['songwriting', 'music composition', 'composing'],
  'form & analysis': ['music analysis'],
  'conducting': ['conductor'],
  'music theory and extra curricula activities': ['music theory', 'theory'],
  'dance': ['dancing'],
  // Studio
  'djing': ['dj', 'deejay', 'mixing'],
  'production': ['music production', 'beat making', 'producing', 'audio production'],
  // Performer categories (data/taxonomy.js PERFORMER_CATEGORIES_DEFAULT)
  'solo musician': ['musician'],
  'live band': ['band'],
  'dj': ['deejay', 'mixing', 'turntablist'],
  'solo vocalist': ['singer', 'singing', 'vocalist', 'voice'],
  'dance troupe': ['dancers', 'dance group'],
  'theater actor': ['actor', 'actress', 'theatre'],
  'mc / host': ['host', 'emcee', 'master of ceremonies'],
  'comedian': ['comedy', 'stand-up'],
  'studio performance': ['studio session', 'session musician'],
};

// True if `query` is either a direct substring match of `category` (the
// existing behavior every caller already had) or matches one of its known
// synonyms - checked both ways (`term.includes(query)` and
// `query.includes(term)`) so a partial word like "sing" still hits "singing".
function categoryMatchesQuery(category, query) {
  const c = String(category || '').trim().toLowerCase();
  const q = String(query || '').trim().toLowerCase();
  if (!c || !q) return false;
  if (c.includes(q) || q.includes(c)) return true;
  const synonyms = CATEGORY_SYNONYMS[c] || [];
  return synonyms.some((term) => term.includes(q) || q.includes(term));
}

function matchesAnyCategory(categories, query) {
  return (categories || []).some((category) => categoryMatchesQuery(category, query));
}

module.exports = { CATEGORY_SYNONYMS, categoryMatchesQuery, matchesAnyCategory };
