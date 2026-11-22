---
name: test-execution
description: Stage 4 of the QA pipeline. Execute the Ready test cases of a suite by driving a real browser with the Playwright agent-cli (playwright-cli commands - no automation code), recording every step, its actual result and a screenshot through record_result.js, with a live dashboard. Use after test cases are designed and validated. Run by the qc-execution agent.
---

# Test Execution (stage 4)

## Role
You are the tester at the keyboard. You read each test case and perform it yourself with `playwright-cli`
commands (open, snapshot, click, fill, press, eval, screenshot). You write **no test code, no spec files,
no Playwright scripts**. `record_result.js` is your notebook: it records what you did and saw and refuses
a dishonest record.

## Rules
- Run only `Ready` cases. Never begin a `Blocked` or `Draft` case (the recorder refuses; finish marks them).
- **Never change an expected result.** The page disagreeing with the step is the finding.
- **Failed** = the test ran as designed and an assertion did not hold. **Error** = it could not run as designed
  (tool crash, site down, missing data, a step you could not perform). Never merge them.
- One retry only, and only after an infrastructure Error (`end --status Error --infra`, then `begin --retry`).
  A pass on the retry is recorded as **Flaky**. A product failure is never retried.
- Stay inside the approved hosts. Synthetic data only. Clean up what you create. Log what you could not clean.
- Always your own named session `-s=<session>` (from `start`). Never the default session, never `close-all` / `kill-all`.
- Close your session at the end, even after a failure: `playwright-cli -s=<session> close`.
- Headless unless the user asked for headed (`open <url> --headed`).
- A success message found in the DOM is not proof: check that it is visible (`references/verdict-rules.md`).

## Procedure
1. **Preflight.** `node skill/3-TestExecutionSkill/scripts/check_env.js --url <base url>`. Not READY → stop, report the FAIL lines.
   Never install anything yourself; installing is the user's decision.
2. **Start.** `node skill/3-TestExecutionSkill/scripts/record_result.js start --out <run>/execution/run --suite <run>/testcases/<ID>-testcases.json --base-url <url> [--headed] [--hosts host1,host2]`
   It prints the session name. Use it in every command.
3. **Dashboard** (if the user wants it), in the background:
   `node skill/5-ExtentReportSkill/scripts/live_dashboard.js --suite <suite.json> --run-dir <run>/execution/run --port <port>`
4. **Open the browser once:** `playwright-cli -s=<session> open <base url>` (add `--headed` when asked).
5. **For each Ready case**, in suite order (P1 first is fine):
   1. `record_result.js show --out <dir> --test <TC>`: read the steps, data and expected results.
   2. `record_result.js begin --out <dir> --test <TC>`
   3. Bring the page to the case's precondition (e.g. `goto <login url>`, clear cookies for a logged-out start).
   4. For each step: `snapshot` → act with the ref (`click e12`, `fill e5 "standard_user"`, `press Enter`) →
      `snapshot` or `eval` to read the outcome → `screenshot --filename=<abs dir>/evidence/<TC>-s<n>.png` on every
      step with an expected result → record:
      `record_result.js step --out <dir> --test <TC> --n <n> --status pass|fail|error --actual "<exactly what you saw>" --screenshot evidence/<TC>-s<n>.png --command "<the playwright-cli command>"`
      Quote real text exactly in `--actual`. On a fail, keep going only if later steps still make sense; otherwise
      record the remaining steps `skip`.
   5. `record_result.js end --out <dir> --test <TC> --status Passed|Failed|Error [--reason "..."] [--infra]`
   6. Clean up anything the case created (the case's `cleanup`).
6. **Console and network.** After each case: `playwright-cli -s=<session> console error`. JS errors are findings:
   add them to `--note` on `end` (they go to bug triage), even when the case passed. Read the console BEFORE `end`.
   Found something after `end` (or after `finish`)? Add it with `record_result.js note --out <dir> --test <TC> --text "..."`.
   Never edit `results.json` by hand.
7. **Finish.** `record_result.js finish --out <dir>`, then `playwright-cli -s=<session> close`, then
   `node skill/3-TestExecutionSkill/scripts/validate_results.js <dir>/results.json`. Fix the record (never the facts) until VALID.
8. Scratch: the CLI writes snapshots/console logs to `.playwright-cli/` in the working folder. Report it in your reply
   (count of files) so the orchestrator can note it; delete it only if you are allowed to.
9. Write `<run>/execution/<ID>-automation.json`: `{ "tool": "playwright-cli", "version", "session", "headed", "baseUrl", "commandsUsed": [...], "automationCode": false }`.

## Output (in `<run>/execution/`)
`run/results.json`, `run/execution-log.md`, `run/evidence/*.png`, `<ID>-automation.json`.
Hand back: the summary counts by scope, every Failed and Error with one line each, flaky tests, data left behind.

## Resources
| File | Read when |
|---|---|
| `references/playwright-cli.md` | Before the first browser command |
| `references/verdict-rules.md` | Deciding pass / fail / error / retry |
