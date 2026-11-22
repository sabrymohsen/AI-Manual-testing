# test-input

Everything you give the pipeline. Put as many files as you need, any mix of types: epics, user stories, specs, mock-ups, transcripts, test data, URLs and notes about credentials (fake data only).

| File | What it is |
|---|---|
| `EPIC_1_SauceDemo.md` | Epic 1: SauceDemo shopping flow (public demo, https://www.saucedemo.com) |
| `EPIC_2_Demoblaze.md` | Epic 2: Demoblaze store (13 stories, dependencies; https://www.demoblaze.com) |
| `EPIC_3_AutomationExercise.md` | Epic 3: Automation Exercise e-commerce (https://automationexercise.com) |
| `SD-02-story.md`, `DB-04-story.md`, `AE-03-story.md`, `DB-07-story.md` | Stories extracted from the epics by the requirements analyst |

Naming: `EPIC_<n>_<Name>.md` for epics (a table `| ID | User Story | Acceptance Criteria | Depends On | Status |`, which the impact graph reads), `<STORY-ID>-story.md` for stories. Blank formats: `skill/1-RequirmentAnalysisSkill/templates/story-template.md`.

Stories can also come from Jira: `node .claude/skills/qa-orchestrator/scripts/jira.js read --key <KEY> --out test-input/<KEY>-story.md`, or an Atlassian MCP read. The Jira wording is kept exactly.

Outputs of a run go to `test-output/<STORY-ID>_<Story-name>_<Epic-name>_<date>/`.
