# QA Engine desktop app (macOS + Windows)

An Electron app for QA Engine. By default it runs **on this computer** ("This computer" in the **Server** menu): on launch it starts PostgreSQL and Redis if they aren't running (Homebrew installs), then the web app, socket server (port 3101), recorder and queue workers from the project folder, and opens the app when it's ready. Quitting the app stops the services it started. Services you already started yourself are reused and left running. The project folder is detected at `~/Desktop/AI-Manual-testing`, or you can pick it via **Server → Choose project folder…**. The **Server** menu also switches to production, staging or a custom URL.

## Develop

```bash
cd desktop
npm install          # electron's binary download is allowed via "allowScripts"
npm start            # opens production
npm run start:local  # opens http://localhost:3000 (run `npm run dev` in the repo root first)
```

## Build installers

```bash
npm run dist:mac   # dist/QA-Engine-<ver>-mac-arm64.dmg and -x64.dmg (+ .zip for auto-update)
npm run dist:win   # dist/QA-Engine-Setup-<ver>.exe   (builds from macOS too, no Wine needed)
```

The builds are **unsigned**. On macOS the first launch needs right-click → Open (or System Settings → Privacy & Security → Open Anyway). On Windows, SmartScreen shows "More info → Run anyway". Signing needs:

- **macOS:** an Apple Developer ID certificate ($99/yr). Set `CSC_LINK`/`CSC_KEY_PASSWORD` plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarization. Auto-update on macOS only works for signed builds.
- **Windows:** a code-signing certificate (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`), or Azure Trusted Signing.

## Releases and auto-update

`electron-updater` checks the GitHub Releases of `sabrymohsen/AI-Manual-testing` five seconds after launch and from **Help → Check for Updates**. To publish one, bump `version` in this `package.json` and run `GH_TOKEN=<token> npx electron-builder --mac --win --publish always`.

## What the shell does

- Keeps the login (cookie partition `persist:qa-engine`) and the window size and position across restarts.
- Opens links to other sites in the system browser. App links opened with `target=_blank` open a new app window.
- Shows an offline screen with Retry when the server can't be reached, and comes back by itself when the network returns.
- Adds `QAEngineDesktop/<version>` to the user agent and `window.qaDesktop.isDesktop` so the web app can detect it. Only the bundled local pages can change settings.
- Grants notifications, clipboard, mic/camera and screen-capture permissions only to the QA Engine origin.
