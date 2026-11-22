---
name: requirement-analysis
description: Stage 1 of the QA pipeline. Analyse one user story inside its epic for testability - split the acceptance criteria, find gaps, write questions (never assumed answers), rank the modules the story impacts (Likelihood x Severity) and draw the epic impact graph - then draft the stakeholder email and the Jira comment. Use when a story or epic from test-input/ (or a Jira issue) must be analysed before test design. Run by the requirements-analyst agent.
---

# Requirement Analysis (stage 1)

## Role
You read one story and its epic and decide what is known, what is not, and what else the story can break.
You write findings, questions and drafts. You never decide the readiness gate (the user does, at stage 2),
never send an email, never post to Jira, and never invent an answer.

## Inputs
- The story file `test-input/<ID>-story.md` and its epic `test-input/EPIC_<n>_<Name>.md` (the epic table
  `| ID | User Story | Acceptance Criteria | Depends On | Status |` is what the impact graph reads).
  No story file but the epic has the row? Extract it into `test-input/<ID>-story.md` with `templates/story-template.md`
  (copy the row's wording exactly; do not improve it).
- Any other file the user put in `test-input/` (specs, notes, mock-ups). Read them all; cite what you use.
- Optional: a Jira issue, read through `node .claude/skills/qa-orchestrator/scripts/jira.js read --key <KEY> --out test-input/<ID>-story.md`
  (a read; the user configures Jira in `.env`), or with an Atlassian MCP read tool (issue get / JQL search) when the
  `atlassian` MCP server is connected. Keep the Jira wording exactly and note the source line.
- The run folder `<run>/analysis/` you write into (the orchestrator gives you the path).

## Rules
- **Never assume.** Unknown means a question (`Q-xx`), never an invented answer or an invented message text.
- Quote the source for every acceptance criterion, gap and impact. No quote, no claim: write a question instead.
- If the live site differs from the story (you may look, read-only, with `playwright-cli`; see skill 3's reference),
  record it as an **observation** (`<ID>-observations.md`) and a question. An observation never replaces a requirement.
- A story is `Clear` only when every question is Answered by a named person. Otherwise it is `Unclear`.
- Everything you write is a draft. Label SAMPLE work `SAMPLE` in every file.

## Procedure
1. **Lint.** `node skill/1-RequirmentAnalysisSkill/scripts/story_lint.js test-input/<ID>-story.md`
   Every finding becomes a gap (`G-xx`) or a question, or you note why it does not apply.
2. **Acceptance criteria.** Number them `AC-1..n` exactly as written. For each: the observable outcome, the
   exact expected text (if any), the test data needed, and what is missing.
3. **Gaps and questions.** Use `references/analysis-checklist.md` (inputs, outputs, messages, states, roles,
   boundaries, errors, non-functional, data, environment). Write `<ID>-questions.json` from
   `templates/questions-template.json`: `clarity`, `jiraUpdated: false`, `emailUpdated: false`, `gaps[]`, `questions[]`
   (each `Open` until a named person answers it).
4. **Impact analysis.** Follow `references/impact-method.md`. Write `<ID>-impact.json` from `templates/impact-template.json`,
   then check it: `node skill/1-RequirmentAnalysisSkill/scripts/build_impact.js <run>/analysis/<ID>-impact.json --check --questions <run>/analysis/<ID>-questions.json --md <run>/analysis/<ID>-impact.md`
   (`--fix` recomputes score and level from L and S).
5. **Impact graph.** `node skill/1-RequirmentAnalysisSkill/scripts/build_epic_graph.js test-input/EPIC_<n>_<Name>.md --impact <run>/analysis/<ID>-impact.json --story <ID> --out <run>/analysis/<EPIC>-<ID>-graph.html`
   (`<EPIC>` is the epic's short name, e.g. `EPIC_1`).
6. **Drafts.**
   - `node skill/1-RequirmentAnalysisSkill/scripts/build_email.js <run>/analysis/<ID>-questions.json --story "<ID> <title>" --out <run>/analysis/<ID>-email-draft.md`
   - `node skill/1-RequirmentAnalysisSkill/scripts/build_jira_comment.js <run>/analysis/<ID>-questions.json --impact <run>/analysis/<ID>-impact.json --out <run>/analysis/<ID>-jira-comment.md`
7. **Report.** Write `<ID>-result.md` from `templates/result-template.md`. It must have the sections
   Acceptance criteria, Gaps, Questions, Impact, Readiness. The Readiness section lists the four gate conditions
   with their current state and says plainly that the gate is the user's decision.
8. **Validate.** `node skill/1-RequirmentAnalysisSkill/scripts/validate_analysis.js <run>/analysis --story <ID>`. Fix until VALID.

## Output (in `<run>/analysis/`)
| File | Content |
|---|---|
| `<ID>-result.md` | The analysis report |
| `<ID>-questions.json` | Clarity, gate flags, gaps, questions |
| `<ID>-impact.json`, `<ID>-impact.md` | Impact list and matrix |
| `<EPIC>-<ID>-graph.html` | Epic dependency graph coloured by impact |
| `<ID>-email-draft.md`, `<ID>-jira-comment.md` | Drafts, never sent |
| `<ID>-observations.md` | Only if you looked at the live site |

Hand back: the clarity, the number of open questions (by priority), the Critical/High impacts, and the file list.

## Resources
| File | Read when |
|---|---|
| `references/analysis-checklist.md` | Step 3, finding gaps |
| `references/impact-method.md` | Step 4 |
| `references/examples/SD-02-example.md` | Before your first analysis: a finished example |
| `templates/*` | Blank formats for every output |
