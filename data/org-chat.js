// Organization messaging system
// Supports direct org-to-student/tutor messages and group chats.
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

function normalizeConversation(conv) {
  if (!conv) return null;
  const type = conv.type || (conv.tutorId ? 'direct' : conv.groupName ? 'group' : 'direct');
  const participantList = Array.isArray(conv.participants) ? conv.participants : [];
  if (conv.tutorId && !participantList.some((p) => p.type === 'tutor' && String(p.id) === String(conv.tutorId))) {
    participantList.push({ id: conv.tutorId, type: 'tutor', name: conv.tutorName || 'Tutor' });
  }
  if (conv.studentId && !participantList.some((p) => p.type === 'student' && String(p.id) === String(conv.studentId))) {
    participantList.push({ id: conv.studentId, type: 'student', name: conv.studentName || 'Student' });
  }
  return {
    ...conv,
    type,
    participants: participantList,
    messages: Array.isArray(conv.messages) ? conv.messages : [],
    title: conv.title || conv.groupName || conv.tutorName || conv.studentName || 'Conversation',
    groupImageUrl: conv.groupImageUrl || conv.imageUrl || conv.photoUrl || null,
  };
}

function findDirectConversation(db, orgId, targetType, targetId) {
  const target = String(targetId);
  return db.conversations.find((conv) => {
    const normalized = normalizeConversation(conv);
    if (!normalized || normalized.orgId !== orgId || normalized.type !== 'direct') return false;
    return normalized.participants.some((p) => p.type === targetType && String(p.id) === target);
  });
}

function getOrCreateConversation(orgId, options = {}) {
  const db = load();
  const targetType = options.type === 'student' ? 'student' : options.type === 'tutor' ? 'tutor' : null;

  if (options.groupName || options.members) {
    const members = Array.isArray(options.members) ? options.members : [];
    const title = (options.groupName || 'Group chat').trim() || 'Group chat';
    let conv = db.conversations.find((candidate) => {
      const normalized = normalizeConversation(candidate);
      return normalized && normalized.orgId === orgId && normalized.type === 'group' && normalized.title === title && normalized.participants.length === members.length && normalized.participants.every((participant) => members.some((member) => member.type === participant.type && String(member.id) === String(participant.id)));
    });
    if (!conv) {
      conv = {
        id: db.nextId++,
        orgId,
        type: 'group',
        title,
        groupImageUrl: options.groupImageUrl || null,
        participants: members.map((member) => ({ id: member.id, type: member.type, name: member.name || member.type })),
        messages: [],
        createdAt: new Date().toISOString(),
      };
      db.conversations.push(conv);
      persist(db);
    }
    return normalizeConversation(conv);
  }

  if (targetType && (options.tutorId || options.studentId)) {
    const targetId = options.tutorId || options.studentId;
    let conv = findDirectConversation(db, orgId, targetType, targetId);
    if (!conv) {
      conv = {
        id: db.nextId++,
        orgId,
        type: 'direct',
        title: options.title || 'Conversation',
        tutorId: targetType === 'tutor' ? Number(targetId) : null,
        studentId: targetType === 'student' ? Number(targetId) : null,
        participants: [{ id: Number(targetId), type: targetType, name: options.name || (targetType === 'tutor' ? 'Tutor' : 'Student') }],
        messages: [],
        createdAt: new Date().toISOString(),
      };
      db.conversations.push(conv);
      persist(db);
    }
    return normalizeConversation(conv);
  }

  if (options.tutorId) {
    return getOrCreateConversation(orgId, { type: 'tutor', tutorId: options.tutorId, title: options.title, name: options.name });
  }

  if (options.studentId) {
    return getOrCreateConversation(orgId, { type: 'student', studentId: options.studentId, title: options.title, name: options.name });
  }

  return null;
}

