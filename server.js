// server.js
'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const uploadRouter = require('./routes/upload');
const portfolioRouter = require('./routes/portfolio');
const submitRouter = require('./routes/submit');
const assetRouter = require('./routes/asset');
const { getPrisma, closePrisma } = require('./lib/prisma');
const { computeMetadataScore } = require('./lib/metadataScore');
const { requireUserId } = require('./lib/requestUser');

// ─── Validate required environment variables ──────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const port = process.env.PORT || 3000;
const app = express();
let server;
app.set('trust proxy', 1);

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*'),
    methods: ['GET', 'POST', 'PUT'],
  }),
);

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Rate limiters ────────────────────────────────────────────────────────────

// General API limiter – 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', globalLimiter);
app.use('/api', requireUserId);

// Strict upload limiter – 10 requests per minute per IP
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload rate limit exceeded (10/min). Please slow down.' },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — no rate limit, no auth
app.get('/live', (_req, res) => {
  return res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/health', async (_req, res) => {
  try {
    // Quick DB ping
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch (err) {
    const message = 'Database unreachable.';
    return res.status(503).json({ status: 'error', db: 'unreachable', message });
  }
});

app.use('/api/upload', uploadLimiter, uploadRouter);
app.use('/api/portfolio', portfolioRouter);

// Submit: 20 submissions per 10 minutes per IP
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Submit rate limit exceeded (20/10 min). Please slow down.' },
});
app.use('/api/submit', submitLimiter, submitRouter);
app.use('/api/asset', assetRouter);

/**
 * PUT /api/assets/:assetId
 *
 * JSON body:
 *   portfolioId    (string, required)
 *   title          (string, optional)
 *   description    (string, optional)
 *   keywords       (string|array, optional)  // comma-separated string or string[]
 *   contentOrigin  (string, optional)         // 'ai' | 'non-ai' | 'photo'
 *   lifecycleState (string, optional)         // maps to Asset.status
 */
app.put('/api/assets/:assetId', async (req, res, next) => {
  try {
    const { assetId } = req.params;
    const { portfolioId, title, description, keywords, contentOrigin, lifecycleState } = req.body;

    if (!assetId || typeof assetId !== 'string' || !assetId.trim()) {
      return res.status(400).json({ error: 'assetId path parameter is required.' });
    }

    if (!portfolioId || typeof portfolioId !== 'string' || !portfolioId.trim()) {
      return res.status(400).json({ error: 'portfolioId is required.' });
    }

    const prisma = getPrisma();
    const asset = await prisma.asset.findFirst({
      where: {
        id: assetId,
        portfolioId,
        portfolio: { userId: req.userId },
      },
    });

    if (!asset) {
      return res.status(404).json({ error: `Asset '${assetId}' not found for portfolio '${portfolioId}'.` });
    }

    const errors = [];
    const update = {};

    let parsedKeywords;
    if (keywords !== undefined) {
      if (Array.isArray(keywords)) {
        parsedKeywords = keywords.map((k) => String(k).trim()).filter(Boolean);
      } else if (typeof keywords === 'string') {
        parsedKeywords = keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
      } else {
        errors.push('keywords must be a comma-separated string or an array of strings.');
      }
    }

    let mappedContentOrigin;
    if (contentOrigin !== undefined) {
      if (contentOrigin === 'ai') {
        mappedContentOrigin = 'ai';
      } else if (contentOrigin === 'non-ai' || contentOrigin === 'photo') {
        mappedContentOrigin = 'non_ai';
      } else {
        errors.push("contentOrigin must be 'ai', 'non-ai', or 'photo'.");
      }
    }

    const allowedLifecycleStates = [
      'draft',
      'ready',
      'submitted',
      'accepted',
      'rejected',
      'distributed',
      'original_deleted',
      'thumbnail_only',
    ];

    if (lifecycleState !== undefined) {
      if (!allowedLifecycleStates.includes(lifecycleState)) {
        errors.push(
          "lifecycleState must be one of 'draft', 'ready', 'submitted', 'accepted', 'rejected', 'distributed', 'original_deleted', or 'thumbnail_only'."
        );
      } else {
        update.status = lifecycleState;
      }
    }

    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    if (title !== undefined) {
      update.title = String(title);
    }

    if (description !== undefined) {
      update.description = description ? String(description) : null;
    }

    if (parsedKeywords !== undefined) {
      update.keywords = parsedKeywords;
    }

    if (mappedContentOrigin !== undefined) {
      update.contentOrigin = mappedContentOrigin;
    }

    // Recompute metadata score from the merged asset metadata state.
    const mergedTitle = update.title !== undefined ? update.title : asset.title;
    const mergedDescription = update.description !== undefined ? update.description : asset.description;
    const mergedKeywords = update.keywords !== undefined ? update.keywords : asset.keywords;
    const mergedContentOrigin = update.contentOrigin !== undefined ? update.contentOrigin : asset.contentOrigin;

    update.metadataScore = computeMetadataScore({
      title: mergedTitle || '',
      description: mergedDescription || '',
      keywords: Array.isArray(mergedKeywords) ? mergedKeywords : [],
      contentOrigin: mergedContentOrigin,
    });

    // Lifecycle promotion gate: score >= 50 required to advance status
    const PROMOTION_STATES = new Set(['ready', 'submitted', 'accepted', 'distributed']);
    if (lifecycleState !== undefined && PROMOTION_STATES.has(lifecycleState) && update.metadataScore < 50) {
      return res.status(400).json({
        error: 'Incomplete metadata',
        currentScore: update.metadataScore,
      });
    }

    if (Object.keys(update).length === 1 && update.metadataScore !== undefined) {
      return res.status(400).json({ error: 'No valid updatable fields provided.' });
    }

    const updatedAsset = await prisma.asset.update({
      where: { id: assetId },
      data: update,
    });

    return res.status(200).json({
      assetId: updatedAsset.id,
      fileUrl: updatedAsset.fileUrl,
      metadataScore: updatedAsset.metadataScore,
      lifecycleState: updatedAsset.status,
    });
  } catch (err) {
    next(err);
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 10 MB.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: "Unexpected file field. Use field name 'image'." });
  }
  // Custom statusCode errors (e.g. from file filter)
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error.'
    : err.message;

  const errorLog = {
    status,
    code: err.code,
    name: err.name,
    message: err.message,
  };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    errorLog.stack = err.stack;
  }

  console.error('[error]', errorLog);
  return res.status(status).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });

  let isShuttingDown = false;
  const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);

  const shutdown = async (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`[shutdown] Received ${signal}, shutting down...`);

    const forceExitTimer = setTimeout(() => {
      console.error('[shutdown] Timed out waiting for graceful shutdown. Exiting forcefully.');
      process.exit(1);
    }, shutdownTimeoutMs);
    if (typeof forceExitTimer.unref === 'function') {
      forceExitTimer.unref();
    }

    try {
      await new Promise((resolve, reject) => {
        if (!server) {
          return resolve();
        }
        return server.close((err) => (err ? reject(err) : resolve()));
      });

      await closePrisma();
      clearTimeout(forceExitTimer);
      console.log('[shutdown] Graceful shutdown complete.');
      process.exit(0);
    } catch (shutdownErr) {
      clearTimeout(forceExitTimer);
      console.error('[shutdown] Shutdown failed:', shutdownErr.message);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

module.exports = app; // for testing
