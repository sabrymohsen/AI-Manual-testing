---
name: qa-test-execution
description: Stage 4 of the QA pipeline. Execute the Ready test cases of a suite by driving a real browser with the Playwright agent-cli (playwright-cli commands - no automation code), recording every step, its actual result and a screenshot through record_result.js, with a live dashboard. Use after test cases are designed and validated. Run by the qc-execution agent.
---

> **Home: `AI_Skills_project/`** (repo root). Every path below or in the files it points to (`skill/…`, `.claude/skills/qa-orchestrator/…`, `test-input/`, `test-output/`, `CLAUDE.md`) is relative to `AI_Skills_project/`. Run every command as `cd AI_Skills_project && node …` (so `.playwright-cli/` scratch and run folders land there), and read/write files under `AI_Skills_project/`. Follow `AI_Skills_project/CLAUDE.md` rules.

Read `AI_Skills_project/skill/3-TestExecutionSkill/SKILL.md` now and follow it exactly; its `references/`, `templates/` and `scripts/` are next to it.
