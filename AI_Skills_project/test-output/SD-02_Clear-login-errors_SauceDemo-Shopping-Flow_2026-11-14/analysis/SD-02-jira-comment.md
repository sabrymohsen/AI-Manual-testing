QA requirement analysis for SD-02 Clear login errors

Clarity: Unclear. Open questions: 6. Answered: 0.

Open questions (test design for the affected cases is on hold):
- Q-01 [High] What is the exact expected text for AC-2 (empty password) and AC-3 (wrong details): with the prefix "Epic sadface: " like AC-1, or without it as written? (for PO)
- Q-02 [Medium] Does AC-3 "Wrong details" cover a wrong username with a valid password, a valid username with a wrong password, and both wrong? Is the message the same for all three? (for PO)
- Q-03 [Medium] When both username and password are empty, which message is expected: the username message (AC-1), the password message (AC-2), or both? (for PO)
- Q-04 [Low] After a login error, should the typed inputs be kept or cleared, should the error be dismissible (e.g. an X button), and should the fields be highlighted? (for BA)
- Q-05 [Low] Does a username made only of spaces count as empty (AC-1 message)? Is the password comparison case sensitive ("Secret_Sauce" -> AC-3 message)? (for BA)
- Q-06 [High] Who are the PO, BA and Dev lead for EPIC 1, so the questions can be answered and recorded with a name? (for Tester / project lead)

Impacted areas that will be regression tested:
- IM-01 SD-01 Log in: Critical
- IM-02 SD-03 Blocked user message: High

Please answer under each question id.
