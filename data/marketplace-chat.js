// Private messages for a confirmed Performance Marketplace booking.  A
// conversation belongs to one marketplace offer, which makes it impossible
// for a requester to accidentally get a second thread with the same
// performer/event by refreshing a screen or retrying a request.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'marketplace-chat.json');

function emptyDb() {
  return { nextId: 1, nextMessageId: 1, conversations: [] };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return emptyDb();
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      ...emptyDb(),
      ...db,
      conversations: Array.isArray(db.conversations) ? db.conversations : [],
    };
  } catch {
    return emptyDb();
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function normalizedConversation(conversation) {
  if (!conversation) return null;
  return {
    ...conversation,
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    lastMessageAt: conversation.lastMessageAt || conversation.createdAt || null,
  };
}

function findById(id) {
  const conversation = load().conversations.find((item) => Number(item.id) === Number(id));
  return normalizedConversation(conversation);
}

function findByOfferId(offerId) {
  const conversation = load().conversations.find((item) => Number(item.offerId) === Number(offerId));
  return normalizedConversation(conversation);
}

// The server verifies that the offer is accepted/selected before it calls
// this.  Store the participant IDs as a snapshot too, but authorization is
// always rechecked against the live request + offer by the route layer.
function getOrCreateConversation({ offer, request, performer }) {
  const db = load();
  let conversation = db.conversations.find((item) => Number(item.offerId) === Number(offer.id));
  if (!conversation) {
    const now = new Date().toISOString();
    conversation = {
      id: db.nextId++,
      offerId: Number(offer.id),
      requestId: Number(request.id),
      requesterId: Number(request.requesterId),
      performerId: Number(performer.id),
      performerUserId: Number(performer.userId),
      requesterName: request.requesterName || 'Requester',
      performerName: performer.name || 'Performer',
      performerPhotoUrl: performer.photoUrl || null,
      eventType: request.eventType || 'Performance booking',
      eventDate: request.eventDate || null,
      createdAt: now,
      lastMessageAt: now,
      messages: [],
    };
    db.conversations.push(conversation);
    persist(db);
  }
  return normalizedConversation(conversation);
}

function listByUserId(userId) {
  return load().conversations
    .filter((conversation) => Number(conversation.requesterId) === Number(userId)
      || Number(conversation.performerUserId) === Number(userId))
    .map(normalizedConversation)
    .sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));
}

function getMessages(conversationId) {
  const conversation = findById(conversationId);
  return conversation
    ? [...conversation.messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    : [];
}

function sendMessage(conversationId, { senderId, senderRole, senderName, text }) {
  const db = load();
  const conversation = db.conversations.find((item) => Number(item.id) === Number(conversationId));
  if (!conversation) return null;
  if (!Array.isArray(conversation.messages)) conversation.messages = [];
  if (!Number.isFinite(Number(db.nextMessageId))) db.nextMessageId = 1;

  const message = {
    id: db.nextMessageId++,
    senderId: Number(senderId),
    senderRole: senderRole === 'performer' ? 'performer' : 'requester',
    senderName: String(senderName || '').trim().slice(0, 160) || 'Mozart Techniques member',
    text: String(text || '').trim(),
    createdAt: new Date().toISOString(),
    readByRequester: senderRole !== 'performer',
    readByPerformer: senderRole === 'performer',
  };
  conversation.messages.push(message);
  conversation.lastMessageAt = message.createdAt;
  persist(db);
  return message;
}

function markRead(conversationId, role) {
  const db = load();
  const conversation = db.conversations.find((item) => Number(item.id) === Number(conversationId));
  if (!conversation) return null;
  if (!Array.isArray(conversation.messages)) conversation.messages = [];
  const field = role === 'performer' ? 'readByPerformer' : 'readByRequester';
  conversation.messages.forEach((message) => { message[field] = true; });
  persist(db);
  return normalizedConversation(conversation);
}

function unreadCount(conversation, role) {
  const field = role === 'performer' ? 'readByPerformer' : 'readByRequester';
  return (conversation.messages || []).filter((message) => !message[field]).length;
}

module.exports = {
  findById,
  findByOfferId,
  getOrCreateConversation,
  listByUserId,
  getMessages,
  sendMessage,
  markRead,
  unreadCount,
};
