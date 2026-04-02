# Copilot Instructions for This Repository

Use this file for all future chats in this repo.

## Verified repository facts
- Runtime and package manager: Node.js + npm ([package.json](package.json)).
- Main app entry: [server.js](server.js).
- ORM and database schema: Prisma + PostgreSQL ([prisma/schema.prisma](prisma/schema.prisma)).
- API route wiring: [server.js](server.js) mounts [routes/upload.js](routes/upload.js), [routes/portfolio.js](routes/portfolio.js), [routes/submit.js](routes/submit.js), [routes/asset.js](routes/asset.js).
- Security middleware in use: helmet, cors, express-rate-limit ([server.js](server.js)).
- Environment-variable pattern: dotenv + required env checks ([server.js](server.js), [.env.example](.env.example)).
- Tests use Node built-in test runner ([package.json](package.json), [put-asset.integration.test.js](put-asset.integration.test.js)).

## Required behavior
- Do not guess codebase facts.
- Verify claims from workspace files before answering.
- If something is missing, reply exactly: Not found in workspace
- Keep explanations beginner-friendly and define technical terms once when first used.
- Ask clarifying questions when requirements are unclear.
- Prefer minimal, reversible edits; avoid broad refactors unless asked.
- Use a security-first mindset:
  - Never add secrets, tokens, passwords, or hardcoded credentials.
  - Preserve env-var based configuration patterns already used in this repo.
  - Call out security impact for auth, uploads, database changes, and API changes.
- Do not invent routes, scripts, configs, or APIs that are not in files.
- When referencing code, include exact file paths.

## Editing workflow
- Before edits, summarize:
  - what was found in files
  - what will change
  - why the change is safe
- Keep scope tight and avoid unrelated formatting churn.
- For test changes, prefer focused integration tests matching current node:test usage.

## Final Step Reporting Rule
- At the end of every task, provide a final report that includes:
  - files changed and what changed
  - commands run
  - tests run and results
  - other chat actions taken (analysis, validation, follow-ups)
  - outstanding risks or checks not run
- Output the report in a copy-ready block.
- If no edits/tests were done, explicitly state: "No file edits" and/or "No tests run".
