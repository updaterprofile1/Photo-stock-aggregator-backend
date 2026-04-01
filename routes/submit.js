const express = require('express');
const { submitAssets } = require('../lib/submission');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { assetIds, siteSlug, userId } = req.body;

    const parsedAssetIds = Array.isArray(assetIds)
      ? assetIds.map((value) => String(value).trim()).filter(Boolean)
      : [];

    const result = await submitAssets({ assetIds: parsedAssetIds, siteSlug, userId });

    return res.status(202).json(result);
  } catch (err) {
    if (err.code === 'ASSET_NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
