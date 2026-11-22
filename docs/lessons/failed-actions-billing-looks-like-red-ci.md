---
title: 'When GitHub Actions billing fails, every job fails in seconds with zero steps; it is not the PR'
areas: ['ci']
topics: ['github-actions', 'billing', 'ci']
---

# When GitHub Actions billing fails, every job fails in seconds with zero steps; it is not the PR

**In short**: Every workflow on every PR failed in 1–6 seconds, with no steps and no runner. The check annotation said: “The job was not started because recent account payments have failed or your spending limit needs to be increased.”

**Context**: 2026-11-22 around 01:10: PRs #25 and #28 showed red CI for docs-only changes.

**Problem**:

- The red checks look like a broken workflow or a bad commit.
- `gh pr checks` shows only `fail`; the reason is only in the check-run annotations.

**Rule**: When a job fails in seconds with no steps, read the annotations first: `gh api repos/<owner>/<repo>/check-runs/<id>/annotations`. If it is billing, run the gates locally, put their results in the PR description, and tell a human who can fix billing. Do not change workflows to work around it.

**Applies to**: All GitHub Actions workflows.
