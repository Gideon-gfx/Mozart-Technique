const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'payouts.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, payouts: [] };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { nextId: 1, payouts: [] }; }
}
function persist(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function create({ tutorId, tutorUserId, tutorName, amountUsd, payoutDetails }) {
  const db = load();
  const payout = { id: db.nextId++, tutorId, tutorUserId, tutorName, amountUsd, payoutDetails, status: 'requested', requestedAt: new Date().toISOString(), processedAt: null, processedBy: null };
  db.payouts.unshift(payout); persist(db); return payout;
}
function listAll() { return load().payouts; }
function listForTutor(tutorId) { return listAll().filter((item) => item.tutorId === Number(tutorId)); }
function pendingAmountForTutor(tutorId) { return listForTutor(tutorId).filter((item) => item.status === 'requested').reduce((sum, item) => sum + Number(item.amountUsd || 0), 0); }
function process(id, adminId) { const db = load(); const payout = db.payouts.find((item) => item.id === Number(id)); if (!payout || payout.status !== 'requested') return null; payout.status = 'processed'; payout.processedAt = new Date().toISOString(); payout.processedBy = adminId; persist(db); return payout; }
module.exports = { create, listAll, listForTutor, pendingAmountForTutor, process };
