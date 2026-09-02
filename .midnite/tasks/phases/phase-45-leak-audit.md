# Phase 45 — The leak audit

[`scripts/perf/README.md`](../../../scripts/perf/README.md) has a section called **"What is not
measured here"**, and it names two things. One is idle CPU, which the script already computes and
only needs a quiet machine. The other is **renderer heap**, and its note is this phase's brief:

> Renderer heap needs a DevTools heap snapshot, and the exact click-path is written into the phase
> doc, because a heap number without the diff that produced it is not comparable to anything.

That sentence is right, and it is also the reason nothing has been measured since. A heap *number*
is not a measurement; a heap *diff across a defined action* is. So this phase does for retention
exactly what [Phase 36](phase-36-performance-diet.md) did for startup, bundle size and idle CPU:
turns the one metric still left to a human into a script with a budget, and then spends that
instrument on the leaks it finds.

**Builds on, and does not repeat.** Phase 36 Theme F already swept every module-level `Map`/`Set`
in **`packages/app/src`** and capped the one that needed it, publishing the table and the rule it
applied — *"a structure keyed on content needs a cap; one keyed on mounted components or a literal
enumeration does not, provided it deletes on unmount"*. That sweep is done and this phase does not
redo it. What it never touched is **`packages/desktop`**: main and the broker hold **35** top-level
`Map`/`Set` allocations, six intervals, a `WebContentsView` map, a pty map, fs watchers and a
socket client, and not one of them has been audited for retention.

**The shape of the phase.** Three parts, in order, because each needs the one before it:

1. **An instrument** — a retention harness under `scripts/perf/`, and a budget in
   [`budgets.json`](../../../scripts/perf/budgets.json), so "does this leak" stops being an opinion.
2. **A sweep with verdicts** — every retaining structure in main and the broker, each marked
   BOUNDED (by what) or LEAKING (what accumulates, and when), in a table the way Theme F's was.
3. **The fixes** — only the ones the instrument can show, and each landing with the assertion that
   would have caught it.

**Scope guardrails.** **No UI.** Measurement stays dev-side, exactly as Phase 36 insisted — the
scripts read from outside rather than having main report on itself, and nothing about this phase
ships in the product. **No renderer map re-sweep** — Theme F did it. **No speculative fixes**: a
structure that grows is not a leak if it is bounded and documented, and the sweep's job is to say
which is which, not to cap everything on sight. **No profiler UI, no `--inspect` workflow baked
into a task**, and **no heap snapshots committed** — they are megabytes and they are machine-shaped.

**Two constraints that are easy to get wrong, stated up front.**

- **One launcher, one number.** The retention spec must drive
  [`scripts/perf/electron-run.mjs`](../../../scripts/perf/electron-run.mjs), **not** Playwright's
  `_electron.launch`. [`startup-budget.spec.ts`](../../../packages/app/e2e/perf/startup-budget.spec.ts)
  explains at length why its own theme's checklist was wrong about this: the runner knows about the
  throwaway `--user-data-dir` that Electron's single-instance lock requires, and about seeding the
  profile before measuring it. Two launch paths produce two "startup" numbers and the budget
  asserts the wrong one. The same trap is waiting here.
- **A retention budget is a slope, not a level.** Every number in `budgets.json` today is a
  multiple of a `_measured` baseline (1.15× for deterministic sizes, 2.5× for anything that
  flakes). Retention does not work that way: the assertion is that heap **returns to where it
  started** after N cycles of an action, so the budget is a tolerance around zero growth, not a
  ceiling on a level. Say so in the file, or the next person to read it will apply the wrong rule.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The instrument (M)

Nothing else in this phase can be argued without this, so it lands first.

- [ ] `scripts/perf/memory-report.mjs`, launching through
      [`electron-run.mjs`](../../../scripts/perf/electron-run.mjs) like every other harness — **not**
      Playwright's `_electron.launch`. See the framing; `startup-budget.spec.ts` already paid for
      this lesson.
