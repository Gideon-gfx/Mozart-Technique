// Radius + category matching for the Performance Marketplace, kept separate
// from data/marketplaceRequests.js so it stays independently testable. Same
// filter shape as the tutor commuteRadiusKm hard-filter in
// data/assignments.js's scoreTutor: distance beyond the radius is rejected,
// a performer with no geocoded coordinates is tolerated (passes through)
// rather than excluded, since geocoding is best-effort and can fail.
const performers = require('./performers');
const { distanceKm } = require('./geocode');

// Only activation-paid performers are matched: an approved-but-unpaid
// performer 402s on every dashboard route including accept/counter/decline
// (see requireApprovedPerformerApi in server.js), so inviting them would be
// a dead end for the requester.
//
// eventCoords missing (the event address failed to geocode) fails safe to
// zero matches rather than silently matching every performer nationwide -
// mirrors data/assignments.js's scoreTutor, which excludes location-
// dependent candidates rather than including them when a location can't be
// resolved. A performer with no geocoded coordinates of their own is still
// tolerated (sorted last) since we at least know the event's location.
function findMatchingPerformers({ category, eventCoords, radiusKm, limit = 20 }) {
  if (!eventCoords) return [];
  return performers.listApproved()
    .filter((p) => p.activationPaid)
    .filter((p) => !category || (p.categories || []).includes(category))
    .map((p) => ({
      performer: p,
      distanceKm: (p.lat != null && p.lng != null)
        ? distanceKm(eventCoords, { lat: p.lat, lng: p.lng })
        : null,
    }))
    .filter((c) => c.distanceKm == null || c.distanceKm <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, limit);
}

module.exports = { findMatchingPerformers };
