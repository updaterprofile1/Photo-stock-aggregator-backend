// server.js
'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const uploadRouter = require('./routes/upload');
const portfolioRouter = require('./routes/portfolio');
const { getPrisma } = require('./lib/prisma');

// ─── Validate required environment variables ──────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
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
app.get('/health', async (_req, res) => {
  try {
    // Quick DB ping
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch (err) {
    return res.status(503).json({ status: 'error', db: 'unreachable', message: err.message });
  }
});

app.use('/api/upload', uploadLimiter, uploadRouter);
app.use('/api/portfolio', portfolioRouter);

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

  console.error('[error]', err);
  return res.status(status).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] photo-stock-aggregator running on http://localhost:${PORT}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app; // for testing
