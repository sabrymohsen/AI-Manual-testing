---
name: regression-testing
description: Pick and run the right regression tests for a change, build a smoke/sanity checklist, or decide what to retest after a bug fix. Use when asked what to retest, for a smoke test, sanity check, regression suite, release check or impact analysis of a diff/PR.
---

# Regression testing

## Impact analysis (from the change, not from guesswork)
1. Read the diff (`git diff <base>...HEAD --stat`, then the files).
2. For each changed file, find who depends on it: `grep -rn "<exported name>" src`,
   shared components, API routes it serves, Prisma models it touches, workers.
3. Map to user-facing features and their existing test cases / automated specs.
4. Classify: **directly changed** → full tests; **dependent** → main flows;
   **unrelated** → smoke only.

## Layers
- **Smoke (≤10 min)**: app loads, login, dashboard, open a project, create + view a
  test case, run one automated test, open bug reports, Live QA starts a session.
- **Sanity**: the fixed bug's exact steps + its neighbours (same form, same API).
- **Targeted regression**: cases selected above, Critical/High first.
- **Full regression**: before a release or after schema/auth/shared-component changes.

## Running it here
- Unit/integration: `npx vitest run` (or a path). E2E: `npx playwright test`.
- Type check `npx tsc --noEmit`, schema `npx prisma validate`.
- Recorded/automated QA Engine runs need `npm run worker` alongside `npm run dev`.

## Bug-fix retest
Reproduce with the original steps (must pass now), then vary data/role/browser,
then check the surrounding area. Move the bug to `ReadyForRetest` → `Resolved`/`Closed`
or `Reopened` with evidence.

Report: what was run, pass/fail counts, new bugs, and what was **not** retested and why.
