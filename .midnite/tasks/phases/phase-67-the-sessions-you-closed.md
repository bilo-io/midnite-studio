# Phase 67 — The sessions you closed

The rail has had a **Sessions** row since Phase 23. It renders a `Placeholder`. This phase builds
what that row has been promising — and the promise is specific, because three places in the codebase
already wrote it down:

- [`components/nav-icons.ts:77`](../../../packages/app/src/components/nav-icons.ts) — `sessions: LuHistory`
- [`services/palette/providers.ts:42`](../../../packages/app/src/services/palette/providers.ts) — `sessions: 'Agent Sessions'`
- [`providers.ts:63`](../../../packages/app/src/services/palette/providers.ts) — `sessions: 'agent session history transcripts'`

A **history** of **agent sessions**, with **transcripts**. Not a second live list.

**The one fact this phase turns on: there is no history to show.** Closing a session does not end
it, it erases it. [`terminal-handlers.ts:47`](../../../packages/desktop/src/main/ipc/terminal-handlers.ts)'s
`mstudio:terminal:forget` drops the row from `terminals.json` **and** `rm`s
`scrollback/<id>.bin` ([`terminal-service.ts:105`](../../../packages/desktop/src/main/terminal-service.ts)).
There are exactly three session states —
[`sessionPhase()`](../../../packages/app/src/features/terminal/terminal-store.ts) returns `live`,
`asleep` or `ended` — and every one of them describes a session that still exists. A fourth,
*closed*, is not modelled anywhere. So the view the app advertises cannot be assembled from what is
stored, and that is the whole of the work: **record the ending, then render it.**

**Four things are true, and each is one grep.**

1. **`asleep` already proves the pattern is wanted.** `TerminalSessionSchema`'s field
   ([`terminal.ts:405-409`](../../../packages/shared/src/terminal.ts)) is documented as *"deliberately
   put to sleep (process killed, **transcript kept**)"* and is persisted so a slept row survives a
   relaunch as asleep rather than ended. Sleep is exactly "keep the transcript, drop the process" —
   applied on purpose. Closing is the same operation applied on accident, and it deletes instead.
2. **The transcript is already on disk, already capped, already written twice.**
   `<userData>/scrollback/<id>.bin`, `SCROLLBACK_BYTES = 1 MB`
   ([`terminal.ts:472`](../../../packages/shared/src/terminal.ts)), trimmed at a line boundary with an
   `ESC[0m` prefix ([`terminal-store.ts:136`](../../../packages/desktop/src/main/terminal-store.ts)).
   Two writers flush it on the same 15 s interval — the broker
   ([`broker/server.ts:352-372`](../../../packages/desktop/src/broker/server.ts)) and main
   ([`terminal-service.ts:154`](../../../packages/desktop/src/main/terminal-service.ts)). Nothing
   reads one back except a live terminal replaying into xterm.
3. **`sessions` is the *only* view that falls through to `Placeholder`.** Sixteen of the seventeen
   `ViewId`s have an explicit arm in [`app.tsx:1313-1356`](../../../packages/app/src/app.tsx).
   And the `Placeholder` it lands on tells the user to *"see todo/"* — a directory deleted in
   `1d6fd65` (*"move /todo into .midnite folder"*). The one view with no implementation points at
   the one path that no longer exists.
4. **The palette already lists sessions, and shows the wrong name for every one.**
   `createTerminalSource` ([`providers.ts:209-265`](../../../packages/app/src/services/palette/providers.ts))
   renders `session.title` — and `title` is documented as *"the **repo name**, by default"*
   ([`terminal.ts:390`](../../../packages/shared/src/terminal.ts)). The real label is
   `sessionLabel(session, autoName, agentLabel)`
   ([`terminal-store.ts:921`](../../../packages/app/src/features/terminal/terminal-store.ts)). So the
   palette's "Terminal Sessions" group shows the repo name three times over when three sessions are
   open in one repo.

**Builds on.**
- [`main/terminal-store.ts`](../../../packages/desktop/src/main/terminal-store.ts) — the
  directory-injected JSON store (`{version: 1, sessions: []}`) plus the `scrollback/` directory and
  `safeId()`. The history store is its sibling, not its replacement.
