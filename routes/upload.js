// routes/upload.js

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const { upload } = require('../lib/multer');
const { validateImage } = require('../lib/imageValidator');
const { storageManager, StorageError } = require('../lib/storage');
const { computeMetadataScore } = require('../lib/metadataScore');
const { getPrisma } = require('../lib/prisma');

const router = express.Router();

/**
 * POST /api/upload
 *
 * Multipart/form-data fields:
 *   image         (file, required)   — jpg / png / webp, max 10 MB, min 512×512 px
 *   portfolioId   (string, required)
 *   contentOrigin (string, required) — "ai" | "non-ai"
 *   title         (string, optional)
 *   description   (string, optional)
 *   keywords      (string, optional) — comma-separated list
 *
 * Returns:
 *   201 { assetId, fileUrl, metadataScore }
 */
router.post('/', upload.single('image'), validateImage, async (req, res, next) => {
  try {
    // ── 1. Validate required body fields ──────────────────────────────────
    const { portfolioId, contentOrigin, title = '', description = '', keywords = '' } = req.body;

    const errors = [];
    if (!portfolioId) errors.push('portfolioId is required.');
    if (!contentOrigin) errors.push('contentOrigin is required.');
    if (contentOrigin && !['ai', 'non-ai'].includes(contentOrigin))
      errors.push("contentOrigin must be 'ai' or 'non-ai'.");
    if (!req.file) errors.push('image file is required.');

    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // ── 2. Confirm portfolio exists ────────────────────────────────────────
    const prisma = getPrisma();
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId: req.userId,
      },
    });
    if (!portfolio) {
      return res.status(404).json({ error: `Portfolio '${portfolioId}' not found.` });
    }

    // ── 3. Prepare ids + storage key (portfolio/asset scoped) ─────────────
    const assetId = crypto.randomUUID();
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const filename = `${assetId}${ext}`;
    const storageKey = `${portfolioId}/${assetId}/${filename}`;

    // ── 4. Upload original + thumbnail via storage abstraction ────────────
    const stored = await storageManager.upload(req.file.buffer, storageKey, {
      metadata: {
        mimetype: req.file.mimetype,
      },
    });

    // ── 5. Parse keywords ─────────────────────────────────────────────────
    const keywordsArray = keywords
      ? keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      : [];

    // ── 6. Score metadata ─────────────────────────────────────────────────
    const metadataScore = computeMetadataScore({ title, description, keywords: keywordsArray, contentOrigin });

    // ── 7. Persist asset record ───────────────────────────────────────────
    // Map "non-ai" → Prisma enum value "non_ai" (the @map handles DB side)
    const prismaContentOrigin = contentOrigin === 'non-ai' ? 'non_ai' : 'ai';

    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        portfolioId,
        title,
        description: description || null,
        keywords: keywordsArray,
        contentOrigin: prismaContentOrigin,
        status: 'draft',
        fileUrl: stored.originalUrl,
        thumbnailUrl: stored.thumbUrl,
        storageKey: stored.originalPath,
        thumbnailStorageKey: stored.thumbPath,
        metadataScore,
      },
    });

    return res.status(201).json({
      assetId: asset.id,
      fileUrl: asset.fileUrl,
      thumbnailUrl: asset.thumbnailUrl,
      metadataScore: asset.metadataScore,
    });
  } catch (err) {
    if (err instanceof StorageError) {
      return res.status(500).json({
        error: 'Storage upload failed.',
        details: [err.message],
      });
    }
    next(err);
  }
});

module.exports = router;
