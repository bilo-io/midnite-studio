# Phase 9 — Integrated terminal + keybinding service

Footer-bar terminal toggled by button and **Ctrl+`** (all platforms — macOS reserves Cmd+` for
window cycling; do not take it), cwd'd to the selected repo/worktree.

Crib: `~/Dev/midnite/packages/gateway/src/terminal/spawner/pty-spawner.ts` (lazy fail-soft
`require('node-pty')`, `isPidAlive`) and `~/Dev/midnite/packages/web/components/live-terminal.tsx`
(deferred-open ResizeObserver, safeFit, theme swap).

## Deliverables

- [ ] `desktop/src/main/pty-service.ts` — sessions keyed by `ptyId`; spawns the user's login shell with shell-path-fixed PATH; cwd = selected worktree; data → `mgit:pty:data` as `Uint8Array` (structured clone, **no base64**); kill on window close; lazy fail-soft node-pty load degrades to "terminal unavailable"
- [ ] node-pty electron-rebuild wired as postinstall or `desktop:rebuild-native` moon task (**single ABI** — node-pty lives only in main); `scripts/fix-node-pty.cjs` chmod in place
- [ ] `app/src/features/terminal/{terminal-panel.tsx,live-terminal.tsx,use-terminal-ipc.ts}` — xterm + fit addon; `use-terminal-ipc` returns `{connectionState, sendInput, sendResize}`; deferred `term.open()` until the container has size
- [ ] `app/src/services/keybindings/{commands.ts,keybinding-service.ts,use-keybindings.ts}` — CommandId registry (from `shared/src/keybindings.ts`), context keys (`terminalFocus`), **allow-list of chords escaping xterm** via `attachCustomKeyEventHandler` (Ctrl+` at minimum)
- [ ] `desktop/src/main/menu.ts` — View → Toggle Terminal accelerator `` Ctrl+` `` dispatching the same CommandId over `mgit:menu:command`; macOS Edit roles present
- [ ] `app/src/components/footer-bar.tsx` — terminal toggle button + branch/status indicators

## Verification

- [ ] Ctrl+` toggles with the terminal focused AND unfocused; toggle button matches
- [ ] `git status` inside the terminal agrees with the status panel
- [ ] Cmd+C / Cmd+V work in the terminal and in inputs
- [ ] Exiting the shell shows an exited state (no crash); reopening spawns fresh
- [ ] Screenshot captured
