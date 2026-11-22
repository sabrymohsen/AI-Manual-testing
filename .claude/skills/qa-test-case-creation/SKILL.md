---
name: qa-test-case-creation
description: Stage 3 of the QA pipeline. Design manual test cases for one user story AND the modules it impacts - Target cases for every acceptance criterion, Impacted (regression) cases for every Critical/High impact - as a JSON suite that the Playwright agent-cli execution stage runs, plus Markdown and CSV views. Use after requirement analysis, once the user has decided the readiness gate. Run by the test-designer agent.
---

> **Home: `AI_Skills_project/`** (repo root). Every path below or in the files it points to (`skill/…`, `.claude/skills/qa-orchestrator/…`, `test-input/`, `test-output/`, `CLAUDE.md`) is relative to `AI_Skills_project/`. Run every command as `cd AI_Skills_project && node …` (so `.playwright-cli/` scratch and run folders land there), and read/write files under `AI_Skills_project/`. Follow `AI_Skills_project/CLAUDE.md` rules.

Read `AI_Skills_project/skill/2-TestCaseCreationSkill/SKILL.md` now and follow it exactly; its `references/`, `templates/` and `scripts/` are next to it.
