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
- Apply workflow rules from [.github/instructions/ai-workflow.instructions.md](.github/instructions/ai-workflow.instructions.md) for all tasks in this repository.
- Do not guess codebase facts.
- Verify claims from workspace files before answering.
- If something is missing, reply exactly: Not found in workspace
- Keep explanations beginner-friendly and define technical terms once when first used.
- Ask concise clarifying questions only when ambiguity materially affects correctness, safety, or scope.
- Do not block on clarifying questions for straightforward tasks that are clearly actionable.
- Maintain a short todo list for multi-step tasks, risky changes, or tasks with multiple explicit requirements.
- Skip todo lists for straightforward one-step tasks to avoid unnecessary clutter.
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
- When changes affect setup, API behavior, schema/data model, architecture, or deployment, update `README.md` and/or relevant `docs/*.md` in the same task.
- Skip documentation edits for internal refactors that do not change external behavior.

## Final Step Reporting Rule
- At the end of every task, provide a final report that includes:
  - files changed and what changed
  - commands run
  - tests run and results
  - other chat actions taken (analysis, validation, follow-ups)
  - outstanding risks or checks not run
- Output the report in a copy-ready block.
- If no edits/tests were done, explicitly state: "No file edits" and/or "No tests run".
