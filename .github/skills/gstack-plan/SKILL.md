---
name: gstack-plan
description: "Use when you want an engineering plan review before implementation. Produces architecture, data flow, risk map, test strategy, and phased rollout steps for a feature."
---

# Gstack-Style Plan Review

Use this skill to pressure-test a feature design before coding.

## Inputs

- Feature request or ticket summary
- Current constraints (deadline, infra, compatibility)
- Relevant files or modules

## Workflow

1. Restate the goal in one sentence.
2. Define scope boundaries:
   - In-scope
   - Out-of-scope
3. Propose architecture and data flow.
4. Enumerate failure modes:
   - Auth/permission failure
   - Data integrity failure
   - Concurrency/race failure
   - External dependency failure
5. Specify observability:
   - Logs to add
   - Metrics to add
   - Alert conditions
6. Specify test plan:
   - Unit tests
   - Integration tests
   - Smoke tests
7. Produce implementation phases with rollback points.

## Output Format

- Problem statement
- Proposed design
- Risk register
- Test matrix
- Rollout and rollback plan

## Important Rules

- Favor small, reversible milestones.
- Call out assumptions explicitly.
- If critical unknowns exist, ask for them before implementation.