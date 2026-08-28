# Phase 30 — A terminal that survives you

Phase 15 made terminal sessions durable in exactly one sense: the *transcript* survives, the
*process* does not. `terminals.json` and `scrollback/<id>.bin` come back on the next launch as dimmed
rows, a `[session ended] Press Enter to start a new shell here` line is written into the scrollback,
and Enter spawns a fresh shell at the recorded `cwd`. That was the design — its own verification
item asks a human to confirm `ps` shows **no** surviving shells after a relaunch — and it is the
design this phase overturns. A coding agent mid-conversation, a dev server, a `git rebase -i` half
way through: none of them should die because the window reloaded or the app was quit.

Three defects reported against the current terminal are fixed on the way, each with a cause the
code already names:

- **Blank pane on reveal.** Collapsing the terminal unmounts it (`terminalReveal.mounted` in
  [`app.tsx`](../packages/app/src/app.tsx)); revealing builds a fresh xterm whose mount path replays
  only `peekReplay()` — the *restored* transcript — never the live ring buffer main has been
  accumulating for a pty that stayed alive. And nothing calls `fit()`/`refresh()` when the reveal
  tween ends; the only refresh hook in [`terminal-view.tsx`](../packages/app/src/features/terminal/terminal-view.tsx)
  is `visibilitychange`, which is *window* minimise, not panel collapse.
- **Reload loses every session.** Main has no `did-finish-load` or `render-process-gone` handler
  anywhere; a renderer reload leaves every pty alive in
  [`pty-service.ts`](../packages/desktop/src/main/pty-service.ts) with the renderer's `ptyIds` map
  gone — orphans that only `killAllPtys()` at quit will reap, while the rows come back as dead.
- **Session names like `BAAAA`.** `trackShellCommand()` in
  [`activity-detect.ts`](../packages/app/src/features/terminal/activity-detect.ts) reconstructs the
  command from keystrokes. zsh's line editor puts the terminal in application-cursor mode, where an
  arrow arrives as `ESC O A`; the skipper ends its escape on the `O` and the `A`/`B` lands in the
  buffer. A perfect parser would still be wrong — recalling `pnpm dev` from history never types
  those characters — so the approach is replaced, not repaired.

