# Phase 15 — Multi-terminal sessions, agents, and drag-to-reorder

Phase 9 shipped exactly one terminal: one panel, one pty, cwd'd to the selected worktree,
destroyed the moment you hide it. This phase makes the terminal a place you keep several things
running — plain shells and coding agents, across repos — listed in a sidebar, surviving a
restart with their scrollback, and reorderable by drag. The repos sidebar gets the same drag.

The backend is already most of the way there: `pty-service.ts` keys sessions by `randomUUID()` in
a `Map` and every event carries `ptyId`. The single-terminal limit is one `ptyIdRef` in the
renderer.

Three Phase 9 decisions are deliberately overturned here, each recorded in its findings:
the panel unmounting when hidden, `terminalOpen` being excluded from persistence, and the
cwd-change effect killing the pty. The last of those is also a live bug — see Theme B.

## Deliverables

### A — Session record + scrollback in main

The durable record lives in main next to `repos.json`, not in localStorage: it must survive a
localStorage clear, and the scrollback bytes are far too big for a 5 MB quota.

- [x] `shared/src/terminal.ts` — `TerminalSessionKind = 'shell' | 'agent'`, `AgentDefinition`
      (`id`, `label`, `command`, `args`, `accent`), and `BUILTIN_AGENTS` carrying one entry for
      Claude (`command: 'claude'`, accent `#D97757`). A *value* export from `shared` is safe —
      Phase 9 already repointed every consumer at the package's source rather than its CJS dist
- [x] `desktop/src/main/terminal-store.ts` — modelled on `repo-store.ts` (same `{version: 1, …}`
      envelope, same hand-rolled validator, same swallow-on-failure posture): `terminals.json`
      holds the ordered session array, `scrollback/<id>.bin` the raw pty bytes. Writes debounced
      ~1s so a chatty build doesn't thrash the disk
- [x] `pty-service.ts` — tee `child.onData` into a per-session ring buffer capped at
      `SCROLLBACK_BYTES` (256 KB). **Trim to a `\n` boundary and prefix the replay with `\x1b[0m`**
      — cutting at an arbitrary byte offset starts replay mid-CSI and paints the pane a solid colour
- [x] `pty-service.ts` — `sessionId` on `createPty` (a revived session appends to its own log) and
      `initialInput`, written **after the first output chunk lands**: a login shell's init, and
      powerlevel10k's instant prompt in particular, swallows input queued before the prompt exists
- [x] `desktop/src/main/agents-store.ts` — `agents.json` in userData merged over `BUILTIN_AGENTS`
      by `id` (override wins, unknown ids append); missing or corrupt file degrades to builtins
      silently, so a bad edit can't stop the app booting
- [x] `shared/src/ipc/{channels,schemas,bridge}.ts` — `pty:*` keeps owning the *process*, a new
      `terminal:*` group owns the *record*: `terminal:list` (invoke, sessions + scrollback),
      `terminal:save` / `:forget` / `:reorder` (send), `agent:list` (invoke). `PtyCreateRequest`
      gains `sessionId`, `kind`, `agentId?`, `repoId`, `initialInput?`. Scrollback crosses as
      `Uint8Array` via structured clone — the same no-base64 rule `ptyData` already follows
- [x] `desktop/src/main/ipc/terminal-handlers.ts` + preload wiring; `killAllPtys()` on
      `before-quit` stays exactly as-is — that is what makes "processes die on quit" true

### B — Renderer session model

- [x] `app/src/features/terminal/terminal-store.ts` — zustand, **not** localStorage-persisted
      (main owns durability): ordered `sessions`, `activeId`, and non-persisted `ptyIdBySession` /
      `stateBySession`. Atomic selectors, per the house pattern
- [x] `use-terminal-ipc.ts` — from "the pty" to "this session's pty": keyed on `sessionId`, with
      `onData` / `onExit` filtered by the ptyId bound to that session
- [x] **Delete the cwd-change kill effect.** It calls `kill()`, but `start()` is only ever invoked
      from inside `openWhenSized`, which early-returns because `termRef.current` is already set —
      so switching worktree today kills the shell and *never restarts it*, leaving a dead pane
- [x] `terminal-panel.tsx` — a host that mounts every session's xterm and shows one. Deferred
      `term.open()`, `safeFit`, the in-place `MutationObserver` re-theme and
      `attachCustomKeyEventHandler` all survive untouched
- [x] Inactive panes use **`invisible`, never `hidden`/`display:none`** — a `display:none` element
      measures 0×0, which is exactly the state Phase 9 found throws `Cannot read properties of
      undefined (reading 'dimensions')`. `visibility: hidden` keeps the layout box, so `safeFit`
      still measures and the shell's column count stays right
- [x] `ui-store.ts` — `terminalMaximized` and `terminalSidebarSide` added and persisted;
      `terminalOpen` **moved into** `partialize` with its comment rewritten. The old objection
      ("restoring it spawns a login shell before the user has asked") dies with the dead-buffer
      model: restored sessions come back with no process at all
