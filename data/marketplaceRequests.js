// Performance Marketplace booking requests. A user describes an event
// (type, date, location, radius, proposed amount) and the request fans out
// to matching approved+activated performers as invites (see
// data/marketplaceOffers.js) - each responds independently, then the
// requester picks one. `domain` is always 'performance' today; it exists so
// a future tutor-negotiation build could add domain:'tutor' rows to this
// same table without a schema rewrite - nothing here assumes that usage yet.
const fs = require('fs');
const path = require('path');
const { geocodeAddress, distanceKm } = require('./geocode');
const { findMatchingPerformers } = require('./marketplaceMatching');
const performers = require('./performers');

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

function isSafeMediaUrl(value) {
  const url = String(value || '').trim();
  if (url.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Geocodes the event location once, finds the initial candidate pool (for
// display/record-keeping - the actual invites are created separately by the
// caller via marketplaceOffers.createInvites, mirroring how
// data/assignments.js separates candidate generation from the invite step).
async function create({
  requesterId, requesterName, requesterEmail, requesterPhone,
  eventType, performerCategory, eventDate, eventDurationHours, eventLocation,
  radiusKm, proposedAmountUsd, notes, eventMedia, targetPerformerId,
}) {
  const db = load();
  const coords = eventLocation ? await geocodeAddress(eventLocation) : null;
  // A "Request" button on one specific performer's card/profile skips the
  // broadcast radius match entirely and invites only them - same request
  // record shape either way, so everything downstream (offers, requester's
  // "my requests" list, accept/counter/decline) needs no special-casing.
  const targetPerformer = targetPerformerId ? performers.findById(targetPerformerId) : null;
  const matches = targetPerformer
    ? [{
        performer: targetPerformer,
        distanceKm: (coords && targetPerformer.lat != null && targetPerformer.lng != null)
          ? distanceKm(coords, { lat: targetPerformer.lat, lng: targetPerformer.lng })
          : null,
      }]
    // A broadcast can otherwise invite the requester's own performer
    // profile right alongside everyone else's, if they happen to match
    // their own category + radius - silently skip that one instead of
    // erroring the whole request, same as the explicit "You can't request
    // yourself" above does for a targeted one.
    : findMatchingPerformers({
        category: performerCategory,
        eventCoords: coords,
        radiusKm: Math.max(1, Number(radiusKm) || 25),
      }).filter((m) => m.performer.userId !== requesterId);
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
    eventMedia: Array.isArray(eventMedia) ? eventMedia.filter((item) => item && isSafeMediaUrl(item.url) && ['image', 'video', 'link'].includes(item.type)).slice(0, 6).map((item) => ({ type: item.type, url: String(item.url).trim(), name: String(item.name || '').trim().slice(0, 160) })) : [],
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

// Records the requester's rating of the booked performer on the request
// itself (in addition to the running total on the performer's own profile
// - see performers.js's addRating), so a requester can't rate the same
// booking twice.
function setPerformerRating(id, score) {
  const db = load();
  const request = db.requests.find((r) => r.id === Number(id));
  if (!request) return null;
  request.performerRating = score;
  request.performerRatedAt = new Date().toISOString();
  persist(db);
  return request;
}

module.exports = { listAll, findById, listByRequester, create, setStatus, selectOffer, cancel, setPerformerRating };
