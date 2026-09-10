// Direct-message-style chat between a matched student and tutor, one thread
// per assignment. Messages can carry a tagged video-library clip (resolved
// to a title/url snapshot at send time, the same pattern used for lesson
// assignments), so a tutor can point a student at a technique reference
// mid-conversation.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'chat.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, messages: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, messages: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listForAssignment(assignmentId) {
  return load().messages
    .filter((m) => m.assignmentId === Number(assignmentId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// `attachment` is a file the sender uploaded through /api/chat/upload:
// { url, name, mime, size, kind } where kind is 'image' | 'video' | 'audio'
// | 'file'. The kind is resolved once at send time so the client can pick a
// renderer (inline image, <video>, voice-note player, download link)
// without re-sniffing the mime type on every render.
function send(assignmentId, { senderId, senderRole, text, libraryItem, attachment, replyToId, poll, location }) {
  const db = load();
  const message = {
    id: db.nextId++,
    assignmentId: Number(assignmentId),
    senderId,
    senderRole, // 'student' | 'tutor'
    text: text || '',
    libraryItem: libraryItem ? { id: libraryItem.id, title: libraryItem.title, url: libraryItem.url, href: libraryItem.href || null } : null,
    attachment: attachment
      ? {
        url: attachment.url,
        name: attachment.name || 'attachment',
        mime: attachment.mime || '',
        size: attachment.size || 0,
        kind: attachment.kind || 'file',
      }
      : null,
    replyToId: replyToId ? Number(replyToId) : null,
    poll: poll ? { question: poll.question, options: poll.options.map((text2, i) => ({ id: i + 1, text: text2 })), votes: [] } : null,
    location: location ? { lat: location.lat, lng: location.lng } : null,
    reactions: [],
    deletedForUserIds: [],
    createdAt: new Date().toISOString(),
    readByStudent: senderRole === 'student',
    readByTutor: senderRole === 'tutor',
  };
  db.messages.push(message);
  persist(db);
  return message;
}

function findById(id) {
  return load().messages.find((m) => m.id === Number(id)) || null;
}

// Owner-checked: only the sender can edit their own message.
function editMessage(id, userId, text) {
  const db = load();
  const message = db.messages.find((m) => m.id === Number(id) && m.senderId === userId);
  if (!message || message.deleted) return null;
  message.text = String(text || '').trim();
  message.editedAt = new Date().toISOString();
  persist(db);
  return message;
}

// Soft delete - keeps the row (and its id/position in the thread) so the
// other party sees a "message deleted" placeholder instead of a silent gap,
// matching the convention of the chat apps this UI is modeled on. This is
// "delete for everyone" - callers must check the recipient's readBy flag
// before calling this (see deleteForMe below for the other option).
function deleteMessage(id, userId) {
  const db = load();
  const message = db.messages.find((m) => m.id === Number(id) && m.senderId === userId);
  if (!message) return null;
  message.deleted = true;
  message.text = '';
  message.attachment = null;
  message.libraryItem = null;
  message.poll = null;
  message.location = null;
  message.pinned = false;
  message.deletedAt = new Date().toISOString();
  persist(db);
  return message;
}

// "Delete for me" - hides the message only for the caller; the sender and
// any other participant still see it untouched. Either participant can use
// this on any message (including ones sent to them), unlike deleteMessage
// above which only the sender can invoke.
function deleteForMe(id, userId) {
  const db = load();
  const message = db.messages.find((m) => m.id === Number(id));
  if (!message) return null;
  if (!message.deletedForUserIds.includes(userId)) message.deletedForUserIds.push(userId);
  persist(db);
  return message;
}

// One reaction per user per message - reacting with the same emoji again
// removes it (toggle off), a different emoji replaces the old one.
function addReaction(id, userId, role, emoji) {
  const db = load();
  const message = db.messages.find((m) => m.id === Number(id));
  if (!message || message.deleted) return null;
  if (!Array.isArray(message.reactions)) message.reactions = [];
  const existing = message.reactions.find((r) => r.userId === userId);
  if (existing && existing.emoji === emoji) {
    message.reactions = message.reactions.filter((r) => r.userId !== userId);
  } else if (existing) {
    existing.emoji = emoji;
  } else {
    message.reactions.push({ userId, role, emoji });
  }
  persist(db);
  return message;
}

function removeReaction(id, userId) {
  const db = load();
  const message = db.messages.find((m) => m.id === Number(id));
  if (!message) return null;
  message.reactions = (message.reactions || []).filter((r) => r.userId !== userId);
  persist(db);
  return message;
}

function votePoll(id, userId, optionId) {
  const db = load();
  const message = db.messages.find((m) => m.id === Number(id));
  if (!message || !message.poll) return null;
  message.poll.votes = message.poll.votes.filter((v) => v.userId !== userId);
  message.poll.votes.push({ userId, optionId: Number(optionId) });
  persist(db);
  return message;
}

// Either participant in the thread can pin/unpin - it's a shared bookmark,
// not a mutation of the message's content, so no sender check here (the
// caller already verified the requester is a participant in this thread).
function togglePin(id) {
  const db = load();
  const message = db.messages.find((m) => m.id === Number(id));
  if (!message || message.deleted) return null;
  message.pinned = !message.pinned;
  message.pinnedAt = message.pinned ? new Date().toISOString() : null;
  persist(db);
  return message;
}

function markRead(assignmentId, role) {
  const db = load();
  const field = role === 'student' ? 'readByStudent' : 'readByTutor';
  db.messages
    .filter((m) => m.assignmentId === Number(assignmentId))
    .forEach((m) => { m[field] = true; });
  persist(db);
}

// Inverse of markRead - "mark as unread" from the messages list.
function markUnread(assignmentId, role) {
  const db = load();
  const field = role === 'student' ? 'readByStudent' : 'readByTutor';
  db.messages
    .filter((m) => m.assignmentId === Number(assignmentId))
    .forEach((m) => { m[field] = false; });
  persist(db);
}

// Bulk "delete for me" across an entire thread - backs "Clear chat" and
// "Delete chat" (the latter also hides the thread via store.hideThread).
function clearForUser(assignmentId, userId) {
  const db = load();
  db.messages
    .filter((m) => m.assignmentId === Number(assignmentId))
    .forEach((m) => {
      if (!Array.isArray(m.deletedForUserIds)) m.deletedForUserIds = [];
      if (!m.deletedForUserIds.includes(userId)) m.deletedForUserIds.push(userId);
    });
  persist(db);
}

function unreadCountForRole(assignmentId, role) {
  const field = role === 'student' ? 'readByStudent' : 'readByTutor';
  return listForAssignment(assignmentId).filter((m) => !m[field]).length;
}

module.exports = {
  listForAssignment, send, findById, editMessage, deleteMessage, deleteForMe,
  addReaction, removeReaction, votePoll, togglePin, markRead, markUnread, clearForUser, unreadCountForRole,
};
