# Impact analysis method

Goal: list every module or story this story can break, rank them, and give test design a reason and a focus
for each. Critical and High impacts MUST get regression test cases (`scope: Impacted`) at stage 3.

## Where impacts come from
| Relation | Look at |
|---|---|
| `depends-on` | Stories in the epic `Depends On` column of this story. A change here may expose a broken base. |
| `downstream` | Stories whose `Depends On` names this story. They inherit any change. |
| `shared-component` | Same form, page, button, header, menu, cart badge, API (e.g. the login form serves SD-02 and SD-03). |
| `shared-data` | Same account, cart, order, session or storage. |
| `same-page` | Other features on the page the story changes. |
| `regression-area` | Anything the story text, notes or the epic's bug hints name as fragile. |

## Scoring
- **Likelihood (L)**: 3 = the story directly changes it or the same component; 2 = shares data/flow; 1 = only indirectly.
- **Severity (S)**: 3 = blocks a core flow (login, checkout, payment, data loss, security); 2 = a feature is wrong but there is a workaround; 1 = cosmetic.
- **Score = L x S**. Level: **9 Critical**, **6 High**, **3-4 Medium**, **1-2 Low**.

## Evidence
Every impact carries `evidence` (an exact quote from the epic, the story or an input file) or a `question`
(a `Q-xx` asking whether the link exists). Never both empty. Never invent a link.

## Entry format (`<ID>-impact.json`)
```json
{ "id": "IM-01", "module": "SD-01 Log in", "storyRef": "SD-01", "relation": "shared-component",
  "likelihood": 3, "severity": 3, "score": 9, "level": "Critical",
  "evidence": "SD-02 ... Depends On SD-01", "question": null,
  "why": "The error handling sits on the same login form; a change can break a valid login.",
  "testFocus": "standard_user still reaches Products after the error cases" }
```
`storyRef` is the epic story id the graph colours. Leave it out for a module that is not a story.
