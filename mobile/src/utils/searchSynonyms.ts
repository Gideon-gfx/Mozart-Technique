// Mirrors data/searchSynonyms.js on the backend (kept in sync by hand - this
// app has no shared package between server.js and mobile/src). Client-side
// text search here (FindTutorScreen, QuickSearchSheet) only ever matched a
// query against the literal category string, so "singing"/"voice" never
// surfaced a Vocals tutor. This maps each canonical category to the
// everyday terms people actually search for.
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  // Keyboard & voice
  piano: ['keys', 'keyboard'],
  organ: ['pipe organ', 'keyboard organ'],
  vocals: ['singing', 'sing', 'voice', 'vocal', 'singer', 'vocal lessons'],
  'choral techniques': ['choir', 'chorus', 'choral'],
  // Strings
  violin: ['fiddle'],
  cello: ['violoncello'],
  'double bass': ['upright bass', 'contrabass', 'string bass'],
  guitar: ['acoustic guitar', 'electric guitar', 'bass guitar'],
  // Woodwind
  saxophone: ['sax'],
  // Brass
  'french horn': ['horn'],
  'flugel horn': ['flugelhorn'],
  // Percussion
  drums: ['drumming', 'percussion', 'drum kit', 'drummer'],
  xylophone: ['marimba'],
  'talking drum': ['gangan'],
  'percussive instruments (native)': ['native percussion', 'traditional drums'],
  // Study & performance
  composition: ['songwriting', 'music composition', 'composing'],
  'form & analysis': ['music analysis'],
  conducting: ['conductor'],
  'music theory and extra curricula activities': ['music theory', 'theory'],
  dance: ['dancing'],
  // Studio
  djing: ['dj', 'deejay', 'mixing'],
  production: ['music production', 'beat making', 'producing', 'audio production'],
  // Performer categories
  'solo musician': ['musician'],
  'live band': ['band'],
  dj: ['deejay', 'mixing', 'turntablist'],
  'solo vocalist': ['singer', 'singing', 'vocalist', 'voice'],
  'dance troupe': ['dancers', 'dance group'],
  'theater actor': ['actor', 'actress', 'theatre'],
  'mc / host': ['host', 'emcee', 'master of ceremonies'],
  comedian: ['comedy', 'stand-up'],
  'studio performance': ['studio session', 'session musician'],
};

export function categoryMatchesQuery(category: string, query: string): boolean {
  const c = category.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!c || !q) return false;
  if (c.includes(q) || q.includes(c)) return true;
  const synonyms = CATEGORY_SYNONYMS[c] || [];
  return synonyms.some((term) => term.includes(q) || q.includes(term));
}

export function matchesAnyCategory(categories: string[], query: string): boolean {
  return categories.some((category) => categoryMatchesQuery(category, query));
}
