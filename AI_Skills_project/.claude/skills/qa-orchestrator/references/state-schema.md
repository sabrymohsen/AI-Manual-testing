# `pipeline-state.json`

| Field | Meaning |
|---|---|
| `runId` | Folder name `<STORY-ID>_<Story-name>_<Epic-name>_<date>` (re-runs `-v2`, `-v3`) |
| `sample` | SAMPLE run: labelled everywhere, never posted |
| `story` | `{ id, title }` |
| `epic` | `{ name, file }` |
| `config` | `{ baseUrl, approvedHosts[], scope, headed, dashboard }` agreed with the user |
| `stages.<stage>` | `{ status, agent, startedAt, completedAt, errors[] }`; status: Pending, InProgress, Done, Failed, Waiting |
| `gate` | `{ decision: Ready/Override/Wait, conditions, by, why, words, at, noticeShownFirst }` |
| `posted[]` | `{ at, what, target, approvedBy }`: every item that left the machine, with the approver |
| `notes[]` | `{ at, text }`: cleanup facts, data left behind, anything the summary must say |

Stages in order: `analysis`, `gate`, `testcases`, `execution`, `bugs`, `report`, `summary`. A stage can only start or
complete when every earlier stage is Done.
