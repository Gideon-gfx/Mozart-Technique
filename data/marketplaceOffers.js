// One row per (marketplace request x invited performer) - the performer's
// private response to a booking request. Structured offers only (no chat
// thread): a performer accepts the proposed amount as-is, counters with
// their own amount + a short note, or declines. The requester then reviews
// every accepted/countered offer and selects one (see selectOffer in
// data/marketplaceRequests.js), which flips every sibling offer on the same
// request to 'not_selected'.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'marketplaceOffers.json');
const OFFER_EXPIRY_DAYS = 7;

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, offers: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, offers: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// Expiry is computed lazily on read rather than by a timer/cron - an
// 'invited' offer older than OFFER_EXPIRY_DAYS reads as 'expired' without
// ever being written back, which keeps this module free of background jobs.
function effectiveStatus(offer) {
  if (offer.status !== 'invited') return offer.status;
  const ageMs = Date.now() - new Date(offer.invitedAt).getTime();
  if (ageMs > OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000) return 'expired';
  return 'invited';
}

function withEffectiveStatus(offer) {
  return { ...offer, status: effectiveStatus(offer) };
}

function listByRequest(requestId) {
  return load().offers
    .filter((o) => o.requestId === Number(requestId))
    .map(withEffectiveStatus)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

function listByPerformer(performerId) {
  return load().offers
    .filter((o) => o.performerId === Number(performerId))
    .map(withEffectiveStatus)
    .sort((a, b) => new Date(b.invitedAt) - new Date(a.invitedAt));
}

function findById(id) {
  const offer = load().offers.find((o) => o.id === Number(id));
  return offer ? withEffectiveStatus(offer) : null;
}

// `matches` is the array returned by marketplaceMatching.findMatchingPerformers:
// [{ performer, distanceKm }].
function createInvites(requestId, proposedAmountUsd, matches) {
  const db = load();
  const created = matches.map(({ performer, distanceKm }) => {
    const offer = {
      id: db.nextId++,
      requestId: Number(requestId),
      performerId: performer.id,
      performerUserId: performer.userId,
      status: 'invited',
      proposedAmountUsd,
      counterAmountUsd: null,
      counterNote: null,
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      invitedAt: new Date().toISOString(),
      respondedAt: null,
    };
    db.offers.push(offer);
    return offer;
  });
  persist(db);
  return created;
}

function accept(id) {
  const db = load();
  const offer = db.offers.find((o) => o.id === Number(id));
  if (!offer) return null;
  offer.status = 'accepted';
  offer.respondedAt = new Date().toISOString();
  persist(db);
  return offer;
}

function counter(id, { amountUsd, note }) {
  const db = load();
  const offer = db.offers.find((o) => o.id === Number(id));
  if (!offer) return null;
  offer.status = 'countered';
  offer.counterAmountUsd = Math.max(0, Number(amountUsd) || 0);
  offer.counterNote = String(note || '').trim().slice(0, 400);
  offer.respondedAt = new Date().toISOString();
  persist(db);
  return offer;
}

function decline(id) {
  const db = load();
  const offer = db.offers.find((o) => o.id === Number(id));
  if (!offer) return null;
  offer.status = 'declined';
  offer.respondedAt = new Date().toISOString();
  persist(db);
  return offer;
}

function select(id) {
  const db = load();
  const offer = db.offers.find((o) => o.id === Number(id));
  if (!offer) return null;
  offer.status = 'selected';
  persist(db);
  return offer;
}

function markOthersNotSelected(requestId, keepOfferId) {
  const db = load();
  db.offers
    .filter((o) => o.requestId === Number(requestId) && o.id !== Number(keepOfferId))
    .forEach((o) => { if (o.status === 'accepted' || o.status === 'countered' || o.status === 'invited') o.status = 'not_selected'; });
  persist(db);
}

module.exports = {
  listByRequest, listByPerformer, findById, createInvites,
  accept, counter, decline, select, markOthersNotSelected,
};
