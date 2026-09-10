// Performance Marketplace booking requests. A user describes an event
// (type, date, location, radius, proposed amount) and the request fans out
// to matching approved+activated performers as invites (see
// data/marketplaceOffers.js) - each responds independently, then the
// requester picks one. `domain` is always 'performance' today; it exists so
// a future tutor-negotiation build could add domain:'tutor' rows to this
// same table without a schema rewrite - nothing here assumes that usage yet.
const fs = require('fs');
const path = require('path');
const { geocodeAddress } = require('./geocode');
const { findMatchingPerformers } = require('./marketplaceMatching');

const DATA_FILE = path.join(__dirname, 'marketplaceRequests.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, requests: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, requests: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().requests;
}

function findById(id) {
  return listAll().find((r) => r.id === Number(id)) || null;
}

function listByRequester(userId) {
  return listAll()
    .filter((r) => r.requesterId === Number(userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Geocodes the event location once, finds the initial candidate pool (for
// display/record-keeping - the actual invites are created separately by the
// caller via marketplaceOffers.createInvites, mirroring how
// data/assignments.js separates candidate generation from the invite step).
async function create({
  requesterId, requesterName, requesterEmail, requesterPhone,
  eventType, performerCategory, eventDate, eventDurationHours, eventLocation,
  radiusKm, proposedAmountUsd, notes,
}) {
  const db = load();
  const coords = eventLocation ? await geocodeAddress(eventLocation) : null;
  const matches = findMatchingPerformers({
    category: performerCategory,
    eventCoords: coords,
    radiusKm: Math.max(1, Number(radiusKm) || 25),
  });
  const request = {
    id: db.nextId++,
    domain: 'performance',
    requesterId,
    requesterName,
    requesterEmail,
    requesterPhone: requesterPhone || null,
    eventType,
    performerCategory,
    eventDate: eventDate || null,
    eventDurationHours: Math.max(0.5, Number(eventDurationHours) || 1),
    eventLocation,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    locality: coords ? { city: coords.city, state: coords.state, country: coords.country } : null,
    radiusKm: Math.max(1, Number(radiusKm) || 25),
    proposedAmountUsd: Math.max(0, Number(proposedAmountUsd) || 0),
    notes: notes || '',
    candidatePerformerIds: matches.map((m) => m.performer.id),
    status: 'open', // open | closed | cancelled
    selectedOfferId: null,
    selectedPerformerId: null,
    selectedAt: null,
    createdAt: new Date().toISOString(),
  };
  db.requests.push(request);
  persist(db);
  return { request, matches };
}

function setStatus(id, status) {
  const db = load();
  const request = db.requests.find((r) => r.id === Number(id));
  if (!request) return null;
  request.status = status;
  persist(db);
  return request;
}

function selectOffer(id, offer) {
  const db = load();
  const request = db.requests.find((r) => r.id === Number(id));
  if (!request) return null;
  request.status = 'closed';
  request.selectedOfferId = offer.id;
  request.selectedPerformerId = offer.performerId;
  request.selectedAt = new Date().toISOString();
  persist(db);
  return request;
}

function cancel(id) {
  return setStatus(id, 'cancelled');
}

module.exports = { listAll, findById, listByRequester, create, setStatus, selectOffer, cancel };
