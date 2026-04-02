// routes/portfolio.js

const express = require('express');
const { getPrisma } = require('../lib/prisma');
const { normalizeAsset } = require('../lib/normalizeAsset');

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

    const normalised = {
      id: portfolio.id,
      userId: portfolio.userId,
      name: portfolio.name,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
      assets: portfolio.assets.map((a) => normalizeAsset(a)),
    };

    return res.json(normalised);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
