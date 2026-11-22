# 1 Requirement Analysis Skill

Stage 1 of the QA pipeline (agent: `requirements-analyst`). Read `SKILL.md` for the procedure.

| Script | What it does |
|---|---|
| `scripts/story_lint.js <story.md>` | Mechanical lint: structure, vague words, missing outcomes, inconsistent message texts, placeholders |
| `scripts/build_impact.js <impact.json> --check [--md out.md] [--questions q.json] [--fix]` | Validates the impact list (L x S, level, evidence or question) and writes the matrix |
| `scripts/build_epic_graph.js <epic.md> --impact <impact.json> --story <ID> --out <graph.html>` | Self-contained HTML dependency graph of the epic coloured by impact |
| `scripts/build_email.js <questions.json> --story "<ID> <title>" --out <md>` | Stakeholder email DRAFT (never sent) |
| `scripts/build_jira_comment.js <questions.json> [--impact ...] --out <md>` | Jira comment DRAFT (never posted) |
| `scripts/validate_analysis.js <analysis dir> --story <ID>` | Stage validator used by the orchestrator |

Templates: `templates/` (story, result, questions, impact). Method: `references/`. Tests: `node --test skill/1-RequirmentAnalysisSkill/scripts/tests/`.
