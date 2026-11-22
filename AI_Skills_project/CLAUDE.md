# QA Pipeline Skills

Claude skills that run a QA pipeline from requirement to report. Stage skills live in `skill/`;
the coordinating skill lives in `.claude/skills/qa-orchestrator` and loads as `/qa-orchestrator`.

## Pipeline and owners
| # | Stage | Skill folder | Agent |
|---|---|---|---|
| 1 | Requirement analysis (+ impact analysis and an impact graph for every story) | `skill/1-RequirmentAnalysisSkill` | `requirements-analyst` |
| 2 | Readiness gate | n/a | `orchestrator` + the user |
| 3 | Test cases (the story AND its impacted modules; every Critical/High impact gets a case) | `skill/2-TestCaseCreationSkill` | `test-designer` |
| 4 | Test execution (Playwright agent-cli, no automation code) | `skill/3-TestExecutionSkill` | `qc-execution` |
| 5 | Bug reports | `skill/4-BugReportSkill` | `bug-reporter` |
| 6 | Extent report | `skill/5-ExtentReportSkill` | `report-builder` |
| 7 | Summary | `.claude/skills/qa-orchestrator` | `orchestrator` |

Agents (`.claude/agents/`): `orchestrator` (coordinates, never does stage work) and one dedicated agent per delegated stage:
`requirements-analyst` (1), `test-designer` (3), `qc-execution` (4, drives the Playwright agent-cli), `bug-reporter` (5), `report-builder` (6).
The orchestrator spawns them by name (`subagent_type`), never as general-purpose.
Run the orchestrator as the main agent: `claude --agent orchestrator`
(sub-agents cannot spawn other sub-agents).

## Rules for every agent
- Never assume: unknown means a question, not an invented answer.
- Run only `Ready` test cases. Never run `Blocked`. Never change an expected result to get green.
- Failed (assertion did not hold) is not Error (could not run as designed). Report both honestly.
- Nothing leaves the machine without the user: no Jira write, email, chat, and no install (`npm install -g`, Maven downloads) without the user's explicit approval.
- Stay inside the approved hosts, use synthetic data, clean up what you create, close browser sessions.
- The orchestrator trusts validators, not "done": `node .claude/skills/qa-orchestrator/scripts/pipeline.js complete <stage>`.
- The readiness gate is decided by the user. Overrides need their words, a recorded who/why, and a blocking notice.
- SAMPLE runs and Tester-override suites are labelled everywhere and never posted.

## Commands
- Preflight: `node skill/3-TestExecutionSkill/scripts/check_env.js --url <base url>`
- Pipeline board: `node .claude/skills/qa-orchestrator/scripts/pipeline.js status --run-dir <run folder>`
- Unit tests: `node --test 'skill/*/scripts/tests/*.test.js' '.claude/skills/qa-orchestrator/scripts/tests/*.test.js'`
- Jira, two ways, the same rules (writes only after the user approves the exact content; SAMPLE/override never):
  - `node .claude/skills/qa-orchestrator/scripts/jira.js read|comment|create-bug ...` (dry run until `--execute --approved-by`)
  - the Atlassian MCP server `atlassian` (`.mcp.json`), following `.claude/skills/qa-orchestrator/references/jira-mcp.md`; record each post with `pipeline.js record-post`
- Never edit `results.json` or other generated files by hand: use `record_result.js note`, triage `observations`, `pipeline.js note`.
- User guide with diagrams: `docs/USER-GUIDE.md` (HTML: `node docs/build_user_guide_html.js`).
- Requires Node 20+ (Playwright CLI), Playwright CLI (`playwright-cli`), Java 17+ and Maven only for the Java Extent report.
- Execution runs headed by default in this project (the user watches the browser).

## Inputs and outputs
- `test-input/`: everything you give the pipeline (epics, stories, specs, any number of files).
- `test-output/`: everything produced. **Every new test run gets its own folder** named `<STORY-ID>_<Story-name>_<Epic-name>_<date>` (for example `DB-07_View-a-product-page_Demoblaze-Online-Store_2026-10-19`), holding subfolders `analysis/`, `gate/`, `testcases/`, `execution/`, `bugs/`, `report/`, `summary/` and `pipeline-state.json`. Create it with `pipeline.js init --out-root test-output --story ... --story-title ... --epic ...`.
- Agents read inputs from `test-input/` and write results to the matching subfolder of the run folder they are given.
- Make first, then ask: show the analysis and the drafted blocking notice to the user BEFORE asking about the readiness gate or an override. Never ask about overriding at the start and never reuse an earlier answer.
- Skill folders keep only SKILL.md, references, templates and scripts (blank formats and finished examples, no run data).
