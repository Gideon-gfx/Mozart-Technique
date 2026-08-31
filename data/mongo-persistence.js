const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = __dirname;
const SNAPSHOT_FILES = [
  'users.json',
  'tutors.json',
  'assignments.json',
  'organizations.json',
  'assessments.json',
  'curriculum.json',
  'reels.json',
  'certificates.json',
  'payments.json',
  'payouts.json',
  'chat.json',
  'org-chat.json',
  'support-chat.json',
];

const snapshotSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, required: true },
}, { collection: 'json_snapshots', versionKey: false });

const Snapshot = mongoose.models.JsonSnapshot || mongoose.model('JsonSnapshot', snapshotSchema);
let connected = false;
let syncQueue = Promise.resolve();
let originalWriteFileSync = null;

function hasMongoConfig() {
  return Boolean(String(process.env.MONGODB_URI || '').trim());
}

function parseLocal(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse ${fileName}: ${error.message}`);
  }
}

function writeLocal(fileName, data) {
  fs.writeFileSync(path.join(DATA_DIR, fileName), JSON.stringify(data, null, 2));
}

async function initialize() {
  if (!hasMongoConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI is required in production. Refusing to start with local-only persistence.');
    }
    return { connected: false, mode: 'local' };
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    });
    connected = true;

    for (const fileName of SNAPSHOT_FILES) {
      const localData = parseLocal(fileName);
      const remote = await Snapshot.findById(fileName).lean();
      if (remote && remote.data) {
        writeLocal(fileName, remote.data);
      } else if (localData !== null) {
        await Snapshot.updateOne(
          { _id: fileName },
          { $set: { data: localData, updatedAt: new Date() } },
          { upsert: true },
        );
      }
    }

    return { connected: true, mode: 'mongodb', files: SNAPSHOT_FILES.length };
  } catch (error) {
    const message = `MongoDB unavailable: ${error.message}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.warn(`${message} Falling back to local JSON persistence for development.`);
    return { connected: false, mode: 'local-fallback', error: error.message };
  }
}

function installWriteThroughHook() {
  if (!connected || originalWriteFileSync) return;
  originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function writeFileSyncWithMongo(filePath, data, options) {
    const result = originalWriteFileSync.call(fs, filePath, data, options);
    const resolved = path.resolve(String(filePath));
    const relative = path.relative(DATA_DIR, resolved);
    if (!relative.includes(path.sep) && SNAPSHOT_FILES.includes(relative)) {
      try {
        syncFile(relative, JSON.parse(String(data)));
      } catch (error) {
        console.error(`MongoDB persistence skipped for ${relative}:`, error.message);
      }
    }
    return result;
  };
}

function syncFile(fileName, data) {
  if (!connected) return;
  syncQueue = syncQueue.then(() => Snapshot.updateOne(
    { _id: fileName },
    { $set: { data, updatedAt: new Date() } },
    { upsert: true },
  )).catch((error) => {
    console.error(`MongoDB persistence failed for ${fileName}:`, error.message);
  });
}

async function flush() {
  await syncQueue;
}

module.exports = { initialize, installWriteThroughHook, syncFile, flush, SNAPSHOT_FILES };
