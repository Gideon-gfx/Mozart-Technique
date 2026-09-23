// InDrive-style tutor negotiation offers - one row per (broadcast tutor
// request x invited candidate tutor). Mirrors data/marketplaceOffers.js
// (same shape, same lifecycle) but kept as its own file rather than
// generalizing that module, since marketplaceOffers.js's field names
// (performerId/performerUserId) are load-bearing across the whole
// Performance Marketplace and renaming them there would be a much bigger,
// riskier change than this negotiate-flow addition calls for.
//
// This is used ONLY for the "negotiate" (broadcast/InDrive) tutor-request
// path - a student describing what they want and a suggested rate, fanned
// out to every matching tutor. The original "find a tutor, request them
// directly" flow (data/assignments.js's preferredTutorIds + the
// pending-requests accept endpoint) is untouched and keeps its own
// first-request-wins semantics.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'tutorOffers.json');
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

// Expiry is computed lazily on read, same as marketplaceOffers.js - an
// 'invited' offer older than OFFER_EXPIRY_DAYS reads as 'expired' without
// a background job ever having to sweep for it.
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

function listByTutor(tutorId) {
  return load().offers
    .filter((o) => o.tutorId === Number(tutorId))
    .map(withEffectiveStatus)
    .sort((a, b) => new Date(b.invitedAt) - new Date(a.invitedAt));
}

function findById(id) {
  const offer = load().offers.find((o) => o.id === Number(id));
  return offer ? withEffectiveStatus(offer) : null;
}

// `candidates` is the array assignments.generateCandidates returns:
// [{ tutor, distanceKm, ... }].
function createInvites(requestId, suggestedAmountUsd, candidates) {
  const db = load();
  const created = candidates.map(({ tutor, distanceKm }) => {
    const offer = {
      id: db.nextId++,
      requestId: Number(requestId),
      tutorId: tutor.id,
      tutorUserId: tutor.userId,
      status: 'invited',
      suggestedAmountUsd: suggestedAmountUsd != null ? suggestedAmountUsd : null,
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

// Called when a student deletes their own still-pending request - clears
// out every tutor's invite/offer for it too, so nothing orphaned is left
// pointing at a request that no longer exists.
function removeByRequest(requestId) {
  const db = load();
  db.offers = db.offers.filter((o) => o.requestId !== Number(requestId));
  persist(db);
}

module.exports = {
  listByRequest, listByTutor, findById, createInvites,
  accept, counter, decline, select, markOthersNotSelected, removeByRequest,
};
