# QA Engine - Standalone Scrum Board

A fully functional client-side Kanban and Scrum board application built with pure HTML, CSS, Tailwind CSS, and Vanilla Javascript.

## 🚀 How to Run

1. **Open Directly in Browser**:
   Double click the `index.html` file in your explorer/finder to open it directly in Google Chrome, Safari, Mozilla Firefox, or Microsoft Edge.
   
2. **Serve via Local Server**:
   Alternatively, you can run a simple server from the directory:
   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```

## ⌨️ Keyboard Shortcuts
- `Escape`: Instantly close any open modals.

## 💾 Data Model
All data is stored and updated inside your browser's local storage (`localStorage`) using the following keys:
- `qe_tasks`: Main task cards array (SYS-101, SYS-108, etc.) containing subtasks list, activity logs, comments feed, and assignee profiles.
- `qe_epics`: Epics with custom color markers.
- `qe_sprints`: Active and future sprints.
- `qe_projects`: Tracked projects scopes.
- `qe_testCases`: CRUD functional test cases array.
- `qe_bugs`: Active system bug logs.
- `qe_automations`: Rule toggles.
- `qe_settings`: Theme flags.

## 🔄 Backup & Recovery
Under the **Settings** panel:
- **Export Data**: Click to export a complete JSON backup file of all your current tasks, sprints, epics, and settings.
- **Import Data**: Select a previously exported JSON backup file to instantly restore your workspace state.
- **Reset Data**: Click to wipe local storage and reload the pre-populated demo data.
