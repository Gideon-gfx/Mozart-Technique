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

function removeById(contentId) {
  const db = load();
  const index = db.items.findIndex((item) => item.id === Number(contentId));
  if (index === -1) return false;
  db.items.splice(index, 1);
  persist(db);
  return true;
}

module.exports = { listForOrg, create, removeById, load, persist };
