// Store products. Inventory is a true color x country matrix - each color
// variant carries its own stock count per country, since a product uploaded
// by admin can be stocked differently across regions. Orders snapshot the
// exact color/country/price they bought at creation time, so changing a
// product later (even archiving it) never rewrites history.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'products.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { nextId: 1, products: [] };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { nextId: 1, products: [] };
  }
}

function persist(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'product';
}

function normalizeColors(colors) {
  return (Array.isArray(colors) ? colors : []).map((color) => ({
    id: color.id || crypto.randomBytes(4).toString('hex'),
    name: String(color.name || '').trim().slice(0, 40),
    hex: String(color.hex || '#000000').trim().slice(0, 20),
    stock: (Array.isArray(color.stock) ? color.stock : [])
      .map((entry) => ({
        countryCode: String(entry.countryCode || '').toUpperCase().slice(0, 2),
        quantity: Math.max(0, Math.floor(Number(entry.quantity) || 0)),
      }))
      .filter((entry) => entry.countryCode),
  })).filter((color) => color.name);
}

function listAll({ status, category } = {}) {
  let products = load().products;
  if (status) products = products.filter((p) => p.status === status);
  if (category) products = products.filter((p) => p.category === category);
  return products;
}

function findById(id) {
  return load().products.find((p) => p.id === Number(id)) || null;
}

function findBySlug(slug) {
  return load().products.find((p) => p.slug === slug) || null;
}

function create({ name, category, description, priceUsd, coverImage, images, colors, status, createdBy }) {
  const db = load();
  const id = db.nextId++;
  const product = {
    id,
    slug: `${slugify(name)}-${id}`,
    name: String(name || '').trim().slice(0, 140),
    category: String(category || '').trim().slice(0, 60),
    description: String(description || '').trim().slice(0, 4000),
    priceUsd: Math.max(0, Number(priceUsd) || 0),
    coverImage: coverImage || null,
    images: Array.isArray(images) ? images.slice(0, 20) : [],
    colors: normalizeColors(colors),
    status: status === 'draft' ? 'draft' : 'active',
    createdBy: createdBy || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.products.push(product);
  persist(db);
  return product;
}

function update(id, { name, category, description, priceUsd, coverImage, images, colors, status }) {
  const db = load();
  const product = db.products.find((p) => p.id === Number(id));
  if (!product) return null;
  if (name != null) product.name = String(name).trim().slice(0, 140);
  if (category != null) product.category = String(category).trim().slice(0, 60);
  if (description != null) product.description = String(description).trim().slice(0, 4000);
  if (priceUsd != null) product.priceUsd = Math.max(0, Number(priceUsd) || 0);
  if (coverImage != null) product.coverImage = coverImage;
  if (images != null) product.images = Array.isArray(images) ? images.slice(0, 20) : [];
  if (colors != null) product.colors = normalizeColors(colors);
  if (status != null) product.status = status;
  product.updatedAt = new Date().toISOString();
  persist(db);
  return product;
}

// Soft delete - keeps past orders able to resolve the product's name/image.
function archive(id) {
  const db = load();
  const product = db.products.find((p) => p.id === Number(id));
  if (!product) return null;
  product.status = 'archived';
  product.updatedAt = new Date().toISOString();
  persist(db);
  return product;
}

function stockFor(product, colorId, countryCode) {
  if (!product) return 0;
  const color = product.colors.find((c) => c.id === colorId);
  if (!color) return 0;
  const entry = color.stock.find((s) => s.countryCode === String(countryCode || '').toUpperCase());
  return entry ? entry.quantity : 0;
}

function totalStock(product) {
  if (!product) return 0;
  return product.colors.reduce((sum, color) => sum + color.stock.reduce((s, e) => s + e.quantity, 0), 0);
}

// Single load/mutate/persist call with no await in between, so concurrent
// requests can't interleave a read and a stale write.
function decrementStock(productId, colorId, countryCode, qty) {
  const db = load();
  const product = db.products.find((p) => p.id === Number(productId));
  if (!product) return { success: false, remaining: 0 };
  const color = product.colors.find((c) => c.id === colorId);
  if (!color) return { success: false, remaining: 0 };
  const entry = color.stock.find((s) => s.countryCode === String(countryCode || '').toUpperCase());
  if (!entry || entry.quantity < qty) return { success: false, remaining: entry ? entry.quantity : 0 };
  entry.quantity -= qty;
  product.updatedAt = new Date().toISOString();
  persist(db);
  return { success: true, remaining: entry.quantity };
}

module.exports = {
  listAll, findById, findBySlug, create, update, archive,
  stockFor, totalStock, decrementStock, slugify,
};
