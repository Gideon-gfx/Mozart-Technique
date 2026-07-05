// Per-course Q&A threads. Anyone can read; posting requires an account.
// Replies from an admin/teacher account are flagged so the UI can badge
// them as "Instructor".
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'qna.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, threads: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, threads: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function getByCourse(courseId) {
  const db = load();
  return db.threads
    .filter((t) => t.courseId === Number(courseId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function addQuestion(courseId, user, question) {
  const db = load();
  const thread = {
    id: db.nextId++,
    courseId: Number(courseId),
    userId: user.id,
    userName: user.name,
    question,
    createdAt: new Date().toISOString(),
    replies: [],
  };
  db.threads.push(thread);
  persist(db);
  return thread;
}

function addReply(threadId, user, text) {
  const db = load();
  const thread = db.threads.find((t) => t.id === Number(threadId));
  if (!thread) return null;
  thread.replies.push({
    userId: user.id,
    userName: user.name,
    isInstructor: user.role === 'admin',
    text,
    createdAt: new Date().toISOString(),
  });
  persist(db);
  return thread;
}

module.exports = { getByCourse, addQuestion, addReply };