**Builds on.** Phase 9 (the pty service, `safeFit`, deferred `term.open()`), Phase 13
(`useReveal`/`useSettled` in [`use-reveal.ts`](../packages/app/src/components/use-reveal.ts), the
200 ms `ease-in-out` vocabulary), Phase 15 (`terminal-store.ts` in main, the ring buffer keyed by
`sessionId`, `terminal:*` vs `pty:*` channel split, the dead-buffer restore this phase replaces),
Phase 21 Theme E ([`agent-watcher.ts`](../packages/desktop/src/main/agent-watcher.ts) — the
event-driven `ps` probe Theme E extends rather than duplicates), Phase 27 (the status-bar segment
registry Theme C's launch note lands in; the browser pane Theme A tweens).

**Scope guardrails.** **Your shell is untouched.** The broker spawns the same `$SHELL -l` with the
same env `pty-service.ts` builds today — no `ZDOTDIR` shim, no `TERM` change, no prefix key, no
status line. This is the reason tmux is *not* the detach layer (see Decisions). **No new
dependency.** No tmux, no `electron-store`, no motion library; node-pty keeps its single ABI because
the broker runs under the app's own Electron binary as Node. **Nothing is killed without a click.**
Quit detaches; version skew leaves the old broker's sessions readable; `X` on a busy session asks.
**Tweens fit once, at the end.** One `SIGWINCH` per toggle, not one per frame — the existing
two-nested-box trick already encodes this and the primitive generalises it.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The blank pane, and panels that interpolate (M)

- [ ] Reproduce blank-on-reveal as a failing Playwright spec first: open a session, collapse with
      `Ctrl+\``, reveal, and assert the pane's bridge traffic shows a snapshot/replay write **without**
      a resize having been sent — the mock bridge in
      [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) publishes pty traffic on
      `window.__mgitPty`, so "what reached xterm" is assertable even though the WebGL canvas is not.
- [ ] Fix cause 1: a remounted view for a **live** session writes main's current ring buffer before
      attaching to the stream (Theme B decides whether that is a `pty:snapshot` invoke or bytes on the
      extended `terminal:list`). Same `\x1b[0m`-prefixed, newline-trimmed slice `trimScrollback()` in
      [`terminal-store.ts`](../packages/desktop/src/main/terminal-store.ts) already produces, for the
      same mid-CSI reason.
- [ ] Fix cause 2: the reveal primitive exposes `settled` and an `onSettled` callback fired on
      `transitionend` (falling back to the stalled-frame rAF wait `useReveal` already has);
      [`terminal-panel.tsx`](../packages/app/src/features/terminal/terminal-panel.tsx) runs `safeFit()`
      + `term.refresh(0, rows - 1)` on the active view there.
- [ ] `use-reveal.ts` grows into a **size tween**: `useRevealSize({ open, size, axis })` →
      `{ mounted, shown, style, settled }`. A change in *target* size (restore ↔ maximize, a drag
      release) animates through the same 200 ms `ease-in-out` as open ↔ closed; a drag in progress
      disables the transition, as the repos aside already does at `app.tsx:617-643`.
- [ ] Terminal: closed ↔ `layout.terminalHeight` ↔ maximized all interpolate. The `useSettled` at
      `app.tsx:428` and the `hidden` view-under-maximize at `:697` re-express against the primitive's
      `settled`; the vertical `ResizeHandle` stays unmounted while maximized.
- [ ] Session list: `{showList ? <TerminalSessionList/> : null}` in `terminal-panel.tsx` becomes a
      width tween 0 ↔ `layout.terminalListWidth`, inner list pinned at full width (the repos pattern)
      so rows are clipped rather than reflowed — including when the toggle is `sessions.length`
      crossing 1, not a click.
- [ ] Repos aside: already width-tweened; rehomed on the primitive so all panels share one duration
      constant, keeping the inner-pinned-width behaviour.
- [ ] Browser pane: `<BrowserPane shown={browserReveal.shown} />` at `app.tsx:784` — same primitive,
      same curve.
- [ ] `REVEAL_MS` is the only source of the duration: the Tailwind literal `duration-200` at each call
      site becomes `style.transitionDuration` off the constant. The file's own comment says the two
      are "paired by hand" today; after this they cannot drift.
- [ ] `html[data-motion='reduced']` collapses every tween to 0 ms, and `settled` still fires so the
      fit-at-end path runs.

### B — Reattach after a renderer reload (M)

The substrate for C: the renderer must be able to *rebind* to a pty it did not create, whoever owns
that pty.

- [ ] `terminal:list` returns, per session, `live: { ptyId, pid, cols, rows } | null` — main already
      holds `sessionId ↔ ptyId` in `pty-service.ts`'s `sessions` map. Schema in
      [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts); the `ipc.test.ts` every-channel
      guard gets its row.
- [ ] `hydrate()` in [`terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts)
      binds a live `ptyId` (`bindPty`, state `open`) instead of leaving the row dead; the replay bytes
      for a live session are the ring buffer, not the disk log — what the shell printed while nobody
      was watching.
- [ ] `terminal-view.tsx`'s mount path distinguishes **rebind** from **revive**: a live session
      replays and attaches — no `REVIVE_HINT`, no spawn on Enter — and re-sends `resize` so the
      shell's columns match the new xterm.
- [ ] Main subscribes `webContents` `did-finish-load` (re-arm event forwarding; ptys untouched) and
      `render-process-gone` (log, keep ptys) in [`index.ts`](../packages/desktop/src/main/index.ts) —
      today neither exists, and `window-chrome.ts:87-88`'s reload IPC is one of the ways in.
- [ ] Vitest: `hydrate` with a live row binds and issues no `pty.create`; a live row's replay is the
      ring buffer. Playwright: the mock bridge learns `live`, a spec reloads the page and asserts the
      transcript survives with no `create` on the wire.
- [ ] Dev: HMR of `terminal-view.tsx` no longer strands shells — the `moon run desktop:start` pain that
      motivated the theme, checked by hand once.

### C — The session broker (L)

- [ ] `packages/desktop/src/broker/` — a standalone entry built beside `main` and `preload`, spawned
      as `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, `detached: true`, `stdio: 'ignore'`,
      `.unref()`. Same binary ⇒ same ABI ⇒ `moon run desktop:rebuild-native` stays the whole native
      story; in the packaged build the script requires node-pty from `app.asar.unpacked`.
- [ ] Protocol over a unix domain socket at `<userData>/broker/<appVersion>[-dev].sock` (mode 0600):
      length-prefixed JSON control frames, raw binary frames for pty bytes, a `hello` handshake
      carrying `{ protocol, appVersion, pid }`. Namespaced by version **and** a `-dev` suffix because
      `app.setName('midnite-git')` makes the dev server and the installed app share `userData`, and
      two builds attaching to one broker is the first bug this design would otherwise ship.
- [ ] The broker owns what `pty-service.ts` owns today: spawn (`$SHELL -l`, `xterm-256color`, the
      shell-path-fixed `PATH`, `TERM_PROGRAM`, `GIT_TERMINAL_PROMPT=1`), write, resize, kill, the
      per-session ring buffer, `initialInput` deferred to the first output chunk, and the 15 s disk
      flush. `terminal-store.ts` moves with it — it already takes a directory and imports no
      `electron`, which is what makes the move a file rename.
- [ ] `pty-service.ts` becomes the broker's client behind an **unchanged exported surface**
      (`createPty`, `writePty`, `resizePty`, `killPty`, `readScrollback`, …), so
      [`pty-handlers.ts`](../packages/desktop/src/main/ipc/pty-handlers.ts),
      [`terminal-service.ts`](../packages/desktop/src/main/terminal-service.ts) and `agent-watcher`
      keep their shape; `isPidAlive` and the `ps` probe take the pid from the broker's `created` reply.
- [ ] `SCROLLBACK_BYTES` in [`shared/src/terminal.ts`](../packages/shared/src/terminal.ts) rises from
      256 KB to 1 MB per session — the buffer no longer lives in a process the renderer can restart.
- [ ] Lifecycle: main connects on boot, spawning a broker if the socket is dead (stale file → unlink →
      spawn); the broker **exits itself when its last session is killed**; a pidfile beside the socket
      plus `hello` makes "is one already running for this version" answerable. `SIGTERM` flushes and
      lets the ptys die with it.
- [ ] `before-quit` in `index.ts` **detaches** — flush metadata, close the socket — instead of
      `killAllPtys()`; `window-all-closed` likewise. Phase 15's "processes die on quit" contract is
      overturned here; its open manual check (*"`ps` shows no surviving shells"*) is closed in
      [`phase-15-multi-terminal-sessions.md`](phase-15-multi-terminal-sessions.md) as superseded by its
      inverse below.
- [ ] Launch note: after `hydrate`, a transient status-bar segment reads *Reattached N sessions*
      through Phase 27's segment registry
      ([`status-bar/segments.ts`](../packages/app/src/features/status-bar/segments.ts)), fading on the
      existing `fade-in` vocabulary. No dialog, no confirm on quit.
- [ ] Version skew: a broker whose `protocol` does not match is **left running**; its sessions list
      as asleep behind a banner (*From a previous version — restart sessions?*) while the new broker
      starts on its own socket. Nothing is killed until the user chooses.
- [ ] Fail-soft: if the broker cannot be spawned or the socket handshake fails, today's in-main pty
      path is used (kept behind a flag for exactly this) and the reason reaches the renderer as the
      existing `unavailable` state's message.
- [ ] Vitest against an in-process broker on a temp socket: frame parsing (partial and coalesced
      frames), handshake mismatch, stale-socket recovery, last-session self-exit, a kill arriving
      while output is streaming.
- [ ] Boundary: the broker imports node-pty and `node:net` and nothing from `electron` — it is a
      Node program that happens to run under Electron's binary. The eslint boundary groups gain a
      `desktop/src/broker` entry saying so.

### D — Honest session states: live, asleep, ended (M)

- [ ] A derived `SessionPhase = 'live' | 'asleep' | 'ended'` in `terminal-store.ts` over the process
      states: live = pty bound; asleep = deliberately slept (transcript kept, no process); ended =
      the process exited or was lost. One exported `sessionPhase()` so the row, the header and the
      status-bar count read the same answer.
- [ ] The ended banner: `REVIVE_HINT` (a dim line in the scrollback, invisible under a long
      transcript) is replaced by an overlay strip at the foot of the pane — *Session ended · exit N*
      with **Start new shell here** and, for agent rows, **Resume conversation**. Enter still starts a
      new shell; the transcript stays readable behind the strip.
- [ ] `AgentDefinitionSchema` gains `resume: z.string().min(1).optional()` (`claude --continue`,
      `codex resume`, …) — roster data beside `install`, overridable in `agents.json`; absent means
      no Resume button, never a guess.
- [ ] **Sleep**: a context-menu action that kills the process and keeps the row and transcript
      (dimmed, a moon glyph beside the `StateDot`). Click/Enter revives via the existing
      spawn-at-`session.cwd` path; an agent with a `resume` revives through it rather than cold.
- [ ] `X` confirms through `useDialogs().confirm` when a foreground process is running, naming the
      command (Theme E supplies it); a bare prompt closes without asking. Kill + `forget` semantics
      otherwise unchanged.
- [ ] Row glyph and `StateDot` distinguish the three phases; the `live` predicate in
      [`terminal-session-list.tsx`](../packages/app/src/features/terminal/terminal-session-list.tsx)
      (also read by [`agent-count.tsx`](../packages/app/src/features/status-bar/agent-count.tsx)) is
      re-expressed on `sessionPhase()`.
- [ ] Vitest for the phase derivation table; Playwright: Sleep issues `kill` and the row and transcript
      remain; an ended pane shows the strip and Enter spawns; Resume sends the roster's `resume`
      command and nothing else.

### E — Naming from the process tree (S)

- [ ] Delete `trackShellCommand`, `ShellLineState` and their tests from `activity-detect.ts`; the
      `shellLineRef` plumbing in `terminal-view.tsx:312` goes with them.
- [ ] `agent-watcher.ts` reports the shell's **foreground process** beside the matched agent: `ps`
      already runs with `-axo pid=,ppid=,args=`; adding `stat=` gives the `+` flag that marks the
      foreground process group, so "what the user is running" is a column, not a heuristic over
      children. New `pty:command-changed { ptyId, command: string | null }` on the pty event channel,
      change-only, same 750 ms quiet cadence and shared snapshot.
- [ ] `setAutoName` for shell sessions is fed from that event — basename plus args, truncated
      (`pnpm dev`, `git rebase -i main`) — and **held** after the command exits until the next one.
      `onTitleChange` (OSC 0/2) stays the fallback for a bare prompt; agent sessions keep their
      title-based naming.
- [ ] Vitest against `__fixtures__` listings: a shell with one foreground child; a pipeline (the `+`
      group, not the first child); a bare prompt → `null`; a background job (`&`, no `+`) is not the
      name; the existing `node --require` false-positive fixture keeps its guard.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/terminal.ts`](../packages/shared/src/terminal.ts) (`SCROLLBACK_BYTES`, `AgentDefinitionSchema.resume`), [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts) (`pty:command-changed`, optional `pty:snapshot`), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts) (`live` on the list result), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts). `git-engine` is untouched. |
| Main — new | `desktop/src/broker/{index.ts, protocol.ts, server.ts, ring-buffer.ts}`; `desktop/src/main/broker-client.ts` |
| Main — changed | [`pty-service.ts`](../packages/desktop/src/main/pty-service.ts) (client behind the same surface), [`terminal-service.ts`](../packages/desktop/src/main/terminal-service.ts), [`terminal-store.ts`](../packages/desktop/src/main/terminal-store.ts) (moves to the broker), [`agent-watcher.ts`](../packages/desktop/src/main/agent-watcher.ts) + [`agent-process.ts`](../packages/desktop/src/main/agent-process.ts) (`stat=` column, foreground match), [`index.ts`](../packages/desktop/src/main/index.ts) (`before-quit`, `did-finish-load`, `render-process-gone`), [`ipc/pty-handlers.ts`](../packages/desktop/src/main/ipc/pty-handlers.ts), [`ipc/terminal-handlers.ts`](../packages/desktop/src/main/ipc/terminal-handlers.ts), the desktop build config for the second entry |
| Renderer — motion | [`components/use-reveal.ts`](../packages/app/src/components/use-reveal.ts), [`app.tsx`](../packages/app/src/app.tsx) (repos aside, terminal frame, browser pane), [`features/browser/browser-pane.tsx`](../packages/app/src/features/browser/browser-pane.tsx) |
| Renderer — terminal | [`terminal-panel.tsx`](../packages/app/src/features/terminal/terminal-panel.tsx), [`terminal-view.tsx`](../packages/app/src/features/terminal/terminal-view.tsx), [`terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts), [`use-terminal-ipc.ts`](../packages/app/src/features/terminal/use-terminal-ipc.ts), [`terminal-session-list.tsx`](../packages/app/src/features/terminal/terminal-session-list.tsx), [`activity-detect.ts`](../packages/app/src/features/terminal/activity-detect.ts), new `ended-banner.tsx` |
| Renderer — status bar | [`status-bar/segments.ts`](../packages/app/src/features/status-bar/segments.ts), [`status-bar/agent-count.tsx`](../packages/app/src/features/status-bar/agent-count.tsx), new `reattached-note.tsx` |
| Tests | `broker/*.test.ts`, [`terminal-store.test.ts`](../packages/app/src/features/terminal/terminal-store.test.ts), [`agent-process.test.ts`](../packages/desktop/src/main/agent-process.test.ts) + new fixtures, `ipc.test.ts`, [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts), [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts), new `e2e/terminal-reveal.spec.ts` |
| Lint | `eslint.config.mjs` (a `desktop/src/broker` boundary group) |
| Docs | [`phase-15-multi-terminal-sessions.md`](phase-15-multi-terminal-sessions.md) (close the superseded manual check), [`outstanding.md`](outstanding.md) for anything deferred mid-build |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: the broker imports no `electron`; `app` learns no node builtin; `shared`
      gains fields and channels only.
- [ ] Playwright (A): the reveal spec written first in Theme A passes — collapse, reveal, content
      present with no resize sent; maximize ↔ restore and the session-list toggle each produce a
      single `resize` on the wire after the tween, never one per frame.
- [ ] Playwright (B): reload the page with two live sessions; both rebind, transcripts intact, zero
      `pty.create` calls.
- [ ] Vitest (C): the broker suite above, plus `pty-service`'s unchanged surface exercised against the
      client rather than node-pty directly.
- [ ] Vitest/Playwright (D/E): the phase table, the ended strip, Sleep, Resume; the foreground-match
      fixtures; a session named from a real command basename and never from a keystroke.
- [ ] Screenshots, per the visual-phase convention: the ended strip with both buttons; a slept row
      beside a live one; the *Reattached N sessions* note; a mid-tween frame of maximize (content
      clipped, not reflowed) — both themes.
- [ ] **Manual, needs a human at a machine:** quit and relaunch the packaged app with three sessions
      across two repos, one of them a Claude Code conversation mid-turn, and confirm all three come
      back **live** with their scrollback while `ps` shows the shells still running under the broker —
      the exact inverse of Phase 15's open check.
- [ ] **Manual:** `moon run desktop:start` and the installed `.app` running at once attach to two
      different brokers (`ls <userData>/broker/`).
- [ ] **Manual:** press ↑ five times in a fresh shell, run `pnpm --version`, and confirm the row is
      named `pnpm --version`, never `AAAAA`.
- [ ] **Manual:** open the terminal panel, collapse it, wait a minute with a `while sleep 1; do date;
      done` running, reveal — the minute of output is there before any keypress.

## Not in this phase

- **tmux / zellij / screen as the detach layer.** Rejected for this app, not in general — see the
  first decision below.
- **A shell-integration shim (`ZDOTDIR`).** It would give exact command lines, exit codes and cwd,
  and replace the OSC 7 hook Phase 21 asks the user to add by hand — but it injects into zsh startup,
  and the phase's first guardrail is that it does not. The process tree gives Theme E what it needs.
- **Per-agent activity detection.** `activity-detect.ts` stays keyed to Claude Code's chrome; Codex
  and Antigravity rows still show the idle caret. Deferred from Phase 21 and still its own slice.
- **A LaunchAgent / always-resident broker.** The broker lives exactly as long as its sessions do.
- **Sleeping automatically** (idle timeouts, RAM pressure). Sleep is a user action; a heuristic that
  kills a shell you were about to type into is worse than the RAM it saves.
- **Window-bounds persistence.** Found while scanning — `window.ts` hard-codes 1440×900 and nothing
  saves bounds — but unrelated to sessions. Logged in [`outstanding.md`](outstanding.md).
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
- **Resolved — the broker exits when its last session closes.** Not a LaunchAgent; not "keep only
  sessions with a foreground process" (a heuristic that loses an idle shell's cwd and in-shell
  history and can misjudge).
