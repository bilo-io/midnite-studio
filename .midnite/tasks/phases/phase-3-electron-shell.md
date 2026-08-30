# Phase 3 — Electron shell boots (AppFrame + TitleBar + theme)

Frameless mac window rendering the Vite app inside `@bilo-io/shell`'s `AppFrame`, with a working
`TitleBar`, dark/light tokens, and theme toggle.

Crib: `~/Dev/midnite/packages/desktop/src/main/{window-chrome,shell-path}.ts` and its preload;
model the Vite host on `~/Dev/midnite-ui/packages/docs/src/app.tsx`; copy the token→color map
from `~/Dev/midnite-ui/packages/docs/tailwind.config.ts`.

## Deliverables

- [x] `desktop/src/main/index.ts` — single-instance lock, `contextIsolation: true`, `titleBarStyle: 'hidden'` (+ trafficLightPosition), `additionalArguments: ['--window-frameless']`; dev loads `http://localhost:5173`, prod loads `app/dist/index.html`
- [x] `desktop/src/main/{window.ts,window-chrome.ts}` — fullscreen/focus forwarding, background retint (implements shell's `WindowChromeBridge` needs)
- [x] `desktop/src/main/shell-path.ts` — login-shell PATH fix, near-verbatim from midnite
- [x] `desktop/src/main/menu.ts` — minimal app menu incl. macOS Edit roles
- [x] `desktop/src/preload/index.ts` — typed `windowChrome` bridge; channel constants from `shared`; subscriptions return unsubscribe fns
- [x] `app/vite.config.ts` — `base: './'` (file:// prod loads)
- [x] `app/index.html` — inline `themeInitScript` from `@bilo-io/ui/theme`
- [x] `app/tailwind.config.ts` — token→hsl map + `darkMode: ['class']` + content globs incl. `./node_modules/@bilo-io/{ui,shell}/dist/**/*.js` (**missing a glob silently drops layout classes**)
- [x] `app/src/styles.css` — `@bilo-io/ui/styles`, `@bilo-io/shell/appearance.css`, tailwind directives
- [x] `app/src/app.tsx` — ThemeProvider + ShellProviders (`@tanstack/react-query@^5`) + AppFrame (linkComponent adapter) + TitleBar wired to `window.midniteStudio.windowChrome`
- [x] `desktop` moon task `start` — build main+preload, run `electron .` concurrently with `app:dev`

## Verification

- [x] `moon run desktop:start` → frameless window, traffic-light clearance correct
- [x] Fullscreen enter/leave collapses/restores the title bar
- [x] Theme toggle flips tokens (light/dark)
- [x] Screenshot captured

Screenshots: [dark](../docs/screenshots/phase-3-shell-dark.png) ·
[light](../docs/screenshots/phase-3-shell-light.png) ·
[fullscreen](../docs/screenshots/phase-3-shell-fullscreen.png).

## Findings while landing this phase

- **`ELECTRON_RUN_AS_NODE=1` is inherited from Electron-based editors.** VS Code, Cursor and
  friends export it into their integrated terminals; the Electron binary then behaves as plain
  Node, `require('electron')` returns the npm shim's *path string*, and main dies on the first
  line touching `app` with "Cannot read properties of undefined". It works in a normal terminal
  and fails in the editor, which is a horrible thing to debug. `scripts/start-electron.mjs`
  strips the variable — a moon task can set env vars but not unset them.
- **`sandbox: false` is required** (contextIsolation and nodeIntegration are unchanged). The
  preload requires `@midnite/studio-shared` for the channel constants, and a sandboxed preload only
  gets a polyfilled subset of `require`.
- **The frameless flag is single-sourced** from main's window options via
  `additionalArguments`, never re-derived in the preload from `process.platform`. A second
  platform check silently disagrees the moment window creation gains a condition — and the
  symptom is an app-drawn title bar stacked on a native one.
- **`WindowChromeBridge` is not exported from shell's public entry** (it lives in its internal
  `./contracts`). `packages/app/src/services/bridge.ts` recovers it as
  `ComponentProps<typeof TitleBar>['windowChrome']` and asserts bidirectional assignability
  against our restatement in `shared` — the restatement exists because `shared` is loaded by the
  main process and must not pull React into that module graph.
- **Screenshots are taken from inside the app.** `screencapture` needs macOS Screen Recording
  permission, which an agent context does not have; `webContents.capturePage()` needs none.
  `src/main/capture.ts` is opt-in via `MGIT_CAPTURE`, with `MGIT_CAPTURE_THEME` and
  `MGIT_CAPTURE_FULLSCREEN` because those two states are what the checklist asks to be verified
  and neither is reachable from outside the app.
- **The Tailwind content globs were verified, not assumed.** 21 utility classes that appear only
  in `@bilo-io/shell`'s published `dist/*.js` were confirmed present in the generated CSS — a
  missing glob produces a green build and a silently collapsed layout.
- A stale Electron instance holding the single-instance lock makes a new launch exit 0 with no
  window and no output. Worth remembering when a capture run mysteriously produces nothing.
