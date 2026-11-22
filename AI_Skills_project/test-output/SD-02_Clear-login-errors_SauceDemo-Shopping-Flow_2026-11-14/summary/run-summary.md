# Run summary: SD-02 Clear login errors

> **TESTER OVERRIDE.** The readiness gate was not met. Decided by Tester (the user): "Override and run now; run in headed mode". Why: Run the full testing cycle now, before the PO answers the 6 open questions.

- Run folder: `SD-02_Clear-login-errors_SauceDemo-Shopping-Flow_2026-11-14`
- Epic: SauceDemo Shopping Flow
- Base URL: https://www.saucedemo.com (approved hosts: www.saucedemo.com)
- Execution: Playwright agent-cli (`playwright-cli`), headed, no automation code, session `qa-sd-02-20261115-000907-9b93`

## Stages

| # | Stage | Agent | Status | Validator |
|---|---|---|---|---|
| 1 | analysis | requirements-analyst | Done | passed |
| 2 | gate | orchestrator + user | Done | passed |
| 3 | testcases | test-designer | Done | passed |
| 4 | execution | qc-execution | Done | passed |
| 5 | bugs | bug-reporter | Done | passed |
| 6 | report | report-builder | Done | passed |
| 7 | summary | orchestrator | this file | - |

## Readiness gate

Decision: **Override** by Tester (the user).
Questions: 6 total, 6 still open. Clarity: Unclear.

## Results

- **All:** 7 cases: Passed 3, Failed 4 (pass rate 42.9% of decided tests)
- **Story (Target):** 4 cases: Passed 1, Failed 3
- **Impacted modules:** 3 cases: Passed 2, Failed 1

| Test | Scope | Status | Detail |
|---|---|---|---|
| TC-LOGIN-002 Empty password shows the password-required error | Target | Failed | Step 4: error text is "Epic sadface: Password is required", expected exactly "Password is required" (AC-2 as written; Q-01 open) |
| TC-LOGIN-003 Wrong password for standard_user shows the no-match error | Target | Failed | Step 4: error text is "Epic sadface: Username and password do not match any user in this service", expected exactly "Username and password do not match any user in this service" (AC-3 as written; Q-01 open) |
| TC-LOGIN-004 Unknown username shows the no-match error | Target | Failed | Step 4: error text is "Epic sadface: Username and password do not match any user in this service", expected exactly "Username and password do not match any user in this service" (AC-3 as written; Q-01, Q-02 open) |
| TC-LOGIN-007 locked_out_user stays on the login page with the locked-out message | Impacted IM-02 | Failed | Step 4: error text is "Epic sadface: Sorry, this user has been locked out.", expected exactly "Sorry, this user has been locked out." (SD-03 AC as written; Q-01 open) |

Failed = an assertion did not hold. Error = the test could not run as designed. Both are reported as they are.

## Bugs

0 drafted.

Not filed as bugs: TC-LOGIN-002 (RequirementIssue), TC-LOGIN-003 (RequirementIssue), TC-LOGIN-004 (RequirementIssue), TC-LOGIN-007 (RequirementIssue).

## Notes, data left behind, cleanup

- No application data created on saucedemo.com; cookies and localStorage cleared after each login; browser session qa-sd-02-20261115-000907-9b93 closed (plus a short probe session qa-sd-02-probe-20261115, also closed).
- Record correction: the execution agent hand-edited only the TC-LOGIN-007 'note' field in results.json (console errors were noted as 0 before being read; 2 third-party telemetry 401s from events.backtrace.io). Logged in execution-log.md. No status, step or actual result was changed.
- Scratch left on disk: .playwright-cli/ (32 snapshot/console files from this run) in the project root; deletion was not permitted to the agent, so it is the user's call.
- Follow-ups from triage (not filed): after the rejected locked_out_user login a cookie session-username=locked_out_user was set (add a case: open /inventory.html directly afterwards, expect redirect to login); the AC-3 message looks clipped in the error box (TC-LOGIN-003/004 s4 screenshots, cosmetic); a redirect error persisted across reload (Q-04).
- Java ExtentReports output skipped: Java 17+ and Maven are not installed.

## Not posted or sent

- stakeholder email: `analysis/SD-02-email-draft.md` (draft, not sent)
- Jira comment with the questions: `analysis/SD-02-jira-comment.md` (draft, not sent)
- blocking notice: `gate/blocking-notice.md` (draft, not sent)
- Reports stay local: `report/report.html`

Nothing from this run may be posted: it is a TESTER OVERRIDE run.