- **Resolved — `X` closes (confirming when busy) and a separate Sleep action exists.** `X` never
  became "sleep" because every close would then leave a dimmed row behind.
- **Resolved — auto-names come from the process tree**, via the `+` foreground flag in `ps stat`,
  not from keystrokes and not from a shell shim.
- **Resolved — fit once at the end of a tween.** Continuous per-frame fit sends the shell a resize
  every frame and lets WebGL re-layout stutter the curve.
- **Resolved — the ended state offers agent resume**, through a roster `resume` field, so it is
  data like `install` and `icon`.
- **Resolved — all four collapsible panels** (terminal, session list, repos, browser) share the one
  primitive and the one 200 ms duration; no slower maximize.
- **Resolved — silent quit, "Reattached N sessions" on launch.** No confirm dialog on quit.
- **Recommendation — `pty:snapshot` as its own invoke** rather than bytes on `terminal:list`: the
  list is called once at boot for every session, the snapshot is needed per reveal for one; keeping
  the firehose out of the list keeps `hydrate` cheap. Theme B decides once the ring-buffer read is
  in hand.
- **Recommendation — 1 MB ring buffer, disk flush unchanged.** Large enough that a dev server's
  restart does not scroll a conversation out; small enough that thirty sessions are 30 MB.
- **Open — the broker script's home in the packaged build.** electron-builder must ship the broker
  entry unpacked beside node-pty (`asarUnpack`) and the spawn path must resolve inside the `.app`
  from Finder, not only from `moon run desktop:start`. The Phase 21 `PATH` lesson applies:
  verify from Finder, not from a dev shell.
- **Open — what "foreground" means for a pipeline.** All members share the `+` flag; the
  recommendation is to name the *last* (`git log | less` → `less` while paging, which is what the
  user sees) — confirm against the fixture before committing to it.
