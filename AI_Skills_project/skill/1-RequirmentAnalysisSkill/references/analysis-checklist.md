# Analysis checklist

Walk every acceptance criterion through each row. A "no" or "not stated" becomes a gap (`G-xx`) and, if a
person must decide it, a question (`Q-xx`). Never fill the hole yourself.

| Area | Ask |
|---|---|
| Actor and role | Who does this? Are other roles allowed, blocked, or not mentioned? |
| Preconditions | What state must exist first (logged in, cart has items, account exists)? Who creates the test data? |
| Inputs | Which fields? Required or optional? Type, length, format, allowed characters? Leading/trailing spaces? Case? |
| Boundaries | Min, max, empty, one character, very long, zero, negative, special characters, unicode |
| Outputs | Exactly what is shown? Where? Exact wording, including prefixes, punctuation and case? |
| Messages | Error, success, warning text. One message or several at once? Which wins when two rules break? |
| States and flow | What happens after: redirect, stay, reload, clear fields, keep fields? Back button? Refresh? |
| Errors | Server error, timeout, offline: is any behaviour defined? |
| Dependencies | Which stories does this depend on (epic `Depends On`)? Which depend on it? |
| Data | Is data created, changed, deleted? Is it shared with other users (public demo sites)? Cleanup? |
| Non-functional | Performance, accessibility, security, browsers, mobile. Stated or out of scope? |
| Environment | URL, test accounts, credentials (fake only), approved hosts |
| Testability | Can every outcome be observed in the browser? If not, how is it verified? |

## Question format (`<ID>-questions.json`)
```json
{ "id": "Q-01", "question": "The AC for empty username includes the prefix \"Epic sadface: \" but the other two do not. Which exact text is expected for each case?",
  "why": "Expected results must be exact; otherwise a pass means nothing.", "gap": "G-01", "ac": "AC-1",
  "askTo": "PO", "priority": "High", "options": ["All three carry the prefix", "Only AC-1"],
  "status": "Open", "answer": null, "answeredBy": null, "answeredAt": null, "source": null }
```
- `priority`: High = blocks a test case; Medium = changes an expected result; Low = nice to know.
- Mark `Answered` only with an `answer` and a named `answeredBy` (and `source`: email, Jira, meeting).

## Clarity
- `Clear`: every question Answered, every AC has an observable outcome and exact expected text.
- `Unclear`: anything else.

## Gate flags (the readiness gate, decided by the user at stage 2)
1. All questions answered.  2. Requirement clear.  3. Jira updated with the answers (`jiraUpdated`).
4. Stakeholder email updated (`emailUpdated`). You set the flags to `true` only when the user tells you it happened.
