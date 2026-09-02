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
function send(assignmentId, { senderId, senderRole, text, libraryItem, attachment }) {
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
    createdAt: new Date().toISOString(),
    readByStudent: senderRole === 'student',
    readByTutor: senderRole === 'tutor',
  };
  db.messages.push(message);
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

function unreadCountForRole(assignmentId, role) {
  const field = role === 'student' ? 'readByStudent' : 'readByTutor';
  return listForAssignment(assignmentId).filter((m) => !m[field]).length;
}

module.exports = { listForAssignment, send, markRead, unreadCountForRole };
