# Phase 85 — The monitor that lied, and the memory it hid

**Brainstormed with a human in the loop** (see Decisions) · 2026-09-12 · from a reproduced bug
report — "the memory column is always zero on my M1, and the app feels heavy at idle" — and the
open perf items three earlier phases left on the table.

[Phase 36](phase-36-performance-diet.md) gave this app its measurement discipline
([`scripts/perf/`](../../../scripts/perf/README.md), packaged-equivalent or nothing, medians never
single runs, [`budgets.json`](../../../scripts/perf/budgets.json) as the one place a number may
live). [Phase 45](phase-45-leak-audit.md) added the retention slope.
[Phase 59](phase-59-workspace-optimizer.md) shipped the process table this phase is about.
[Phase 84](phase-84-live-everywhere-lighter-when-hidden.md) evicted what is *hidden*. This phase is
about what the app holds when nothing is hidden and nobody is touching it — and, first, about the
fact that on some machines the instrument reporting that has been returning zeros since Phase 59.

> **Five findings. The first was reproduced on the reporter's own machine during the brainstorm,
> and it is not the bug it looked like.**
>
> **1. It is a locale bug, not an Apple Silicon bug.**
> [`agent-process.ts:147`](../../../packages/desktop/src/main/agent-process.ts) reads the process
> table with `ps -axo pid=,ppid=,stat=,rss=,pcpu=,args=` and parses it at `:172` with a six-column
> regex whose `%CPU` group is `([\d.]+)` — **dot only**. `ps` formats that column through the
> process locale. On a machine whose `LC_NUMERIC` is a comma locale (`en_ZA.UTF-8` on the reporter's
> M1 Pro) the real output is `    1     0 Ss    22560   0,7 /sbin/launchd`, the six-column regex
> cannot match, and **every line** falls through to the four-column back-compat branch below it,
> which hard-codes `rssBytes: 0, cpuPercent: 0`. Run against the live 679-row process table on that
> machine: **six-column matches = 0, fallback matches = 679.** The M2 that "works" is on a dot
> locale. Nothing in `packages/desktop/src`, `packages/shared/src` or `scripts/` sets `LC_ALL`,
> `LC_NUMERIC` or `LANG` anywhere.
>
> **2. The fallback does not merely zero two columns — it shifts the command line.**
> In the four-column branch `args` captures `"22560   0,7 /sbin/launchd"`, RSS and %CPU prepended.
> [`kill-service.ts:49`](../../../packages/desktop/src/main/optimizer/kill-service.ts) derives the
> process **name** as `args.trim().split(/\s+/)[0]`, so the Name column shows `22560`. Three things
> downstream are wrong as a result: `PROTECTED_PROCESS_NAMES` (`:118`) can never match, so the
> system-process deny-list is **dead code on those machines**; the PID-reuse guard (`:130`) compares
> `target.args` against the `expectArgv` captured at display time, and since RSS and %CPU move
> between two reads it **rejects legitimate kills** with "the command line has changed since it was
> displayed"; and [`agent-watcher.ts:291`](../../../packages/desktop/src/main/agent-watcher.ts)
> matches running agents against the same polluted argv. Ownership (`isOurProcess`) is pid-based, so
> nothing unsafe is killed — the failure is a dead guard and a broken button, not an escape.
>
> **3. No test can catch it, by construction.** Every fixture in
> [`__fixtures__/`](../../../packages/desktop/src/main/__fixtures__/README.md) is four-column
> (`pid,ppid,stat,args`), captured before Phase 59 widened the `ps` call — its own README says so.
> So the whole suite exercises the fallback path and never the real one. The fallback exists *for
> the fixtures*, and it is what silently degrades production data.
>
> **4. The app already has a rule against this and one surface opted out.**
> [`monitor-flyout.tsx`](../../../packages/app/src/features/monitor/monitor-flyout.tsx)'s docblock:
> "**A metric that is `null` renders no readout at all** — no dot, no dash, no zero … a 'GPU 0%'
> would be a plain lie." The footer monitor honours it; `metrics/cpu.ts` returns `undefined`, never
> `0`, when the tick counters do not advance.
> [`memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx) renders the
> fabricated `0` happily, because [`ProcessInfoSchema`](../../../packages/shared/src/domain/optimizer.ts)
> makes `rssBytes`/`cpuPercent` non-nullable and gives the main process no way to say "I could not
> read this". The same file already knows the sibling lesson — `metrics/memory.ts:37` pins an
> absolute `/usr/bin/vm_stat` because "a Finder-launched Electron app inherits launchd's bare PATH",
> while `agent-process.ts` calls a bare `ps` with no absolute path and no env pinning.
>
> **5. Two real memory findings are already written down and neither was ever chased.**
> [`outstanding.md`](../outstanding.md) records that the `terminal` action's `main`/`broker`/`other`
> groups and the `browser-tabs` action's `other` group **breach `retainedPerCycleKb: 500` on both
> sides of Phase 84**, at nearly identical magnitude — "either the budget needs group/action-specific
> figures, or there is a genuine, long-standing leak … that predates this phase". And
> [Phase 36 Theme G](phase-36-performance-diet.md) has an open item calling a **focused, untouched**
> window bimodal, its high mode "episodic **renderer ~32% + GPU ~55% of a core** … That is a real
> battery bug." `budgets.json` itself calls the 500 figure "provisional pending more history", and
> [`heap-sampler.ts`](../../../packages/desktop/src/heap-sampler.ts) already says why a slope alone
> is not enough: `ps -o rss=` "cannot separate V8 heap from RSS, and that distinction is what tells
> a leak from allocator fragmentation."

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Scope guardrails.** Themes A and B are correctness and land first — every number this phase
produces is read through the instrument they fix, so nothing downstream is trustworthy until they
do. Themes C–F each open with a measurement item and land with a before/after in the PR body;
Phase 36's rule, restated. No number in `budgets.json` moves except through the README's rebaseline
procedure, and only in Theme G. **Interactive ptys keep the user's own locale** — the `LC_ALL=C`
pin is for processes this app *parses*, never for a shell it hands to a human. Bundle size, the
lane layout and the UI store's write frequency belong to [Phase 77](phase-77-thirteen-megabytes-of-editor.md)
and are declined here by name.

## Deliverables

### A — Every subprocess speaks C (S)

Fifteen files in `packages/desktop/src/main` and `packages/git-engine/src` call `execFile`/`spawn`.
None pins a locale. One shared helper, applied to the ones whose output is parsed.

- [ ] **Measure first.** Record, in the PR body, the actual `ps -axo pid=,ppid=,stat=,rss=,pcpu=,args=`
      output under `LC_ALL=C` and under a comma locale (`LC_ALL=de_DE.UTF-8` reproduces it anywhere),
      and the six-column-vs-fallback match counts for each against the current `parsePsOutput`. This
      is the evidence the rest of the theme cites, and it takes two minutes.
- [ ] A `parseableProcessEnv()` helper — a plain object merge, `{ ...process.env, LC_ALL: 'C',
      LC_NUMERIC: 'C' }` — living beside the existing spawn seams rather than in a new package.
      `LC_ALL` alone is sufficient on macOS and Linux; `LC_NUMERIC` is belt-and-braces for a shell
      that re-exports it. A comment above it names the failure it prevents, with the `0,7` line.
- [ ] Applied at every site whose output is **parsed**:
      [`agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts) (`ps`),
      [`metrics/memory.ts`](../../../packages/desktop/src/main/metrics/memory.ts) (`vm_stat`),
      [`metrics/gpu.ts`](../../../packages/desktop/src/main/metrics/gpu.ts),
      [`metrics/battery.ts`](../../../packages/desktop/src/main/metrics/battery.ts),
      [`metrics/disk.ts`](../../../packages/desktop/src/main/metrics/disk.ts) (`df -k` — integer-only
      today, so this is prophylactic, and the item says so),
      [`git-exec.ts`](../../../packages/git-engine/src/exec/git-exec.ts) (inside the existing
      `buildEnv(opts)` at `:87`, which is already the one place git's env is assembled) and
      [`forge/gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts) (`:77`, which
      already spreads `process.env`).
- [ ] **Explicitly not applied**, with a comment at each saying why:
      [`inproc-pty.ts`](../../../packages/desktop/src/main/inproc-pty.ts), the broker's spawn path,
      [`login-shell.ts`](../../../packages/desktop/src/main/login-shell.ts) and
      [`shell-path.ts`](../../../packages/desktop/src/main/shell-path.ts). A terminal is the user's
      shell; forcing `C` there would change their date formats, their `ls` collation and their
      agent's output encoding. This carve-out is the theme's one judgement call and it is written
      down, not implied.
- [ ] Absolute paths where the sibling already does: `agent-process.ts` calls a bare `ps`, while
      `metrics/memory.ts:37` pins `/usr/bin/vm_stat` for a documented reason that applies equally.
      `/bin/ps`, and the same comment.
- [ ] A guard so the next one cannot land: an eslint `no-restricted-syntax` rule (or a unit test
      walking the spawn sites, whichever reads better against the existing
      [`eslint.config.mjs`](../../../eslint.config.mjs) boundary groups) that fails an `execFile`/
      `spawn` in the parsed set without `parseableProcessEnv()`, with the carve-out list as an
      allowlist.
- [ ] A **hostile-locale CI job**: the existing unit suite re-run with `LC_ALL=de_DE.UTF-8` set on
      the job. Cheap (no packaged build), and it is the thing that would have caught this in 2026-08.

### B — A row that cannot be half-read (S)

- [ ] Delete the four-column fallback in
      [`parsePsOutput`](../../../packages/desktop/src/main/agent-process.ts). A line that does not
      match the six-column shape is **skipped**, exactly as an unparseable line is skipped today —
      not invented. The docblock gains the reason, replacing the "backward-compatibility for
      4-column test fixtures" sentence that justified it.
- [ ] Recapture the fixtures in
      [`__fixtures__/`](../../../packages/desktop/src/main/__fixtures__/README.md) in six-column
      form (a `sed` over the existing files inserting plausible `rss`/`pcpu` columns preserves every
      case they were built to cover — nested agent, two agents at equal depth, an agent's name as an
      argument, the four `foregroundOf` cases — without re-deriving them from a live machine, which
      the README explicitly warns against). The README's "four-column" prose is updated with them.
- [ ] `parsePsOutput` gains a test asserting that a **comma-decimal** line is skipped rather than
      half-read, and that an all-comma table yields an empty array — so the failure mode is "no
      rows", which the UI can say out loud, rather than "all zeros", which it cannot.
- [ ] `rssBytes` and `cpuPercent` become `z.number().nonnegative().nullable()` in
      [`ProcessInfoSchema`](../../../packages/shared/src/domain/optimizer.ts), and
      `ProcessTableResult` gains a nullable `error: string | null` for "could not read the process
      table" as distinct from "read it, it was empty".
- [ ] [`memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx) renders `—`
      for a `null`, adopting `monitor-flyout.tsx`'s stated rule verbatim (quote it in the diff), and
      surfaces the `error` string in the empty state instead of the current "No processes reported."
      Sorting treats `null` as "unknown" and parks those rows at the end in both directions — the
      existing tie-break comment at `:51` is the place that logic belongs.
- [ ] Fix the three downstream consequences in
      [`kill-service.ts`](../../../packages/desktop/src/main/optimizer/kill-service.ts): `commandName`
      gets a test proving it returns `launchd` and not a number for a real six-column row;
      `PROTECTED_PROCESS_NAMES` gets a test that actually exercises a match (there is currently no
      test that would have failed while the guard was dead); and the PID-reuse guard's `expectArgv`
      comparison is proven stable across two reads taken a second apart.
- [ ] *Acceptance, on a comma-locale machine:* the Memory tab shows real byte figures and real
      command names, and the kill button works. Verified by temporarily exporting
      `LC_ALL=de_DE.UTF-8` before launching, so it does not depend on owning the reporter's laptop.

### C — Name the retainer (L)

`memory-report.mjs` reports a **slope** and stops there. A breach currently cannot distinguish a
leak from allocator churn, which is why the recorded one has sat unresolved.

- [ ] **Measure first.** Re-run the recorded breach to confirm it still reproduces on current
      `main`: `moon run app:build desktop:bundle`, then
      `node scripts/perf/memory-report.mjs --action=terminal --cycles=20 --json` and the same for
      `--action=browser-tabs`. Table in the PR body, per process group. If it no longer reproduces,
      the theme's remaining items shrink to the budget rework and that is a fine outcome, recorded.
- [ ] **Heap snapshot diffing** in [`memory-report.mjs`](../../../scripts/perf/memory-report.mjs):
      a `--heap-diff` flag that, on the already-attached CDP session, takes a
      `HeapProfiler.takeHeapSnapshot` at cycle 1 and cycle N and reports the top retained
      constructors by delta. The script already owns a CDP client for exactly this reason (its own
      docblock explains why CDP and not Playwright's launcher); this is a second use of the same
      attachment, not a second launch path. Renderer first — main-process heap needs its own
      inspector port and is a separate item if the renderer diff does not explain the breach.
- [ ] The `other` process group is where both breaches live and it is the least specific label in
      the report. Split it by Chromium `--type=` and by argv so a breach names a **process kind**,
      not a leftover bucket.
- [ ] **A `--soak` mode**: hours rather than cycles. Launch once, drive a light repeating workload
      (open/close a repo, a terminal session, a browser tab on a long interval), sample every
      minute, and emit an RSS-over-time series per group plus a linear fit. This is
      [Phase 45 Theme F](phase-45-leak-audit.md)'s never-run item — "open the app, work for an hour
      with terminals and councils, and compare the three RSS numbers against a fresh launch" — made
      unattended. **Not wired into CI** (see Decisions).
- [ ] Land the verdict, whichever it is: either a named leak with a fix and a flat slope after it,
      or **group- and action-specific budgets** in `budgets.json` replacing the single
      `retainedPerCycleKb`, each with the run that justifies it in its own `_` note, per that file's
      own header rule. A verdict of "measurement characteristic" is only acceptable with the heap
      diff that supports it.
- [ ] `retention.spec.ts`'s `terminal` assertion currently fails `moon run app:perf`. Whatever the
      verdict, it ends this theme green — and `outstanding.md`'s entry for the gap is removed with
      the reason.

### D — The idle floor, attributed (L)

Measure first, then cut. The phase does not pre-commit to a saving it has no number for.

- [ ] **An `--idle` mode** in `memory-report.mjs`: launch the packaged-equivalent app via
      [`electron-run.mjs`](../../../scripts/perf/electron-run.mjs) with a repo open, let it settle,
      and report steady-state RSS **attributed per process** — main, broker, each renderer by its
      window role, each utility/GPU helper by `--type=` — plus the V8 heap split for main and the
      main renderer via the `heap-sampler.ts` seam that already exists under `MSTUDIO_PERF=1`. One
      table, and it is the first thing in the PR body.
- [ ] Run it against three states and put all three in the PR: cold with one repo, after the six
      heavy views have each been visited once, and after a detached popout. The second is what says
      whether [Phase 84 Theme G](phase-84-live-everywhere-lighter-when-hidden.md)'s bounded
      keep-alive is holding its ceiling in practice.
- [ ] **Then cut what the table names, and only that.** The leading candidate, named in advance so
      the doc is honest about its expectation, is the **main-side repo state snapshot** Phase 84's
      own headline deferred as "the natural Phase 85": every window independently spawns its own
      `git`/`gh` subprocess set for the same repo, where one shared snapshot in main broadcast to
      all windows would do. `WindowDescriptor.repoId` became real in Phase 84 Theme D, which is the
      prerequisite that was missing.
- [ ] If the attribution says the floor is dominated by Chromium's own per-renderer baseline — the
      measured `hiddenBrowserTabRss` of ~79.8 MB/tab says that is plausible — then this theme's
      deliverable is **the attribution plus a window/renderer-count policy**, and the doc says that
      rather than inventing a saving. An honest "there is nothing here to cut, here is why" is a
      landed item.
- [ ] A `idleRss` budget in `budgets.json` (a LEVEL, ×1.15 per the README's byte rule) so the floor
      cannot drift upward unnoticed the way `totalJsKb` did for a month.

### E — A monitor that reports real numbers (M)

`ps` is the right tool for foreign processes and the wrong one for our own.

- [ ] Midnite's own process tree comes from **`app.getAppMetrics()`**: accurate, free, no subprocess,
      and it already carries `type`, `serviceName`, `memory.workingSetSize` and `cpu.percentCPUUsage`
      per process. `ps` stays for everything else. `getProcessTableResult` merges the two by pid,
      preferring Electron's figures where they exist, and `ours` stops being inferred from a pid
      walk for our own processes because Electron simply tells us.
- [ ] **`phys_footprint` alongside RSS**, because macOS Activity Monitor's "Memory" column is
      footprint and RSS over-counts shared pages — which is a second, independent reason the
      reporter's numbers would look wrong even once Theme A lands. Shell out to `/usr/bin/footprint`
      or read it from `ps -o rss=,vsz=` plus `task_info` via the simplest route that works, behind
      the same nullable contract as Theme B (if it cannot be read, it is `null` and renders `—`).
      No native module (see Decisions).
- [ ] **Per-helper attribution**: each renderer and utility process labelled with what it is for —
      which browser tab, which detached window role, which pty session — by joining
      `getAppMetrics()`'s pids against the registries that already exist (`activePtyPids()`, the
      browser tab registry, the window descriptor list). This is the column that turns the table
      from a curiosity into something that answers "why is the app using 2 GB".
- [ ] The Memory tab gains an "own processes only" filter defaulting **off**, so the join above is
      visible without hunting, and the `memory` breakdown block keeps using `probeDetailedMemory()`
      unchanged — `vm_stat` is machine-wide and correct for that panel.
- [ ] *Acceptance:* with the app idle, the sum of the own-process footprint column is within ~10% of
      what Activity Monitor reports for Midnite Studio. The comparison screenshot goes in the PR.

### F — The window nobody touched (M)

[Phase 36 Theme G](phase-36-performance-diet.md)'s open item, unattended since. The reporter's own
System tab reads GPU 55% flat across fifteen minutes, which is the same figure that item recorded.

- [ ] **Reproduce and bound it.** `node scripts/perf/idle-cpu.mjs --seconds=600` focused, repeated,
      recording the full per-sample series rather than the single aggregate the script prints today
      — the item calls the burn *episodic* and *bimodal*, so an average over a short window is
      exactly the instrument that would miss it. Add the series output (`--json`) if it is not
      already there. If it does not reproduce on current `main`, say so with the runs and close the
      Phase 36 item — that is a valid and useful outcome.
- [ ] **Attribute it.** Chromium's own tracing is the tool: run with `--trace-startup` or attach
      DevTools' Performance panel to the idle renderer and identify what is compositing. The named
      suspects, in the order the brainstorm ranked them: an always-running CSS animation (the
      `--rainbow-ramp` conic `loop-glow-spin` on `.card-run-glow`, the FAB's
      `data-companion-state` looks, the liveness dot added in Phase 84 Theme I), xterm's WebGL
      renderer holding a compositor layer, and `useCascadeReveal`'s timers. Each is confirmed or
      cleared in the PR body — a list of suspects with no verdict is not this item.
- [ ] **Fix or bound it.** A CSS animation that only matters while something is running gets paused
      when it is not (`animation-play-state`, keyed off the same state the glow already reads); a
      compositor layer that need not be promoted loses its `will-change`. If the cause turns out to
      be Chromium's own idle compositing and not ours, that is written down and the item closes as
      "not ours, here is the evidence".
- [ ] An `idleGpuPercent`-shaped budget only if a number can be measured reliably from outside —
      `metrics/gpu.ts` already reads a GPU load figure, and if it is trustworthy enough to gate on,
      it gates. If it is not, say so rather than adding a flaky budget.
- [ ] *Acceptance:* a focused, untouched window for ten minutes stays in its low mode, with the
      series in the PR — and Phase 36 Theme G's open item is ticked with a link to this one.

### G — Numbers, before and after (S)

- [ ] Every budget this phase adds or changes (`idleRss`, the group/action retention figures,
      anything from F) carries its own `_` note in
      [`budgets.json`](../../../scripts/perf/budgets.json) naming the run that justifies it, the
      machine, and whether it is a LEVEL or a SLOPE — the shape that file already uses throughout.
- [ ] [`scripts/perf/README.md`](../../../scripts/perf/README.md)'s "What is not measured here"
      section is updated: the hour-long session it names as needing a human is now `--soak`, and the
      renderer-heap gap it names is now `--heap-diff`. Whatever remains genuinely human-only stays
      listed, with this phase's additions removed from it.
- [ ] `outstanding.md`'s Phase 84 Theme J entry (the `retainedPerCycleKb` calibration gap) and
      Phase 45 Theme F's long-session item are resolved and removed, or re-stated with what this
      phase learned. Neither is left saying the same thing it said before.
- [ ] One table in the final PR body: idle RSS, retention slopes per group, idle CPU/GPU, before and
      after, for the whole phase. The claim this phase exists to support — "the app is lighter at
      idle, and the monitor now says so truthfully" — is that table or it is not made.

## Files this phase touches

**A**
- [`packages/desktop/src/main/agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts);
  `metrics/{memory,gpu,battery,disk}.ts`;
  [`forge/gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts).
- [`packages/git-engine/src/exec/git-exec.ts`](../../../packages/git-engine/src/exec/git-exec.ts) — `buildEnv` only.
- Carve-out comments in `inproc-pty.ts`, `login-shell.ts`, `shell-path.ts`, `broker/`.
- [`eslint.config.mjs`](../../../eslint.config.mjs); `.github/workflows/ci.yml` (the hostile-locale job).

**B**
- `agent-process.ts` (`parsePsOutput`) + its test;
  [`__fixtures__/`](../../../packages/desktop/src/main/__fixtures__/README.md) (recaptured, README updated).
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) — `ProcessInfoSchema`, `ProcessTableResultSchema`.
- [`packages/desktop/src/main/optimizer/kill-service.ts`](../../../packages/desktop/src/main/optimizer/kill-service.ts) + test.
- [`packages/app/src/features/optimizer/memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx) + test.

**C**
- [`scripts/perf/memory-report.mjs`](../../../scripts/perf/memory-report.mjs) — `--heap-diff`, `--soak`, group split.
- [`scripts/perf/budgets.json`](../../../scripts/perf/budgets.json);
  [`packages/app/e2e/perf/retention.spec.ts`](../../../packages/app/e2e/perf/retention.spec.ts).

**D**
- `scripts/perf/memory-report.mjs` — `--idle`;
  [`scripts/perf/electron-run.mjs`](../../../scripts/perf/electron-run.mjs) (unchanged, used).
- [`packages/desktop/src/heap-sampler.ts`](../../../packages/desktop/src/heap-sampler.ts) — read, possibly widened.
- Whatever the attribution names — the repo-state snapshot would land in `packages/desktop/src/main/`
  beside Phase 84's `fetch-scheduler.ts`/`forge-poller.ts`.

**E**
- `kill-service.ts` (`getProcessTableResult`); `packages/shared/src/domain/optimizer.ts`;
  `memory-tab.tsx`; possibly a new `main/optimizer/app-metrics.ts` + test.

**F**
- [`scripts/perf/idle-cpu.mjs`](../../../scripts/perf/idle-cpu.mjs) (+ `idle-cpu.test.mjs`);
  [`packages/app/src/styles.css`](../../../packages/app/src/styles.css) and whichever component the
  attribution names; [`phase-36-performance-diet.md`](phase-36-performance-diet.md) Theme G.

**G** — `budgets.json`, [`scripts/perf/README.md`](../../../scripts/perf/README.md), [`outstanding.md`](../outstanding.md).

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme.
- [ ] `moon run root:tracker-check` exits 0.
- [ ] **A:** the unit suite passes under `LC_ALL=de_DE.UTF-8`; the new guard fails a deliberately
      unpinned spawn; a pty started from the app still shows the user's own locale (`locale` inside
      a Midnite terminal matches `locale` in Terminal.app).
- [ ] **B:** on a comma-locale launch, the Memory tab shows real bytes and real names, sorting parks
      unknowns last, and a kill of a Midnite-spawned process succeeds.
- [ ] **C:** `moon run app:perf` green, including `retention.spec.ts`'s `terminal` assertion; the
      heap-diff output for the breach is in the PR whatever the verdict.
- [ ] **D:** the three-state idle attribution table is in the PR; `idleRss` is in `budgets.json` with
      its note.
- [ ] **E:** own-process footprint sum within ~10% of Activity Monitor, with the screenshot.
- [ ] **F:** a ten-minute focused idle series in the PR; Phase 36 Theme G ticked or explicitly
      re-scoped with evidence.
- [ ] **Open, for a human:** the reporter's own M1 Pro, packaged build — Memory tab reads real
      numbers, kill works, and the app's idle RSS after an afternoon of normal use is compared
      against a fresh launch.
- [ ] **Open, for a human:** the same packaged build on a dot-locale Mac, confirming nothing
      regressed for the machines that already worked.

## Not in this phase

- **Everything in [Phase 77](phase-77-thirteen-megabytes-of-editor.md)** — Monaco's 13.2 MB and the
  `ts.worker`, the lane layout's pass-through edges, `ui-store`'s whole-slice `localStorage` write,
  and the `totalJsKb` rebaseline. 77 owns *bytes on disk and frames on screen*; this phase owns
  *bytes in RAM and the truth of the instruments reporting them*. The two are siblings and neither
  blocks the other.
- **A native module for `phys_footprint`.** Theme E takes the shell-out. A native addon drags the
  ABI rebuild story ([`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md)'s verified constraint)
  into a phase that otherwise adds no dependency.
- **The renderer-side numbers for Phase 84 Themes E.6/F.5** — they need the terminal tab strip and
  browser tab strip driven through Playwright, which `outstanding.md` already sizes as its own
  follow-up. Theme C's `--soak` does not replace them.
- **Phase 84 Theme G.5's graph-first-row latency** — a timing instrument, not a memory one, and it
  needs `make-big-repo.sh` wired into a script's `--repo`. Stays in `outstanding.md`.
- **Windows/Linux locale behaviour.** The carve-outs and the `LC_ALL` pin are correct on both, but
  this app ships macOS arm64 only ([Phase 11](phase-11-packaging.md)) and no non-macOS verification
  is claimed.
- **A perf UI in the product.** `scripts/perf/`'s third principle stands: measurement is dev-side,
  and the Optimizer's process table is a *product* feature that happens to show numbers, not an
  instrument this phase reports from.

## Decisions / open questions

- **Resolved — it is a locale bug and the fix is `LC_ALL=C`, not a comma-tolerant regex.** Widening
  the regex to `([\d.,]+)` and normalising would also work and is a smaller diff. It was declined:
  it fixes one column of one command, leaves fourteen other spawn sites depending on the machine's
  region setting, and there is no honest way to normalise `1,234.5` versus `1.234,5` from a regex
  that cannot know which locale produced it. Pinning the output format is the fix; parsing more
  formats is the trap.
- **Resolved — interactive ptys keep the user's locale.** The carve-out is named in Theme A with a
  comment at each site. A shell that suddenly collates differently would be a worse bug than the one
  being fixed.
- **Resolved — the fallback is deleted, not repaired.** A parser that invents `0` for a line it
  could not read is the defect; skipping is the behaviour the same function already has for every
  other unparseable line, and `null` through the schema is how the UI says so.
- **Resolved — zeros become `—`, per the app's own existing rule.** `monitor-flyout.tsx` already
  wrote the policy down; `memory-tab.tsx` is the surface that opted out of it.
- **Resolved — Themes A and B land first, in their own PR.** Everything C–F measures is read through
  the instrument A/B fix. They are also the only themes with a user-visible bug fix in them, and
  they are small.
- **Resolved — 85 and 77 stay separate.** Absorbing 77 was considered and declined; the seam is
  "in RAM" versus "on disk and on screen", and both phases can run in parallel without touching the
  same files.
- **Resolved — `--soak` is human-run, not CI.** A multi-hour job in CI buys a flaky gate and a slow
  one. It is an instrument a human reaches for, like `idle-cpu.mjs --blurred` already is.
- **Open — does Theme D's cut actually exist?** The phase deliberately does not promise one. If the
  attribution says the floor is Chromium's per-renderer baseline, D ships the attribution, the
  `idleRss` budget and a window-count policy. Recommendation: accept that outcome if the table says
  it, and record the repo-state snapshot as a sized follow-up rather than forcing it in.
- **Open — main-process heap diffing.** Theme C's `--heap-diff` starts with the renderer, which the
  existing CDP attachment already reaches. The recorded breach's groups are `main`/`broker`/`other`,
  so the renderer may not be where it lives. Recommendation: land the renderer diff, and if the
  breach is in main, add `--inspect` to `electron-run.mjs`'s main-process flags as a second item
  rather than scoping it up front.
- **Open — how is `phys_footprint` actually read?** `/usr/bin/footprint` needs elevated privileges
  for other users' processes but works unprivileged for one's own; `ps -o rss=` is not footprint at
  all. Recommendation: try `footprint` for our own tree only (which is all Theme E claims), fall
  back to `null` and `—` if it is unavailable, and never block the table on it.
- **Open — is `metrics/gpu.ts`'s load figure trustworthy enough to budget against?** Theme F needs
  it only if it wants an `idleGpuPercent` gate. Recommendation: measure its variance over a quiet
  window first; if it is noisy, F closes on the CPU series alone and says why.
- **Open — should the hostile-locale CI job run the e2e suite too, or only unit tests?** Unit is
  cheap and catches the parser class. Recommendation: unit only; the e2e suite is
  [Phase 82](phase-82-the-pyramid-righted.md)'s cost problem and this phase should not add to it.
