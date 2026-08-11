// The technique video library - admin and tutor-uploaded reference clips
// (e.g. "how to position your fingers on the strings") organized by subject,
// taggable into a chat message so a tutor can point a student at one
// mid-conversation. An entry is either a self-hosted uploaded file
// (isFile: true, url is a local /uploads/videos path) or a link back to an
// external creator's post - never a downloaded/rehosted copy of someone
// else's content, which would violate platform terms and copyright. When an
// external link goes dead, an admin swaps in a replacement they have the
// rights to rather than any kind of automated re-scrape.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'reels.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, reels: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, reels: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().reels;
}

function listActive({ category, genre } = {}) {
  let list = listAll().filter((r) => r.status === 'active');
  if (category) list = list.filter((r) => r.category === category);
  if (genre) list = list.filter((r) => r.genre === genre);
  return list;
}

function findById(id) {
  return listAll().find((r) => r.id === Number(id)) || null;
}

function create({ title, url, category, genre, addedBy, isFile }) {
  const db = load();
  const reel = {
    id: db.nextId++,
    title,
    url,
    isFile: Boolean(isFile),
    category: category || null,
    genre: genre || null,
    status: 'active',
    addedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.reels.push(reel);
  persist(db);
  return reel;
}

// Used both to edit details and to swap in a replacement link/title when the
// original goes dead - same operation, just re-pointing url/title.
function update(id, { title, url, category, genre, isFile }) {
  const db = load();
  const reel = db.reels.find((r) => r.id === Number(id));
  if (!reel) return null;
  if (title !== undefined) reel.title = title;
  if (url !== undefined) reel.url = url;
  if (category !== undefined) reel.category = category || null;
  if (genre !== undefined) reel.genre = genre || null;
  if (isFile !== undefined) reel.isFile = Boolean(isFile);
  reel.updatedAt = new Date().toISOString();
  persist(db);
  return reel;
}

function setStatus(id, status) {
  const db = load();
  const reel = db.reels.find((r) => r.id === Number(id));
  if (!reel) return null;
  reel.status = status;
  reel.updatedAt = new Date().toISOString();
  persist(db);
  return reel;
}

module.exports = { listAll, listActive, findById, create, update, setStatus };
