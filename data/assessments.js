// One generic multiple-choice quiz engine backing three different flows:
// student placement quizzes ('placement:<category>'), tutor qualification
// evaluations ('teacher-eval:<category>'), and the tutor orientation quiz
// ('orientation'). Same shape as data/quizzes.js (course-completion quizzes)
// but keyed by a string instead of a course id, since these aren't tied to
// the packaged video catalog.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'assessments.json');

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

function keyFor(kind, category) {
  return category ? `${kind}:${category}` : kind;
}

function getQuestionsForAdmin(kind, category) {
  const db = load();
  return db[keyFor(kind, category)] || [];
}

function getQuestionsForTaker(kind, category) {
  return getQuestionsForAdmin(kind, category).map(({ question, options }, index) => ({ index, question, options }));
}

function setQuestions(kind, category, questions) {
  const db = load();
  db[keyFor(kind, category)] = questions.map((q) => ({
    question: q.question,
    options: q.options,
    correctIndex: Number(q.correctIndex),
  }));
  persist(db);
  return db[keyFor(kind, category)];
}

function grade(kind, category, answers) {
  const questions = getQuestionsForAdmin(kind, category);
  if (!questions.length) return null;
  let correct = 0;
  questions.forEach((q, i) => { if (Number(answers[i]) === q.correctIndex) correct += 1; });
  const score = correct / questions.length;
  return { correct, total: questions.length, score };
}

module.exports = { getQuestionsForAdmin, getQuestionsForTaker, setQuestions, grade };
