---
name: gstack-ship
description: "Use when implementation is complete and you want a safe landing workflow: verify branch state, run checks, summarize release risks, and prepare ship steps."
---

# Gstack-Style Ship Workflow

Use this skill after coding is done and before merge/deploy.

## Workflow

1. Confirm branch is not main.
2. Confirm branch has a diff against main.
3. Verify local checks:
   - Build passes
   - Tests pass
   - Lint/type checks pass
4. Re-scan for unresolved critical review findings.
5. Summarize deploy risk:
   - Data migration risk
   - Backward compatibility risk
   - Runtime/config risk
6. Generate final ship checklist.

## Ship Checklist Template

- Sync with main
- Re-run CI-equivalent checks
- Validate environment config
- Merge strategy confirmed
- Rollback path documented
- Post-deploy smoke test defined

## Important Rules

- Stop and report blockers instead of continuing blindly.
- If any critical issue exists, do not mark ready-to-ship.
- Keep output concise and action-oriented.