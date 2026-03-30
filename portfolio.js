// routes/portfolio.js

const express = require('express');
const { getPrisma } = require('../lib/prisma');

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

    const portfolio = await prisma.portfolio.findUnique({
      where: { id },
      include: {
        assets: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            keywords: true,
            contentOrigin: true,
            fileUrl: true,
            metadataScore: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!portfolio) {
      return res.status(404).json({ error: `Portfolio '${id}' not found.` });
    }

    // Normalise the contentOrigin enum back to the wire format ("non-ai" vs "ai")
    const normalised = {
      ...portfolio,
      assets: portfolio.assets.map((a) => ({
        ...a,
        contentOrigin: a.contentOrigin === 'non_ai' ? 'non-ai' : a.contentOrigin,
      })),
    };

    return res.json(normalised);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
