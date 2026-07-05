// USD exchange rates, refreshed periodically from a free public API.
// Falls back to a hardcoded snapshot if the request fails (offline dev,
// API downtime) so price conversion never breaks the page.
const FALLBACK_RATES = {
  USD: 1, GBP: 0.78, NGN: 1600, GHS: 15, KES: 129, ZAR: 18.3, INR: 83.5,
  PKR: 278, BDT: 118, CAD: 1.37, AUD: 1.52, NZD: 1.64, EUR: 0.92, JPY: 151,
  CNY: 7.24, KRW: 1370, SGD: 1.34, MYR: 4.7, IDR: 15800, PHP: 56.5, THB: 35.8,
  VND: 24500, AED: 3.67, SAR: 3.75, EGP: 48.5, BRL: 5.15, MXN: 17, ARS: 900,
  COP: 3900, CLP: 950, PEN: 3.7, CHF: 0.88, SEK: 10.5, NOK: 10.6, DKK: 6.9,
  PLN: 4, TRY: 32, RUB: 92,
};

let cache = { rates: FALLBACK_RATES, fetchedAt: 0 };
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function getRatesUSD() {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (!isStale) return cache.rates;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    if (!data.rates) throw new Error('no rates');
    cache = { rates: data.rates, fetchedAt: Date.now() };
  } catch {
    // Keep whatever we had (fallback or a previous successful fetch) and
    // just push the timestamp forward so we don't retry every request.
    cache.fetchedAt = Date.now();
  }
  return cache.rates;
}

async function convertFromUsd(amountUsd, currencyCode) {
  const rates = await getRatesUSD();
  const rate = rates[currencyCode] || 1;
  return amountUsd * rate;
}

module.exports = { getRatesUSD, convertFromUsd };
