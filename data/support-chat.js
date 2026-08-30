const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'support-chat.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextThreadId: 1, nextMessageId: 1, threads: [] };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { nextThreadId: 1, nextMessageId: 1, threads: [] }; }
}
function persist(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

function getOrCreate(user) {
  const db = load();
  let thread = db.threads.find((item) => item.userId === user.id && item.status !== 'closed');
  if (!thread) {
    thread = { id: db.nextThreadId++, userId: user.id, userName: user.name, userEmail: user.email, status: 'ai', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
    db.threads.push(thread);
    persist(db);
  }
  return thread;
}

function addMessage(threadId, { sender, text, adminId = null, attachment = null }) {
  const db = load();
  const thread = db.threads.find((item) => item.id === Number(threadId));
  if (!thread) return null;
  const message = { id: db.nextMessageId++, sender, adminId, text: String(text || '').trim(), attachment, createdAt: new Date().toISOString() };
  thread.messages.push(message);
  thread.updatedAt = message.createdAt;
  // A live-agent request must stay in the human queue after every later
  // user message; otherwise it falls back to the unavailable AI path.
  if (sender === 'user' && !['waiting_for_agent', 'assigned'].includes(thread.status)) thread.status = 'ai';
  persist(db);
  return { thread, message };
}

function escalate(threadId) {
  const db = load();
  const thread = db.threads.find((item) => item.id === Number(threadId));
  if (!thread) return null;
  thread.status = 'waiting_for_agent'; thread.escalatedAt = new Date().toISOString(); thread.updatedAt = thread.escalatedAt;
  persist(db); return thread;
}

function claim(threadId, agent) {
  const db = load();
  const thread = db.threads.find((item) => item.id === Number(threadId));
  if (!thread) return null;
  if (thread.assignedAgentId && thread.assignedAgentId !== agent.id) return { error: 'This conversation has already been claimed.' };
  thread.status = 'assigned';
  thread.assignedAgentId = agent.id;
  thread.assignedAgentName = agent.name || agent.email;
  thread.assignedAt = new Date().toISOString();
  thread.updatedAt = thread.assignedAt;
  persist(db); return { thread };
}

function close(threadId) {
  const db = load();
  const thread = db.threads.find((item) => item.id === Number(threadId));
  if (!thread) return null;
  thread.status = 'closed'; thread.closedAt = new Date().toISOString(); thread.updatedAt = thread.closedAt;
  persist(db); return thread;
}

function listAll() { return load().threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); }
function findById(id) { return load().threads.find((item) => item.id === Number(id)) || null; }

module.exports = { getOrCreate, addMessage, escalate, claim, close, listAll, findById };