function getOrCreateTutorGroupConversation(tutorId, { course, groupName, studentIds = [], groupImageUrl } = {}) {
  const db = load();
  const normalizedCourse = String(course || '').trim();
  const normalizedStudentIds = [...new Set(studentIds.map((id) => String(id)))];
  const title = String(groupName || `${normalizedCourse} students`).trim() || 'Course group chat';
  let conv = db.conversations.find((candidate) => {
    const normalized = normalizeConversation(candidate);
    return normalized && normalized.type === 'tutor-group' && String(normalized.tutorId) === String(tutorId) && normalized.course === normalizedCourse && normalized.title === title;
  });
  if (!conv) {
    conv = {
      id: db.nextId++,
      type: 'tutor-group',
      tutorId: Number(tutorId),
      course: normalizedCourse,
      title,
      groupImageUrl: groupImageUrl || null,
      participants: [
        { id: Number(tutorId), type: 'tutor', name: 'Tutor' },
        ...normalizedStudentIds.map((id) => ({ id, type: 'student', name: 'Student' })),
      ],
      messages: [],
      createdAt: new Date().toISOString(),
    };
    db.conversations.push(conv);
    persist(db);
  }
  return normalizeConversation(conv);
}

function listForOrganization(orgId) {
  return load()
    .conversations.filter((c) => c.orgId === orgId)
    .map((conv) => normalizeConversation(conv))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listForTutor(tutorId) {
  return load()
    .conversations.filter((c) => normalizeConversation(c) && normalizeConversation(c).participants.some((p) => p.type === 'tutor' && String(p.id) === String(tutorId)))
    .map((conv) => normalizeConversation(conv))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listForStudent(studentId) {
  return load()
    .conversations.filter((c) => normalizeConversation(c) && normalizeConversation(c).participants.some((p) => p.type === 'student' && String(p.id) === String(studentId)))
    .map((conv) => normalizeConversation(conv))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function sendMessage(conversationId, { senderId, senderType, senderName, text, attachment, replyToId, poll, location }) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return null;

  const message = {
    id: (conv.messages.length || 0) + 1,
    senderId,
    senderType,
    senderName,
    text: text || '',
    attachment: attachment || null,
    replyToId: replyToId ? Number(replyToId) : null,
    poll: poll ? { question: poll.question, options: poll.options.map((text2, i) => ({ id: i + 1, text: text2 })), votes: [] } : null,
    location: location ? { lat: location.lat, lng: location.lng } : null,
    reactions: [],
    deletedForUserIds: [],
    createdAt: new Date().toISOString(),
    readByOrg: senderType === 'org',
    readByTutor: senderType === 'tutor',
    readByStudent: senderType === 'student',
  };
  conv.messages.push(message);
  persist(db);
  return message;
}

// Owner-checked: only the sender can edit their own message.
function editMessage(conversationId, messageId, userId, text) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  const message = conv && conv.messages.find((m) => m.id === Number(messageId) && m.senderId === userId);
  if (!message || message.deleted) return null;
  message.text = String(text || '').trim();
  message.editedAt = new Date().toISOString();
  persist(db);
  return message;
}

// Soft delete ("delete for everyone") - same shape as data/chat.js: keeps
// the row so the placeholder shows in place, only the sender can invoke it,
// and callers must check the recipient's readBy flag first (see the
// participantRoleFor-driven route in server.js).
function deleteMessage(conversationId, messageId, userId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  const message = conv && conv.messages.find((m) => m.id === Number(messageId) && m.senderId === userId);
  if (!message) return null;
  message.deleted = true;
  message.text = '';
  message.attachment = null;
  message.poll = null;
  message.location = null;
  message.pinned = false;
  message.deletedAt = new Date().toISOString();
  persist(db);
  return message;
}

// "Delete for me" - hides the message only for the caller.
function deleteForMe(conversationId, messageId, userId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  const message = conv && conv.messages.find((m) => m.id === Number(messageId));
  if (!message) return null;
  if (!Array.isArray(message.deletedForUserIds)) message.deletedForUserIds = [];
  if (!message.deletedForUserIds.includes(userId)) message.deletedForUserIds.push(userId);
  persist(db);
  return message;
}

// One reaction per user per message - reacting with the same emoji again
// removes it, a different emoji replaces the old one.
function addReaction(conversationId, messageId, userId, role, emoji) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  const message = conv && conv.messages.find((m) => m.id === Number(messageId));
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

function removeReaction(conversationId, messageId, userId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  const message = conv && conv.messages.find((m) => m.id === Number(messageId));
  if (!message) return null;
  message.reactions = (message.reactions || []).filter((r) => r.userId !== userId);
  persist(db);
  return message;
}

function votePoll(conversationId, messageId, userId, optionId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  const message = conv && conv.messages.find((m) => m.id === Number(messageId));
  if (!message || !message.poll) return null;
  message.poll.votes = message.poll.votes.filter((v) => v.userId !== userId);
  message.poll.votes.push({ userId, optionId: Number(optionId) });
  persist(db);
  return message;
}

// Any participant can pin/unpin - a shared bookmark, not a content mutation
// (mirrors data/chat.js's togglePin - the caller already verified the
// requester is a participant in this conversation).
function togglePin(conversationId, messageId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  const message = conv && conv.messages.find((m) => m.id === Number(messageId));
  if (!message || message.deleted) return null;
  message.pinned = !message.pinned;
  message.pinnedAt = message.pinned ? new Date().toISOString() : null;
  persist(db);
  return message;
}

function listAll() {
  return load().conversations.map((conversation) => normalizeConversation(conversation));
}
function findById(conversationId) {
  const conv = load().conversations.find((item) => Number(item.id) === Number(conversationId));
  return conv ? normalizeConversation(conv) : null;
}
function setMeetingLink(conversationId, meetingLink) {
  const db = load();
  const conv = db.conversations.find((entry) => entry.id === Number(conversationId));
  if (!conv) return null;
  conv.meetingLink = meetingLink || null;
  conv.meetingUpdatedAt = new Date().toISOString();
  persist(db);
  return normalizeConversation(conv);
}
function removeParticipant(conversationId, participantId, participantType) {
  const db = load();
  const conv = db.conversations.find((entry) => Number(entry.id) === Number(conversationId));
  if (!conv) return null;
  conv.participants = (conv.participants || []).filter((entry) => !(String(entry.id) === String(participantId) && entry.type === participantType));
  persist(db);
  return normalizeConversation(conv);
}
function getMessages(conversationId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  return conv ? (conv.messages || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) : [];
}

const READ_FIELD_BY_ROLE = { org: 'readByOrg', tutor: 'readByTutor', student: 'readByStudent' };

function markRead(conversationId, role) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return;
  const field = READ_FIELD_BY_ROLE[role] || 'readByTutor';
  conv.messages.forEach((m) => { m[field] = true; });
  persist(db);
}

