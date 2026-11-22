# Readiness gate rules

## The four conditions (read from `<ID>-questions.json`)
1. All requirement questions answered (`status: Answered` with `answer` and `answeredBy`).
2. The requirement is clear (`clarity: "Clear"`).
3. Jira is updated with the answers (`jiraUpdated: true`, set only when the user says so or after an approved post of the answers).
4. The stakeholder email is updated (`emailUpdated: true`, set only when the user says it was sent/answered).

## Order (make first, then ask)
1. Stage 1 Done (validator passed).
2. `pipeline.js notice`: the blocking notice is drafted.
3. Show the user the analysis, questions, impact graph, and the notice.
4. Only then ask the gate question. Never before. Never reuse an answer from an earlier run or an earlier message.

## Decisions
| Decision | Allowed when | Effect |
|---|---|---|
| `ready` | All four conditions met | Normal suite |
| `override` | Conditions not met, the notice exists, the user decided it in their own words | Suite `override: true` + `overrideNote`; every output labelled "Tester override"; nothing posted |
| `wait` | Any time | Pipeline stops at stage 2 |

`pipeline.js gate` refuses `ready` when a condition is not met, and refuses `override` without the notice, `--by`, `--why`, `--words`.

## The question to ask (example)
"The readiness gate for SD-02 is not met: 3 questions are open (Q-01 High ...). The blocking notice is drafted in
gate/blocking-notice.md (not sent). Do you want to **wait** for the answers, or **proceed with a tester override**?
If you override, tell me in your own words why; it will be recorded and every result will carry the override label."
