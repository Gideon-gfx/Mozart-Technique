// Turns a free-text address into coordinates (plus city/state/country) using
// OpenStreetMap's free Nominatim geocoder (no API key required, unlike
// Google's). Results are cached to disk since Nominatim's usage policy caps
// requests to ~1/sec and the same tutor/student addresses get looked up
// repeatedly.
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'geocode-cache.json');

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function persistCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Returns { lat, lng, city, state, country } or null if the address
// couldn't be resolved. city/state/country back the locality-tier matching
// for online lessons (same city > same state/region > same country).
async function geocodeAddress(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return null;

  const cache = loadCache();
  const key = trimmed.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(trimmed)}`, {
      headers: { 'User-Agent': 'MozartTechnique/1.0 (tutor-matching; contact: emmanuelsolomontenore@gmail.com)' },
    });
    const results = await res.json();
    let coords = null;
    if (results && results.length) {
      const addr = results[0].address || {};
      coords = {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
        city: addr.city || addr.town || addr.village || addr.county || null,
        state: addr.state || addr.region || null,
        country: addr.country || null,
      };
    }
    cache[key] = coords;
    persistCache(cache);
    return coords;
  } catch {
    return null; // best-effort - matching falls back to city-name text matching
  }
}

// Turns real browser-reported coordinates into a city/state/country - used
// when a student/tutor grants location access on signup, so their profile
// reflects where they actually are rather than a typed-in address. Cached
// by rounded coordinates (~100m precision) since repeat lookups from the
// same device land on nearly the same point.
async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;
  const key = `rev:${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  const cache = loadCache();
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`, {
      headers: { 'User-Agent': 'MozartTechnique/1.0 (tutor-matching; contact: emmanuelsolomontenore@gmail.com)' },
    });
    const result = await res.json();
    const addr = (result && result.address) || {};
    const resolved = {
      lat: Number(lat), lng: Number(lng),
      city: addr.city || addr.town || addr.village || addr.county || null,
      state: addr.state || addr.region || null,
      country: addr.country || null,
      // Nominatim's full formatted address (street number, road, etc.) -
      // used where a tutor/student's exact location is meant to be shown,
      // not just their city.
      fullAddress: (result && result.display_name) || null,
    };
    cache[key] = resolved;
    persistCache(cache);
    return resolved;
  } catch {
    return null;
  }
}

// Haversine distance in kilometers between two {lat, lng} points.
function distanceKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Ranks how local an online match is: same city beats same state/region,
// which beats same country, which beats no locality data at all. Used as a
// soft preference for online lessons (never a hard filter, since online
// lessons work regardless of distance).
function localityScore(a, b) {
  if (!a || !b) return 0;
  if (a.city && b.city && a.city.toLowerCase() === b.city.toLowerCase()) return 1;
  if (a.state && b.state && a.state.toLowerCase() === b.state.toLowerCase()) return 0.66;
  if (a.country && b.country && a.country.toLowerCase() === b.country.toLowerCase()) return 0.33;
  return 0;
}

module.exports = { geocodeAddress, reverseGeocode, distanceKm, localityScore };
