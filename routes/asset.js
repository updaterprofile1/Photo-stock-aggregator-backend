const express = require('express');
const { getPrisma } = require('../lib/prisma');
const { getPublicUrl } = require('../lib/storage');
const { computeMetadataScore } = require('../lib/metadataScore');

const router = express.Router();

function normalizeAsset(asset) {
  const contentOrigin = asset.contentOrigin === 'non_ai' ? 'non-ai' : asset.contentOrigin;
  const fileUrl = asset.storageKey ? getPublicUrl(asset.storageKey) : asset.fileUrl;
  const thumbnailUrl = asset.thumbnailStorageKey
    ? getPublicUrl(asset.thumbnailStorageKey)
    : asset.thumbnailUrl || fileUrl;

  return {
    id: asset.id,
    portfolioId: asset.portfolioId,
    title: asset.title,
    description: asset.description,
    keywords: asset.keywords,
    contentOrigin,
    status: asset.status,
    fileUrl,
    thumbnailUrl,
    retentionState: asset.retentionState,
    originalDeletedAt: asset.originalDeletedAt,
    metadataScore: asset.metadataScore,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function isMetadataReady({ title, description, keywords }) {
  const hasTitle = typeof title === 'string' && title.trim().length > 0;
  const hasDescription = typeof description === 'string' && description.trim().length > 0;
  const keywordCount = Array.isArray(keywords) ? keywords.filter(Boolean).length : 0;
  return hasTitle && hasDescription && keywordCount >= 3;
}

function parseKeywords(rawKeywords) {
  if (Array.isArray(rawKeywords)) {
    return rawKeywords.map((k) => String(k).trim()).filter(Boolean);
  }
  if (typeof rawKeywords === 'string') {
    return rawKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }
  return undefined;
}

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const prisma = getPrisma();

    const asset = await prisma.asset.findFirst({
      where: {
        id,
        portfolio: { userId: req.userId },
      },
    });
    if (!asset) {
      return res.status(404).json({ error: `Asset '${id}' not found.` });
    }

    return res.json(normalizeAsset(asset));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, keywords, contentOrigin, retentionState, status } = req.body;
    const prisma = getPrisma();

    const asset = await prisma.asset.findFirst({
      where: {
        id,
        portfolio: { userId: req.userId },
      },
    });
    if (!asset) {
      return res.status(404).json({ error: `Asset '${id}' not found.` });
    }

    const errors = [];
    const update = {};

    const mergedTitle = title !== undefined ? String(title).trim() : asset.title;
    const mergedDescription = description !== undefined ? (description ? String(description) : null) : asset.description;
    const mergedKeywords = keywords !== undefined ? parseKeywords(keywords) : asset.keywords;

    if (contentOrigin !== undefined) {
      if (!['ai', 'non-ai'].includes(contentOrigin)) {
        errors.push("contentOrigin must be 'ai' or 'non-ai'.");
      } else {
        update.contentOrigin = contentOrigin === 'non-ai' ? 'non_ai' : 'ai';
      }
    }

    if (retentionState !== undefined) {
      if (!['active', 'deleted', 'archived'].includes(retentionState)) {
        errors.push("retentionState must be 'active', 'deleted', or 'archived'.");
      } else {
        update.retentionState = retentionState;
        if (retentionState === 'deleted') {
          update.originalDeletedAt = new Date();
        }
        if (retentionState === 'active') {
          update.originalDeletedAt = null;
        }
      }
    }

    if (status !== undefined) {
      if (![
        'draft',
        'ready',
        'submitted',
        'accepted',
        'rejected',
        'distributed',
        'original_deleted',
        'thumbnail_only',
      ].includes(status)) {
        errors.push(
          "status must be one of 'draft', 'ready', 'submitted', 'accepted', 'rejected', 'distributed', 'original_deleted', or 'thumbnail_only'."
        );
      } else if (status === 'ready' && !isMetadataReady({ title: mergedTitle, description: mergedDescription, keywords: mergedKeywords })) {
        errors.push('Asset cannot be marked ready until title, description, and at least 3 keywords are provided.');
      } else {
        update.status = status;
      }
    }

    if (title !== undefined) {
      update.title = String(title);
    }

    if (description !== undefined) {
      update.description = description ? String(description) : null;
    }

    if (keywords !== undefined) {
      const parsedKeywords = parseKeywords(keywords);
      if (parsedKeywords === undefined) {
        errors.push('keywords must be a comma-separated string or an array of strings.');
      } else {
        update.keywords = parsedKeywords;
      }
    }

    const readyMetadata = isMetadataReady({ title: mergedTitle, description: mergedDescription, keywords: mergedKeywords });
    if (status === undefined && asset.status === 'draft' && readyMetadata) {
      update.status = 'ready';
    }

    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    const mergedContentOrigin = update.contentOrigin !== undefined ? update.contentOrigin : asset.contentOrigin;
    update.metadataScore = computeMetadataScore({
      title: mergedTitle || '',
      description: mergedDescription || '',
      keywords: Array.isArray(mergedKeywords) ? mergedKeywords : [],
      contentOrigin: mergedContentOrigin,
    });

    const updatedAsset = await prisma.asset.update({ where: { id }, data: update });
    return res.json(normalizeAsset(updatedAsset));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/retention', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { state } = req.body;
    const prisma = getPrisma();

    if (!['active', 'deleted', 'archived'].includes(state)) {
      return res.status(400).json({ error: "state must be 'active', 'deleted', or 'archived'." });
    }

    const asset = await prisma.asset.findFirst({
      where: {
        id,
        portfolio: { userId: req.userId },
      },
    });
    if (!asset) {
      return res.status(404).json({ error: `Asset '${id}' not found.` });
    }

    const data = { retentionState: state };
    if (state === 'deleted') {
      data.originalDeletedAt = new Date();
    }
    if (state === 'active') {
      data.originalDeletedAt = null;
    }

    const updatedAsset = await prisma.asset.update({ where: { id }, data });
    return res.json(normalizeAsset(updatedAsset));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
