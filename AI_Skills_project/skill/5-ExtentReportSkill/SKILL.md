---
name: extent-report
description: Stage 6 of the QA pipeline. Build the Extent-style HTML test report (one self-contained file - status donut, stat cards, Target vs Impacted split, expandable test cards with every step, actual result and embedded screenshot, drafted bugs) from a finished playwright-cli execution run, and serve the live dashboard while a run is in progress. Optional real ExtentReports (Java) output. Run by the report-builder agent.
---

# Extent Report (stage 6)

## Role
You present what the run recorded. You never re-run, re-judge or re-count tests: the numbers come from
`results.json`, the report shows exactly those.

## Rules
- Every status stays separate: Passed, Failed, Error, Flaky, Blocked, Skipped, Not Run. Flaky is never shown as Passed.
- SAMPLE, Tester-override and observation-derived runs carry their banner (the script does this from the suite/results flags).
- The report is local. You never upload or send it.

## Procedure
1. Check the inputs are validated: `results.json` status `complete` (the script refuses otherwise) and `bugs/bugs.json` if stage 5 ran.
2. Build:
   `node skill/5-ExtentReportSkill/scripts/build_extent_report.js --results <run>/execution/run/results.json --suite <run>/testcases/<ID>-testcases.json --bugs <run>/bugs/bugs.json --out <run>/report/report.html --title "<ID> <title> - <date>"`
   Screenshots are embedded (one file works anywhere). `--link-images` keeps them as links for very large runs.
3. Optional, only if `check_env.js` showed Java 17+ and Maven: the real ExtentReports Spark report:
   `mvn -q -f skill/5-ExtentReportSkill/scripts/java/pom.xml compile exec:java -Dexec.args="<run>/execution/run/results.json <run>/report/extent"`
   Maven downloads its dependencies from Maven Central: ask the user before the first run. View it with
   `node skill/5-ExtentReportSkill/scripts/serve_report.js <run>/report/extent`.
4. Open `report.html` yourself (read the numbers back) and check they match `results.json` summary. The orchestrator checks this too.

## Live dashboard (used during stage 4)
`node skill/5-ExtentReportSkill/scripts/live_dashboard.js --suite <suite.json> --run-dir <run>/execution/run --port 8790 [--open] [--exit-when-done]`
Local only (127.0.0.1). Shows every case Not Run before the run starts and updates every 2 seconds. Parallel runs use different ports.

## Output (in `<run>/report/`)
`report.html` (always), `extent/index.html` (only with Java). Hand back the path and the summary line.

## Resources
| File | Content |
|---|---|
| `scripts/render.js` | Shared renderer for the report and the live dashboard |
| `references/report-contract.md` | What the report shows and how each number is computed |
