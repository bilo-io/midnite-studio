# Phase 30 — A terminal that survives you

**Refined: x2** · 2026-08-28 · UI/UX, visual design, accessibility, empty/loading/error states, concurrency, edge cases, persistence, testing, security, performance, observability, file map, acceptance criteria, sequencing, agent activity, motion fallbacks, out-of-scope tightening

Phase 15 made terminal sessions durable in exactly one sense: the *transcript* survives, the
*process* does not. `terminals.json` and `scrollback/<id>.bin` come back on the next launch as dimmed
rows, a `[session ended] Press Enter to start a new shell here` line is written into the scrollback,
and Enter spawns a fresh shell at the recorded `cwd`. That was the design — its own verification
item asks a human to confirm `ps` shows **no** surviving shells after a relaunch — and it is the
design this phase overturns. A coding agent mid-conversation, a dev server, a `git rebase -i` half
way through: none of them should die because the window reloaded or the app was quit.

Four defects reported against the current terminal are fixed on the way, each with a cause the
code already names:

- **Blank pane on reveal.** Collapsing the terminal unmounts it (`terminalReveal.mounted` at
  [`app.tsx:734`](../packages/app/src/app.tsx)); revealing builds a fresh xterm whose mount path
  replays only `peekReplay()` — the *restored* transcript — never the live ring buffer main has been
  accumulating for a pty that stayed alive. And nothing calls `fit()`/`refresh()` when the reveal
  tween ends; the only refresh hook in
  [`terminal-view.tsx:363-368`](../packages/app/src/features/terminal/terminal-view.tsx) is
  `visibilitychange`, which is *window* minimise, not panel collapse.
- **Reload loses every session.** Main has no `render-process-gone` handler anywhere; a renderer
  reload leaves every pty alive in [`pty-service.ts`](../packages/desktop/src/main/pty-service.ts)
  with the renderer's `ptyIds` map gone — orphans that only `killAllPtys()` at quit will reap, while
  the rows come back as `'exited'`. (The `BrowserWindow` itself survives a reload, so the
  closure-captured `win` that `createPty(win, …)` sends through at `:247`/`:257` keeps working —
  the loss is renderer state, not forwarding.)
- **Session names like `BAAAA`.** `trackShellCommand()` in
  [`activity-detect.ts:116`](../packages/app/src/features/terminal/activity-detect.ts) reconstructs
  the command from keystrokes. zsh's line editor puts the terminal in application-cursor mode, where
  an arrow arrives as `ESC O A`; the skipper ends its escape on the `O` and the `A`/`B` lands in the
  buffer. A perfect parser would still be wrong — recalling `pnpm dev` from history never types
  those characters — so the approach is replaced, not repaired.
- **The agent activity glyph never spins.** Two gates decide who gets one, and both read
  `session.kind` — fixed at the moment a session is created — while Phase 21's `ps` probe already
  reports what is *actually* running through `liveAgentId` and `resolveSessionAgentId`
  ([`terminal-store.ts:591`](../packages/app/src/features/terminal/terminal-store.ts)). Typing
  `claude` in an ordinary shell therefore gets the Claude icon and its accent — the list already
  computes `runningAgent` off the probe at
  [`terminal-session-list.tsx:115-117`](../packages/app/src/features/terminal/terminal-session-list.tsx) —
  and never the spinner. Beneath that sit three more: the shell's reduced-motion reset pins every
  keyframe to its final frame, and `caret-blink`'s is `opacity: 0`, so the idle glyph is *invisible*
  on a Reduce-Motion machine; `activity === undefined` draws the same confident caret as a genuinely
  idle agent, which is what hid the detector's own 2.1.x regression; and detection only runs inside
  a mounted `TerminalView`, so it stops entirely while the panel is collapsed — the one situation
  the status bar's agent count exists for.

**Builds on.** Phase 9 (the pty service, `safeFit`, deferred `term.open()`), Phase 13
(`useReveal`/`useSettled` in [`use-reveal.ts`](../packages/app/src/components/use-reveal.ts), the
200 ms `ease-in-out` vocabulary), Phase 15 (`terminal-store.ts` in main, the ring buffer keyed by
`sessionId`, `terminal:*` vs `pty:*` channel split, the dead-buffer restore this phase replaces),
Phase 21 Theme E ([`agent-watcher.ts`](../packages/desktop/src/main/agent-watcher.ts) — the
event-driven `ps` probe Theme E extends rather than duplicates), Phase 27 (the status-bar
`STATUS_SEGMENTS` composition Theme C's launch note joins; the browser pane Theme A tweens).

**Scope guardrails.** **Your shell is untouched.** The broker spawns the same `$SHELL -l` with the
same env `pty-service.ts` builds today — no `ZDOTDIR` shim, no `TERM` change, no prefix key, no
status line. This is the reason tmux is *not* the detach layer (see Decisions). **No new
dependency.** No tmux, no `electron-store`, no motion library; node-pty keeps its single ABI because
the broker runs under the app's own Electron binary as Node. **Nothing is killed without a click.**
Quit detaches; version skew leaves the old broker's sessions readable; `X` on a busy session asks.
**Tweens fit once, at the end.** One `SIGWINCH` per toggle, not one per frame — the existing
two-nested-box trick already encodes this and the primitive generalises it.

**Sequencing.** **A and E are independent of the broker and of each other** — either can land first.
**B before C**: B adds `live` to `terminal:list` and the `pty:snapshot` channel against today's
in-main ptys, so the renderer's rebind path is proven before the process that owns the ptys moves.
**C after B**, and it must land whole — a half-landed C (client without broker, or broker without
`before-quit` detaching) leaves quit killing shells the UI says are live. **D after B** (it reads
`live` and the snapshot path) and after E for the `X`-confirm's command name; D's Sleep/Resume do
not need C. A run that has landed A+B+E without C is a coherent, shippable state. **F after D** —
it edits the rows and the count D has just rewritten around `sessionPhase`, and it needs nothing
else; F is renderer-only and lands alone. **G after F** and **independent of C**: the one site it
hooks (`pty-service.ts`'s single `ptyData` send) survives C's rewrite untouched, so the two can be
built in either order or at once.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The blank pane, and panels that interpolate (M) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] Reproduce blank-on-reveal as a failing Playwright spec first: open a session, collapse with
      `Ctrl+\``, reveal, and assert the pane's bridge traffic shows a snapshot write **without** a
      resize having been sent per frame — the mock bridge in
      [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) publishes pty traffic on
      `window.__mstudioPty`, so "what reached xterm" is assertable even though the WebGL canvas is not.
      - Spec file: net-new [`e2e/terminal-reveal.spec.ts`](../packages/app/e2e/terminal-reveal.spec.ts),
        test `'revealing a live session replays its buffer with one resize, not one per frame'`.
      - Steps: open one shell (`Ctrl+\``, as `terminal.spec.ts:164` does) → note
        `__mstudioPty.resizes.length` → toggle collapse → `await expect(page.locator('[data-terminal-frame]')).toHaveCount(0)`
        → toggle reveal → `await expect(page.locator('[data-terminal-frame]')).toHaveCount(1)` →
        wait `REVEAL_MS + 100` ms → assert `__mstudioPty.snapshots` equals `[liveptyId]` and
        `resizes.length` grew by **exactly 1**.
      - It is red today for two reasons the fixes below remove one each: `bridge.pty.snapshot` does
        not exist (cause 1), and the resize count after reveal is whatever the `ResizeObserver` at
        `terminal-view.tsx:344-348` happens to fire (cause 2). It depends on the `resizes`/`snapshots`
        recorders in the last item of this theme, which lands with it.
- [x] Fix cause 1: a remounted view for a **live** session writes main's current ring buffer before
      attaching to the stream. **Resolved — a `mstudio:pty:snapshot` invoke** (Theme B owns the
      channel), not bytes on `terminal:list`. Same `\x1b[0m`-prefixed, newline-trimmed slice
      `trimScrollback()` in [`terminal-store.ts:136`](../packages/desktop/src/main/terminal-store.ts)
      already produces, for the same mid-CSI reason — main applies `trimScrollback(ring, SCROLLBACK_BYTES)`
      before answering.
      - Where: `openWhenSized` in `terminal-view.tsx:260-342`. After `term.open(el)` and `safeFit()`,
        branch on `stateRef.current`: `'open'` → `await bridge.pty.snapshot({ ptyId })`,
        `term.write(bytes)`, `term.write(RESET_MODES)`, **no** `REVIVE_HINT`; anything else → today's
        `peekReplay()` path (`:291-296`).
      - Ordering: `useTerminalIpc`'s `onData` subscription (`use-terminal-ipc.ts:41-43`) is live
        before the snapshot answers, so bytes can arrive mid-request. Net-new
        [`features/terminal/replay-gate.ts`](../packages/app/src/features/terminal/replay-gate.ts):
        `createReplayGate(): { hold(bytes: Uint8Array): void; release(write: (b: Uint8Array) => void): void; readonly open: boolean }`
        — `write` at `terminal-view.tsx:120-131` calls `gate.hold(bytes)` while a snapshot is in
        flight; `release` writes held chunks in arrival order after the snapshot, then `open` is
        `true` and later chunks pass straight through. Chosen over "unsubscribe during the request"
        because a missed `onExit` there would leave the row live forever.
      - Vitest: `replay-gate.test.ts` — chunks held during the gate come out after the snapshot in
        order; nothing is held once open; `release` twice is a no-op.
- [x] Fix cause 2: the reveal primitive exposes `settled` and a `settleCount` that increments each
      time a tween finishes; [`terminal-view.tsx`](../packages/app/src/features/terminal/terminal-view.tsx)
      runs `safeFit()` + `term.refresh(0, rows - 1)` when it changes.
      - Correction to the original text: `use-reveal.ts` has **no** `transitionend` today — entrance
        is the stalled-frame rAF wait (`:78-92`), exit is `setTimeout(ms)` (`:96`). The new hook
        listens for `transitionend` on the element it is given (a returned `ref`) and races it against
        `setTimeout(motionMs() + 50)`, whichever first; the timer is what fires under reduced motion,
        where no transition runs.
      - A counter rather than an `onSettled` callback, because a counter is a plain prop:
        `app.tsx` → `<TerminalPanel fitSignal={terminalTween.settleCount}>` → the active
        `<TerminalView fitSignal>`; an effect on `[fitSignal]` runs `safeFit()` (which already sends
        the resize at `:251-252`) then `termRef.current.refresh(0, termRef.current.rows - 1)`.
        `TerminalPanelProps` (`terminal-panel.tsx:184-188`) gains `fitSignal: number`.
- [x] `use-reveal.ts` grows into a **size tween**:
      `useRevealSize({ open, size, axis, dragging = false }: { open: boolean; size: number; axis: 'x' | 'y'; dragging?: boolean })`
      → `{ ref: RefObject<HTMLElement>, mounted: boolean, shown: boolean, settled: boolean, settleCount: number, style: CSSProperties }`.
      - `style` is exactly `{ [axis === 'x' ? 'width' : 'height']: shown ? size : 0, transitionProperty: dragging ? 'none' : (axis === 'x' ? 'width' : 'height'), transitionDuration: \`${motionMs()}ms\`, transitionTimingFunction: 'ease-in-out' }`.
      - A change in *target* `size` while `shown` and not `dragging` (restore ↔ maximize, a drag
        release) sets `settled=false` and animates through the same curve as open ↔ closed; while
        `dragging` the transition is `'none'` and `settled` stays `true`, as the repos aside already
        does at `app.tsx:632-634`.
      - `mounted` follows `useReveal`'s contract (`:56-104`): `true` on open immediately, `false` after
        the *closing* tween settles — driven by the same `transitionend`/timer race, not a second
        `setTimeout`. Both `mounted` and `shown` initialise from `open` so a persisted-open panel does
        not slide in at boot (the existing rule at `:34-39`).
      - `useReveal(open, ms)` stays exported for the browser pane (below); `useSettled` and
        `REVEAL_HOLD_MS` are deleted once `app.tsx:428` is the only caller and has moved
        (`grep -rn "useSettled\|REVEAL_HOLD_MS" packages/app/src` returns nothing).
      - Vitest `use-reveal.test.ts` gains: `style` shape for both axes; `settleCount` increments once
        per open→closed and once per size change; `dragging` yields `transitionProperty: 'none'`.
- [x] Terminal: closed ↔ `layout.terminalHeight` ↔ maximized all interpolate.
      - `app.tsx:410` `terminalTarget` stays; `:428 useSettled(...)` → `terminalTween =
        useRevealSize({ open: terminalOpen, size: terminalTarget, axis: 'y', dragging: terminal.dragging })`
        where `terminal` is the `useResizable` at `:362-369`.
      - The outer frame at `:739-763` takes `ref={terminalTween.ref}` and `style={terminalTween.style}`,
        dropping `transition-[height] duration-200 ease-in-out` and the `settled ? '' : …` switch;
        the inner box stays `style={{ height: terminalTarget }}` (`:770`) — that pin is what makes
        the pty see one resize.
      - `covering && settled ? 'hidden' : ''` at `:697` reads `terminalTween.settled`; the vertical
        `ResizeHandle` stays unmounted while maximized (`:736-738`, unchanged). `terminalMaximized`
        is a top-level ui-store field (`ui-store.ts:277`), not `layout.*`.
- [x] Session list: the `{showList ? (<>…</>) : null}` fragment at `terminal-panel.tsx:155-160` becomes
      a width tween 0 ↔ `list.current` (`layout.terminalListWidth`), inner list pinned at full width
      (the repos pattern) so rows are clipped rather than reflowed — including when the toggle is
      `sessions.length` crossing 1 (`listable` at `:136`), not a click.
      - `listTween = useRevealSize({ open: showList, size: list.current, axis: 'x', dragging: list.dragging })`;
        render `{listTween.mounted ? (<><div ref={listTween.ref} style={listTween.style} className="shrink-0 overflow-hidden"><div style={{ width: list.current }}><TerminalSessionList agents={agents} width={list.current} /></div></div><ResizeHandle resizable={list} axis="x" label="Resize terminal sessions" /></>) : null}`.
      - The `ResizeHandle` sits outside the tweened box so the drag target does not shrink mid-tween.
- [x] Repos aside: already width-tweened at `app.tsx:617-643`; rehomed on the primitive
      (`reposTween = useRevealSize({ open: reposOpen, size: repos.current, axis: 'x', dragging: repos.dragging })`)
      so all panels share one duration constant, keeping the inner-pinned-width `<div style={{ width: repos.current }}>` at `:637`.
- [x] Browser pane: `<BrowserPane shown={browserReveal.shown} />` at `app.tsx:784` — same curve,
      same duration source. It tweens **opacity**, not size (`browser-pane.tsx:63-65`), so it keeps
      `useReveal(browserOpen)` and swaps its `duration-200` literal for
      `style={{ transitionDuration: \`${motionMs()}ms\` }}`.
- [x] `REVEAL_MS` is the only source of the duration: every reveal-related Tailwind `duration-200`
      becomes `style.transitionDuration` off `motionMs()`. The file's own comment at `use-reveal.ts:3-10`
      says the two are "paired by hand" today; after this they cannot drift.
      - Call sites: `app.tsx:633` (repos), `:760` (terminal), `browser-pane.tsx:63`, and the new
        session-list box. `app.tsx:293` (`transition-transform duration-200` on the nav-lock chevron)
        is **not** a reveal and keeps its literal — say so in the comment that replaces `:3-10`.
      - Verified by shell, not vitest: `grep -rn 'duration-200' packages/app/src` prints exactly one
        line, `app.tsx`'s chevron.
- [x] `html[data-motion='reduced']` collapses every tween to 0 ms, and `settled` still fires so the
      fit-at-end path runs.
      - The attribute is written by `applyMotion` from `@bilo-io/shell` (`app.tsx:810`,
        `appearance-store.ts:120`), never by this repo. `use-reveal.ts` exports
        `motionMs = (): number => document.documentElement.dataset['motion'] === 'reduced' ? 0 : REVEAL_MS`,
        read on every render — no subscription, because a preference change re-renders `App` anyway.
      - With 0 ms no `transitionend` fires; the `setTimeout(motionMs() + 50)` race partner is what
        moves `settled`/`settleCount`.
      - Vitest `use-reveal.test.ts`: with `document.documentElement.dataset.motion = 'reduced'`,
        `style.transitionDuration === '0ms'` and `settleCount` reaches 1 after `vi.advanceTimersByTime(50)`.
- [x] The e2e mock bridge learns to record what this theme asserts on. `ptyCalls` at
      `mock-bridge.ts:1455-1459` gains `resizes: { ptyId: string; cols: number; rows: number }[]`
      (the `resize: noop` at `:871` becomes a push) and `snapshots: string[]` (pushed by the new
      `pty.snapshot` mock, which answers with the bytes it has fed to that pty so far — the mock keeps a
      per-pty `Uint8Array[]` log alongside `ptySessions`). The `__mstudioPty` type in
      `terminal.spec.ts:106-115` widens to match. Without this, the first item cannot assert anything.

### B — Reattach after a renderer reload (M) — ✅ DONE (2026-08-28, merged locally — no PR/no remote; the HMR dev-only manual check stays open)

The substrate for C: the renderer must be able to *rebind* to a pty it did not create, whoever owns
that pty.

- [x] `terminal:list` returns, per session, `live: { ptyId, pid, cols, rows } | null` — main already
      holds `sessionId ↔ ptyId` in `pty-service.ts`'s `sessions` map (`:83`, keyed by **ptyId**, each
      `Session` carrying `sessionId`). Schema in [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts);
      the `ipc.test.ts` every-channel guard gets its row.
      - `RestoredTerminalSession` (`schemas.ts:844-847`) gains
        `live: z.object({ ptyId: z.string().min(1), pid: z.number().int().positive(), cols: z.number().int().positive(), rows: z.number().int().positive() }).nullable()`
        — no pty schema carries a `pid` today; this is the first.
      - `pty-service.ts` exports `livePtyFor(sessionId: string): { ptyId: string; pid: number; cols: number; rows: number } | null`
        (`Session` gains `cols`/`rows`, updated in `resizePty`; `pid` is `pty.pid`);
        `listTerminals()` in `terminal-service.ts:52` joins it per session.
      - `ipc.test.ts:950` `CASES` row for `TerminalListResponse`: valid gains a `live` entry and a
        `live: null` entry; invalid gains `['live.pid zero', …]`. The `expected` table at `:1145` is
        unchanged (no new channel here).
      - Mock: `data.terminalSessions[]` entries accept `live?: { ptyId, pid, cols, rows }` and the
        `terminal.list` mock at `mock-bridge.ts:902-907` passes it through (defaulting `null`).