- [`main/diagnostics/trust-store.ts`](../../../packages/desktop/src/main/diagnostics/trust-store.ts) —
  the keyed-map store shape with a lazy in-memory cache and **real zod** validation. Its rule at
  `:121-127` (hand-rolled guards for main-only trivia, zod once a value crosses to the renderer)
  applies: a history record crosses.
- [`features/issues/issues-view.tsx`](../../../packages/app/src/features/issues/issues-view.tsx) —
  **the structural crib**, not Councils. A flat, homogeneous list you pick one row from and read in
  full is exactly the Issues shape: `useResizable` + `ResizeHandle`, an uppercase-11px header with a
  `tabular-nums` count and a right-aligned action, the loading/empty/rows branch, and a `Notice` for
  the unselected pane. Councils and Workflows are three-pane hierarchical views; sessions are flat.
- [`features/issues/issues-skeletons.tsx`](../../../packages/app/src/features/issues/issues-skeletons.tsx) —
  the per-feature `*-skeletons.tsx` convention (constant widths, the real row's geometry, wrapped in
  `LoadingRegion`). Unlike the live list, history **is** fetched asynchronously, so this view really
  does need one.
- [`components/state-dot.tsx`](../../../packages/app/src/components/state-dot.tsx) —
  `DotState = 'idle' | 'starting' | 'open' | 'exited' | 'unavailable' | 'asleep'`. `exited` exists but
  currently paints identically to `idle` and `unavailable`; see Theme C.
- [`features/workflows/run-history-list.tsx`](../../../packages/app/src/features/workflows/run-history-list.tsx) —
  the best of the three existing run-history lists: `dot | status | duration · relative age`, a
  `MultiSelectMenu` facet, `role="list"`, and local `relativeAge()`/`formatDuration()` helpers.

**Scope guardrails.**
- **Terminal sessions only.** Council runs spawn ptys under a synthetic `council-${randomUUID()}` id
  ([`council-runner.ts:287`](../../../packages/desktop/src/main/council-runner.ts)) that never enters
  `terminals.json`; workflow runs touch no pty at all. Both already have their own history UI. See
  Decision 2.
- **No new retention of live data.** This phase changes what happens at the *end* of a session and
  adds a reader. It does not touch `pty-service`, the broker wire protocol, or the 15 s flush.
- **No router.** [`app.tsx:179-198`](../../../packages/app/src/app.tsx) is explicit that this app has
  none — *"a desktop window has no address bar and no deep links"*. Selection is store state, in the
  unpersisted-and-keyed shape of [`store/issues-store.ts`](../../../packages/app/src/store/issues-store.ts).
- **No consolidation of the three status-dot/relative-time implementations.** Real, and a different
  phase. See *Not in this phase*.
- **`packages/app`, `packages/desktop`, `packages/shared`.** No `git-engine` change, no new dependency.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — A session that ends leaves a record (M)

- [ ] Add `packages/shared/src/domain/session-history.ts` — **new.**
      `ClosedSessionSchema` = the durable half of `TerminalSession` (`id`, `kind`, `agentId?`,
      `title`, `name?`, `cwd`, `repoId`, `createdAt`, `surface?`) plus `closedAt: number`,
      `exitCode: number | null`, `reason: 'closed' | 'exited' | 'superseded'`, and
      `transcriptBytes: number`.
  - `reason` distinguishes the three real endings: a user pressing the `X`, the process exiting on
    its own, and the FAB auto-closing a superseded loop session
    ([`fab-panel.tsx:239-253`](../../../packages/app/src/components/fab-panel.tsx)). A history that
    cannot tell "I closed it" from "it crashed" is not worth keeping.
  - Do **not** reuse `TerminalSessionSchema` via `.extend()` — it closes with `.superRefine`
    (`terminal.ts:426`), which returns a `ZodEffects` that cannot be extended. That trap is already
    documented in the schema's own comment at `:415-417`.
