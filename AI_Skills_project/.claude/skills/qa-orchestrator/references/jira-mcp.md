# Jira through the Atlassian MCP server

Two ways reach Jira. Both follow the same rules. Pick one per run and say which in the summary.

| | `scripts/jira.js` | Atlassian MCP (`.mcp.json` -> `atlassian`) |
|---|---|---|
| Auth | API token in `.env` | OAuth in the browser, once (`/mcp` -> atlassian -> Authenticate) |
| Reads | `read --key` | the server's issue get / search (JQL) tools |
| Writes | dry run, then `--execute --approved-by` | a tool call; there is no dry run, so YOU show the exact payload first |
| Guards built in | SAMPLE/override refused, post recorded | none: you apply them by hand (below) |

## Setup (the user does this once)
1. The project `.mcp.json` declares the server `atlassian` (`https://mcp.atlassian.com/v1/sse`). Claude Code asks to trust it the first time.
2. In Claude Code run `/mcp`, choose `atlassian`, and authenticate in the browser with the Jira site account.
3. In the claude.ai app the same thing is the **Atlassian Rovo** connector (Settings -> Connectors), which also needs authorizing.
Tool names come from the server (they start with `mcp__atlassian__`). List them with `/mcp` instead of guessing.

## Rules (the same as jira.js, applied by you)
- **Reads** (get an issue, search with JQL, read comments): only when the user asks. A story read from Jira is saved to
  `test-input/<KEY>-story.md` with the Jira wording unchanged and a line saying where it came from.
- **Writes** (create an issue, add a comment, add an attachment, link, transition):
  1. Refuse if the run is SAMPLE or a tester override: `pipeline-state.json` `sample: true` or `gate.decision: "Override"`.
  2. Show the user the exact payload: project, issue type, summary, description, labels, priority, link and attachments.
     Take it from `bugs/BUG-xxx.jira.txt` or `analysis/<ID>-jira-comment.md`. Never write new text for Jira.
  3. Wait for an explicit approval of that payload. Anything else means zero writes.
  4. Call the tool once. No retries. If it fails, report exactly what landed.
  5. Record it: `node .claude/skills/qa-orchestrator/scripts/pipeline.js record-post --run-dir <run> --what "bug BUG-001" --target "<issue URL>" --approved-by "<name>"`,
     set `jiraKey` and `"status": "Posted"` on the bug in `bugs/bugs.json`, then re-run `pipeline.js summary`.
- Never delete or bulk-edit issues from the pipeline.
