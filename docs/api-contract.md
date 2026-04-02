# API Contract

Base URL: server host (default local port `3000`)

## Auth
All `/api/*` endpoints require:
- `Authorization: Bearer <supabase-access-token>`

Unauthenticated requests return `401`.

## Health
### GET /live
- Purpose: process liveness check
- Auth: not required
- 200 response: `{ status, uptime }`

### GET /health
- Purpose: readiness check (includes DB ping)
- Auth: not required
- 200 response: `{ status, db, uptime }`
- 503 response when DB is unreachable

## Upload
### POST /api/upload
- Content-Type: `multipart/form-data`
- Fields:
  - `image` (required)
  - `portfolioId` (required)
  - `contentOrigin` (`ai` or `non-ai`, required)
  - `title` (optional)
  - `description` (optional)
  - `keywords` (optional comma-separated string)
- Success 201 shape:
  - `assetId`
  - `fileUrl`
  - `thumbnailUrl`
  - `metadataScore`
- Common failures:
  - 400 validation
  - 404 portfolio not found
  - 415 unsupported file type/invalid image
  - 422 image dimension failure
  - 413 file too large
  - 500 storage failure

## Portfolio
### GET /api/portfolio/:id
- Returns portfolio with normalized assets list
- 200 includes:
  - portfolio metadata
  - `assets[]` with lifecycle, retention, URLs, and submission history summary
- 404 if not found for authenticated user

## Asset
### GET /api/asset/:id
- Returns normalized single-asset payload
- 404 if not found for authenticated user

### PATCH /api/asset/:id
- Updatable fields:
  - `title`, `description`, `keywords`
  - `contentOrigin` (`ai|non-ai`)
  - `retentionState` (`active|deleted|archived`)
  - `status` (lifecycle transition)
  - optional submission-history context: `siteId`, `externalAssetId`
- Behavior:
  - metadata score recalculated on update
  - lifecycle transition validated
  - accepted/rejected/distributed with `siteId` appends submission history entry
- Common failures:
  - 400 validation/no-op update
  - 404 not found

### POST /api/asset/:id/retention
- Body: `{ state: "active"|"deleted"|"archived" }`
- Updates retention fields
- 400 invalid state
- 404 not found

## Asset Update (Legacy/alternate endpoint)
### PUT /api/assets/:assetId
- Body requires `portfolioId`
- Supports metadata + lifecycle updates
- Returns compact payload:
  - `assetId`
  - `fileUrl`
  - `metadataScore`
  - `lifecycleState`

## Submission
### POST /api/submit
- Body:
  - `siteSlug` (required)
  - `assetIds` (required non-empty array)
- Success 202 returns:
  - `jobId`
  - `status` (`submitted`)
  - `siteSlug`
  - `submittedCount`
  - `submittedAssetIds`
  - `provider` (`mock` or `n8n`)
- Common failures:
  - 400 unknown site/validation
  - 404 asset ownership mismatch
  - 409 asset lifecycle not ready
  - 422 site-rule violation
  - 502 webhook/network failure

## Jobs
### GET /api/jobs/:jobId
- Returns job status for owner only
- 200 response fields:
  - `jobId`, `status`, `siteSlug`, `assetIds`, `createdAt`, `updatedAt`
- 404 for both not found and non-owner access
