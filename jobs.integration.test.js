'use strict';

/**
 * Integration tests for GET /api/jobs/:jobId
 *
 * Mocking strategy mirrors submit.integration.test.js:
 *   - lib/prisma is stubbed via require.cache before server.js loads.
 *   - lib/supabase is stubbed; 'valid-token' resolves to 'user-1'.
 *   - No real DB or n8n calls are made.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const projectRoot = __dirname;
const prismaPath = path.join(projectRoot, 'lib', 'prisma.js');
const supabasePath = path.join(projectRoot, 'lib', 'supabase.js');

// ─── Prisma mock state ────────────────────────────────────────────────────────
const state = {
  findUniqueResult: null,
  lastFindUniqueArgs: null,
  // submissionJob.create / update are needed so submission.js works if
  // a test exercises POST /api/submit internally (not used here directly).
  lastJobCreate: null,
  lastJobUpdate: null,
  findManyResult: [],
  lastUpdateManyArgs: null,
};

const prismaMock = {
  $queryRaw: async () => 1,
  asset: {
    findMany: async () => state.findManyResult,
    updateMany: async (args) => {
      state.lastUpdateManyArgs = args;
      return { count: 0 };
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
    findUnique: async (args) => {
      state.lastFindUniqueArgs = args;
      return state.findUniqueResult;
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

// Stub supabase auth – 'valid-token' → 'user-1', anything else → 401
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
  state.findUniqueResult = null;
  state.lastFindUniqueArgs = null;
  state.lastJobCreate = null;
  state.lastJobUpdate = null;
  state.findManyResult = [];
  state.lastUpdateManyArgs = null;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function get(path, token = 'valid-token') {
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

const JOB_ID = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-04-02T10:00:00.000Z');

function makeJob(overrides = {}) {
  return {
    id: JOB_ID,
    userId: 'user-1',
    siteSlug: 'adobestock',
    status: 'submitted',
    assetIds: ['asset-1', 'asset-2'],
    provider: 'mock',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ─── Suite: auth ──────────────────────────────────────────────────────────────

test('GET /api/jobs/:jobId – missing Authorization → 401', async () => {
  const res = await fetch(`${baseUrl}/api/jobs/${JOB_ID}`);
  assert.equal(res.status, 401);
});

test('GET /api/jobs/:jobId – invalid token → 401', async () => {
  const res = await get(`/api/jobs/${JOB_ID}`, 'bad-token');
  assert.equal(res.status, 401);
});

// ─── Suite: not found / ownership ────────────────────────────────────────────

test('GET /api/jobs/:jobId – job does not exist → 404', async () => {
  state.findUniqueResult = null;
  const res = await get(`/api/jobs/${JOB_ID}`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /not found/i);
});

test('GET /api/jobs/:jobId – job exists but belongs to a different user → 404', async () => {
  state.findUniqueResult = makeJob({ userId: 'other-user' });
  const res = await get(`/api/jobs/${JOB_ID}`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /not found/i);
});

// ─── Suite: happy path ────────────────────────────────────────────────────────

test('GET /api/jobs/:jobId – found → 200 with stable JSON shape', async () => {
  state.findUniqueResult = makeJob();
  const res = await get(`/api/jobs/${JOB_ID}`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.jobId, JOB_ID);
  assert.equal(body.status, 'submitted');
  assert.equal(body.siteSlug, 'adobestock');
  assert.deepEqual(body.assetIds, ['asset-1', 'asset-2']);
  assert.equal(body.createdAt, NOW.toISOString());
  assert.equal(body.updatedAt, NOW.toISOString());

  // Fields that must NOT be exposed
  assert.equal(body.userId, undefined, 'userId must not leak');
  assert.equal(body.provider, undefined, 'provider must not leak');
});

test('GET /api/jobs/:jobId – status reflects queued state', async () => {
  state.findUniqueResult = makeJob({ status: 'queued' });
  const res = await get(`/api/jobs/${JOB_ID}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'queued');
});

test('GET /api/jobs/:jobId – status reflects rejected state', async () => {
  state.findUniqueResult = makeJob({ status: 'rejected' });
  const res = await get(`/api/jobs/${JOB_ID}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'rejected');
});

test('GET /api/jobs/:jobId – prisma called with correct id', async () => {
  state.findUniqueResult = makeJob();
  await get(`/api/jobs/${JOB_ID}`);
  assert.deepEqual(state.lastFindUniqueArgs, { where: { id: JOB_ID } });
});
