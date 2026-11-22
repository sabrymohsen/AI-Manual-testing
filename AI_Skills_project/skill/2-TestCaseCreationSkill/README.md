# 2 Test Case Creation Skill

Stage 3 of the QA pipeline (agent: `test-designer`). Read `SKILL.md` for the procedure.
Manual test cases, no automation code: the execution agent performs them with `playwright-cli`.

| Script | What it does |
|---|---|
| `scripts/validate_testcases.js <suite.json> --impact <impact.json> --questions <questions.json>` | Every AC has a Target case, every Critical/High impact an Impacted case, no Ready case on an open question (unless override), well-formed cases |
| `scripts/build_testcases.js <suite.json> --md out.md --csv out.csv` | Readable Markdown and CSV (Excel / Jira import) |

Schema: `references/suite-schema.md`. Blank suite: `templates/suite-template.json`. Tests: `node --test skill/2-TestCaseCreationSkill/scripts/tests/`.
