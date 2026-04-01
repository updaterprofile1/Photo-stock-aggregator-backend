// routes/upload.js

const express = require('express');
const path = require('path');

const { upload } = require('../lib/multer');
const { uploadOriginal } = require('../lib/storage');
const { computeMetadataScore } = require('../lib/metadataScore');
const { getPrisma } = require('../lib/prisma');

const router = express.Router();

/**
 * POST /api/upload
 *
 * Multipart/form-data fields:
 *   image         (file, required)   — jpg / png / webp, max 10 MB
 *   portfolioId   (string, required)
 *   contentOrigin (string, required) — "ai" | "non-ai"
 *   title         (string, optional)
 *   description   (string, optional)
 *   keywords      (string, optional) — comma-separated list
 *
 * Returns:
 *   201 { assetId, fileUrl, metadataScore }
 */
router.post('/', upload.single('image'), async (req, res, next) => {
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

    // ── 3. Build a unique storage path ────────────────────────────────────
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const storageKey = `portfolios/${portfolioId}/${require('crypto').randomUUID()}${ext}`;

    // ── 4. Upload to Supabase Storage ─────────────────────────────────────
    const { publicUrl, storageKey: savedStorageKey } = await uploadOriginal(
      req.file.buffer,
      storageKey,
      req.file.mimetype
    );

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
        portfolioId,
        title,
        description: description || null,
        keywords: keywordsArray,
        contentOrigin: prismaContentOrigin,
        status: 'draft',
        fileUrl: publicUrl,
        storageKey: savedStorageKey,
        metadataScore,
      },
    });

    return res.status(201).json({
      assetId: asset.id,
      fileUrl: asset.fileUrl,
      metadataScore: asset.metadataScore,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
