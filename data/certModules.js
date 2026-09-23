// The Foundation-program engine this spec's Part 0-3 assume already exist
// (as `modules`, `resources`, `questions`, `attempts`, a Scoring_Engine).
// None of that existed anywhere in this codebase, so this is a from-
// scratch build of the real engine - a module is a resource (video/text)
// plus a dimension-tagged question bank; an attempt scores overall percent
// AND a 1-5 level per dimension; a module passes at 80%+ overall with no
// dimension below level 3, exactly as the spec's Foundation program
// requires.
//
// Seeded with a genuine starter set covering the program's core
// dimensions - not a fabricated stand-in for the full 20-module curriculum
// referenced from an external spreadsheet this codebase doesn't have.
// Admins add more modules through the same admin UI that already manages
// orientation content and the technique library (see server.js's
// /api/admin/cert-modules routes) - this is the engine, seeded honestly,
// not a finished 20-module program.
const fs = require('fs');
const path = require('path');

const MODULES_FILE = path.join(__dirname, 'certModules.json');
const ATTEMPTS_FILE = path.join(__dirname, 'certAttempts.json');

const DIMENSIONS = [
  { code: 'PED', label: 'Pedagogy & Lesson Design' },
  { code: 'INCL', label: 'Inclusive Teaching' },
  { code: 'SAFE', label: 'Safety & Professional Boundaries' },
  { code: 'TECH', label: 'Musicianship & Technique' },
];

