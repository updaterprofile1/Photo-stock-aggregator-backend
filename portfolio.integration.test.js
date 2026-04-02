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
const supabasePath = path.join(projectRoot, 'lib', 'supabase.js');
const storagePath = path.join(projectRoot, 'lib', 'storage.js');

const state = {
  findFirstPortfolioResult: null,
};

const prismaMock = {
  $queryRaw: async () => 1,
  portfolio: {
    findFirst: async () => state.findFirstPortfolioResult,
  },
};

require.cache[require.resolve(prismaPath)] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { getPrisma: () => prismaMock, closePrisma: async () => {} },
};

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

require.cache[require.resolve(storagePath)] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: {
    getPublicUrl: (storageKey) => `https://cdn.example/${storageKey}`,
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
  state.findFirstPortfolioResult = null;
});

test('GET /api/portfolio/:id includes lifecycle and status fields for assets', async () => {
  state.findFirstPortfolioResult = {
    id: 'portfolio-1',
    userId: 'user-1',
    name: 'Portfolio',
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    assets: [
      {
        id: 'asset-1',
        portfolioId: 'portfolio-1',
        title: 'Asset title',
        description: 'Asset description',
        keywords: ['one', 'two', 'three'],
        contentOrigin: 'non_ai',
        status: 'ready',
        fileUrl: 'https://stored.example/original.jpg',
        storageKey: 'originals/portfolio-1/asset-1/asset.jpg',
        thumbnailUrl: 'https://stored.example/thumb.jpg',
        thumbnailStorageKey: 'thumbnails/portfolio-1/asset-1/thumb_asset.jpg',
        retentionState: 'active',
        originalDeletedAt: null,
        metadataScore: 77.7,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ],
  };

  const res = await fetch(`${baseUrl}/api/portfolio/portfolio-1`, {
    headers: { Authorization: 'Bearer valid-token' },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.assets[0].lifecycle, 'ready');
  assert.equal(body.assets[0].status, 'ready');
});
