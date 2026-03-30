// lib/multer.js

const multer = require('multer');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Custom file filter — rejects anything that isn't jpg / png / webp.
 */
function imageFileFilter(_req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(new Error('Only JPEG, PNG, and WebP images are accepted.'), {
        statusCode: 415,
      }),
      false,
    );
  }
}

const upload = multer({
  storage: multer.memoryStorage(),   // Keep the file in memory; we'll stream to Supabase
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: imageFileFilter,
});

module.exports = { upload, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES };
