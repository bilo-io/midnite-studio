# Phase 67 — The sessions you closed

**Refined: x1** · 2026-09-05 · data model & IPC contract, functionality & edge cases, concurrency & cancellation, empty/loading/error states, visual design, performance & scale, testing & verification, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

The rail has had a **Sessions** row since Phase 23. It renders a placeholder. This phase builds
what that row has been promising — and the promise is specific, because three places in the codebase
already wrote it down:

- [`components/nav-icons.ts:81`](../../../packages/app/src/components/nav-icons.ts) — `sessions: LuHistory`
- [`services/palette/providers.ts:43`](../../../packages/app/src/services/palette/providers.ts) — `sessions: 'Agent Sessions'`
- [`providers.ts:66`](../../../packages/app/src/services/palette/providers.ts) — `sessions: 'agent session history transcripts'`

A **history** of **agent sessions**, with **transcripts**. Not a second live list.

**The one fact this phase turns on: there is no history to show.** Closing a session does not end
it, it erases it. [`terminal-handlers.ts`](../../../packages/desktop/src/main/ipc/terminal-handlers.ts)'s
`mstudio:terminal:forget` reaches
[`forgetTerminal` (`terminal-service.ts:105-110`)](../../../packages/desktop/src/main/terminal-service.ts),
which drops the row from `terminals.json`, calls
[`dropScrollback` (`pty-service.ts:420-427`)](../../../packages/desktop/src/main/pty-service.ts) to
throw away the in-memory ring, and calls `store.forget(sessionId)` — which `rm`s
`scrollback/<id>.bin` ([`terminal-store.ts:77-84`](../../../packages/desktop/src/main/terminal-store.ts)).
There are exactly three session states —
[`sessionPhase()` (`terminal-store.ts:41-48`)](../../../packages/app/src/features/terminal/terminal-store.ts)
returns `live`, `asleep` or `ended` — and every one of them describes a session that still exists. A
fourth, *closed*, is not modelled anywhere. So the view the app advertises cannot be assembled from
what is stored, and that is the whole of the work: **record the ending, then render it.**

**Four things are true, and each is one grep.**

1. **`asleep` already proves the pattern is wanted.** `TerminalSessionSchema`'s field
   ([`terminal.ts:404-409`](../../../packages/shared/src/terminal.ts)) is documented as *"deliberately
   put to sleep (process killed, **transcript kept**)"* and is persisted so a slept row survives a
   relaunch as asleep rather than ended. Sleep is exactly "keep the transcript, drop the process" —
   applied on purpose. Closing is the same operation applied on accident, and it deletes instead.
2. **The transcript is already on disk, already capped, already written twice.**
   `<userData>/scrollback/<id>.bin`, `SCROLLBACK_BYTES = 1024 * 1024`
   ([`terminal.ts:472`](../../../packages/shared/src/terminal.ts)), trimmed at a line boundary with an
   `ESC[0m` prefix by the exported `trimScrollback(bytes, limit = SCROLLBACK_BYTES)`
   ([`terminal-store.ts:136`](../../../packages/desktop/src/main/terminal-store.ts)).
   Two writers flush it on the same `FLUSH_INTERVAL_MS = 15_000` interval — the broker
   ([`broker/server.ts:352-372`](../../../packages/desktop/src/broker/server.ts)) and main's
   `flushScrollback()` ([`terminal-service.ts:139-160`](../../../packages/desktop/src/main/terminal-service.ts)).
   Nothing reads one back except a live terminal replaying into xterm.
3. **`sessions` is the *only* `ViewId` whose registry entry is a placeholder.** All nineteen have an
   entry in `VIEW_COMPONENT`
   ([`view-registry.tsx:140-178`](../../../packages/app/src/components/view-registry.tsx)) since
   Phase 60 Theme A replaced the ternary — and eighteen of them name a real view. The nineteenth is
   `sessions: { Component: SessionsPlaceholder }` at `:166`, a centred paragraph that says *"The
   sessions view lands in a later phase"* and points at `.midnite/tasks/`.
4. **The palette already lists sessions, and shows the wrong name for every one.**
   `createTerminalSource` ([`providers.ts:213-270`](../../../packages/app/src/services/palette/providers.ts))
   renders `sess.title || …` at `:231` — and `title` is documented as *"Display label — the **repo
   name**, by default"* ([`terminal.ts:389-390`](../../../packages/shared/src/terminal.ts)). The real
   label is `sessionLabel(session, autoName, agentLabel)`
   ([`terminal-store.ts:921-925`](../../../packages/app/src/features/terminal/terminal-store.ts)),
   which is `session.name ?? autoName ?? agentLabel ?? 'Terminal'`. So the palette's "Terminal
   Sessions" group shows the repo name three times over when three sessions are open in one repo.

**Builds on.**
- [`main/terminal-store.ts`](../../../packages/desktop/src/main/terminal-store.ts) — the
  directory-injected JSON store (`createTerminalStore(directory: string): TerminalStore`,
  `type StoredState = { version: 1; sessions: TerminalSession[] }`) plus the `scrollback/` directory
  and the private `safeId()` at `:95-97`. The history store is its sibling, not its replacement.
- [`main/diagnostics/trust-store.ts`](../../../packages/desktop/src/main/diagnostics/trust-store.ts) —
  `createTrustStore(directory: string): TrustStore` at `:70`, the lazy `cache` + `load()` pattern at
  `:72-86` (a parse failure degrades to empty, never throws), and `nullTrustStore` at `:166-171`. Its
  rule at `:126-135` — hand-rolled guards for main-only trivia, **real zod** once a value crosses to
  the renderer — applies: a history record crosses.
- [`main/councils-runs-store.ts`](../../../packages/desktop/src/main/councils-runs-store.ts) —
  `MAX_STORED_RUNS = 200` at `:22` and the `runs.slice(runs.length - MAX_STORED_RUNS)` trim at
  `:45-47`. The **shape** crib for a capped store, and explicitly *not* the crib for eviction: it
  stores no files, so it has never had the half of the problem this phase has.
- [`features/issues/issues-view.tsx`](../../../packages/app/src/features/issues/issues-view.tsx) —
  **the structural crib**, not Councils. A flat, homogeneous list you pick one row from and read in
  full is exactly the Issues shape: `useResizable` + `ResizeHandle` (`:34-40`, `:119`), the header at
  `:86-101` (`PageDetachMark`, an uppercase `text-[11px]` `h2`, a `tabular-nums` count, an
  `ml-auto` refresh `IconButton`), the loading/empty/rows branch at `:103-116`, and the local
  `Notice` at `:130-148` for the unselected pane. Councils and Workflows are three-pane hierarchical
  views; sessions are flat.
- [`features/issues/issues-skeletons.tsx`](../../../packages/app/src/features/issues/issues-skeletons.tsx) —
  the per-feature `*-skeletons.tsx` convention (constant widths, the real row's geometry, wrapped in
  `LoadingRegion({label, className, children})`,
  [`skeleton.tsx:149-158`](../../../packages/app/src/components/skeleton.tsx)). Unlike the live list,
  history **is** fetched asynchronously, so this view really does need one.
- [`components/state-dot.tsx`](../../../packages/app/src/components/state-dot.tsx) —
  `DotState = 'idle' | 'starting' | 'open' | 'exited' | 'unavailable' | 'asleep'` at `:10`. `exited`
  has no arm of its own: it falls through to the shared `bg-muted-foreground/40` return at `:30`,
  alongside `idle` and `unavailable`. See Theme C.
- [`features/workflows/run-history-list.tsx`](../../../packages/app/src/features/workflows/run-history-list.tsx) —
  the best of the three existing run-history lists: `dot | status | duration · relative age` at
  `:96-113`, a `MultiSelectMenu` facet at `:75-85`, `role="list"` at `:92`, and local
  `relativeAge(ms, now)` / `formatDuration(ms)` helpers at `:24-35`.
- [`features/terminal/xterm-budget.ts`](../../../packages/app/src/features/terminal/xterm-budget.ts) —
  `MAX_WEBGL_CONTEXTS = 12` at `:23`, `XtermRenderer = 'webgl' | 'dom'` at `:26`, and
  `useXtermWebglSlot(key: string, visible: boolean): boolean` at `:107`. Theme D never calls it; see
  Decision 3 for why that is the opt-out.

**Scope guardrails.**
- **Terminal sessions only.** Council runs spawn ptys under a synthetic `council-${randomUUID()}` id
  ([`council-runner.ts:287`](../../../packages/desktop/src/main/council-runner.ts)) that never enters
  `terminals.json`; workflow runs touch no pty at all. Both already have their own history UI. See
  Decision 2.
- **No new retention of live data.** This phase changes what happens at the *end* of a session and
  adds a reader. It does not touch the broker wire protocol or the 15 s flush cadence, and the only
  edit to `pty-service.ts` is one `onSessionExit` subscription (`:167`) — a seam that already exists
  and currently has no consumer.
- **No router.** [`app.tsx:128-133`](../../../packages/app/src/app.tsx) is explicit that this app has
  none — *"a desktop window has no address bar and no deep links"*. Selection is store state, in the
  unpersisted shape of [`store/issues-store.ts`](../../../packages/app/src/store/issues-store.ts).
- **No consolidation of the four status-dot/relative-time implementations.** Real, and a different
  phase. See *Not in this phase*.
- **`packages/app`, `packages/desktop`, `packages/shared`.** No `git-engine` change, no new dependency.
  The renderer reaches main only through `window.midniteStudio` — every read in Themes C and D is an
  `mstudio:sessions:*` call, never a filesystem path.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Sequencing.** A → B → (C ∥ D) → E → F. A and B are one PR's worth together if you want them to be;
C and D are independent once B's channels exist (C reads `sessions:history`, D reads
`sessions:transcript`); E is a two-line registry edit that only makes sense once C exists; F is
additive and safe to defer indefinitely. **A landing alone is already a net win** — it stops
destroying transcripts — and leaves nothing broken, because nothing reads the archive yet. **E
landing before C would ship an empty view**, so E is the one ordering that is not optional.

## Deliverables

### A — A session that ends leaves a record (M)

- [ ] Add [`packages/shared/src/domain/session-history.ts`](../../../packages/shared/src/domain/session-history.ts) — **new** —
      exporting `ClosedSessionSchema`, `type ClosedSession = z.infer<typeof ClosedSessionSchema>`,
      `MAX_CLOSED_SESSIONS = 200`, and `closedFromSession()`.
  - Shape: the durable half of `TerminalSession` — `id: z.string().min(1)`,
    `kind: TerminalSessionKindSchema`, `agentId: z.string().min(1).optional()`, `title: z.string()`,
    `name: z.string().min(1).optional()`, `cwd: z.string().min(1)`, `repoId: z.string().min(1)`,
    `createdAt: z.number().int().nonnegative()`, `surface: TerminalSurfaceSchema.optional()` — plus
    `closedAt: z.number().int().nonnegative()`, `exitCode: z.number().int().nullable()`,
    `reason: z.enum(['closed', 'exited', 'superseded'])`, and
    `transcriptBytes: z.number().int().nonnegative()`.
  - `reason` distinguishes the three real endings: a user pressing the `X`, the process exiting on
    its own before that, and the FAB auto-closing a superseded loop session
    ([`fab-panel.tsx:249-267`](../../../packages/app/src/components/fab-panel.tsx)'s
    `usePruneSupersededSessions`). A history that cannot tell "I closed it" from "it crashed" is not
    worth keeping.
  - `taskRef` is deliberately **not** carried: it points at a ProjectV2 card that will outlive
    nothing in particular, and a closed session is not re-attachable to a board.
  - Write it as a fresh `z.object({…})`. Do **not** reuse `TerminalSessionSchema` via `.extend()` —
    it closes with `.superRefine(agentIdMatchesKind)` at
    [`terminal.ts:424`](../../../packages/shared/src/terminal.ts), which returns a `ZodEffects` that
    cannot be extended. That trap is already documented in the schema's own comment at
    `terminal.ts:415-417`.
  - `closedFromSession(session: TerminalSession, ending: { closedAt: number; exitCode: number | null;
    reason: ClosedSession['reason']; transcriptBytes: number }): ClosedSession` is a pure function
    and the **only** place the narrowing is written, so a field added to `TerminalSession` has one
    place to be considered rather than three.
  - Add `export * from './session-history';` to
    [`packages/shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts) beside
    `./window` at `:29` — the barrel is how `@midnite/studio-shared` re-exports domain types.
- [ ] **Export `safeId()`** from
      [`terminal-store.ts:95-97`](../../../packages/desktop/src/main/terminal-store.ts) rather than
      copying it. It is private today and its docblock says exactly why it exists — *"the id arrives
      over IPC and is interpolated straight into a path"*. Two copies of a traversal guard is one
      copy that stops being updated; the history store imports the same function.
- [ ] Add `packages/desktop/src/main/session-history-store.ts` — **new**, in
      [`trust-store.ts`](../../../packages/desktop/src/main/diagnostics/trust-store.ts)'s shape:
      `createSessionHistoryStore(directory: string): SessionHistoryStore`, no `electron` import, a
      lazy in-memory cache, real zod validation, and a `nullSessionHistoryStore` fallback.
  - ```ts
    export type SessionHistoryStore = {
      list: () => Promise<ClosedSession[]>;
      /** `transcriptFrom` is the live scrollback path to rename in, or null if there is none. */
      append: (record: ClosedSession, transcriptFrom: string | null) => Promise<void>;
      transcript: (sessionId: string) => Promise<Uint8Array>;
      /** One id, or every record when null. The only path that unlinks a transcript. */
      purge: (sessionId: string | null) => Promise<void>;
    };
    ```
  - File: `<directory>/session-history.json`, `{ version: 1, closed: ClosedSession[] }`, **newest
    last** (append order), so eviction is a `slice` off the front and `list()` reverses once for the
    renderer rather than the store sorting on every read.
  - `load()` mirrors `trust-store.ts:72-86` exactly: `if (cache) return cache`, parse inside
    `try`/`catch`, and on any failure `cache = []`. A corrupt file must leave the app bootable — the
    cost is a lost history, and the alternative is a store that throws inside `app.whenReady()`.
  - `transcript()` returns `new Uint8Array()` for a missing file rather than throwing: a record
    whose transcript was evicted or never written is a normal outcome, not an error.
  - **Directory-injected, `electron`-free**, matching `createTrustStore(directory)` and
    `createTerminalStore(directory)` — which is what lets the whole store be tested under bare
    vitest against a `mkdtemp` directory.
- [ ] **Transcripts move rather than copy**: `<directory>/scrollback/<safeId(id)>.bin` →
      `<directory>/session-history/<safeId(id)>.bin` via `fs/promises`' `rename`. One rename, no
      re-read of a megabyte, and the archived bytes are byte-identical by construction.
  - Fall back to `copyFile` + `rm` **only** on `EXDEV`. Both directories live under the same
    `userData` root today, so `EXDEV` cannot fire — the branch exists because `userData` is a
    user-relocatable path and a silent `ENOENT`-shaped failure here loses the transcript.
  - `mkdir(join(directory, 'session-history'), { recursive: true })` on first append, the way
    `terminal-store.ts` does for `scrollback/`.
- [ ] **Bound it, because nothing else in this repo does.** Cap at `MAX_CLOSED_SESSIONS = 200`
      (matching `councils-runs-store.ts:22`'s `MAX_STORED_RUNS`), evicting oldest-first **and
      unlinking the evicted transcript in the same operation**.
  - One exported-for-test function:
    `evictClosed(directory: string, next: ClosedSession[]): Promise<ClosedSession[]>` — it slices to
    the cap **and** `rm`s each dropped record's `session-history/<safeId>.bin` with `{ force: true }`
    before returning. The array and the files are trimmed by the same call or not at all.
  - [Phase 45](phase-45-leak-audit.md) found this exact bug twice — a cap applied to the copy
    written to disk and never to the in-memory array. `councils-runs-store.ts:45-47` is the shape to
    copy and *not* the completeness to copy: it caps an array of records that own no files.
- [ ] Rewrite `forgetTerminal` ([`terminal-service.ts:105-110`](../../../packages/desktop/src/main/terminal-service.ts))
      to **archive instead of delete**, in this order:
  1. **Flush first.** `await store.writeScrollback(id, trimScrollback(readScrollback(id)))` — the
     same pair `flushScrollback()` uses at `:154-158`. Without this the archive loses up to 15 s of
     output, and the last 15 s of an agent session is the part you close it to read. This is the
     single most load-bearing line in the theme.
  2. `await history.append(closedFromSession(session, {…}), scrollbackPathFor(id))`.
  3. `dropScrollback(id)` — the in-memory ring and the broker's copy
     ([`pty-service.ts:420-427`](../../../packages/desktop/src/main/pty-service.ts)).
  4. `sessions = sessions.filter(…)` and `scheduleSave()`, unchanged.
  - **`store.forget(sessionId)` is no longer called on this path.** That is the `rm`
    ([`terminal-store.ts:77-84`](../../../packages/desktop/src/main/terminal-store.ts)); the rename
    in step 2 has already taken the file. It survives only as `sessions:purge`'s implementation.
  - The body becomes async while the exported signature stays `forgetTerminal(sessionId: string,
    intent?: ForgetIntent): void` — the channel is a fire-and-forget `ipcMain.on`, so the renderer
    has nothing to await. Every failure is caught and logged through the one log seam; an archive
    that fails must still drop the row, or the `X` button stops working.
- [ ] **Derive `reason` and `exitCode` in main, from a seam that already exists.** Subscribe once at
      boot: `onSessionExit((sessionId, exitCode) => lastExit.set(sessionId, exitCode))`
      ([`pty-service.ts:167`](../../../packages/desktop/src/main/pty-service.ts), which returns an
      unsubscribe and has no consumer today).
  - `reason = intent === 'superseded' ? 'superseded' : lastExit.has(id) ? 'exited' : 'closed'`;
    `exitCode = lastExit.get(id) ?? null`.
  - Delete the map entry in the same step as `dropScrollback`, so `lastExit` cannot outgrow the
    session list — the append-only-map shape Phase 45 flags.
  - `TerminalForgetRequest`
    ([`schemas.ts:1319`](../../../packages/shared/src/ipc/schemas.ts)) gains
    `reason: z.enum(['closed', 'superseded']).optional()`, defaulting to `'closed'`. `'exited'` is
    never sent by the renderer — it is main's own reading of what happened, and the renderer does not
    reliably know.
  - `closeSession(sessionId, intent?: 'closed' | 'superseded')` in
    [`features/terminal/terminal-store.ts:472-489`](../../../packages/app/src/features/terminal/terminal-store.ts)
    passes it through; `usePruneSupersededSessions` (`fab-panel.tsx:263`) is the one call site that
    passes `'superseded'`.
- [ ] `session-history-store.test.ts` beside the store, under bare vitest against a `mkdtemp`
      directory: append/list round-trip preserving order; `evictClosed` at 201 records leaving 200
      rows **and** 200 files; a corrupt `session-history.json` yielding `[]` rather than throwing;
      `transcript()` on a missing id returning a zero-length `Uint8Array`; and `safeId()` mapping
      `../../etc/passwd` to a name that stays inside `session-history/`.
- [ ] `terminal-service.test.ts`: closing a session with unflushed bytes in the ring archives
      **those bytes**, not the last 15-second snapshot — the assertion that pins the ordering above.

### B — The history channel (S)

- [ ] Three channels in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), in a new
      `// --- session history ---` block beside the terminal block at `:360-365`:
      `sessionsHistory: 'mstudio:sessions:history'`,
      `sessionsTranscript: 'mstudio:sessions:transcript'`,
      `sessionsPurge: 'mstudio:sessions:purge'`. `grep -rn "mstudio:sessions" packages` → **0**
      today; the prefix is free.
- [ ] Schemas in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts):
      `SessionsHistoryResponse = z.object({ sessions: z.array(ClosedSessionSchema) })`,
      `SessionsTranscriptRequest = z.object({ sessionId: z.string().min(1) })`,
      `SessionsTranscriptResponse = z.object({ bytes: z.instanceof(Uint8Array) })`,
      `SessionsPurgeRequest = z.object({ sessionId: z.string().min(1).nullable() })`.
  - `z.instanceof(Uint8Array)` is copied verbatim from `PtySnapshotResponse` at `schemas.ts:1213`:
      the transcript crosses **structured-cloned, never base64**, which is what makes a 1 MB payload
      cheap. `channels.ts:697` states the same rule for `mstudio:pty:data`.
  - `sessionId: null` on purge means "everything" — one channel, not two, because the confirm dialog
      and the blast radius are the same in both cases and a second channel would duplicate both.
- [ ] Add `packages/desktop/src/main/ipc/sessions-handlers.ts` — **new**, following
      [`diag-handlers.ts`](../../../packages/desktop/src/main/ipc/diag-handlers.ts): a module-level
      `let store: SessionHistoryStore = nullSessionHistoryStore`, an exported
      `configureSessions(next: SessionHistoryStore): void` setter, and an exported
      `registerSessionsHandlers(): void` that wires the three channels through
      [`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts)'s helpers.
  - `diag-handlers.ts:19-30` is the crib and **`terminal-handlers.ts` is not** — that file keeps its
    `configureTerminals` in `terminal-service.ts`, which is exactly the split this store should not
    copy, since the store here has no service wrapped around it.
  - `handleBare(CHANNELS.sessionsHistory, () => store.list())` for the list (no request payload);
    `handle(…)` for transcript and purge, whose `onInvalid` arms return `{ bytes: new Uint8Array() }`
    and `undefined` respectively. `handle` resolves rather than rejects on a validation failure
    (`handle.ts:17-19`) precisely so the renderer sees an empty result instead of an opaque *"Error
    invoking remote method…"*.
- [ ] Wire it at boot, respecting the ordering that forces the split:
      `registerSessionsHandlers()` joins the `app.whenReady()` block at
      [`index.ts:298-365`](../../../packages/desktop/src/main/index.ts), which runs **before**
      `userData` is resolved at `:371`; `configureSessions(createSessionHistoryStore(userData))` goes
      in the store-construction block at `:427-465`, immediately after
      `configureTerminals(createTerminalStore(userData), userData)` at `:448`.
- [ ] Bridge group in [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), beside the
      `terminal` group at `:491-502`:
      ```ts
      sessions: {
        history: () => Promise<z.infer<typeof S.SessionsHistoryResponse>>;
        transcript: (req: In<typeof S.SessionsTranscriptRequest>) =>
          Promise<z.infer<typeof S.SessionsTranscriptResponse>>;
        purge: (req: In<typeof S.SessionsPurgeRequest>) => Promise<void>;
      };
      ```
      plus `| 'sessions'` added to the `Pick<MidniteStudioBridge, …>` at
      [`preload/index.ts:101-149`](../../../packages/desktop/src/preload/index.ts), so a half-wired
      group is a compile error rather than an `undefined` discovered at call time (`:95-100`).
- [ ] Teach the renderer's mock bridge the three methods, so `sessions-view.test.tsx` and
      `transcript-view.test.tsx` can drive them without an Electron process.
- [ ] Schema round-trip tests beside the existing ipc schema tests: a `ClosedSession` with every
      optional present and one with none both parse; a `reason` outside the enum fails; a
      `Uint8Array` survives `SessionsTranscriptResponse.parse`.

### C — The list (M)

- [ ] Add `packages/app/src/features/sessions/sessions-view.tsx` — **new** — list left, transcript
      right, split by `useResizable` + `ResizeHandle`, copying
      [`issues-view.tsx:80-127`](../../../packages/app/src/features/issues/issues-view.tsx)'s layout
      exactly: `<div className="flex h-full min-h-0">`, a fixed-width left column with
      `border-r border-border`, the handle, then the detail pane.
  - New `sessionsListWidth` entries in `DEFAULT_LAYOUT` and `LAYOUT_BOUNDS`
    ([`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts)), matching
    `issuesListWidth`'s values — the resizable reads `layout.sessionsListWidth` and writes through
    `setLayout`, which is where pane widths already persist.
  - Header row per `issues-view.tsx:86-101`: `PageDetachMark role="sessions"` (Theme F), an
    uppercase `text-[11px] font-semibold tracking-wide text-muted-foreground` `<h2>` reading
    **Sessions**, a `shrink-0 tabular-nums text-[11px]` count of the filtered rows, then
    `ml-auto` for the facet, the refresh `IconButton` (`LuRefreshCw`) and **Clear history**.
- [ ] Fetch through the app's query layer, not a bare `useEffect`: a `useSessionHistory()` hook in
      [`services/queries.ts`](../../../packages/app/src/services/queries.ts) over
      `bridge()?.sessions.history()`, keyed `['sessions','history']`, so `useRefreshForge`'s sibling
      invalidation pattern gives the header's refresh button something to call and the popout of
      Theme F refetches on mount rather than syncing.
- [ ] Rows read the session's **own** name, **not `session.title`** — `title` is the repo name
      (`terminal.ts:389-390`). A history row's primary label is
      `record.name ?? agentLabelFor(record.agentId) ?? (record.kind === 'agent' ? 'Agent Session' : 'Terminal')`,
      mirroring `sessionLabel()`'s precedence
      ([`terminal-store.ts:921-925`](../../../packages/app/src/features/terminal/terminal-store.ts))
      minus its `autoName` arm, which is live renderer state that no closed record carries. The repo
      name is secondary text. This is fact 4, fixed here rather than repeated.
- [ ] Row shape, following
      [`run-history-list.tsx:96-113`](../../../packages/app/src/features/workflows/run-history-list.tsx):
      a `<button type="button">` inside a `role="list"` container, laying out
      `dot | label | agent icon | duration · relative age | exit code`.
  - `duration = closedAt - createdAt`, rendered with a local `formatDuration(ms)` copied from
    `run-history-list.tsx:32-35`; age is `relativeAge(closedAt, now)` from `:24-30`. Copied, not
    imported — see *Not in this phase* on the four-way consolidation.
  - The exit code renders only when `exitCode !== null && exitCode !== 0`, as
    `text-destructive tabular-nums` — a clean exit is the uninteresting case and a column of `0`s
    would say nothing.
  - Grouped by `repoId` under a sticky repo header, newest first inside each group. Groups ordered
    by their newest member, so the repo you were last working in is at the top.
- [ ] **Make `exited` visually distinct** in
      [`state-dot.tsx`](../../../packages/app/src/components/state-dot.tsx). Add an arm **between**
      the `asleep` branch at `:27-29` and the fallback at `:30`:
      `if (state === 'exited') return <span className="size-1.5 shrink-0 rounded-full border border-muted-foreground/70" />;`
  - A hollow ring rather than a fourth grey fill: `asleep` already owns `/50` and the fallback owns
    `/40`, so a third opacity step would be a distinction nobody can see. "Ran, and is finished"
    reads as an outline; "idle" reads as a fill.
  - `DotState` is unchanged — the member already exists, so this is a style arm, not an API change.
    A `state-dot.test.tsx` assertion that `exited` and `idle` render different `className`s is what
    keeps it that way.
- [ ] A `reason` facet using
      [`MultiSelectMenu`](../../../packages/app/src/components/multi-select-menu.tsx), empty = all —
      the app-wide facet convention `run-history-list.tsx:75-85` already follows. Options are the
      three `reason` values with `label`s *Closed* / *Exited* / *Superseded*,
      `allLabel="All endings"`, `summarise={(n) => \`${n} endings\`}`,
      `label="Filter sessions by how they ended"`, `icon={<LuFilter …/>}`.
- [ ] `sessions-skeletons.tsx` with `SessionListSkeleton`, wrapped in
      `<LoadingRegion label="Loading closed sessions…" className="min-h-0 flex-1 overflow-hidden py-1">`
      per [`issues-skeletons.tsx`](../../../packages/app/src/features/issues/issues-skeletons.tsx).
      Unlike the live session list (populated synchronously from zustand), history is fetched, so a
      skeleton has real work to do.
- [ ] The four states render exactly one each, in `skeleton.tsx`'s stated order — error → empty →
      skeleton → content:
  - loading with nothing yet → `<SessionListSkeleton />`
  - fetched and empty → `<EmptyState icon={LuHistory} title="No closed sessions" body="Sessions you close will be kept here, transcript and all." />`
  - nothing selected (right pane) → `<Notice>Select a session to read its transcript.</Notice>`, the
    local `Notice` copied from `issues-view.tsx:130-148`
  - a `{ ok: false }`-shaped failure → `<Notice tone="destructive">…</Notice>` with the reason
- [ ] `store/sessions-store.ts` — **new** — selection only, **unpersisted**, in
      [`issues-store.ts`](../../../packages/app/src/store/issues-store.ts)'s shape:
      `create<SessionsState>()` with no `persist` middleware.
  - `selectedClosedSessionId: string | null` and `selectClosedSession(id: string | null): void` —
    a single id, **not** `issues-store.ts`'s `ByRepo<T> = Record<string, T>`. History spans repos by
    design (Theme E places the view above the repo guard), so a per-repo key would be selecting
    inside a list that is not per-repo.
  - The auto-pick fallback lives in the **view**, not the store — `pickInitialClosedSession(rows,
    stored)` beside `sessions-view.tsx`, mirroring `pickInitialIssue` at `issues-view.tsx:57-63`.
    It returns the stored id when it is still in the fetched rows, else the newest row, else null.
- [ ] A **Purge** action per row and **Clear history** in the header, both through `confirm-dialog`
      with `danger: true` and `warnings: string[]` — **not** `blastRadius`, whose type is git-shaped
      (`{ count: number; sample: { sha: string; subject: string }[] }`,
      [`confirm-dialog.tsx:19-22`](../../../packages/app/src/components/confirm-dialog.tsx)) even
      after Phase 59 generalised `blastRadiusKind`.
  - Per-row warning: `["The transcript is deleted from disk. This cannot be undone."]`.
      Clear-history warning names the count: `` [`${rows.length} sessions and their transcripts are deleted from disk. This cannot be undone.`] ``.
  - Both call `bridge()?.sessions.purge(…)` and then invalidate `['sessions','history']`.
- [ ] `sessions-view.test.tsx` (RTL, mock bridge): rows render newest-first grouped by repo; the
      facet narrows to one `reason`; three sessions closed in one repo render three **distinct**
      labels; an empty history renders `EmptyState` and not a skeleton forever; the per-row purge
      opens a confirm and calls `sessions.purge` with that id only after confirmation.

### D — The transcript pane (M)

- [ ] Add `packages/app/src/features/sessions/transcript-view.tsx` — **new** — a **read-only xterm**
      instance that writes the archived bytes once and takes no input. See Decision 3.
  - Props: `{ sessionId: string }`. It fetches its own bytes via
    `bridge()?.sessions.transcript({ sessionId })`, so the parent holds an id and never a megabyte.
  - **Not a reuse of** [`TerminalView`](../../../packages/app/src/features/terminal/terminal-view.tsx):
    that component wires an input path, a `pty.snapshot` fetch for `stateRef.current === 'open'`, and
    a wake-on-keystroke behaviour that starts a **new process** on a dead session (`:653-658`). A
    closed session with a gone `cwd` must never be able to spawn anything, and stripping three
    behaviours out of a 700-line component is a larger change than the ~80 lines this needs.
  - What it keeps from `TerminalView` is the two lines that matter:
    `term.write(bytes); term.write(RESET_MODES);` — the same pairing at `terminal-view.tsx:646-650`,
    so a transcript that ended mid-alternate-screen or mid-bracketed-paste does not leave the
    emulator in that mode.
- [ ] **DOM renderer, never WebGL.** `transcript-view.tsx` never calls `useXtermWebglSlot`
      ([`xterm-budget.ts:107`](../../../packages/app/src/features/terminal/xterm-budget.ts)) and
      never loads the WebGL addon.
  - That module has no `forceDom` flag — the DOM fallback is chosen by the caller, which is what
    `terminal-view.tsx` does at `:389`/`:401`/`:425` on init failure. So "opt out" here means "do not
    ask", and the budget's `MAX_WEBGL_CONTEXTS = 12` stays entirely available to live terminals.
  - Recorded as a comment in the file, because "why is this one DOM" is exactly the question a later
    performance pass will otherwise answer wrongly.
- [ ] Constructed read-only and disposed on unmount: `disableStdin: true`, `cursorBlink: false`,
      `convertEol: false`, `scrollback: 0` is **wrong** here (the whole point is scrollback) — set it
      to `SCROLLBACK_BYTES / 40` lines as a generous upper bound and let the trim already applied on
      disk do the real bounding. `term.dispose()` in the effect's cleanup, plus the `ResizeObserver`
      teardown `TerminalView` already models.
- [ ] Selection stays possible, input does not: `term.attachCustomKeyEventHandler` returns `false`
      for everything except copy (`Mod+c`) and select-all (`Mod+a`), so the pane is readable and
      copyable and cannot be typed into.
- [ ] Switching rows tears down and rebuilds: a new `sessionId` disposes the previous `Terminal` and
      constructs a fresh one, rather than `term.reset()` + rewrite. A `reset()` keeps the old
      `Terminal`'s dimensions and any addon state, and the phase's own verification is that the pane
      looks like what you saw.
  - An in-flight `sessions.transcript` call for a superseded id is ignored on arrival — compare the
    resolved id against a ref before writing, the standard guard for a fetch racing a selection
    change.
- [ ] `transcript-view.test.tsx` (RTL, mock bridge): a 1 MB payload writes once and only once;
      selecting a second session disposes the first `Terminal`; a keystroke does not reach `onData`;
      a zero-length transcript renders `<EmptyState title="No transcript" body="This session ended before anything was written." />`
      rather than an empty black rectangle.

### E — The rail row stops lying (S)

- [ ] Point the registry at the real view:
      [`view-registry.tsx:166`](../../../packages/app/src/components/view-registry.tsx) becomes
      `sessions: { Component: SessionsView, global: true }`, with
      `const loadSessionsView = () => import('../features/sessions/sessions-view');` and a
      `lazy(() => loadSessionsView().then((m) => ({ default: m.SessionsView })))` beside the other
      seventeen at `:38-71` — lazy, because it is not the first paint and it pulls in xterm.
  - **`global: true` is the substance of this item, not decoration.** Session history spans repos;
    without the flag, `app.tsx:1285`'s `viewIsGlobal || selectedRepoId ? <Component /> :
    <EmptyWorkspace />` renders the empty workspace until a repo is open, which would make the
    history of every other repo unreachable.
  - Phase 60's ternary is gone, so this is a one-line record edit, not a branch insertion. See
    Decision 1.
- [ ] Delete `SessionsPlaceholder` (`view-registry.tsx:82-106`) and its `BrandMark`/`useUiStore`
      imports, and rewrite the module docblock at `:17-22` — it names `SessionsPlaceholder` as one of
      the two deliberately-eager entries, and that sentence stops being true.
- [ ] Update [`view-registry.test.ts:37-50`](../../../packages/app/src/components/view-registry.test.ts)'s
      global set from seven names to eight by adding `'sessions'`, and correct the test's own comment
      — which currently explains why it is seven and not the five a stale phase doc named.
- [ ] Fix `createTerminalSource`'s label (fact 4):
      [`providers.ts:231`](../../../packages/app/src/services/palette/providers.ts)'s
      `label: sess.title || (…)` becomes
      `label: sessionLabel(sess, undefined, agentLabelFor(sess.agentId))`, so the palette's live
      "Terminal Sessions" group stops showing the repo name for every row.
- [ ] **Close the FAB gap** (Decision 5): filter `sess.surface === 'fab'` out of
      `createTerminalSource`'s `sessionItems` at `providers.ts:223-241`. Selecting one today opens
      the terminal panel to a blank pane, because the panel filters those rows out via `inMainPanel`
      ([`terminal-store.ts:397`, `:488`](../../../packages/app/src/features/terminal/terminal-store.ts)) —
      a live bug independent of this phase, fixed here because this phase is what makes those
      sessions reachable somewhere real. FAB sessions **do** appear in history.
- [ ] **No chord, deliberately** (Decision 4): no entry in
      [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts)'s `VIEW_COMMAND` and no
      new `CommandId` in [`keybindings.ts`](../../../packages/shared/src/keybindings.ts). Record the
      consequence in the file's docblock at `:18-19`, which already states the rule — *"a view with
      no chord gets no tooltip at all, not an empty one"*. The palette reaches it, and the palette
      entry already exists.
- [ ] While here, delete the one genuinely stale `todo/` reference left in the renderer:
      [`features/browser/use-browser-bounds.ts:16`](../../../packages/app/src/features/browser/use-browser-bounds.ts)
      cites `todo/phase-32-browser-engine-and-tabs.md`, a directory removed in `1d6fd65`. The
      sessions placeholder's own copy was corrected to `.midnite/tasks/` by Phase 60 and needs
      nothing.

### F — Detachable, like every other page (S)

- [ ] Add `'sessions'` to `PAGE_WINDOW_ROLES`
      ([`shared/src/domain/window.ts:20-40`](../../../packages/shared/src/domain/window.ts)) and
      `sessions: 'Sessions'` to `PAGE_ROLE_TITLE`
      ([`page-detach-mark.tsx:10-24`](../../../packages/app/src/components/page-detach-mark.tsx)).
  - Everything else is derived: `WindowRoleSchema`, `PanelWindowRole`/`PageWindowRole`,
    `isPageWindowRole`, `use-window-sync.ts`'s reconciliation and `detached-window-frame.tsx` all
    read the const array. Five files mention it and none of them branch per role.
  - The reason for its current absence is retired by this phase and must be edited, not left:
    `window.ts:42-58` says seven `ViewId`s are absent because `settings`, `landing` and `sessions`
    are *"a preferences pane, the app's front door, and a placeholder with no view behind it yet."*
    Make it six, and move `sessions` out of that sentence.
- [ ] It clears the bar `window.ts:52-57` sets for a second live copy: `SessionsView`'s mount has
      **no load-bearing side effects** — it fetches a list and renders it, seeds nothing, and drives
      no reveal. That is the audit the comment asks for, and it belongs in the commit message as well
      as the code.
- [ ] Sessions' **selection** joins the `broadcast-sync.ts` allowlist, its **list** does not.
      [`broadcast-sync.ts:38-42`](../../../packages/app/src/services/broadcast-sync.ts) already
      widened for exactly this: page popouts duplicate a view, so *"the per-view selection each one
      holds"* travels — Actions' open run, the Explorer's open file, the workbench's tabs. Add
      `sessions-store.selectedClosedSessionId` to that set. The history array stays out, for the
      reason Decision 6 gives.
- [ ] `page-detach-mark.test.tsx` gains `sessions` to whatever it enumerates, and
      `window.test.ts:29-33` needs no edit — it iterates `PAGE_WINDOW_ROLES` rather than naming
      members.

---

## Files this phase touches

| File | What |
|---|---|
| [`packages/shared/src/domain/session-history.ts`](../../../packages/shared/src/domain/session-history.ts) | **new** — `ClosedSessionSchema`, `MAX_CLOSED_SESSIONS`, `closedFromSession()`; a fresh `z.object`, never an `.extend()` of `TerminalSessionSchema` (a `ZodEffects`) |
| [`packages/shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts) | `export * from './session-history'` beside `./window` at `:29` |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | three `mstudio:sessions:*` channels (prefix is free); `TerminalForgetRequest` gains an optional `reason` |
| [`packages/shared/src/domain/window.ts`](../../../packages/shared/src/domain/window.ts) | `'sessions'` into `PAGE_WINDOW_ROLES`; the "seven absent" comment at `:42-58` becomes six |
| `packages/desktop/src/main/session-history-store.ts` | **new** — `trust-store.ts` shape, `rename`-based archive, 200-cap with file eviction |
| [`packages/desktop/src/main/terminal-service.ts`](../../../packages/desktop/src/main/terminal-service.ts) | `forgetTerminal` flushes, archives, then drops — and no longer calls `store.forget` |
| [`packages/desktop/src/main/terminal-store.ts`](../../../packages/desktop/src/main/terminal-store.ts) | `safeId()` becomes an export (`:95-97`); `forget()` survives as purge's implementation |
| [`packages/desktop/src/main/pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts) | one `onSessionExit` subscription (`:167`) to record the last exit code — the seam's first consumer |
| `packages/desktop/src/main/ipc/sessions-handlers.ts` | **new** — `registerSessionsHandlers()` + `configureSessions()`, per `diag-handlers.ts:19-30` |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) | registration inside `app.whenReady()` at `:298-365`; store construction at `:427-465`, beside `configureTerminals` at `:448` |
| [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | `\| 'sessions'` in the `Pick` at `:101-149` |
| `packages/app/src/features/sessions/` | **new** — `sessions-view.tsx`, `transcript-view.tsx`, `sessions-skeletons.tsx`, `session-order.ts`, and their specs |
| `packages/app/src/store/sessions-store.ts` | **new** — unpersisted `selectedClosedSessionId: string \| null`, one id not `ByRepo` |
| [`packages/app/src/components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx) | `sessions: { Component: SessionsView, global: true }` at `:166`; `SessionsPlaceholder` (`:82-106`) deleted |
| [`packages/app/src/components/view-registry.test.ts`](../../../packages/app/src/components/view-registry.test.ts) | the global set at `:37-50` goes from seven names to eight |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | `sessionsListWidth` in `DEFAULT_LAYOUT` and `LAYOUT_BOUNDS` |
| [`packages/app/src/services/queries.ts`](../../../packages/app/src/services/queries.ts) | `useSessionHistory()` keyed `['sessions','history']` |
| [`packages/app/src/components/state-dot.tsx`](../../../packages/app/src/components/state-dot.tsx) | an `exited` arm between `:29` and `:30` — a hollow ring, `DotState` unchanged |
| [`packages/app/src/components/page-detach-mark.tsx`](../../../packages/app/src/components/page-detach-mark.tsx) | `sessions: 'Sessions'` in `PAGE_ROLE_TITLE` |
| [`packages/app/src/services/broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) | `selectedClosedSessionId` joins the page-selection allowlist; the list itself stays out (Decision 6) |
| [`packages/app/src/services/palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) | `createTerminalSource`'s label at `:231`; `surface === 'fab'` filtered out of `:223-241` |
| [`packages/app/src/features/terminal/terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) | `closeSession(sessionId, intent?)` at `:472-489` |
| [`packages/app/src/components/fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx) | `usePruneSupersededSessions` passes `'superseded'` at `:263` |
| [`packages/app/src/features/browser/use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts) | the last stale `todo/` citation, at `:16` |
| [`packages/app/src/components/nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) | (**unchanged**) — no `VIEW_COMMAND` entry, on purpose; the docblock records why |
| [`packages/app/src/features/terminal/terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) | (**unchanged**) — the read-only pane is a sibling, not a mode of this component |
| [`packages/app/src/features/terminal/xterm-budget.ts`](../../../packages/app/src/features/terminal/xterm-budget.ts) | (**unchanged**) — Theme D opts out by not asking for a slot |
| [`packages/app/src/features/terminal/terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx) | (**unchanged**) — the live roster stays exactly as it is |
| [`packages/desktop/src/broker/server.ts`](../../../packages/desktop/src/broker/server.ts) | (**unchanged**) — the 15 s flush and the wire protocol are untouched |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `pnpm e2e` green with no new `KNOWN_RED` entry in
      [`playwright.ci.config.ts:31`](../../../packages/app/playwright.ci.config.ts).
