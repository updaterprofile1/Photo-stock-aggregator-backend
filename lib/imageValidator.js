'use strict';

const sharp = require('sharp');

// Formats reported by sharp: 'jpeg', 'png', 'webp'.
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// Minimum pixel dimension for each side; overridable via env for testing.
const MIN_DIMENSION = parseInt(process.env.IMAGE_MIN_DIMENSION || '512', 10);

/**
 * Express middleware: validates an uploaded image buffer via sharp (magic-byte
 * MIME detection + dimension enforcement).
 *
 * Must run AFTER multer has populated req.file.
 * Safe no-op when req.file is absent (non-upload routes).
 *
 * Rejects with:
 *   415 – file is not a recognised image or format is not jpeg/png/webp
 *   422 – image dimensions below MIN_DIMENSION × MIN_DIMENSION
 */
async function validateImage(req, _res, next) {
  if (!req.file) return next();

  let metadata;
  try {
    metadata = await sharp(req.file.buffer).metadata();
  } catch {
    const err = new Error('File is not a valid image.');
    err.statusCode = 415;
    return next(err);
  }

  if (!ALLOWED_FORMATS.has(metadata.format)) {
    const err = new Error(
      `Unsupported image format '${metadata.format}'. Only jpeg, png, and webp are accepted.`,
    );
    err.statusCode = 415;
    return next(err);
  }

  const { width, height } = metadata;
  if (!width || !height || width < MIN_DIMENSION || height < MIN_DIMENSION) {
    const err = new Error(
      `Image dimensions ${width}×${height} px are too small. ` +
        `Minimum is ${MIN_DIMENSION}×${MIN_DIMENSION} px.`,
    );
    err.statusCode = 422;
    return next(err);
  }

  // Normalise req.file.mimetype to the magic-byte-detected value to prevent
  // Content-Type spoofing propagating into storage / DB records.
  req.file.mimetype = `image/${metadata.format}`;
  next();
}

module.exports = { validateImage };
