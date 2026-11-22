# QA Pipeline Skills: from requirement to Extent report

Six Claude skills that work as one pipeline for **one user story inside an epic**. An **orchestrator** delegates each stage to its own dedicated agent and verifies every result with validators.

The pipeline: analyses the story and builds the **impact analysis and impact graph** of the whole epic; lets **you** decide the readiness gate after you have seen the work; designs test cases for the story **and its impacted modules**; executes them by driving the **Playwright agent-cli** (no automation code) with a **live dashboard**; files bugs only for confirmed defects; and builds the report. **Every test run gets its own folder** in `test-output/`.

```
                       QAOrchestrator  (delegates, verifies, records, summarizes)
                                          │
 Epic + story ─► 1 Requirement ─► 2 Gate ─► 3 Test cases ─► 4 Execution ─► 5 Bug reports ─► 6 Extent report ─► 7 Summary
 (test-input/)   analysis +       (you,     story +         Playwright     only for         HTML (+ Java        what was NOT
                 impact graph     after      impacted        agent-cli,     confirmed        ExtentReports)      posted or sent
                                  seeing     modules         live           defects
                                  the work)                  dashboard
```

> **New here? Read the [User Guide](docs/USER-GUIDE.md)**. It has diagrams of every stage, the gate, test statuses, triage, the folders and Jira.
> No Mermaid viewer? Open [docs/user-guide.html](docs/user-guide.html) in a browser.

## Quick start
```bash
node skill/3-TestExecutionSkill/scripts/check_env.js --url https://www.saucedemo.com   # preflight: must print READY
claude --agent orchestrator                                                          # start Claude with the orchestrator
```
Then say **"Run the QA pipeline for story SD-02"** and:
1. Answer the URL, scope, headed and dashboard questions.
2. Read the analysis and decide the gate.
3. Watch the headed browser and the dashboard.
4. Open `report/report.html` in the run folder.

## Skills and agents
| Stage | Skill (folder) | Dedicated agent (`.claude/agents/`) | Key output |
|---|---|---|---|
| 1 Requirement analysis | `skill/1-RequirmentAnalysisSkill` | `requirements-analyst` | analysis report, questions, email and Jira drafts, **impact analysis, impact graph** |
| 2 Readiness gate | `.claude/skills/qa-orchestrator` | `orchestrator` and you | blocking notice (drafted, never sent), gate record |
| 3 Test cases | `skill/2-TestCaseCreationSkill` | `test-designer` | `*-testcases.json / .md / .csv` (Target and Impacted cases) |
| 4 Test execution | `skill/3-TestExecutionSkill` | `qc-execution` | `results.json`, screenshots, execution log |
| 5 Bug reports | `skill/4-BugReportSkill` | `bug-reporter` | `bugs.json`, `BUG-xxx.md`, Jira text (only for confirmed defects) |
| 6 Extent report | `skill/5-ExtentReportSkill` | `report-builder` | `report.html`, live dashboard |
| 7 Summary | `.claude/skills/qa-orchestrator` | `orchestrator` | `run-summary.md` |

Each skill and the orchestrator has its own `README.md`. The orchestrator is registered as `/qa-orchestrator`; run it as the main agent with `claude --agent orchestrator` (sub-agents cannot spawn sub-agents). `CLAUDE.md` holds the rules every agent follows.

All skills follow the same rules: **never assume** (unknown means a question), **report honestly** (Failed, Error, Blocked, Skipped are never hidden or merged), **nothing leaves the machine without the user** (no Jira write, email or install without your explicit approval), **make first, then ask** (the gate is decided after you have seen the analysis and the drafted notice), and **samples, overrides and observation-derived results are labelled** everywhere.

## Project structure
```
Skills_project/
├── README.md, CLAUDE.md, .env.example, .mcp.json (Atlassian MCP server for Jira)
├── docs/                          USER-GUIDE.md (diagrams), user-guide.html, build_user_guide_html.js
├── test-input/                    everything you give the pipeline: epics, stories, specs (any files)
├── test-output/                   ONE FOLDER PER TEST RUN
│   └── <STORY-ID>_<Story-name>_<Epic-name>_<date>/
│       ├── analysis/ gate/ testcases/ execution/ bugs/ report/ summary/
│       └── pipeline-state.json
├── skill/
│   ├── 1-RequirmentAnalysisSkill/ SKILL.md, README.md, references/ (+ examples/), templates/, scripts/
│   ├── 2-TestCaseCreationSkill/   SKILL.md, README.md, references/, templates/, scripts/
│   ├── 3-TestExecutionSkill/      SKILL.md, README.md, references/, scripts/
│   ├── 4-BugReportSkill/          SKILL.md, README.md, references/, templates/, scripts/
│   └── 5-ExtentReportSkill/       SKILL.md, README.md, references/, scripts/ (+ scripts/java/ optional Maven project)
└── .claude/
    ├── skills/qa-orchestrator/    SKILL.md, README.md, references/ (gate rules, state schema, Jira MCP), scripts/ (pipeline.js, jira.js)
    └── agents/                    orchestrator, requirements-analyst, test-designer, qc-execution, bug-reporter, report-builder
```
The skill folders hold only SKILL.md, README, references, templates and scripts: no run data. Inputs live in `test-input/`, outputs in `test-output/`.

