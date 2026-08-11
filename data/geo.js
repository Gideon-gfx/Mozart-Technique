// Country + currency support. IP geolocation is best-effort (it can't
// resolve anything useful for localhost/private IPs), so every consumer
// of this module must tolerate a null lookup and fall back to a manual
// country selection stored on the user's account.

const COUNTRY_CURRENCY = {
  US: { name: 'United States', currency: 'USD', symbol: '$' },
  GB: { name: 'United Kingdom', currency: 'GBP', symbol: '£' },
  NG: { name: 'Nigeria', currency: 'NGN', symbol: '₦' },
  GH: { name: 'Ghana', currency: 'GHS', symbol: 'GH₵' },
  KE: { name: 'Kenya', currency: 'KES', symbol: 'KSh' },
  ZA: { name: 'South Africa', currency: 'ZAR', symbol: 'R' },
  IN: { name: 'India', currency: 'INR', symbol: '₹' },
  PK: { name: 'Pakistan', currency: 'PKR', symbol: 'Rs' },
  BD: { name: 'Bangladesh', currency: 'BDT', symbol: '৳' },
  CA: { name: 'Canada', currency: 'CAD', symbol: 'CA$' },
  AU: { name: 'Australia', currency: 'AUD', symbol: 'A$' },
  NZ: { name: 'New Zealand', currency: 'NZD', symbol: 'NZ$' },
  DE: { name: 'Germany', currency: 'EUR', symbol: '€' },
  FR: { name: 'France', currency: 'EUR', symbol: '€' },
  ES: { name: 'Spain', currency: 'EUR', symbol: '€' },
  IT: { name: 'Italy', currency: 'EUR', symbol: '€' },
  NL: { name: 'Netherlands', currency: 'EUR', symbol: '€' },
  IE: { name: 'Ireland', currency: 'EUR', symbol: '€' },
  PT: { name: 'Portugal', currency: 'EUR', symbol: '€' },
  BE: { name: 'Belgium', currency: 'EUR', symbol: '€' },
  AT: { name: 'Austria', currency: 'EUR', symbol: '€' },
  FI: { name: 'Finland', currency: 'EUR', symbol: '€' },
  GR: { name: 'Greece', currency: 'EUR', symbol: '€' },
  JP: { name: 'Japan', currency: 'JPY', symbol: '¥' },
  CN: { name: 'China', currency: 'CNY', symbol: '¥' },
  KR: { name: 'South Korea', currency: 'KRW', symbol: '₩' },
  SG: { name: 'Singapore', currency: 'SGD', symbol: 'S$' },
  MY: { name: 'Malaysia', currency: 'MYR', symbol: 'RM' },
  ID: { name: 'Indonesia', currency: 'IDR', symbol: 'Rp' },
  PH: { name: 'Philippines', currency: 'PHP', symbol: '₱' },
  TH: { name: 'Thailand', currency: 'THB', symbol: '฿' },
  VN: { name: 'Vietnam', currency: 'VND', symbol: '₫' },
  AE: { name: 'United Arab Emirates', currency: 'AED', symbol: 'د.إ' },
  SA: { name: 'Saudi Arabia', currency: 'SAR', symbol: 'SR' },
  EG: { name: 'Egypt', currency: 'EGP', symbol: 'E£' },
  BR: { name: 'Brazil', currency: 'BRL', symbol: 'R$' },
  MX: { name: 'Mexico', currency: 'MXN', symbol: 'MX$' },
  AR: { name: 'Argentina', currency: 'ARS', symbol: 'AR$' },
  CO: { name: 'Colombia', currency: 'COP', symbol: 'CO$' },
  CL: { name: 'Chile', currency: 'CLP', symbol: 'CL$' },
  PE: { name: 'Peru', currency: 'PEN', symbol: 'S/' },
  CH: { name: 'Switzerland', currency: 'CHF', symbol: 'CHF' },
  SE: { name: 'Sweden', currency: 'SEK', symbol: 'kr' },
  NO: { name: 'Norway', currency: 'NOK', symbol: 'kr' },
  DK: { name: 'Denmark', currency: 'DKK', symbol: 'kr' },
  PL: { name: 'Poland', currency: 'PLN', symbol: 'zl' },
  TR: { name: 'Turkey', currency: 'TRY', symbol: '₺' },
  RU: { name: 'Russia', currency: 'RUB', symbol: '₽' },
};

const DEFAULT_COUNTRY = 'US';

function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = ip.replace('::ffff:', '');
  return (
    clean === '::1' ||
    clean === '127.0.0.1' ||
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    clean.startsWith('172.16.') ||
    clean === 'localhost'
  );
}

// Best-effort IP -> country lookup. Returns null (never throws) so callers
// always have a safe fallback path.
async function lookupCountryByIp(ip) {
  if (isPrivateIp(ip)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.country_code || !COUNTRY_CURRENCY[data.country_code]) return null;
    return data.country_code;
  } catch {
    return null;
  }
}

// Local currency is only shown for Nigeria and the UK - everywhere else
// defaults to USD, regardless of the visitor's detected country.
const LOCAL_CURRENCY_COUNTRIES = new Set(['NG', 'GB']);

function getCountryInfo(countryCode) {
  const info = COUNTRY_CURRENCY[countryCode] || COUNTRY_CURRENCY[DEFAULT_COUNTRY];
  if (LOCAL_CURRENCY_COUNTRIES.has(countryCode)) return info;
  return { ...info, currency: 'USD', symbol: '$' };
}

function listCountries() {
  return Object.entries(COUNTRY_CURRENCY).map(([code, info]) => ({ code, ...info }));
}

// Maps a country's full name (as returned by reverse-geocoding, e.g.
// "Nigeria") back to its ISO code, for currency lookups once a GPS location
// has resolved a country name rather than a code. Only covers the curated
// currency list above - a name outside that list returns null, and callers
// fall back to IP-based resolution for currency (the location bridge's
// country-name comparison doesn't need this at all, it compares names
// directly).
function countryCodeForName(name) {
  if (!name) return null;
  const target = String(name).trim().toLowerCase();
  const entry = Object.entries(COUNTRY_CURRENCY).find(([, info]) => info.name.toLowerCase() === target);
  return entry ? entry[0] : null;
}

module.exports = {
  COUNTRY_CURRENCY, DEFAULT_COUNTRY, lookupCountryByIp, getCountryInfo, listCountries, countryCodeForName,
};
