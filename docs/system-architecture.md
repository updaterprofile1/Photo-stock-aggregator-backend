# System Architecture

## Purpose
This service manages stock-photo assets and submission workflows.

- Runtime: Node.js + Express
- Storage: Supabase Storage (originals + thumbnails), bucket: `images`
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

---

## Target Architecture Direction (Not Yet Implemented)

> This section describes the intended product direction, not the current implementation state.

### Thumbnail-Only Durable Record Model
The target model avoids permanent original storage costs:
1. Upload original to temporary storage.
2. Generate thumbnail and metadata record.
3. Submit original to partner sites.
4. Confirm downstream success; store partner-side IDs and earnings linkage.
5. Keep only minimal durable records.
6. Delete original after policy conditions are met.

**Minimal durable records per asset:**
- thumbnail
- metadata
- submission history
- external site IDs
- payout/accounting linkage
- lifecycle state

### Planned Architecture Abstraction Layers
- **Storage abstraction** — one module for original upload, thumbnail generation/lookup, original deletion, thumbnail retention.
- **Submission abstraction** — neutral layer hiding n8n, direct APIs, FTP, CSV export, custom workers.
- **Site rules data** — configurable per-site: AI acceptance, disclosure requirement, bulk mode, active status.
- **Event abstraction** — emit `asset_uploaded`, `submission_failed`, `asset_accepted`, `original_deleted`.

### Planned Lifecycle States (expanded)
Current implemented states: `draft`, `ready`, `submitted`, `accepted`, `rejected`, `distributed`, `original_deleted`, `thumbnail_only`.

Target additions:
- `original_deleted` — original file removed from storage after confirmed distribution.
- `thumbnail_only` — durable record retained; no original available.

### Planned Data Model Additions
Beyond the current `Asset`, `Portfolio`, `SubmissionJob` tables:
- `asset_files` — separate original/thumbnail file records.
- `asset_external_records` — partner site IDs per asset.
- `notification_events` — user-facing event log.
- `activity_logs` — internal audit trail.
- `site_rules` — configurable ruleset per partner site.
- `site_accounts` — per-user partner site credentials/linkage.

### Supported Partner Sites (v1 Target)

| Site | AI accepted | Bulk mode | Notes |
|------|-------------|-----------|-------|
| Adobe Stock | Yes, with disclosure | csv_batch | Large marketplace |
| Dreamstime | Yes, with conditions | ftp_batch | Batch candidate |
| 123RF | Yes, with rules | ftp_batch | Batch candidate |

Site rules are intended to be stored as data, not hardcoded.

### Original Deletion Safety Conditions

Original deletion must only trigger after **all** of the following are confirmed:
- Partner site has accepted the asset.
- Thumbnail is generated and stored.
- Royalty/payout linkage is recorded.
- Retry window has elapsed.

**Never delete on:** `queued`, `uploaded`, or any unconfirmed state.

**Do not delete if the original may be needed for:**
- Resubmission to a failed or new partner.
- Active disputes or content reviews.
- Takedown or replacement requests.
- Metadata regeneration.
- Legal evidence requirements.

> Verify per partner site: some require re-uploads or proofs of ownership rather than relying on their stored copy as source of truth.

### Target Lifecycle State Progression

```
uploaded_temp → distributed_confirmed → thumbnail_retained → original_deleted
```

### Hybrid Buffer Model (Target Option)

A safer intermediate approach: retain the original for a 7–30 day buffer after confirmed distribution before deletion. This provides a rollback window for disputes, resubmissions, and failed confirmations.

Delete original only after buffer window elapses **and** none of the following flags are set: failed, disputed, pending review, flagged for new partner.

---

## Target Monorepo Structure (Not Yet Implemented)

> This section describes the planned repository reorganization. The current repo is backend-only.

```
photo-stock-aggregator/
├─ apps/
│  ├─ frontend/          # React/Vite/Tailwind PWA
│  └─ backend/           # Node/Express/Prisma API (current repo)
├─ packages/
│  └─ shared/            # Safe shared types/constants/validation only
│     ├─ types/
│     ├─ constants/
│     └─ validation/
└─ project-docs/         # Architecture, workflow, agent docs
```

### Security Boundary Rules
- Frontend (`apps/frontend`) must never import backend code, database modules, or secrets.
- `packages/shared` is limited to safe reusable items only: TypeScript types (e.g. `Asset`, `JobStatus`), lifecycle state constants, validation schemas.
- No runtime server code, credentials, or database access in `packages/shared`.
- Backend secrets remain in Railway environment variables only.
- Frontend accesses backend exclusively via HTTP requests to the Railway backend URL.