function getUnreadCount(conversationId, role) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return 0;
  const field = READ_FIELD_BY_ROLE[role] || 'readByTutor';
  return (conv.messages || []).filter((m) => !m[field]).length;
}

// Inverse of markRead - "mark as unread" from the messages list.
function markUnread(conversationId, role) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return;
  const field = READ_FIELD_BY_ROLE[role] || 'readByTutor';
  conv.messages.forEach((m) => { m[field] = false; });
  persist(db);
}

// Bulk "delete for me" across an entire thread - backs "Clear chat" and
// "Delete chat" (the latter also hides the thread via store.hideThread).
function clearForUser(conversationId, userId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return;
  conv.messages.forEach((m) => {
    if (!Array.isArray(m.deletedForUserIds)) m.deletedForUserIds = [];
    if (!m.deletedForUserIds.includes(userId)) m.deletedForUserIds.push(userId);
  });
  persist(db);
}

module.exports = {
  getOrCreateConversation,
  listForOrganization,
  listForTutor,
  listForStudent,
  getOrCreateTutorGroupConversation,
  sendMessage,
  getMessages,
  editMessage, deleteMessage, deleteForMe,
  addReaction, removeReaction, votePoll, togglePin,
  setMeetingLink, removeParticipant, findById,
  listAll,
  markRead, markUnread, clearForUser,
  getUnreadCount,
};
