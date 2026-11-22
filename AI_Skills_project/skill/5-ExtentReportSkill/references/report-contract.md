# Report contract

| Element | Source | Rule |
|---|---|---|
| Header | results: storyId, storyTitle, epic, suiteId, baseUrl, session, headed, finishedAt | |
| Banners | `sample`, `override` (+ `overrideNote`), `observationDerived` | Always shown when set |
| Donut and legend | count of each result status | Total = all test cases in the suite |
| Pass rate | (Passed + Flaky) / (Passed + Flaky + Failed) | Only decided tests; `-` when none |
| Scope bars | results split by `scope` | "Story (Target)" and "Impacted modules" |
| Stat cards | Total, Pass rate, every non-zero status (Passed/Failed/Error always), bugs drafted | |
| Bug table | bugs.json | Drafts; "Regression" when scope is Impacted |
| Filters | All, Issues (Failed+Error+Flaky), each status, Target, Impacted | |
| Test card | per result: status, id, title, scope + ref, priority, steps passed/total, duration, attempts, bug id | |
| Step table | action, expected (from the suite, unchanged), actual, the playwright-cli commands, screenshot, status | |

## Status colours
Passed `#2e9e4f`, Failed `#d6293e`, Error `#b83280`, Flaky `#eac54f`, Blocked `#f2a93b`, Skipped `#8b5cf6`, Not Run `#9aa3b5`, Running `#4d9de0`.

## Machine-readable data
The report embeds its data in `<script id="report-data" type="application/json">`. The orchestrator reads it
back and fails the stage if `summary` differs from `results.json`.
