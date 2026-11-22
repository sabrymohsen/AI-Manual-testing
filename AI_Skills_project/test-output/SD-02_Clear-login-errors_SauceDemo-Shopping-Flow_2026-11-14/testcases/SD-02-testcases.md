# Test cases: SD-02 Clear login errors

> **TESTER OVERRIDE.** The readiness gate was not met. Tester (the user), 2026-11-15 (gate recorded 2026-11-14T22:04:39Z): "Run the full testing cycle now, before the PO answers the 6 open questions". User's words: "Override and run now; run in headed mode". Q-01 to Q-06 stay Open; expected results follow the acceptance criteria as written. Labelled TESTER OVERRIDE, never posted.

- Suite: `TS-LOGIN-001`  Epic: SauceDemo Shopping Flow  Base URL: https://www.saucedemo.com
- Cases: 7 (Target 4, Impacted 3). Ready 7, Blocked 0, Draft 0

| ID | Title | Scope | Ref | Type | Priority | Status |
|---|---|---|---|---|---|---|
| TC-LOGIN-001 | Empty username shows the username-required error | Target | AC-1 | Negative | P1 | Ready |
| TC-LOGIN-002 | Empty password shows the password-required error | Target | AC-2 | Negative | P1 | Ready |
| TC-LOGIN-003 | Wrong password for standard_user shows the no-match error | Target | AC-3 | Negative | P1 | Ready |
| TC-LOGIN-004 | Unknown username shows the no-match error | Target | AC-3 | Negative | P2 | Ready |
| TC-LOGIN-005 | Valid standard_user login still opens the Products page | Impacted | IM-01 | Regression | P1 | Ready |
| TC-LOGIN-006 | Valid login right after a login error still opens the Products page | Impacted | IM-01 | Regression | P1 | Ready |
| TC-LOGIN-007 | locked_out_user stays on the login page with the locked-out message | Impacted | IM-02 | Security | P1 | Ready |

## TC-LOGIN-001 Empty username shows the username-required error

- Scope: **Target**  AC: AC-1
- Type: Negative  Technique: EP  Priority: P1  Status: **Ready**
- Preconditions: Logged out; The login page https://www.saucedemo.com is open with empty Username and Password fields
- Test data: username = ``, password = `secret_sauce`

| # | Action | Expected |
|---|---|---|
| 1 | Leave the **Username** field empty |  |
| 2 | Enter `secret_sauce` in **Password** |  |
| 3 | Click **Login** | The login page is still shown (the **Products** page does not open) |
| 4 | Read the error message on the login form | The error says exactly "Epic sadface: Username is required" |

**Expected result:** The user stays on the login page and the error says exactly "Epic sadface: Username is required"

## TC-LOGIN-002 Empty password shows the password-required error

- Scope: **Target**  AC: AC-2
- Type: Negative  Technique: EP  Priority: P1  Status: **Ready**
- Questions: Q-01
- Preconditions: Logged out; The login page https://www.saucedemo.com is open with empty Username and Password fields; TESTER OVERRIDE: Q-01 (prefix "Epic sadface: " or not) is Open; the expected text is AC-2 exactly as written
- Test data: username = `standard_user`, password = ``

| # | Action | Expected |
|---|---|---|
| 1 | Enter `standard_user` in **Username** |  |
| 2 | Leave the **Password** field empty |  |
| 3 | Click **Login** | The login page is still shown (the **Products** page does not open) |
| 4 | Read the error message on the login form | The error says exactly "Password is required" |

**Expected result:** The user stays on the login page and the error says exactly "Password is required"

## TC-LOGIN-003 Wrong password for standard_user shows the no-match error

- Scope: **Target**  AC: AC-3
- Type: Negative  Technique: EP  Priority: P1  Status: **Ready**
- Questions: Q-01, Q-02
- Preconditions: Logged out; The login page https://www.saucedemo.com is open with empty Username and Password fields; TESTER OVERRIDE: Q-01 (prefix) and Q-02 (which wrong-detail combinations AC-3 covers) are Open; the expected text is AC-3 exactly as written
- Test data: username = `standard_user`, password = `wrong_pass_123`

