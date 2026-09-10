// Store product reviews. One review per user per product - a second
// submission should PUT the existing one instead of creating another (see
// findByUserAndProduct, used by server.js to 409 a duplicate POST). Admin
// replies are appended in place, mirroring the support-thread reply
// pattern already used elsewhere in this app.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'productReviews.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, nextReplyId: 1, reviews: [] };
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!db.nextReplyId) db.nextReplyId = 1;
    return db;
  } catch {
    return { nextId: 1, nextReplyId: 1, reviews: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listByProduct(productId) {
  return load().reviews
    .filter((r) => r.productId === Number(productId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listByUser(userId) {
  return load().reviews
    .filter((r) => r.userId === Number(userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function findById(id) {
  return load().reviews.find((r) => r.id === Number(id)) || null;
}

function findByUserAndProduct(userId, productId) {
  return load().reviews.find((r) => r.userId === Number(userId) && r.productId === Number(productId)) || null;
}

function create({ productId, userId, userName, rating, text }) {
  const db = load();
  const review = {
    id: db.nextId++,
    productId: Number(productId),
    userId: Number(userId),
    userName: String(userName || 'Mozart Techniques user').slice(0, 80),
    rating: Math.min(5, Math.max(1, Math.round(Number(rating) || 5))),
    text: String(text || '').trim().slice(0, 2000),
    replies: [],
    createdAt: new Date().toISOString(),
    editedAt: null,
  };
  db.reviews.push(review);
  persist(db);
  return review;
}

function update(id, userId, { rating, text }) {
  const db = load();
  const review = db.reviews.find((r) => r.id === Number(id) && r.userId === Number(userId));
  if (!review) return null;
  if (rating != null) review.rating = Math.min(5, Math.max(1, Math.round(Number(rating))));
  if (text != null) review.text = String(text).trim().slice(0, 2000);
  review.editedAt = new Date().toISOString();
  persist(db);
  return review;
}

function remove(id, userId) {
  const db = load();
  const index = db.reviews.findIndex((r) => r.id === Number(id) && r.userId === Number(userId));
  if (index < 0) return false;
  db.reviews.splice(index, 1);
  persist(db);
  return true;
}

function addReply(id, { adminId, adminName, text }) {
  const db = load();
  const review = db.reviews.find((r) => r.id === Number(id));
  if (!review) return null;
  review.replies.push({
    id: db.nextReplyId++,
    adminId,
    adminName: adminName || 'Mozart Techniques',
    text: String(text || '').trim().slice(0, 2000),
    createdAt: new Date().toISOString(),
  });
  persist(db);
  return review;
}

function avgRating(productId) {
  const reviews = listByProduct(productId);
  if (!reviews.length) return 0;
  return Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10;
}

function countFor(productId) {
  return listByProduct(productId).length;
}

module.exports = { listByProduct, listByUser, findById, findByUserAndProduct, create, update, remove, addReply, avgRating, countFor };
