# Playwright agent-cli (`playwright-cli`)

Source: https://playwright.dev/agent-cli/introduction. Package `@playwright/cli`, executable `playwright-cli`, Node 20+.
Not installed? Stop and tell the user. Installing (`npm install -g @playwright/cli@latest`, then
`playwright-cli install-browser`) is their decision, never yours. `playwright-cli --help <command>` is the
truth for the installed version.

## Sessions
- Every command carries `-s=<session>` (the name `record_result.js start` printed). The flag can go anywhere.
- Each session is an isolated browser: own cookies, storage, tabs, console.
- `open` closes any browser already running under the same session name.
- End: `playwright-cli -s=<session> close`. `list` shows sessions. Never `close-all` / `kill-all` (other runs may be live).

## Element refs
`snapshot` prints the page's accessibility tree; each interactive element has a ref like `e12`
(`- button "Login" [ref=e12]`). Refs are valid until the page changes: **snapshot again after every navigation
or action that changes the page.** `find "Add to cart"` lists matching elements with refs.
Prefer refs over selectors you write yourself.

## Commands you will use
| Need | Command |
|---|---|
| Start the browser | `playwright-cli -s=S open https://www.saucedemo.com` (`--headed` to watch) |
| Navigate | `goto <url>`, `go-back`, `go-forward`, `reload` |
| Read the page | `snapshot`, `snapshot e34` (one subtree), `find "text"` |
| Click | `click e12` (`click e12 right`, `--modifiers=Shift`), `dblclick e12`, `hover e12` |
| Type | `fill e5 "standard_user"` (`--submit` presses Enter), `type "text"` (into the focused element), `press Enter` |
| Choose | `select e7 "Price (low to high)"`, `check e9`, `uncheck e9` |
| Read a value | `eval "() => document.title"`, `eval "(el) => getComputedStyle(el).display" e21`, `eval "(el) => el.textContent" e21` |
| Evidence | `screenshot --filename="<absolute path>.png"`, `screenshot e15 --filename=...`, `--full-page` |
| Console | `console error` (`--clear` to reset between cases) |
| Network | `requests`, `request <n>`, `response-body <n>` |
| Dialogs | `dialog-accept`, `dialog-dismiss` (Demoblaze uses browser alerts) |
| State | `cookie-clear`, `localstorage-clear`, `sessionstorage-clear` |
| Tabs | `tab-list`, `tab-select <i>`, `tab-close [i]` |
| Viewport | `resize 390 844` |
| Close | `close` |

## Shapes that fail
- The target is positional: `click e12`, never `click --ref e12`.
- A screenshot path is `--filename=...`, never positional (a positional value is read as a target).
- No per-command `--timeout`.
- `run-code "async (page) => {...}"` exists, but you do not use it to retry a failed click or to force an action:
  that turns a real defect into a pass. Use it only for a read no command can do, and say so in `--command`.
- Use an **absolute** `--filename` for screenshots, quoted (this project path has spaces), and check that the file
  exists before recording it (`record_result.js` refuses a missing file).

## Output files
The CLI writes snapshots (`page-<timestamp>.yml`) and default screenshots to `.playwright-cli/` in the working
folder. That is scratch. Evidence goes to `<run>/execution/run/evidence/` through `--filename`. Delete
`.playwright-cli/` scratch after the run if it holds only this run's files.

## Windows note
With a current Node on Windows the CLI may print its output and then crash on exit (`UV_HANDLE_CLOSING`).
If the output is there, the command worked. `check_env.js` already accounts for this.
