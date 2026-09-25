// Performance Marketplace performer profiles. A user applies (musician,
// dancer, theater actor, solo performer, or group/band); an admin reviews
// and approves/rejects, same trust model as data/tutors.js. Once approved,
// a performer must also pay a one-time activation fee before their
// dashboard unlocks (requireApprovedPerformerApi in server.js) - performers
// are brand new to this feature, so unlike tutors there is no grandfathered
// population to migrate.
const fs = require('fs');
const path = require('path');
const { geocodeAddress } = require('./geocode');

const DATA_FILE = path.join(__dirname, 'performers.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, performers: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, performers: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().performers;
}

function listApproved() {
  return listAll().filter((p) => p.status === 'approved' && !p.suspended);
}

function findById(id) {
  return listAll().find((p) => p.id === Number(id)) || null;
}

function findByUserId(userId) {
  return listAll().find((p) => Number(p.userId) === Number(userId)) || null;
}

function slugify(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function findBySlug(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase();
  const all = listAll();
  return all.find((p) => String(p.id) === s || publicSlug(p, all) === s) || all.find((p) => slugify(p.name) === s) || null;
}

function publicSlug(performer, all = listAll()) {
  const used = new Set(all.filter(p => p.slug).map(p => p.slug));
  if (performer.slug) return performer.slug;
  const rows = all.some(p => p.id === performer.id) ? all : [...all, performer];
  for (const p of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
    if (p.slug) continue;
    const base = slugify(p.stageName || p.name) || 'performer';
    let slug = /^\d+$/.test(base) ? `performer-${base}` : base;
    if (used.has(slug)) slug = `${slug}-${p.id}`;
    while (used.has(slug)) slug += '-profile';
    used.add(slug);
    if (p.id === performer.id) return slug;
  }
}

async function apply({
  userId, name, email, phone, performerType, groupSize, categories, city, address,
  travelRadiusKm, bio, experienceYears, qualifications, styleTags, baseRateUsd, rateUnit, hourlyRateUsd, eventRateUsd,
  photoUrl, socialLinks, agreementAccepted,
}) {
  if (performerType === 'group' && (!Number.isInteger(Number(groupSize)) || Number(groupSize) < 2)) throw new Error("Group size can't be lower than 2 and must be a whole number.");
  const db = load();
  const coords = address || city ? await geocodeAddress(address || city) : null;
  const performer = {
    id: db.nextId++,
    userId,
    name,
    email,
    phone: phone || null,
    performerType: performerType === 'group' ? 'group' : 'individual',
    groupSize: performerType === 'group' ? Number(groupSize) : 0,
    categories: Array.isArray(categories) ? categories : [],
    city: city || null,
    address: address || null,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    locality: coords ? { city: coords.city, state: coords.state, country: coords.country } : null,
    travelRadiusKm: Math.max(1, Number(travelRadiusKm) || 25),
    bio: bio || '',
    experienceYears: Number(experienceYears) || 0,
    qualifications: qualifications || '',
    styleTags: Array.isArray(styleTags) ? styleTags : [],
    // Keep the legacy rate fields for old web clients, while retaining two
    // independent prices for the native performer marketplace.
    hourlyRateUsd: Math.max(0, Number(hourlyRateUsd) || (rateUnit === 'per_hour' ? Number(baseRateUsd) : 0) || 0),
    eventRateUsd: Math.max(0, Number(eventRateUsd) || (rateUnit !== 'per_hour' ? Number(baseRateUsd) : 0) || 0),
    baseRateUsd: Math.max(0, Number(baseRateUsd) || Number(eventRateUsd) || Number(hourlyRateUsd) || 0),
    rateUnit: rateUnit === 'per_hour' ? 'per_hour' : 'per_event',
    photoUrl: photoUrl || null,
    galleryPhotos: [],
    videoClips: [],
    socialLinks: {
      instagram: (socialLinks && socialLinks.instagram) || null,
      youtube: (socialLinks && socialLinks.youtube) || null,
      tiktok: (socialLinks && socialLinks.tiktok) || null,
      website: (socialLinks && socialLinks.website) || null,
      facebook: (socialLinks && socialLinks.facebook) || null,
      twitter: (socialLinks && socialLinks.twitter) || null,
    },
    status: 'pending',
    approvedByUserId: null,
    reviewedAt: null,
    suspended: false,
    suspendedAt: null,
    suspendedReason: null,
    activationPaid: false,
    activationPaidAt: null,
    agreementAcceptedAt: agreementAccepted ? new Date().toISOString() : null,
    // The mandatory 14-screen Performer Orientation modal's acceptance
    // record - mirrors data/tutors.js's tutorOrientationAcceptedAt. Null
    // gates the modal open on next dashboard visit.
    performerOrientationAcceptedAt: null,
    performerOrientationVersion: null,
    createdAt: new Date().toISOString(),
  };
  performer.slug = publicSlug(performer, db.performers);
  db.performers.push(performer);
  persist(db);
  return performer;
}

// Records acceptance of the mandatory Performer Orientation modal - see
// data/tutors.js's acknowledgeTutorOrientation for the tutor equivalent.
function acknowledgePerformerOrientation(id, version) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.performerOrientationAcceptedAt = new Date().toISOString();
  performer.performerOrientationVersion = String(version || '').slice(0, 40) || null;
  persist(db);
  return performer;
}