- [x] Restore on boot — sessions reappear dimmed with their scrollback replayed and a trailing
      `[session ended]` line; the pty spawns on the first keystroke, not before

### C — Panel chrome: maximize and the `+` menu

- [x] Maximize toggle (`ChevronUp` ⇄ `ChevronDown`) — the terminal fills everything below the
      custom titlebar, its own controls still visible; restoring returns to the stored
      `layout.terminalHeight`. Keep the wrapper's deliberate *absence* of a height transition
- [x] `Plus` button opening a menu through `useDialogs().openMenu`, anchored at the button's
      `getBoundingClientRect()`. There is no generic `DropdownMenu` in the app or in `@bilo-io/ui`;
      `ContextMenu` via `useDialogs` is the established path
- [x] Menu items: `New Terminal`, separator, then one `New Agent — <label>` per roster entry. Both
      spawn into the selected worktree's directory
- [x] An agent session is **a login shell sent `claude\r`**, not `pty.spawn('claude')` — the login
      shell resolves nvm/asdf-managed binaries the way the user's real terminal does, and when the
      agent exits you are left at a prompt rather than a dead pane

### D — The session sidebar

- [x] `app/src/features/terminal/terminal-session-list.tsx` — rendered only when
      `sessions.length > 1`, docked per `terminalSidebarSide`, ~180px
- [x] `app/src/components/icons/claude-icon.tsx` — there is no Claude or Anthropic mark anywhere in
      the repo or in `@bilo-io/ui`, so it is a new local SVG following the `brand.tsx` precedent,
      typed as the existing structural `IconComponent` so it drops straight into `IconButton`
- [x] Row: shell → react-icons `LuTerminal`; agent → the Claude mark tinted with the roster entry's
      `accent`. Repo name · short cwd, a running dot, hover `X` to close. Dead rows dimmed
- [x] Right-click the sidebar → `Move to left` / `Move to right` through the same `openMenu` —
      cheaper than another piece of chrome for a preference set once

### E — Drag-to-reorder, terminals and repos

- [x] Add `@dnd-kit/sortable` — `@dnd-kit/core` is already a dependency, the sortable primitives
      are not
- [x] `app/src/components/sortable-list.tsx` — one shared wrapper for both lists, so sensor config
      and keyboard a11y live in one place. Match graph-dnd's `PointerSensor`
      `activationConstraint: { distance: 6 }`: the repo row already has three overlapping click
      targets (chevron, select, close) and a 0-distance drag would swallow them
- [x] Terminal order → `mgit:terminal:reorder`, persisted as `terminals.json` array order
- [x] Repo order → new `mgit:repo:reorder` mutating the registry `Map` and re-persisting. Order
      stays where the repo list already lives (`repos.json` `paths` order) rather than splitting
      into localStorage
- [x] Compose drag listeners **through** `Tooltip`, which clones its child and carries `assignRef`
      precisely to keep dnd-kit refs alive; and confirm the repos panel sits outside
      `GraphDndProvider` before adding a second `DndContext` — nested contexts misroute drops

## Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] `terminal-store.test.ts` — JSON round-trip; corrupt file ⇒ empty; the cap holds at 256 KB;
      **scrollback trims at a newline boundary and never mid-escape-sequence**
- [ ] `agents-store.test.ts` — builtins alone with no file; override by `id`; unknown id appends;
      corrupt file falls back to builtins
- [ ] `ui-store.test.ts` — the `terminalOpen` exclusion assertion **inverted, not deleted**, plus
      `terminalMaximized` / `terminalSidebarSide` persisted and `sessions` / `activeId` not
- [ ] `ipc.test.ts` — the new `terminal:*` schemas parse and reject, and the extended
      `PtyCreateRequest` too (there are no pty schema tests today)
- [ ] `e2e/mock-bridge.ts` — fix `pty.create` returning `{ ptyId }` without the `ok: true`
      discriminant `PtyCreateResponse` requires, which silently renders the panel "unavailable"
      under e2e today; then specs for a second terminal, sidebar switching, and drag reorder
- [ ] **Ctrl+` still toggles with the terminal focused** — the chord escapes xterm via the
      `GLOBAL_CHORDS`-derived allow-list, and it is the easiest thing here to break silently while
      restructuring the panel
- [ ] Manual: three terminals across two repos plus one Claude agent; the agent row carries the
      Claude mark in `#D97757`; maximize and restore; quit and relaunch — all four reappear dimmed
      with their scrollback and **`ps` shows no shells**; Enter revives one
- [ ] Manual: hide the panel with `sleep 30` running, re-show it — the process is still alive, so
      the Phase 9 unmount contract is genuinely overturned rather than just visually
- [ ] Screenshots → `docs/screenshots/phase-15-terminals.png` and `phase-15-terminal-maximized.png`