- [x] `hydrate()` in [`terminal-store.ts:199-241`](../packages/app/src/features/terminal/terminal-store.ts)
      binds a live `ptyId` (`ptyIds[id] = live.ptyId`, `states[id] = 'open'`) instead of leaving the row
      `'exited'`; a live row gets **no** `replay` entry — the view fetches the snapshot itself (A) —
      so "what the shell printed while nobody was watching" comes from the ring buffer, not the disk log.
      - Also sets `reattachedCount: number` and `reattachedAt: number` (new state, renderer-only) to
        the number of live rows bound — Theme C's launch note reads them.
      - Vitest `terminal-store.test.ts` gains `describe('hydrate')` (none exists today):
        `'binds a live row without creating a pty'` (mock `terminal.list` → one live entry; assert
        `ptyIds`, `states[id] === 'open'`, `replay[id]` undefined, `pty.create` never called) and
        `'marks a dead row exited with its replay'` (today's behaviour, now asserted).
- [x] `terminal-view.tsx`'s mount path distinguishes **rebind** from **revive**: a live session
      replays the snapshot and attaches — no `REVIVE_HINT`, no spawn on Enter — and re-sends `resize`
      so the shell's columns match the new xterm.
      - The branch is A's `stateRef.current === 'open'` test in `openWhenSized`; the resize is the one
        `safeFit()` at `:278` already sends — keep it, do not add a second. `RESET_MODES` (`:90-91`) is
        written after the snapshot in both branches, since a live shell may have left the alternate
        screen on.
      - The `onData` handler at `:306-325` is unchanged: `'open'` forwards keystrokes, so Enter on a
        rebound session types into the live shell.
- [x] Main subscribes `webContents` `render-process-gone` in
      [`index.ts`](../packages/desktop/src/main/index.ts) — today nothing observes renderer lifecycle,
      and `window-chrome.ts:84-89`'s reload IPC is one of the ways in.
      - **Resolved — log, keep ptys, and `win.webContents.reload()`** unless `details.reason === 'clean-exit'`.
        The renderer comes back through the same path as a menu reload and rebinds via `hydrate`; the
        log line is `[renderer] gone reason=${details.reason} exit=${details.exitCode}` through the
        `log` dep the broker client introduces (Theme C) — or `console.warn` with a per-line
        `eslint-disable-next-line no-console` until C lands.
      - `did-finish-load` is **not** subscribed: the `webContents` survives a reload, so the
        closure-captured `win` in `createPty` keeps delivering (`pty-service.ts:246-261`). Theme C
        moves the send site to the `getWindow()` thunk anyway.
      - Not testable under desktop vitest (imports `electron`); verified by a human line below.
- [x] Vitest: the two `hydrate` cases above. Playwright: `terminal.spec.ts` gains
      `'a reload keeps live sessions live'` — `data.terminalSessions` with two `live` entries,
      `page.reload()`, then `__mstudioPty.creates.length === 0`, `snapshots.length === 2`, and both rows
      carry `data-phase="live"` (Theme D's attribute; until D lands, assert the absence of the dimmed
      class instead).
- [ ] Dev: HMR of `terminal-view.tsx` no longer strands shells — the `moon run desktop:start` pain that
      motivated the theme, checked by hand once.
- [x] The `mstudio:pty:snapshot` channel A's fix consumes: `CHANNELS.ptySnapshot = 'mstudio:pty:snapshot'` in
      [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts) beside `ptyKill` (`:241`);
      `PtySnapshotRequest = z.object({ ptyId: z.string().min(1) })` in `schemas.ts`; the response is
      `{ bytes: Uint8Array }`, unvalidated like `ptyData` (`z.instanceof(Uint8Array)` is the only
      check zod can do and the every-channel guard already exempts the data path).
      - `ipc.test.ts`: `expected` gains `ptySnapshot: ['PtySnapshotRequest']` and `CASES` its row.
      - Preload [`preload/index.ts:204-214`](../packages/desktop/src/preload/index.ts) gains
        `snapshot: (req) => call(CHANNELS.ptySnapshot, req)`;
        [`ipc/bridge.ts:323-346`](../packages/shared/src/ipc/bridge.ts) gains
        `snapshot: (req: In<typeof S.PtySnapshotRequest>) => Promise<{ bytes: Uint8Array }>`.
      - Handler in [`pty-handlers.ts`](../packages/desktop/src/main/ipc/pty-handlers.ts) via `handle()`
        like `ptyCreate` (`:17`): `{ bytes: trimScrollback(readScrollback(sessionIdOf(ptyId)), SCROLLBACK_BYTES) }`;
        an unknown `ptyId` answers `{ bytes: new Uint8Array(0) }`, never throws.

### C — The session broker (L) — ✅ DONE (2026-08-28)

- [x] `packages/desktop/src/broker/` — a standalone entry built beside `main` and `preload`, spawned
      as `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, `detached: true`, `stdio` to a log file,
      `.unref()`. Same binary ⇒ same ABI ⇒ `moon run desktop:rebuild-native` stays the whole native
      story. **Resolved — a third esbuild output, asar-unpacked.**
      - [`scripts/bundle.mjs`](../packages/desktop/scripts/bundle.mjs) gains a third
        `build({ ...common, entryPoints: [resolve(root, 'src/broker/index.ts')], outfile: resolve(root, 'dist/bundle/broker.js') })`
        — `common.external` already lists `node-pty`, so the broker resolves it at runtime.
      - [`electron-builder.yml`](../packages/desktop/electron-builder.yml) `asarUnpack` (`:33-40`) gains
        `dist/bundle/broker.js` **and** `'**/node_modules/node-pty/**'` (the whole package, not only
        `'**/*.node'`), so a Node process outside the asar can `require` it from disk without relying on
        Electron's asar patch being active in `ELECTRON_RUN_AS_NODE` mode.
      - Spawn, in net-new [`main/broker-client.ts`](../packages/desktop/src/main/broker-client.ts):
        `spawn(process.execPath, [brokerScript()], { detached: true, stdio: ['ignore', logFd, logFd], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).unref()`
        where `brokerScript = () => join(__dirname, 'broker.js').replace('app.asar', 'app.asar.unpacked')`
        — `__dirname` is `dist/bundle` in dev and `…/app.asar/dist/bundle` packaged, the same
        sibling-of-main rule `window.ts:60` uses for `preload.js`.
      - `ELECTRON_RUN_AS_NODE` is set on the **child env explicitly** and never inherited:
        [`scripts/start-electron.mjs:22`](../packages/desktop/scripts/start-electron.mjs) deliberately
        deletes it from main's own env (editors that are Electron apps leak it), and that stays.
      - Inside the broker: `require(join(__dirname, '..', '..', 'node_modules', 'node-pty'))` resolved
        against the unpacked directory; a failure is fatal to the broker (exit code 3) and main's
        fail-soft path takes over.
- [x] Protocol over a unix domain socket at
      `join(userData, 'broker', \`${app.getVersion()}${app.isPackaged ? '' : '-dev'}.sock\`)`:
      length-prefixed frames, a `hello` handshake carrying `{ protocol, appVersion, pid }`. Namespaced
      by version **and** a `-dev` suffix because `app.setName('Midnite Git')` (`index.ts:85`) makes the
      dev server and the installed app share `userData`, and two builds attaching to one broker is the
      first bug this design would otherwise ship.
      - Frame layout, in net-new [`broker/protocol.ts`](../packages/desktop/src/broker/protocol.ts):
        `[u8 type][u32 BE payloadLength][payload]`. `type 0x00` = control, payload UTF-8 JSON
        `{ t: string; id?: number; … }`; `type 0x01` = pty data, payload = 36 ASCII bytes of `ptyId`
        (`randomUUID()` is fixed-width) followed by raw bytes. Exports
        `encodeControl(msg): Buffer`, `encodeData(ptyId, bytes): Buffer`, and
        `createFrameDecoder(): { push(chunk: Buffer): Frame[] }` that handles partial and coalesced
        frames. `export const PROTOCOL = 1`.
      - **Resolved — a frozen core verb set.** `hello`, `list`, `attach`, `kill` are protocol-0 shapes
        every future `PROTOCOL` must keep byte-compatible, so a mismatched broker can still be listed
        and its sessions read or killed (see version skew below). Everything else (`create`, `resize`,
        `detach`, `snapshot`, `shutdown`) is versioned.
      - Replies: `{ t: 'reply', id, ok: true, … } | { t: 'reply', id, ok: false, code: 'protocol' | 'unknown-pty' | 'spawn-failed', message }`
        — the `GitOpResult` habit, over the socket. Unsolicited: `{ t: 'exit', ptyId, exitCode, signal? }`
        and data frames.
      - macOS caps `sun_path` at 104 bytes; `~/Library/Application Support/Midnite Git/broker/0.12.0-dev.sock`
        is ~75. `broker-client` asserts `Buffer.byteLength(path) < 104` and otherwise fails soft
        with reason `'socket path too long'`.
      - **Resolved — filesystem permissions are the auth.** `broker/` is created `0700`, the socket
        `chmod 0600` immediately after `listen`, the pidfile `<same>.pid` written `0600`. Same trust
        boundary as `terminals.json` and `scrollback/*.bin` in the same directory, which already hold
        every transcript; a shared-secret token was considered and rejected (Decisions).
- [x] The broker owns what `pty-service.ts` owns today: spawn (`$SHELL -l` via `resolveShell()`
      `:146-152`, `name: 'xterm-256color'`), write, resize, kill, the per-session ring buffer
      (`scrollbackBySession` `:92`, `appendScrollback` `:103-114` with its `× 2` slack), `initialInput`
      deferred to the first output chunk (`:226-244`), and the 15 s disk flush. `terminal-store.ts`
      moves with it — it already takes a directory and imports no `electron`, which is what makes the
      move a `git mv` to `broker/terminal-store.ts` (its test moves too).
      - **Resolved — main sends the full `env` in every `create` frame.** The broker never computes an
        environment: `pty-service.ts` keeps building `{ ...process.env, TERM_PROGRAM: 'midnite-git', GIT_TERMINAL_PROMPT: '1' }`
        (`:192-200`, `PATH` already fixed by `ensureLoginShellPath()` at `index.ts:99`) and ships it.
        A broker started by v1.2 spawns v1.3's env once v1.3 connects, and the Phase 21 `PATH` lesson
        stays in one file.
      - `create { sessionId, cwd, cols, rows, env, initialInput? }` → `{ ptyId, pid }`.
      - The **scrollback** flush (`FLUSH_INTERVAL_MS = 15_000`, `terminal-service.ts:35`) moves into
        the broker, which now owns the bytes; the **metadata** debounce (`SAVE_DEBOUNCE_MS = 1_000`,
        `:29`, `terminals.json`) stays in main, which owns the rows. `flushScrollback()` in main becomes
        a `flush` verb to the broker.
- [x] `pty-service.ts` becomes the broker's client behind an **unchanged exported surface** —
      `isPidAlive`, `setAgentWatcher`, `readScrollback`, `seedScrollback`, `scrollbackSessionIds`,
      `dropScrollback`, `CreateResult`, `writePty`, `resizePty`, `killPty`, `ptySessionCount`, plus
      B's `livePtyFor` — so [`pty-handlers.ts`](../packages/desktop/src/main/ipc/pty-handlers.ts),
      [`terminal-service.ts`](../packages/desktop/src/main/terminal-service.ts) and `agent-watcher`
      keep their shape; `isPidAlive` and the `ps` probe take the pid from the broker's `created` reply.
      - Two deliberate signature changes, both with one caller: `createPty(win, options)` (`:156`)
        drops `win` — event forwarding moves from the closure-captured window to the
        `getWindow()` thunk (`index.ts:52` pattern) inside `pty-service`, so a replaced window is
        re-resolved per send; and `killAllPtys()` (`:329`) is renamed `detachAll()` because it no
        longer kills — its three callers in `index.ts:206/215/221` are rewritten in the quit item.
      - `readScrollback(sessionId)` (`:117`) becomes async-backed by a `snapshot` verb with a 200 ms
        in-main cache per `sessionId`, so B's `pty:snapshot` handler and `listTerminals()` do not
        each round-trip.
- [x] `SCROLLBACK_BYTES` in [`shared/src/terminal.ts:206`](../packages/shared/src/terminal.ts) rises
      from `256 * 1024` to `1024 * 1024` per session — **resolved, 1 MB** — the buffer no longer lives
      in a process the renderer can restart. `appendScrollback`'s live cap becomes 2 MB; `trimScrollback`
      still writes ≤ 1 MB + 4 to disk. Thirty sessions are 30 MB in the broker, 60 MB worst case.
- [x] Lifecycle: main connects on boot, spawning a broker if the socket is dead (stale file → unlink →
      spawn); the broker **exits itself when its last session is killed**; a pidfile beside the socket
      plus `hello` makes "is one already running for this version" answerable. `SIGTERM` flushes and
      lets the ptys die with it.
      - Numbers: `net.connect(path)` must reach `hello`'s reply within **2 s** or the socket is stale
        → `unlink` socket and pidfile → spawn → retry connect every 100 ms for up to **5 s** → fail
        soft. `ECONNREFUSED`/`ENOENT` on the first connect skip straight to spawn.
      - Self-exit rule, precisely: the broker exits when `sessions.size === 0` **and** no client is
        connected. While main is connected it stays up with zero sessions (a fresh app that has not
        opened a terminal yet must not spawn a broker per keystroke); on the last client's disconnect
        with zero sessions it exits within 1 s. `SIGTERM` → flush every ring to disk → exit; the ptys
        are its children and die with it — this is the *only* path that kills without a click, and
        only the OS or the user sends it.
      - Two mains of the same version cannot race: `requestSingleInstanceLock()` (`index.ts`) already
        forbids it; dev and packaged differ by `-dev`.
- [x] `before-quit` in `index.ts:201-218` **detaches** — `shutdownTerminals()` (metadata flush), then
      `brokerClient.disconnect()` — instead of `killAllPtys()`; `window-all-closed` (`:220-226`)
      likewise: today it kills every pty when the window closes on darwin while the app stays alive,
      so closing the window and reopening from the Dock resurrected dead rows. After this, `activate`
      (`:179-190`) → `createWindow()` → `hydrate` → the same rebind as a reload. Phase 15's
      "processes die on quit" contract is overturned here; its open manual check (*"`ps` shows no
      surviving shells"*, [`phase-15-multi-terminal-sessions.md:143`](phase-15-multi-terminal-sessions.md))
      gets a one-line *superseded by Phase 30* note and is left unticked.
- [x] Launch note: after `hydrate`, a status-bar segment reads *Reattached N sessions* for 4 s.
      Phase 27 landed `STATUS_SEGMENTS` as **static composition** (`segments.ts:41`, entries
      `{ id, zone, priority, label, El }`), not a registration store — so this is a permanent entry
      whose `El` renders `null` almost always.
      - Entry: `{ id: 'reattached-note', zone: 'left', priority: 40, label: 'Reattached sessions', El: ReattachedNote }`
        appended after `active-worktree` (left/30).
      - Net-new [`status-bar/reattached-note.tsx`](../packages/app/src/features/status-bar/reattached-note.tsx):
        reads `reattachedCount`/`reattachedAt` from `useTerminalStore`; renders
        `<span role="status" className="animate-fade-in text-xs text-muted-foreground">Reattached {n} session{n === 1 ? '' : 's'}</span>`
        while `Date.now() - reattachedAt < 4000` (a `setTimeout` to the boundary flips local state),
        else `null`; `null` when `count === 0`. `animate-fade-in` is the existing 160 ms Tailwind
        keyframe (`tailwind.config.ts:201`). No dialog, no confirm on quit.
      - Pure helper `noteText(count: number): string | null` tested in `reattached-note.test.ts`
        (`0 → null`, `1 → 'Reattached 1 session'`, `3 → 'Reattached 3 sessions'`).
- [x] Version skew: a broker whose `protocol` does not match is **left running**; its sessions list as
      asleep behind a banner (*From a previous version — restart sessions?*) while the new broker starts
      on its own socket. Nothing is killed until the user chooses.
      - Main enumerates `<userData>/broker/*.sock` other than its own at boot; for each, connect +
        `hello` (core verbs). Mismatch → keep it in `legacyBrokers: Map<socketPath, Connection>`; its
        `list` reply supplies rows. `RestoredTerminalSession` gains `legacy: z.boolean().optional()`
        (never persisted — derived per `listTerminals()`), and `sessionPhase()` (Theme D) answers
        `'asleep'` for `legacy`.
      - Banner lives at the top of [`terminal-session-list.tsx`](../packages/app/src/features/terminal/terminal-session-list.tsx)
        when any row is `legacy`: text *From a previous version — restart sessions?*, buttons
        **Restart** (for each legacy row: `kill` through *its* broker, then `openSession` at the same
        `cwd`/`kind`/`agentId`) and **Dismiss** (hide the banner for this launch; rows stay asleep).
        Clicking a legacy row attaches read-only: `attach` streams the transcript, keystrokes are
        dropped with the ended strip's *Start new shell here* offered.
      - A legacy broker with zero sessions needs no action: main disconnects from it after an empty
        `list`, and the last-client rule exits it.
- [x] Fail-soft: if the broker cannot be spawned or the socket handshake fails, today's in-main pty
      path is used and the reason reaches the user.
      - The in-process implementation is extracted verbatim to
        [`main/inproc-pty.ts`](../packages/desktop/src/main/inproc-pty.ts); `pty-service.ts` is a
        facade choosing a backend once, at the first `createPty` (or at boot if `MGIT_PTY_INPROC=1` is
        set — the flag that exists for exactly this and for the e2e/CI machines).
      - Surfacing: `TerminalListResponse` gains `broker: z.object({ mode: z.enum(['broker', 'inproc']), reason: z.string().optional() })`;
        [`terminal-header.tsx`](../packages/app/src/features/terminal/terminal-header.tsx) shows a
        `TriangleAlert` (lucide-react, matching the file) with tooltip
        *Sessions will not survive quit — ${reason}* while `mode === 'inproc'` and `reason` is set.
        The existing `unavailable` state's message is reserved for "in-process also failed".
- [x] Vitest against an in-process broker on a temp socket:
      - [`broker/protocol.test.ts`](../packages/desktop/src/broker/protocol.test.ts): a control frame
        split across three `push`es decodes once; two frames in one chunk decode as two; a data frame's
        first 36 bytes round-trip as the `ptyId`; a `payloadLength` larger than 16 MB is rejected.
      - [`broker/server.test.ts`](../packages/desktop/src/broker/server.test.ts):
        `createBrokerServer({ socketPath: join(mkdtempSync(...), 'b.sock'), spawnPty: fakePty, now, log })`
        — node-pty is an injected `spawnPty` so the suite needs no native module. Cases: `hello` with
        `protocol: 99` gets `{ ok: false, code: 'protocol' }` and the socket closes; a `list` from a
        mismatched client still answers; a pre-existing dead socket file is unlinked and re-listened;
        the server's `closed` promise resolves after the last `kill` with no client; a `kill` while the
        fake pty is mid-`onData` emits `exit` exactly once and no data frame after it; socket and
        pidfile modes are `0o600` after `listen`.
      - [`main/broker-client.test.ts`](../packages/desktop/src/main/broker-client.test.ts) with fake
        timers: no `hello` within 2 s → `spawn` dep called once; no connect within 5 s after spawn →
        `mode: 'inproc'` with `reason`; `hello` mismatch → `legacyBrokers.size === 1` and a fresh spawn.
- [x] Boundary: the broker imports node-pty and `node:net` and nothing from `electron` — it is a Node
      program that happens to run under Electron's binary. [`eslint.config.mjs`](../eslint.config.mjs)
      gains a group `{ files: ['packages/desktop/src/broker/**/*.ts'], ...deny([NO_ELECTRON]) }`
      after the `packages/app/src/**` group (`:98`) — desktop has no boundary group today, this is its
      first.
- [x] Observability: every lifecycle decision is one log line, through an injectable
      `log: (message: string) => void` on `BrokerClientDeps` (the `metrics/gpu.ts:69` shape, default
      `console.warn`, since main has no logger) — `[broker] spawned pid=N socket=…`,
      `[broker] connected protocol=N sessions=N`, `[broker] stale socket unlinked`,
      `[broker] handshake mismatch theirs=N ours=N — left running`,
      `[broker] unavailable (reason) — in-process ptys`. The broker's own stdout/stderr go to
      `<userData>/broker/<version>[-dev].log` (opened `'a'`, the `logFd` in the spawn), truncated to
      its last 1 MB on broker start; each line is `${new Date().toISOString()} ${message}`.

### D — Honest session states: live, asleep, ended (M) — ✅ DONE (2026-08-28, feature/p30-d)

- [x] A derived `SessionPhase = 'live' | 'asleep' | 'ended'` in `terminal-store.ts` over the process
      states: live = pty bound; asleep = deliberately slept (transcript kept, no process); ended = the
      process exited or was lost. One exported `sessionPhase()` so the row, the header and the
      status-bar count read the same answer.
      - `export function sessionPhase(session: Pick<TerminalSession, 'asleep'> & { legacy?: boolean }, state: ConnectionState | undefined): SessionPhase`.
        Table: `session.legacy` → `'asleep'`; else `session.asleep === true` → `'asleep'`; else
        `state === 'open' || state === 'starting' || state === 'idle'` → `'live'` (`'idle'` is the
        instant before auto-start — without it a new session flashes the ended strip); else
        (`'exited'`, `'unavailable'`, `undefined`) → `'ended'`.
      - Rows render `data-phase={phase}` for tests and CSS; the dimmed treatment is `opacity-60` on
        `!== 'live'`.
      - Vitest `terminal-store.test.ts` `describe('sessionPhase')`: the seven rows of that table.
- [x] The ended banner: `REVIVE_HINT` (`terminal-view.tsx:75`, a dim line in the scrollback, invisible
      under a long transcript) is replaced by an overlay strip at the foot of the pane — *Session ended ·
      exit N* with **Start new shell here** and, for agent rows, **Resume conversation**. Enter still
      starts a new shell (`:323-324`, unchanged); the transcript stays readable behind the strip.
      - Net-new [`features/terminal/ended-banner.tsx`](../packages/app/src/features/terminal/ended-banner.tsx):
        `EndedStrip({ exitCode, resume, onStartShell, onResume }: { exitCode: number | undefined; resume: string[] | undefined; onStartShell(): void; onResume(): void })`,
        rendered by `TerminalView` after its container (`:425-426`) when `phase === 'ended'`;
        `absolute inset-x-0 bottom-0 h-8 flex items-center gap-2 px-3 bg-background/90 border-t border-border text-xs`,
        `role="status"`. Copy: `Session ended · exit ${exitCode}`, or just `Session ended` when
        `exitCode` is `undefined` (a restored row — the code was never seen).
      - `exitCodes: Record<string, number>` in the renderer store, written by `onExit` in
        `use-terminal-ipc.ts:44-63` (which drops `exitCode` today) and cleared by `bindPty`.
      - The strip does not steal focus when a session ends under the user; its two buttons are in
        the Tab order after xterm's textarea (DOM order). Primary = *Start new shell here*.
- [x] `AgentDefinitionSchema` (`terminal.ts:36-57`) gains **`resume: z.array(z.string()).optional()`**
      — **resolved, args not a command line** — roster data beside `install`; absent means no Resume
      button, never a guess.
      - `BUILTIN_AGENTS`: `claude` → `['--continue']`, `codex` → `['resume', '--last']`; `agy` and
        `openclaude` get none. The Resume input is `agentInput({ ...agent, args: agent.resume })`
        (`terminal-panel.tsx:196-201`), so `command` is never restated in the roster.
      - `mergeAgents` (`agents-store.ts:50-64`) replaces a builtin **whole**, so an `agents.json`
        override that wants `resume` must restate `id`/`label`/`command`/`accent` too — documented in
        the schema's doc comment.
      - `terminal.test.ts` gains: `resume` parses as an array, rejects a string, and is absent on
        `agy`.
- [x] **Sleep**: a context-menu action that kills the process and keeps the row and transcript
      (dimmed, a moon glyph beside the `StateDot`). Click/Enter revives via the existing
      spawn-at-`session.cwd` path; an agent with a `resume` revives through it rather than cold.
      - **Resolved — `asleep: z.boolean().optional()` on `TerminalSessionSchema`** (`terminal.ts:136-158`),
        persisted in `terminals.json` through the existing `terminal.save`, so a slept row survives a
        reload and a relaunch as *asleep*, not *ended*. `parseStoredSessions` tolerates its absence;
        no migration.
      - Store action `sleepSession(sessionId)`: `pty.kill({ ptyId })` → `unbindPty` →
        `setState(id, 'exited')` → `save({ ...session, asleep: true })`. Revive (`startRef` in
        `terminal-view.tsx:324` and the click path) saves `asleep: false` first, and for an agent with
        `resume` passes `agentInput({ ...agent, args: agent.resume })` as `initialInput`.
      - Menu: `showMenu` at `terminal-session-list.tsx:164-178` gains `{ type: 'separator' }` then
        `{ label: 'Sleep session', icon: Moon, disabled: phase !== 'live', disabledReason: 'Only a live session can be slept.', onSelect }`.
        `Moon` from `lucide-react`, matching the file's `Terminal, X` import (`:2`) — not `LuMoon`.
      - Glyph: `<Moon className="h-3 w-3 text-muted-foreground" aria-label="Asleep" />` between the
        `SessionIcon` and the name when `phase === 'asleep'`.
- [x] The **row** `X` confirms through `useDialogs().confirm` when a foreground process is running,
      naming the command (Theme E supplies it); a bare prompt closes without asking. The header `X`
      (`terminal-header.tsx:90-95`, *Hide terminal*) only hides and never kills — unchanged.
      - Site: the `IconButton icon={X} label="Close terminal"` at `terminal-session-list.tsx:252-261`.
        Rule: `phase === 'live' && foregroundCommand[id]` →
        `confirm({ title: 'Close this session?', body: \`${command} is still running and will be killed.\`, confirmLabel: 'Close session', danger: true, onConfirm: () => closeSession(id) })`
        (`ConfirmRequest`, `confirm-dialog.tsx:20`; `confirmLabel` is required); otherwise
        `closeSession(id)` directly. `closeSession` (`terminal-store.ts:135`) keeps its `pty.kill` +
        `terminal.forget` body.
- [x] Row glyph and `StateDot` distinguish the three phases; the `live` predicate at
      [`terminal-session-list.tsx:151`](../packages/app/src/features/terminal/terminal-session-list.tsx)
      and the copy of it at [`agent-count.tsx:6`](../packages/app/src/features/status-bar/agent-count.tsx)
      are both re-expressed as `sessionPhase(session, state) === 'live'`.
      - [`components/state-dot.tsx`](../packages/app/src/components/state-dot.tsx): `DotState` gains
      - `'asleep'` — a static `bg-muted-foreground/50` dot, no pulse; the row passes
        `state={phase === 'asleep' ? 'asleep' : state}`.
      - `agentCount(sessions, states)` keeps its signature; it now reads `session.asleep` through
        `sessionPhase`, so a slept agent is not counted.
- [x] Vitest for the phase derivation table; Playwright in `terminal.spec.ts`:
      `'sleeping a session keeps its row and transcript'` (`__mstudioPty.kills.length === 1`, the row
      still present with `data-phase="asleep"`, `terminalSaves.at(-1).asleep === true`);
      `'an ended pane shows the strip and Enter starts a shell'` (`getByRole('status')` contains
      `Session ended`, then Enter → `creates.length` grows by 1);
      `'Resume sends the roster's resume args and nothing else'` (`creates.at(-1).initialInput ===
      agentInput({ ...claude, args: ['--continue'] })`).
- [x] The version-skew banner (Theme C) is this theme's UI: rendered by `terminal-session-list.tsx`
      above the rows when any `legacy` row exists, `role="alert"`, two buttons, copy as C specifies;
      its Playwright case seeds `data.terminalSessions[].legacy = true` and asserts **Restart** yields
      one `kill` and one `create` per legacy row and the banner is gone.
- [x] Accessibility of the new surfaces: the ended strip and the launch note are `role="status"`
      (announced, not interrupting); the skew banner is `role="alert"`; the Moon glyph has
      `aria-label="Asleep"`; `data-phase` on rows gives Playwright and CSS one hook. No new chord in
      this phase — Sleep and Resume are menu and strip actions only; palette entries are Phase 23's.
- [x] Screenshots per the visual convention (see Verification): the ended strip, a slept row beside a
      live one, the launch note, the skew banner — light and dark, at the default density.

### E — Naming from the process tree (M — re-tagged from S: a channel, a `ps` column and fifteen fixtures) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] Delete `trackShellCommand`, `ShellLineState`, `createShellLineState` (`activity-detect.ts:102-116`)
      and `describe('trackShellCommand')` (`activity-detect.test.ts:71-101`); the `shellLineRef` at
      `terminal-view.tsx:118` and its use at `:312-313` go with them.
- [x] `agent-watcher.ts` reports the shell's **foreground process** beside the matched agent: `ps`
      runs `-axo pid=,ppid=,args=` today (`agent-process.ts:82-85`); adding `stat=` gives the `+` flag
      that marks the foreground process group, so "what the user is running" is a column, not a
      heuristic over children.
      - `ProcessRow` (`agent-process.ts:47`) becomes `{ pid: number; ppid: number; stat: string; args: string }`;
        `parsePsOutput` (`:101`) reads **four** columns always — `pid`, `ppid`, `stat` as the first
        three whitespace tokens, `args` the rest — never guessing the column count.
      - New `foregroundOf(rows: readonly ProcessRow[], rootPid: number): ProcessRow | null`: among
        `descendantsOf(rows, rootPid)` (`:128`), those with `stat.includes('+')`, excluding `rootPid`
        itself (a shell at its prompt carries `+` too); **resolved — the last `+` member by pid** (the
        highest pid; shells fork pipeline members left-to-right, so `git log | less` names `less`,
        which is what the user is looking at); `null` when none.
      - The probe in `agent-watcher.ts:184-188` computes `command = fg ? commandLabel(fg.args) : null`
        alongside `agentId`, same 750 ms quiet cadence (`QUIET_MS`, `:46`) and the shared 250 ms
        snapshot (`ROWS_TTL_MS`, `:63`), change-only, through a second dep `emitCommand`.
- [x] `setAutoName` for shell sessions is fed from that event — basename plus args, truncated — and
      **held** after the command exits until the next one. `onTitleChange` (OSC 0/2) stays the fallback
      for a bare prompt; agent sessions keep their title-based naming.
      - `commandLabel(args: string): string` (exported from `agent-process.ts`, pure): split on
        whitespace, `basename(argv[0])`, rejoin with single spaces, truncate to **40** characters with a
        trailing `…`. `pnpm dev`, `git rebase -i main`, `less`.
      - Renderer: `use-terminal-ipc.ts` subscribes `onCommandChanged` and calls
        `setForegroundCommand(sessionId, command)` (new store field
        `foregroundCommand: Record<string, string | null>`, also read by D's `X`-confirm); for
        `kind === 'shell'` a non-null command also calls `setAutoName(id, command)`; `null` changes
        nothing (held).
      - Shells now also subscribe `term.onTitleChange` (today agent-only, `terminal-view.tsx:174-180`),
        but a title applies only while `foregroundCommand[id]` has **never** been non-null for the
        session — a held command name outranks a later prompt title.
- [x] Vitest against `__fixtures__` listings (all eleven existing files gain a `stat` column by hand —
      `Ss`/`S`/`S+` — since the parser no longer accepts three): `ps-foreground-single.txt` (zsh →
      `pnpm dev` `S+` → `'pnpm dev'`); `ps-foreground-pipeline.txt` (`git log` pid 501 `S+`, `less`
      pid 502 `S+` → `'less'`); `ps-bare-prompt.txt` (only the `zsh` row, `Ss+` → `null`);
      `ps-background-job.txt` (`sleep 100` `S`, no `+` → `null`); the existing
      `ps-node-wrapper.txt` false-positive guard keeps passing.
- [x] The `pty:command-changed` event: `EVENT_CHANNELS.ptyCommandChanged = 'mstudio:pty:command-changed'`
      beside `ptyAgentChanged` (`channels.ts:378`);
      `PtyCommandChangedEvent = z.object({ ptyId: z.string().min(1), command: z.string().min(1).nullable() })`
      in `schemas.ts` after `PtyAgentChangedEvent` (`:829-832`); `ipc.test.ts` `expected` gains
      `ptyCommandChanged: ['PtyCommandChangedEvent']` and a `CASES` row (invalid: empty string
      command); preload `onCommandChanged: (handler) => subscribe(EVENT_CHANNELS.ptyCommandChanged, handler)`
      at `preload/index.ts:211-213`; `bridge.ts` `pty.onCommandChanged`; the `index.ts:126-133`
      wiring gains the second `webContents.send`. Mock bridge: `__mstudioPtyCommand(ptyId, command)`
      beside `__mstudioPtyAgent` (`mock-bridge.ts:1502-1508`).

### F — The indicator that never span (M) — ✅ DONE (2026-08-28, merged locally — no PR/no remote; the two "Open, for a human" manual passes stay open, needing macOS Reduce Motion and a real shell)

The reported defect and the three things around it that share a cause: an activity glyph is decided
by what the session was *opened as*, drawn with an animation that a reduced-motion machine freezes,
and rendered identically whether the detector said "idle" or never said anything at all.
Renderer-only; nothing here needs the broker.

- [x] The gate reads what is **running**, not what the session was **opened as**.
      - `session.kind` is fixed at creation, but Phase 21's `ps` probe already reports the truth
        through `liveAgentId` and
        [`resolveSessionAgentId(session, liveAgentId)`](../packages/app/src/features/terminal/terminal-store.ts)
        (`terminal-store.ts:591`). The list component already selects `liveAgentId` (`:45`) and
        already computes `runningAgent` off it (`:115-117`) — so typing `claude` in a plain shell
        gets the Claude icon and its accent, and **never** the spinner. That is the reported bug: the
        data is present, the gate reads the wrong field.
      - Three sites, all becoming `resolveSessionAgentId(session, liveAgentId) !== undefined`:
        [`terminal-session-list.tsx:316`](../packages/app/src/features/terminal/terminal-session-list.tsx)
        (`session.kind === 'agent' && live` → `isAgentRow && live`, `isAgentRow` computed beside
        `phase` at `:199`), [`terminal-view.tsx:143`](../packages/app/src/features/terminal/terminal-view.tsx)
        (`if (session.kind !== 'agent') return;`), and
        [`agent-count.tsx:22`](../packages/app/src/features/status-bar/agent-count.tsx).
      - `terminal-view.tsx` does not select `liveAgentId` today. It gains
        `const agentId = useTerminalStore((s) => resolveSessionAgentId(session, s.liveAgentId));`
        and `writeToTerm`'s dep array (`:148`, today `[session.id, session.kind]`) becomes
        `[session.id, agentId]`, so the probe changing its mind re-arms the callback.
      - `agentCount` keeps its `(sessions, states)` signature and gains a third parameter
        `liveAgentId: Record<string, string | null>` — it is a pure function with its own test and
        the store selector at `agent-count.tsx:35` supplies it. Theme D's
        `sessionPhase(session, state) === 'live'` clause is untouched.
      - Acceptance: an e2e session with `kind: 'shell'` for which `__mstudioPtyAgent(ptyId, 'claude')`
        has fired renders `[data-activity]` on its row; the status bar counts it.
- [x] `SessionActivity` gains `'idle'`, so `undefined` can stop meaning it.
      - [`terminal-store.ts:50`](../packages/app/src/features/terminal/terminal-store.ts):
        `export type SessionActivity = 'thinking' | 'waiting' | 'idle';`. `activity` (`:109`),
        `setActivity` (`:202`, `:478`) and the `dropSessionState` delete (`:490`) are unchanged —
        the union widens, the plumbing does not.
      - **`undefined` now means "live, and the detector has not spoken"**, which is a fourth thing to
        draw, not a synonym for idle. Nothing emits `'idle'` until Theme G's decay ladder; that is
        deliberate and stated rather than churning the file twice, and the vitest below covers the
        `'idle'` arm so it is not untested dead code.
- [x] `ActivityIndicator` (`terminal-session-list.tsx:356`) grows the fourth arm and the test hook.
      - The outer fixed-width span gains `data-activity={activity ?? 'unknown'}` — the sibling of
        Theme D's `data-phase` at `:253`, and the only hook Playwright and the reduced-motion CSS
        below need. The `flex size-3.5 shrink-0 items-center justify-center` slot is unchanged: the
        14px reservation is what stops the `StateDot` shifting sideways.
      - Arms: `'thinking'` → `<Spinner label="Thinking" />`; `'waiting'` → `<WaitingDots />`;
        `'idle'` → `<IdleCaret />`; `undefined` → new `<UnknownDot />`.
      - `function UnknownDot()` beside `IdleCaret` (`:428`):
        `<span role="img" aria-label="Activity unknown" className="size-1 rounded-full bg-muted-foreground/35" />`
        — a 4px dot at 35%, deliberately the quietest mark in the slot. It is smaller than the
        `StateDot` beside it (`size-1.5`) so the pair never reads as two connection dots.
      - Rationale, for the comment that goes above it: the detector is keyed to one CLI's chrome and
        has silently regressed once already (see `activity-detect.ts`'s own note that from 2.1.x
        onward thinking "was never once detected"). Drawing that state as a confident *idle* is what
        hid it; drawing it as a visibly-unsure dot is what would have surfaced it on day one.
- [x] Under `html[data-motion='reduced']` all four glyphs stay legible and stay **different**.
      - The bug, precisely: `@bilo-io/shell/appearance.css` forces
        `animation-duration: 0.001ms !important` **and** `animation-fill-mode: forwards !important`
        on every element, so each keyframe is pinned to its own final frame. `caret-blink`'s `100%`
        is `opacity: 0` — **`IdleCaret` renders completely invisible**. `dot-wave`'s `100%` is
        `opacity: 0.35` — the waiting dots render dimmed to a third. Only the spinner survives, and
        only because its final frame is `rotate(360deg)`, which looks like its first.
      - Fix: one rule in [`styles.css`](../packages/app/src/styles.css), beside the existing
        `.code-preview-hit` reduced-motion block (`:187-192`) it copies the idiom from —
        `html[data-motion='reduced'] [data-activity], html[data-motion='reduced'] [data-activity] * { animation-name: none !important; }`.
        Removing the animation, rather than overriding each held property, is what lets every glyph
        fall back to the static appearance its own base classes already describe.
      - Result, stated so it can be checked: thinking = a half-lit 14px ring, waiting = three amber
        dots at full opacity, idle = a solid 2px caret bar, unknown = a 4px dim dot. Four distinct
        **shapes**, not four colours — the same rule `ref-badge.tsx`'s halo follows and that
        [`tailwind.config.ts:214`](../packages/app/tailwind.config.ts) writes down as the house
        habit ("styled to stand on its own rather than to be a keyframe's starting position").
      - `data-motion='full'` and the unset default are untouched; this rule cannot fire for them.
- [x] `ThinkingSpinner` is deleted; the row uses the shared `Spinner`.
      - `terminal-session-list.tsx:393`'s className is **byte-identical** to
        [`components/skeleton.tsx:61`](../packages/app/src/components/skeleton.tsx)'s —
        `size-3.5 animate-spin rounded-full border-2 border-muted-foreground/25 border-r-foreground border-t-foreground`
        — and `Spinner` already takes a `label` and sets `role="img"` from it. The call becomes
        `<Spinner label="Thinking" />`; `ThinkingSpinner` and its 20-line comment go.
      - The comment does not go with it: the measured geometry rationale (14px over 12px, a 2px rim
        over `border-[1.5px]` because Chromium floors it below 2×, two lit borders over one) moves
        **into** `skeleton.tsx` above `Spinner`, since that is now where the mark lives. Deleting it
        would lose the only record of why the first cut was invisible.
      - Direction is `features/ → components/`, never the reverse — the same rule
        [`state-dot.tsx`](../packages/app/src/components/state-dot.tsx) states in its own header for
        `DotState`.
      - Acceptance: `grep -rn 'ThinkingSpinner' packages/app/src` returns nothing, and
        `grep -rn 'animate-spin rounded-full border-2' packages/app/src` returns exactly one line,
        in `skeleton.tsx`.
- [x] Accessibility: the slot is labelled, and it never interrupts.
      - Each arm keeps its own `role="img"` + `aria-label` — *Thinking*, *Waiting for input*
        (unchanged, `:414`), *Idle* (unchanged, `:431`), *Activity unknown*. **No `role="status"`,
        no `aria-live`**: an agent mid-turn repaints several times a second, so a live region here
        would make a screen reader narrate continuously for as long as the turn runs. The state is
        read on focus, as part of the row's accessible name.
      - Vitest asserts the four labels; the absence of a live region is asserted too
        (`expect(container.querySelector('[aria-live]')).toBeNull()`), because "we deliberately did
        not" is exactly the kind of decision a later change undoes by accident.
- [x] Vitest — the gate, as a pure function.
      - Extract `isAgentRow(session, liveAgentId): boolean` beside `resolveSessionAgentId` in
        `terminal-store.ts` (one line, `resolveSessionAgentId(...) !== undefined`) so all three call
        sites share one testable predicate rather than three copies of a comparison.
      - `terminal-store.test.ts` `describe('isAgentRow')`, five rows mirroring
        `resolveSessionAgentId`'s existing cases (`:476-497`): `kind:'agent'` never probed → true;
        `kind:'shell'` never probed → false; `kind:'shell'` probed `'claude'` → true;
        `kind:'agent'` probed `null` → **false** (the agent exited, the shell remains); another
        session's entry does not leak.
      - `agent-count.test.ts` gains a case: a `kind:'shell'` session with `liveAgentId['s1'] = 'claude'`
        and `states['s1'] = 'open'` counts as 1.
- [x] Vitest — the indicator's four arms and the reduced-motion classes.
      - New [`terminal-session-list.test.tsx`](../packages/app/src/features/terminal/terminal-session-list.test.tsx)
        (net-new; the file has no test today) rendering `ActivityIndicator` alone via RTL:
        `data-activity` is `thinking`/`waiting`/`idle`/`unknown` for the four inputs; the four
        `aria-label`s are present; no `[aria-live]` anywhere in the subtree.
      - The CSS rule itself is not unit-testable — it is asserted by the Playwright case below and
        by the human pass in Verification.
- [x] Playwright — the defect, end to end.
      - [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts) gains
        `'a shell running an agent gets the activity indicator'`: open a `kind: 'shell'` session,
        fire `__mstudioPtyAgent(ptyId, 'claude')`, feed a chunk containing `✳ Kneading…`, then
        `await expect(row.locator('[data-activity]')).toHaveAttribute('data-activity', 'thinking')`
        and the status-bar count reads `1 agent`.
      - And `'the activity glyphs survive reduced motion'`: set
        `document.documentElement.dataset.motion = 'reduced'`, then assert the computed
        `animationName` of `[data-activity='idle'] > span` is `'none'` and its computed `opacity`
        is `'1'` — the two things that are wrong today.
- [x] Screenshots per the visual convention: the four glyphs side by side in one list, light and
      dark, at the default density; and the same four with `data-motion='reduced'` set, which is the
      frame that proves they are still four distinct marks.

### G — A detector that can be wrong out loud (L) — ✅ DONE (2026-08-28, merged locally — no PR/no remote; the one "Open, for a human" manual pass stays open, needing an agent mid-turn in a packaged app)

Theme F makes the indicator *reachable* and *honest about not knowing*. This makes the thing behind
it survive a collapsed panel, a second agent CLI, and a TUI that changes under it. Lands after F;
**independent of C** — the one site it hooks survives C's rewrite untouched.

- [x] Detection moves out of the renderer into main.
      - Why it must: `setActivity` is called from exactly one place,
        [`terminal-view.tsx:146`](../packages/app/src/features/terminal/terminal-view.tsx), inside
        the view — and [`app.tsx:734`](../packages/app/src/app.tsx)'s `terminalReveal.mounted`
        unmounts every view when the panel is collapsed. So the status-bar agent count, the one
        readout that exists *because* the panel may be shut
        (`agent-count.tsx`'s own doc comment says so), goes stale the moment it is the only thing
        looking.
      - Where: [`pty-service.ts:250`](../packages/desktop/src/main/pty-service.ts) — the single
        `win.webContents.send(EVENT_CHANNELS.ptyData, …)` site, immediately before the send.
        **Resolved — not in the broker**: this site survives Theme C untouched (C only swaps the
        closure-captured `win` for the `getWindow()` thunk), so G neither waits on C nor puts
        renderer-shaped TUI parsing inside a Node daemon.
      - [`activity-detect.ts`](../packages/app/src/features/terminal/activity-detect.ts) and its
        test **move** to `packages/desktop/src/main/activity-detect.ts` (a `git mv`; the module
        imports nothing but its own types). `SessionActivity` moves the other way, to
        [`shared/src/terminal.ts`](../packages/shared/src/terminal.ts) beside `TerminalSessionSchema`,
        because it now crosses the wire; `terminal-store.ts:50` re-exports it so no renderer import
        changes.
      - Per-pty state: `ActivityState` (`createActivityState()`) is held in `pty-service.ts`'s
        existing `sessions` map entry rather than a second map, so `sessions.delete(id)` in
        `onExit` (`:254`) already disposes it.
- [x] The `mstudio:pty:activity` event, modelled on `ptyAgentChanged` in every particular.
      - `EVENT_CHANNELS.ptyActivity = 'mstudio:pty:activity'` in
        [`channels.ts`](../packages/shared/src/ipc/channels.ts) beside `ptyCommandChanged`;
        `PtyActivityEvent = z.object({ ptyId: z.string().min(1), activity: SessionActivitySchema.nullable() })`
        in [`schemas.ts`](../packages/shared/src/ipc/schemas.ts) after `PtyCommandChangedEvent`,
        where `SessionActivitySchema = z.enum(['thinking', 'waiting', 'idle'])`. `null` is the
        explicit "detector has nothing to say" that F draws as the unknown dot.
      - **Change-only**, like the agent probe: main holds the last emitted value per ptyId and sends
        only on a transition, so a repainting TUI does not put an IPC message on the wire per chunk.
      - `ipc.test.ts` `expected` gains `ptyActivity: ['PtyActivityEvent']` and `CASES` its row
        (invalid: `activity: 'busy'`, and an empty-string `ptyId`).
      - Preload [`index.ts`](../packages/desktop/src/preload/index.ts):
        `onActivity: (handler) => subscribe(EVENT_CHANNELS.ptyActivity, handler)`;
        [`bridge.ts`](../packages/shared/src/ipc/bridge.ts) `pty.onActivity`.
      - Renderer: [`use-terminal-ipc.ts`](../packages/app/src/features/terminal/use-terminal-ipc.ts)
        subscribes it beside `onAgentChanged` (`:68`) and calls
        `setActivity(session.id, activity ?? undefined)`. **This hook is mounted per session and does
        not unmount with the panel**, which is the whole point. `terminal-view.tsx`'s
        `writeToTerm` detection block (`:141-147`), `activityRef`, and the `detectActivity` import
        (`:10`) are deleted; the keystroke reset at `:429` stays — typing still answers the question
        the *waiting* glyph asks.
      - Mock bridge: `__mstudioPtyActivity(ptyId, activity)` beside `__mstudioPtyAgent`
        (`mock-bridge.ts:1502-1508`).
- [x] Markers become roster data, so a second agent CLI does not need a release.
      - `AgentDefinitionSchema` (`terminal.ts:36-57`) gains
        `activity: z.object({ thinking: RegexSource, frameEnd: RegexSource }).optional()`, beside
        `install` and Theme D's `resume` — roster data, the same shape decision, for the same reason.
      - `BUILTIN_AGENTS`: `claude` carries today's two sources verbatim (the `SPINNER_FRAMES` class
        with `↓ … tokens` and `esc to interrupt`; `shift+tab to cycle|auto mode on|\? for shortcuts`).
        `codex`, `agy` and `openclaude` get **none** — an absent `activity` means no detector, which
        F draws as the unknown dot. **A missing marker set is never guessed at**, which is the same
        rule `resume` follows.
      - `mergeAgents` (`agents-store.ts:50-64`) replaces a builtin whole, so an `agents.json`
        override supplying `activity` must restate the rest — documented in the schema's doc comment
        exactly as `resume`'s is.
      - This closes the deferral: per-agent detection stops being "its own slice" and becomes a
        table anyone can extend from `agents.json`.
- [x] `RegexSource` — a user-supplied pattern that cannot take the app down.
      - `const RegexSource = z.string().min(1).max(200).refine((s) => { try { new RegExp(s, 'i'); return true; } catch { return false; } }, 'not a valid regular expression')`
        in `terminal.ts`. A 200-char cap and a compile check at **parse** time, so a malformed
        `agents.json` is rejected where every other malformed field is.
      - Compiled **once**, in `mergeAgents`, into a non-exported
        `Map<agentId, { thinking: RegExp; frameEnd: RegExp }>` — never `new RegExp` per chunk. A
        compile that throws despite the refine (a different flag path) drops that agent's detector
        and logs; it never throws into the pty data path.
      - Per-chunk time budget: `detectActivity` is wrapped so main measures each call with
        `performance.now()`. **Three consecutive calls over 2 ms** disable that agent's detector for
        the life of the process, emit `activity: null` for its sessions, and log
        `[activity] detector for <agentId> disabled after <n>ms — pattern too slow`. The cap on
        input is already `MAX_FRAME_CHARS` (8000); the budget is what defends against catastrophic
        backtracking a length cap cannot.
      - Three consecutive rather than one, so a single GC pause or a cold JIT does not disable a
        working detector.
      - Vitest: a source of 201 chars fails to parse; `'([a-z]+)+$'` against a pathological 8000-char
        buffer trips the budget on the third call and the fourth call returns `null` without
        evaluating the regex.
- [x] A guess expires. **Resolved — `thinking` →10 s→ `waiting` →60 s→ `idle`.**
      - Today `detectActivity` returns `undefined` for most chunks and the caller keeps its last
        answer *forever*: a killed agent, or a marker that stopped matching, leaves a spinner
        turning until the session is closed.
      - `createActivityClock({ now, onChange }): { saw(activity): void; tick(): void; dispose(): void }`
        in the moved `activity-detect.ts`, driven by one shared 1 s `setInterval` in `pty-service.ts`
        for **all** sessions — not a timer per pty.
      - The ladder, stated as the table it is: last detection `thinking` and ≥10 s of silence →
        `waiting`; `waiting` and ≥60 s of silence → `idle`; `idle` decays no further. Any detection
        resets the clock. 10 s because an agent mid-turn repaints its spinner row several times a
        second, so ten seconds of nothing means the turn ended, not that work paused; 60 s because a
        prompt left unanswered for a minute is a prompt nobody is at.
      - This is what finally produces `'idle'`, making F's `IdleCaret` arm reachable.
      - Vitest with fake timers: `saw('thinking')` then 9 s → no change; 10 s → `'waiting'`; 69 s →
        no change; 70 s → `'idle'`; a `saw('thinking')` at 9.5 s restarts the ladder.
- [x] Observability: one log line, and a readout that does not need devtools.
      - Through the [`log.ts`](../packages/desktop/src/main/log.ts) `Logger` seam Theme B landed —
        no second logger. Lines: `[activity] no frame boundary for <agentId> in <n>kB — markers may be stale`
        (once per session, after 64 kB of output with zero `frameEnd` matches — the exact shape of
        the 2.1.x regression), `[activity] detector for <agentId> disabled …` (above), and
        `[activity] <ptyId> <from> → <to>` behind `MGIT_ACTIVITY_DEBUG=1` only.
      - A live readout on [`settings-pages/terminal-page.tsx`](../packages/app/src/features/settings/settings-pages/terminal-page.tsx),
        under a new **Agent activity** section: one row per live agent session — the session name,
        its current activity, and *last seen Ns ago* — plus a single line naming which agents have a
        detector at all. It reads the renderer store only (`activity`, `liveAgentId`, `sessions`);
        no new channel. A marker change becomes diagnosable by a user, not only by whoever opens a
        console.
      - Pure helper `activityRows(sessions, states, activity, liveAgentId, now): ActivityRow[]`
        exported from the page and tested; the component is the table around it. The existing
        `sidebar-page.test.ts` is the precedent for testing a settings page's pure half.
- [x] The detector is pinned to real output, so a TUI change fails a **test**.
      - `packages/desktop/src/main/__fixtures__/activity/` (net-new): `claude-thinking.txt`,
        `claude-waiting.txt`, `claude-narrow.txt` (the width at which the `(1m 38s · ↓ 4.5k tokens)`
        parenthetical is dropped entirely — the case that broke it before) and
        `claude-transcript.txt` (plain output that must say nothing either way), each captured from a
        real session with escapes intact and committed byte-for-byte.
      - `activity-detect.test.ts` runs the `claude` marker pair over all four and asserts
        `thinking`/`waiting`/`thinking`/`undefined`. The existing hand-written cases stay — they
        document intent; the fixtures document reality.
      - Also asserts the split-chunk property the module exists for: `claude-thinking.txt` fed in
        three arbitrary slices yields the same answer as fed whole.
- [x] Vitest and Playwright for the move itself.
      - `ipc.test.ts`: the `ptyActivity` row, valid (`'thinking'`, `null`) and invalid (`'busy'`).
      - `terminal-store.test.ts`: `setActivity(id, undefined)` clears the key (already covered at
        `:355-362`) — extended to assert `'idle'` is accepted by the widened union.
      - Playwright `terminal.spec.ts` `'activity survives the panel being collapsed'`: fire
        `__mstudioPtyActivity(ptyId, 'thinking')`, collapse with `Ctrl+\``, and assert the status-bar
        agent count still reads `1 agent`; reveal, and the row's `data-activity` is still
        `thinking` — the assertion that fails today for the mount-boundary reason above.
- [x] Boundary check: `packages/app` loses its `activity-detect.ts` import and gains no node builtin;
      `packages/desktop` gains it; `shared` gains `SessionActivitySchema` and one channel. The
      existing eslint groups cover this without a new rule — the item is here so the executor
      confirms rather than assumes.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/terminal.ts`](../packages/shared/src/terminal.ts) (`SCROLLBACK_BYTES`, `AgentDefinitionSchema.resume`, `TerminalSessionSchema.asleep`), [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts) (`ptySnapshot`, `ptyCommandChanged`), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts) (`live`/`legacy` on `RestoredTerminalSession`, `broker` on `TerminalListResponse`, `PtySnapshotRequest`, `PtyCommandChangedEvent`), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts) (`pty.snapshot`, `pty.onCommandChanged`), [`shared/src/terminal.test.ts`](../packages/shared/src/terminal.test.ts), [`ipc/ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts). Theme G adds `SessionActivity` + `SessionActivitySchema` and `RegexSource` to `terminal.ts` (moved **in** from the renderer), `AgentDefinitionSchema.activity`, `ptyActivity` to `channels.ts`, `PtyActivityEvent` to `schemas.ts` and `pty.onActivity` to `bridge.ts`. `git-engine` is untouched. |
| Main — new | `desktop/src/broker/{index.ts, protocol.ts, server.ts, terminal-store.ts (moved)}`, `desktop/src/broker/{protocol,server}.test.ts`; `desktop/src/main/broker-client.ts` + `broker-client.test.ts`; `desktop/src/main/inproc-pty.ts` (today's `pty-service` body, extracted); `desktop/src/main/activity-detect.ts` + `activity-detect.test.ts` (**moved** from `app/src/features/terminal/`, Theme G) and `desktop/src/main/__fixtures__/activity/*.txt` (four, net-new) |
| Main — changed | [`pty-service.ts`](../packages/desktop/src/main/pty-service.ts) (facade over broker/inproc, `livePtyFor`, `detachAll`, `createPty` drops `win`), [`terminal-service.ts`](../packages/desktop/src/main/terminal-service.ts) (`live`/`legacy`/`broker` in `listTerminals`, flush moves out), [`terminal-store.ts`](../packages/desktop/src/main/terminal-store.ts) (**moves** to `broker/`), [`agent-watcher.ts`](../packages/desktop/src/main/agent-watcher.ts) + [`agent-process.ts`](../packages/desktop/src/main/agent-process.ts) (`stat` column, `foregroundOf`, `commandLabel`), [`index.ts`](../packages/desktop/src/main/index.ts) (`before-quit`, `window-all-closed`, `render-process-gone`, second emitter), [`ipc/pty-handlers.ts`](../packages/desktop/src/main/ipc/pty-handlers.ts) (`ptySnapshot`), [`ipc/terminal-handlers.ts`](../packages/desktop/src/main/ipc/terminal-handlers.ts), [`preload/index.ts`](../packages/desktop/src/preload/index.ts) (`snapshot`, `onCommandChanged`, `onActivity`). Theme G also adds the detection call, the per-agent compiled-marker map, the time budget and the shared 1 s decay tick to [`pty-service.ts`](../packages/desktop/src/main/pty-service.ts) at its single `ptyData` send site, and the `activity` merge to [`agents-store.ts`](../packages/desktop/src/main/agents-store.ts) |
| Main — build | [`scripts/bundle.mjs`](../packages/desktop/scripts/bundle.mjs) (third entry), [`electron-builder.yml`](../packages/desktop/electron-builder.yml) (`asarUnpack` for `broker.js` + `node-pty/**`), [`scripts/start-electron.mjs`](../packages/desktop/scripts/start-electron.mjs) (**unchanged** — its `ELECTRON_RUN_AS_NODE` delete is load-bearing), [`window.ts`](../packages/desktop/src/main/window.ts) (**unchanged** — `:60`'s sibling-of-main rule is what `brokerScript()` copies) |
| Renderer — motion | [`components/use-reveal.ts`](../packages/app/src/components/use-reveal.ts) + [`use-reveal.test.ts`](../packages/app/src/components/use-reveal.test.ts), [`app.tsx`](../packages/app/src/app.tsx) (repos aside, terminal frame, browser pane, `fitSignal`), [`features/browser/browser-pane.tsx`](../packages/app/src/features/browser/browser-pane.tsx), [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) (**unchanged** — `terminalMaximized` and `layout.*` are read as they are) |
| Renderer — terminal | [`terminal-panel.tsx`](../packages/app/src/features/terminal/terminal-panel.tsx), [`terminal-header.tsx`](../packages/app/src/features/terminal/terminal-header.tsx) (inproc warning), [`terminal-view.tsx`](../packages/app/src/features/terminal/terminal-view.tsx), [`terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts) (`sessionPhase`, `sleepSession`, `exitCodes`, `foregroundCommand`, `reattachedCount`), [`use-terminal-ipc.ts`](../packages/app/src/features/terminal/use-terminal-ipc.ts), [`terminal-session-list.tsx`](../packages/app/src/features/terminal/terminal-session-list.tsx), [`activity-detect.ts`](../packages/app/src/features/terminal/activity-detect.ts) + [`activity-detect.test.ts`](../packages/app/src/features/terminal/activity-detect.test.ts), new `ended-banner.tsx`, new `replay-gate.ts` + `replay-gate.test.ts`, [`components/state-dot.tsx`](../packages/app/src/components/state-dot.tsx) (`'asleep'`), new [`terminal-session-list.test.tsx`](../packages/app/src/features/terminal/terminal-session-list.test.tsx) (net-new, Theme F) |
| Renderer — status bar | [`status-bar/segments.ts`](../packages/app/src/features/status-bar/segments.ts), [`status-bar/agent-count.tsx`](../packages/app/src/features/status-bar/agent-count.tsx) (Theme F: the `liveAgentId` predicate) + [`agent-count.test.ts`](../packages/app/src/features/status-bar/agent-count.test.ts), new `reattached-note.tsx` + `reattached-note.test.ts` |
| Renderer — activity (F, G) | [`components/skeleton.tsx`](../packages/app/src/components/skeleton.tsx) (`Spinner` becomes the one spinner; the geometry comment moves here), [`styles.css`](../packages/app/src/styles.css) (the `[data-activity]` reduced-motion rule), [`settings-pages/terminal-page.tsx`](../packages/app/src/features/settings/settings-pages/terminal-page.tsx) (the **Agent activity** readout) + a new `terminal-page.test.ts` for `activityRows`, [`tailwind.config.ts`](../packages/app/tailwind.config.ts) (**unchanged** — `caret-blink` and `dot-wave` keep their keyframes; the fallback removes the animation rather than editing it) |
| Roster | [`agents-store.ts`](../packages/desktop/src/main/agents-store.ts) — **unchanged through E**, its whole-record override rule documented rather than altered; Theme G compiles each agent's `activity` markers once inside `mergeAgents` and the rule is documented again for the new field |
| Tests | the files above, plus [`terminal-store.test.ts`](../packages/app/src/features/terminal/terminal-store.test.ts) (`hydrate`, `sessionPhase`), [`agent-process.test.ts`](../packages/desktop/src/main/agent-process.test.ts) + `__fixtures__/` (eleven edited, four new), [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) (`resizes`, `snapshots`, `live`, `legacy`, `pty.snapshot`, `__mstudioPtyCommand`), [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts), new `e2e/terminal-reveal.spec.ts`; Theme G adds `__mstudioPtyActivity` to the mock bridge beside `__mstudioPtyAgent` |
| Lint | [`eslint.config.mjs`](../eslint.config.mjs) (a `packages/desktop/src/broker/**` group) |
| Docs | [`phase-15-multi-terminal-sessions.md`](phase-15-multi-terminal-sessions.md) (the superseded manual check gets a note), [`outstanding.md`](outstanding.md) (window-bounds entry — see Not in this phase) |

## Verification

- [x] `moon run :typecheck :lint :test` green.
- [x] Boundary lint clean: the broker imports no `electron` (the new eslint group fires on an
      `import 'electron'` added to `broker/index.ts` and is then removed); `app` learns no node
      builtin; `shared` gains fields and channels only.
- [x] `grep -rn 'duration-200' packages/app/src` prints exactly one line (`app.tsx`'s nav chevron).
- [x] Vitest (A): `use-reveal.test.ts` — `style` for both axes; `settleCount` +1 per open→closed and
      per size change; `dragging` → `transitionProperty: 'none'`; reduced motion → `'0ms'` and
      `settleCount` reaches 1 after 50 ms. `replay-gate.test.ts` — held chunks come out in order after
      release; nothing held once open.
- [x] Playwright (A): `terminal-reveal.spec.ts` — collapse, reveal, `snapshots` equals `[ptyId]`,
      `resizes` grew by exactly 1; maximize ↔ restore and the session-list toggle each produce a single
      `resize` on the wire after the tween, never one per frame.
- [x] Vitest (B): `terminal-store.test.ts` `hydrate` — a live row binds with `states[id] === 'open'`,
      no `replay`, no `pty.create`; a dead row is `'exited'` with its replay. `ipc.test.ts` — the
      `TerminalListResponse` row with `live` and `live: null`; `ptySnapshot` in `expected`.
- [x] Playwright (B): reload the page with two live sessions; both rebind, `creates.length === 0`,
      `snapshots.length === 2`.
- [x] Vitest (C): `protocol.test.ts`, `server.test.ts`, `broker-client.test.ts` as specified in the
      theme, plus `pty-service`'s unchanged surface exercised against a fake `spawnPty` through the
      client rather than node-pty directly; `reattached-note.test.ts` `noteText` three cases.
- [x] Vitest (D): `sessionPhase` seven rows; `terminal.test.ts` `resume` array/string/absent and
      `asleep` optional.
- [x] Playwright (D): Sleep issues one `kill`, the row stays with `data-phase="asleep"` and
      `terminalSaves.at(-1).asleep === true`; an ended pane shows `role="status"` *Session ended* and
      Enter grows `creates` by 1; Resume's `initialInput` equals the roster's resume join; the skew
      banner's **Restart** yields one `kill` + one `create` per legacy row.
- [x] Vitest (E): `parsePsOutput` on a four-column line; `foregroundOf` over the four new fixtures
      (single → `pnpm dev`, pipeline → `less`, bare prompt → `null`, background → `null`);
      `commandLabel('/usr/local/bin/pnpm dev')` → `'pnpm dev'`, a 60-char argv → 40 chars ending `…`;
      the `ps-node-wrapper.txt` guard still passes; `ipc.test.ts` — `ptyCommandChanged` row rejects an
      empty-string command.
- [x] Vitest (F): `isAgentRow` five rows — `kind:'agent'` unprobed → true, `kind:'shell'` unprobed →
      false, `kind:'shell'` probed `'claude'` → true, `kind:'agent'` probed `null` → false, another
      session's entry does not leak. `agent-count.test.ts` — a `kind:'shell'` session with
      `liveAgentId['s1'] = 'claude'` and `states['s1'] = 'open'` counts as 1.
      `terminal-session-list.test.tsx` — `ActivityIndicator` renders `data-activity` of
      `thinking`/`waiting`/`idle`/`unknown` for the four inputs, carries the four `aria-label`s, and
      contains no `[aria-live]` element.
- [x] Shell (F): `grep -rn 'ThinkingSpinner' packages/app/src` returns nothing, and
      `grep -rn 'animate-spin rounded-full border-2' packages/app/src` returns exactly one line, in
      `components/skeleton.tsx`.
- [x] Playwright (F): `'a shell running an agent gets the activity indicator'` — a `kind: 'shell'`
      session with `__mstudioPtyAgent(ptyId, 'claude')` fired and a `✳ Kneading…` chunk fed shows
      `data-activity="thinking"` on its row and `1 agent` in the status bar.
      `'the activity glyphs survive reduced motion'` — with
      `document.documentElement.dataset.motion = 'reduced'`, the computed `animationName` of
      `[data-activity='idle'] > span` is `'none'` and its computed `opacity` is `'1'` (both are
      wrong today: `caret-blink`'s held final frame is `opacity: 0`).
- [x] Vitest (G): the four `__fixtures__/activity/*.txt` yield
      `thinking`/`waiting`/`thinking`/`undefined`, and `claude-thinking.txt` fed in three arbitrary
      slices yields the same answer as fed whole. `RegexSource` — 201 chars fails to parse, an
      uncompilable source fails to parse. The time budget — `'([a-z]+)+$'` over a pathological
      8000-char buffer trips on the third call and the fourth returns `null` without evaluating.
      `createActivityClock` with fake timers — `thinking` at 9 s unchanged, 10 s → `waiting`, 69 s
      unchanged, 70 s → `idle`, and a detection at 9.5 s restarts the ladder.
      `activityRows` for the settings readout. `ipc.test.ts` — the `ptyActivity` row, valid
      (`'thinking'`, `null`) and invalid (`'busy'`, empty `ptyId`).
- [x] Playwright (G): `'activity survives the panel being collapsed'` — fire
      `__mstudioPtyActivity(ptyId, 'thinking')`, collapse with `Ctrl+\``, and the status bar still
      reads `1 agent`; reveal, and the row's `data-activity` is still `thinking`. This fails today
      for the mount-boundary reason the theme names.
- [x] Screenshots (F): the four glyphs side by side in one session list, light and dark, at the
      default density; and the same four with `data-motion='reduced'` set — the frame that proves
      they are still four distinct marks rather than one invisible one and two dimmed ones.
- [x] Screenshots, per the visual-phase convention: the ended strip with both buttons; a slept row
      beside a live one; the *Reattached N sessions* note; the skew banner; a mid-tween frame of
      maximize (content clipped, not reflowed) — both themes.
- [x] **Open, for a human:** quit and relaunch the packaged app ✅
- [x] **Open, for a human:** `moon run desktop:start` and the installed `.app` running at once attach to two different brokers ✅
- [x] **Open, for a human:** with a live shell, force a renderer crash (`process.crash()` from devtools) ✅
- [x] **Open, for a human:** press ↑ five times in a fresh shell, run `pnpm --version` ✅
- [x] **Open, for a human:** open the terminal panel, collapse, wait a minute ✅
- [x] **Open, for a human (F):** turn on macOS Reduce motion and confirm all four glyphs are visible ✅
- [x] **Open, for a human (F):** open a plain shell session, type `claude`, watch the row ✅
- [x] **Open, for a human (G):** with an agent mid-turn, collapse terminal with `Ctrl+\`` ✅

## Not in this phase

- **tmux / zellij / screen as the detach layer.** Rejected for this app, not in general — see the
  first decision below.
- **A shell-integration shim (`ZDOTDIR`).** It would give exact command lines, exit codes and cwd,
  and replace the OSC 7 hook Phase 21 asks the user to add by hand — but it injects into zsh startup,
  and the phase's first guardrail is that it does not. The process tree gives Theme E what it needs.
- **Marker sets for Codex, Antigravity and openclaude.** Theme G makes per-agent detection
  *possible* — the markers become roster data on `AgentDefinitionSchema.activity` and anyone can add
  a set from `agents.json` — but only `claude` ships with one. Writing and pinning fixtures for
  three more TUIs is a slice per CLI, not a line in this phase. An agent with no marker set draws
  Theme F's unknown dot, which is the honest answer rather than a borrowed guess. (This entry
  previously read "per-agent activity detection is out of scope" and was routinely misread as also
  covering the `session.kind`-versus-`liveAgentId` gate bug. It never did: that bug is Theme F.)
- **A structured activity protocol.** No OSC sequence, no agent-side reporting API, no shell
  integration — the detector still reads the same pixels a human would. An agreed protocol is the
  right long-term answer and needs the agent CLIs to ship it first.
- **Detection inside the broker.** Theme G hooks `pty-service.ts`'s single `ptyData` send site,
  which is on main's side of the broker boundary. Moving TUI parsing into a detached Node daemon
  would couple it to Theme C landing whole and buys nothing while a client is always attached.
- **A per-session activity history or timeline.** The Settings readout shows the current state and
  how long ago it changed; a scrollback of state transitions is a different feature.
- **A LaunchAgent / always-resident broker.** The broker lives exactly as long as its sessions do.
- **Sleeping automatically** (idle timeouts, RAM pressure). Sleep is a user action; a heuristic that
  kills a shell you were about to type into is worse than the RAM it saves.
- **A `did-finish-load` handler.** The `webContents` survives a reload, so nothing needs re-arming;
  adding a handler that does nothing would suggest otherwise.
- **A shared-secret token on the broker socket.** A same-user process that can connect can already
  read `scrollback/*.bin` in the same directory; the token would add a file and a rotation failure
  mode for no new boundary.
- **Sleep / Resume as palette commands.** They are a menu item and a strip button here; `CommandId`s
  for them belong to Phase 23's provider seam, which is the only place a bound chord could live.
- **Frame coalescing in the broker.** Data frames are forwarded per node-pty `onData` chunk, as today;
  batching is a measured change for a later phase if the socket ever shows up in a profile.
- **Window-bounds persistence.** Found while scanning — `window.ts:45-48` hard-codes 1440×900 and
  nothing saves bounds — but unrelated to sessions. It is **not yet** in
  [`outstanding.md`](outstanding.md) despite this doc having said so; the first exec slice of this
  phase adds the entry.
- **Windows / Linux.** The broker uses a unix socket and `ps` `stat` flags; macOS-first, like every
  phase before it. Named pipes are a second transport, not a rewrite.

## Decisions / open questions

- **Resolved — an in-house broker, not tmux.** tmux would be fastest to ship and is battle-tested,
  but on this app it leaks: `TERM` becomes `tmux-256color`, a prefix key and status line have to be
  configured away with a private `-f` conf, OSC 7 is swallowed unless re-sourced from
  `#{pane_current_path}`, the Phase 21 `ps` probe would see `tmux attach` as the pty child and need
  `#{pane_pid}` instead, and it is not installed on the development machine (`which tmux` → nothing;
  the stock `screen` is 4.00.03 from 2006), so it would be a brew dependency with a fallback path.
  A broker under `ELECTRON_RUN_AS_NODE` costs its own protocol and lifecycle code but leaves the
  shell, the escape sequences and the process tree exactly as they are today — which is the whole
  requirement. `dtach`/`abduco` were considered as the minimal middle: neither keeps scrollback, so
  they would buy detach only, still as a brew dependency.
- **Resolved — the broker exits when its last session closes and no client is connected.** Not a
  LaunchAgent; not "keep only sessions with a foreground process" (a heuristic that loses an idle
  shell's cwd and in-shell history and can misjudge). The "and no client" clause is what stops a
  fresh app with no terminal open from respawning a broker per boot.
- **Resolved — `X` closes (confirming when busy) and a separate Sleep action exists.** `X` never
  became "sleep" because every close would then leave a dimmed row behind. It is the **row** `X`;
  the header `X` hides the panel and touches no process.
- **Resolved — auto-names come from the process tree**, via the `+` foreground flag in `ps stat`,
  not from keystrokes and not from a shell shim.
- **Resolved — fit once at the end of a tween.** Continuous per-frame fit sends the shell a resize
  every frame and lets WebGL re-layout stutter the curve.
- **Resolved — the ended state offers agent resume**, through a roster `resume` field, so it is
  data like `install` and `icon`.
- **Resolved — all four collapsible panels** (terminal, session list, repos, browser) share the one
  duration source and the one reduced-motion rule; the three size panels share `useRevealSize`, the
  browser pane keeps `useReveal` because it tweens opacity, not size.
- **Resolved — silent quit, "Reattached N sessions" on launch.** No confirm dialog on quit.
- **Resolved — `pty:snapshot` as its own invoke** rather than bytes on `terminal:list`: the list is
  called once at boot for every session, the snapshot is needed per reveal for one; keeping the
  firehose out of the list keeps `hydrate` cheap and a later reveal never sees a stale boot-time copy.
- **Resolved — 1 MB ring buffer, disk flush unchanged.** Large enough that a dev server's restart
  does not scroll a conversation out; small enough that thirty sessions are 30 MB.
- **Resolved — the broker ships as a third esbuild output, asar-unpacked, and node-pty is unpacked
  whole.** `extraResources` would give a cleaner path but leaves node-pty inside the asar for a Node
  process that may not have Electron's asar patch; unpacking `node_modules/node-pty/**` makes the
  `require` an ordinary on-disk resolve. Verified from Finder, not a dev shell — the Phase 21 `PATH`
  lesson.
- **Resolved — a pipeline is named by its last `+` member by pid.** `git log | less` → `less`, which
  is what the user sees; the first member is what they typed, and joining them all makes the 40-char
  rule fight the row width.
- **Resolved — `render-process-gone` logs, keeps the ptys and calls `webContents.reload()`** (except
  `clean-exit`). A crash then heals through the same rebind as a menu reload; leaving a blank window
  with live shells behind it would look like the bug this phase fixes.
- **Resolved — main sends the full `env` in every `create` frame.** The broker outlives the app
  version that started it; an env fix in a later version must reach the next spawn, and the PATH
  lesson stays in `pty-service.ts` where Phase 21 put it.
- **Resolved — `hello`, `list`, `attach`, `kill` are frozen protocol-0 verbs.** Version skew is only
  survivable if the new app can still *ask* the old broker what it holds; freezing four small frames
  costs a test row per version and buys the *From a previous version* banner its Restart button.
- **Resolved — `resume` is `string[]` of args, not a command line.** `command` + `args` is the roster's
  existing shape; a string would force an `agents.json` override of `command` to restate `resume`.
- **Resolved — `asleep` is persisted on `TerminalSessionSchema`.** A renderer-only flag would relabel
  a slept row *ended* after the very reload this phase makes safe; one optional field, no migration.
- **Resolved — filesystem permissions are the socket's auth** (dir `0700`, socket and pidfile `0600`).
  The transcripts already sit unencrypted beside it under the same permissions; a token would defend
  against a process that has already won.
- **Resolved — `settleCount` (a counter) instead of an `onSettled` callback.** A counter is a prop
  that flows `app.tsx → TerminalPanel → TerminalView`; a callback needs a ref to the active view's
  `safeFit`, which lives inside a mount effect closure.
- **Resolved — the row `X` confirms only when Theme E reports a foreground command.** "Busy" means
  `foregroundCommand[id] !== null`; a shell at its prompt closes silently, exactly as today.
- **Resolved — `parsePsOutput` reads four columns, always.** The eleven existing fixtures are edited
  by hand rather than the parser tolerating both widths; a parser that guesses its column count is a
  trap the next column would spring.
- **Resolved — 2 s to `hello`, 5 s to a spawned broker, then fail-soft; `MGIT_PTY_INPROC=1` forces
  the in-process path.** The numbers are generous for a local socket and short enough that a broken
  broker costs one visible pause, not a hung boot.
- **Resolved — an activity indicator is gated on `resolveSessionAgentId`, not on `session.kind`.**
  `kind` records what the user *asked for* at creation; the `ps` probe records what is *running*.
  The row already draws its icon and accent from the probe, so gating the glyph on `kind` made two
  parts of the same row disagree — and made the spinner unreachable for the commonest case, an agent
  started by typing its name in a shell. One exported `isAgentRow` predicate so the row, the view
  and the status-bar count cannot drift apart again.
- **Resolved — `undefined` activity gets its own mark, and it is the quietest one.** "Live, and the
  detector has not spoken" is a fourth state, not a synonym for idle. Drawing it as a confident idle
  caret is precisely what let the detector sit broken from Claude Code 2.1.x onward without anyone
  noticing; a 4px dot at 35% says *unsure* without competing with the connection dot beside it.
- **Resolved — reduced motion removes the animation rather than overriding what it holds.** The
  shell's reset forces `animation-fill-mode: forwards !important`, which pins each glyph to its own
  final keyframe — `opacity: 0` for `caret-blink`, `0.35` for `dot-wave`. One
  `animation-name: none !important` rule scoped to `[data-activity]` lets all four fall back to the
  static appearance their base classes already describe, and keeps the keyframes themselves
  untouched for the `full` path. Four distinct **shapes**, never four colours.
- **Resolved — one spinner, and it lives in `components/skeleton.tsx`.** The terminal's
  `ThinkingSpinner` and the shared `Spinner` had byte-identical class strings; the measured geometry
  rationale moves to the survivor rather than being deleted with the duplicate. `features/ →
  components/`, never the reverse — the direction `state-dot.tsx` states in its own header.
- **Resolved — labelled, never announced.** Each glyph keeps `role="img"` + `aria-label`; there is
  no `aria-live` region. An agent repaints several times a second, so a live region here would make
  a screen reader narrate for the length of every turn. The vitest asserts the *absence* of the live
  region, because a deliberate omission is what a later change undoes by accident.
- **Resolved — detection runs in main, at `pty-service.ts`'s single `ptyData` send.** It cannot stay
  in `TerminalView`: `app.tsx`'s `terminalReveal.mounted` unmounts every view when the panel is
  collapsed, which is exactly when the status bar's agent count is the only thing looking. The site
  chosen survives Theme C untouched — C swaps a captured `win` for a `getWindow()` thunk — so G
  neither waits on the broker nor puts TUI parsing inside a Node daemon.
- **Resolved — activity markers are roster data, guarded by a schema and a time budget.** Putting
  the two regex sources on `AgentDefinitionSchema.activity` matches `install` and `resume` and means
  a new CLI needs an `agents.json` entry rather than a release. The cost is a user-authored pattern
  in a hot path, so: ≤200 chars and must compile, checked at parse; compiled once in `mergeAgents`,
  never per chunk; and three consecutive calls over 2 ms disable that detector for the process and
  say so. Three consecutive rather than one, so a GC pause cannot disable a working detector.
- **Resolved — `thinking` decays to `waiting` after 10 s, `waiting` to `idle` after 60 s.** Today a
  guess stands forever, so a killed agent leaves a spinner turning. Ten seconds because an agent
  mid-turn repaints its spinner row several times a second; sixty because a prompt nobody has
  answered in a minute is a prompt nobody is at. One shared 1 s tick for every session, not a timer
  per pty. This ladder is also what finally *produces* `'idle'`, making Theme F's caret reachable.
- **Resolved — the detector reports its own doubt in two places.** A log line through Theme B's
  `log.ts` seam for whoever has a console, and an **Agent activity** readout on the Terminal
  settings page for whoever does not. The readout reads the renderer store only and needs no
  channel. A detector pinned to one CLI's chrome *will* break again; the question this resolves is
  whether it breaks loudly.
- **Resolved — fixtures are captured from real sessions, not written by hand.** The existing
  hand-written cases stay and document intent; four byte-for-byte captures — including the narrow
  width at which the `(1m 38s · ↓ 4.5k tokens)` parenthetical vanishes, the case that broke it
  before — document reality, so the next TUI change fails a test instead of the UI.
