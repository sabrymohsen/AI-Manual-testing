<!-- DRAFT. Not sent. Shown to the user together with the analysis, before any gate question. -->
# Blocking notice: SD-02 Clear login errors

Test design for **SD-02** is blocked until the readiness gate is met.

| Gate condition | State |
|---|---|
| 1. All requirement questions answered | **Not met** (6 open) |
| 2. Requirement clear | **Not met** |
| 3. Jira updated with the answers | **Not met** |
| 4. Stakeholder email updated | **Not met** |

## Open questions

- **Q-01** [High] What is the exact expected text for AC-2 (empty password) and AC-3 (wrong details): with the prefix "Epic sadface: " like AC-1, or without it as written?
- **Q-02** [Medium] Does AC-3 "Wrong details" cover a wrong username with a valid password, a valid username with a wrong password, and both wrong? Is the message the same for all three?
- **Q-03** [Medium] When both username and password are empty, which message is expected: the username message (AC-1), the password message (AC-2), or both?
- **Q-04** [Low] After a login error, should the typed inputs be kept or cleared, should the error be dismissible (e.g. an X button), and should the fields be highlighted?
- **Q-05** [Low] Does a username made only of spaces count as empty (AC-1 message)? Is the password comparison case sensitive ("Secret_Sauce" -> AC-3 message)?
- **Q-06** [High] Who are the PO, BA and Dev lead for EPIC 1, so the questions can be answered and recorded with a name?

## What this means

- No test cases are designed or run for this story until the conditions are met, or the tester records an override.
- An override is the tester's decision, in their own words, with who and why recorded. Every suite, result, report and bug from an override carries a "Tester override" label and is never posted.

Analysis: `analysis/SD-02-result.md`. Email draft and Jira comment draft are in `analysis/` (not sent, not posted).
