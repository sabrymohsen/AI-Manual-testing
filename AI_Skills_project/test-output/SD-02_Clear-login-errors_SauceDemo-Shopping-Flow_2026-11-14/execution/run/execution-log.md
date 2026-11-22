# Execution log: TS-LOGIN-001 (SD-02)

> TESTER OVERRIDE. The readiness gate was not met. See gate/.

- Base URL: https://www.saucedemo.com
- Approved hosts: saucedemo.com
- Session: `qa-sd-02-20261115-000907-9b93`
- Mode: headed

## Events
- 2026-11-14T22:09:07.081Z START session=qa-sd-02-20261115-000907-9b93
- 2026-11-14T22:09:28.012Z BEGIN TC-LOGIN-001 attempt=1
- 2026-11-14T22:10:21.554Z STEP TC-LOGIN-001#1 pass: Username field left empty (value "")
- 2026-11-14T22:10:21.682Z STEP TC-LOGIN-001#2 pass: Password field filled with secret_sauce
- 2026-11-14T22:10:21.813Z STEP TC-LOGIN-001#3 pass: Still on https://www.saucedemo.com/ with the Login form and Login button shown; no Products title on the page
- 2026-11-14T22:10:21.931Z STEP TC-LOGIN-001#4 pass: Visible error text: "Epic sadface: Username is required"
- 2026-11-14T22:10:28.094Z END TC-LOGIN-001 Passed
- 2026-11-14T22:10:28.206Z BEGIN TC-LOGIN-002 attempt=1
- 2026-11-14T22:11:06.159Z STEP TC-LOGIN-002#1 pass: Username field filled with standard_user
- 2026-11-14T22:11:06.297Z STEP TC-LOGIN-002#2 pass: Password field left empty (value "")
- 2026-11-14T22:11:06.526Z STEP TC-LOGIN-002#3 pass: Still on https://www.saucedemo.com/ with the Login form and Login button shown; no Products title on the page
- 2026-11-14T22:11:06.708Z STEP TC-LOGIN-002#4 fail: Visible error text: "Epic sadface: Password is required" (expected exactly "Password is required"; live text has the extra "Epic sadface: " prefix)
- 2026-11-14T22:11:21.597Z END TC-LOGIN-002 Failed (Step 4: error text is "Epic sadface: Password is required", expected exactly "Password is required" (AC-2 as written; Q-01 open))
- 2026-11-14T22:11:21.715Z BEGIN TC-LOGIN-003 attempt=1
- 2026-11-14T22:12:05.089Z STEP TC-LOGIN-003#1 pass: Username field filled with standard_user
- 2026-11-14T22:12:05.221Z STEP TC-LOGIN-003#2 pass: Password field filled with wrong_pass_123
- 2026-11-14T22:12:05.336Z STEP TC-LOGIN-003#3 pass: Still on https://www.saucedemo.com/ with the Login form and Login button shown; no Products title on the page
- 2026-11-14T22:12:05.451Z STEP TC-LOGIN-003#4 fail: Visible error text: "Epic sadface: Username and password do not match any user in this service" (expected exactly "Username and password do not match any user in this service"; live text has the extra "Epic sadface: " prefix)
- 2026-11-14T22:12:18.755Z END TC-LOGIN-003 Failed (Step 4: error text is "Epic sadface: Username and password do not match any user in this service", expected exactly "Username and password do not match any user in this service" (AC-3 as written; Q-01 open))
- 2026-11-14T22:12:18.904Z BEGIN TC-LOGIN-004 attempt=1
- 2026-11-14T22:13:07.175Z STEP TC-LOGIN-004#1 pass: Username field filled with qa_unknown_user_x1
- 2026-11-14T22:13:07.313Z STEP TC-LOGIN-004#2 pass: Password field filled with secret_sauce
- 2026-11-14T22:13:07.422Z STEP TC-LOGIN-004#3 pass: Still on https://www.saucedemo.com/ with the Login form and Login button shown; no Products title on the page
- 2026-11-14T22:13:07.547Z STEP TC-LOGIN-004#4 fail: Visible error text: "Epic sadface: Username and password do not match any user in this service" (expected exactly "Username and password do not match any user in this service"; live text has the extra "Epic sadface: " prefix)
- 2026-11-14T22:13:09.017Z END TC-LOGIN-004 Failed (Step 4: error text is "Epic sadface: Username and password do not match any user in this service", expected exactly "Username and password do not match any user in this service" (AC-3 as written; Q-01, Q-02 open))
- 2026-11-14T22:13:13.991Z BEGIN TC-LOGIN-005 attempt=1
- 2026-11-14T22:13:53.645Z STEP TC-LOGIN-005#1 pass: Username field filled with standard_user
- 2026-11-14T22:13:53.783Z STEP TC-LOGIN-005#2 pass: Password field filled with secret_sauce
- 2026-11-14T22:13:53.899Z STEP TC-LOGIN-005#3 pass: Navigated to https://www.saucedemo.com/inventory.html; no [data-test=error] element and no login error message on the page
- 2026-11-14T22:13:54.023Z STEP TC-LOGIN-005#4 pass: Products page open: title text "Products" is visible (inventory.html)
- 2026-11-14T22:14:02.396Z END TC-LOGIN-005 Passed
- 2026-11-14T22:14:27.165Z BEGIN TC-LOGIN-006 attempt=1
- 2026-11-14T22:16:00.586Z STEP TC-LOGIN-006#1 pass: Username field left empty (value ""). Precondition note: a leftover redirect message from the TC-LOGIN-005 logout check was dismissed with the Dismiss error button (f10e20) before the case started
- 2026-11-14T22:16:00.720Z STEP TC-LOGIN-006#2 pass: Password field filled with secret_sauce
- 2026-11-14T22:16:00.852Z STEP TC-LOGIN-006#3 pass: Still on https://www.saucedemo.com/ (Login button shown, no Products title); visible error text: "Epic sadface: Username is required"
- 2026-11-14T22:16:00.978Z STEP TC-LOGIN-006#4 pass: Password cleared; both Username and Password values are ""
- 2026-11-14T22:16:01.090Z STEP TC-LOGIN-006#5 pass: Username field filled with standard_user
- 2026-11-14T22:16:01.230Z STEP TC-LOGIN-006#6 pass: Password field filled with secret_sauce
- 2026-11-14T22:16:01.407Z STEP TC-LOGIN-006#7 pass: Navigated to https://www.saucedemo.com/inventory.html; title "Products" is visible
- 2026-11-14T22:16:09.512Z END TC-LOGIN-006 Passed
- 2026-11-14T22:16:21.553Z BEGIN TC-LOGIN-007 attempt=1
- 2026-11-14T22:17:02.169Z STEP TC-LOGIN-007#1 pass: Username field filled with locked_out_user
- 2026-11-14T22:17:02.339Z STEP TC-LOGIN-007#2 pass: Password field filled with secret_sauce
- 2026-11-14T22:17:02.494Z STEP TC-LOGIN-007#3 pass: Still on https://www.saucedemo.com/ with the Login form and Login button shown; no Products title on the page
- 2026-11-14T22:17:02.659Z STEP TC-LOGIN-007#4 fail: Visible error text: "Epic sadface: Sorry, this user has been locked out." (expected exactly "Sorry, this user has been locked out."; live text has the extra "Epic sadface: " prefix)
- 2026-11-14T22:17:04.801Z END TC-LOGIN-007 Failed (Step 4: error text is "Epic sadface: Sorry, this user has been locked out.", expected exactly "Sorry, this user has been locked out." (SD-03 AC as written; Q-01 open))
- 2026-11-14T22:17:26Z NOTE TC-LOGIN-007 corrected: the end note first said 0 JS errors, written before the console output was read in full. The console showed 2 errors (401 from events.backtrace.io telemetry). Only the note field was changed.
- 2026-11-14T22:17:35.994Z FINISH total=7 passed=3 failed=4 error=0 flaky=0 blocked=0 skipped=0 notRun=0

## Reminder
Close the browser session: `playwright-cli -s=qa-sd-02-20261115-000907-9b93 close`
