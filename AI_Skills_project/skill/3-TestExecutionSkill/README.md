# 3 Test Execution Skill

Stage 4 of the QA pipeline (agent: `qc-execution`). Read `SKILL.md` for the procedure.
The agent drives a real browser with the **Playwright agent-cli** (`playwright-cli`, https://playwright.dev/agent-cli/introduction)
and writes **no automation code**. The scripts only record and check what it did.

| Script | What it does |
|---|---|
| `scripts/check_env.js --url <url>` | Preflight: Node, playwright-cli, URL reachable, (Java/Maven optional). Installs nothing |
| `scripts/record_result.js start/show/begin/step/end/note/finish/status` | The recorder: named session, one record per step with actual result and screenshot; refuses Blocked cases, passes without evidence, and retries of product failures |
| `scripts/validate_results.js <results.json>` | Stage validator: complete, honest, expected results unchanged, counts consistent |
| `scripts/lib.js` | Shared helpers (statuses, summary, session names, approved hosts) |

References: `references/playwright-cli.md` (commands), `references/verdict-rules.md` (pass/fail/error/retry).
Tests: `node --test skill/3-TestExecutionSkill/scripts/tests/`.
