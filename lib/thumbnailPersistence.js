'use strict';

const { getPrisma } = require('./prisma');
const { canTransition } = require('./assetLifecycle');

const SUBMISSION_STATUSES = new Set(['submitted', 'accepted', 'rejected', 'distributed']);

class ThumbnailPersistenceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ThumbnailPersistenceError';
    this.code = options.code || 'THUMBNAIL_PERSISTENCE_ERROR';
  }
}

function toHistoryArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateSubmissionStatus(status) {
  if (!SUBMISSION_STATUSES.has(status)) {
    throw new ThumbnailPersistenceError(
      `status must be one of '${Array.from(SUBMISSION_STATUSES).join("', '")}'.`,
      { code: 'INVALID_SUBMISSION_STATUS' },
    );
  }
}

function buildSubmissionHistoryEntry(siteId, outcome) {
  const status = String(outcome?.status || '').trim().toLowerCase();
  validateSubmissionStatus(status);

  return {
    siteId: String(siteId).trim(),
    submittedAt: new Date().toISOString(),
    status,
    externalAssetId: outcome?.externalAssetId ? String(outcome.externalAssetId) : null,
  };
}

async function persistThumbnailMetadata(asset) {
  if (!asset?.id) {
    throw new ThumbnailPersistenceError('asset.id is required.', { code: 'INVALID_ASSET' });
  }

  const prisma = getPrisma();
  const history = toHistoryArray(asset.submissionHistory);

  if (
    asset.thumbnailUrl &&
    asset.thumbnailStorageKey &&
    Array.isArray(asset.submissionHistory)
  ) {
    return asset;
  }

  return prisma.asset.update({
    where: { id: asset.id },
    data: {
      thumbnailUrl: asset.thumbnailUrl || null,
      thumbnailStorageKey: asset.thumbnailStorageKey || null,
      submissionHistory: history,
    },
  });
}

async function recordSubmissionHistory(assetId, siteId, outcome, options = {}) {
  if (!assetId || typeof assetId !== 'string') {
    throw new ThumbnailPersistenceError('assetId is required.', { code: 'INVALID_ASSET_ID' });
  }

  const normalizedSiteId = String(siteId || '').trim().toLowerCase();
  if (!normalizedSiteId) {
    throw new ThumbnailPersistenceError('siteId is required.', { code: 'INVALID_SITE_ID' });
  }

  const prisma = getPrisma();
  const where = {
    id: assetId,
    ...(options.userId ? { portfolio: { userId: options.userId } } : {}),
  };

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findFirst({ where });
    if (!asset) {
      throw new ThumbnailPersistenceError(`Asset '${assetId}' not found.`, { code: 'ASSET_NOT_FOUND' });
    }

    const entry = buildSubmissionHistoryEntry(normalizedSiteId, outcome);
    const nextHistory = [...toHistoryArray(asset.submissionHistory), entry];

    return tx.asset.update({
      where: { id: assetId },
      data: { submissionHistory: nextHistory },
    });
  });
}

async function getDurableRecord(assetId, options = {}) {
  if (!assetId || typeof assetId !== 'string') {
    throw new ThumbnailPersistenceError('assetId is required.', { code: 'INVALID_ASSET_ID' });
  }

  const prisma = getPrisma();
  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      ...(options.userId ? { portfolio: { userId: options.userId } } : {}),
    },
  });

  if (!asset) {
    throw new ThumbnailPersistenceError(`Asset '${assetId}' not found.`, { code: 'ASSET_NOT_FOUND' });
  }

  return {
    assetId: asset.id,
    thumbUrl: asset.thumbnailUrl,
    thumbnailStorageKey: asset.thumbnailStorageKey,
    metadata: {
      title: asset.title,
      description: asset.description,
      keywords: asset.keywords,
      contentOrigin: asset.contentOrigin,
      metadataScore: asset.metadataScore,
    },
    history: toHistoryArray(asset.submissionHistory),
    lifecycle: asset.status,
    retention: asset.retentionState,
    originalDeletedAt: asset.originalDeletedAt,
  };
}

async function prepareForOriginalDeletion(asset, options = {}) {
  const assetId = typeof asset === 'string' ? asset : asset?.id;
  if (!assetId) {
    throw new ThumbnailPersistenceError('asset or asset id is required.', { code: 'INVALID_ASSET' });
  }

  const snapshot = await getDurableRecord(assetId, options);
  const lifecycle = snapshot.lifecycle;
  const alreadyRetained = lifecycle === 'original_deleted' || lifecycle === 'thumbnail_only';
  const canMoveToDeleted = canTransition(lifecycle, 'original_deleted');

  if (!alreadyRetained && !canMoveToDeleted) {
    throw new ThumbnailPersistenceError(
      `Asset '${assetId}' is not retention-ready in lifecycle '${lifecycle}'.`,
      { code: 'INVALID_DELETION_LIFECYCLE' },
    );
  }

  if (!snapshot.thumbUrl && !snapshot.thumbnailStorageKey) {
    throw new ThumbnailPersistenceError(
      `Asset '${assetId}' is missing thumbnail reference required for durable retention.`,
      { code: 'MISSING_THUMBNAIL_REFERENCE' },
    );
  }

  return snapshot;
}

module.exports = {
  ThumbnailPersistenceError,
  getDurableRecord,
  persistThumbnailMetadata,
  prepareForOriginalDeletion,
  recordSubmissionHistory,
};
