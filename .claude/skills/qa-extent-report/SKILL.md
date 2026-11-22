---
name: qa-extent-report
description: Stage 6 of the QA pipeline. Build the Extent-style HTML test report (one self-contained file - status donut, stat cards, Target vs Impacted split, expandable test cards with every step, actual result and embedded screenshot, drafted bugs) from a finished playwright-cli execution run, and serve the live dashboard while a run is in progress. Optional real ExtentReports (Java) output. Run by the report-builder agent.
---

> **Home: `AI_Skills_project/`** (repo root). Every path below or in the files it points to (`skill/…`, `.claude/skills/qa-orchestrator/…`, `test-input/`, `test-output/`, `CLAUDE.md`) is relative to `AI_Skills_project/`. Run every command as `cd AI_Skills_project && node …` (so `.playwright-cli/` scratch and run folders land there), and read/write files under `AI_Skills_project/`. Follow `AI_Skills_project/CLAUDE.md` rules.

Read `AI_Skills_project/skill/5-ExtentReportSkill/SKILL.md` now and follow it exactly; its `references/`, `templates/` and `scripts/` are next to it.
