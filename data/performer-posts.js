// Public performer portfolio posts.  A post can be a caption-only update,
// a photo with its caption, or a video with its caption.  Reactions and
// comments are kept here rather than on the performer profile so a portfolio
// remains lightweight and posts can be moderated independently later.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'performer-posts.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, posts: [] };
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { nextId: Number(db.nextId) || 1, posts: Array.isArray(db.posts) ? db.posts : [] };
  } catch {
    return { nextId: 1, posts: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return [...load().posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listByPerformer(performerId) {
  return listAll().filter((post) => Number(post.performerId) === Number(performerId));
}

function findById(id) {
  return load().posts.find((post) => Number(post.id) === Number(id)) || null;
}

function create({ performerId, text, mediaUrl, mediaType }) {
  const db = load();
  const cleanText = String(text || '').trim().slice(0, 1500);
  const cleanUrl = String(mediaUrl || '').trim() || null;
  if (!cleanText && !cleanUrl) return null;
  const post = {
    id: db.nextId++,
    performerId: Number(performerId),
    text: cleanText,
    mediaUrl: cleanUrl,
    mediaType: cleanUrl && mediaType === 'video' ? 'video' : cleanUrl ? 'image' : 'text',
    reactions: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.posts.push(post);
  persist(db);
  return post;
}

function toggleReaction(postId, userId) {
  const db = load();
  const post = db.posts.find((item) => Number(item.id) === Number(postId));
  if (!post) return null;
  if (!Array.isArray(post.reactions)) post.reactions = [];
  const index = post.reactions.findIndex((reaction) => Number(reaction.userId) === Number(userId));
  if (index >= 0) post.reactions.splice(index, 1);
  else post.reactions.push({ userId: Number(userId), createdAt: new Date().toISOString() });
  post.updatedAt = new Date().toISOString();
  persist(db);
  return post;
}

function addComment(postId, { userId, userName, userPhotoUrl, text }) {
  const db = load();
  const post = db.posts.find((item) => Number(item.id) === Number(postId));
  const cleanText = String(text || '').trim().slice(0, 600);
  if (!post || !cleanText) return null;
  if (!Array.isArray(post.comments)) post.comments = [];
  const nextCommentId = Math.max(0, ...post.comments.map((comment) => Number(comment.id) || 0)) + 1;
  const comment = {
    id: nextCommentId,
    userId: Number(userId),
    userName: String(userName || 'Mozart Techniques member').trim(),
    userPhotoUrl: userPhotoUrl || null,
    text: cleanText,
    createdAt: new Date().toISOString(),
  };
  post.comments.push(comment);
  post.updatedAt = new Date().toISOString();
  persist(db);
  return { post, comment };
}

function remove(postId, performerId) {
  const db = load();
  const index = db.posts.findIndex((post) => Number(post.id) === Number(postId) && Number(post.performerId) === Number(performerId));
  if (index < 0) return false;
  db.posts.splice(index, 1);
  persist(db);
  return true;
}

module.exports = { load, persist, listAll, listByPerformer, findById, create, toggleReaction, addComment, remove };
