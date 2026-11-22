# QA Orchestrator

Coordinates the 7-stage pipeline (`SKILL.md`). Loads as `/qa-orchestrator`; run it as the main agent with `claude --agent orchestrator`.

| Script | What it does |
|---|---|
| `scripts/pipeline.js init/configure/status/start/complete/check/notice/gate/note/summary/record-post` | Run folder and state, stage order, validators, blocking notice, readiness gate, run summary |
| `scripts/jira.js read/comment/create-bug` | Jira Cloud REST v3. Reads on request; writes are dry runs until `--execute --approved-by`; SAMPLE/override runs refused. Config in `.env` (see `.env.example`) |

Tests: `node --test .claude/skills/qa-orchestrator/scripts/tests/` (includes a full synthetic SAMPLE run through all stages).

Jira through the Atlassian MCP server (`.mcp.json` -> `atlassian`): see `references/jira-mcp.md`. Diagrams of the whole flow: `docs/USER-GUIDE.md`.
