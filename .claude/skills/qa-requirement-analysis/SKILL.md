---
name: qa-requirement-analysis
description: Stage 1 of the QA pipeline. Analyse one user story inside its epic for testability - split the acceptance criteria, find gaps, write questions (never assumed answers), rank the modules the story impacts (Likelihood x Severity) and draw the epic impact graph - then draft the stakeholder email and the Jira comment. Use when a story or epic from test-input/ (or a Jira issue) must be analysed before test design. Run by the requirements-analyst agent.
---

> **Home: `AI_Skills_project/`** (repo root). Every path below or in the files it points to (`skill/…`, `.claude/skills/qa-orchestrator/…`, `test-input/`, `test-output/`, `CLAUDE.md`) is relative to `AI_Skills_project/`. Run every command as `cd AI_Skills_project && node …` (so `.playwright-cli/` scratch and run folders land there), and read/write files under `AI_Skills_project/`. Follow `AI_Skills_project/CLAUDE.md` rules.

Read `AI_Skills_project/skill/1-RequirmentAnalysisSkill/SKILL.md` now and follow it exactly; its `references/`, `templates/` and `scripts/` are next to it.