- [ ] Add `packages/desktop/src/main/session-history-store.ts` — **new**, in
      `trust-store.ts`'s shape: `createSessionHistoryStore(directory: string)`, no `electron` import,
      a lazy in-memory cache, zod validation, and a `nullSessionHistoryStore` fallback.
  - File: `<userData>/session-history.json`, `{ version: 1, closed: ClosedSession[] }`.
  - Transcripts move rather than copy: `scrollback/<id>.bin` → `session-history/<id>.bin`, reusing
    `safeId()`. One rename, no re-read of a megabyte.
- [ ] **Bound it, because nothing else in this repo does.** Cap at `MAX_CLOSED_SESSIONS = 200`
      (matching `councils-runs-store.ts`'s `MAX_STORED_RUNS`), evicting oldest-first **and unlinking
      the evicted transcript in the same operation**.
      [Phase 45](phase-45-leak-audit.md) found this exact bug twice — a cap applied to the copy
      written to disk and never to the in-memory array — so the eviction is one function, tested, with
      the file removal inside it.
- [ ] Rewrite `forgetTerminal` ([`terminal-service.ts:105`](../../../packages/desktop/src/main/terminal-service.ts))
      to **archive instead of delete**: drop the row from `terminals.json`, append a `ClosedSession`,
      rename the transcript. `mstudio:terminal:forget`'s contract is unchanged from the renderer's
      side — this is a main-side behaviour change behind a stable channel.
- [ ] Add an explicit `mstudio:sessions:purge` for real deletion, since "forget" no longer forgets.
      One id, or all. This is the only path that unlinks a transcript on request.
- [ ] `session-history-store.test.ts`: append/list round-trip, the 200-cap evicting oldest **with**
      its file, a corrupt JSON degrading to empty rather than throwing, and `safeId()` refusing a
      traversal id.

### B — The history channel (S)

- [ ] `mstudio:sessions:history` (list) and `mstudio:sessions:transcript` (one id → bytes) in
      [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), plus `mstudio:sessions:purge`
      from Theme A. `grep -rn "mstudio:sessions"` → **0** today; the prefix is free.
- [ ] The transcript channel returns `Uint8Array` **structured-cloned, never base64** — the
      convention `mstudio:pty:data` (`channels.ts:625`) already sets, and the reason a 1 MB
      transcript is cheap to send.
- [ ] Register through [`ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts)'s helpers,
      which resolve rather than reject on a validation failure (`:15-19`), and follow the
      `registerSessionsHandlers()` + `configureSessions()` split — handlers register at
      [`index.ts:241-301`](../../../packages/desktop/src/main/index.ts), **before** `userData` exists
      at `:309`, with stores constructed in the synchronous block at `:322-344`.
- [ ] Bridge group in [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) and `| 'sessions'`
      added to the `Pick<MidniteStudioBridge, …>` at
      [`preload/index.ts:101-145`](../../../packages/desktop/src/preload/index.ts), so a half-wired
      group is a compile error (`:95-100`).
- [ ] Schema round-trip tests beside the existing ipc schema tests.

### C — The view (M)

- [ ] Add `packages/app/src/features/sessions/sessions-view.tsx` — list left, transcript right, split
      by `useResizable` + `ResizeHandle`, copying
      [`issues-view.tsx`](../../../packages/app/src/features/issues/issues-view.tsx)'s layout exactly.
- [ ] Rows read `sessionLabel()`-equivalent naming, **not `session.title`** — `title` is the repo
      name (`terminal.ts:390`). A history row shows the session's own `name` when set, else the agent
      label, else the shell, with the repo name as secondary text. This is fact 4, fixed here rather
      than repeated.
- [ ] Row shape, following [`run-history-list.tsx`](../../../packages/app/src/features/workflows/run-history-list.tsx):
      `dot | label | agent icon | duration · relative age | exit code`. Group by repo, newest first.
- [ ] **Make `exited` visually distinct.** [`state-dot.tsx`](../../../packages/app/src/components/state-dot.tsx)
      paints `exited`, `idle` and `unavailable` identically today, which is tolerable in a live list
      where every row is live and unacceptable in a history where every row is not. Give `exited` its
      own tone; `DotState` already has the member, so this is a style arm, not an API change.
- [ ] A status facet over `reason` using `MultiSelectMenu`, empty = all — the app-wide facet
      convention `run-history-list.tsx` already follows.
- [ ] The transcript pane renders the archived bytes **read-only**, through the same
      `ESC`-sequence-aware path a live terminal uses. See Decision 3 for how, and what it must not be.
- [ ] `sessions-skeletons.tsx` with a `SessionHistorySkeleton`, wrapped in `LoadingRegion` — per
      `skeleton.tsx:130`'s rule that every skeleton goes through it. Unlike the live session list
      (synchronously populated from zustand), history is fetched, so a skeleton has real work to do.
- [ ] `EmptyState` for both empty cases, with different copy: no history yet
      (`title="No closed sessions"`) versus nothing selected (`title="Select a session"`).
- [ ] `store/sessions-store.ts` — selection only, **unpersisted**, keyed the way
      [`issues-store.ts`](../../../packages/app/src/store/issues-store.ts) is, with the same
      fall-back-to-auto-pick when the stored id is no longer in the fetched list.
- [ ] A **Purge** action per row and a "Clear history" in the header, both through
      `confirm-dialog`'s `danger: true` and `warnings` — not `blastRadius`, whose type is git-shaped
      (`{count, sample: {sha, subject}[]}`).
- [ ] `sessions-view.test.tsx`: rows render newest-first grouped by repo, the facet filters, selecting
      fetches a transcript once, and an empty history renders the empty state rather than a skeleton
      forever.

### D — The rail row stops lying (S)

- [ ] Add the `sessions` arm to the render chain in
      [`app.tsx:1313-1356`](../../../packages/app/src/app.tsx), **above** the `!selectedRepoId` guard
      at `:1334` with the other global views — session history spans repos, and placing it below
      would make it unreachable until a repo is open.
  - Coordinate with [Phase 60](phase-60-view-registry-and-error-boundaries.md), whose Theme A
    replaces this ternary with a `VIEW_COMPONENT` record and whose Decision 4 resolved that
    *"`sessions` stays `Placeholder`, explicitly"*. Whichever lands second adjusts one entry. See
    Decision 1.
- [ ] **Fix the stale `todo/` string** at [`app.tsx:471-477`](../../../packages/app/src/app.tsx).
      With `sessions` implemented, `Placeholder` has no remaining consumer — delete it, or if
      Phase 60 has landed first and made it the registry's fallback, correct the sentence. Either way
      the reference to a directory removed in `1d6fd65` goes.
- [ ] Give the row a chord in [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts)'s
      `VIEW_COMMAND`, or deliberately don't — it is a `Partial<Record<ViewId, CommandId>>` with five
      entries, and the rail tooltip shows only the chord, so no entry means no tooltip. See Decision 4.
- [ ] Fix `createTerminalSource`'s label (fact 4) so the palette's live-session group stops showing
      the repo name for every row.
- [ ] **Decide the FAB gap explicitly.** `surface: 'fab'` sessions are excluded from every list
      except the palette, which lists them unfiltered — and selecting one opens the terminal panel to
      a blank pane, because the panel filters them out via `inMainPanel`. Either filter the palette
      source or make the history include them. See Decision 5.

---

## Files this phase touches

| File | What |
|---|---|
| `packages/shared/src/domain/session-history.ts` | **new** — `ClosedSessionSchema`; not an `.extend()` of `TerminalSessionSchema` (it is a `ZodEffects`) |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | three `mstudio:sessions:*` channels (prefix is free) |
| `packages/desktop/src/main/session-history-store.ts` | **new** — trust-store shape, 200-cap with file eviction |
| [`packages/desktop/src/main/terminal-service.ts`](../../../packages/desktop/src/main/terminal-service.ts) | `forgetTerminal` archives instead of deleting |
| `packages/desktop/src/main/ipc/sessions-handlers.ts` | **new** — `register` + `configure` split |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) | registration by `:301`, store construction in the sync block at `:322-344` |
| [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | `\| 'sessions'` in the `Pick` at `:101-145` |
| `packages/app/src/features/sessions/` | **new** — `sessions-view.tsx`, `sessions-skeletons.tsx`, `sessions-view.test.tsx` |
| `packages/app/src/store/sessions-store.ts` | **new** — unpersisted selection, `issues-store.ts` shape |
| [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) | the `sessions` arm above the `:1334` guard; the `todo/` string at `:471-477` |
| [`packages/app/src/components/state-dot.tsx`](../../../packages/app/src/components/state-dot.tsx) | `exited` gets its own tone — a style arm, `DotState` unchanged |
| [`packages/app/src/services/palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) | `createTerminalSource`'s label; the FAB filter per Decision 5 |
| [`packages/app/src/components/nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) | a `VIEW_COMMAND` entry, or a recorded decision not to |
| [`packages/desktop/src/main/terminal-store.ts`](../../../packages/desktop/src/main/terminal-store.ts) | (**unchanged**) — `safeId()` is reused, not modified |
| [`packages/app/src/features/terminal/terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx) | (**unchanged**) — the live roster stays exactly as it is |
| [`packages/app/src/services/broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) | (**unchanged**) — see Decision 6 |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `pnpm e2e` green with no new `KNOWN_RED` entry.
- [ ] Closing a session moves it: it leaves the live list, appears in Sessions, and
      `scrollback/<id>.bin` no longer exists while `session-history/<id>.bin` does.
- [ ] The archived transcript is **byte-identical** to the scrollback that preceded it — a rename,
      not a re-encode.
- [ ] Closing 201 sessions leaves 200 records **and 200 transcript files**. The file count is the
      assertion that matters; Phase 45 found this exact class of bug twice.
- [ ] `mstudio:sessions:purge` is the only path that unlinks a transcript, and after it the row is
      gone from both the list and the JSON.
- [ ] A process that exits on its own is recorded `reason: 'exited'` with its real `exitCode`; a
      user close is `'closed'`; a superseded FAB loop is `'superseded'`.
- [ ] History **survives a relaunch**, and survives it with the app quit while a session was still
      running.
- [ ] A history row shows the session's own name, not the repo name — open three sessions in one
      repo, close them, and read three distinct labels.
- [ ] The palette's live "Terminal Sessions" group likewise shows three distinct labels (fact 4).
- [ ] `exited` and `idle` dots are visually distinguishable.
- [ ] Sessions is reachable **with no repository open** — the render arm sits above `app.tsx:1334`.
- [ ] `grep -rn "todo/" packages/app/src` returns nothing.
- [ ] A corrupt `session-history.json` leaves the app bootable and the view empty, not crashed.
- [ ] A 1 MB transcript renders without janking the pane — it is the cap, so it is the normal case.
- [ ] **Open, for a human:** close a Claude session mid-task, come back a day later, and read the
      transcript. The question the view has to answer is *"what did that agent actually do"* — if the
      answer is legible without reattaching anything, the phase worked.

---

## Not in this phase

- **A live-session view.** [`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx)
  is 488 lines and already does that job well. Sessions is the surface for what that list drops.
- **Council, workflow and loop run history.** Each already has its own list, and council runs never
  enter `terminals.json` at all. Decision 2.
- **Consolidating the four status-dot / relative-time implementations.** `loop-history.tsx`,
  `run-history-list.tsx` and `council-run-list.tsx` each hand-roll a dot map and a duration helper,
  and this phase would be the fourth. A genuine tidy, a genuine separate slice, and doing it here
  would put three unrelated features in the blast radius.
- **Searching transcripts.** The obvious sequel, and it wants an index rather than a `grep` over 200
  files.
- **Cross-window live sync of the history list.** Decision 6.
- **Re-opening a closed session.** Tempting and wrong: the cwd may be gone, the agent may be a
  different version, and "resume" already exists per-agent in the roster (`resume` in
  `BUILTIN_AGENTS`). A history you can read is the deliverable.
- **Surfacing broker-live-but-unsaved ptys.** `listTerminals` iterates `terminals.json`'s rows and
  asks the broker about each; it never iterates the broker's own list, so a previous build's session
  with no local row is invisible. Real, narrow, and about the live roster rather than history.

---

## Decisions / open questions

1. **Resolved — the seam with [Phase 60](phase-60-view-registry-and-error-boundaries.md), from both
   ends.** P60 Theme A replaces the view ternary with a `VIEW_COMPONENT` record, and its Decision 4
   resolved that *"`sessions` stays `Placeholder`, explicitly"* — correct at the time, because no
   sessions view existed. **Whichever lands second adjusts one entry**: if P67 lands first, P60's
   record maps `sessions` to the real view instead of the placeholder; if P60 lands first, Theme D
   edits the record rather than the ternary. Neither blocks the other. P60's Theme C (empty/loading
   states for six views) does not list `sessions`, so there is no overlap there.

