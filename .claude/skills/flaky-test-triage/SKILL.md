---
name: flaky-test-triage
description: Diagnose and fix flaky or intermittently failing automated tests (Playwright, Vitest, recorded QA Engine runs) by finding the real cause — timing, shared state, test order, data, environment or a real product race. Use when a test passes sometimes and fails sometimes, fails only in CI, or someone suggests adding retries/timeouts.
---

# Flaky test triage

1. **Confirm the flake**: run it many times in isolation and in the full suite:
   `npx playwright test <file> -g "<name>" --repeat-each=20 --workers=4`
   `npx vitest run <file> --sequence.shuffle` (repeat a few times).
   Note the failure rate and whether it depends on parallelism or order.
2. **Collect evidence** from failures: error, trace (`--trace on`), screenshots,
   console, network, server log, timestamps.
3. **Classify the cause**:
   | Cause | Signs | Fix |
   |---|---|---|
   | Race / missing wait | element detached, stale text, clicked before enabled | web-first assertion on the right state; wait for the response |
   | Hard sleeps | `waitForTimeout`, `setTimeout` | replace with a state/event wait |
   | Shared data | fails with workers>1 or in some order | unique data per test; no global fixtures mutated |
   | Order dependency | passes alone, fails in suite | make setup explicit; reset mocks/state |
   | Time/date/locale/random | fails at midnight, in other TZ | fake timers, fixed seeds, explicit TZ |
   | Animations/rendering | screenshot/visual diffs | disable animations, mask dynamic regions |
   | Environment | CI-only, slow machine, external API | mock the dependency; check resources |
   | **Real product race** | app genuinely misbehaves under timing | file a bug (`bug-report`) — don't hide it |
4. **Fix the cause**, not the symptom. Retries/longer timeouts are only acceptable as
   a temporary, labelled quarantine with a ticket.
5. **Prove it**: the same repeat command now passes 20/20 (or more), and report the
   before/after failure rate.

For recorded QA Engine runs, also check the step's `locatorCandidates`: a locator
falling back to `html` or a generated class is a common source of flakiness — pick a
role/label/test-id locator instead.
