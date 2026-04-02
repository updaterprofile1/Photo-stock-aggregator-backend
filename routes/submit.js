'use strict';

const express = require('express');
const { submitAssets } = require('../lib/submission');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { assetIds, siteSlug } = req.body;

    if (!siteSlug || typeof siteSlug !== 'string' || !siteSlug.trim()) {
      return res.status(400).json({ error: 'siteSlug is required.' });
    }

    const parsedAssetIds = Array.isArray(assetIds)
      ? assetIds.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (parsedAssetIds.length === 0) {
      return res.status(400).json({ error: 'assetIds must be a non-empty array.' });
    }

    const result = await submitAssets({ assetIds: parsedAssetIds, siteSlug, userId: req.userId });

    return res.status(202).json(result);
  } catch (err) {
    if (err.code === 'UNKNOWN_SITE') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'ASSET_NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    if (err.code === 'ASSET_NOT_READY') {
      return res.status(409).json({ error: err.message });
    }
    if (err.code === 'SITE_RULE_VIOLATION') {
      return res.status(422).json({ error: err.message, violations: err.violations });
    }
    if (err.code === 'WEBHOOK_NETWORK_ERROR' || err.code === 'WEBHOOK_ERROR') {
      return res.status(502).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
