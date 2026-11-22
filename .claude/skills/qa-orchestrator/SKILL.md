---
name: qa-orchestrator
description: Run the whole QA pipeline for one user story in an epic - requirement analysis with impact graph, readiness gate (decided by the user), test cases for the story and its impacted modules, execution with the Playwright agent-cli and a live dashboard, bug reports, Extent report, and a run summary - by delegating each stage to its dedicated agent and verifying every result with validators. Use when the user says "run the pipeline / test story <ID> / do all testing for <story>". Jira posting only with the user's approval.
---

> **Home: `AI_Skills_project/`** (repo root). Every path below or in the files it points to (`skill/…`, `.claude/skills/qa-orchestrator/…`, `test-input/`, `test-output/`, `CLAUDE.md`) is relative to `AI_Skills_project/`. Run every command as `cd AI_Skills_project && node …` (so `.playwright-cli/` scratch and run folders land there), and read/write files under `AI_Skills_project/`. Follow `AI_Skills_project/CLAUDE.md` rules.

In this repo the main session can be the orchestrator: after loading this skill you coordinate and spawn the stage agents (`requirements-analyst`, `test-designer`, `qc-execution`, `bug-reporter`, `report-builder`) by `subagent_type` yourself. (`claude --agent orchestrator` from the repo root also works.)

Read `AI_Skills_project/.claude/skills/qa-orchestrator/SKILL.md` now and follow it exactly (`P = cd AI_Skills_project && node .claude/skills/qa-orchestrator/scripts/pipeline.js`). Pass every stage agent ABSOLUTE paths for the run folder and inputs.
