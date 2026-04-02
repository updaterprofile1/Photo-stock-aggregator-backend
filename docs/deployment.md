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
