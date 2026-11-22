# Finished example: SD-02 Clear login errors (format reference only)

> SAMPLE. This example shows the shape of a finished analysis. It is not a result. Never post it.

## Acceptance criteria
| AC | As written | Observable outcome | Gap |
|---|---|---|---|
| AC-1 | Empty username -> "Epic sadface: Username is required" | Error text under the form | - |
| AC-2 | Empty password -> "Password is required" | Error text | G-01: no "Epic sadface: " prefix, unlike AC-1 |
| AC-3 | Wrong details -> "Username and password do not match any user in this service" | Error text | G-01; G-02: "wrong details" does not say wrong user, wrong password or both |

## Gaps
- G-01 Message prefixes are inconsistent across the ACs (lint rule `inconsistent-text`).
- G-02 "Wrong details" is not split into wrong username / wrong password / both.
- G-03 Nothing says whether the fields are cleared after an error, or whether the error can be dismissed.

## Questions
| ID | Priority | Question | To |
|---|---|---|---|
| Q-01 | High | Is the exact text for AC-2 and AC-3 with or without "Epic sadface: "? | PO |
| Q-02 | Medium | Does AC-3 cover wrong username, wrong password, and both? Same message for all? | PO |
| Q-03 | Low | After an error, are the inputs kept or cleared? Is the error dismissible (X button)? | BA |

## Impact
| ID | Module | L x S | Level | Evidence |
|---|---|---|---|---|
| IM-01 | SD-01 Log in | 3 x 3 = 9 | Critical | "SD-02 ... Depends On SD-01": same login form |
| IM-02 | SD-03 Blocked user message | 3 x 2 = 6 | High | Same error area on the login form |
| IM-03 | SD-12 Logout returns to login | 1 x 2 = 2 | Low | "Logout returns to the login page" |

## Readiness
| Condition | State |
|---|---|
| All questions answered | No (3 open) |
| Requirement clear | No |
| Jira updated | No |
| Email updated | No |

The gate is not met. The decision to wait or override belongs to the user (stage 2).
