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

function getOrCreateTutorGroupConversation(tutorId, { course, groupName, studentIds = [] } = {}) {
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

function sendMessage(conversationId, { senderId, senderType, senderName, text }) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return null;

  const message = {
    id: (conv.messages.length || 0) + 1,
    senderId,
    senderType,
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
function getMessages(conversationId) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  return conv ? (conv.messages || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) : [];
}

function markRead(conversationId, role) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return;
  const field = role === 'org' ? 'readByOrg' : 'readByTutor';
  conv.messages.forEach((m) => { m[field] = true; });
  persist(db);
}

function getUnreadCount(conversationId, role) {
  const db = load();
  const conv = db.conversations.find((c) => c.id === Number(conversationId));
  if (!conv) return 0;
  const field = role === 'org' ? 'readByOrg' : 'readByTutor';
  return (conv.messages || []).filter((m) => !m[field]).length;
}

module.exports = {
  getOrCreateConversation,
  listForOrganization,
  listForTutor,
  getOrCreateTutorGroupConversation,
  sendMessage,
getMessages,
  setMeetingLink,  findById,
  listAll,
  markRead,
  getUnreadCount,
};
