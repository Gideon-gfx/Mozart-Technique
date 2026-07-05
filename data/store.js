const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'users.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { users: [], nextId: 1 };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { users: [], nextId: 1 };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function findByEmail(email) {
  const db = load();
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function findById(id) {
  const db = load();
  return db.users.find((u) => u.id === id) || null;
}

function findByGoogleId(googleId) {
  const db = load();
  return db.users.find((u) => u.googleId === googleId) || null;
}

function createUser({ name, email, passwordHash = null, googleId = null, role = 'user', countryCode = null }) {
  const db = load();
  const user = {
    id: db.nextId++,
    name,
    email,
    passwordHash,
    googleId,
    role,
    countryCode,
    purchasedCourses: [],
    progress: {}, // courseId -> array of completed lesson indices
    streak: { count: 0, lastActiveDate: null },
    notifications: [],
    nextNotificationId: 1,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  persist(db);
  return user;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, local-independent enough for this use
}

// Marks a lesson complete/incomplete and bumps the daily practice streak.
// A streak increments once per calendar day of activity; missing a day
// resets it back to 1 on the next active day.
function setLessonProgress(userId, courseId, lessonIndex, completed) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;

  if (!user.progress) user.progress = {};
  const key = String(courseId);
  const done = new Set(user.progress[key] || []);
  if (completed) done.add(lessonIndex); else done.delete(lessonIndex);
  user.progress[key] = Array.from(done).sort((a, b) => a - b);

  if (!user.streak) user.streak = { count: 0, lastActiveDate: null };
  const today = todayStamp();
  if (user.streak.lastActiveDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    user.streak.count = user.streak.lastActiveDate === yesterday ? user.streak.count + 1 : 1;
    user.streak.lastActiveDate = today;
  }

  persist(db);
  return user;
}

// Failing the final quiz clears lesson completion for that course, so the
// student has to work back through the lessons before retaking it.
function resetCourseProgress(userId, courseId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.progress) user.progress = {};
  user.progress[String(courseId)] = [];
  persist(db);
  return user;
}

function setQuizResult(userId, courseId, { passed, score }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.quizResults) user.quizResults = {};
  user.quizResults[String(courseId)] = { passed, score, attemptedAt: new Date().toISOString() };
  persist(db);
  return user;
}

function getBadges(user, totalLessonsPerCourse) {
  const badges = [];
  const purchasedCount = user.purchasedCourses.length;
  const completedCourses = Object.entries(user.progress || {}).filter(
    ([, done]) => done.length >= totalLessonsPerCourse
  ).length;

  if (purchasedCount >= 1) badges.push({ id: 'first-enrollment', label: 'First Enrollment', icon: 'fa-graduation-cap' });
  if (purchasedCount >= 3) badges.push({ id: 'three-courses', label: '3 Courses Enrolled', icon: 'fa-book' });
  if (completedCourses >= 1) badges.push({ id: 'first-completion', label: 'Course Completed', icon: 'fa-trophy' });
  if ((user.streak && user.streak.count) >= 3) badges.push({ id: 'streak-3', label: '3-Day Streak', icon: 'fa-fire' });
  if ((user.streak && user.streak.count) >= 7) badges.push({ id: 'streak-7', label: '7-Day Streak', icon: 'fa-fire' });
  return badges;
}

function addNotification(userId, { type, message }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.notifications) user.notifications = [];
  if (!user.nextNotificationId) user.nextNotificationId = 1;
  user.notifications.unshift({
    id: user.nextNotificationId++,
    type,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  });
  user.notifications = user.notifications.slice(0, 50); // cap history
  persist(db);
  return user;
}

function markNotificationsRead(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  (user.notifications || []).forEach((n) => { n.read = true; });
  persist(db);
  return user;
}

function setCountry(userId, countryCode) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.countryCode = countryCode;
  persist(db);
  return user;
}

// Demo and admin accounts get every purchasable course unlocked without
// ever going through payment.
function hasFullAccess(user) {
  return user.role === 'admin' || user.role === 'demo';
}

function linkGoogleId(userId, googleId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.googleId = googleId;
  persist(db);
  return user;
}

function addPurchase(userId, courseId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.purchasedCourses.includes(courseId)) {
    user.purchasedCourses.push(courseId);
    persist(db);
  }
  return user;
}

function removePurchase(userId, courseId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.purchasedCourses = user.purchasedCourses.filter((id) => id !== courseId);
  persist(db);
  return user;
}

function setRole(userId, role) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.role = role;
  persist(db);
  return user;
}

function listUsers() {
  const db = load();
  return db.users;
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// No email service is configured, so there's no inbox to deliver a reset
// link to - the caller (server.js) hands the raw link back to the browser
// that requested it instead. Still time-limited and single-use like a real
// email-based flow, just delivered a different way.
function createResetToken(email) {
  const db = load();
  const user = db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) return null;
  user.resetToken = crypto.randomBytes(24).toString('hex');
  user.resetTokenExpires = Date.now() + RESET_TOKEN_TTL_MS;
  persist(db);
  return user;
}

function findByResetToken(token) {
  const db = load();
  return db.users.find((u) => u.resetToken === token && u.resetTokenExpires > Date.now()) || null;
}

function resetPassword(token, passwordHash) {
  const db = load();
  const user = db.users.find((u) => u.resetToken === token && u.resetTokenExpires > Date.now());
  if (!user) return null;
  user.passwordHash = passwordHash;
  user.resetToken = null;
  user.resetTokenExpires = null;
  persist(db);
  return user;
}

module.exports = {
  findByEmail, findById, findByGoogleId, createUser, linkGoogleId, addPurchase, removePurchase, hasFullAccess, setCountry,
  setLessonProgress, getBadges, addNotification, markNotificationsRead, setRole, listUsers,
  createResetToken, findByResetToken, resetPassword, resetCourseProgress, setQuizResult,
};
