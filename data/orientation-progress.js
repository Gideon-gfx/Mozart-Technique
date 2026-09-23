// Per-user, per-post completion tracking for orientation posts - separate
// from data/orientation.js (the posts themselves) since a post is shared
// across every user in its audience while progress is per (userId, postId).
// Mirrors every other flat-file data module here: load/persist a single
// JSON file, no ORM.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'orientation-progress.json');

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { records: [] }; } }
function save(data) { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }

function find(data, userId, postId) {
  return data.records.find((r) => r.userId === userId && r.postId === Number(postId));
}

function getProgress(userId, postId) {
  return find(load(), userId, Number(postId)) || null;
}

function markFinished(userId, postId) {
  const data = load();
  let record = find(data, userId, Number(postId));
  if (!record) {
    record = { userId, postId: Number(postId), finishedAt: null, attempts: 0, bestScore: 0, passed: false, lastAttemptAt: null };
    data.records.push(record);
  }
  if (!record.finishedAt) record.finishedAt = new Date().toISOString();
  save(data);
  return record;
}

function recordAttempt(userId, postId, { correct, total, score, passed }) {
  const data = load();
  let record = find(data, userId, Number(postId));
  if (!record) {
    record = { userId, postId: Number(postId), finishedAt: new Date().toISOString(), attempts: 0, bestScore: 0, passed: false, lastAttemptAt: null };
    data.records.push(record);
  }
  record.attempts += 1;
  record.bestScore = Math.max(record.bestScore, score);
  record.lastAttemptAt = new Date().toISOString();
  if (passed) record.passed = true;
  save(data);
  return record;
}

// A post with no quiz is "done" once viewed (finishedAt set); a post with a
// quiz needs an actual pass, "Finished" alone isn't enough for it.
function isPostDone(userId, post, hasQuiz) {
  const record = getProgress(userId, post.id);
  if (!record) return false;
  return hasQuiz ? Boolean(record.passed) : Boolean(record.finishedAt);
}

module.exports = { getProgress, markFinished, recordAttempt, isPostDone };
