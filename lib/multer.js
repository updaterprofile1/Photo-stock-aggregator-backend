const multer = require('multer');

const storage = multer.memoryStorage();

// Whitelist of allowed MIME types checked against the Content-Type header.
// Magic-byte validation (via sharp) is performed downstream in imageValidator.js.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Unsupported image type. Only jpeg, png, and webp are accepted.');
    err.statusCode = 415;
    cb(err, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = { upload };