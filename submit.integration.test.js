'use strict';

/**
 * Integration tests for POST /api/submit
 *
 * Mocking strategy mirrors put-asset.integration.test.js:
 *   - lib/prisma is stubbed via require.cache before server.js loads.
 *   - lib/submission is patched through prisma so siteRules + providers run for real.
 *   - N8N_WEBHOOK_URL is intentionally absent → mock provider is used.
 *   - A second suite exercises the n8n provider by stubbing global.fetch.
 */

const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
// Keep N8N_WEBHOOK_URL unset → mock provider used by default

const projectRoot = __dirname;
const prismaPath = path.join(projectRoot, 'lib', 'prisma.js');
const supabasePath = path.join(projectRoot, 'lib', 'supabase.js');

// ─── Prisma mock state ────────────────────────────────────────────────────────
const state = {
  findManyResult: [],
  updateManyResult: { count: 0 },
  lastFindManyArgs: null,
  lastUpdateManyArgs: null,
  findFirstAssetResult: null,
  updateAssetResult: null,
  lastFindFirstAssetArgs: null,
  lastUpdateAssetArgs: null,
  lastJobCreate: null,
  lastJobUpdate: null,
};

const prismaMock = {
  $queryRaw: async () => 1,
  $transaction: async (fn) => fn(prismaMock),
  asset: {
    findMany: async (args) => {
      state.lastFindManyArgs = args;
      return state.findManyResult;
    },
    updateMany: async (args) => {
      state.lastUpdateManyArgs = args;
      return state.updateManyResult;
    },
    findFirst: async (args) => {
      state.lastFindFirstAssetArgs = args;
      if (state.findFirstAssetResult) {
        return state.findFirstAssetResult;
      }
      return state.findManyResult.find((asset) => asset.id === args?.where?.id) || null;
    },
    update: async (args) => {
      state.lastUpdateAssetArgs = args;
      return state.updateAssetResult;
    },
  },
  submissionJob: {
    create: async (args) => {
      state.lastJobCreate = args;
      return { ...args.data };
    },
    update: async (args) => {
      state.lastJobUpdate = args;
      return { id: args.where.id, ...args.data };
    },
  },
};

// Stub prisma before server.js loads
require.cache[require.resolve(prismaPath)] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { getPrisma: () => prismaMock, closePrisma: async () => {} },
};

// Stub supabase auth – prevents live HTTP calls; 'valid-token' resolves to user-1
require.cache[require.resolve(supabasePath)] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      auth: {
        getUser: async (token) =>
          token === 'valid-token'
            ? { data: { user: { id: 'user-1' } }, error: null }
            : { data: { user: null }, error: new Error('Invalid token') },
      },
    },
    BUCKET: 'images',
  },
};

const app = require('./server');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
});

test.beforeEach(() => {
  state.findManyResult = [];
  state.updateManyResult = { count: 0 };
  state.lastFindManyArgs = null;
  state.lastUpdateManyArgs = null;
  state.findFirstAssetResult = null;
  state.updateAssetResult = null;
  state.lastFindFirstAssetArgs = null;
  state.lastUpdateAssetArgs = null;
  state.lastJobCreate = null;
  state.lastJobUpdate = null;
  // These are cleaned up inside each n8n test's finally block; belt-and-suspenders:
  delete process.env.N8N_WEBHOOK_URL;
  delete process.env.N8N_WEBHOOK_SECRET;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function post(path, body, token = 'valid-token') {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function makeAsset(overrides = {}) {
  return {
    id: 'asset-1',
    status: 'ready',
    contentOrigin: 'non_ai',
    portfolioId: 'port-1',
    ...overrides,
  };
}

// ─── Suite: input validation ──────────────────────────────────────────────────

test('POST /api/submit – missing siteSlug → 400', async () => {
  const res = await post('/api/submit', { assetIds: ['asset-1'] });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /siteSlug/i);
});

test('POST /api/submit – empty assetIds → 400', async () => {
  const res = await post('/api/submit', { siteSlug: 'adobestock', assetIds: [] });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /assetIds/i);
});

test('POST /api/submit – unknown siteSlug → 400', async () => {
  const res = await post('/api/submit', { siteSlug: 'notasite', assetIds: ['asset-1'] });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /unknown site/i);
});

