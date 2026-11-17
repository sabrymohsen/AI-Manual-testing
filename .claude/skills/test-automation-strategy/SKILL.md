---
name: test-automation-strategy
description: Decide what to automate and at which level (unit, API, E2E, visual), prioritize manual test cases for automation, design a maintainable automation framework and CI pipeline, and estimate ROI. Use when asked what to automate, to plan or review a test automation framework, to set up tests in CI, or to convert a manual suite to automation.
---

# Test automation strategy

## Pick the level (test pyramid)
- **Unit** (most): business rules, parsers, validators — fast, precise.
- **API / integration**: endpoints, DB effects, permissions — most logic coverage per second.
- **E2E UI** (few): critical user journeys end to end, smoke.
- **Visual**: layout/styling regressions (QA Engine's Visual Tests).
- **Manual/exploratory** stays for new features, UX, one-off and judgement-heavy checks.
Test each rule at the lowest level that can catch it; E2E only proves the wiring.

## What to automate first (score each candidate 1–3, automate highest totals)
Runs often (regression/smoke) · business-critical · stable UI and requirements ·
tedious or data-heavy by hand · deterministic result. Skip: changes weekly, needs
human judgement, runs once, costs more to maintain than to run by hand.

## Framework design
- Layout: `tests/unit`, `tests/integration`, `tests/e2e` (+ `pages/`, `fixtures/`, `data/`).
- Shared fixtures for auth (storageState) and data factories (API-created, unique).
- Locator policy and no-sleep rule (see `playwright-e2e`).
- Tags: `@smoke`, `@regression`, `@slow`; config per environment via env vars,
  secrets only from env/CI secrets.
- Reporting: HTML report + traces/screenshots on failure; link failures to bugs.

## CI pipeline
On every PR: type check → lint → unit → integration → E2E `@smoke` (parallel shards).
Nightly: full E2E + visual + accessibility. Block merge on red; quarantine flaky
tests with a ticket (see `flaky-test-triage`), never silently retry forever.

## Metrics
Pass rate, flake rate, run time, defects found by automation vs escaped, coverage of
Critical/High cases. Report ROI as manual hours saved per release vs maintenance hours.
