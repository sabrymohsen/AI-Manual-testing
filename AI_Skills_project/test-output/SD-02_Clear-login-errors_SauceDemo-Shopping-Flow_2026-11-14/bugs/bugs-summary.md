# Bug triage: SD-02

> TESTER OVERRIDE. The readiness gate was not met (see ../gate/gate-record.md). Q-01 to Q-06 are Open. Nothing here is posted.

Suite TS-LOGIN-001. Results: total 7, Passed 3, Failed 4.

**0 bugs drafted. Nothing posted.**

## Not filed as bugs

| Test | Result | Decision | Reason |
|---|---|---|---|
| TC-LOGIN-002 | Failed | RequirementIssue | Expected text depends on open question Q-01 (G-01). Screenshot TC-LOGIN-002-s4.png shows the user kept on the login page with the error "Epic sadface: Password is required"; the expected text is AC-2 as written, "Password is required". The only difference is the "Epic sadface: " prefix. AC-1 in the same story requires that prefix (TC-LOGIN-001 passed with it), so the story contradicts itself and Q-01 is still Open. Not confirmed, so not a bug; goes to the PO via Q-01. The behaviour itself (stay on login page, password-required message) held. |
| TC-LOGIN-003 | Failed | RequirementIssue | Expected text depends on open question Q-01 (G-01). Screenshot TC-LOGIN-003-s4.png shows the user kept on the login page with "Epic sadface: Username and password do not match any user in this service"; the expected text is AC-3 as written, without the prefix. Only the "Epic sadface: " prefix differs, which is exactly what Q-01 asks. Not confirmed, so not a bug. (Q-02, which combinations AC-3 covers, is also Open but does not affect this result: the message body matches AC-3.) |
| TC-LOGIN-004 | Failed | RequirementIssue | Expected text depends on open question Q-01 (G-01), and whether an unknown username is covered by AC-3 at all depends on open Q-02. Screenshot TC-LOGIN-004-s4.png shows the user kept on the login page with "Epic sadface: Username and password do not match any user in this service"; expected is AC-3 as written, without the prefix. Only the prefix differs. Same requirement cause as TC-LOGIN-002/003, recorded against the questions rather than as a duplicate bug. Not a bug. |
| TC-LOGIN-007 | Failed | RequirementIssue | Expected text depends on open question Q-01, which explicitly also covers the SD-03 locked-out message. Screenshots TC-LOGIN-007-s3.png and -s4.png show locked_out_user kept on the login page (Products page not opened, step 3 passed, so the IM-02 security behaviour held) with "Epic sadface: Sorry, this user has been locked out."; expected is the SD-03 AC as written, without the prefix. Only the prefix differs. Not a bug and not a regression. The 2 console errors are 401 responses from the third-party telemetry host events.backtrace.io (outside the approved hosts, not the login form, no visible effect): no product evidence, not filed. The session-username=locked_out_user cookie seen after the rejected login is a note, not an asserted step: listed as an observation for follow-up in bugs-summary.md, not filed. |
## Requirement issues (to the PO, not to the developers)

| Question | Status | Findings that rest on it | What the answer decides |
|---|---|---|---|
| Q-01 (High, PO) | Open | TC-LOGIN-002, TC-LOGIN-003, TC-LOGIN-004, TC-LOGIN-007 | Whether AC-2, AC-3 and the SD-03 locked-out message carry the "Epic sadface: " prefix. The live site shows the prefix on every login error (AC-1 too, TC-LOGIN-001 passed with it). If the PO answers "all messages carry the prefix", the four expected results are corrected by stage 3 and re-run; if the answer is "without the prefix", the four become Medium bugs (wrong error text) to be filed then, with these screenshots as evidence. |
| Q-02 (Medium, PO) | Open | TC-LOGIN-004 | Whether an unknown username is covered by AC-3 ("wrong details") and gets the same message. |

## Observations for follow-up (not recorded results, not filed)

These come from notes and screenshots, not from an asserted step. No bug is filed without a recorded result.

1. **session-username cookie set for a rejected locked-out login** (TC-LOGIN-007 note). After the locked_out_user login was rejected, the cookie `session-username=locked_out_user` was present (cleared at cleanup). The recorded result shows the user was correctly kept on the login page, so there is no evidence the cookie grants access. Follow-up: a new Impacted (IM-02, security) test case: after the rejected locked_out_user login, open https://www.saucedemo.com/inventory.html directly and expect to be sent back to the login page. If that page opens, it is a High bug (locked-out user gets in). Also a question to the Dev lead: should a rejected login set the session cookie at all?
2. **Console errors from third-party telemetry** (TC-LOGIN-007 note). Two 401 (Unauthorized) responses from events.backtrace.io (unique-events and summed-events submit). This host is outside the approved hosts and is not part of the login form; no visible effect. Not a product finding for SD-02; can be mentioned to the site owners as a misconfigured telemetry token if wanted.
3. **No-match error text overflows its banner** (screenshots TC-LOGIN-003-s4.png and TC-LOGIN-004-s4.png). The three-line message "Epic sadface: Username and password do not match any user in this service" is clipped at the top and bottom of the red error box at this viewport width; the text read from the page is complete. Not asserted by any case (no layout requirement). Follow-up: a layout check of the error banner, Low (cosmetic) if confirmed.
4. **Redirect message survived a reload** (TC-LOGIN-006 note). The message "Epic sadface: You can only access /inventory.html when you are logged in." from the TC-LOGIN-005 logout check was still shown after reloading the login page and had to be dismissed. Whether errors should persist is Q-04 (Open); no recorded result.

## Passed results with notes

TC-LOGIN-001, TC-LOGIN-005 and TC-LOGIN-006 passed with the note "console error: 0 JS errors": nothing to triage.
