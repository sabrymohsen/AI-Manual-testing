# Design techniques

Pick the technique per condition and record it in `technique`.

| Technique | Use for | Example |
|---|---|---|
| EP (equivalence partitioning) | One case per class of input that behaves the same | valid user / unknown user / locked user |
| BVA (boundary values) | Lengths, amounts, counts | empty, 1 char, max, max+1 |
| Decision table | Several inputs combine into one outcome | username empty x password empty -> which message wins? |
| State transition | Flows with states | logged out -> logged in -> logged out; Back button after logout |
| Error guessing | Known fragile spots, the epic's bug hints | spaces only, leading space, letters in a card field |
| Regression (impact) | Every Critical/High impact | the happy path of the impacted story still works |

## Positive / negative / boundary per AC
For each AC write at least the condition it states. Add the negative and boundary conditions it implies,
but only when the expected result is known. Unknown expected result = a question, and the case is Blocked.

## Impacted cases
- Source: the impact's `testFocus` and `why`.
- Check that the impacted feature still behaves as its own story says (quote that story's AC from the epic).
- Keep them short: the shortest path to the impacted behaviour.

## Priority
- P1: an AC's main outcome, every Critical impact, anything security or money.
- P2: other negative/boundary cases, High impacts.
- P3: usability, cosmetic, Medium/Low impacts.

## Writing steps
- One action per step, in user words: "Enter `standard_user` in **Username**".
- Expected text in quotes, exactly as the source gives it: `The error says exactly "Epic sadface: Username is required"`.
- State checks are observable: "The **Products** title is visible", "The cart badge shows 1".
- Never write selectors or code. The execution agent finds elements through `playwright-cli snapshot`.