- [ ] It reports **three processes separately**: main, renderer, and the detached broker. They have
      different lifetimes and different leaks — a single total would hide the worst one in this
      phase (Theme C's broker growth) behind two healthy numbers.
- [ ] Sampling stays **outside** the app, reading `ps -o rss=`, as
      [`startup-report.mjs:69`](../../../scripts/perf/startup-report.mjs),
      [`idle-cpu.mjs:183`](../../../scripts/perf/idle-cpu.mjs) and `broker-load.mjs` already do.
      [`README.md:13`](../../../scripts/perf/README.md) states the rule this phase must not quietly
      break: *"Instrumentation is dev-side … the scripts read `ps` from outside rather than having
      the app report on itself. Nothing perf-shaped ships in the product."*
- [ ] A **retention** mode, which is the actual measurement: run an action N times, sample, and
      report the growth per cycle rather than the level. `--cycles=20 --action=<name>` with a small
      registry of actions (open/close a repo, open/close a terminal session, run a council, open and
      close 10 browser tabs).
  - RSS is noisy and V8 does not return memory promptly, so **compare medians of the last 5 cycles
    against the first 5**, not first-vs-last, and force a GC between cycles where the surface allows
    it (`--js-flags=--expose-gc` on the renderer; main and broker cannot be forced from outside).
  - The verdict is a **slope**: bytes retained per cycle. A flat line is a pass whatever the level.
- [ ] An `MSTUDIO_PERF=1` heap sampler in main and in the broker, shaped like the two that already
      exist — [`agent-process.ts:100`](../../../packages/desktop/src/main/agent-process.ts) and
      [`broker/server.ts:245`](../../../packages/desktop/src/broker/server.ts) — a flag-gated
      closure that accumulates and reports on an `unref()`'d interval, and is a **no-op closure**
      when the flag is unset, exactly as `createBootMark`
      ([`perf-marks.ts:23`](../../../packages/desktop/src/main/perf-marks.ts)) is.
  - This is the one place the phase **amends** the dev-side rule rather than honouring it, and it
    should say so out loud: `ps` cannot see V8 heap-vs-RSS, and "RSS grew" without "heap grew" does
    not distinguish a leak from allocator fragmentation. Gated behind the existing flag, no-op
    otherwise, nothing in the product.
  - Report `rss`, `heapUsed`, `heapTotal`, `external` and `arrayBuffers` from
    `process.memoryUsage()` — `arrayBuffers` is the one that will show Theme C, because scrollback
    is `Uint8Array`.
- [ ] A `retainedPerCycleKb` entry in [`budgets.json`](../../../scripts/perf/budgets.json), with a
      `_retention` note explaining that **this budget is a slope, not a level**, and that the
      1.15×/2.5× rule the rest of the file uses does not apply to it. A budget whose rule is
      misunderstood is worse than none.

### B — The sweep, with verdicts (S)

- [ ] A table of **every** retaining structure in `packages/desktop/src` — 35 top-level `Map`/`Set`
      allocations plus the arrays — each marked BOUNDED (by what, and where it is deleted) or
      LEAKING (what accumulates, and on what event). Published in the PR description and appended to
      the phase doc, the way [Phase 36](phase-36-performance-diet.md)'s Theme F sweep was.
- [ ] Apply Theme F's rule verbatim rather than inventing a second one: *"a structure keyed on
      content needs a cap; one keyed on mounted components or a literal enumeration does not,
      provided it deletes on unmount."* For main, read "mounted components" as "live ptys, open
      repos, open tabs, connected sockets".
- [ ] **`packages/git-engine` is in the sweep and is expected to come back clean** — every cache
      there is already a bounded LRU with a TTL (`stats-cache.ts` `STATS_CACHE_MAX = 32`,
      `discovery-cache.ts` `DISCOVERY_CACHE_MAX = 32`) and every watcher and listener has a release
      path. Record it as audited; do not change it.
- [ ] The sweep is **not** a licence to cap everything. A bounded, documented growth is a pass —
      `avatars.ts`'s cache of distinct commit authors was explicitly acquitted by Theme F on exactly
      that basis.

### C — The broker's scrollback, which outlives the app (M)

> The largest leak found, and the only one whose severity comes from *where* it lives.

- [ ] `scrollbackBySession` ([`broker/server.ts:125`](../../../packages/desktop/src/broker/server.ts))
      is `Map<sessionId, Uint8Array>` capped at `SCROLLBACK_BYTES * 2` = **2 MB per session**
      ([`terminal.ts:413`](../../../packages/shared/src/terminal.ts)). On pty exit (`:500`) and on
      `kill` (`:564`) the code deletes `sessionForPty` and `sessions` — **and never
      `scrollbackBySession`.**
- [ ] Why this is worse than the same bug in main: the broker is **detached and deliberately
      outlives the window**. `before-quit` calls `detachAll()`, not kill
      ([`main/index.ts:451`](../../../packages/desktop/src/main/index.ts)) — that is the Phase 30
      guarantee. So the growth is 2 MB per terminal session **ever opened, across app restarts**,
      until the idle timer fires.
- [ ] It also costs work, not just bytes: `flushAllScrollback()` (`server.ts:299`) walks the whole
      map every 15 s and writes a file per dead session, forever.
- [ ] **The fix needs a protocol addition, which is why this is its own theme.** Main's
      `forgetTerminal` clears main-side state only; there is no broker-side `dropScrollback` and no
      "forget this session" control message. Add one to
      [`broker/protocol.ts`](../../../packages/desktop/src/broker/protocol.ts)'s `ControlMessage`
      union — a discriminated union, so the new arm is a typecheck failure until handled.
- [ ] Delete on pty exit and on kill as well, so a session that ends normally does not wait for an
      explicit forget.
- [ ] *Acceptance:* the Theme A retention harness, running "open a terminal session, run a command,
      close it" × 20, shows **flat broker RSS and flat `arrayBuffers`**. Today it grows ~2 MB per
      cycle, which is what makes this the phase's headline number.

### D — Two run histories that are capped on disk and unbounded in memory (S)

- [ ] [`council-service.ts:27`](../../../packages/desktop/src/main/council-service.ts)'s in-memory
      `runs` array grows without limit. `MAX_STORED_RUNS = 200`
      ([`councils-runs-store.ts:22`](../../../packages/desktop/src/main/councils-runs-store.ts))
      trims **only the copy written to disk** (`:46`) — the trimmed array is never assigned back.
- [ ] Each run holds up to `COUNCIL_OUTPUT_CAP_BYTES` = **500 KB per member**
      ([`council.ts:179`](../../../packages/shared/src/council.ts)), so a four-member council
      retains ~2 MB per run, forever.
- [ ] [`loop-runs.ts:27`](../../../packages/desktop/src/main/loop-runs.ts) has the **identical**
      bug: `runs = [...runs, record]` at `:95`, with `MAX_STORED_LOOP_RUNS` trimming only the disk
      write (`loop-runs-store.ts:40`). Smaller payload, same shape.
- [ ] Fix both by trimming the in-memory array with the same constant, so the cap means one thing.
      **The bug is that a cap exists and is applied in exactly one of the two places it is needed** —
      say that in the commit, because the next store written from this template will copy it.
- [ ] *Acceptance:* a unit test asserts that after `MAX + 10` saves the in-memory array is `MAX`,
      not `MAX + 10`. One test per store; both would pass today against disk and fail against memory.

### E — The small ones, each with the assertion that catches it (S)

- [ ] **`runLocks` is never pruned** —
      [`council-runner.ts:55`](../../../packages/desktop/src/main/council-runner.ts) has `get` and
      `set` and no `delete`, so one settled promise leaks per council run.
  - The eviction idiom already exists in this repo: `evictIfCurrent` at
    [`write-queue.ts:105`](../../../packages/git-engine/src/exec/write-queue.ts) — delete only if
    the map still holds *this* tail, so a lock re-taken while the old one settles is not dropped.
    Copy it rather than writing a naive `delete`.
  - *Acceptance:* `runLocks.size === 0` after a run reaches a terminal state.
- [ ] **`inFlight` is retained on rejection** —
      [`tests-handlers.ts:122`](../../../packages/desktop/src/main/ipc/tests-handlers.ts) deletes in
      a `.then` with no `.catch`, so a spawn failure keeps the `{ kill }` handle forever *and*
      raises an unhandled rejection. `.finally` is the whole fix.
- [ ] **`stream-registry.release` is unreachable on a rejected stream** — it is called only inside
      `stream.done.then(...)` in [`log-service.ts:66`](../../../packages/desktop/src/main/log-service.ts)
      and [`search-service.ts:110`](../../../packages/desktop/src/main/search-service.ts), so a
      rejecting stream holds its entry until the window closes. Same `.finally` fix.
- [ ] **`dropKey` misses one of thirteen per-session records** —
      [`terminal-store.ts:96`](../../../packages/app/src/features/terminal/terminal-store.ts)'s
      `legacy: Record<string, boolean>` is never deleted for a closed session.
  - The bytes are trivial (~40 B) and the point is not the bytes: `dropKey`'s own docblock says it
    clears *every* per-session runtime map, and it does not. **Make it structural** rather than
    fixing the one — its `Pick<TerminalState, …>` is a hand-written list of twelve names, so a
    fourteenth record would leak just as quietly. A test that enumerates the store's
    `Record<string, …>` fields and asserts each is absent after `closeSession` is the fix that
    holds.
- [ ] **`wc.removeAllListeners()` before `webContents.close()`** —
      [`browser-service.ts:216`](../../../packages/desktop/src/main/browser-service.ts) drops the map
      entry, detaches the view and closes the contents, but leaves 13 per-tab handlers registered,
      each closing over `win` and `tabId`. They die with the contents, so this is hygiene rather
      than a live leak — but the module's own docblock says *"dropping every reference … is what
      actually frees it"*, and a listener closure **is** a reference.
- [ ] **`workflowCache` has a TTL but no eviction and no size cap** —
      [`gh-cli.ts:463`](../../../packages/desktop/src/main/forge/gh-cli.ts) checks staleness on read
      and never removes, unlike its two LRU neighbours in the same file. Bounded by distinct repos
      ever opened, so low severity; the asymmetry is the argument for fixing it.
- [ ] **`sessionExitHooks` is append-only** —
      [`pty-service.ts:80`](../../../packages/desktop/src/main/pty-service.ts) has a push and no
      `off`. Called once at boot today, so it is a latent risk rather than a leak. Record it in the
      sweep; add an `off` only if Theme B finds a second caller.

### F — Verification (M)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `moon run app:perf` green, with `retention.spec.ts` added under
      [`e2e/perf/`](../../../packages/app/e2e/perf/) beside the three that already live there. It
      inherits `testDir: './e2e/perf'` and the out-of-the-default-gate arrangement for free.
- [ ] The retention harness reports **flat** growth for all four registered actions, and the
      before/after numbers for each fix are in the PR description — per this repo's standing rule
      that a perf claim comes with a number.
- [ ] Every fix in Themes C–E lands with the assertion named beside it, and each of those assertions
      **fails against `main`** before the fix. An assertion that passes either way has proved
      nothing.
- [ ] No new dependency, and nothing perf-shaped in the product bundle: `moon run app:perf`'s
      bundle budget is unmoved and the entry chunk is unchanged.
- [ ] **Open, for a human:** one long-running session — open the app, work for an hour with
      terminals and councils, and compare the three RSS numbers against a fresh launch. The harness
      measures cycles; only a human measures a day.

## Files this phase touches

| Area | Path |
|---|---|
| Instrument *(new)* | `scripts/perf/memory-report.mjs`, `packages/app/e2e/perf/retention.spec.ts` |
| Instrument, edited | [`budgets.json`](../../../scripts/perf/budgets.json) (`retainedPerCycleKb` + a `_retention` note), [`README.md`](../../../scripts/perf/README.md) (the "What is not measured here" section shrinks by one) |
| Perf seam | [`shared/src/perf.ts`](../../../packages/shared/src/perf.ts), [`main/perf-marks.ts`](../../../packages/desktop/src/main/perf-marks.ts) |
| Broker | [`broker/server.ts`](../../../packages/desktop/src/broker/server.ts), [`broker/protocol.ts`](../../../packages/desktop/src/broker/protocol.ts) (a new `ControlMessage` arm) |
| Main fixes | [`council-service.ts`](../../../packages/desktop/src/main/council-service.ts), [`loop-runs.ts`](../../../packages/desktop/src/main/loop-runs.ts), [`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts), [`ipc/tests-handlers.ts`](../../../packages/desktop/src/main/ipc/tests-handlers.ts), [`log-service.ts`](../../../packages/desktop/src/main/log-service.ts), [`search-service.ts`](../../../packages/desktop/src/main/search-service.ts), [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts), [`forge/gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts) |
| Renderer fix | [`features/terminal/terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) (`dropKey` + its test) |
| Reused, unchanged | [`electron-run.mjs`](../../../scripts/perf/electron-run.mjs) (**unchanged** — one launcher, one number), [`write-queue.ts`](../../../packages/git-engine/src/exec/write-queue.ts) (**unchanged** — `evictIfCurrent` is the idiom to copy, not to edit) |
| Audited, unchanged | `packages/git-engine` — every cache is already a bounded LRU with a TTL; recorded in the sweep and left alone |

## Verification

*(See Theme F — the assertions are listed there rather than duplicated.)*

## Not in this phase

- **A re-sweep of `packages/app/src`.** [Phase 36](phase-36-performance-diet.md) Theme F did it,
  published the table and capped the one map that needed it.
- **Any memory UI.** The footer monitor shows the *machine*, deliberately
  (`metrics/memory.ts` shells out to `vm_stat` and has no per-process dimension). This phase does
  not add an app-memory readout, and the dev-side rule is the reason.
- **A `--inspect` / DevTools-protocol workflow as a moon task.** Heap snapshots are megabytes and
  machine-shaped; the retention slope is the thing that can live in CI, and a snapshot stays a human
  tool for diagnosing a slope the harness has already found.
- **Committed heap snapshots**, for the same reason.
- **Capping structures the sweep clears.** A bounded, documented cache is a pass.
- **`AbortController` adoption.** There is none in either package today — cancellation is
  `stream.cancel()` closures and `child.kill()` — and changing that idiom is a refactor with its own
  argument, not a leak fix.

## Decisions / open questions

- **Settled — the instrument lands before any fix.** Every other theme's acceptance is a number this
  one produces, and a leak "fixed" without a before/after is the folklore Phase 36 was written
  against.
- **Settled — three processes, measured separately.** Main, renderer and broker have different
  lifetimes; the headline leak lives in the one that outlives the app, and a combined total would
  bury it.
- **Settled — the retention budget is a slope.** Growth per cycle, not a level, and the file says so
  in a `_retention` note because every other number in it is a multiple of a baseline.
- **Settled — `git-engine` is audited and left alone.** Bounded LRUs with TTLs throughout.
- **Resolved — the `MSTUDIO_PERF` heap sampler is a deliberate, narrow amendment to the dev-side
  rule.** `ps` cannot separate heap from RSS, and that distinction is what tells a leak from
  fragmentation. It is flag-gated, a no-op closure when unset, and ships nothing — the same standing
  the two existing samplers already have.
- **Open — does the broker's forget message carry a session id, or a list?** *Recommendation:* a
  list. The reconciliation that discovers forgettable sessions runs on hydrate and will usually find
  several at once, and one round trip per dead session is a chatty protocol for a socket that exists
  to be quiet.
- **Open — should the retention harness run in CI?** *Recommendation:* not yet. RSS on a shared
  runner is noisy enough that a slope threshold loose enough to avoid flakes would not catch
  Theme D. Run it on demand, like `app:perf`, until the numbers show what a CI-safe tolerance would
  have to be. Revisit once there is a second phase's worth of history.
- **Open — is `sessionExitHooks` worth an `off`?** *Recommendation:* only if Theme B's sweep finds a
  second registration site. One boot-time caller is not a leak, and an unused `off` is API surface
  nobody exercises.
