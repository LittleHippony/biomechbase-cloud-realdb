---
name: gstack-qa
description: "Use when you need a targeted QA pass across this repo's three surfaces: React web app, miniapp pages, and Node server APIs. Produces reproducible checks, evidence, and prioritized defects."
---

# Gstack-Style QA Sweep

Use this skill to run a structured QA pass for this codebase.

## Repo Topology (QA Targets)

- React web app: `src/`, `App.tsx`, `components/`, `services/`
- Miniapp: `miniapp/app.js`, `miniapp/pages/**`, `miniapp/utils/**`
- Node server: `server/index.js`, `server/db.json`

## Inputs

- QA scope (feature, route, page, or end-to-end flow)
- Environment target (`local`, `staging`, `prod-like`)
- Regression level (`smoke`, `focused`, `full`)

## Phase 1: Prepare and map

1. Identify changed files and map them to surfaces:
   - React-only
   - Miniapp-only
   - Server-only
   - Cross-surface
2. Build a risk map:
   - Auth/session risk
   - Data integrity risk
   - API contract risk
   - UI regression risk
3. Define acceptance checks before execution.

## Phase 2: React web QA

Run checks for React surface first:

1. Boot app and server (`npm run dev` or split `dev:client` and `dev:server`).
2. Validate impacted screens and user flows.
3. Verify loading, empty, and error states.
4. Confirm form validation and submission behavior.
5. Check table/list filtering, sorting, and pagination where present.

## Phase 3: Miniapp QA

Validate miniapp pages and shared request utilities:

1. Inspect affected files in `miniapp/pages/**` and `miniapp/utils/request.js`.
2. Test login and dashboard flows (or impacted pages only).
3. Verify request payload/response assumptions match server behavior.
4. Confirm user-facing text for success/failure states is clear and actionable.

## Phase 4: Server/API QA

Validate server contract and data behavior:

1. Review affected routes in `server/index.js` and related service modules.
2. Test happy path plus key failure paths (invalid input, missing auth, conflict).
3. Check response status codes and JSON shape stability.
4. Verify no sensitive data leakage in responses or logs.

## Phase 5: Cross-surface integration

When changes cross boundaries, run integrated checks:

1. React -> API contract consistency.
2. Miniapp -> API contract consistency.
3. Error handling consistency across React and miniapp.
4. Data updates visible in both clients after server mutation.

## Output Format

- Scope summary
- Coverage matrix (React, miniapp, server)
- Findings list (Critical, Major, Minor)
- Reproduction steps per finding
- Suggested fix per finding
- Residual risks and next tests

## Important Rules

- Findings must include exact file references when identifiable.
- Prefer reproducible defects over vague statements.
- If no defects are found, state what was tested and what was not tested.
- Call out any untestable assumptions explicitly.