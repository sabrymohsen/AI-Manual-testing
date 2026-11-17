---
name: test-case-design
description: Design manual test cases for a feature, requirement, user story or page using formal techniques (equivalence partitioning, boundary values, decision tables, state transitions, pairwise, error guessing). Use when asked to write, generate, review or improve test cases, test scenarios or acceptance tests, or to find coverage gaps.
---

# Test case design

Goal: the smallest set of test cases that would catch the bugs that matter. Every case
must be runnable by someone who has never seen the feature.

## 1. Understand what's under test
- Read the source: the story/requirement/BRD text, the page itself (open it in the
  browser if it's reachable), and the code behind it (`src/app/...`, the API route,
  the Prisma model) for the real rules: validation, limits, roles, statuses.
- Write down, before any case: inputs and their rules, outputs, states, roles and
  permissions, integrations, and what "done" means. Ask only about rules you can't find.

## 2. Derive cases with techniques (use what fits, name it in the case)
| Technique | Use for | How |
|---|---|---|
| Equivalence partitioning | any input | one case per valid class and per invalid class |
| Boundary value analysis | ranges, lengths, counts, dates | min-1, min, min+1, max-1, max, max+1 |
| Decision table | business rules with several conditions | one column per rule combination that changes the outcome |
| State transition | statuses/workflows (bug status, sprint, session) | every valid transition + the important invalid ones |
| Pairwise | many independent options (browser × role × locale) | cover every pair, not every combination |
| Use case / flow | end-to-end user journeys | happy path, alternate paths, exception paths |
| Error guessing | anything | empty, whitespace, very long, unicode/RTL/emoji, HTML/script text, duplicates, double-click, back button, refresh mid-flow, slow network, session expiry, two tabs |

Always cover: permissions (each role, and logged out), persistence (reload shows it),
and negative paths. Don't pad: drop cases that exercise the same partition.

## 3. Write each case in QA Engine's shape
Matches the `TestCase` / `TestStep` models so it can be saved in the app as-is:
- **title**: `<Feature> – <condition> – <expected outcome>` (e.g. "Login – empty password – shows required message")
- **priority**: `Critical` | `High` | `Medium` | `Low` (Critical = blocks core use or loses data; High = main flow broken; Medium = secondary flow or workaround exists; Low = cosmetic)
- **preconditions**: user/role, data that must exist, starting page
- **testData**: exact values, never "some valid email"
- **steps**: numbered; each has one **action** and one observable **expected result**
- **tags**: feature, technique (`bva`, `negative`, `smoke`, `regression`)
- **executionType**: `Manual`, or `Automated` if it's stable and repeated (see test-automation-strategy)

## 4. Output
A table or list grouped by area, each case tagged with its technique, then a short
**coverage note**: what's covered, what's deliberately out of scope, open questions.
If the user wants them in the app, create them through the project's test cases
(UI or `/api/projects/[projectId]/test-cases`), not by writing to the database.
