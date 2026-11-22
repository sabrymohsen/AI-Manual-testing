---
name: qa-bug-report
description: Stage 5 of the QA pipeline. Triage every Failed, Flaky and Error result from a playwright-cli execution run, then draft bug reports (Markdown + Jira-ready text) only for confirmed defects, marking failures in impacted modules as regressions. Use after execution results are validated. Run by the bug-reporter agent. Drafts only - posting to Jira needs the user's approval through the orchestrator.
---

> **Home: `AI_Skills_project/`** (repo root). Every path below or in the files it points to (`skill/…`, `.claude/skills/qa-orchestrator/…`, `test-input/`, `test-output/`, `CLAUDE.md`) is relative to `AI_Skills_project/`. Run every command as `cd AI_Skills_project && node …` (so `.playwright-cli/` scratch and run folders land there), and read/write files under `AI_Skills_project/`. Follow `AI_Skills_project/CLAUDE.md` rules.

Read `AI_Skills_project/skill/4-BugReportSkill/SKILL.md` now and follow it exactly; its `references/`, `templates/` and `scripts/` are next to it.
