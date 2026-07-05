// Per-course final quiz questions, authored by an admin. Each question is
// multiple choice with exactly one correct option.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'quizzes.json');
const PASS_THRESHOLD = 0.7; // 70% correct to pass

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

// Full questions including the correct answer - admin editing only.
function getQuestionsForAdmin(courseId) {
  const db = load();
  return db[courseId] || [];
}

// Same questions with the answer key stripped - safe to send to a student
// taking the quiz.
function getQuestionsForStudent(courseId) {
  return getQuestionsForAdmin(courseId).map(({ question, options }, index) => ({ index, question, options }));
}

function setQuestions(courseId, questions) {
  const db = load();
  db[courseId] = questions.map((q) => ({
    question: q.question,
    options: q.options,
    correctIndex: Number(q.correctIndex),
  }));
  persist(db);
  return db[courseId];
}

function grade(courseId, answers) {
  const questions = getQuestionsForAdmin(courseId);
  if (!questions.length) return null;

  let correct = 0;
  questions.forEach((q, i) => {
    if (Number(answers[i]) === q.correctIndex) correct += 1;
  });
  const score = correct / questions.length;
  return { correct, total: questions.length, score, passed: score >= PASS_THRESHOLD };
}

module.exports = { getQuestionsForAdmin, getQuestionsForStudent, setQuestions, grade, PASS_THRESHOLD };
