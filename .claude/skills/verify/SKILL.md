---
name: verify
description: How to launch and drive this app to verify changes end-to-end.
---

# Verifying changes in AI-Manual-testing (QA Engine)

## Launch
- `npm run dev` serves on **http://localhost:3000** — usually already running; check with
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`.
- Automated/recorded test runs additionally need `npm run worker`.
- Schema changes require a dev-server restart (stale Prisma client otherwise).

## Data / auth
- Local Postgres: `psql -d ai_manual_qa` (tables are PascalCase, quote them).
- Seeded scrum demo project: id `scrum-sys-project` (name "System Platform", boardKey SYS)
  — has sprints, tasks, and 2 test cases. Scrum board URL:
  `http://localhost:3000/projects/scrum-sys-project/scrum`.
- The in-app browser session is normally already logged in as a Global Admin.

## Driving the UI (in-app Browser pane)
- Prefer `read_page` refs for clicks; **raw screenshot coordinates are unreliable**
  (viewport scaling) and stale refs can land on the dialog overlay and close modals.
- Screenshots go blank/white after scrolling the page — instead resize the viewport
  tall (`resize_window` height ≈ page height) and screenshot once, or use
  `scroll_to` + fresh `read_page`.
- File uploads: no native dialog access — set `input.files` via `javascript_tool`
  with a `DataTransfer` and dispatch a bubbling `change` event.
- Don't use `form_input` on React-controlled checkboxes (state desync); click the
  label with `computer` instead.