- [ ] Closing a session moves it: it leaves the live list, appears in Sessions, and
      `<userData>/scrollback/<id>.bin` no longer exists while `<userData>/session-history/<id>.bin`
      does.
- [ ] The archived transcript is **byte-identical** to the scrollback that preceded it — a rename,
      not a re-encode. `session-history-store.test.ts` compares the two buffers.
- [ ] **Bytes written in the last second before closing are in the archive.** Write to a pty, close
      the session immediately, read the archive: the flush-before-rename ordering is the only thing
      that makes this pass, and without it up to 15 s of output is silently missing.
- [ ] Closing 201 sessions leaves 200 records **and 200 files in `session-history/`**. The file
      count is the assertion that matters; Phase 45 found this exact class of bug twice.
- [ ] `mstudio:sessions:purge` is the only path that unlinks a transcript, and after it the row is
      gone from both the list and `session-history.json`. `purge({sessionId: null})` empties both the
      JSON and the directory.
- [ ] A process that exits on its own and is then closed is recorded `reason: 'exited'` with its real
      `exitCode`; a close with no prior exit is `'closed'`; a superseded FAB loop is `'superseded'`.
- [ ] History **survives a relaunch**, and survives it with the app quit while a session was still
      running (that session is still live afterwards, not archived — Decision 7).
- [ ] A history row shows the session's own name, not the repo name — open three sessions in one
      repo, close them, and read three distinct labels.
- [ ] The palette's live "Terminal Sessions" group likewise shows three distinct labels (fact 4), and
      lists no `surface: 'fab'` row.
- [ ] `exited` and `idle` dots render different class names — asserted in `state-dot.test.tsx`, not
      eyeballed.
- [ ] Sessions is reachable **with no repository open** — `view-registry.test.ts`'s global set names
      it, and the e2e spec opens the view with `selectedRepoId` null and sees rows rather than
      `EmptyWorkspace`.
- [ ] `grep -rn "todo/" packages/app/src packages/desktop/src` returns nothing.
- [ ] A corrupt `session-history.json` leaves the app bootable and the view empty, not crashed.
- [ ] A 1 MB transcript renders without janking the pane — it is the cap, so it is the normal case.
      Measured, not asserted: `scripts/perf/idle-cpu.mjs --blurred` after opening one shows no
      regression against the same run with the view closed.
- [ ] The transcript pane holds **no WebGL context**: open twelve live terminals plus a transcript
      and none of the twelve drops to the DOM renderer.
- [ ] A keystroke in the transcript pane does nothing — no process is spawned, no `onData` fires.
- [ ] Detaching Sessions opens a second window rendering the same view; selecting a row in one moves
      the selection in the other; closing the popout leaves the docked copy untouched.
- [ ] Screenshot pass: `sessions-shots.spec.ts` covering the empty state, a populated list with all
      three `reason` values, and a selected transcript — in both themes.
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
  and Theme C makes this the fourth on purpose. A genuine tidy, a genuine separate slice, and doing
  it here would put three unrelated features in the blast radius of a new view.
- **Searching transcripts.** The obvious sequel, and it wants an index rather than a `grep` over 200
  files.
- **Exporting or sharing a transcript.** A "Save as…" is one dialog away and it is the first thing
  the next phase should add; it stays out because it needs a main-side file-write channel and a
  format decision (raw bytes vs ANSI-stripped) that neither theme here has an opinion on.
- **Cross-window sync of the history *list*.** Decision 6. Only the selection travels (Theme F).
- **Re-opening a closed session.** Tempting and wrong: the cwd may be gone, the agent may be a
  different version, and "resume" already exists per-agent in the roster (`resume` in
  `BUILTIN_AGENTS`). A history you can read is the deliverable.
- **A configurable retention cap.** `MAX_CLOSED_SESSIONS` is a constant, not a setting. 200 records
  at ≤1 MB each is a 200 MB ceiling nobody will notice; a setting means a migration, a Settings page
  arm, and a truncation-on-lower path, for a number no one has yet wanted to change.
- **Surfacing broker-live-but-unsaved ptys.** `listTerminals` iterates `terminals.json`'s rows and
  asks the broker about each; it never iterates the broker's own list, so a previous build's session
  with no local row is invisible. Real, narrow, and about the live roster rather than history.

---

## Decisions / open questions

