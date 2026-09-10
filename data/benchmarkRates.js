// Admin-configured suggested performance rates, shown to a requester as
// guidance (never enforced) when they're setting a proposed amount. Keyed
// by performer category + optional country; a country:null row is the
// global fallback for that category when no country-specific rate is set.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'benchmarkRates.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, rates: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, rates: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listAll() {
  return load().rates;
}

function getRate(category, country) {
  const rates = listAll();
  const specific = country ? rates.find((r) => r.category === category && r.country === country) : null;
  if (specific) return specific;
  return rates.find((r) => r.category === category && !r.country) || null;
}

function setRate({ category, country, amountUsd, updatedByUserId }) {
  const db = load();
  const key = country || null;
  let rate = db.rates.find((r) => r.category === category && (r.country || null) === key);
  if (!rate) {
    rate = { id: db.nextId++, category, country: key, amountUsd: 0 };
    db.rates.push(rate);
  }
  rate.amountUsd = Math.max(0, Number(amountUsd) || 0);
  rate.updatedAt = new Date().toISOString();
  rate.updatedByUserId = updatedByUserId || null;
  persist(db);
  return rate;
}

module.exports = { listAll, getRate, setRate };
