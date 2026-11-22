<!-- DRAFT. Not sent. Only the user sends this, from their own mail client. -->
**To:** <PO / BA>
**Subject:** [QA] 6 questions on SD-02 Clear login errors before test design

Hello team,

While analysing **SD-02 Clear login errors** for testing I found points the story does not answer. Test design for the affected cases is on hold until they are clarified, so a short answer to each one helps.

### High priority

**Q-01.** What is the exact expected text for AC-2 (empty password) and AC-3 (wrong details): with the prefix "Epic sadface: " like AC-1, or without it as written?
  _Why it matters:_ Expected results must be exact. Without the answer, AC-2 and AC-3 cannot pass or fail meaningfully. The same question applies to SD-03 (locked-out message), which shares the error area.
  _Possible answers:_ All messages carry "Epic sadface: " / Only AC-1 carries it (as written) / None carries it (AC-1 is a typo)

**Q-06.** Who are the PO, BA and Dev lead for EPIC 1, so the questions can be answered and recorded with a name?
  _Why it matters:_ The readiness gate needs answers from a named person; the story lists placeholders only.

### Medium priority

**Q-02.** Does AC-3 "Wrong details" cover a wrong username with a valid password, a valid username with a wrong password, and both wrong? Is the message the same for all three?
  _Why it matters:_ Decides how many AC-3 cases exist and their expected results. A different message per case would reveal which usernames exist (a security concern).
  _Possible answers:_ Same message for all three / Different messages

**Q-03.** When both username and password are empty, which message is expected: the username message (AC-1), the password message (AC-2), or both?
  _Why it matters:_ A common case with no defined result; without it the case is Blocked.
  _Possible answers:_ Username message only / Password message only / Both

### Low priority

**Q-04.** After a login error, should the typed inputs be kept or cleared, should the error be dismissible (e.g. an X button), and should the fields be highlighted?
  _Why it matters:_ Defines the after-error state; currently untestable.

**Q-05.** Does a username made only of spaces count as empty (AC-1 message)? Is the password comparison case sensitive ("Secret_Sauce" -> AC-3 message)?
  _Why it matters:_ Boundary cases; the expected results are not stated.

You can reply inline under each question id.

Thank you,
<QA name>
