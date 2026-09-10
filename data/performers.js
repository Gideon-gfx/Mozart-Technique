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
  return listAll().find((p) => String(p.id) === s || slugify(p.name) === s) || null;
}

async function apply({
  userId, name, email, phone, performerType, groupSize, categories, city, address,
  travelRadiusKm, bio, experienceYears, qualifications, styleTags, baseRateUsd, rateUnit,
  photoUrl, socialLinks, agreementAccepted,
}) {
  const db = load();
  const coords = address || city ? await geocodeAddress(address || city) : null;
  const performer = {
    id: db.nextId++,
    userId,
    name,
    email,
    phone: phone || null,
    performerType: performerType === 'group' ? 'group' : 'individual',
    groupSize: performerType === 'group' ? Math.max(2, Number(groupSize) || 2) : null,
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
    baseRateUsd: Math.max(0, Number(baseRateUsd) || 0),
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
    createdAt: new Date().toISOString(),
  };
  db.performers.push(performer);
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

function setRate(id, { baseRateUsd, rateUnit }) {
  const db = load();
  const performer = db.performers.find((p) => p.id === Number(id));
  if (!performer) return null;
  if (baseRateUsd != null) performer.baseRateUsd = Math.max(0, Number(baseRateUsd) || 0);
  if (rateUnit) performer.rateUnit = rateUnit === 'per_hour' ? 'per_hour' : 'per_event';
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

module.exports = {
  listAll, listApproved, findById, findByUserId, findBySlug, slugify, apply,
  setStatus, suspend, unsuspend, setCategories, setRate, setPhoto,
  addGalleryPhoto, removeGalleryPhoto, addVideo, removeVideo, setSocialLinks,
  setRealLocation, markActivationPaid,
};