2. **Resolved — terminal sessions only.** Council runs spawn ptys under `council-${randomUUID()}`
   (`council-runner.ts:287`) that never enter `terminals.json`; workflow runs spawn none; loop runs
   already point at a `TerminalSession` via `LoopRunRecord.sessionId` and have their own history UI.
   A Sessions view scoped to terminal sessions duplicates **nothing**; scoped to "everything that
   ran" it duplicates three existing surfaces and needs a union type over four record shapes. The
   narrow scope is also the one the rail label promises.

3. **Open — how is an archived transcript rendered?** Two options.
   (a) **A read-only xterm instance**, reusing the replay path a live terminal already uses, so
   colours, cursor moves and progress bars render exactly as they did. Faithful, and it spends from
   the WebGL context budget [Phase 51](phase-51-terminal-steadiness.md) Theme C introduced
   (`MAX_WEBGL_CONTEXTS = 12`) for a pane that will never receive input.
   (b) **Strip ANSI to plain text** and render it in a scrollable `<pre>`. Cheap, searchable,
   selectable — and wrong for any agent that draws a spinner or a diff in colour.
   *Recommendation:* **(a), mounted with the DOM renderer explicitly rather than WebGL.**
   `xterm-budget.ts` already exists to make that choice sayable, a read-only pane has no latency
   requirement that justifies a GPU context, and the whole value of a transcript is that it looks
   like what you saw. Confirm the budget module can be told "never WebGL" rather than merely losing
   the race for a context.

