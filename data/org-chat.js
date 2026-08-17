// Organization-to-tutor messaging system
// Allows NGO/Institution organizations to message tutors who teach their sponsored students
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'org-chat.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, conversations: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, conversations: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// Get or create a conversation between org and tutor
function getOrCreateConversation(orgId, tutorId) {
  const db = load();
  let conv = db.conversations.find((c) => c.orgId === orgId && c.tutorId === tutorId);
  if (!conv) {
    conv = {
      id: db.nextId++,
      orgId,
      tutorId,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    db.conversations.push(conv);
    persist(db);
  }
  return conv;
}

// List all conversations for an organization
function listForOrganization(orgId) {
  return load()
    .conversations.filter((c) => c.orgId === orgId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// List all conversations for a tutor
function listForTutor(tutorId) {
  return load()
    .conversations.filter((c) => c.tutorId === tutorId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Send a message in a conversation
function sendMessage(conversationId, { senderId, senderType, senderName, text }) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return null;

  const message = {
    id: (conv.messages.length || 0) + 1,
    senderId,
    senderType, // 'org' | 'tutor'
    senderName,
    text: text || '',
    createdAt: new Date().toISOString(),
    readByOrg: senderType === 'org',
    readByTutor: senderType === 'tutor',
  };
  conv.messages.push(message);
  persist(db);
  return message;
}

// Get messages for a conversation
function getMessages(conversationId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  return conv ? conv.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) : [];
}

// Mark messages as read
function markRead(conversationId, role) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return;
  const field = role === 'org' ? 'readByOrg' : 'readByTutor';
  conv.messages.forEach((m) => { m[field] = true; });
  persist(db);
}

// Get unread count for a conversation
function getUnreadCount(conversationId, role) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return 0;
  const field = role === 'org' ? 'readByOrg' : 'readByTutor';
  return conv.messages.filter((m) => !m[field]).length;
}

module.exports = {
  getOrCreateConversation,
  listForOrganization,
  listForTutor,
  sendMessage,
  getMessages,
  markRead,
  getUnreadCount,
};
