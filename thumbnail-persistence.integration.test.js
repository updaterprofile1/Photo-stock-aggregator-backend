'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.NODE_ENV = 'test';

const projectRoot = __dirname;
const prismaPath = path.join(projectRoot, 'lib', 'prisma.js');

const state = {
  findFirstResult: null,
  updateResult: null,
  lastFindFirstArgs: null,
  lastUpdateArgs: null,
};

const prismaMock = {
  $transaction: async (fn) => fn(prismaMock),
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

require.cache[require.resolve(prismaPath)] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { getPrisma: () => prismaMock },
};

const {
  getDurableRecord,
  persistThumbnailMetadata,
  prepareForOriginalDeletion,
  recordSubmissionHistory,
} = require('./lib/thumbnailPersistence');

test.beforeEach(() => {
  state.findFirstResult = null;
  state.updateResult = null;
  state.lastFindFirstArgs = null;
  state.lastUpdateArgs = null;
});

test('persistThumbnailMetadata ensures empty submission history is saved', async () => {
  state.updateResult = {
    id: 'asset-1',
    thumbnailUrl: 'https://cdn.example/thumb.jpg',
    thumbnailStorageKey: 'thumbnails/p-1/asset-1/thumb.jpg',
    submissionHistory: [],
  };

  const result = await persistThumbnailMetadata({
    id: 'asset-1',
    thumbnailUrl: 'https://cdn.example/thumb.jpg',
    thumbnailStorageKey: 'thumbnails/p-1/asset-1/thumb.jpg',
  });

  assert.equal(result.id, 'asset-1');
  assert.deepEqual(state.lastUpdateArgs.data.submissionHistory, []);
});

test('recordSubmissionHistory appends a submitted entry', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    submissionHistory: [],
  };
  state.updateResult = {
    id: 'asset-1',
    submissionHistory: [],
  };

  await recordSubmissionHistory('asset-1', 'adobestock', { status: 'submitted' }, { userId: 'user-1' });

  assert.equal(state.lastUpdateArgs.where.id, 'asset-1');
  assert.equal(state.lastUpdateArgs.data.submissionHistory.length, 1);
  assert.equal(state.lastUpdateArgs.data.submissionHistory[0].siteId, 'adobestock');
  assert.equal(state.lastUpdateArgs.data.submissionHistory[0].status, 'submitted');
});

test('getDurableRecord returns thumbnail/metadata/history/lifecycle/retention shape', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    thumbnailUrl: 'https://cdn.example/thumb.jpg',
    thumbnailStorageKey: 'thumbnails/p-1/asset-1/thumb.jpg',
    title: 'Sunset',
    description: 'Sunset over hills',
    keywords: ['sunset', 'hills', 'nature'],
    contentOrigin: 'ai',
    metadataScore: 84,
    submissionHistory: [{ siteId: 'adobestock', submittedAt: '2026-04-02T10:00:00.000Z', status: 'distributed' }],
    status: 'thumbnail_only',
    retentionState: 'deleted',
    originalDeletedAt: new Date('2026-04-02T10:30:00.000Z'),
  };

  const record = await getDurableRecord('asset-1', { userId: 'user-1' });

  assert.equal(record.thumbUrl, 'https://cdn.example/thumb.jpg');
  assert.equal(record.metadata.title, 'Sunset');
  assert.equal(record.history.length, 1);
  assert.equal(record.lifecycle, 'thumbnail_only');
  assert.equal(record.retention, 'deleted');
});

test('prepareForOriginalDeletion returns durable snapshot when lifecycle allows deletion', async () => {
  state.findFirstResult = {
    id: 'asset-1',
    thumbnailUrl: 'https://cdn.example/thumb.jpg',
    thumbnailStorageKey: 'thumbnails/p-1/asset-1/thumb.jpg',
    title: 'Sunset',
    description: null,
    keywords: ['sunset'],
    contentOrigin: 'ai',
    metadataScore: 80,
    submissionHistory: [],
    status: 'distributed',
    retentionState: 'active',
    originalDeletedAt: null,
  };

  const snapshot = await prepareForOriginalDeletion('asset-1', { userId: 'user-1' });

  assert.equal(snapshot.assetId, 'asset-1');
  assert.equal(snapshot.lifecycle, 'distributed');
  assert.equal(snapshot.thumbUrl, 'https://cdn.example/thumb.jpg');
});
