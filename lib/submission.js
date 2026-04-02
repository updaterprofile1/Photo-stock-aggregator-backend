'use strict';

const crypto = require('crypto');
const { getPrisma } = require('./prisma');
const { getSiteRules, validateAssetsForSite } = require('./siteRules');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSiteSlug(siteSlug) {
  return String(siteSlug).trim().toLowerCase();
}

// ─── Providers ────────────────────────────────────────────────────────────────

/**
 * Mock provider – used when N8N_WEBHOOK_URL is not set (local dev / tests).
 */
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

/**
 * n8n webhook provider – fires a POST to <N8N_WEBHOOK_URL>/<siteSlug>.
 * Optional N8N_WEBHOOK_SECRET is sent in the X-Webhook-Secret header so the
 * n8n workflow can verify the caller (set via direnv / Railway secret).
 */
async function n8nSubmissionProvider({ assets, siteSlug, userId }) {
  const baseUrl = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;

  const url = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(siteSlug)}`;

  const headers = { 'Content-Type': 'application/json' };
  if (secret) {
    headers['X-Webhook-Secret'] = secret;
  }

  const body = JSON.stringify({ siteSlug, userId, assets });

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch (networkErr) {
    const err = new Error(`n8n webhook unreachable: ${networkErr.message}`);
    err.code = 'WEBHOOK_NETWORK_ERROR';
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`n8n webhook returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.code = 'WEBHOOK_ERROR';
    err.httpStatus = res.status;
    throw err;
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  return {
    jobId: payload.jobId ?? `n8n-${crypto.randomUUID()}`,
    status: 'submitted',
    siteSlug,
    submittedCount: assets.length,
    submittedAssetIds: assets.map((a) => a.id),
    provider: 'n8n',
    userId: userId || null,
  };
}

function chooseSubmissionProvider() {
  return process.env.N8N_WEBHOOK_URL ? n8nSubmissionProvider : mockSubmissionProvider;
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function submitAssets({ assetIds, siteSlug, userId }) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    throw new Error('assetIds must be a non-empty array of asset IDs.');
  }

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('userId is required.');
  }

  if (!siteSlug || typeof siteSlug !== 'string' || !siteSlug.trim()) {
    throw new Error('siteSlug is required.');
  }

  const normalizedSiteSlug = normalizeSiteSlug(siteSlug);

  // ── 1. Resolve site rules ────────────────────────────────────────────────
  const rules = getSiteRules(normalizedSiteSlug);
  if (!rules) {
    const err = new Error(`Unknown site: '${normalizedSiteSlug}'.`);
    err.code = 'UNKNOWN_SITE';
    throw err;
  }

  // ── 2. Ownership + status check (DB) ────────────────────────────────────
  const prisma = getPrisma();

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: assetIds },
      portfolio: { userId: userId.trim() },
    },
  });

  if (assets.length !== assetIds.length) {
    const foundIds = new Set(assets.map((a) => a.id));
    const missingIds = assetIds.filter((id) => !foundIds.has(id));
    const detail = missingIds.length ? ` Missing: ${missingIds.join(', ')}` : '';
    const err = new Error(`Some assets were not found or do not belong to this user.${detail}`);
    err.code = 'ASSET_NOT_FOUND';
    throw err;
  }

  const notReady = assets.filter((a) => a.status !== 'ready');
  if (notReady.length) {
    const err = new Error(
      `Assets not ready for submission: ${notReady.map((a) => a.id).join(', ')}`
    );
    err.code = 'ASSET_NOT_READY';
    throw err;
  }

  // ── 3. Site rule validation ──────────────────────────────────────────────
  const violations = validateAssetsForSite(assets, rules, normalizedSiteSlug);
  if (violations.length > 0) {
    const err = new Error(violations.map((v) => v.message).join('; '));
    err.code = 'SITE_RULE_VIOLATION';
    err.violations = violations;
    throw err;
  }

  // ── 4. Call submission provider (mock or n8n) ────────────────────────────
  const provider = chooseSubmissionProvider();
  let result;
  try {
    result = await provider({ assets, siteSlug: normalizedSiteSlug, userId });
  } catch (providerErr) {
    // Mark affected assets as rejected
    await prisma.asset.updateMany({
      where: { id: { in: assetIds } },
      data: { status: 'rejected' },
    });
    throw providerErr;
  }

  // ── 5. Update lifecycle on success ──────────────────────────────────────
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
    provider: result.provider,
  };
}

module.exports = { submitAssets };
