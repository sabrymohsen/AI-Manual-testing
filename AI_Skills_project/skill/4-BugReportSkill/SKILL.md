---
name: bug-report
description: Stage 5 of the QA pipeline. Triage every Failed, Flaky and Error result from a playwright-cli execution run, then draft bug reports (Markdown + Jira-ready text) only for confirmed defects, marking failures in impacted modules as regressions. Use after execution results are validated. Run by the bug-reporter agent. Drafts only - posting to Jira needs the user's approval through the orchestrator.
---

# Bug Report (stage 5)

## Role
You decide, for every finding, whether it is a product bug, and write the bugs that are. You never re-run tests,
never change a result, and never post anything.

## Inputs
`<run>/execution/run/results.json` (validated), `<run>/testcases/<ID>-testcases.json`, `<run>/analysis/<ID>-questions.json`,
the screenshots in `<run>/execution/run/evidence/`. Look at the screenshot of every finding before deciding.

## Triage (write `<run>/bugs/triage.json` from `templates/triage-template.json`)
Every `Failed`, `Flaky` and `Error` result gets exactly one decision with a reason (`references/triage-rules.md`):
| Decision | When |
|---|---|
| `Bug` | The product behaves wrongly against a confirmed expected result |
| `RequirementIssue` | The expected result rests on an open or contradictory question (e.g. message prefix): it goes to the questions, not to the developers |
| `Duplicate` | Same root cause as another finding (`duplicateOf`) |
| `TestIssue` | The test case or the recording was wrong (typo in data, wrong step order) |
| `Environment` | Site down, network, tool crash: no product evidence |
| `NotABug` | Behaviour is correct after a closer look (explain) |
- An `Error` is a Bug only with `productEvidence` (e.g. the app returned 500). A `Passed` result with a console
  error note can be a Bug with `source: "console"`.
- Severity: `references/triage-rules.md`. Impacted-scope failures are **regressions**: severity at least that of the impact level.
- Never decide "Bug" for an observation-derived expectation without saying so in the reason.
- Something seen but not checked by any recorded step (a cookie, a clipped message) is never a bug: put it in
  `observations` (`{ testId, text, followUp }`). It is printed in `bugs-summary.md` as a follow-up. Do not edit the summary by hand.

## Procedure
1. Read the results summary and every finding with its screenshot.
2. Write `triage.json`.
3. `node skill/4-BugReportSkill/scripts/build_bug_report.js --results <run>/execution/run/results.json --suite <run>/testcases/<ID>-testcases.json --triage <run>/bugs/triage.json --out <run>/bugs`
4. Read each `BUG-xxx.md`. Sharpen the title if needed (what is wrong, where: "Login error for empty password lacks the 'Epic sadface:' prefix") by setting `title` in `triage.json` and re-running step 3.
5. `node skill/4-BugReportSkill/scripts/validate_bugs.js <run>/bugs/bugs.json --results <run>/execution/run/results.json`. Fix until VALID.
   Zero findings? Still write `triage.json` with `"decisions": []` and run steps 3 and 5 (an empty, valid bug list).

## Output (in `<run>/bugs/`)
`triage.json`, `bugs.json`, `BUG-xxx.md`, `BUG-xxx.jira.txt`, `bugs-summary.md`. All Drafts: `status: "Draft"`, `jiraKey: null`.
Hand back: number of bugs by severity, regressions, requirement issues (with question ids), and what was not a bug.

## Jira
You do not post. The orchestrator shows the drafts to the user and, only with their approval, files them with
`.claude/skills/qa-orchestrator/scripts/jira.js create-bug` (dry run first). SAMPLE and tester-override bugs are never posted.

## Resources
| File | Read when |
|---|---|
| `references/triage-rules.md` | Every decision and severity |
| `templates/triage-template.json` | Step 2 |
| `templates/bug-template.md` | What a finished bug looks like |