test('POST /api/submit – missing Authorization header → 401', async () => {
  const res = await fetch(`${baseUrl}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteSlug: 'adobestock', assetIds: ['asset-1'] }),
  });
  assert.equal(res.status, 401);
});

// ─── Suite: DB-layer errors ───────────────────────────────────────────────────

test('POST /api/submit – asset not found (wrong user) → 404', async () => {
  state.findManyResult = []; // nothing returned = ownership mismatch
  const res = await post('/api/submit', { siteSlug: 'adobestock', assetIds: ['asset-x'] });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /not found/i);
});

test('POST /api/submit – asset not ready → 409', async () => {
  state.findManyResult = [makeAsset({ status: 'draft' })];
  const res = await post('/api/submit', { siteSlug: 'adobestock', assetIds: ['asset-1'] });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.error, /not ready/i);
});

// ─── Suite: site rule enforcement ────────────────────────────────────────────

test('POST /api/submit – AI asset rejected by shutterstock → 422', async () => {
  state.findManyResult = [makeAsset({ contentOrigin: 'ai' })];
  const res = await post('/api/submit', { siteSlug: 'shutterstock', assetIds: ['asset-1'] });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.match(body.error, /does not accept AI/i);
  assert.ok(Array.isArray(body.violations));
  assert.equal(body.violations[0].rule, 'ai');
});

test('POST /api/submit – AI asset accepted by adobestock → 202', async () => {
  state.findManyResult = [makeAsset({ contentOrigin: 'ai' })];
  const res = await post('/api/submit', { siteSlug: 'adobestock', assetIds: ['asset-1'] });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.status, 'submitted');
  assert.ok(body.jobId, 'jobId should be a non-empty string');
  assert.equal(body.provider, 'mock');
});

// ─── Suite: successful mock submission ───────────────────────────────────────

test('POST /api/submit – happy path → 202 with jobId + lifecycle updated', async () => {
  state.findManyResult = [makeAsset()];
  state.findFirstAssetResult = { id: 'asset-1', submissionHistory: [] };
  state.updateAssetResult = { id: 'asset-1', submissionHistory: [] };
  const res = await post('/api/submit', { siteSlug: 'adobestock', assetIds: ['asset-1'] });
  assert.equal(res.status, 202);

  const body = await res.json();
  assert.ok(body.jobId, 'jobId should be present');
  assert.equal(body.status, 'submitted');
  assert.equal(body.siteSlug, 'adobestock');
  assert.equal(body.submittedCount, 1);
  assert.deepEqual(body.submittedAssetIds, ['asset-1']);

  // Verify asset lifecycle written to DB
  assert.equal(state.lastUpdateManyArgs.data.status, 'submitted');

  // Verify job record was created then updated
  assert.ok(state.lastJobCreate, 'job record should be created');
  assert.equal(state.lastJobCreate.data.status, 'queued');
  assert.deepEqual(state.lastJobCreate.data.assetIds, ['asset-1']);
  assert.equal(state.lastJobCreate.data.siteSlug, 'adobestock');
  assert.ok(state.lastJobCreate.data.id, 'job id should be set before provider call');
  assert.equal(state.lastJobUpdate.data.status, 'submitted');
  assert.equal(body.jobId, state.lastJobCreate.data.id);
  assert.equal(state.lastUpdateAssetArgs?.where?.id, 'asset-1');
  assert.equal(state.lastUpdateAssetArgs?.data?.submissionHistory?.[0]?.status, 'submitted');
  assert.equal(state.lastUpdateAssetArgs?.data?.submissionHistory?.[0]?.siteId, 'adobestock');
});

test('POST /api/submit – multiple assets, all ready → 202', async () => {
  state.findManyResult = [
    makeAsset({ id: 'a1' }),
    makeAsset({ id: 'a2' }),
    makeAsset({ id: 'a3' }),
  ];
  const res = await post('/api/submit', {
    siteSlug: 'dreamstime',
    assetIds: ['a1', 'a2', 'a3'],
  });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.submittedCount, 3);
});

// ─── Suite: n8n provider (real local HTTP server as webhook mock) ─────────────
//
// The submission module is already loaded; we can't re-require it for a running
// server. Instead we spin up a real HTTP server on a random port and point
// N8N_WEBHOOK_URL there. `chooseSubmissionProvider` reads the env var at
// call-time, so the n8n path is exercised without any monkey-patching.

/** Start a one-shot HTTP server.  Returns { server, port, receivedBody }. */
async function startWebhookMock({ statusCode = 200, responseBody = { jobId: 'n8n-abc-123' } } = {}) {
  const received = { body: null, url: null, headers: null };
  const server = http.createServer((req, res) => {
    received.url = req.url;
    received.headers = req.headers;
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { received.body = JSON.parse(raw); } catch { received.body = raw; }
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, received, port: server.address().port };
}

test('POST /api/submit – n8n provider success → 202 with n8n jobId', async () => {
  const { server, received, port } = await startWebhookMock({ statusCode: 200, responseBody: { jobId: 'n8n-abc-123' } });
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${port}/webhook`;

  try {
    state.findManyResult = [makeAsset()];
    const res = await post('/api/submit', { siteSlug: 'adobestock', assetIds: ['asset-1'] });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.status, 'submitted');

    // Verify the webhook received correct payload
    assert.ok(received.url.endsWith('/adobestock'), `webhook URL should end with /adobestock, got: ${received.url}`);
    assert.equal(received.body?.siteSlug, 'adobestock');
    assert.ok(Array.isArray(received.body?.assets));
  } finally {
    delete process.env.N8N_WEBHOOK_URL;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/submit – n8n provider HTTP error → 502, assets marked rejected', async () => {
  const { server, port } = await startWebhookMock({ statusCode: 503, responseBody: { error: 'Service Unavailable' } });
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${port}/webhook`;

  try {
    state.findManyResult = [makeAsset()];
    const res = await post('/api/submit', { siteSlug: 'adobestock', assetIds: ['asset-1'] });
    assert.equal(res.status, 502);
    // Assets and job should both be marked rejected
    assert.equal(state.lastUpdateManyArgs?.data?.status, 'rejected');
    assert.equal(state.lastJobUpdate?.data?.status, 'rejected');
  } finally {
    delete process.env.N8N_WEBHOOK_URL;
    await new Promise((resolve) => server.close(resolve));
  }
});
