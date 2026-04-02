'use strict';

const path = require('path');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_BUCKET = 'images';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

class StorageError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'StorageError';
    this.code = options.code;
    this.cause = options.cause;
  }
}

class StorageManager {
  constructor(options = {}) {
    const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    const supabaseKey =
      options.supabaseKey ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new StorageError('Missing required storage env vars: SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
    }

    this.bucket = options.bucket || DEFAULT_BUCKET;
    this.client = options.client || createClient(supabaseUrl, supabaseKey);
  }

  validateFile(buffer, mimetype) {
    if (!Buffer.isBuffer(buffer)) {
      throw new StorageError('Upload file must be a Buffer.', { code: 'INVALID_FILE' });
    }
    if (buffer.length <= 0 || buffer.length > MAX_FILE_SIZE) {
      throw new StorageError('File size must be greater than 0 and less than 10MB.', { code: 'FILE_SIZE_LIMIT' });
    }
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new StorageError('Unsupported image type. Only jpeg, png, and webp are accepted.', {
        code: 'UNSUPPORTED_TYPE',
      });
    }
  }

  buildPaths(key) {
    const sanitizedKey = this.#sanitizeKey(key);
    const [portfolioId, assetId, filename] = sanitizedKey.split('/');

    return {
      key: sanitizedKey,
      originalPath: `originals/${portfolioId}/${assetId}/${filename}`,
      thumbPath: `thumbnails/${portfolioId}/${assetId}/thumb_${filename}`,
    };
  }

  #sanitizeKey(key) {
    if (!key || typeof key !== 'string') {
      throw new StorageError('Storage key is required.', { code: 'INVALID_KEY' });
    }

    const parts = key.split('/').filter(Boolean);
    if (parts.length !== 3) {
      throw new StorageError('Storage key must be in format "{portfolioId}/{assetId}/{filename}".', {
        code: 'INVALID_KEY',
      });
    }

    const [portfolioId, assetId, filename] = parts;
    const idPattern = /^[a-zA-Z0-9_-]+$/;
    if (!idPattern.test(portfolioId) || !idPattern.test(assetId)) {
      throw new StorageError('Invalid portfolioId/assetId in storage key.', { code: 'INVALID_KEY' });
    }

    const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safeFilename || safeFilename.includes('..')) {
      throw new StorageError('Invalid filename in storage key.', { code: 'INVALID_KEY' });
    }

    return `${portfolioId}/${assetId}/${safeFilename}`;
  }

  async #createThumbnail(buffer, mimetype) {
    const image = sharp(buffer).resize(512, 512, { fit: 'inside', withoutEnlargement: true });
    if (mimetype === 'image/png' || mimetype === 'image/webp') {
      return image.jpeg({ quality: 80 }).toBuffer();
    }
    return image.jpeg({ quality: 85 }).toBuffer();
  }

  async upload(file, key, opts = {}) {
    try {
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(file || '');
      const mimetype = opts.metadata?.mimetype || 'application/octet-stream';
      this.validateFile(buffer, mimetype);

      const { key: safeKey, originalPath, thumbPath } = this.buildPaths(key);
      const thumbnailBuffer = await this.#createThumbnail(buffer, mimetype);

      const { error: originalError } = await this.client.storage.from(this.bucket).upload(originalPath, buffer, {
        contentType: mimetype,
        upsert: false,
      });
      if (originalError) {
        throw new StorageError(`Original upload failed: ${originalError.message}`, {
          code: 'UPLOAD_ORIGINAL_FAILED',
          cause: originalError,
        });
      }

      const { error: thumbError } = await this.client.storage.from(this.bucket).upload(thumbPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (thumbError) {
        await this.client.storage.from(this.bucket).remove([originalPath]);
        throw new StorageError(`Thumbnail upload failed: ${thumbError.message}`, {
          code: 'UPLOAD_THUMBNAIL_FAILED',
          cause: thumbError,
        });
      }

      const originalUrl = this.getPublicUrl(originalPath);
      const thumbUrl = this.getPublicUrl(thumbPath);

      return {
        originalUrl,
        thumbUrl,
        key: safeKey,
        originalPath,
        thumbPath,
      };
    } catch (error) {
      const wrapped = error instanceof StorageError ? error : new StorageError(error.message, { cause: error });
      console.error('[storage] upload failed:', wrapped.message);
      throw wrapped;
    }
  }

  getPublicUrl(pathKey) {
    const { data, error } = this.client.storage.from(this.bucket).getPublicUrl(pathKey);
    if (error) {
      throw new StorageError(`Failed to get public URL: ${error.message}`, { code: 'PUBLIC_URL_FAILED', cause: error });
    }
    return data.publicUrl;
  }

  async getOriginal(key) {
    const exists = await this.exists(key, 'original');
    if (!exists) {
      return null;
    }
    const { originalPath } = this.buildPaths(key);
    return this.getPublicUrl(originalPath);
  }

  async getThumbnail(key) {
    const { thumbPath } = this.buildPaths(key);
    return this.getPublicUrl(thumbPath);
  }

  async delete(key) {
    try {
      const { originalPath, thumbPath } = this.buildPaths(key);
      const { error } = await this.client.storage.from(this.bucket).remove([originalPath, thumbPath]);
      if (error) {
        throw new StorageError(`Delete failed: ${error.message}`, { code: 'DELETE_FAILED', cause: error });
      }
      return true;
    } catch (error) {
      const wrapped = error instanceof StorageError ? error : new StorageError(error.message, { cause: error });
      console.error('[storage] delete failed:', wrapped.message);
      throw wrapped;
    }
  }

  async exists(key, type) {
    try {
      if (!['original', 'thumb'].includes(type)) {
        throw new StorageError("type must be 'original' or 'thumb'.", { code: 'INVALID_EXISTS_TYPE' });
      }

      const { originalPath, thumbPath } = this.buildPaths(key);
      const targetPath = type === 'thumb' ? thumbPath : originalPath;
      const segments = targetPath.split('/');
      const filename = segments.pop();
      const prefix = segments.join('/');

      const { data, error } = await this.client.storage.from(this.bucket).list(prefix, {
        limit: 1,
        search: filename,
      });

      if (error) {
        throw new StorageError(`Exists check failed: ${error.message}`, { code: 'EXISTS_FAILED', cause: error });
      }

      return Array.isArray(data) && data.some((item) => item.name === filename);
    } catch (error) {
      const wrapped = error instanceof StorageError ? error : new StorageError(error.message, { cause: error });
      console.error('[storage] exists failed:', wrapped.message);
      throw wrapped;
    }
  }
}

