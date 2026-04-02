# Deployment Guide

## Runtime and Build
- Runtime: Node.js (engine `>=20.19.0`)
- Start command: `npm start`
- Production entrypoint: `server.js`

## Required Environment Variables
From runtime checks in `server.js`:
- `DATABASE_URL` (required)
- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required)

Additional commonly used variables:
- `PORT` (optional, default `3000`)
- `NODE_ENV` (optional)
- `CORS_ORIGIN` (optional)
- `GLOBAL_RATE_LIMIT_WINDOW_MS`, `GLOBAL_RATE_LIMIT_MAX` (optional)
- `UPLOAD_RATE_LIMIT_WINDOW_MS`, `UPLOAD_RATE_LIMIT_MAX` (optional)
- `SUBMIT_RATE_LIMIT_WINDOW_MS`, `SUBMIT_RATE_LIMIT_MAX` (optional)
- `JOBS_RATE_LIMIT_WINDOW_MS`, `JOBS_RATE_LIMIT_MAX` (optional)
- `SHUTDOWN_TIMEOUT_MS` (optional)

Submission provider variables (`lib/submission.js`):
- `N8N_WEBHOOK_URL` (optional; enables n8n provider)
- `N8N_WEBHOOK_SECRET` (optional)

Prisma CLI variable from `prisma.config.ts`:
- `DIRECT_URL` (optional; preferred for CLI operations when provided)

## Database Migration Strategy
- Local/dev schema sync: `npm run db:push`
- Development migration creation: `npm run db:migrate`
- Production/staging migration apply: `npm run db:migrate:deploy`

Recommended release sequence:
1. Build/install dependencies.
2. Run `prisma migrate deploy`.
3. Start app.
4. Verify `/health`.

## Railway
`railway.json` currently uses:
- start command: `npx prisma migrate deploy && npm start`
- healthcheck path: `/health`

## Health and Verification
After deployment:
1. Check `GET /live` for process liveness.
2. Check `GET /health` for DB readiness.
3. Test authenticated `/api/*` call with valid Bearer token.

## Security Notes
- Do not hardcode credentials in source.
- Keep Supabase service role key in secret manager only.
- Restrict `CORS_ORIGIN` in production.
- Keep rate-limit overrides conservative.

---

## Target Deployment Options (Not Yet Implemented)

> This section describes planned deployment paths, not the current production setup.

### Current MVP Stack
Supabase (DB + storage), Railway (backend), Vercel (frontend), n8n Cloud (jobs). Runs on free tiers scaling to Pro overages.

### Option A — Hosted (Scale Current)

| Component | Pricing | Pros | Cons |
|-----------|---------|------|------|
| Supabase Pro | $25/mo + $0.021/GB storage, $0.09/GB egress | Auth/DB/storage integrated | Overages at volume |
| Railway | Free → $20+/mo compute | Git deploys | Workers/queues expensive |
| Vercel | Free → $20/mo | PWA hosting | Bandwidth limits |
| n8n Cloud | Free → $20+/mo | No-code workflows | Per-job fees scale badly |

Estimated totals: $50–200/mo light, $1k+/mo heavy.

### Option B — Self-Hosted

| Component | Pricing | Pros | Cons |
|-----------|---------|------|------|
| Hetzner VPS (DB + API) | €5–50/mo | Full control, low fixed cost | Ops overhead |
| Cloudflare R2 (storage) | $0.015/GB-mo, free egress | Cheap thumbnail storage | API limits |
| Docker / self-managed workers | VPS included | Replaces n8n | Custom code required |
| Caddy / Cloudflare (frontend) | Free | Static PWA hosting | DNS setup |

Estimated totals: $30–150/mo light, $200–600/mo heavy. Recommended post-MVP at scale.

### Option C — Hybrid (Recommended Transition Path)

Migrate storage and compute to self-hosted incrementally while keeping Vercel for the frontend.

| Component | Current | Target |
|-----------|---------|--------|
| DB | Supabase | Hetzner PostgreSQL |
| API | Railway | Hetzner VPS |
| Frontend | Vercel | Vercel (keep) |
| Jobs | n8n Cloud | Docker + BullMQ on VPS |

Estimated totals: $80–300/mo. Provides cost reduction with lower operational risk than a full cut-over.

### Storage Cost Comparison (thumbnail-only model)

| Images/user | Orig storage (3MB/img) | Thumbnail storage (100KB/img) | Savings |
|-------------|------------------------|-------------------------------|---------|
| 20 imgs | ~3TB → €18/mo Hetzner | ~100GB → ~€1/mo | ~18x |
| 50 imgs | ~7.5TB → €45/mo | ~250GB → ~€2/mo | ~22x |
| 100 imgs | ~15TB → €90/mo | ~500GB → ~€3/mo | ~30x |

Thumbnail-only model shifts the dominant cost from storage/egress to compute and workflow execution.

---

## Target Monorepo Deployment (Not Yet Implemented)

> This section describes planned deployment configuration for the future monorepo structure. Current deployment is backend-only on Railway.

### Railway — Backend Service
- Root Directory: `/apps/backend`
- Watch paths: `/apps/backend/**`, `/packages/shared/**`
- Environment variables (backend only):
  - `DATABASE_URL` (required)
  - `SUPABASE_URL` (required)
  - `SUPABASE_SERVICE_ROLE_KEY` (required)
  - `PORT=3000`

### Vercel — Frontend Project
- Root Directory: `apps/frontend`
- Environment variables (frontend only):
  - `VITE_RAILWAY_BACKEND_URL` — Railway backend public URL
  - Public Supabase keys only (anon key, project URL)
  - No service role key or database URL

### Env Var Isolation Rule
Backend secrets (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) must never appear in Vercel or any frontend environment. Frontend communicates with the backend only via `VITE_RAILWAY_BACKEND_URL`.
