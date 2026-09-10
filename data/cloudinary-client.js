// Persistent file storage for uploads (photos, videos, certificates, chat
// attachments, product images, etc). Every multer instance in server.js
// used to write straight to local disk under public/uploads/ - which
// silently loses every file on the next redeploy, since (unlike
// data/*.json, which mongo-persistence.js backs up) nothing ever synced
// those bytes anywhere durable. This module is the fix: when Cloudinary
// credentials are configured, uploads go there instead and survive
// redeploys forever; when they're not configured (e.g. local dev without
// a Cloudinary account), server.js falls back to the exact old local-disk
// behavior so nothing breaks - see USE_CLOUDINARY in server.js.
const cloudinary = require('cloudinary').v2;

let configured = null; // null = not checked yet, true/false once resolved

function isConfigured() {
  if (configured !== null) return configured;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    configured = false;
    return false;
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
  return true;
}

// Uploads an in-memory buffer (from multer's memoryStorage) and resolves
// to Cloudinary's permanent secure_url. `folder` groups uploads the same
// way the old local uploads/<folder>/ directories did (photos, videos,
// chat, certificates, products, performer-videos), so they stay easy to
// browse in the Cloudinary dashboard. resourceType must be 'image',
// 'video', or 'raw' (anything that isn't an image/video - PDFs, docs).
function uploadBuffer(buffer, { folder, resourceType = 'auto' }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `mozart-techniques/${folder}`, resource_type: resourceType },
      (err, result) => { if (err) reject(err); else resolve(result); },
    );
    stream.end(buffer);
  });
}

module.exports = { isConfigured, uploadBuffer };
