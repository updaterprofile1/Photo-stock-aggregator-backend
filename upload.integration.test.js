'use strict';

/**
 * Integration tests for POST /api/upload — image validation middleware.
 *
 * Tests the full middleware chain:
 *   multer (MIME+size) → imageValidator (magic-byte MIME + dimensions) → handler
 *
 * Stubs: lib/prisma, lib/supabase, lib/storage (no live I/O).
 * IMAGE_MIN_DIMENSION is set to 16 so test images are tiny (< 1 KB).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const sharp = require('sharp');

// Must be set BEFORE server.js (and imageValidator.js) are loaded.
process.env.IMAGE_MIN_DIMENSION = '16';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const projectRoot = __dirname;
const prismaPath   = path.join(projectRoot, 'lib', 'prisma.js');
const supabasePath = path.join(projectRoot, 'lib', 'supabase.js');
const storagePath  = path.join(projectRoot, 'lib', 'storage.js');

// ─── Mutable test state ───────────────────────────────────────────────────────
const state = {
  findFirstPortfolioResult: null,
  createAssetResult: null,
  updateAssetResult: null,
  lastCreateArgs: null,
  lastUpdateArgs: null,
};

// ─── Stubs (registered before server.js loads) ────────────────────────────────
const prismaMock = {
  $queryRaw: async () => 1,
  portfolio: {
    findFirst: async () => state.findFirstPortfolioResult,
  },
  asset: {
    create: async (args) => {
      state.lastCreateArgs = args;
      return state.createAssetResult;
    },
    update: async (args) => {
      state.lastUpdateArgs = args;
      return state.updateAssetResult;
    },
  },
};

require.cache[require.resolve(prismaPath)] = {
  id: prismaPath, filename: prismaPath, loaded: true,
  exports: { getPrisma: () => prismaMock, closePrisma: async () => {} },
};

require.cache[require.resolve(supabasePath)] = {
  id: supabasePath, filename: supabasePath, loaded: true,
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
  id: storagePath, filename: storagePath, loaded: true,
  exports: {
    storageManager: {
      upload: async (_buf, key, _opts) => ({
        originalUrl: `https://example.supabase.co/storage/v1/object/public/images/originals/${key}`,
        thumbUrl: `https://example.supabase.co/storage/v1/object/public/images/thumbnails/${key}`,
        key,
        originalPath: `originals/${key}`,
        thumbPath: `thumbnails/${key}`,
      }),
    },
    StorageError: class StorageError extends Error {},
  },
};

const app = require('./server');

let server;
let baseUrl;
let validPng;    // 16×16 — passes dimension check
let tooSmallPng; // 8×8  — fails dimension check (below IMAGE_MIN_DIMENSION=16)

const AUTH = { authorization: 'Bearer valid-token' };

// ─── Lifecycle ────────────────────────────────────────────────────────────────
test.before(async () => {
  [validPng, tooSmallPng] = await Promise.all([
    sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).png().toBuffer(),
    sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 64, g: 64, b: 64 } },
    }).png().toBuffer(),
  ]);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test.beforeEach(() => {
  state.findFirstPortfolioResult = null;
  state.createAssetResult = null;
  state.updateAssetResult = null;
  state.lastCreateArgs = null;
  state.lastUpdateArgs = null;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeForm(blob, fields = {}) {
  const fd = new FormData();
  if (blob !== null) fd.append('image', blob, 'photo.png');
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

// ─── Test cases ───────────────────────────────────────────────────────────────

test('POST /api/upload → 400 when no image file is provided', async () => {
  const fd = new FormData();
  fd.append('portfolioId', 'p-1');
  fd.append('contentOrigin', 'ai');
  const res = await fetch(`${baseUrl}/api/upload`, { method: 'POST', headers: AUTH, body: fd });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /validation failed/i);
});

test('POST /api/upload → 415 when Content-Type MIME is disallowed (gif)', async () => {
  // multer fileFilter rejects image/gif before imageValidator runs
  const blob = new Blob([Buffer.from('GIF89a\x01\x00\x01\x00')], { type: 'image/gif' });
  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: AUTH,
    body: makeForm(blob, { portfolioId: 'p-1', contentOrigin: 'ai' }),
  });
  assert.equal(res.status, 415);
});

test('POST /api/upload → 415 when file passes MIME header check but is not a valid image', async () => {
  // imageValidator: sharp.metadata() throws on non-image bytes → 415
  const notAnImage = Buffer.from('this is plaintext, not an image');
  const blob = new Blob([notAnImage], { type: 'image/png' });
  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: AUTH,
    body: makeForm(blob, { portfolioId: 'p-1', contentOrigin: 'ai' }),
  });
  assert.equal(res.status, 415);
  const body = await res.json();
  assert.match(body.error, /valid image/i);
});

test('POST /api/upload → 422 when image dimensions are below minimum', async () => {
  // 8×8 PNG is valid but below IMAGE_MIN_DIMENSION=16
  const blob = new Blob([tooSmallPng], { type: 'image/png' });
  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: AUTH,
    body: makeForm(blob, { portfolioId: 'p-1', contentOrigin: 'ai' }),
  });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.match(body.error, /too small/i);
});

test('POST /api/upload → 400 when image is valid but required body fields are missing', async () => {
  // portfolioId absent → validation error in handler body
  const blob = new Blob([validPng], { type: 'image/png' });
  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: AUTH,
    body: makeForm(blob, { contentOrigin: 'ai' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /validation failed/i);
});

test('POST /api/upload → 201 on fully valid upload', async () => {
  state.findFirstPortfolioResult = { id: 'p-1', userId: 'user-1' };
  state.createAssetResult = {
    id: 'asset-abc',
    fileUrl: 'https://example.supabase.co/storage/v1/object/public/images/originals/p-1/asset-abc/asset-abc.png',
    thumbnailUrl: 'https://example.supabase.co/storage/v1/object/public/images/thumbnails/p-1/asset-abc/thumb_asset-abc.png',
    thumbnailStorageKey: 'thumbnails/p-1/asset-abc/thumb_asset-abc.png',
    submissionHistory: [],
    metadataScore: 30,
  };
  state.updateAssetResult = state.createAssetResult;

  const blob = new Blob([validPng], { type: 'image/png' });
  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: AUTH,
    body: makeForm(blob, { portfolioId: 'p-1', contentOrigin: 'ai', title: 'Test image' }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.assetId, 'asset-abc');
  assert.ok(body.fileUrl);
  assert.ok(body.thumbnailUrl);
  assert.ok(typeof body.metadataScore === 'number');

  assert.equal(state.lastCreateArgs?.data?.status, 'draft');
  assert.deepEqual(state.lastCreateArgs?.data?.submissionHistory, []);
});
