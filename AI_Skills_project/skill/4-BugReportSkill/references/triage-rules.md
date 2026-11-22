# Triage rules

## Is it a bug?
1. Did the test run as designed? No → `TestIssue` or `Environment`, never `Bug`.
2. Is the expected result confirmed (from the requirement, not an open question)? No → `RequirementIssue` and name the question.
3. Does the screenshot show the wrong behaviour? Yes → `Bug`. Not clear → look again, or `NotABug` with the reason.
4. Same cause as an earlier finding → `Duplicate` (`duplicateOf`: the test id of the first).

## Severity
| Severity | Meaning | Examples |
|---|---|---|
| Critical | Core flow blocked, data loss, security, money | Valid user cannot log in; order charged twice |
| High | Feature wrong, no reasonable workaround | Locked-out user gets in; total is wrong |
| Medium | Feature wrong with a workaround, or misleading message | Wrong error text; sort order wrong |
| Low | Cosmetic, wording, layout | Typo; misaligned icon |

Impacted-scope failures (regressions): at least High for a Critical impact, at least Medium for a High impact.

## Priority
P1 fix now (Critical), P2 this sprint (High), P3 planned (Medium), P4 when possible (Low). Adjust only with a reason.

## Writing
- Title: what is wrong + where, under 100 characters. No "it does not work".
- Actual: the exact text or state observed (from the step's `actual`), never a paraphrase.
- Expected: the exact expected text from the test case. Never changed.
- Known epic hints (e.g. "problem_user shows wrong images") are still bugs when observed: file them with the evidence.
