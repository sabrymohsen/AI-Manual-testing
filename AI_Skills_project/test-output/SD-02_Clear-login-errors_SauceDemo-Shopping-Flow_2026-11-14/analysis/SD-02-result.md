# Requirement analysis: SD-02 Clear login errors

- Epic: EPIC 1 SauceDemo Shopping Flow (`test-input/EPIC_1_SauceDemo.md`), https://www.saucedemo.com
- Sources read: `test-input/SD-02-story.md`, `test-input/EPIC_1_SauceDemo.md` (story table, test users, dependency chain, notes)
- Analyst: requirements-analyst procedure (skill 1), 2026-11-15. The live site was not observed (playwright-cli not installed yet), so there are no observations.

## Story
As a **shopper**, I want clear login errors, so that I know what went wrong.

## Acceptance criteria
| AC | As written | Observable outcome | Expected text (exact) | Test data | Gap |
|---|---|---|---|---|---|
| AC-1 | Empty username -> "Epic sadface: Username is required" | Error message on the login form, user stays on the login page | `Epic sadface: Username is required` | username empty, any password (`secret_sauce`) | G-03, G-05 |
| AC-2 | Empty password -> "Password is required" | Error message, stays on login | `Password is required` **as written**; prefix unknown (G-01) | `standard_user`, password empty | G-01, G-03 |
| AC-3 | Wrong details -> "Username and password do not match any user in this service" | Error message, stays on login | `Username and password do not match any user in this service` **as written**; prefix unknown (G-01) | wrong password for `standard_user`; unknown user (G-02) | G-01, G-02, G-05 |

## Lint findings
| Rule | Finding | Mapped to |
|---|---|---|
| inconsistent-text | AC-1 has the prefix "Epic sadface: ", AC-2 and AC-3 do not | G-01 / Q-01 |
| placeholder | Stakeholders are `<PO name> / <BA name> / <Dev lead name>` | G-06 / Q-06 |

## Gaps
- **G-01** AC-1 gives its message with the prefix "Epic sadface: "; AC-2 and AC-3 give theirs without it. The exact text of AC-2 and AC-3 is unknown.
- **G-02** "Wrong details" does not say: wrong username, wrong password, or both? Same message for all?
- **G-03** Both fields empty: no expected message.
- **G-04** After an error: inputs kept or cleared? Error dismissible? Fields highlighted? Not stated.
- **G-05** Spaces-only username, and case sensitivity of the password: not stated.
- **G-06** No named stakeholder who can answer.

## Questions
| ID | Priority | Question | Why it matters | Ask to | Status |
|---|---|---|---|---|---|
| Q-01 | High | Exact text for AC-2 and AC-3: with "Epic sadface: " or without? | Expected results must be exact; also affects SD-03 | PO | Open |
| Q-02 | Medium | Does "wrong details" cover wrong user, wrong password and both, with one message? | Number of AC-3 cases; user enumeration risk | PO | Open |
| Q-03 | Medium | Both fields empty: which message? | Common case without a defined result | PO | Open |
| Q-04 | Low | After an error: inputs kept/cleared, dismissible, highlighted? | Defines after-error state | BA | Open |
| Q-05 | Low | Spaces-only username = empty? Password case sensitive? | Boundary cases | BA | Open |
| Q-06 | High | Who are the PO / BA / Dev lead for EPIC 1? | The gate needs answers from a named person | Tester / project lead | Open |

## Impact
Matrix: `SD-02-impact.md`. Graph: `EPIC_1-SD-02-graph.html`.
| ID | Module | L x S | Level | Evidence / question | Test focus |
|---|---|---|---|---|---|
| IM-01 | SD-01 Log in | 3 x 3 = 9 | **Critical** | SD-02 Depends On SD-01; same login form | Valid login still opens Products, also right after an error |
| IM-02 | SD-03 Blocked user message | 3 x 2 = 6 | **High** | "related SD-03 (blocked user message)"; Q-01 | locked_out_user still blocked with the locked-out message |
| IM-03 | Shopping flow SD-04..SD-11 | 1 x 3 = 3 | Medium | Dependency chain starts at SD-01 | Product list shows after login (covered by IM-01 case) |
| IM-04 | SD-12 Logout to login page | 1 x 2 = 2 | Low | "Logout returns to the login page" | Form still validates after logout |

Stage 3 must give IM-01 and IM-02 at least one Impacted test case each.

## Readiness
| Gate condition | State |
|---|---|
| 1. All questions answered | **No** (6 open: 2 High, 2 Medium, 2 Low) |
| 2. Requirement clear | **No** (Unclear) |
| 3. Jira updated with the answers | **No** |
| 4. Stakeholder email updated | **No** |

The readiness gate is decided by the user at stage 2. This analysis does not decide it.

## Drafts (not sent, not posted)
- Email: `SD-02-email-draft.md`
- Jira comment: `SD-02-jira-comment.md`
