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

function create({ orgId, type, title, text, url, fileUrl, coverUrl, category, visibility, folderId, createdByUserId, createdByName, libraryItem, requiresSubmission, replyToId }) {
  const db = load();
  const item = {
    id: db.nextId++,
    orgId: Number(orgId),
    type: type || 'info',
    title: String(title || '').trim() || 'Untitled update',
    // Doubles as the org's note/instructions on a library upload (shown
    // alongside the file/link wherever the item is browsed), and as a
    // feed/announcement's body text - same field, different use depending
    // on `libraryItem`.
    text: String(text || '').trim(),
    url: url || null,
    fileUrl: fileUrl || null,
    coverUrl: coverUrl || null,
    category: category || null,
    visibility: visibility || 'general',
    folderId: folderId ? Number(folderId) : null,
    // Distinguishes a library upload (document/video/photo meant to be
    // browsed in the General/Shared/Mine library tabs) from a feed post or
    // announcement (which uses this same create() but was never meant to
    // show up there). Was previously dropped here entirely - the caller
    // always passed it, but this destructuring never picked it up, so
    // GET /api/organizations/library's `item.libraryItem === true` filter
    // matched nothing at all, for anyone, ever.
    libraryItem: Boolean(libraryItem),
    // Marks a library item as a form/document every tutor who can see it
    // is expected to send back (e.g. "Every tutor must fill this form") -
    // purely informational for the UI, doesn't gate anything server-side.
    requiresSubmission: Boolean(requiresSubmission),
    // Set only on a tutor's submission *back* for a library item - never
    // set on the library item itself. Submissions are plain org-content
    // rows too (createdByUserId is the submitting tutor's user id), just
    // never flagged libraryItem, so they never show up as browsable
    // library entries on their own; they're only reached via
    // replyToId-scoped submission routes.
    replyToId: replyToId ? Number(replyToId) : null,
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
  const allowed = ['title', 'category', 'url', 'type', 'visibility', 'folderId', 'text', 'requiresSubmission'];
  allowed.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) return;
    if (key === 'folderId') item.folderId = changes.folderId ? Number(changes.folderId) : null;
    else if (key === 'title') item.title = String(changes.title || '').trim() || item.title;
    else if (key === 'category' || key === 'url') item[key] = changes[key] ? String(changes[key]).trim() : null;
    else if (key === 'type') item.type = ['info', 'photo', 'video', 'document'].includes(changes.type) ? changes.type : item.type;
    else if (key === 'visibility') item.visibility = changes.visibility === 'shared' ? 'shared' : 'general';
    else if (key === 'text') item.text = String(changes.text || '').trim();
    else if (key === 'requiresSubmission') item.requiresSubmission = Boolean(changes.requiresSubmission);
  });
  item.updatedAt = new Date().toISOString();
  persist(db);
  return item;
}

// All submissions tutors have sent back for one library item - org-owner
// view, newest first.
function listSubmissionsFor(itemId) {
  const id = Number(itemId);
  return load().items
    .filter((item) => Number(item.replyToId) === id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function removeById(contentId) {
  const db = load();
  const index = db.items.findIndex((item) => item.id === Number(contentId));
  if (index === -1) return false;
  db.items.splice(index, 1);
  persist(db);
  return true;
}

module.exports = { listForOrg, create, updateById, removeById, listSubmissionsFor, load, persist };