function setStatus(id, status, reviewedByUserId = null) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.status = status;
  performer.reviewedAt = new Date().toISOString();
  if (status === 'approved' && reviewedByUserId) performer.approvedByUserId = Number(reviewedByUserId);
  if (reviewedByUserId) performer.reviewedByUserId = Number(reviewedByUserId);
  persist(db);
  return performer;
}

function suspend(id, reason) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.suspended = true;
  performer.suspendedAt = new Date().toISOString();
  performer.suspendedReason = reason || null;
  persist(db);
  return performer;
}

function unsuspend(id) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.suspended = false;
  performer.suspendedAt = null;
  performer.suspendedReason = null;
  persist(db);
  return performer;
}

function setCategories(id, categories) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.categories = Array.isArray(categories) ? categories : [];
  persist(db);
  return performer;
}

// A performer may keep their public introduction current after approval, but
// this deliberately excludes identity, location, category, approval and
// payment fields.  Those remain part of the reviewed application.
function updateAbout(id, { bio, experienceYears, qualifications, styleTags }) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.bio = typeof bio === 'string' ? bio : performer.bio || '';
  performer.experienceYears = Number.isFinite(Number(experienceYears))
    ? Math.max(0, Math.min(100, Math.floor(Number(experienceYears))))
    : Number(performer.experienceYears) || 0;
  performer.qualifications = typeof qualifications === 'string'
    ? qualifications
    : performer.qualifications || '';
  performer.styleTags = Array.isArray(styleTags) ? styleTags : performer.styleTags || [];
  performer.aboutUpdatedAt = new Date().toISOString();
  persist(db);
  return performer;
}

function setRate(id, { baseRateUsd, rateUnit, hourlyRateUsd, eventRateUsd }) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  if (hourlyRateUsd != null) performer.hourlyRateUsd = Math.max(0, Number(hourlyRateUsd) || 0);
  if (eventRateUsd != null) performer.eventRateUsd = Math.max(0, Number(eventRateUsd) || 0);
  if (baseRateUsd != null) performer.baseRateUsd = Math.max(0, Number(baseRateUsd) || 0);
  if (rateUnit) performer.rateUnit = rateUnit === 'per_hour' ? 'per_hour' : 'per_event';
  // Older pages still read baseRateUsd/rateUnit. Point those at an actual
  // saved rate without overwriting the new, independent hourly/event values.
  if (hourlyRateUsd != null || eventRateUsd != null) {
    const hourly = Number(performer.hourlyRateUsd) || 0;
    const event = Number(performer.eventRateUsd) || 0;
    performer.baseRateUsd = event || hourly;
    performer.rateUnit = event ? 'per_event' : 'per_hour';
  }
  persist(db);
  return performer;
}

function setPhoto(id, photoUrl) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.photoUrl = photoUrl;
  persist(db);
  return performer;
}

function addGalleryPhoto(id, url) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.galleryPhotos = [...(performer.galleryPhotos || []), url];
  persist(db);
  return performer;
}

function removeGalleryPhoto(id, url) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.galleryPhotos = (performer.galleryPhotos || []).filter((u) => u !== url);
  persist(db);
  return performer;
}

function addVideo(id, url) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.videoClips = [...(performer.videoClips || []), url];
  persist(db);
  return performer;
}

function removeVideo(id, url) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.videoClips = (performer.videoClips || []).filter((u) => u !== url);
  persist(db);
  return performer;
}

function setSocialLinks(id, links) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.socialLinks = {
    instagram: links.instagram || null,
    youtube: links.youtube || null,
    tiktok: links.tiktok || null,
    website: links.website || null,
    facebook: links.facebook || null,
    twitter: links.twitter || null,
  };
  persist(db);
  return performer;
}

function setRealLocation(id, { lat, lng, city, state, country, fullAddress }) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.lat = lat;
  performer.lng = lng;
  performer.locality = { city, state, country };
  performer.fullAddress = fullAddress || null;
  persist(db);
  return performer;
}

function markActivationPaid(id) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.activationPaid = true;
  performer.activationPaidAt = new Date().toISOString();
  persist(db);
  return performer;
}

// Records one rating (1-5) from an event requester after a booking - same
// shape as data/tutors.js's addRating, so avgRating/SuperArtist eligibility
// can be computed the same way for both roles.
function addRating(id, { score }) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  performer.ratingSum = (performer.ratingSum || 0) + Number(score);
  performer.ratingCount = (performer.ratingCount || 0) + 1;
  persist(db);
  return performer;
}

function avgRating(performer) {
  return performer.ratingCount ? performer.ratingSum / performer.ratingCount : null;
}

// The "SuperArtist" badge - same bar as tutors' "SuperTutor" (see
// tutors.js's isSuperTutor): a consistently high rating across enough
// bookings to mean something, not a single lucky review.
const SUPER_MIN_RATINGS = 5;
const SUPER_MIN_AVG = 4.8;
function isSuperArtist(performer) {
  const avg = avgRating(performer);
  return Boolean(avg != null && (performer.ratingCount || 0) >= SUPER_MIN_RATINGS && avg >= SUPER_MIN_AVG);
}

module.exports = {
  listAll, listApproved, findById, findByUserId, findBySlug, slugify, publicSlug, apply,
  setStatus, suspend, unsuspend, setCategories, updateAbout, setRate, setPhoto,
  addGalleryPhoto, removeGalleryPhoto, addVideo, removeVideo, setSocialLinks,
  setRealLocation, markActivationPaid, acknowledgePerformerOrientation,
  addRating, avgRating, isSuperArtist,
};