const SEED_MODULES = [
  {
    code: 'F01',
    title: 'Foundations of Lesson Design',
    kind: 'foundation',
    dimensions: ['PED'],
    resource: {
      type: 'text',
      title: 'Structuring a lesson that actually sticks',
      body: 'A well-designed lesson moves through four phases: warm-up/review, new material introduced in small steps, guided practice with immediate feedback, and a clear takeaway the student can repeat at home. Every phase should map to one observable thing the student can now do that they couldn\'t at the start.',
    },
    questions: [
      { text: 'What should every lesson phase map to?', options: ['Filling the full lesson time', 'One observable thing the student can now do', 'The tutor\'s own practice routine', 'A fixed page count in the method book'], correctIndex: 1, dimension: 'PED' },
      { text: 'Where does new material belong in a well-structured lesson?', options: ['Right at the very end', 'Introduced in small steps after warm-up/review', 'Only in the first five minutes', 'It should never be introduced mid-lesson'], correctIndex: 1, dimension: 'PED' },
      { text: 'What makes guided practice effective?', options: ['Silence while the student works alone', 'Immediate feedback', 'Deferring all feedback to next week', 'Skipping it when time is short'], correctIndex: 1, dimension: 'PED' },
      { text: 'A lesson\'s takeaway should be...', options: ['Vague, so the student explores freely', 'Something the student can repeat at home', 'Only written down by the tutor', 'Optional'], correctIndex: 1, dimension: 'PED' },
      { text: 'Review at the start of a lesson mainly serves to...', options: ['Waste time before the real lesson', 'Confirm what was retained since last time', 'Replace homework checking entirely', 'Test unrelated material'], correctIndex: 1, dimension: 'PED' },
    ],
  },
  {
    code: 'F02',
    title: 'Teaching Across Difference',
    kind: 'foundation',
    dimensions: ['INCL'],
    resource: {
      type: 'text',
      title: 'Inclusive teaching is not a separate unit - it is how you teach',
      body: 'Students differ in age, ability, neurotype, language, and prior musical exposure. Inclusive practice means adapting pacing, instruction format, and repertoire choice to the student in front of you, without lowering the actual skill being built. A student who processes instructions better visually than verbally is not a "harder" student - they need a different channel for the same content.',
    },
    questions: [
      { text: 'Inclusive teaching primarily means...', options: ['A separate lesson unit taught once a term', 'Adapting pacing/format/repertoire to the actual student', 'Lowering the skill bar for some students', 'Treating every student identically regardless of need'], correctIndex: 1, dimension: 'INCL' },
      { text: 'A student who learns better visually than verbally should be considered...', options: ['A harder student to teach', 'Needing a different instructional channel, same content', 'Not ready for lessons yet', 'An exception you refer elsewhere'], correctIndex: 1, dimension: 'INCL' },
      { text: 'When a student has limited prior musical exposure, the tutor should...', options: ['Assume the same starting point as every other student', 'Adjust pacing without lowering what\'s actually being built', 'Skip foundational material to save time', 'Recommend they wait a year before starting'], correctIndex: 1, dimension: 'INCL' },
      { text: 'Neurodivergent students most often need...', options: ['A completely different subject taught instead', 'Adapted instruction format, not a reduced skill target', 'To be moved to a different tutor', 'No accommodation at all'], correctIndex: 1, dimension: 'INCL' },
      { text: 'Language differences between tutor and student are best handled by...', options: ['Refusing the booking', 'Adapting explanation methods (demonstration, visuals) alongside words', 'Speaking only in the tutor\'s first language', 'Ending the lesson early'], correctIndex: 1, dimension: 'INCL' },
    ],
  },
  {
    code: 'F03',
    title: 'Professional Boundaries & Safeguarding',
    kind: 'foundation',
    dimensions: ['SAFE'],
    resource: {
      type: 'text',
      title: 'What "professional boundary" actually covers in a one-to-one lesson',
      body: 'One-to-one music tuition, especially with minors, carries real safeguarding responsibility. This covers: keeping communication with minors on platform-monitored channels only, never meeting outside scheduled/logged lesson times, involving a parent/guardian in any change of format (e.g. in-person to video), and knowing the platform\'s reporting path if something feels wrong - reporting is a strength, not a failure.',
    },
    questions: [
      { text: 'Communication with a minor student should stay on...', options: ['Whichever channel is most convenient', 'Platform-monitored channels only', 'The tutor\'s personal phone number', 'Social media direct messages'], correctIndex: 1, dimension: 'SAFE' },
      { text: 'Changing a lesson from in-person to video format should involve...', options: ['No one else - it\'s between tutor and student', 'The parent/guardian', 'Only the platform\'s billing team', 'A public announcement'], correctIndex: 1, dimension: 'SAFE' },
      { text: 'Reporting a concern to the platform is best understood as...', options: ['An admission of failure', 'A strength - the right response to a real concern', 'Something to avoid unless certain', 'Only the student\'s responsibility'], correctIndex: 1, dimension: 'SAFE' },
      { text: 'Meeting a student outside scheduled, logged lesson times is...', options: ['Fine if both agree informally', 'Something to avoid - keep sessions logged and scheduled', 'Required for advanced students', 'Only a concern for minors'], correctIndex: 1, dimension: 'SAFE' },
      { text: 'A safeguarding-conscious tutor treats session records as...', options: ['Unnecessary paperwork', 'Part of keeping the teaching relationship accountable', 'Only relevant after a complaint', 'The student\'s responsibility to keep'], correctIndex: 1, dimension: 'SAFE' },
    ],
  },
  {
    code: 'F04',
    title: 'Musicianship Fundamentals for Teaching',
    kind: 'foundation',
    dimensions: ['TECH'],
    resource: {
      type: 'text',
      title: 'Technique you can teach, not just perform',
      body: 'Being able to play something yourself and being able to break it down for a student are different skills. Teaching technique means identifying the specific physical or musical habit causing an error (not just naming the error), demonstrating the fix at a slowed tempo, and giving the student one concrete thing to isolate in practice - not five things at once.',
    },
    questions: [
      { text: 'When a student makes a technical error, the tutor should first...', options: ['Name the error and move on', 'Identify the specific habit causing it', 'Assume it will fix itself with repetition', 'Switch to a different piece'], correctIndex: 1, dimension: 'TECH' },
      { text: 'Demonstrating a technical fix is most effective...', options: ['At full performance tempo', 'At a slowed tempo the student can track', 'Only verbally, without playing it', 'After the lesson has ended'], correctIndex: 1, dimension: 'TECH' },
      { text: 'How many things should a student isolate in practice at once, ideally?', options: ['As many as possible for efficiency', 'One concrete thing', 'Five, to cover all bases', 'None - just play through'], correctIndex: 1, dimension: 'TECH' },
      { text: 'The gap between "can perform it" and "can teach it" is mainly...', options: ['Nonexistent - they\'re the same skill', 'The ability to break the skill down for someone else', 'Only about years of experience', 'Not something that can be trained'], correctIndex: 1, dimension: 'TECH' },
      { text: 'A good technical fix gives the student...', options: ['A long list of corrections', 'One isolated thing to work on', 'No specific direction, just "keep practicing"', 'A new piece entirely'], correctIndex: 1, dimension: 'TECH' },
    ],
  },
];

