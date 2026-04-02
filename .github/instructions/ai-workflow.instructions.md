---
applyTo: "**"
description: "Use when working in this repository to enforce evidence-first, verified, minimal, and copy-ready workflow behavior."
---

# AI Workflow for This Repository

Use this workflow to get accurate answers and reduce hallucinations.

## 1) Start with evidence
- Read [package.json](package.json), [server.js](server.js), and [prisma/schema.prisma](prisma/schema.prisma) first.
- List only verified facts from those files.
- If anything is missing, say exactly: Not found in workspace

## 2) Pick the right context scope
- Use @workspace for broad repo discovery.
- Use #file for grounded answers from specific files.
- For critical tasks, name exact files in the prompt:
  - [server.js](server.js)
  - [routes/upload.js](routes/upload.js)
  - [routes/asset.js](routes/asset.js)
  - [prisma/schema.prisma](prisma/schema.prisma)

## 3) Force verification before suggestions
- Verify by reading files before answering.
- Do not infer missing routes, scripts, configs, or APIs.
- Keep quotes short and only when needed.

## 4) Request safe edits only
- Before editing, summarize what was found, what will change, and why it is safe.
- Make minimal, reversible edits.
- Avoid unrelated refactors and formatting churn.

## 5) Ask for beginner-friendly explanations
- Explain in plain language.
- Define technical terms when first used.
- Reference exact file paths.

## 6) Require a final copy-ready report
- End with a copy-ready report including:
  - files changed and what changed
  - commands run
  - tests run and results
  - other chat actions taken
  - outstanding risks or checks not run
- If no edits/tests were done, explicitly state: "No file edits" and/or "No tests run".
