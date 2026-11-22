---
name: test-case-creation
description: Stage 3 of the QA pipeline. Design manual test cases for one user story AND the modules it impacts - Target cases for every acceptance criterion, Impacted (regression) cases for every Critical/High impact - as a JSON suite that the Playwright agent-cli execution stage runs, plus Markdown and CSV views. Use after requirement analysis, once the user has decided the readiness gate. Run by the test-designer agent.
---

# Test Case Creation (stage 3)

## Role
You turn the stage 1 analysis into executable, manual test cases: plain steps a person (or the execution
agent driving `playwright-cli`) can follow, each with an exact expected result. You write no automation code.

## Before you start (the orchestrator checks these; you check again)
- The gate is recorded in `<run>/pipeline-state.json`: `Ready`, or `Override` with who/why. Not decided → stop and say so.
- Read `<run>/analysis/<ID>-result.md`, `-questions.json`, `-impact.json`, and the story/epic in `test-input/`.

## Rules
- **Expected results come from the requirement**, quoted exactly. Never soften, round or "fix" one.
- A case that depends on an **Open** question is `Blocked` with `blockedReason` and `questionRef`, unless the
  user recorded an override. With an override the case can be `Ready`, the suite carries `override: true` and the
  `overrideNote`, and its expected result follows the AC as written (the question stays open).
- No business owner / thin AC and the expected result comes from what the site showed (an observation from stage 1)?
  Mark that case `expectedSource: "observation"` and the suite `observationDerived: true`. Never hide it.
- Every acceptance criterion gets at least one **Target** case (`acRef`). Every **Critical/High** impact gets at
  least one **Impacted** case (`impactRef`) that checks the impact's `testFocus`. Medium: add one when cheap. Low: optional.
- Respect the user's scope (number of cases) from the orchestrator. If the scope cannot cover every AC and every
  Critical/High impact, say so and ask; never silently drop coverage.
- Test data is synthetic. Use the epic's published demo users. Never a real card number, email or person.
  If a case creates data (account, order), add a cleanup step and say in `preconditions` what it leaves behind.
- Steps are user-level and observable ("Click **Login**", "The error says exactly: ..."). No CSS selectors, no code.
  One check per expected field; the last step always has the final expected result.

## Procedure
1. List the conditions: each AC split into positive / negative / boundary conditions (`references/design-techniques.md`).
2. List the Critical/High (then Medium) impacts with their `testFocus`.
3. Write `<run>/testcases/<ID>-testcases.json` from `templates/suite-template.json` (`references/suite-schema.md`).
   Ids: suite `TS-<AREA>-<nnn>`, cases `TC-<AREA>-<nnn>` (AREA = the feature, e.g. LOGIN, CART).
4. Validate:
   `node skill/2-TestCaseCreationSkill/scripts/validate_testcases.js <run>/testcases/<ID>-testcases.json --impact <run>/analysis/<ID>-impact.json --questions <run>/analysis/<ID>-questions.json`
   Fix until VALID. Save the output to `<run>/testcases/<ID>-validation.md`.
5. Render: `node skill/2-TestCaseCreationSkill/scripts/build_testcases.js <run>/testcases/<ID>-testcases.json --md <run>/testcases/<ID>-testcases.md --csv <run>/testcases/<ID>-testcases.csv`

## Output (in `<run>/testcases/`)
`<ID>-testcases.json` (the suite the execution stage runs), `.md`, `.csv`, `<ID>-validation.md`.
Hand back: counts (Target/Impacted, Ready/Blocked), the impact coverage list, and every case Blocked with its question.

## Resources
| File | Read when |
|---|---|
| `references/design-techniques.md` | Step 1 |
| `references/suite-schema.md` | Step 3, every field |
| `templates/suite-template.json` | Step 3, blank suite (one Target and one Impacted case) |
