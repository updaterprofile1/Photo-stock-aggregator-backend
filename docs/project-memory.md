# Project Memory Log

Use this file as lightweight durable memory for this repository.

## Entry Template
- Date:
- Task:
- Files changed:
- Summary:
- Tests:
- Risks / Follow-ups:

## Entries
- Date: 2026-04-02
- Task: Verify tech stack overview against codebase; integrate confirmed new facts into docs
- Files changed: docs/system-architecture.md, docs/deployment.md
- Summary: Verified all tech stack overview claims against workspace files. Confirmed: Node.js/Express/Prisma, PostgreSQL, Supabase Storage (bucket `images`), n8n webhook jobs, Supabase Auth, Railway, helmet/cors/rate-limit. Not in workspace: frontend (React/Vite/Vercel), monorepo structure (already documented as target only). Discrepancy: overview lists SUPABASE_ANON_KEY as backend env var; server requires SERVICE_ROLE_KEY; ANON_KEY is a StorageManager fallback only. Added bucket name `images` to system-architecture.md. Added SUPABASE_ANON_KEY fallback note and bucket name to deployment.md env vars.
- Tests: No tests run
- Risks / Follow-ups: .env.example does not exist in workspace; consider creating one. SUPABASE_ANON_KEY vs SERVICE_ROLE_KEY distinction should be communicated to any frontend-calling-backend setups.
- Date: 2026-04-02
- Task: Todo verification and completion audit for Task #22
- Files changed: No file edits
- Summary: Verified implementation artifacts for schema, persistence helper, upload/submit integration, normalization, migration, and tests; all task todos confirmed complete and tracker updated.
- Tests: `npm test` -> pass (39 passed, 0 failed)
- Risks / Follow-ups: None for completion status. If desired, next follow-up is deploying migration to a live environment.

- Date: 2026-04-02
- Task: Instruction tuning for task-list and clarifying-question behavior
- Files changed: .github/copilot-instructions.md; /home/codespace/.vscode-remote/data/User/prompts/global-engineering.instructions.md
- Summary: Added safety-first rules to require todo lists for multi-step/risky tasks, skip them for straightforward one-step tasks, and ask clarifying questions only when ambiguity impacts correctness/safety/scope.
- Tests: No tests run
- Risks / Follow-ups: Optional future follow-up is hook-based enforcement if deterministic gating is needed.

- Date: 2026-04-02
- Task: Integrate Send It-Stock framework spec into informational docs
- Files changed: docs/system-architecture.md, docs/api-contract.md, README.md
- Summary: Added "Target Architecture Direction" section to system-architecture.md (thumbnail-only model, abstraction layers, data model additions, partner sites table). Added "Planned Endpoints" section and path-naming note to api-contract.md. Updated README.md intro paragraph to reflect thumbnail-only model goal. All additions clearly marked as target direction, not current implementation. Build priority and roadmap sections were intentionally excluded.
- Tests: No tests run
- Risks / Follow-ups: Path naming inconsistency (`/api/asset` vs `/api/assets`) is documented in api-contract.md; resolving it is a future breaking change.

- Date: 2026-04-02
- Task: Integrate Send It-Stock business/stack model docs into informational docs
- Files changed: docs/system-architecture.md, docs/deployment.md
- Summary: Added original deletion safety conditions, target lifecycle progression (uploaded_temp → distributed_confirmed → thumbnail_retained → original_deleted), hybrid buffer model (7-30 day window), and legal/operational deletion risks to system-architecture.md. Added "Target Deployment Options" section to deployment.md with hosted/self-hosted/hybrid stack comparisons and storage cost table. Monetization/revenue tables and historical model content excluded as out of scope.
- Tests: No tests run
- Risks / Follow-ups: Deletion safety conditions are documented intent only; enforcement logic not yet implemented.

- Date: 2026-04-02
- Task: Create architecture/api/deployment docs and add documentation-sync rule
- Files changed: docs/system-architecture.md; docs/api-contract.md; docs/deployment.md; README.md; .github/copilot-instructions.md; /home/codespace/.vscode-remote/data/User/prompts/global-engineering.instructions.md
- Summary: Added project-facing documentation for architecture, API contract, and deployment; added a README documentation index; added system-wide and repo-wide rule to update docs when setup/API/schema/architecture/deployment behavior changes.
- Tests: No tests run
- Risks / Follow-ups: README currently contains some legacy examples that may still diverge from runtime behavior; future pass can reconcile all sections against current routes/auth model.

- Date: 2026-04-02
- Task: Integrate monorepo structure and deployment plan into informational docs
- Files changed: docs/system-architecture.md, docs/deployment.md
- Summary: Added "Target Monorepo Structure" section to system-architecture.md with planned folder layout and security boundary rules (shared package scope limits, secret isolation). Added "Target Monorepo Deployment" section to deployment.md with Railway and Vercel root directory config, watch paths, and env var isolation rules. Migration checklist, verification steps, and agent-rules references excluded as out of scope. All content marked as not yet implemented.
- Tests: No tests run
- Risks / Follow-ups: Monorepo migration has not started; deployment URLs, watch path config, and shared package contents are still TBD.
