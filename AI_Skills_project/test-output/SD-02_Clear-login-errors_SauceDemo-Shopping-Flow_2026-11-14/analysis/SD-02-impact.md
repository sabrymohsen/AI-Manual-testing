# Impact analysis: SD-02 Clear login errors

Epic: SauceDemo Shopping Flow  
Score = Likelihood x Severity (1-3 each). 9 Critical, 6 High, 3-4 Medium, 1-2 Low.
Every Critical and High impact must get at least one test case with scope "Impacted".

| ID | Module | Relation | L | S | Score | Level | Evidence / Question | Test focus |
|---|---|---|---|---|---|---|---|---|
| IM-01 | SD-01 Log in | depends-on | 3 | 3 | 9 | **Critical** | "SD-02 | ... | SD-01 | (Depends On); SD-01: "standard_user / secret_sauce opens the Products page"" | standard_user / secret_sauce still opens the Products page, including right after an error was shown |
| IM-02 | SD-03 Blocked user message | shared-component | 3 | 2 | 6 | **High** | "Linked tickets: ... related SD-03 (blocked user message); SD-03: "locked_out_user -> Sorry, this user has been locked out."" / Q-01 | locked_out_user / secret_sauce stays on the login page and sees the locked-out message (exact prefix depends on Q-01) |
| IM-03 | Shopping flow after login (SD-04 to SD-11) | regression-area | 1 | 3 | 3 | **Medium** | "Dependency Chain (test in this order): SD-01 → SD-04 → SD-06 → SD-07 → SD-08 → SD-09 → SD-10 → SD-11" | after a valid login the product list shows (covered by the IM-01 case reaching Products) |
| IM-04 | SD-12 Logout returns to the login page | same-page | 1 | 2 | 2 | **Low** | "SD-12: "Logout returns to the login page"" | after logout, submitting an empty username still shows the AC-1 message |
