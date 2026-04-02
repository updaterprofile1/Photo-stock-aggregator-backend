# System Architecture

## Purpose
This service manages stock-photo assets and submission workflows.

- Runtime: Node.js + Express
- Storage: Supabase Storage (originals + thumbnails)
- Database: PostgreSQL via Prisma ORM

## Request Flow
1. Client calls API routes under `/api/*`.
2. Global middleware applies security headers, CORS, rate limits, and auth.
3. Route handlers validate input and enforce ownership using `req.userId`.
4. Prisma persists metadata and lifecycle state.
5. Supabase Storage persists image objects.

## Auth and Ownership
- API auth is Bearer-token based via Supabase Auth lookup.
- Auth middleware sets `req.userId` in `lib/requestUser.js`.
- Portfolio/asset ownership checks are performed in route queries.

## Core Components
- App entry and middleware wiring: `server.js`
- Upload pipeline: `routes/upload.js`
- Portfolio fetch: `routes/portfolio.js`
- Asset fetch/update/retention: `routes/asset.js`
- Submission trigger: `routes/submit.js`
- Job polling: `routes/jobs.js`
- Submission orchestration: `lib/submission.js`
- Thumbnail durability helper: `lib/thumbnailPersistence.js`
- API shape normalization: `lib/normalizeAsset.js`

## Data Model Highlights
Defined in `prisma/schema.prisma`:
- `Asset` stores metadata, lifecycle (`status`), retention fields, and storage refs.
- Durable thumbnail metadata persistence uses:
  - `thumbnailUrl`
  - `thumbnailStorageKey`
  - `submissionHistory` (Json, default `[]`)
- `SubmissionJob` tracks async submission status by `siteSlug` and `assetIds`.

## Lifecycle and Retention
- Allowed lifecycle transitions are enforced in `lib/assetLifecycle.js`.
- Retention fields on `Asset`:
  - `retentionState` (`active|deleted|archived`)
  - `originalDeletedAt`
- Durable record helper in `lib/thumbnailPersistence.js` supports original-delete readiness checks.

## Submission Architecture
- `POST /api/submit` routes to `submitAssets` in `lib/submission.js`.
- Provider selection:
  - Mock provider if `N8N_WEBHOOK_URL` is not set.
  - n8n webhook provider if `N8N_WEBHOOK_URL` is set.
- Submission outcomes append to asset `submissionHistory`.

## Operational Endpoints
- `GET /live`: liveness
- `GET /health`: readiness + DB ping

## Security Controls
- `helmet` for secure HTTP headers
- `cors` with configurable origin
- route-specific and global `express-rate-limit`
- auth required for all `/api/*` routes
