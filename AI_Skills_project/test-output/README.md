# test-output

Everything the pipeline produces. **Every new test run gets its own folder**, named
`<STORY-ID>_<Story-name>_<Epic-name>_<date>`, for example
`DB-07_View-a-product-page_Demoblaze-Online-Store_2026-10-19`.
Create it with `pipeline.js init --out-root test-output --story ... --story-title ... --epic ...`.

Inside a run folder, one subfolder per stage plus the run state:

| Folder | Stage and skill | Typical files |
|---|---|---|
| `analysis/` | 1 Requirement analysis (`1-RequirmentAnalysisSkill`) | `<ID>-result.md`, `<ID>-questions.json`, `<ID>-impact.json`, `<ID>-email-draft.md`, `<ID>-jira-comment.md`, observation notes, `<EPIC>-<ID>-graph.html` |
| `gate/` | 2 Readiness gate (orchestrator + you) | `blocking-notice.md` (drafted first, shown to you, never sent), `gate-record.md` (decision, who, why, your words) |
| `testcases/` | 3 Test cases (`2-TestCaseCreationSkill`) | `<ID>-testcases.json / .md / .csv`, `<ID>-validation.md` |
| `execution/` | 4 Execution (`3-TestExecutionSkill`) | `<ID>-automation.json`, `run/results.json`, `run/execution-log.md`, `run/evidence/` |
| `bugs/` | 5 Bug reports (`4-BugReportSkill`) | `triage.json`, `bugs.json`, `BUG-xxx.md`, `BUG-xxx.jira.txt`, `bugs-summary.md` |
| `report/` | 6 Extent report (`5-ExtentReportSkill`) | `report.html` (self-contained), `extent/` (only with Java + Maven) |
| `summary/` | 7 Summary (orchestrator) | `run-summary.md` (includes what was NOT posted or sent) |
| (root) | | `pipeline-state.json` |

## Runs here
| Run folder | Gate | Result |
|---|---|---|
| `SD-02_Clear-login-errors_SauceDemo-Shopping-Flow_2026-11-14/` | Tester override | 7 cases: 3 Passed, 4 Failed (message prefix, Q-01); 0 bugs, 4 requirement issues |

Start with a run's `summary/run-summary.md`, then open `report/report.html`.

Nothing here is posted or sent anywhere. Drafts only.
