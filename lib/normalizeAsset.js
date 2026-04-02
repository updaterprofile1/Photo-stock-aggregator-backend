// lib/normalizeAsset.js

const { getPublicUrl } = require('./storage');

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

module.exports = { normalizeAsset };
