# Suite schema (`<ID>-testcases.json`)

| Field | Required | Meaning |
|---|---|---|
| `suiteId` | yes | `TS-<AREA>-<nnn>` |
| `storyId`, `storyTitle`, `epic` | yes | From the analysis |
| `baseUrl` | yes | The URL the user gave the orchestrator |
| `approvedHosts` | no | Hosts execution may visit (default: the base URL host) |
| `sample` | yes | `true` only for SAMPLE suites |
| `override` | yes | `true` when the user overrode the gate |
| `overrideNote` | if override | `"<who>, <date>: <why, in their words>"` |
| `observationDerived` | yes | `true` if any expected result is from observation |
| `analysisRef` | no | Path of `<ID>-result.md` |
| `acceptanceCriteria` | yes | `[{ "id": "AC-1", "text": "..." }]`, as in the analysis |
| `testCases` | yes | Below |

## Test case
| Field | Required | Meaning |
|---|---|---|
| `id` | yes | `TC-<AREA>-<nnn>`, unique |
| `title` | yes | What it proves, short |
| `scope` | yes | `Target` (the story) or `Impacted` (a module the story affects) |
| `acRef` | Target | `["AC-1"]` |
| `impactRef` | Impacted | `"IM-01"` |
| `type` | no | Positive, Negative, Boundary, Regression, Usability, Security, Accessibility, Performance |
| `technique` | no | EP, BVA, Decision table, State transition, Error guessing, Regression |
| `priority` | yes | P1, P2, P3 |
| `status` | yes | `Ready` (runs), `Blocked` (never runs, needs `blockedReason`), `Draft` (not runs) |
| `blockedReason` | Blocked | Why, with the question id |
| `questionRef` | no | `["Q-01"]` open or answered questions the case depends on |
| `preconditions` | no | `["On the login page, logged out"]` |
| `testData` | no | `{ "username": "standard_user" }` - synthetic only |
| `steps` | yes | `[{ "action": "...", "expected": "..." }]`, `expected` may be `""` for a pure action, never on the last step |
| `expectedResult` | yes | The final outcome, exact |
| `expectedSource` | no | `requirement` (default) or `observation` |
| `cleanup` | no | What to undo after the case |
