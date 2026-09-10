// Store orders. Created in 'pending_payment' status the moment a Stripe
// Checkout Session is initiated, then confirmed (or flagged) by the
// checkout-success route once Stripe reports the session as paid - see
// server.js's /api/store/checkout and /api/store/checkout/success. Every
// item snapshots the product/color/price it was bought at, so later edits
// to the product never change historical orders.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'orders.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, orderSequenceByDay: {}, orders: [] };
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!db.orderSequenceByDay) db.orderSequenceByDay = {};
    return db;
  } catch {
    return { nextId: 1, orderSequenceByDay: {}, orders: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function nextOrderNumber(db) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = (db.orderSequenceByDay[day] || 0) + 1;
  db.orderSequenceByDay[day] = seq;
  return `MZT-${day}-${String(seq).padStart(4, '0')}`;
}

const ONGOING_STATUSES = ['paid', 'processing', 'shipped', 'payment_flagged'];
const COMPLETED_STATUSES = ['delivered'];
const CANCELLED_STATUSES = ['cancelled'];

function createPending({ userId, items, addressId, addressSnapshot, subtotalUsd, totalUsd, displayCurrency, displaySymbol, displayTotal }) {
  const db = load();
  const order = {
    id: db.nextId++,
    orderNumber: nextOrderNumber(db),
    userId,
    items,
    addressId,
    addressSnapshot,
    subtotalUsd: Number(subtotalUsd) || 0,
    totalUsd: Number(totalUsd) || 0,
    displayCurrency: displayCurrency || 'USD',
    displaySymbol: displaySymbol || '$',
    displayTotal: Number(displayTotal) || Number(totalUsd) || 0,
    status: 'pending_payment',
    statusHistory: [{ status: 'pending_payment', message: 'Order created, awaiting payment.', at: new Date().toISOString() }],
    stripeSessionId: null,
    stripePaymentIntentId: null,
    flaggedForAdmin: false,
    flagReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.orders.push(order);
  persist(db);
  return order;
}

function findById(id) {
  return load().orders.find((o) => o.id === Number(id)) || null;
}

function findByOrderNumber(orderNumber) {
  return load().orders.find((o) => o.orderNumber === orderNumber) || null;
}

function findByStripeSession(sessionId) {
  return load().orders.find((o) => o.stripeSessionId === sessionId) || null;
}

function attachStripeSession(id, sessionId) {
  const db = load();
  const order = db.orders.find((o) => o.id === Number(id));
  if (!order) return null;
  order.stripeSessionId = sessionId;
  order.updatedAt = new Date().toISOString();
  persist(db);
  return order;
}

function markPaid(id, { paymentIntentId } = {}) {
  const db = load();
  const order = db.orders.find((o) => o.id === Number(id));
  if (!order) return null;
  order.status = 'paid';
  order.stripePaymentIntentId = paymentIntentId || order.stripePaymentIntentId;
  order.statusHistory.push({ status: 'paid', message: 'Payment received. Your order is being processed.', at: new Date().toISOString() });
  order.updatedAt = new Date().toISOString();
  persist(db);
  return order;
}

function markFlagged(id, reason) {
  const db = load();
  const order = db.orders.find((o) => o.id === Number(id));
  if (!order) return null;
  order.status = 'payment_flagged';
  order.flaggedForAdmin = true;
  order.flagReason = reason || 'Needs manual review.';
  order.statusHistory.push({ status: 'payment_flagged', message: 'Payment received. Your order is being processed.', at: new Date().toISOString() });
  order.updatedAt = new Date().toISOString();
  persist(db);
  return order;
}

function setStatus(id, status, message) {
  const db = load();
  const order = db.orders.find((o) => o.id === Number(id));
  if (!order) return null;
  order.status = status;
  if (status !== 'payment_flagged') order.flaggedForAdmin = false;
  order.statusHistory.push({ status, message: message || `Order status updated to ${status}.`, at: new Date().toISOString() });
  order.updatedAt = new Date().toISOString();
  persist(db);
  return order;
}

function listByUser(userId, { includePending = false } = {}) {
  return load().orders
    .filter((o) => o.userId === Number(userId))
    .filter((o) => includePending || o.status !== 'pending_payment')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listAll({ status } = {}) {
  let orders = load().orders;
  if (status) orders = orders.filter((o) => o.status === status);
  return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  createPending, findById, findByOrderNumber, findByStripeSession, attachStripeSession,
  markPaid, markFlagged, setStatus, listByUser, listAll,
  ONGOING_STATUSES, COMPLETED_STATUSES, CANCELLED_STATUSES,
};
