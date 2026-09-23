// Public discovery uses a ~5 km grid unless the tutor explicitly opts in.
module.exports = function tutorMapLocation(tutor) {
  if (!['student_location', 'tutor_studio', 'either'].includes(tutor.inPersonVenue)) return null;
  if (tutor.lat == null || tutor.lng == null || tutor.lat === '' || tutor.lng === '') return null;
  const lat = Number(tutor.lat), lng = Number(tutor.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (tutor.publicExactLocation === true) return { lat, lng, approximate: false };
  return { lat: Math.round(lat * 20) / 20, lng: Math.round(lng * 20) / 20, approximate: true };
};
