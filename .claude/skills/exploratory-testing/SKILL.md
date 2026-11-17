---
name: exploratory-testing
description: Run a time-boxed, charter-based exploratory testing session on a web app or feature in a real browser, take notes, and report findings and bugs. Use when asked to explore, smoke-test, "play with", sanity-check, bug-hunt or manually test a page, feature or release.
---

# Exploratory testing

## 1. Charter (write it first, in one line)
"Explore **<area>** with **<resources: role, data, device, tool>** to discover **<information: risks>**."
Default time box: 30–45 minutes of interaction. Pick the riskiest area first: new code
(`git log`/diff), complex rules, money/data loss, permissions, integrations.

## 2. Drive a real browser
- Use the browser tools available (Claude in Chrome, the Playwright plugin, or
  chrome-devtools for console/network/performance). Start in a new tab.
- Keep the **console** and **network** open: every JS error, failed request (4xx/5xx),
  slow call (>2s) or duplicate request is a finding even if the UI looks fine.
- Local QA Engine: `http://localhost:3000` (see the `verify` skill for login and data).
  Only enter test credentials on local/test hosts.

## 3. Heuristics to vary what you do
- **SFDIPOT**: Structure, Function, Data, Interfaces, Platform, Operations, Time.
- **Tours**: money (main value path), landmark (jump between key pages), back-alley
  (rarely used settings), saboteur (break inputs, kill network, refresh mid-save),
  supermodel (only the looks: layout, overflow, dark mode, zoom 200%, mobile width).
- **Data**: empty, max length, special chars, RTL/Arabic, emoji, leading/trailing spaces,
  pasted rich text, duplicates, huge lists (pagination), zero results.
- **Interruptions**: double-click submit, back/forward, two tabs editing the same item,
  session expiry, slow 3G, offline then online.
- **Consistency**: does it match similar pages, the spec, the tracker (Jira/OpenProject) after sync?

## 4. Notes while testing (keep a running log)
`[time] action → observation` with tags: **BUG**, **ISSUE** (question/UX smell),
**IDEA** (new test), **NOTE** (coverage). Screenshot every BUG.

## 5. Debrief / report
- Charter, duration, what was covered and **not** covered
- Bugs (each written with the `bug-report` skill), ranked by severity
- Issues and questions for the team
- Suggested follow-ups: new test cases, areas worth automating
