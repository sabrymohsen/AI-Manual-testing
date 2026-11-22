# 4 Bug Report Skill

Stage 5 of the QA pipeline (agent: `bug-reporter`). Read `SKILL.md` for the procedure.

| Script | What it does |
|---|---|
| `scripts/build_bug_report.js --results ... --suite ... --triage ... --out <bugs dir>` | Bugs only from "Bug" decisions: `bugs.json`, `BUG-xxx.md`, `BUG-xxx.jira.txt`, `bugs-summary.md` (drafts); triage `observations` become follow-ups in `bugs-summary.md`, never bugs |
| `scripts/validate_bugs.js <bugs.json> --results <results.json>` | Every Failed/Flaky/Error triaged, bugs only from real findings, complete fields, evidence on disk |

Posting to Jira: only through `.claude/skills/qa-orchestrator/scripts/jira.js create-bug` (dry run, user approval, `--execute`).
Tests: `node --test skill/4-BugReportSkill/scripts/tests/`.