## Requirements
- **Node.js 20+**. The scripts need 18+ and the Playwright CLI needs 20+. The scripts themselves need nothing installed. This machine runs Node 27 (alpha); npm warns about it, but everything works.
- **Playwright CLI** (agent-cli, https://playwright.dev/agent-cli/introduction) for execution: `npm install -g @playwright/cli@latest`, then `playwright-cli install-browser`. **Installed here: 0.1.24** (with your approval). Installing is always your decision; the agents never install on their own.
- **Java 17+ and Maven** only for the optional real ExtentReports report (`skill/5-ExtentReportSkill/scripts/java/`, not yet compiled on this machine). The self-contained HTML report needs only Node.
- **Jira (optional), one of:**
  - REST script: copy `.env.example` to `.env` and fill in `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`.
  - Atlassian MCP server: `.mcp.json` declares `atlassian`. In Claude Code run `/mcp`, choose `atlassian` and authenticate in the browser. In the claude.ai app it is the Atlassian Rovo connector.
- Check the setup: `node skill/3-TestExecutionSkill/scripts/check_env.js --url <base url>`

## Run the whole pipeline (orchestrator)
Put the epic in `test-input/`, then ask Claude to run the QA pipeline for a story ("run the pipeline for story SD-02 in epic 1"). The orchestrator:
1. asks for the URL, the scope (number of test cases), headed or headless (**headed is this project's default**), and whether you want the dashboard; creates the run folder and the state file;
2. delegates stage 1, verifies it, **drafts the blocking notice, shows you the analysis, the questions and the impact graph, and only then asks** whether to proceed with an override or wait;
3. delegates stages 3 to 6 (test cases for the story and its impacted modules, execution with a live dashboard, bug triage, report), verifying each with its validator;
4. writes `summary/run-summary.md`: results for the story and for the impacted modules, Errors, flaky tests, and **what was not posted or sent**.

Several runs can go in parallel (separate folders, dashboard ports and browser sessions). Useful commands: `node .claude/skills/qa-orchestrator/scripts/pipeline.js status|check all|notice|summary --run-dir <run folder>`.

## Run one skill on its own
```bash
# Requirement analysis and impact
node skill/1-RequirmentAnalysisSkill/scripts/story_lint.js <story.md>
node skill/1-RequirmentAnalysisSkill/scripts/build_email.js <questions.json> --story "ID Title"
node skill/1-RequirmentAnalysisSkill/scripts/build_jira_comment.js <questions.json>
node skill/1-RequirmentAnalysisSkill/scripts/build_impact.js <id>-impact.json --check
node skill/1-RequirmentAnalysisSkill/scripts/build_epic_graph.js <epic>.md --impact <id>-impact.json --out <run>/analysis/<EPIC>-<id>-graph.html

# Test cases (with impacted-module coverage)
node skill/2-TestCaseCreationSkill/scripts/validate_testcases.js <suite.json> --impact <id>-impact.json
node skill/2-TestCaseCreationSkill/scripts/build_testcases.js <suite.json> --md out.md --csv out.csv

# Execution: the agent drives playwright-cli itself (no automation code) and records every step
node skill/3-TestExecutionSkill/scripts/record_result.js start --out <dir> --suite <suite.json> --base-url <url> [--headed]
#   per test: show, begin, (playwright-cli commands), step ..., end;  then:
node skill/3-TestExecutionSkill/scripts/record_result.js note --out <dir> --test <TC> --text "..."   # add a note later (never edit results.json)
node skill/3-TestExecutionSkill/scripts/record_result.js finish --out <dir>
node skill/3-TestExecutionSkill/scripts/validate_results.js <dir>/results.json
node skill/5-ExtentReportSkill/scripts/live_dashboard.js --suite <suite.json> --run-dir <dir> --port 8790 --open --exit-when-done   # live dashboard

# Bugs and reports
node skill/4-BugReportSkill/scripts/build_bug_report.js --results <results.json> --suite <suite.json> --triage <triage.json> --out <dir>
node skill/4-BugReportSkill/scripts/validate_bugs.js <dir>/bugs.json
node skill/5-ExtentReportSkill/scripts/build_extent_report.js --results <results.json> --suite <suite.json> [--bugs <bugs.json>] --out report.html
node skill/5-ExtentReportSkill/scripts/serve_report.js <folder>      # view over http://127.0.0.1:8787/
```
Unit tests (54): `node --test 'skill/*/scripts/tests/*.test.js' '.claude/skills/qa-orchestrator/scripts/tests/*.test.js'`

## Jira
There are two ways, with the same rules. Details: `.claude/skills/qa-orchestrator/references/jira-mcp.md` and the [User Guide](docs/USER-GUIDE.md#10-jira).

**1. The REST script** `.claude/skills/qa-orchestrator/scripts/jira.js` (Jira Cloud REST v3, credentials from `.env`):
```bash
node .claude/skills/qa-orchestrator/scripts/jira.js read --key PROJ-12 --out test-input/PROJ-12-story.md       # read a story into test-input
node .claude/skills/qa-orchestrator/scripts/jira.js comment --key PROJ-12 --file <run>/analysis/<ID>-jira-comment.md --run-dir <run>   # dry run
node .claude/skills/qa-orchestrator/scripts/jira.js create-bug --id BUG-001 --run-dir <run> --link PROJ-12                            # dry run
#   after you approve the printed plan: add --execute --approved-by "<your name>"
```
Every write is a dry run first; SAMPLE and tester-override runs are refused; every post is recorded in `pipeline-state.json` and the run summary.

**2. The Atlassian MCP server** (`.mcp.json` -> `atlassian`; authenticate once with `/mcp`). The `orchestrator` and `requirements-analyst` agents may use its tools:
- the analyst only reads;
- the orchestrator shows you the exact payload, makes one call after your approval, and records it with `pipeline.js record-post`.

## Readiness Gate (test cases are blocked until it is met)
No test cases until (1) all requirement questions are answered, (2) the requirement is clear, (3) Jira is updated with the answers, (4) the stakeholder email is updated. If not, a blocking notice is **drafted first and shown to you together with the analysis**; only then are you asked whether to proceed with a **tester override** or wait. The orchestrator refuses to record an override before stage 1 is Done and the notice exists. An overridden suite, its results and reports carry a *Tester override* banner.

## Impacted modules
The impact analysis ranks the modules a story affects (Likelihood x Severity: Critical 9, High 6, Medium 3-4, Low 1-2), each backed by an evidence quote or a question. Test case creation must cover every **Critical and High** impact with a case marked `scope: Impacted`; the validator and the orchestrator fail otherwise. Execution runs both scopes, and results, reports, the dashboard and bug reports (impacted failures are regressions) show the scope.

## Test runs in this project (in `test-output/`)
| Run | Gate | Result |
|---|---|---|
| `SD-02_Clear-login-errors_SauceDemo-Shopping-Flow_2026-11-14` | Tester override (6 open questions) | 7 cases (4 story + 3 impacted), headed, playwright-cli 0.1.24: **3 Passed, 4 Failed**, 0 Error, 0 Flaky. All 4 failures: the live message adds "Epic sadface: ", which AC-2, AC-3 and SD-03 leave out (Q-01). Triage: **0 bugs, 4 requirement issues**, 1 observation (a `session-username` cookie is set after a rejected login). No data created; nothing posted. |

Each run's `summary/run-summary.md` and `report/report.html` hold the details.

## Important notes
- **Observation-derived results:** when there is no business owner or the acceptance criteria are thin, expected results come from what the site showed. A pass means "behaves as observed", not "correct".
- **SAMPLE** runs and bugs exist only to exercise the skills; they are labelled in every file and never posted.
- **Nothing was posted to Jira or sent by email** in any run. All emails, Jira comments and blocking notices are drafts.
- The public demo sites are shared: tests create minimal data and delete it afterwards; anything that could not be cleaned is listed in the run summary.
- **`.playwright-cli/`** in the project root is the CLI's scratch folder (page snapshots, console logs). It is not evidence (each run keeps its evidence in `execution/run/evidence/`) and is safe to delete after a run.
- **Agents are loaded when Claude Code starts.** After you add or change a file in `.claude/agents/`, restart Claude Code (or start it with `claude --agent orchestrator`).
- The Java ExtentReports project (`skill/5-ExtentReportSkill/scripts/java/`) has not been compiled on this machine (no Java/Maven). The HTML report is the one in use.

## Naming conventions
- Run folder `<STORY-ID>_<Story-name>_<Epic-name>_<date>`; story ids `SD-02`, `DB-04`, `AE-03`; question ids `Q-01`; gap ids `G-01`; impact ids `IM-01`; test cases `TC-<AREA>-<nnn>`; suites `TS-<AREA>-<nnn>`; bugs `BUG-001`.
- Files `<ID>-result.md`, `-questions.json`, `-impact.json`, `-email-draft.md`, `-jira-comment.md`, `-testcases.json|md|csv`; re-runs add `-v2`.