1. **Resolved — the seam with [Phase 60](phase-60-view-registry-and-error-boundaries.md) is closed:
   P60 landed first.** Its Theme A replaced `app.tsx`'s seventeen-branch ternary with
   `VIEW_COMPONENT` in [`components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx),
   read once at `app.tsx:815` and rendered at `:1285` as
   `viewIsGlobal || selectedRepoId ? <Component /> : <EmptyWorkspace />`. So Theme E is a **one-line
   record edit plus a one-name test edit**, not a branch insertion — and the earlier framing ("place
   the arm above the `!selectedRepoId` guard") no longer describes anything that exists: ordering
   became the `global` flag. P60's own Decision 4 (*"`sessions` stays `Placeholder`, explicitly"*)
   was correct at the time and this phase is what retires it. P60's Theme C did not list `sessions`,
   so there is no overlap on empty/loading states either.

2. **Resolved — terminal sessions only.** Council runs spawn ptys under `council-${randomUUID()}`
   (`council-runner.ts:287`) that never enter `terminals.json`; workflow runs spawn none; loop runs
   already point at a `TerminalSession` via `LoopRunRecord.sessionId` and have their own history UI.
   A Sessions view scoped to terminal sessions duplicates **nothing**; scoped to "everything that
   ran" it duplicates three existing surfaces and needs a union type over four record shapes. The
   narrow scope is also the one the rail label promises.

3. **Resolved — a read-only xterm in its own component, DOM renderer, never WebGL.** The alternative
   was stripping ANSI to a scrollable `<pre>`: cheap, searchable, and wrong for any agent that draws
   a spinner or a diff in colour — the whole value of a transcript is that it looks like what you
   saw. Three findings settled the details the earlier framing left open.
   (a) **`TerminalView` cannot be reused read-only.** It wires an input path, a live
   `pty.snapshot` branch for `stateRef.current === 'open'`, and a wake-on-keystroke behaviour that
   spawns a **new process** on a dead session (`terminal-view.tsx:653-658`). A closed session whose
   `cwd` may no longer exist must not be able to spawn anything. `transcript-view.tsx` is ~80 lines
   and keeps only the `term.write(bytes); term.write(RESET_MODES)` pair from `:646-650`.
   (b) **`xterm-budget.ts` has no "never WebGL" flag** — `useXtermWebglSlot(key, visible)` is its
   only entry point, and the DOM fallback is chosen by the caller (`terminal-view.tsx:389`, `:401`,
   `:425`). So the opt-out is *not asking*: the transcript pane never calls it and never loads the
   addon, leaving all twelve of `MAX_WEBGL_CONTEXTS` to live terminals. No change to that module.
   (c) **Row switches dispose and rebuild** rather than `reset()` + rewrite, because `reset()`
   preserves dimensions and addon state, and fidelity is the deliverable.

4. **Resolved — no chord, and accept the missing tooltip.** `VIEW_COMMAND`
   ([`nav-chords.ts:34-40`](../../../packages/app/src/components/nav-chords.ts)) is a
   `Partial<Record<ViewId, CommandId>>` with five entries, and a rail row's tooltip shows *only* the
   chord — so no entry means no tooltip at all, which the file's own docblock at `:18-19` already
   states as intended behaviour rather than a gap. Every free single-letter `Mod` chord is a scarce
   resource this app has nearly exhausted ([`keybindings.ts:263`](../../../packages/shared/src/keybindings.ts)
   calls the `Mod+Shift+` space *"nearly exhausted"*), and a history you consult occasionally does
   not outrank the things that already hold one. The palette entry already exists and already says
   "Agent Sessions". *If this is ever revisited, `view.sessions` with no chord is the cheap
   half-step: it puts the command in `COMMANDS` without spending a key.*

5. **Resolved — include FAB sessions in history, and filter them out of the palette's live source.**
   `surface: 'fab'` sessions are excluded from `inMainPanel`
   ([`terminal-store.ts:397`, `:488`](../../../packages/app/src/features/terminal/terminal-store.ts))
   and from the session list, but `createTerminalSource` lists them unfiltered
   (`providers.ts:223-241`) — and selecting one opens the panel to a blank pane, a live bug
   independent of this phase. History should be complete: a loop that ran unattended is exactly the
   thing you want to read afterwards. The palette's job is navigation, and it should not offer to
   navigate somewhere that renders nothing. Both halves land in Theme E.

6. **Resolved — the history *list* does not sync across windows; the *selection* does.**
   [`broadcast-sync.ts:28-36`](../../../packages/app/src/services/broadcast-sync.ts) deliberately
   refuses to mirror the terminal store, on the grounds that main owns durability and *"a synced
   second copy would be exactly the drifting duplicate its module doc warns against."* The same
   reasoning holds for history: it lives in main, and each window fetches it — which is why the
   header carries a refresh action, the same affordance `issues-view.tsx` uses for the same reason.
   What **has** changed since this was first written is the other half: `broadcast-sync.ts:38-42`
   records that Theme H widened the allowlist for page popouts, because a duplicated view's
   per-view *selection* is renderer state no relay carried. `selectedClosedSessionId` belongs in
   that set (Theme F) exactly as Actions' open run and the Explorer's open file do.

7. **Resolved — archive on close, not on exit.** A process exiting does not end a session: the row
   stays, `sessionPhase()` reports `ended` (`terminal-store.ts:41-48`), and the user can still read
   the scrollback in place. Only `forget` removes it. Archiving at exit instead would double every
   session — once live-but-ended, once in history — and the `ended` state already exists to cover
   that window. The exit is still *recorded*: main keeps the last exit code per session from
   `onSessionExit` so the archive can say `reason: 'exited'` with a real `exitCode` when the close
   finally comes.

8. **Resolved — export `safeId()` rather than copy it.** It is private at
   `terminal-store.ts:95-97` today, and its docblock says why it exists: *"the id arrives over IPC
   and is interpolated straight into a path, and 'can never fire' is exactly the assumption that a
   later feature quietly invalidates."* This phase is that later feature. Two copies of a traversal
   guard is one copy that stops being updated.

9. **Resolved — selection is one id, not `ByRepo`.** [`issues-store.ts`](../../../packages/app/src/store/issues-store.ts)
   keys selection by repo because Issues is a per-repo view. Sessions is `global: true` and its rows
   are grouped by repo *within one list*, so a per-repo key would be selecting inside a list that is
   not per-repo. The auto-pick fallback still lives in the view (`pickInitialClosedSession`), the way
   `pickInitialIssue` does at `issues-view.tsx:57-63` — a store that owns a fallback owns the fetched
   data too, and this one does not.

10. **Resolved — Sessions becomes a detachable page (Theme F).** `PAGE_WINDOW_ROLES`
    ([`window.ts:20-40`](../../../packages/shared/src/domain/window.ts)) excludes it today, and the
    comment at `:42-58` gives the reason in so many words: *"a placeholder with no view behind it
    yet."* This phase removes that reason, and the view clears the bar the same comment sets for a
    second live copy — `SessionsView`'s mount seeds nothing and drives no reveal, unlike
    `BrowserPane`. It is a two-line change plus a comment edit, because every consumer derives from
    the const array. Kept as its own theme rather than folded into E so that E stays a two-file PR.

11. **Resolved — split the original Theme C in two.** It carried eleven items spanning a list, a
    store, a facet, an empty-state set, a confirm flow **and** an embedded terminal emulator — more
    than one reviewable PR, and two genuinely independent pieces once Theme B's channels exist. C is
    now the list (`sessions:history`) and D is the transcript (`sessions:transcript`); the old Theme
    D became E, and F is new. *Recorded here because the skill's own rule is that theme letters do
    not move — this is the deliberate exception, taken for PR size.*