function load(file, defaultShape) {
  if (!fs.existsSync(file)) return defaultShape;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return defaultShape;
  }
}

function persistModules(db) {
  fs.writeFileSync(MODULES_FILE, JSON.stringify(db, null, 2));
}

function persistAttempts(db) {
  fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(db, null, 2));
}

function loadModulesDb() {
  if (!fs.existsSync(MODULES_FILE)) {
    const db = { nextQuestionId: 1, modules: SEED_MODULES.map((m) => ({
      ...m,
      questions: m.questions.map((q) => ({ ...q })),
      active: true,
    })) };
    // Assign stable ids across all seed questions.
    let qid = 1;
    db.modules.forEach((m) => m.questions.forEach((q) => { q.id = qid++; }));
    db.nextQuestionId = qid;
    persistModules(db);
    return db;
  }
  return load(MODULES_FILE, { nextQuestionId: 1, modules: [] });
}

function loadAttemptsDb() {
  return load(ATTEMPTS_FILE, { nextId: 1, attempts: [] });
}

function listDimensions() {
  return DIMENSIONS;
}

function listModules({ activeOnly = true } = {}) {
  const modules = loadModulesDb().modules;
  return (activeOnly ? modules.filter((m) => m.active) : modules)
    // Never hand the answer key to a client fetching the catalog - only
    // the grading function below sees correctIndex.
    .map((m) => ({ ...m, questions: m.questions.map(({ correctIndex, ...q }) => q) }));
}

function findModuleRaw(code) {
  return loadModulesDb().modules.find((m) => m.code === code) || null;
}

function createModule({ code, title, dimensions, resource, kind = 'foundation' }) {
  const db = loadModulesDb();
  if (db.modules.some((m) => m.code === code)) return null;
  const module = { code, title, kind, dimensions, resource, questions: [], active: true };
  db.modules.push(module);
  persistModules(db);
  return module;
}

function addQuestion(moduleCode, { text, options, correctIndex, dimension }) {
  const db = loadModulesDb();
  const module = db.modules.find((m) => m.code === moduleCode);
  if (!module) return null;
  const question = { id: db.nextQuestionId++, text, options, correctIndex, dimension };
  module.questions.push(question);
  persistModules(db);
  return question;
}

function setModuleActive(code, active) {
  const db = loadModulesDb();
  const module = db.modules.find((m) => m.code === code);
  if (!module) return null;
  module.active = Boolean(active);
  persistModules(db);
  return module;
}

// 1-5 scale per dimension - same threshold shape as taxonomy.js's
// levelForScore (0.95/0.80/0.60/0.40 bands), kept as its own function
// since these numeric levels aren't the same concept as that function's
// Beginner..Virtuoso tutor-approval labels.
function dimensionLevelForScore(pct) {
  if (pct >= 0.95) return 5;
  if (pct >= 0.80) return 4;
  if (pct >= 0.60) return 3;
  if (pct >= 0.40) return 2;
  return 1;
}