const storageManager = new StorageManager();

// Backward compatibility helpers used by existing routes/tests.
async function uploadOriginal(buffer, filePath, mimetype) {
  const { error } = await storageManager.client.storage.from(storageManager.bucket).upload(filePath, buffer, {
    contentType: mimetype,
    upsert: false,
  });
  if (error) {
    throw new StorageError(`Supabase Storage upload failed: ${error.message}`);
  }
  return {
    publicUrl: storageManager.getPublicUrl(filePath),
    storageKey: filePath,
  };
}

function getPublicUrl(filePath) {
  return storageManager.getPublicUrl(filePath);
}

async function deleteOriginal(filePath) {
  const { error } = await storageManager.client.storage.from(storageManager.bucket).remove([filePath]);
  return !error;
}

module.exports = StorageManager;
module.exports.default = StorageManager;
module.exports.StorageManager = StorageManager;
module.exports.StorageError = StorageError;
module.exports.storageManager = storageManager;
module.exports.uploadOriginal = uploadOriginal;
module.exports.getPublicUrl = getPublicUrl;
module.exports.deleteOriginal = deleteOriginal;

// Inline test ideas:
// 1) upload(Buffer, 'portfolio/asset/file.png', { metadata: { mimetype: 'image/png' } }) returns both URLs.
// 2) exists(key, 'original') / exists(key, 'thumb') true after upload, false after delete(key).
// 3) upload rejects files over 10MB and unsupported MIME types.
