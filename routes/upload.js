// routes/upload.js

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('crypto').webcrypto
  ? (() => {
      // Node 18+ has crypto.randomUUID natively — no extra dep needed
      return { v4: () => require('crypto').randomUUID() };
    })()
  : require('crypto');

const { upload } = require('../lib/multer');
const { uploadToStorage } = require('../lib/supabase');
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
    const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
    if (!portfolio) {
      return res.status(404).json({ error: `Portfolio '${portfolioId}' not found.` });
    }

    // ── 3. Build a unique storage path ────────────────────────────────────
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const storageKey = `portfolios/${portfolioId}/${require('crypto').randomUUID()}${ext}`;

    // ── 4. Upload to Supabase Storage ─────────────────────────────────────
    const fileUrl = await uploadToStorage(req.file.buffer, storageKey, req.file.mimetype);

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
        fileUrl,
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