// The Scoring_Engine the spec assumes: overall percent + a level per
// dimension + pass/fail (>=80% overall AND no dimension below level 3,
// exactly as Part 2.1's Path A requires).
function gradeAttempt(moduleCode, answers) {
  const module = findModuleRaw(moduleCode);
  if (!module) return null;
  const byDimension = {};
  let correct = 0;
  module.questions.forEach((q) => {
    const given = answers.find((a) => Number(a.questionId) === q.id);
    const isCorrect = given && Number(given.selectedIndex) === q.correctIndex;
    if (isCorrect) correct += 1;
    if (!byDimension[q.dimension]) byDimension[q.dimension] = { correct: 0, total: 0 };
    byDimension[q.dimension].total += 1;
    if (isCorrect) byDimension[q.dimension].correct += 1;
  });
  const overallPct = module.questions.length ? correct / module.questions.length : 0;
  const dimensionScores = {};
  Object.entries(byDimension).forEach(([dim, { correct: c, total }]) => {
    const pct = total ? c / total : 0;
    dimensionScores[dim] = { pct, level: dimensionLevelForScore(pct) };
  });
  const noWeakDimension = Object.values(dimensionScores).every((d) => d.level >= 3);
  const passed = overallPct >= 0.8 && noWeakDimension;
  return { overallPct, dimensionScores, passed };
}

function recordAttempt(tutorId, moduleCode, answers) {
  const grade = gradeAttempt(moduleCode, answers);
  if (!grade) return null;
  const db = loadAttemptsDb();
  const attempt = {
    id: db.nextId++,
    tutorId: Number(tutorId),
    moduleCode,
    answers,
    overallPct: grade.overallPct,
    dimensionScores: grade.dimensionScores,
    passed: grade.passed,
    completedAt: new Date().toISOString(),
  };
  db.attempts.push(attempt);
  persistAttempts(db);
  return attempt;
}

function attemptsForTutor(tutorId) {
  return loadAttemptsDb().attempts.filter((a) => a.tutorId === Number(tutorId));
}

// Every module this tutor has ever PASSED, latest attempt only.
function passedModulesForTutor(tutorId) {
  const attempts = attemptsForTutor(tutorId).filter((a) => a.passed);
  const latestByModule = new Map();
  attempts.forEach((a) => {
    const existing = latestByModule.get(a.moduleCode);
    if (!existing || new Date(a.completedAt) > new Date(existing.completedAt)) latestByModule.set(a.moduleCode, a);
  });
  return [...latestByModule.values()];
}

// Every active foundation module passed - "level 3 in all Foundation
// dimensions" per spec 3.4's native-points formula.
function hasCompletedFoundation(tutorId) {
  const activeFoundationCodes = loadModulesDb().modules.filter((m) => m.active && m.kind === 'foundation').map((m) => m.code);
  if (!activeFoundationCodes.length) return false;
  const passedCodes = new Set(passedModulesForTutor(tutorId).map((a) => a.moduleCode));
  return activeFoundationCodes.every((code) => passedCodes.has(code));
}

// At least one specialist-pathway module passed (spec 3.4: "+one specialist
// pathway passed -> +20 pts").
function hasPassedSpecialistPathway(tutorId) {
  const specialistCodes = loadModulesDb().modules.filter((m) => m.active && m.kind === 'specialist').map((m) => m.code);
  if (!specialistCodes.length) return false;
  const passedCodes = new Set(passedModulesForTutor(tutorId).map((a) => a.moduleCode));
  return specialistCodes.some((code) => passedCodes.has(code));
}

module.exports = {
  listDimensions,
  listModules,
  findModuleRaw,
  createModule,
  addQuestion,
  setModuleActive,
  gradeAttempt,
  recordAttempt,
  attemptsForTutor,
  passedModulesForTutor,
  hasCompletedFoundation,
  hasPassedSpecialistPathway,
};
