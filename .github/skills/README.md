# Gstack-Inspired Copilot Skills

This project now includes gstack-inspired coding skills for GitHub Copilot Chat.

## Installed skills

- `gstack-plan`
- `gstack-review`
- `gstack-ship`
- `gstack-qa`

## Where they live

- `.github/skills/gstack-plan/SKILL.md`
- `.github/skills/gstack-review/SKILL.md`
- `.github/skills/gstack-ship/SKILL.md`
- `.github/skills/gstack-qa/SKILL.md`

## How to use

In Copilot Chat, ask naturally and include the skill intent. Examples:

- "Use gstack-plan to review this feature design before coding."
- "Use gstack-review on my current changes and list findings by severity."
- "Use gstack-ship to run a release-readiness checklist for this branch."
- "Use gstack-qa to run a cross-surface QA pass for React, miniapp, and server changes."

You can also provide direct context:

- target files
- branch name
- constraints (deadline, infra limits)
- risk tolerance

## Notes

These skills adapt the workflow style from gstack to Copilot-driven coding tasks in this repository.
They do not require the gstack browser binary.