| # | Action | Expected |
|---|---|---|
| 1 | Enter `standard_user` in **Username** |  |
| 2 | Enter `wrong_pass_123` in **Password** |  |
| 3 | Click **Login** | The login page is still shown (the **Products** page does not open) |
| 4 | Read the error message on the login form | The error says exactly "Username and password do not match any user in this service" |

**Expected result:** The user stays on the login page and the error says exactly "Username and password do not match any user in this service"

## TC-LOGIN-004 Unknown username shows the no-match error

- Scope: **Target**  AC: AC-3
- Type: Negative  Technique: EP  Priority: P2  Status: **Ready**
- Questions: Q-01, Q-02
- Preconditions: Logged out; The login page https://www.saucedemo.com is open with empty Username and Password fields; TESTER OVERRIDE: Q-01 (prefix) and Q-02 (whether an unknown username counts as "wrong details") are Open; the expected text is AC-3 exactly as written
- Test data: username = `qa_unknown_user_x1`, password = `secret_sauce`

| # | Action | Expected |
|---|---|---|
| 1 | Enter `qa_unknown_user_x1` in **Username** |  |
| 2 | Enter `secret_sauce` in **Password** |  |
| 3 | Click **Login** | The login page is still shown (the **Products** page does not open) |
| 4 | Read the error message on the login form | The error says exactly "Username and password do not match any user in this service" |

**Expected result:** The user stays on the login page and the error says exactly "Username and password do not match any user in this service"

## TC-LOGIN-005 Valid standard_user login still opens the Products page

- Scope: **Impacted** (IM-01)
- Type: Regression  Technique: Regression  Priority: P1  Status: **Ready**
- Preconditions: Logged out; The login page https://www.saucedemo.com is open with empty Username and Password fields
- Test data: username = `standard_user`, password = `secret_sauce`

| # | Action | Expected |
|---|---|---|
| 1 | Enter `standard_user` in **Username** |  |
| 2 | Enter `secret_sauce` in **Password** |  |
| 3 | Click **Login** | No login error message is shown |
| 4 | Look at the page title area | The **Products** page is open (the **Products** title is visible) |

**Expected result:** standard_user / secret_sauce opens the **Products** page (SD-01 AC)

## TC-LOGIN-006 Valid login right after a login error still opens the Products page

- Scope: **Impacted** (IM-01)
- Type: Regression  Technique: State transition  Priority: P1  Status: **Ready**
- Preconditions: Logged out; The login page https://www.saucedemo.com is open with empty Username and Password fields
- Test data: username = `standard_user`, password = `secret_sauce`, firstAttemptUsername = ``, firstAttemptPassword = `secret_sauce`

| # | Action | Expected |
|---|---|---|
| 1 | Leave the **Username** field empty |  |
| 2 | Enter `secret_sauce` in **Password** |  |
| 3 | Click **Login** | The login page is still shown and the error says exactly "Epic sadface: Username is required" |
| 4 | Clear the **Password** field (whatever it contains after the error) and make sure **Username** is empty |  |
| 5 | Enter `standard_user` in **Username** |  |
| 6 | Enter `secret_sauce` in **Password** |  |
| 7 | Click **Login** | The **Products** page is open (the **Products** title is visible) |

**Expected result:** After an error was shown, standard_user / secret_sauce still opens the **Products** page (SD-01 AC)

## TC-LOGIN-007 locked_out_user stays on the login page with the locked-out message

- Scope: **Impacted** (IM-02)
- Type: Security  Technique: Regression  Priority: P1  Status: **Ready**
- Questions: Q-01
- Preconditions: Logged out; The login page https://www.saucedemo.com is open with empty Username and Password fields; TESTER OVERRIDE: Q-01 (prefix "Epic sadface: " or not, also for SD-03) is Open; the expected text is the SD-03 AC exactly as written
- Test data: username = `locked_out_user`, password = `secret_sauce`

| # | Action | Expected |
|---|---|---|
| 1 | Enter `locked_out_user` in **Username** |  |
| 2 | Enter `secret_sauce` in **Password** |  |
| 3 | Click **Login** | The login page is still shown (the **Products** page does not open) |
| 4 | Read the error message on the login form | The error says exactly "Sorry, this user has been locked out." |

**Expected result:** locked_out_user stays on the login page and the error says exactly "Sorry, this user has been locked out." (SD-03 AC)

