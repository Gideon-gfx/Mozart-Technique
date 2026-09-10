// Store delivery addresses. A user needs at least one on file before they
// can check out (enforced in server.js's /api/store/checkout) since the
// chosen address's country is what stock and shipping resolve against.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'addresses.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, addresses: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, addresses: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function listByUser(userId) {
  return load().addresses
    .filter((a) => a.userId === Number(userId))
    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
}

function findById(id) {
  return load().addresses.find((a) => a.id === Number(id)) || null;
}

function hasAny(userId) {
  return load().addresses.some((a) => a.userId === Number(userId));
}

function getDefault(userId) {
  const mine = listByUser(userId);
  return mine.find((a) => a.isDefault) || mine[0] || null;
}

function create(userId, { label, fullName, phone, country, countryName, state, city, street, postalCode, isDefault }) {
  const db = load();
  const makeDefault = Boolean(isDefault) || !db.addresses.some((a) => a.userId === Number(userId));
  if (makeDefault) db.addresses.forEach((a) => { if (a.userId === Number(userId)) a.isDefault = false; });
  const address = {
    id: db.nextId++,
    userId: Number(userId),
    label: String(label || 'Home').trim().slice(0, 40),
    fullName: String(fullName || '').trim().slice(0, 100),
    phone: String(phone || '').trim().slice(0, 30),
    country: String(country || '').toUpperCase().slice(0, 2),
    countryName: String(countryName || '').trim().slice(0, 80),
    state: String(state || '').trim().slice(0, 80),
    city: String(city || '').trim().slice(0, 80),
    street: String(street || '').trim().slice(0, 200),
    postalCode: String(postalCode || '').trim().slice(0, 20),
    isDefault: makeDefault,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.addresses.push(address);
  persist(db);
  return address;
}

function update(id, userId, fields) {
  const db = load();
  const address = db.addresses.find((a) => a.id === Number(id) && a.userId === Number(userId));
  if (!address) return null;
  ['label', 'fullName', 'phone', 'state', 'city', 'street', 'postalCode'].forEach((key) => {
    if (fields[key] != null) address[key] = String(fields[key]).trim().slice(0, key === 'street' ? 200 : 100);
  });
  if (fields.country != null) address.country = String(fields.country).toUpperCase().slice(0, 2);
  if (fields.countryName != null) address.countryName = String(fields.countryName).trim().slice(0, 80);
  if (fields.isDefault) {
    db.addresses.forEach((a) => { if (a.userId === Number(userId)) a.isDefault = false; });
    address.isDefault = true;
  }
  address.updatedAt = new Date().toISOString();
  persist(db);
  return address;
}

function setDefault(id, userId) {
  const db = load();
  const address = db.addresses.find((a) => a.id === Number(id) && a.userId === Number(userId));
  if (!address) return null;
  db.addresses.forEach((a) => { if (a.userId === Number(userId)) a.isDefault = false; });
  address.isDefault = true;
  address.updatedAt = new Date().toISOString();
  persist(db);
  return address;
}

function remove(id, userId) {
  const db = load();
  const index = db.addresses.findIndex((a) => a.id === Number(id) && a.userId === Number(userId));
  if (index < 0) return false;
  const wasDefault = db.addresses[index].isDefault;
  db.addresses.splice(index, 1);
  if (wasDefault) {
    const next = db.addresses.find((a) => a.userId === Number(userId));
    if (next) next.isDefault = true;
  }
  persist(db);
  return true;
}

module.exports = { listByUser, findById, hasAny, getDefault, create, update, setDefault, remove };
