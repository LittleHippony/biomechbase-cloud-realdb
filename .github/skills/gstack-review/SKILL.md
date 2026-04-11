---
name: gstack-review
description: "Use when you want a pre-merge structural code review focused on bugs and regressions that tests may miss."
---

# Gstack-Style Pre-Merge Review

Use this skill when reviewing a branch or a set of changed files.

## Review Passes

## Pass 1: Critical Findings

Check for high-severity defects first:

- Data corruption or unsafe writes
- Missing auth checks or privilege escalation
- Trust-boundary violations (untrusted input used directly)
- Race conditions and non-atomic updates
- Secrets exposure or insecure logging

## Pass 2: Informational Findings

Then check quality and maintainability:

- Error handling gaps
- Reliability edge cases
- Performance hotspots
- Inconsistent API contracts
- Missing or weak tests

## Output Format

For each finding:

- Severity: Critical or Informational
- Location: file and line
- Why it matters
- Minimal fix suggestion
- Test to prevent regression

## Important Rules

- Findings first, summary second.
- Do not hide informational findings.
- If no findings exist, say that explicitly and list residual testing risks.