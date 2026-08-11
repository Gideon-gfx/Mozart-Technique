// Real-time chat delivery over WebSockets, layered on top of the existing
// REST chat API rather than replacing it: messages are still POSTed and
// persisted the normal way, and this only pushes the already-saved message
// to whoever is currently looking. That means a dropped socket degrades to
// the previous poll-based behaviour instead of losing messages.
//
// Presence doubles as the "should we email them?" signal - if the recipient
// has no live socket for a thread, they aren't watching it, so the message
// is worth an email.
const { WebSocketServer } = require('ws');
const Keygrip = require('keygrip');

// Same cookie name/keys as the cookie-session middleware in server.js. The
// session cookie IS the session (base64 JSON + a signature cookie), so
// verifying it here needs no shared store - just the signing key.
const COOKIE_NAME = 'session';

function sessionKeys() {
  return new Keygrip([process.env.SESSION_SECRET || 'dev-insecure-secret-change-me']);
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

// Returns the signed-in user's id, or null. Rejecting an unsigned or
// tampered cookie matters more here than on a normal route: a socket that
// gets through joins private lesson threads.
function userIdFromCookies(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const value = cookies[COOKIE_NAME];
  const sig = cookies[`${COOKIE_NAME}.sig`];
  if (!value || !sig) return null;
  if (sessionKeys().index(`${COOKIE_NAME}=${value}`, sig) < 0) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    return parsed && parsed.userId ? Number(parsed.userId) : null;
  } catch {
    return null;
  }
}

// assignmentId -> Set of live sockets. A user can have several (two tabs,
// phone + laptop), so this is a set of sockets, not of user ids.
const rooms = new Map();

function roomFor(assignmentId) {
  const key = String(assignmentId);
  if (!rooms.has(key)) rooms.set(key, new Set());
  return rooms.get(key);
}

function leaveAll(socket) {
  rooms.forEach((set, key) => {
    if (set.delete(socket) && set.size === 0) rooms.delete(key);
  });
}

// True when the given user has at least one socket open on this thread -
// i.e. they're looking at it right now and don't need an email.
function isWatching(assignmentId, userId) {
  const set = rooms.get(String(assignmentId));
  if (!set) return false;
  for (const s of set) {
    if (s.userId === Number(userId) && s.readyState === 1) return true;
  }
  return false;
}

function broadcast(assignmentId, payload, { exceptSocket } = {}) {
  const set = rooms.get(String(assignmentId));
  if (!set) return;
  const data = JSON.stringify(payload);
  set.forEach((s) => {
    if (s === exceptSocket) return;
    if (s.readyState === 1) s.send(data);
  });
}

// `canAccess(userId, assignmentId)` is injected so this module doesn't need
// to know about assignments/tutors - server.js already has that logic for
// the REST routes and passes the same check in.
function attach(httpServer, { canAccess }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' });

  // Without this, any server-level error re-emitted onto the WebSocketServer
  // becomes an unhandled 'error' event and takes the whole process down.
  // Chat is a non-critical layer; log and keep serving.
  wss.on('error', (err) => {
    console.error('WebSocket server error (chat continues over polling):', err.message);
  });

  wss.on('connection', (socket, req) => {
    const userId = userIdFromCookies(req.headers.cookie);
    if (!userId) {
      socket.close(4001, 'Not signed in');
      return;
    }
    socket.userId = userId;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'join') {
        const assignmentId = Number(msg.assignmentId);
        if (!canAccess(userId, assignmentId)) {
          socket.send(JSON.stringify({ type: 'error', error: 'Not your conversation.' }));
          return;
        }
        leaveAll(socket);
        socket.assignmentId = assignmentId;
        roomFor(assignmentId).add(socket);
        socket.send(JSON.stringify({ type: 'joined', assignmentId }));
        return;
      }

      // Typing indicators are ephemeral and never persisted - they only go
      // to whoever is already in the room.
      if (msg.type === 'typing' && socket.assignmentId) {
        broadcast(socket.assignmentId, {
          type: 'typing', userId, name: msg.name || '', isTyping: Boolean(msg.isTyping),
        }, { exceptSocket: socket });
      }
    });

    socket.on('close', () => leaveAll(socket));
    socket.on('error', () => leaveAll(socket));
  });

  // Drop sockets that stopped answering, so presence (and therefore the
  // email decision) doesn't count a dead tab as "watching".
  const heartbeat = setInterval(() => {
    wss.clients.forEach((s) => {
      if (s.isAlive === false) { leaveAll(s); return s.terminate(); }
      s.isAlive = false;
      s.ping();
    });
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

module.exports = { attach, broadcast, isWatching };
