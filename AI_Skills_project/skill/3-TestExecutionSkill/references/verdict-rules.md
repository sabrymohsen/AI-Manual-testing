# Verdict rules

## Step status
| Status | When |
|---|---|
| `pass` | The expected outcome is observed exactly (text equal, element visible, state as described) |
| `fail` | The app answered and the answer is wrong: wrong text, missing element on a rendered page, wrong count, 4xx/5xx from the app, JS error that breaks the step |
| `error` | You could not perform or observe the step: the site never answered, the browser/session died, a CLI usage error you could not correct once, missing test data |
| `skip` | The step makes no sense after an earlier fail (record why in the next `--actual` or the end `--reason`) |

## Comparing text
- Exact match, including prefix, punctuation and case. "Epic sadface: Password is required" is **not** "Password is required".
- If the expected text differs only because the requirement itself is inconsistent (an open question), it is still a
  `fail`; bug triage decides whether it is a product bug or a requirement issue. Never edit the expectation.
- Read text with `eval "(el) => el.textContent" <ref>` or from the snapshot, and check visibility:
  `eval "(el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null }" <ref>`.

## Driver error vs product defect
1. **Your own command error** (`Unknown option`, missing argument): fix it once from `--help <command>`. Second time: the step is `error` with the CLI message.
2. **Infrastructure** (no page at all: `ERR_CONNECTION_REFUSED`, `ERR_NAME_NOT_RESOLVED`, session closed, timeout with nothing rendered):
   `end --status Error --infra --reason "<message>"`, then one `begin --retry` from a clean state. Pass on retry = Flaky.
3. **Defect** (the page rendered and is wrong, element not found on a rendered page, a 500 on submit): `fail`. Never retried,
   never forced through `run-code`, `force` or a JS click.
4. A timeout waiting for an element on a page that rendered is a defect. A timeout with no page is infrastructure.

## Test status
| End status | Requires |
|---|---|
| Passed | Every step recorded `pass`, at least one screenshot |
| Failed | At least one `fail` step, no `error` step, a screenshot of the failure |
| Error | A `--reason` |
| Flaky | Set by the recorder: Passed on the single retry after an infra Error |
| Blocked / Skipped / Not Run | Set by `finish` for cases you did not run |

## Console errors
`console error` after each case. A JS error is a finding even when the UI looks right: note it on `end --note`.
Bug triage decides; you report.
