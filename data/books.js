const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'books.json');
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { nextId: 1, items: [] }; } }
function save(data) { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }
function list() { return load().items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
function add(input) { const data = load(); const item = { id: data.nextId++, ...input, createdAt: new Date().toISOString() }; data.items.push(item); save(data); return item; }
function remove(id) { const data = load(); const index = data.items.findIndex((item) => item.id === Number(id)); if (index < 0) return null; const [item] = data.items.splice(index, 1); save(data); return item; }
module.exports = { list, add, remove };
