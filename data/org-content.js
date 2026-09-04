const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'org-content.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, items: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, items: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listForOrg(orgId) {
  const id = Number(orgId);
  return load()
    .items.filter((item) => Number(item.orgId) === id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function create({ orgId, type, title, text, url, fileUrl, coverUrl, category, visibility, folderId, createdByUserId, createdByName }) {
  const db = load();
  const item = {
    id: db.nextId++,
    orgId: Number(orgId),
    type: type || 'info',
    title: String(title || '').trim() || 'Untitled update',
    text: String(text || '').trim(),
    url: url || null,
    fileUrl: fileUrl || null,
    coverUrl: coverUrl || null,
    category: category || null,
    visibility: visibility || 'general',
    folderId: folderId ? Number(folderId) : null,
    createdByUserId: Number(createdByUserId),
    createdByName: String(createdByName || '').trim() || 'Organization',
    createdAt: new Date().toISOString(),
  };
  db.items.push(item);
  persist(db);
  return item;
}

function updateById(contentId, changes) {
  const db = load();
  const item = db.items.find((entry) => entry.id === Number(contentId));
  if (!item) return null;
  const allowed = ['title', 'category', 'url', 'type', 'visibility', 'folderId'];
  allowed.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) return;
    if (key === 'folderId') item.folderId = changes.folderId ? Number(changes.folderId) : null;
    else if (key === 'title') item.title = String(changes.title || '').trim() || item.title;
    else if (key === 'category' || key === 'url') item[key] = changes[key] ? String(changes[key]).trim() : null;
    else if (key === 'type') item.type = ['info', 'photo', 'video', 'document'].includes(changes.type) ? changes.type : item.type;
    else if (key === 'visibility') item.visibility = changes.visibility === 'shared' ? 'shared' : 'general';
  });
  item.updatedAt = new Date().toISOString();
  persist(db);
  return item;
}
function removeById(contentId) {
  const db = load();
  const index = db.items.findIndex((item) => item.id === Number(contentId));
  if (index === -1) return false;
  db.items.splice(index, 1);
  persist(db);
  return true;
}

module.exports = { listForOrg, create, updateById, removeById, load, persist };
