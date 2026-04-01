const crypto = require('crypto');
const { getPrisma } = require('./prisma');

function normalizeSiteSlug(siteSlug) {
  return String(siteSlug).trim().toLowerCase();
}

function chooseSubmissionProvider(siteSlug) {
  // Currently a single mock provider.
  // Future providers can be added here based on siteSlug.
  return mockSubmissionProvider;
}

async function mockSubmissionProvider({ assets, siteSlug, userId }) {
  return {
    jobId: `mock-${crypto.randomUUID()}`,
    status: 'submitted',
    siteSlug,
    submittedCount: assets.length,
    submittedAssetIds: assets.map((asset) => asset.id),
    provider: 'mock',
    userId: userId || null,
  };
}

async function submitAssets({ assetIds, siteSlug, userId }) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    throw new Error('assetIds must be a non-empty array of asset IDs.');
  }

  if (!siteSlug || typeof siteSlug !== 'string' || !siteSlug.trim()) {
    throw new Error('siteSlug is required.');
  }

  const normalizedSiteSlug = normalizeSiteSlug(siteSlug);
  const prisma = getPrisma();

  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
  });

  if (assets.length !== assetIds.length) {
    const foundIds = new Set(assets.map((asset) => asset.id));
    const missingIds = assetIds.filter((id) => !foundIds.has(id));
    const missing = missingIds.length ? ` Missing asset IDs: ${missingIds.join(', ')}` : '';
    const error = new Error(`Some assets were not found.${missing}`);
    error.code = 'ASSET_NOT_FOUND';
    throw error;
  }

  const notReady = assets.filter((asset) => asset.status !== 'ready');
  if (notReady.length) {
    const error = new Error(
      `Assets not ready for submission: ${notReady.map((asset) => asset.id).join(', ')}`
    );
    error.code = 'ASSET_NOT_READY';
    throw error;
  }

  const provider = chooseSubmissionProvider(normalizedSiteSlug);
  const result = await provider({ assets, siteSlug: normalizedSiteSlug, userId });

  await prisma.asset.updateMany({
    where: { id: { in: assetIds } },
    data: { status: 'submitted' },
  });

  return {
    jobId: result.jobId,
    status: result.status,
    siteSlug: result.siteSlug,
    submittedCount: result.submittedCount,
    submittedAssetIds: result.submittedAssetIds,
  };
}

module.exports = { submitAssets };