4. **Open — does Sessions get a chord?** `VIEW_COMMAND` is a `Partial<Record<ViewId, CommandId>>`
   with five entries, and a rail row's tooltip shows *only* the chord — so no entry means no tooltip
   at all. *Recommendation:* **no chord, and accept the missing tooltip.** Every free single-letter
   `Mod` chord is a scarce resource this app has nearly exhausted
   ([`keybindings.ts:263`](../../../packages/shared/src/keybindings.ts) says the `Mod+Shift+` space
   is *"nearly exhausted"*), and a history you consult occasionally does not outrank the things that
   already hold one. The palette entry already exists and already says "Agent Sessions".

5. **Open — the FAB gap.** `surface: 'fab'` sessions are excluded from `inMainPanel` and from the
   session list, but the palette lists them unfiltered — and selecting one opens the panel to a blank
   pane, which is a live bug independent of this phase. *Recommendation:* **include FAB sessions in
   history, and filter them out of the palette's live source.** History should be complete — a loop
   that ran unattended is exactly the thing you want to read afterwards — while the palette's job is
   navigation, and it should not offer to navigate somewhere that renders nothing.

6. **Resolved — no cross-window sync for the history list.**
   [`broadcast-sync.ts:30-34`](../../../packages/app/src/services/broadcast-sync.ts) deliberately
   refuses to mirror the terminal store, on the grounds that main owns durability and *"a synced
   second copy would be exactly the drifting duplicate its module doc warns against."* The same
   reasoning applies exactly: history lives in main, and each window fetches it. The cost is that a
   popout's list is stale until it refetches — which is why the header carries a refresh action, the
   same affordance `issues-view.tsx` uses for the same reason.

7. **Resolved — archive on close, not on exit.** A process exiting does not end a session: the row
   stays, `sessionPhase()` reports `ended`, and the user can still read the scrollback in place. Only
   `forget` removes it. Archiving at exit instead would double every session — once live-but-ended,
   once in history — and the `ended` state already exists to cover that window.
