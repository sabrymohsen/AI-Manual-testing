---
name: test-plan
description: Write a risk-based test plan or test strategy for a feature, sprint or release (scope, risks, approach, environments, entry/exit criteria, schedule, deliverables). Use when asked for a test plan, test strategy, QA plan, release testing plan or "how should we test this".
---

# Test plan (risk-based, one page where possible)

1. **Scope**: features/stories in scope (link them), and explicitly **out of scope**.
2. **Risk analysis**: list risks; score each Likelihood (1-3) × Impact (1-3).
   Likelihood goes up with new/changed code (check the diff), complexity, past bugs
   in the area, integrations. Impact goes up with money, data, security, many users.
   Test depth follows the score: 7-9 deep (all techniques, automation), 4-6 normal,
   1-3 smoke only.
3. **Approach per risk**: which levels (unit / API / E2E / manual exploratory /
   visual / accessibility / performance / security), which techniques
   (see `test-case-design`), what gets automated (see `test-automation-strategy`).
4. **Environments & data**: URLs, browsers/devices matrix, roles, test accounts
   (names only, never passwords), data setup and cleanup.
5. **Entry criteria**: build deployed, smoke passes, stories have acceptance criteria.
6. **Exit criteria**: e.g. all Critical/High cases run, 0 open Critical, High bugs
   fixed or accepted by the PO, regression suite green, coverage of each risk ≥ target.
7. **Schedule & owners**, **deliverables** (test cases, run report, bug list, sign-off).
8. **Assumptions, dependencies, open questions.**

Keep it actionable: a table of risks → tests is worth more than paragraphs.
