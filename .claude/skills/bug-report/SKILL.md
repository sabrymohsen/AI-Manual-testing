---
name: bug-report
description: Write a clear, reproducible bug report (title, steps, expected vs actual, severity, priority, environment, evidence) and optionally file it in QA Engine. Use when a defect is found, when asked to write/improve/triage a bug report, or to rate severity and priority.
---

# Bug report

## Before writing
1. **Reproduce** it at least twice from a clean start; find the minimum steps.
2. **Isolate**: does it happen on another browser, role, data set, or only after a
   specific previous action? Is it the frontend (console error) or backend (4xx/5xx in
   network, server log)?
3. **Search for duplicates** in the project's bug reports first.

## Fields (match QA Engine's `BugReport`)
- **Title**: `[Area] What's wrong + where/when` — e.g. "[Login] Blank page after submitting empty password". No "doesn't work", no "bug in".
- **Environment**: `Dev` | `Staging` | `UAT` | `Production`, plus URL, browser + version, OS, screen size, role used, build/commit if known.
- **Preconditions**: account/role, data that must exist.
- **Steps to reproduce**: numbered, one action each, exact data values.
- **Expected result**: per spec/requirement (cite it), or common-sense behaviour.
- **Actual result**: what happened, verbatim error messages.
- **Reproducibility**: always / N of M tries / once.
- **Evidence**: screenshot with the problem highlighted, console errors, failing
  request (method, URL, status, response snippet), video for timing issues.
- **Severity** (impact) and **Priority** (urgency), each `Critical | High | Medium | Low`:
  | Severity | Meaning |
  |---|---|
  | Critical | crash, data loss/corruption, security hole, core flow blocked with no workaround |
  | High | major feature broken or wrong result; workaround is painful |
  | Medium | feature partly wrong; reasonable workaround |
  | Low | cosmetic, typo, minor layout |
  Priority adds business context (release date, how many users, customer-facing).
- **Links**: test case / test run / requirement it fails, related bugs.

## Rules
- One bug per report. Facts, not blame or guesses; put a suspected cause under a
  separate "Notes" line, marked as a guess.
- Strip secrets and personal data from logs and screenshots.
- To file it: use the app's bug report form or Live QA's bug button (both run the
  validated API and tracker sync), not direct database writes. Syncing to
  Jira/Azure DevOps/ClickUp/OpenProject publishes it: confirm with the user first.
