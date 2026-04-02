'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const projectRoot = __dirname;
const prismaPath = path.join(projectRoot, 'lib', 'prisma.js');
const metadataPath = path.join(projectRoot, 'lib', 'metadataScore.js');
const supabasePath = path.join(projectRoot, 'lib', 'supabase.js');

const state = {
  findFirstResult: null,
  updateResult: null,
  lastFindFirstArgs: null,
  lastUpdateArgs: null,
  lastScoreInput: null,
};

const prismaMock = {
  $queryRaw: async () => 1,
  asset: {
    findFirst: async (args) => {
      state.lastFindFirstArgs = args;
      return state.findFirstResult;
    },
    update: async (args) => {
      state.lastUpdateArgs = args;
      return state.updateResult;
    },
  },
};

function computeMetadataScoreMock(input) {
  state.lastScoreInput = input;
  return 77.7;
}

// Stub modules before loading server.js so route handlers capture mocked deps.
require.cache[require.resolve(prismaPath)] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { getPrisma: () => prismaMock },
};

require.cache[require.resolve(metadataPath)] = {
  id: metadataPath,
  filename: metadataPath,
  loaded: true,
  exports: { computeMetadataScore: computeMetadataScoreMock },
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
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test.beforeEach(() => {
  state.findFirstResult = null;
  state.updateResult = null;
  state.lastFindFirstArgs = null;
  state.lastUpdateArgs = null;
  state.lastScoreInput = null;
});

test('PUT /api/assets/:assetId returns 400 when portfolioId is missing', async () => {
  const res = await fetch(`${baseUrl}/api/assets/asset-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
    body: JSON.stringify({ title: 'New title' }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'portfolioId is required.');
});

test('PUT /api/assets/:assetId returns 404 when asset does not exist for portfolio', async () => {
  state.findFirstResult = null;

  const res = await fetch(`${baseUrl}/api/assets/asset-404`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
    body: JSON.stringify({ portfolioId: 'portfolio-1', title: 'New title' }),
  });

  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /not found/i);
  assert.deepEqual(state.lastFindFirstArgs, {
    where: { id: 'asset-404', portfolioId: 'portfolio-1', portfolio: { userId: 'user-1' } },
  });
});

test('PUT /api/assets/:assetId returns 400 for invalid lifecycleState', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    portfolioId: 'portfolio-1',
    title: 'T',
    description: null,
    keywords: [],
    contentOrigin: 'ai',
    status: 'draft',
  };

  const res = await fetch(`${baseUrl}/api/assets/asset-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
    body: JSON.stringify({
      portfolioId: 'portfolio-1',
      lifecycleState: 'invalid-state',
    }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'Validation failed');
  assert.ok(Array.isArray(body.details));
  assert.match(body.details.join(' '), /lifecycleState/i);
});

test('PUT /api/assets/:assetId returns 400 for invalid lifecycle transition draft -> distributed', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    portfolioId: 'portfolio-1',
    title: 'Old title',
    description: 'Old description',
    keywords: ['one', 'two', 'three'],
    contentOrigin: 'ai',
    status: 'draft',
  };

  const res = await fetch(`${baseUrl}/api/assets/asset-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
    body: JSON.stringify({
      portfolioId: 'portfolio-1',
      lifecycleState: 'distributed',
      title: 'Valid title',
    }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'Validation failed');
  assert.match(body.details.join(' '), /invalid lifecycle transition/i);
});

test('PUT /api/assets/:assetId auto-promotes draft -> ready when metadata score threshold is met', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    portfolioId: 'portfolio-1',
    title: 'Old title',
    description: 'Old description',
    keywords: ['one'],
    contentOrigin: 'ai',
    status: 'draft',
  };

  state.updateResult = {
    id: 'asset-1',
    fileUrl: 'https://cdn.example/image.jpg',
    metadataScore: 77.7,
    status: 'ready',
  };

  const res = await fetch(`${baseUrl}/api/assets/asset-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
    body: JSON.stringify({
      portfolioId: 'portfolio-1',
      title: 'New title',
    }),
  });

  assert.equal(res.status, 200);
  assert.equal(state.lastUpdateArgs?.data?.status, 'ready');
});

test('PUT /api/assets/:assetId allows valid transition ready -> submitted', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    portfolioId: 'portfolio-1',
    title: 'Complete title',
    description: 'Complete description',
    keywords: ['one', 'two', 'three'],
    contentOrigin: 'ai',
    status: 'ready',
  };

  state.updateResult = {
    id: 'asset-1',
    fileUrl: 'https://cdn.example/image.jpg',
    metadataScore: 77.7,
    status: 'submitted',
  };

  const res = await fetch(`${baseUrl}/api/assets/asset-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
    body: JSON.stringify({
      portfolioId: 'portfolio-1',
      lifecycleState: 'submitted',
      title: 'Complete title',
      description: 'Complete description',
      keywords: 'one,two,three,four',
    }),
  });

  assert.equal(res.status, 200);
  assert.equal(state.lastUpdateArgs?.data?.status, 'submitted');
});

test('PUT /api/assets/:assetId allows valid transition submitted -> accepted', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    portfolioId: 'portfolio-1',
    title: 'Complete title',
    description: 'Complete description',
    keywords: ['one', 'two', 'three', 'four'],
    contentOrigin: 'ai',
    status: 'submitted',
  };

  state.updateResult = {
    id: 'asset-1',
    fileUrl: 'https://cdn.example/image.jpg',
    metadataScore: 77.7,
    status: 'accepted',
  };

  const res = await fetch(`${baseUrl}/api/assets/asset-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
    body: JSON.stringify({
      portfolioId: 'portfolio-1',
      lifecycleState: 'accepted',
      title: 'Complete title',
      description: 'Complete description',
      keywords: 'one,two,three,four',
    }),
  });

  assert.equal(res.status, 200);
  assert.equal(state.lastUpdateArgs?.data?.status, 'accepted');
});

test('PUT /api/assets/:assetId updates allowed fields and returns normalized response', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    portfolioId: 'portfolio-1',
    title: 'Old title',
    description: 'Old description',
    keywords: ['one'],
    contentOrigin: 'ai',
    status: 'draft',
  };

  state.updateResult = {
    id: 'asset-1',
    fileUrl: 'https://cdn.example/image.jpg',
    metadataScore: 77.7,
    status: 'ready',
  };

  const res = await fetch(`${baseUrl}/api/assets/asset-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
    body: JSON.stringify({
      portfolioId: 'portfolio-1',
      title: 'New title',
      description: 'A better description for this asset.',
      keywords: 'one,two,three,four,five,six',
      contentOrigin: 'photo',
      lifecycleState: 'ready',
    }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(body, {
    assetId: 'asset-1',
    fileUrl: 'https://cdn.example/image.jpg',
    metadataScore: 77.7,
    lifecycleState: 'ready',
  });

  assert.deepEqual(state.lastUpdateArgs, {
    where: { id: 'asset-1' },
    data: {
      status: 'ready',
      title: 'New title',
      description: 'A better description for this asset.',
      keywords: ['one', 'two', 'three', 'four', 'five', 'six'],
      contentOrigin: 'non_ai',
      metadataScore: 77.7,
    },
  });

  assert.deepEqual(state.lastScoreInput, {
    title: 'New title',
    description: 'A better description for this asset.',
    keywords: ['one', 'two', 'three', 'four', 'five', 'six'],
    contentOrigin: 'non_ai',
  });
});
