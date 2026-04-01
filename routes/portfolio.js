// routes/portfolio.js

const express = require('express');
const { getPrisma } = require('../lib/prisma');
const { getPublicUrl } = require('../lib/storage');

const router = express.Router();

/**
 * GET /api/portfolio/:id
 *
 * Returns the portfolio record together with all of its assets.
 *
 * Path param:
 *   id  — portfolio cuid
 *
 * Returns:
 *   200 { id, name, userId, createdAt, updatedAt, assets: [...] }
 *   404 if not found
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const prisma = getPrisma();

    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id,
        userId: req.userId,
      },
      include: {
        assets: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!portfolio) {
      return res.status(404).json({ error: `Portfolio '${id}' not found.` });
    }

    // Normalise the contentOrigin enum back to the wire format ("non-ai" vs "ai")
    const normalised = {
      id: portfolio.id,
      userId: portfolio.userId,
      name: portfolio.name,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
      assets: portfolio.assets.map((a) => {
        const contentOrigin = a.contentOrigin === 'non_ai' ? 'non-ai' : a.contentOrigin;
        const fileUrl = a.storageKey ? getPublicUrl(a.storageKey) : a.fileUrl;
        const thumbnailUrl = a.thumbnailStorageKey
          ? getPublicUrl(a.thumbnailStorageKey)
          : a.thumbnailUrl || fileUrl;

        return {
          id: a.id,
          title: a.title,
          description: a.description,
          keywords: a.keywords,
          contentOrigin,
          status: a.status,
          fileUrl,
          thumbnailUrl,
          retentionState: a.retentionState,
          originalDeletedAt: a.originalDeletedAt,
          metadataScore: a.metadataScore,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        };
      }),
    };

    return res.json(normalised);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
