const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'orientation.json');
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { nextId: 1, items: [] }; } }
function save(data) { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }
function list(audience) { return load().items.filter((item) => item.audience === audience).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
// For the admin manage view, which shows posts across every audience (or
// one, via an optional filter) rather than resolving a single viewer's own.
function listAll(audience) {
  const items = load().items;
  return (audience ? items.filter((item) => item.audience === audience) : items).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function add(input) { const data = load(); const item = { id: data.nextId++, ...input, createdAt: new Date().toISOString() }; data.items.push(item); save(data); return item; }
function remove(id) { const data = load(); const index = data.items.findIndex((item) => item.id === Number(id)); if (index < 0) return null; const [item] = data.items.splice(index, 1); save(data); return item; }
function findById(id) { return load().items.find((item) => item.id === Number(id)) || null; }
// One reaction per user per post - reacting with the same emoji again
// removes it (toggle off), a different emoji replaces the old one. Same
// rule as chat.js's addReaction.
function addReaction(id, userId, emoji) {
  const data = load();
  const item = data.items.find((entry) => entry.id === Number(id));
  if (!item) return null;
  if (!Array.isArray(item.reactions)) item.reactions = [];
  const existing = item.reactions.find((r) => r.userId === userId);
  if (existing && existing.emoji === emoji) item.reactions = item.reactions.filter((r) => r.userId !== userId);
  else if (existing) existing.emoji = emoji;
  else item.reactions.push({ userId, emoji });
  save(data);
  return item;
}
function addComment(id, { userId, userName, text }) {
  const data = load();
  const item = data.items.find((entry) => entry.id === Number(id));
  if (!item) return null;
  if (!Array.isArray(item.comments)) item.comments = [];
  const nextCommentId = (item.comments.reduce((max, c) => Math.max(max, c.id), 0) || 0) + 1;
  const comment = { id: nextCommentId, userId, userName, text, createdAt: new Date().toISOString() };
  item.comments.push(comment);
  save(data);
  return item;
}

// Comment author or an admin only - checked by the route, this just does
// the removal once that's confirmed.
function removeComment(id, commentId) {
  const data = load();
  const item = data.items.find((entry) => entry.id === Number(id));
  if (!item || !Array.isArray(item.comments)) return null;
  const index = item.comments.findIndex((c) => c.id === Number(commentId));
  if (index < 0) return null;
  item.comments.splice(index, 1);
  save(data);
  return item;
}

module.exports = { list, listAll, add, remove, findById, addReaction, addComment, removeComment };
