# photo-stock-aggregator

A production-ready Express + Prisma + PostgreSQL API for managing stock photo portfolios. Images are uploaded to **Supabase Storage**; metadata is stored in **PostgreSQL** via Prisma ORM.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Supabase Storage Setup](#supabase-storage-setup)
- [API Reference](#api-reference)
- [Metadata Score](#metadata-score)
- [Security](#security)
- [Project Structure](#project-structure)

---

## Architecture

```
Client
  │
  ▼
Express (server.js)
  ├── helmet / cors / rate-limit
  ├── POST /api/upload  ─► Multer (memoryStorage) ─► Supabase Storage
  │                                                      │
  │                                                   fileUrl
  │                                                      │
  │                                              Prisma (assets table)
  │
  ├── GET  /api/portfolio/:id  ─► Prisma (assets by portfolioId)
  ├── GET/PATCH/POST /api/asset/:id[/retention]
  ├── POST /api/submit
  ├── PUT  /api/assets/:assetId
  └── GET  /health             ─► DB ping
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20.19.0 |
| npm | ≥ 9 |
| PostgreSQL | ≥ 14 (or Supabase DB) |
| Supabase project | any tier |

---

## Quick Start

```bash
# 1. Clone / copy the project
cd photo-stock-aggregator

# 2. Install dependencies
npm install

# 3. Configure environment
# Create a local .env file with required variables:
# DATABASE_URL=...
# DIRECT_URL=...   # optional locally, recommended for Prisma CLI in hosted Postgres
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...

# For Railway deployment, set DATABASE_URL, DIRECT_URL, SUPABASE_URL,
# and SUPABASE_SERVICE_ROLE_KEY in the Railway environment settings.

# 4. Generate Prisma client and apply schema changes for local development
npm run db:generate
npm run db:push       # local/dev convenience
# or: npm run db:migrate (creates migration files in development)

# 5. Start dev server (with hot reload)
npm run dev
```

Server starts at `http://localhost:3000`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Runtime app connection string (pooled endpoint recommended on hosted Postgres) |
| `DIRECT_URL` | ✗ | Direct non-pooled PostgreSQL URL for Prisma CLI (`validate`, `generate`, `migrate`, `db pull`) |
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `PORT` | ✗ | HTTP port (default: `3000`) |
| `NODE_ENV` | ✗ | `development` \| `production` |
| `CORS_ORIGIN` | ✗ | Allowed CORS origin (default: `*`) |
| `SHUTDOWN_TIMEOUT_MS` | ✗ | Graceful shutdown timeout in milliseconds (default: `10000`) |

### API User Context Header

All `/api/*` routes require an `x-user-id` header. The server scopes portfolio and asset access to this value to enforce tenant isolation.

Example:

```bash
curl -H "x-user-id: user-123" http://localhost:3000/api/portfolio/<portfolio-id>
```

> Note: Railway and other cloud hosts can inject these values directly into the runtime environment. A local `.env` file is only needed for development and should not be committed.

---

## Database Setup

### Option A — Supabase (recommended with Supabase Storage)

1. Create a new Supabase project at https://supabase.com
2. Copy the **pooled connection string** and set it as `DATABASE_URL`
3. Copy the **direct connection string** and set it as `DIRECT_URL`

### Option B — Local PostgreSQL

```bash
psql -U postgres -c "CREATE DATABASE photo_stock;"
# Then set DATABASE_URL=postgresql://postgres:password@localhost:5432/photo_stock
```

### Apply the schema

```bash
# Local development convenience (no migration history)
npm run db:push

# Create and apply versioned migrations in development
npm run db:migrate

# Production/staging rollout (safe, migration-history based)
npm run db:migrate:deploy
```

---

## Supabase Storage Setup

1. In the Supabase dashboard go to **Storage**.
2. Create a bucket named exactly **`images`**.
3. Set the bucket to **Public** (so `getPublicUrl` works without signed URLs).
4. Optionally add a file-size policy (≤ 10 MB) for extra safety.

---

## API Reference

### `GET /live`

Process liveness check (does not query the database). No authentication required.

**Response 200**
```json
{
  "status": "ok",
  "uptime": 42.3
}
```

### `GET /health`

Readiness check (includes lightweight DB ping). Returns 200 only when app + DB are ready. No authentication required.

**Response 200**
```json
{
  "status": "ok",
  "db": "connected",
  "uptime": 42.3
}
```

---

### `POST /api/upload`

Upload an image and create an asset record.

Requires header: `x-user-id`

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `image` | File | ✅ | JPEG / PNG / WebP, max 10 MB |
| `portfolioId` | string | ✅ | Must reference an existing portfolio |
| `contentOrigin` | string | ✅ | `"ai"` or `"non-ai"` |
| `title` | string | ✗ | Improves metadata score |
| `description` | string | ✗ | Improves metadata score |
| `keywords` | string | ✗ | Comma-separated, e.g. `"nature,forest,sunrise"` |

**Response 201**
```json
{
  "assetId": "clx8f...",
  "fileUrl": "https://your-project.supabase.co/storage/v1/object/public/images/portfolios/clx.../uuid.jpg",
  "metadataScore": 80
}
```

**Error responses**

| Code | Reason |
|------|--------|
| 400 | Missing required fields / invalid contentOrigin |
| 404 | Portfolio not found |
| 413 | File exceeds 10 MB |
| 429 | Rate limit exceeded (10 uploads/min/IP) |

---

### `GET /api/portfolio/:id`

Retrieve assets for a portfolio ID.

Requires header: `x-user-id`

Current implementation queries `Asset` records by `portfolioId`.

**Response 200**
```json
[
  {
    "id": "clx9g...",
    "portfolioId": "clx8f...",
    "title": "Golden Hour Forest",
    "description": "Sunlight filtering through pine trees",
    "keywords": ["forest", "golden hour", "nature"],
    "contentOrigin": "non-ai",
    "status": "draft",
    "fileUrl": "https://...",
    "thumbnailUrl": "https://...",
    "retentionState": "active",
    "originalDeletedAt": null,
    "metadataScore": 90,
    "createdAt": "2024-01-15T11:00:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
]
```

**Error responses**

| Code | Reason |
|------|--------|
| 404 | Portfolio not found |

---

### `GET /api/asset/:id`

Retrieve a single asset record by ID.

Requires header: `x-user-id`

**Response 200**
```json
{
  "id": "clx9g...",
  "portfolioId": "clx8f...",
  "title": "Golden Hour Forest",
  "description": "Sunlight filtering through pine trees",
  "keywords": ["forest", "golden hour", "nature"],
  "contentOrigin": "non-ai",
  "fileUrl": "https://...",
  "thumbnailUrl": "https://...",
  "retentionState": "active",
  "originalDeletedAt": null,
  "metadataScore": 90,
  "createdAt": "2024-01-15T11:00:00.000Z",
  "updatedAt": "2024-01-15T11:00:00.000Z"
}
```

### `PATCH /api/asset/:id`

Update asset metadata or retention state.

Requires header: `x-user-id`

**Request body** (JSON)

| Field | Type | Notes |
|-------|------|-------|
| `title` | string | optional |
| `description` | string | optional |
| `keywords` | string or string[] | comma-separated string or array of keywords |
| `contentOrigin` | string | optional, `ai` or `non-ai` |
| `retentionState` | string | optional, `active`, `deleted`, or `archived` |
| `status` | string | optional, `draft`, `ready`, `submitted`, `accepted`, `rejected`, `distributed`, `original_deleted`, `thumbnail_only` |

**Response 200**
```json
{
  "id": "clx9g...",
  "portfolioId": "clx8f...",
  "title": "Golden Hour Forest",
  "description": "Sunlight filtering through pine trees",
  "keywords": ["forest", "golden hour", "nature"],
  "contentOrigin": "non-ai",
  "fileUrl": "https://...",
  "thumbnailUrl": "https://...",
  "retentionState": "deleted",
  "originalDeletedAt": "2026-04-01T12:00:00.000Z",
  "metadataScore": 90,
  "createdAt": "2024-01-15T11:00:00.000Z",
  "updatedAt": "2026-04-01T12:00:00.000Z"
}
```

**Error responses**

| Code | Reason |
|------|--------|
| 400 | Validation failed |
| 400 | No valid fields provided for update |
| 404 | Asset not found |

---

### `POST /api/asset/:id/retention`

Mark an asset's retention state with a dedicated API call.

Requires header: `x-user-id`

**Request body**
```json
{
  "state": "deleted"
}
```

Valid states:
- `active`
- `deleted`
- `archived`

**Response 200**
```json
{
  "id": "clx9g...",
  "portfolioId": "clx8f...",
  "title": "Golden Hour Forest",
  "description": "Sunlight filtering through pine trees",
  "keywords": ["forest", "golden hour", "nature"],
  "contentOrigin": "non-ai",
  "fileUrl": "https://...",
  "thumbnailUrl": "https://...",
  "retentionState": "deleted",
  "originalDeletedAt": "2026-04-01T12:00:00.000Z",
  "metadataScore": 90,
  "createdAt": "2024-01-15T11:00:00.000Z",
  "updatedAt": "2026-04-01T12:00:00.000Z"
}
```

**Error responses**

| Code | Reason |
|------|--------|
| 400 | Validation failed |
| 404 | Asset not found |

---

### `POST /api/submit`

Submit one or more assets to a provider-neutral submission layer.

Requires header: `x-user-id`

**Request body**
```json
{
  "assetIds": ["clx9g...", "clx8f..."],
  "siteSlug": "example-site",
  "userId": "clx7e..."
}
```

**Response 202**
```json
{
  "jobId": "mock-...",
  "status": "submitted",
  "siteSlug": "example-site",
  "submittedCount": 2,
  "submittedAssetIds": ["clx9g...", "clx8f..."]
}
```

**Error responses**

| Code | Reason |
|------|--------|
| 400 | Invalid request body |
| 400 | One or more assets are not in `ready` status |
| 404 | One or more asset IDs not found |

---

### `PUT /api/assets/:assetId`

Alternate update endpoint mounted directly in `server.js`.

Requires header: `x-user-id`

**Request body** (JSON)

| Field | Type | Notes |
|-------|------|-------|
| `portfolioId` | string | required |
| `title` | string | optional |
| `description` | string | optional |
| `keywords` | string or string[] | comma-separated string or array of keywords |
| `contentOrigin` | string | optional, `ai`, `non-ai`, or `photo` (`photo` maps to `non_ai`) |
| `lifecycleState` | string | optional, mapped to `Asset.status` |

**Response 200**
```json
{
  "assetId": "clx9g...",
  "fileUrl": "https://...",
  "metadataScore": 90,
  "lifecycleState": "ready"
}
```

**Error responses**

| Code | Reason |
|------|--------|
| 400 | Validation failed |
| 400 | No valid updatable fields provided |
| 404 | Asset not found for the provided portfolio |

---

## Metadata Score

Assets receive an automatic quality score (0–100) on upload:

| Signal | Points |
|--------|--------|
| Title present | +20 |
| Title ≥ 10 characters | +10 |
| Description present | +20 |
| Description ≥ 30 characters | +10 |
| ≥ 1 keyword | +10 |
| ≥ 5 keywords | +10 |
| ≥ 10 keywords | +10 |
| contentOrigin declared | +10 |
| **Max total** | **100** |

---

## Security

| Control | Detail |
|---------|--------|
| `helmet` | Sets secure HTTP headers (CSP, HSTS, etc.) |
| `cors` | Configurable origin allowlist; allowed methods currently `GET`, `POST`, `PUT` |
| Global rate limit | 100 req / 15 min / IP on all `/api` routes |
| Upload rate limit | 10 req / min / IP on `POST /api/upload` |
| File type validation | Current `lib/multer.js` accepts any MIME type; only size is enforced |
| File size limit | 10 MB hard cap enforced by Multer |
| Env-var guard | Server refuses to start if any required var is missing |

---

## Project Structure

```
photo-stock-aggregator/
├── lib/
│   ├── multer.js         # Multer config (memory storage + size limit)
│   ├── prisma.js         # Singleton PrismaClient
│   ├── storage.js        # Storage upload/delete/public URL helpers
│   ├── submission.js     # Provider-neutral submission service
│   ├── supabase.js       # Supabase Storage client + upload helper
│   └── metadataScore.js  # Scoring algorithm
├── prisma.config.ts
├── prisma/
│   └── schema.prisma     # DB schema (users, portfolios, assets)
├── routes/
│   ├── upload.js         # POST /api/upload
│   ├── portfolio.js      # GET  /api/portfolio/:id
│   ├── asset.js          # GET/PATCH/POST retention under /api/asset
│   └── submit.js         # POST /api/submit
├── .gitignore
├── package.json
├── README.md
├── test-storage.js
├── put-asset.integration.test.js
└── server.js             # Express app entry point
```

---

## npm Scripts

| Script | Action |
|--------|--------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Start without hot reload |
| `npm run db:generate` | Regenerate Prisma Client from schema |
| `npm run db:push` | Push schema to DB (no migration history) |
| `npm run db:migrate` | Create + apply a versioned migration |
| `npm run db:migrate:deploy` | Apply committed migrations in staging/production |
| `npm run db:studio` | Open Prisma Studio GUI |
