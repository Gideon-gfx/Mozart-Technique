// Which cities the platform currently operates in, per country. A country
// not listed here is unrestricted - every city/town is allowed (this is the
// default for the US, Canada, and everywhere else we haven't explicitly
// scoped down yet). Nigeria is launched in four cities only.
//
// The 4th Nigerian city defaults to Kano (the country's next-largest city
// after Lagos/Abuja/Port Harcourt) - change this list if a different city
// was actually intended.
//
// Restricted countries are matched by STATE, not the raw reverse-geocoded
// city string: Nominatim's Nigerian address resolution frequently returns
// the local government area/neighborhood as "city" (e.g. "Shomolu" or
// "Ikeja" for someone standing in Lagos, not "Lagos" itself), which would
// wrongly reject real residents of an allowed city under an exact-string
// match. Each Nigerian launch city is coterminous with (or the capital of)
// a single state, so matching on state is reliable where matching on the
// LGA-level city name isn't.
const RESTRICTED_LOCATIONS_BY_COUNTRY = {
  Nigeria: [
    { city: 'Lagos', state: 'Lagos' },
    { city: 'Port Harcourt', state: 'Rivers' },
    { city: 'Abuja', state: 'Federal Capital Territory' },
    { city: 'Kano', state: 'Kano' },
  ],
};

function getAllowedCities(country) {
  const list = RESTRICTED_LOCATIONS_BY_COUNTRY[country];
  return list ? list.map((l) => l.city) : null; // null = unrestricted
}

function isCityAllowed(country, { city, state } = {}) {
  const list = RESTRICTED_LOCATIONS_BY_COUNTRY[country];
  if (!list) return true;
  const normalizedState = String(state || '').trim().toLowerCase();
  if (list.some((l) => l.state.toLowerCase() === normalizedState)) return true;
  // Fall back to a direct city match in case a launch city's own name comes
  // back cleanly (it sometimes does).
  const normalizedCity = String(city || '').trim().toLowerCase();
  return list.some((l) => l.city.toLowerCase() === normalizedCity);
}

// Canonical display name for a resolved location - "Lagos" rather than
// whatever LGA/neighborhood Nominatim happened to return - used for city
// grouping so tutors in the same launch city land in one group instead of
// being fragmented by neighborhood. Unrestricted countries pass the raw
// city straight through (their city-level resolution is generally reliable).
function canonicalCity(country, { city, state } = {}) {
  const list = RESTRICTED_LOCATIONS_BY_COUNTRY[country];
  if (!list) return city || null;
  const normalizedState = String(state || '').trim().toLowerCase();
  const match = list.find((l) => l.state.toLowerCase() === normalizedState);
  return match ? match.city : (city || null);
}

module.exports = { RESTRICTED_LOCATIONS_BY_COUNTRY, getAllowedCities, isCityAllowed, canonicalCity };
