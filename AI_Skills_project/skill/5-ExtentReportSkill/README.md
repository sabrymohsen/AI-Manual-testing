# 5 Extent Report Skill

Stage 6 of the QA pipeline (agent: `report-builder`). Read `SKILL.md` for the procedure.

| Script | What it does |
|---|---|
| `scripts/build_extent_report.js --results ... --suite ... [--bugs ...] --out report.html` | One self-contained HTML report (donut, cards, Target/Impacted split, steps with embedded screenshots, bugs) |
| `scripts/live_dashboard.js --suite ... --run-dir <execution/run> [--port 8790] [--open] [--exit-when-done]` | Live view during execution, 127.0.0.1 only, refresh every 2 s |
| `scripts/serve_report.js <folder> [--port 8787]` | Serve a report folder locally |
| `scripts/render.js` | Shared renderer |
| `scripts/java/` | Optional Maven project for the real ExtentReports Spark report (Java 17+, Maven; not compiled on this machine yet) |

Tests: `node --test skill/5-ExtentReportSkill/scripts/tests/`.
