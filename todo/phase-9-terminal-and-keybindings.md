# Phase 9 — Integrated terminal + keybinding service

Footer-bar terminal toggled by button and **Ctrl+`** (all platforms — macOS reserves Cmd+` for
window cycling; do not take it), cwd'd to the selected repo/worktree.

Crib: `~/Dev/midnite/packages/gateway/src/terminal/spawner/pty-spawner.ts` (lazy fail-soft
`require('node-pty')`, `isPidAlive`) and `~/Dev/midnite/packages/web/components/live-terminal.tsx`
(deferred-open ResizeObserver, safeFit, theme swap).

## Deliverables

- [x] `desktop/src/main/pty-service.ts` — sessions keyed by `ptyId`; spawns the user's login shell with shell-path-fixed PATH; cwd = selected worktree; data → `mgit:pty:data` as `Uint8Array` (structured clone, **no base64**); kill on window close; lazy fail-soft node-pty load degrades to "terminal unavailable"
- [x] node-pty electron-rebuild wired as postinstall or `desktop:rebuild-native` moon task (**single ABI** — node-pty lives only in main); `scripts/fix-node-pty.cjs` chmod in place
- [x] `app/src/features/terminal/{terminal-panel.tsx,live-terminal.tsx,use-terminal-ipc.ts}` — xterm + fit addon; `use-terminal-ipc` returns `{connectionState, sendInput, sendResize}`; deferred `term.open()` until the container has size
- [x] `app/src/services/keybindings/{commands.ts,keybinding-service.ts,use-keybindings.ts}` — CommandId registry (from `shared/src/keybindings.ts`), context keys (`terminalFocus`), **allow-list of chords escaping xterm** via `attachCustomKeyEventHandler` (Ctrl+` at minimum)
- [x] `desktop/src/main/menu.ts` — View → Toggle Terminal accelerator `` Ctrl+` `` dispatching the same CommandId over `mgit:menu:command`; macOS Edit roles present
- [x] `app/src/components/footer-bar.tsx` — terminal toggle button + branch/status indicators

## Verification

- [x] Ctrl+` toggles with the terminal focused AND unfocused; toggle button matches
- [x] `git status` inside the terminal agrees with the status panel
- [x] Cmd+C / Cmd+V work in the terminal and in inputs
- [x] Exiting the shell shows an exited state (no crash); reopening spawns fresh
- [x] Screenshot captured

Screenshot: [integrated terminal](../docs/screenshots/phase-9-terminal.png) — the user's real
login shell (powerlevel10k prompt and all), `git status --short` reporting `?? scratch.txt`, and
the footer showing `main · 1 changed` for the same worktree.

| Check | Result |
|---|---|
| `Ctrl+\`` from a cold start | terminal opens |
| `Ctrl+\`` with the terminal focused | terminal closes — the chord escapes xterm |
| `git status` in the terminal vs the panel | `?? scratch.txt` ↔ `1 changed` |
| Edit menu roles | undo/redo/cut/copy/paste/selectall all registered |
| View → Toggle Terminal accelerator | `Ctrl+\``, not `Cmd+\`` |

## Findings while landing this phase

- **The renderer could not import a *value* from `shared`.** `packages/shared` emits CommonJS
  because Electron main `require()`s it, and Rollup cannot see named exports through that interop
  — so the first value import (`DEFAULT_KEYMAP`) failed the production build with "not exported
  by ../shared/dist/index.js" while `vite dev` was perfectly happy. A dev/prod split is the worst
  kind to find late. Vite, vitest and the app's tsconfig now all resolve `@midnite/git-shared` to
  its **source**: the renderer is bundled anyway, so it gets real ESM, tree-shaking, and no way to
  build against a stale dist.
- **The keybinding listener must be capture-phase.** xterm attaches its own handler to a hidden
  textarea; a bubble-phase listener never sees a keystroke aimed at the terminal.
- **The xterm escape allow-list is derived from the keymap's `global` scope**, not written out
  again as key codes — one list, and the terminal toggle is on it because it is the one shortcut
  that genuinely outranks the shell.
- **Synthetic `KeyboardEvent`s do not drive xterm.** It reads from a hidden textarea fed by the
  real input pipeline, so verifying any of this needed `webContents.sendInputEvent`
  (`MGIT_TYPE` / `MGIT_KEYS`) rather than DOM dispatch.
- **Deferred open + safeFit, both load-bearing.** The terminal starts collapsed by definition — it
  opens on a keystroke — so its container is 0×0 at mount, and `term.open()` there leaves xterm's
  render service without dimensions until something throws "Cannot read properties of undefined
  (reading 'dimensions')" and takes the panel with it.
- **The panel unmounts when hidden, killing the shell.** Keeping a hidden terminal alive means a
  stray shell with no way to see or stop it — and a 0-height xterm is exactly the broken state
  above.
- **Switching worktree starts a new shell rather than `cd`-ing.** The user may be mid-command;
  rewriting their shell's state underneath them is worse than a fresh prompt.
- **`app.setName('midnite-git')`** — Electron takes the name from package.json, so the menu bar,
  the About dialog and `~/Library/Application Support` all read `@midnite/git-desktop` without it.
- **`GIT_TERMINAL_PROMPT=1` in the pty env**, undoing the engine's read-path hygiene: this is an
  interactive shell, where the user genuinely may want git to prompt them.
- node-pty is main-process-only, so `electron-rebuild` is a single ABI and
  `moon run desktop:rebuild-native` is the whole native story.
