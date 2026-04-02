// lib/normalizeAsset.js

const { getPublicUrl } = require('./storage');

function normalizeAsset(asset) {
  const contentOrigin = asset.contentOrigin === 'non_ai' ? 'non-ai' : asset.contentOrigin;
  const fileUrl = asset.storageKey ? getPublicUrl(asset.storageKey) : asset.fileUrl;
  const thumbnailUrl = asset.thumbnailStorageKey
    ? getPublicUrl(asset.thumbnailStorageKey)
    : asset.thumbnailUrl || fileUrl;
  const submissionHistory = Array.isArray(asset.submissionHistory) ? asset.submissionHistory : [];
  const latestSubmission = submissionHistory.length ? submissionHistory[submissionHistory.length - 1] : null;

  return {
    id: asset.id,
    portfolioId: asset.portfolioId,
    title: asset.title,
    description: asset.description,
    keywords: asset.keywords,
    contentOrigin,
    lifecycle: asset.status,
    status: asset.status,
    fileUrl,
    thumbnailUrl,
    submissionHistory,
    submissionHistorySummary: {
      count: submissionHistory.length,
      lastSiteId: latestSubmission ? latestSubmission.siteId : null,
      lastStatus: latestSubmission ? latestSubmission.status : null,
      lastSubmittedAt: latestSubmission ? latestSubmission.submittedAt : null,
    },
    retentionState: asset.retentionState,
    originalDeletedAt: asset.originalDeletedAt,
    metadataScore: asset.metadataScore,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

module.exports = { normalizeAsset };
