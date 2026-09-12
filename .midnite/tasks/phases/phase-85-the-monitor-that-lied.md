# Phase 85 — The monitor that lied, and the memory it hid

**Refined: x1** · 2026-09-12 · UI/UX & interaction, visual design & theming, accessibility & keyboard, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, observability & diagnostics, security/permissions & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

**Brainstormed with a human in the loop** · 2026-09-12 · from a reproduced bug report — "the memory
column is always zero on my M1, and the app feels heavy at idle" — and the open perf items three
earlier phases left on the table.

[Phase 36](phase-36-performance-diet.md) gave this app its measurement discipline
([`scripts/perf/`](../../../scripts/perf/README.md), packaged-equivalent or nothing, medians never
single runs, [`budgets.json`](../../../scripts/perf/budgets.json) as the one place a number may
live). [Phase 45](phase-45-leak-audit.md) added the retention slope.
[Phase 59](phase-59-workspace-optimizer.md) shipped the process table this phase is about.
[Phase 84](phase-84-live-everywhere-lighter-when-hidden.md) evicted what is *hidden*. This phase is
about what the app holds when nothing is hidden and nobody is touching it — and, first, about the
fact that on some machines every instrument reporting that has been returning zeros since Phase 59.

> **Six findings. The first was reproduced on the reporter's own machine during the brainstorm,
> and it is not the bug it looked like.**
>
> **1. It is a locale bug, not an Apple Silicon bug.**
> [`agent-process.ts:147`](../../../packages/desktop/src/main/agent-process.ts) reads the process
> table with `ps -axo pid=,ppid=,stat=,rss=,pcpu=,args=` and parses it at `:172` with a six-column
> regex whose `%CPU` group is `([\d.]+)` — **dot only**. `ps` formats that column through the
> process locale. On a machine whose `LC_NUMERIC` is a comma locale (`en_ZA.UTF-8` on the reporter's
> M1 Pro) the real output is `    1     0 Ss    22560   0,7 /sbin/launchd`, the six-column regex
> cannot match, and **every line** falls through to the four-column back-compat branch at `:192`,
> which hard-codes `rssBytes: 0, cpuPercent: 0`. Run against the live 679-row process table on that
> machine: **six-column matches = 0, fallback matches = 679.** The M2 that "works" is on a dot
> locale.
>
> **2. The fallback does not merely zero two columns — it shifts the command line.**
> In the four-column branch `args` captures `"22560   0,7 /sbin/launchd"`, RSS and %CPU prepended.
> [`kill-service.ts:49`](../../../packages/desktop/src/main/optimizer/kill-service.ts) derives the
> process **name** as `args.trim().split(/\s+/)[0]`, so the Name column shows `22560`. Four things
> downstream are wrong as a result: `PROTECTED_PROCESS_NAMES` (`:118`) can never match, so the
> system-process deny-list is **dead code on those machines**; the PID-reuse guard (`:130`) compares
> `target.args` against the `expectArgv` the renderer captured at display time
> ([`use-optimizer.ts:295`](../../../packages/app/src/features/optimizer/use-optimizer.ts) sends
> `proc.argv` verbatim), and since RSS and %CPU move between two reads it **rejects legitimate
> kills**; and `matchRunningAgent` (`agent-process.ts:430`), `foregroundOf` (`:463`) and
> `commandLabel` (`:508`) — all reached through
> [`agent-watcher.ts:291`](../../../packages/desktop/src/main/agent-watcher.ts)'s `readRows` — match
> against the same polluted argv, so the session auto-namer and agent detection are affected too.
> Ownership (`isOurProcess`, `:498`) is pid-based, so nothing unsafe is killed — the failure is a
> dead guard, a broken button and a mislabelled session, not an escape.
>
> **3. Nothing can catch it: not the types, not the tests.**
> `rssBytes`/`cpuPercent` are `z.number().nonnegative()` in
> [`ProcessInfoSchema`](../../../packages/shared/src/domain/optimizer.ts), so **`0` validates
> cleanly and zod will never see it**. And every fixture in
> [`__fixtures__/`](../../../packages/desktop/src/main/__fixtures__/README.md) is four-column
> (`pid,ppid,stat,args`), captured before Phase 59 widened the `ps` call — its own README says so —
> so the whole suite exercises the fallback path and never the real one. The fallback exists *for
> the fixtures*, and it is what silently degrades production data. `memory-tab.tsx`'s own sort
> comparator even documents the symptom without knowing it: *"two processes at 0.0% CPU with no
> stable secondary key swap places between polls"* (`:47–54`). The default sort is
> `{ key: 'rss', dir: 'desc' }`, which under the bug collapses to pure pid order.
>
> **4. The app already has a rule against this and one surface opted out.**
> [`monitor-flyout.tsx`](../../../packages/app/src/features/monitor/monitor-flyout.tsx)'s docblock:
> "**A metric that is `null` renders no readout at all** — no dot, no dash, no zero … a 'GPU 0%'
> would be a plain lie." `metrics/cpu.ts` returns `undefined`, never `0`, when the tick counters do
> not advance. [`memory-tab.tsx:391–397`](../../../packages/app/src/features/optimizer/memory-tab.tsx)
> renders `proc.cpuPercent.toFixed(1)` and `formatBytes(proc.rssBytes)` unconditionally, because the
> contract gives main no way to say "I could not read this."
>
> **5. The fix already exists in this repo, one package over.**
> [`git-exec.ts:52,60`](../../../packages/git-engine/src/exec/git-exec.ts) has pinned `LC_ALL: 'C'`
> inside `buildEnv` since git-engine was written, and documents why at `:36`. Nothing else does:
> `agent-process.ts`, `metrics/memory.ts` (`vm_stat`), `metrics/gpu.ts` and `metrics/battery.ts`
> (`ioreg`), `metrics/disk.ts` (`df -k`) and all three `ps` call sites under `scripts/perf/` inherit
> the ambient locale. So this phase is not inventing a policy — it is finishing one. (`metrics/memory.ts:37`
> also pins an absolute `/usr/bin/vm_stat` because "a Finder-launched Electron app inherits launchd's
> bare PATH"; `agent-process.ts` calls a bare `ps`.)
>
> **6. The instrument that would measure the rest of this phase is broken the same way.**
> [`idle-cpu.mjs:98`](../../../scripts/perf/idle-cpu.mjs) reads `ps -Ao pid=,ppid=,cputime=,args=`
> and folds `cputime` with `String(cputime).split(':').map(Number)` at `:103–107`. macOS prints
> `MM:SS.ss`; under a comma locale that is `MM:SS,ss`, `Number('12,34')` is `NaN`, and the guard at
> `:105` drops the row — so **the whole idle-CPU report silently reads zero**, on the same machines.
> [Phase 36 Theme G](phase-36-performance-diet.md)'s open item calls a **focused, untouched** window
> bimodal, its high mode "episodic **renderer ~32% + GPU ~55% of a core** … That is a real battery
> bug", and it was never chased. [`outstanding.md`](../outstanding.md) separately records that the
> `terminal` and `browser-tabs` actions **breach `retainedPerCycleKb: 500` on both sides of
> Phase 84** — "either the budget needs group/action-specific figures, or there is a genuine,
> long-standing leak … that predates this phase." `budgets.json` calls the 500 figure "provisional
> pending more history".

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Scope guardrails.** Themes A and B are correctness and land first, in their own PR — every number
this phase produces is read through the instruments they fix, so nothing downstream is trustworthy
until they do. Themes C–F each open with a measurement item and land with a before/after in the PR
body; Phase 36's rule, restated. No number in `budgets.json` moves except through the README's
rebaseline procedure, and only in Theme G. **Interactive ptys keep the user's own locale** — the
`LC_ALL=C` pin is for processes this app *parses*, never for a shell it hands to a human. Bundle
size, the lane layout and the UI store's write frequency belong to
[Phase 77](phase-77-thirteen-megabytes-of-editor.md) and are declined here by name.

## Deliverables

### A — Every subprocess speaks C (S)

Fifteen call sites in `packages/desktop/src/main` and `packages/git-engine/src` spawn a process.
**One of them — `git-exec.ts` — already pins the locale.** This theme generalises that one, applies
it to the seven that parse numbers, and leaves the four that hand a shell to a human alone.

- [ ] **Measure first.** Record in the PR body the real `ps -axo pid=,ppid=,stat=,rss=,pcpu=,args=`
      first line under `LC_ALL=C` and under `LC_ALL=de_DE.UTF-8`, plus the six-column-vs-fallback
      match counts for each against the current `parsePsOutput`. Two minutes, and it is the evidence
      every other item in A and B cites.
      - Reproduce anywhere with `LC_ALL=de_DE.UTF-8 ps -axo pid=,ppid=,stat=,rss=,pcpu=,args= | head -1`;
        the reporter's machine reproduces it with no override at all (`LANG=en_ZA.UTF-8`).
- [ ] **New:** [`packages/shared/src/process-env.ts`](../../../packages/shared/src/process-env.ts),
      exporting exactly two symbols, and re-exported from `shared`'s index alongside the other
      domain modules:
      ```ts
      /** The locale pin every parsed subprocess gets. Frozen so a caller cannot mutate the shared object. */
      export const POSIX_NUMERIC_ENV = Object.freeze({ LC_ALL: 'C', LC_NUMERIC: 'C' } as const);

      /** `process.env` with the numeric locale pinned — for a child whose stdout this app parses. */
      export function parseableProcessEnv(
        base: NodeJS.ProcessEnv = process.env,
      ): NodeJS.ProcessEnv;
      ```
      - It lives in `shared` because both `git-engine` and `desktop` need it and `shared` is the only
        package both may import. It is legal there under `CLAUDE.md`'s boundary rule: the module
        imports **nothing** — no zod, no `electron`, no node builtin — and a frozen object literal is
        browser-safe. `NodeJS.ProcessEnv` is a global type from `@types/node`, not an import.
      - `LC_NUMERIC` is belt-and-braces: `LC_ALL` alone wins on macOS and Linux, but a login shell
        that re-exports `LC_NUMERIC` downstream of `LC_ALL` is cheap to defend against.
      - The docblock carries the failure it prevents, quoting the `0,7` line verbatim, and points at
        `git-exec.ts:36` as the original.
- [ ] Applied at the **seven parsed sites**, each replacing or extending the existing options object:
      | File:line | Command | Today |
      |---|---|---|
      | [`agent-process.ts:147`](../../../packages/desktop/src/main/agent-process.ts) | `ps -axo …rss=,pcpu=…` | no `env:` |
      | [`metrics/memory.ts:227`](../../../packages/desktop/src/main/metrics/memory.ts) | `/usr/bin/vm_stat` | no `env:` |
      | [`metrics/gpu.ts:115`](../../../packages/desktop/src/main/metrics/gpu.ts) | `ioreg` | no `env:` |
      | [`metrics/battery.ts:241`](../../../packages/desktop/src/main/metrics/battery.ts) | `ioreg` | no `env:` |
      | [`metrics/disk.ts:132`](../../../packages/desktop/src/main/metrics/disk.ts) | `df -k` | no `env:` |
      | [`forge/gh-shell.ts:76`](../../../packages/desktop/src/main/forge/gh-shell.ts) | `gh` via login shell | `env:` present, no locale keys |
      | [`git-exec.ts:87`](../../../packages/git-engine/src/exec/git-exec.ts) | `git` | **already `LC_ALL:'C'`** — switches to spreading `POSIX_NUMERIC_ENV` so there is one definition |
      - `disk.ts` and `memory.ts` parse integers only (`(\d+)`) and survive a comma today; they are
        pinned anyway, and the item says so — a thousands separator or a translated `vm_stat` label
        would break both, and the cost of pinning is zero.
- [ ] The same pin on the **three `ps` call sites under `scripts/perf/`**, because the instruments
      have the identical bug and Theme F depends on one of them:
      - [`idle-cpu.mjs:98`](../../../scripts/perf/idle-cpu.mjs) — `ps -Ao pid=,ppid=,cputime=,args=`.
        **This is the one that matters**: `cputime` is `MM:SS.ss`, `Number('12,34')` is `NaN`, the
        guard at `:105` drops the row, and the report reads `0` for every group. Add
        `{ env: { ...process.env, LC_ALL: 'C' } }` to the `execFileSync`.
      - [`idle-cpu.mjs:200`](../../../scripts/perf/idle-cpu.mjs) — `pollSubprocessSpawns`' census.
        Not locale-sensitive (pid/ppid/comm only), pinned for consistency.
      - [`memory-report.mjs:131`](../../../scripts/perf/memory-report.mjs) — `rssSnapshotKb`'s
        `ps -Ao pid=,ppid=,rss=,args=`. Integer RSS, so unaffected today; pinned.
      - *Acceptance:* `LC_ALL=de_DE.UTF-8 node scripts/perf/idle-cpu.mjs --seconds=15 --json` reports
        a non-zero `cpuPercentOfOneCore.total`. Today it reports `0`.
- [ ] **`electron-run.mjs` gains a per-call env override.**
      [`launchEnv(repo)`](../../../scripts/perf/electron-run.mjs) at `:100` is the single choke point
      for every perf launch's environment and accepts no override — `launch()` takes only `extraArgs`.
      Add an optional `env` to `launch({ profile, repo, until, onMark, onLine, extraArgs, env })`,
      merged after `launchEnv`'s own keys, so a hostile-locale perf run is possible at all.
- [ ] **Explicitly not applied**, with a one-line comment at each site naming the reason:
      [`inproc-pty.ts:115`](../../../packages/desktop/src/main/inproc-pty.ts),
      [`broker-client.ts:159`](../../../packages/desktop/src/main/broker-client.ts) (spawns the
      broker, which hosts ptys), [`login-shell.ts:42`](../../../packages/desktop/src/main/login-shell.ts)
      and [`shell-path.ts:101`](../../../packages/desktop/src/main/shell-path.ts).
      [`council-runner.ts:286`](../../../packages/desktop/src/main/council-runner.ts) reaches a pty
      through `createPty` and inherits the carve-out.
      - The reason, written once and referenced: a terminal is the user's shell. Forcing `C` there
        changes their date formats, their `ls` collation and their agent's output encoding — a worse
        bug than the one being fixed. This is the theme's one judgement call and it is written down.
      - [`process-runner.ts:45`](../../../packages/desktop/src/main/process-runner.ts) and
        [`video/studio-service.ts:94`](../../../packages/desktop/src/main/video/studio-service.ts)
        stream to sinks rather than parse, and
        [`companion/tts-broker.ts:104`](../../../packages/desktop/src/main/companion/tts-broker.ts)
        is an Electron `utilityProcess.fork`, not `child_process` — all three are left alone and
        listed in the allowlist below so the lint rule does not fire on them.
- [ ] Absolute path for `ps`: `agent-process.ts` calls a bare `ps`; `/bin/ps`, carrying the same
      comment `metrics/memory.ts:37` already has for `/usr/bin/vm_stat`.
- [ ] **A guard, as its own eslint block.** `no-restricted-syntax` exists **nowhere** in
      [`eslint.config.mjs`](../../../eslint.config.mjs) today and cannot ride inside the file's
      `deny(patterns)` helper at `:29` — that helper only builds `no-restricted-imports`. Add a new
      flat-config object after the `desktop` boundary block:
      ```js
      {
        files: ['packages/desktop/src/main/**/*.ts', 'packages/git-engine/src/**/*.ts'],
        rules: {
          'no-restricted-syntax': ['error', {
            selector: "CallExpression[callee.name=/^(execFile|execFileSync|spawn|spawnSync)$/] > ObjectExpression:not(:has(Property[key.name='env']))",
            message: 'A parsed subprocess must pass env: parseableProcessEnv() — see shared/src/process-env.ts. Interactive ptys are exempt; add the file to the allowlist below with a reason.',
          }],
        },
      },
      ```
      - The selector is deliberately coarse — "has an options object with no `env` key" — rather than
        trying to prove the `env` is the right one. It catches the shape that caused this bug (an
        options object that sets `timeout` and forgets `env`) without pretending to be a type system.
      - The carve-out files get a scoped `{ files: [...], rules: { 'no-restricted-syntax': 'off' } }`
        block immediately after, with the pty reason in a comment — the same "an entry needs a reason
        a human wrote down" shape
        [`MOTION_GUARD_ALLOWLIST`](../../../packages/app/src/styles-motion-guards.ts) uses.
- [ ] **A hostile-locale CI job**, `gate-locale`, in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml):
      - **`runs-on: macos-14`**, not ubuntu. An `ubuntu-24.04` runner does not ship `de_DE.UTF-8`
        without `locale-gen`, and `ps -o pcpu=`, `vm_stat`, `ioreg` and `df -k` are macOS paths
        anyway. Model it on the `gate-native` job at `:196`, which is the existing macOS gate.
      - Runs `moon run desktop:test git-engine:test` (unit only — the e2e suite is
        [Phase 82](phase-82-the-pyramid-righted.md)'s cost problem and this must not add to it) with
        `LC_ALL: de_DE.UTF-8` on the step's own `env:` block, beside the
        `GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}` every job already sets. There is no
        workflow- or job-level `env:` anywhere in `ci.yml`; step-level is the house pattern.
      - *Acceptance:* the job is red on the commit before Theme B's parser test lands and green after.

### B — A row that cannot be half-read (S)

- [ ] Delete the four-column fallback at
      [`agent-process.ts:192`](../../../packages/desktop/src/main/agent-process.ts). A line that does
      not match the six-column shape is **skipped**, exactly as an unparseable line is skipped today
      — not invented. The docblock's "backward-compatibility for 4-column test fixtures" sentence is
      replaced with the reason.
- [ ] `parsePsOutput` returns rows only; a **new sibling** reports what it could not read, so the UI
      can distinguish "nothing running" from "I do not understand this machine's `ps`":
      ```ts
      export type PsParse = { rows: ProcessRow[]; totalLines: number };
      export function parsePsTable(output: string): PsParse;
      ```
      `parsePsOutput` stays as the thin `parsePsTable(output).rows` wrapper so
      [`agent-watcher.ts:291`](../../../packages/desktop/src/main/agent-watcher.ts) and its tests are
      untouched.
- [ ] Recapture the fixtures in
      [`__fixtures__/`](../../../packages/desktop/src/main/__fixtures__/README.md) in six-column form.
      - A `sed` inserting plausible `rss`/`pcpu` columns preserves every case they were built to
        cover — nested agent, two agents at equal depth, an agent's name as an argument, and the four
        `foregroundOf` cases — without re-deriving them from a live machine, which the README
        explicitly warns against. Keep pid 60000 as the pty's own login shell and the right-aligned
        padding, both of which the README calls load-bearing.
      - The README's "Captured `ps -axo pid=,ppid=,stat=,args=`" line and its "four-column" prose are
        updated in the same commit.
- [ ] Three new cases in
      [`agent-process.test.ts`](../../../packages/desktop/src/main/agent-process.test.ts):
      - a comma-decimal line is **skipped**, not half-read — `parsePsOutput('    1     0 Ss    22560   0,7 /sbin/launchd')`
        returns `[]`;
      - an all-comma table yields `{ rows: [], totalLines: 679 }`, so the failure mode is "no rows"
        rather than "all zeros";
      - a valid six-column line yields `rssBytes: 22560 * 1024` and `args: '/sbin/launchd'` — the
        assertion that would have failed for the whole life of this bug.
- [ ] The contract in [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts):
      ```ts
      rssBytes: z.number().nonnegative().nullable(),
      cpuPercent: z.number().nonnegative().nullable(),
      ```
      and on `ProcessTableResultSchema`:
      ```ts
      /** Non-null when `ps` produced output this build could not parse — see Phase 85 Theme B. */
      error: z.string().nullable(),
      ```
      - Nullability is **not** for the locale bug, which now skips the row entirely. It is for
        Theme E: a foreign process `app.getAppMetrics()` cannot see keeps its `ps` numbers, and a
        process Electron reports but `ps` missed between two reads has `null` where `ps` had nothing.
      - `pid: z.number().int().positive()` stays as-is and gets a comment: macOS `kernel_task` is
        pid 0 and `ps -ax` lists it, so a future widening of the `ps` flags could start feeding this
        schema a zero. It cannot today — the six-column regex needs a `stat` and an `args` that
        `kernel_task` does not supply in this field set — and a note is cheaper than a speculative
        `.nonnegative()`.
- [ ] `getProcessTableResult` in
      [`kill-service.ts:57`](../../../packages/desktop/src/main/optimizer/kill-service.ts) sets
      `error` from the new `PsParse`: `totalLines > 0 && rows.length === 0` →
      `` `Could not parse the process table (${totalLines} lines, 0 rows).` ``, else `null`.
      `readProcessRows()` returning `null` (a timeout or a throw) →
      `'Could not read the process table.'`
- [ ] [`memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx) renders the
      new contract:
      - the CPU cell (`:391`) and Memory cell (`:394`) render `—` for `null`, adopting
        `monitor-flyout.tsx`'s stated rule — quote it in the diff so the next reader sees the
        precedent rather than re-deriving it;
      - the empty state at `:352–357` renders `result.error` when set, in place of
        `'No processes reported.'`; the `query` branch is unchanged;
      - the `—` cells carry `aria-label="unknown"` so a screen reader says "unknown" rather than
        reading an em dash as a pause, and the `<td>` keeps `text-right` so the column does not
        reflow;
      - `compareProcesses` (`:55`) parks `null` last **in both directions** — compute
        `primary` only for two non-null values, and return `a.pid - b.pid` after a fixed
        `null`-last comparison, so the existing pid tie-break (whose docblock explains the
        row-jumping-under-the-pointer symptom) still holds.
- [ ] Fix the three guards Finding 2 names, each with a test that would have failed while it was dead:
      - `commandName` (`:49`) — a six-column row yields `launchd`, not `22560`;
      - `PROTECTED_PROCESS_NAMES` (`:118`) — `killProcess` on a row whose args are
        `/usr/libexec/logd` is refused by *name*, which no current test exercises;
      - the PID-reuse guard (`:130`) — `expectArgv` captured from one `getProcessTableResult` still
        matches a second read taken after a simulated RSS change, proving the comparison is on a
        stable string.
- [ ] *Acceptance, reproducible without the reporter's laptop:* launch with
      `LC_ALL=de_DE.UTF-8 moon run desktop:start`, open Workspace Optimizer ▸ Memory — real byte
      figures, real command names, `—` nowhere on a healthy machine, and the Terminate button
      succeeds on a Midnite-spawned process.

### C — Name the retainer (L)

[`memory-report.mjs`](../../../scripts/perf/memory-report.mjs) reports a **slope** and stops there.
A breach cannot distinguish a leak from allocator churn, which is why the recorded one has sat
unresolved since Phase 84.

- [ ] **Measure first.** Confirm the breach still reproduces on current `main`:
      `moon run app:build desktop:bundle`, then
      `node scripts/perf/memory-report.mjs --action=terminal --cycles=20 --json` and the same for
      `--action=browser-tabs`. Per-group table in the PR body. If it no longer reproduces, the
      theme's remaining items shrink to the classifier and the budget rework — a fine outcome,
      recorded.
- [ ] **New:** `scripts/perf/classify-process.mjs`, one classifier both scripts import.
      [`memory-report.mjs:148–157`](../../../scripts/perf/memory-report.mjs) has four groups and
      **no `gpu`**; [`idle-cpu.mjs:120–129`](../../../scripts/perf/idle-cpu.mjs) has five and does.
      They have diverged, and Theme D needs one of them.
      ```js
      /** `main` | `renderer` | `gpu` | `broker` | `utility:<serviceName>` | `other` */
      export function classifyProcess(args: string): string;
      ```
      - Keeps `idle-cpu.mjs`'s five groups verbatim, and splits today's catch-all `other` by
        `--utility-sub-type=` / `--service-name=` so a breach names a process **kind** rather than a
        leftover bucket. `broker.js` stays checked first — `memory-report.mjs`'s own comment explains
        the broker carries no `--type=` and would otherwise be counted as main.
      - Both scripts import it; neither keeps a local copy. A unit test beside it
        (`classify-process.test.mjs`, run by `root:test` like `idle-cpu.test.mjs` already is) pins
        one argv string per group.
- [ ] **Heap snapshot diffing** — a `--heap-diff` flag on `memory-report.mjs` that reuses the CDP
      session it already opens at `:305–329` (`connectOverCDP(devtoolsUrl)`; the docblock explains
      why CDP and not a second launcher). Take `HeapProfiler.takeHeapSnapshot` after cycle 1 and
      after cycle N, and report the top retained constructors by delta.
      - **Renderer only** in this theme. The recorded breach's groups are `main`/`broker`/`other`, so
        the renderer may not be where it lives — but the renderer is the heap the existing attachment
        can already reach, and proving the plumbing there is the cheap half. Main-process heap needs
        `--inspect` added to `electron-run.mjs`'s launch flags and is its own item if the renderer
        diff comes back empty.
      - *Acceptance:* a deliberately leaky cycle (retain an array in a `page.evaluate` closure across
        cycles) is reported by constructor name.
- [ ] **A `--soak` mode**: hours rather than cycles. Launch once, drive a light repeating workload
      (one `repo` cycle, one `terminal` cycle, one `browser-tabs` cycle on a long interval), sample
      `rssSnapshotKb` every 60 s, and emit an RSS-over-time series per group plus a linear fit.
      - This is [Phase 45 Theme F](phase-45-leak-audit.md)'s never-run item — *"open the app, work
        for an hour with terminals and councils, and compare the three RSS numbers against a fresh
        launch"* — made unattended.
      - **Not wired into CI** (see Decisions). `test.setTimeout` in `retention.spec.ts` already runs
        to 10 minutes; a multi-hour job is a human instrument, like `idle-cpu.mjs --blurred`.
- [ ] Land the verdict, whichever it is:
      - a named leak with a fix and a flat slope after it, **or**
      - group- and action-specific budgets replacing the single `retainedPerCycleKb`, each with its
        own `_`-prefixed note naming the run that justifies it, per `budgets.json`'s own header rule.
      - A verdict of "measurement characteristic" is only acceptable with the heap diff that supports
        it.
- [ ] Whatever the verdict, [`retention.spec.ts`](../../../packages/app/e2e/perf/retention.spec.ts)'s
      `terminal` assertion ends this theme green, and `outstanding.md`'s entry for the gap is removed
      with the reason.
      - Two properties of `assertFlat` (`:43–57`) belong in the analysis and are noted in the item:
        it asserts on **all four groups including `other`** (whose false-positive slope from Chromium
        process-pool warm-up the spec header already documents), and it uses
        `Math.abs(slope.perCycleKb)`, so **a falling slope fails too**. If the verdict is a budget
        rework, say whether `Math.abs` stays.

### D — The idle floor, attributed (L)

Measure first, then cut. The phase does not pre-commit to a saving it has no number for.

- [ ] **An `--idle` mode** in `memory-report.mjs`: launch the packaged-equivalent app via
      [`electron-run.mjs`](../../../scripts/perf/electron-run.mjs) with a repo open, let it settle
      past the existing `SETTLE_MS`, then sample on a 60 s timer for `--seconds=N`.
      - Built on the existing `rssSnapshotKb(rootPid)` (`:131`), which already walks the tree from
        main's pid and totals by group — swap its local classifier for Theme C's shared one and keep
        each sample rather than only the first and last.
      - Emits a **per-sample series** plus a per-group table. `idle-cpu.mjs` deliberately keeps no
        series (it reports a start/end delta at `:277–283`), so this is new and belongs here rather
        than as a flag on that script.
      - The V8-heap split for main and broker comes free: `startHeapSampler`
        ([`heap-sampler.ts:53`](../../../packages/desktop/src/heap-sampler.ts)) already logs
        `[perf] main heap rss=… heapUsed=…` every 10 s whenever `MSTUDIO_PERF=1`, and
        `launchEnv` always sets it — but those lines **fail `MARK_LINE`'s regex** at
        `electron-run.mjs:36` and are silently dropped today. Consume them through `launch()`'s
        existing `onLine` hook.
- [ ] Run it against three states, all three in the PR body: cold with one repo open; after the six
      heavy views have each been visited once; and after a detached popout. The second is what says
      whether [Phase 84 Theme G](phase-84-live-everywhere-lighter-when-hidden.md)'s bounded
      keep-alive is holding its ceiling in practice.
- [ ] **Then cut what the table names, and only that.** The leading candidate, named in advance so
      the doc is honest about its expectation, is the **main-side repo state snapshot** Phase 84's
      own headline deferred as "the natural Phase 85": every window independently spawns its own
      `git`/`gh` subprocess set for the same repo, where one shared snapshot in main broadcast to all
      windows would do. `WindowDescriptor.repoId` became real in Phase 84 Theme D, which is the
      prerequisite that was missing. It would land beside Phase 84's `fetch-scheduler.ts` and
      `forge-poller.ts` in `packages/desktop/src/main/`.
- [ ] If the attribution says the floor is dominated by Chromium's own per-renderer baseline — the
      measured `hiddenBrowserTabRss` of ~79.8 MB/tab says that is plausible — then this theme's
      deliverable is **the attribution plus a window/renderer-count policy**, and the doc says so
      rather than inventing a saving. An honest "there is nothing here to cut, here is why" is a
      landed item, not a failed one.
- [ ] An `idleRss` budget in `budgets.json` — a LEVEL, ×1.15 per the README's byte rule, with its own
      `_idleRss` note naming the run, the machine and the three states — so the floor cannot drift
      upward unnoticed the way `totalJsKb` did for a month.

### E — A monitor that reports real numbers (M)

`ps` is the right tool for foreign processes and the wrong one for our own.

- [ ] Midnite's own process tree comes from **`app.getAppMetrics()`** — verified present in the
      pinned Electron 33.4.11 typings (`electron.d.ts:1079`), returning `ProcessMetric[]` with
      `pid`, `type` (`'Browser' | 'Tab' | 'Utility' | 'Zygote' | 'Sandbox helper' | 'GPU' | …`),
      `serviceName`, `name`, `cpu.percentCPUUsage` and `creationTime`. Neither `getAppMetrics` nor
      `process.getSystemMemoryInfo()` is referenced anywhere in this repo today; both are new.
      - **New:** `packages/desktop/src/main/optimizer/app-metrics.ts` + test, exporting a pure
        `mergeAppMetrics(rows: ProcessRow[], metrics: ProcessMetric[]): ProcessInfo[]` so the join is
        testable without Electron. `getProcessTableResult` calls `app.getAppMetrics()` and hands both
        arrays in.
      - The merge prefers Electron's `cpu.percentCPUUsage` for pids Electron reports, keeps `ps`'s
        RSS (see the next item), and sets `ours: true` for every pid in the metrics array — for our
        own processes Electron simply tells us, so `isOurProcess`'s pid walk stops being the only
        answer. It still runs for pty descendants, which Electron does not own.
- [ ] **No footprint, and the doc says why.** Electron 33 cannot supply macOS `phys_footprint`:
      `ProcessMetric.memory` is `MemoryInfo`, not `ProcessMemoryInfo`, and `ProcessMemoryInfo.residentSet`
      is marked `@platform linux,win32` in the typings — so `ps -o rss=` remains the only route to a
      resident figure on darwin, which is what makes Theme A load-bearing for this theme and for D.
      - Instead: a one-line note in the Memory tab's header — *"RSS counts shared pages, so this
        total reads above Activity Monitor's Memory column"* — and the acceptance below changes from
        "within 10% of Activity Monitor" to "the delta is explained".
      - `/usr/bin/footprint` was considered and declined (see Decisions).
- [ ] **Per-helper attribution**: each renderer and utility process labelled with what it is *for* —
      which browser tab, which detached window role, which pty session — by joining
      `getAppMetrics()`'s pids against the registries that already exist (`activePtyPids()`, the
      browser tab registry, the window descriptor list). `ProcessInfo` gains
      `owner: z.string().nullable()`; the table gains an Owner column between Name and Type.
      This is the column that turns the table from a curiosity into something that answers "why is
      the app using 2 GB".
- [ ] The Memory tab gains an **"Own processes only"** toggle — a checkbox in the filter row beside
      the existing search input, **defaulting off**, persisted nowhere (a view filter, not a
      preference; the surrounding tab keeps no persisted state today and this phase does not start).
      Keyboard-reachable in the existing tab order, labelled `Own processes only`, and it filters on
      `proc.ours` without touching the sort.
- [ ] `probeDetailedMemory()` and the `memory` breakdown block are **unchanged** — `vm_stat` is
      machine-wide and correct for that panel; only the per-process half of this surface moves.
- [ ] *Acceptance:* with the app idle, the own-process count and the set of `type` labels match
      Activity Monitor's Midnite Studio group exactly; the RSS total reads above it, and the header
      note explains why. Screenshot of both in the PR.

### F — The window nobody touched (M)

[Phase 36 Theme G](phase-36-performance-diet.md)'s open item, unattended since. **Theme A is this
theme's prerequisite**: until `idle-cpu.mjs`'s `cputime` parse is fixed, this measurement reads zero
on the reporter's machine.

- [ ] **Reproduce and bound it.** `node scripts/perf/idle-cpu.mjs --seconds=600 --json` focused,
      repeated three times, recording the **per-sample series** rather than the single start/end
      delta the script reports today — the Phase 36 item calls the burn *episodic* and *bimodal*, so
      an aggregate over one window is exactly the instrument that would miss it.
      - The series work lands in Theme D's `--idle` mode; this item consumes it, or adds the same
        sample-keeping to `idle-cpu.mjs`, whichever ships first. Say which in the PR.
      - If it does not reproduce on current `main`, close the Phase 36 item with the three runs. That
        is a valid outcome and this item's acceptance covers it.
- [ ] **The suspect list is no longer a guess.** [`styles.css`](../../../packages/app/src/styles.css)
      contains **32 `animation: … infinite` declarations and exactly one carries `paused`.** Rank and
      attribute them, highest-cost first:
      - `optimizer-hero-drift-a/b/c` at `:4123`, `:4128`, `:4133` — **three** simultaneous radial
        gradients at 17 s/23 s/29 s on the Optimizer hero, which is the screen the bug was reported
        from;
      - `optimizer-text-shimmer` at `:4172` — animates `background-position` on a
        `background-clip: text` element with `color: transparent`, repainting the text every frame;
      - the graph row family — `graph-lane-glow` `:3523`, `graph-rail-glow` `:3541`,
        `graph-badge-glow` `:3560`, `commit-text-pulse` `:3666`, `commit-row-glow` `:3713`,
        `commit-row-shimmer` `:3739` — every one 2–2.5 s, on rows the virtualizer keeps mounted;
      - `loop-glow-spin` at `:975`, `:1008`, `:2864`, `:3295`, `fab-panel-spin` `:1616`,
        `companion-orbit` `:2447`, `companion-breathe` `:2114`, `repo-row-shimmer` `:359`.
      - Each is confirmed or cleared in the PR body with a DevTools Performance trace. A list of
        suspects with no verdict does not satisfy this item.
- [ ] **The pause idiom already exists in this file** — `styles.css:809–814`:
      ```css
      :root { animation: browser-gradient-spin 4s linear infinite paused; }
      :root:has(.browser-search-sync:focus-within) { animation-play-state: running; }
      ```
      Generalise it. Every ambient loop that only means something while a state holds gets
      `paused` at rest plus a `:has()` or `[data-…]` gate that runs it — the Optimizer hero while the
      tab is open *and* the window focused, the graph glows while a matching agent is live.
      `prefers-reduced-motion` guards stay exactly as they are; this is orthogonal and does not touch
      them.
- [ ] **A guard, as a third export in the module that already guards motion.**
      [`styles-motion-guards.ts`](../../../packages/app/src/styles-motion-guards.ts) already exports
      `findDuplicateKeyframes(source)` (`:162`) and
      `findUnguardedKeyframes(source, allowlist, tailwindSource)` (`:194`), asserted by
      [`styles-motion-guards.test.ts:62`](../../../packages/app/src/styles-motion-guards.test.ts).
      Add its sibling:
      ```ts
      export const LOOP_GATE_ALLOWLIST: Record<string, string>;
      /** Every `animation: … infinite` with no `animation-play-state` gate, minus the allowlist. */
      export function findUngatedLoops(
        source: string,
        allowlist: Record<string, string> = LOOP_GATE_ALLOWLIST,
      ): string[];
      ```
      - Same contract as its neighbour: an entry needs **a reason a human wrote down**, which is what
        makes adding one a reviewed decision rather than a silent skip. A loop that genuinely must
        always run (a live-session dot, a loading sweep) is allowlisted with that sentence.
      - Asserted with `expect(findUngatedLoops(css)).toEqual([])` in the existing describe block, so
        it runs inside `moon run :test`.
- [ ] Fix or bound what the trace names. If the cause turns out to be Chromium's own idle compositing
      and not ours, that is written down with the trace and the item closes as "not ours, here is the
      evidence".
- [ ] An `idleGpuPercent` budget **only if** the number is stable. `metrics/gpu.ts` already reads a
      load figure; measure its variance over a quiet ten-minute window first and say so. A flaky
      budget is worse than none.
- [ ] *Acceptance:* a focused, untouched window for ten minutes stays in its low mode across three
      runs, with the series in the PR — and Phase 36 Theme G's open item is ticked with a link here.

### G — Numbers, before and after (S)

- [ ] Every budget this phase adds or changes (`idleRss`, the group/action retention figures, anything
      from F) carries its own `_`-prefixed note in
      [`budgets.json`](../../../scripts/perf/budgets.json) naming the run that justifies it, the
      machine, and whether it is a LEVEL or a SLOPE — the shape that file already uses throughout.
- [ ] [`scripts/perf/README.md`](../../../scripts/perf/README.md)'s "What is not measured here"
      section is updated: the hour-long session it names as needing a human is now `--soak`, the
      renderer-heap gap it names is now `--heap-diff`. Whatever stays genuinely human-only stays
      listed, with this phase's additions removed from it.
- [ ] `outstanding.md`'s Phase 84 Theme J entry (the `retainedPerCycleKb` calibration gap) and
      Phase 45 Theme F's long-session item are resolved and removed, or re-stated with what this
      phase learned. Neither is left saying the same thing it said before.
- [ ] One table in the final PR body: idle RSS, retention slopes per group, idle CPU/GPU, before and
      after. The claim this phase exists to support — "the app is lighter at idle, and the monitor
      now says so truthfully" — is that table or it is not made.

## Files this phase touches

Reconciled against the tree at refinement x1 (2026-09-12). `(**unchanged**)` means load-bearing for
this phase and deliberately not edited; `(**net-new**)` means the phase names it and it does not
exist yet.

| Area | Files |
|------|-------|
| Contract | [`shared/src/process-env.ts`](../../../packages/shared/src/process-env.ts) (**net-new**: `POSIX_NUMERIC_ENV`, `parseableProcessEnv`) · [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) (`ProcessInfoSchema` L119 — `rssBytes`/`cpuPercent` nullable, new `owner`; `ProcessTableResultSchema` L142 — new `error`) · [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) (`optimizerProcesses` L320–321, **unchanged** — no new channel) |
| Main — the parser | [`main/agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts) (`readProcessRows` L143, `parsePsOutput` L172, the fallback L192, `PS_TIMEOUT_MS` L68; new `parsePsTable`) + [`agent-process.test.ts`](../../../packages/desktop/src/main/agent-process.test.ts) · [`main/__fixtures__/`](../../../packages/desktop/src/main/__fixtures__/README.md) (**recaptured six-column**, README updated) |
| Main — the locale pin | [`metrics/memory.ts`](../../../packages/desktop/src/main/metrics/memory.ts) (L227) · [`metrics/gpu.ts`](../../../packages/desktop/src/main/metrics/gpu.ts) (L115) · [`metrics/battery.ts`](../../../packages/desktop/src/main/metrics/battery.ts) (L241) · [`metrics/disk.ts`](../../../packages/desktop/src/main/metrics/disk.ts) (L132) · [`forge/gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts) (L76) · [`git-engine/src/exec/git-exec.ts`](../../../packages/git-engine/src/exec/git-exec.ts) (`buildEnv` L87 — **already pins `LC_ALL:'C'` at L52/L60**, switches to the shared const) |
| Main — carve-outs | [`inproc-pty.ts`](../../../packages/desktop/src/main/inproc-pty.ts) (L115) · [`broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts) (L159) · [`login-shell.ts`](../../../packages/desktop/src/main/login-shell.ts) (L42) · [`shell-path.ts`](../../../packages/desktop/src/main/shell-path.ts) (L101) — **comment only, no behaviour change**; [`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts) (L286, **unchanged**, inherits via `createPty`) · [`process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) (L45) and [`video/studio-service.ts`](../../../packages/desktop/src/main/video/studio-service.ts) (L94) and [`companion/tts-broker.ts`](../../../packages/desktop/src/main/companion/tts-broker.ts) (L104) — **unchanged**, allowlisted |
| Main — the optimizer | [`optimizer/kill-service.ts`](../../../packages/desktop/src/main/optimizer/kill-service.ts) (`commandName` L49, `getProcessTableResult` L57, `PROTECTED_PROCESS_NAMES` L118, PID-reuse guard L130) + test · `main/optimizer/app-metrics.ts` (**net-new**: `mergeAppMetrics`) + `.test.ts` · [`ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) (L95, **unchanged**) · [`main/agent-watcher.ts`](../../../packages/desktop/src/main/agent-watcher.ts) (L291, **unchanged** — benefits from the parser fix) |
| Renderer | [`features/optimizer/memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx) (`compareProcesses` L47, `DEFAULT_DIR` L40, empty state L352, CPU/Memory cells L391–397, kill button L398) + [`memory-tab.test.tsx`](../../../packages/app/src/features/optimizer/memory-tab.test.tsx) · [`features/optimizer/use-optimizer.ts`](../../../packages/app/src/features/optimizer/use-optimizer.ts) (`killOptimizerProcess` L295) · [`features/monitor/monitor-flyout.tsx`](../../../packages/app/src/features/monitor/monitor-flyout.tsx) (**unchanged** — the rule this phase adopts) |
| Renderer — motion | [`styles.css`](../../../packages/app/src/styles.css) (the 32 `infinite` loops; the `paused` precedent at L809–814; the Optimizer hero L4123–4133 and L4172) · [`styles-motion-guards.ts`](../../../packages/app/src/styles-motion-guards.ts) (new `findUngatedLoops`, `LOOP_GATE_ALLOWLIST`, beside `findUnguardedKeyframes` L194) + [`styles-motion-guards.test.ts`](../../../packages/app/src/styles-motion-guards.test.ts) |
| Instruments | [`scripts/perf/memory-report.mjs`](../../../scripts/perf/memory-report.mjs) (`rssSnapshotKb` L131, classifier L148, `runRetention` L285, CDP attach L305; new `--heap-diff`, `--soak`, `--idle`) · [`scripts/perf/idle-cpu.mjs`](../../../scripts/perf/idle-cpu.mjs) (`snapshot` L98, `cputime` fold L103–107, census L200) · [`scripts/perf/electron-run.mjs`](../../../scripts/perf/electron-run.mjs) (`launchEnv` L100, `launch` L125 — new `env` option; `MARK_LINE` L36) · `scripts/perf/classify-process.mjs` (**net-new**) + `.test.mjs` · [`heap-sampler.ts`](../../../packages/desktop/src/heap-sampler.ts) (**unchanged**; its `[perf] … heap` lines consumed via `onLine`) · [`budgets.json`](../../../scripts/perf/budgets.json) · [`scripts/perf/README.md`](../../../scripts/perf/README.md) |
| Tests & CI | [`e2e/perf/retention.spec.ts`](../../../packages/app/e2e/perf/retention.spec.ts) (`assertFlat` L43, the `terminal` test L59) · [`eslint.config.mjs`](../../../eslint.config.mjs) (new `no-restricted-syntax` block — **the first in the repo**; `deny()` helper L29 unchanged) · [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) (new `gate-locale` job on `macos-14`, modelled on `gate-native` L196) |
| Docs | [`outstanding.md`](../outstanding.md) (the Phase 84 Theme J and Phase 45 Theme F entries) · [`phase-36-performance-diet.md`](phase-36-performance-diet.md) (Theme G's open item) |

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme; `moon run root:tracker-check` exits 0.
- [ ] **A:** `moon run desktop:test git-engine:test` green under `LC_ALL=de_DE.UTF-8`; the new
      `no-restricted-syntax` rule errors on a deliberately unpinned `execFile` with an options object
      and does **not** error on the four pty carve-outs; `locale` inside a Midnite terminal matches
      `locale` in Terminal.app.
- [ ] **A:** `LC_ALL=de_DE.UTF-8 node scripts/perf/idle-cpu.mjs --seconds=15 --json` reports a
      non-zero `cpuPercentOfOneCore.total` (it reports `0` today).
- [ ] **B:** `expect(parsePsOutput('    1     0 Ss    22560   0,7 /sbin/launchd')).toEqual([])`;
      `expect(parsePsTable(commaTable)).toEqual({ rows: [], totalLines: 679 })`; a six-column line
      yields `rssBytes: 23101440` and `args: '/sbin/launchd'`.
- [ ] **B:** RTL test on `memory-tab.tsx` — a `ProcessInfo` with `rssBytes: null` renders `—` with
      `aria-label="unknown"`, sorts last under both `dir: 'asc'` and `dir: 'desc'`, and a non-null
      `error` replaces the `'No processes reported.'` string.
- [ ] **B:** `killProcess` on a row named `logd` is refused by `PROTECTED_PROCESS_NAMES`, and
      `expectArgv` captured from one table read still matches a second read.
- [ ] **C:** `moon run app:perf` green including `retention.spec.ts`'s `terminal` assertion;
      `classify-process.test.mjs` pins one argv per group; the heap diff names the constructor in a
      deliberately leaky cycle.
- [ ] **D:** the three-state idle attribution table is in the PR; `idleRss` is in `budgets.json` with
      its `_idleRss` note.
- [ ] **E:** `mergeAppMetrics` unit test — a pid in both arrays takes Electron's CPU and `ps`'s RSS;
      a pid only in `ps` keeps both and `ours: false`; a pid only in Electron gets `rssBytes: null`.
      The own-process `type` set matches Activity Monitor's Midnite Studio group.
- [ ] **F:** `expect(findUngatedLoops(css)).toEqual([])` in `styles-motion-guards.test.ts`; a
      ten-minute focused idle series across three runs in the PR; Phase 36 Theme G ticked or
      re-scoped with evidence.
- [ ] **Open, for a human:** the reporter's own M1 Pro, packaged build — Memory tab reads real
      numbers, Terminate works, and idle RSS after an afternoon of normal use compared against a
      fresh launch.
- [ ] **Open, for a human:** the same packaged build on a dot-locale Mac, confirming nothing
      regressed for the machines that already worked.
- [ ] **Open, for a human:** Activity Monitor side by side with the Memory tab, confirming the RSS
      delta is the shared-page overcount the header note describes and not a second bug.

## Not in this phase

- **Everything in [Phase 77](phase-77-thirteen-megabytes-of-editor.md)** — Monaco's 13.2 MB and the
  `ts.worker`, the lane layout's pass-through edges, `ui-store`'s persisted write frequency, and the
  `totalJsKb` rebaseline. 77 owns *bytes on disk and frames on screen*; this phase owns *bytes in RAM
  and the truth of the instruments reporting them*. Siblings; neither blocks the other.
- **`/usr/bin/footprint`.** It would give a figure that matches Activity Monitor, at the cost of an
  eighth parsed subprocess on the Memory tab's 5-second poll — exactly the idle cost Theme D exists
  to remove. Theme E documents the RSS delta instead. Worth revisiting if an Electron bump exposes
  `phys_footprint` natively.
- **A native module for memory introspection.** It drags the ABI rebuild story
  ([`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md)'s verified constraint) into a phase that
  otherwise adds no dependency.
- **Windows/Linux locale behaviour.** The pin and the carve-outs are correct on both, but this app
  ships macOS arm64 only ([Phase 11](phase-11-packaging.md)) and the `gate-locale` job is macOS for
  a second reason: `ubuntu-24.04` runners do not ship `de_DE.UTF-8` without `locale-gen`.
- **The renderer-side numbers for Phase 84 Themes E.6/F.5** — they need the terminal tab strip and
  browser tab strip driven through Playwright, which `outstanding.md` already sizes as its own
  follow-up. Theme C's `--soak` does not replace them.
- **Phase 84 Theme G.5's graph-first-row latency** — a timing instrument, not a memory one, and it
  needs `make-big-repo.sh` wired into a script's `--repo`. Stays in `outstanding.md`.
- **A perf UI in the product.** `scripts/perf/`'s third principle stands: measurement is dev-side.
  The Optimizer's process table is a *product* feature that happens to show numbers, not an
  instrument this phase reports from.
- **Splitting the Optimizer's poll off the renderer.** `memory-tab.tsx` polls every 5 s and already
  pauses on blur (`:125–163`); moving it to main is a different phase's shape.

## Decisions / open questions

- **Resolved — it is a locale bug, and the fix is `LC_ALL=C`, not a comma-tolerant regex.** Widening
  to `([\d.,]+)` and normalising is a smaller diff and was declined: it fixes one column of one
  command, leaves fourteen other spawn sites depending on the machine's region setting, and there is
  no honest way to tell `1,234.5` from `1.234,5` in a regex that cannot know which locale produced
  it. Pinning the output format is the fix; parsing more formats is the trap.
- **Resolved — the helper lives in `shared`, and `git-exec.ts` adopts it.** `shared` is the only
  package both `git-engine` and `desktop` may import, and a frozen object literal that imports
  nothing is legal there under `CLAUDE.md`'s zod-only rule. One definition beats two; git-engine
  wrote the original and should not be the odd one out.
- **Resolved — interactive ptys keep the user's locale.** Named at four sites with a comment each.
  A shell that suddenly collates differently is a worse bug than the one being fixed.
- **Resolved — the fallback is deleted, not repaired, and an unparseable line is skipped.** A parser
  that invents `0` is the defect; skipping is what the same function already does for every other
  malformed line. The UI learns about it through `ProcessTableResult.error`, not through a row of
  zeros. Keeping the row and nulling only the numbers was considered and declined: recovering `args`
  correctly from a partially-matched line needs a second regex, which is precisely how the shifted
  argv happened.
- **Resolved — nullability is for Theme E, not for the locale bug.** After Theme B a comma-locale
  machine yields no rows at all, not null ones. `rssBytes`/`cpuPercent` are nullable so the
  `getAppMetrics()` merge can represent a process one source sees and the other does not.
- **Resolved — zeros become `—`, per the app's own existing rule.** `monitor-flyout.tsx` wrote the
  policy down; `memory-tab.tsx` is the surface that opted out of it.
- **Resolved — Themes A and B land first, in their own PR.** Everything C–F measures is read through
  the instruments A and B fix, and A/B are also the only themes carrying a user-visible bug fix.
  A partial landing to avoid: B without A leaves a correct parser reading comma output and returning
  an empty table — worse than today, because the list disappears instead of showing wrong numbers.
  **A and B ship together or not at all.**
- **Resolved — the `cputime` bug goes in Theme A.** Same defect class, same fix, and it must land
  before Theme F measures anything. One theme owns one defect class.
- **Resolved — no footprint.** Electron 33's typings put `residentSet` on `linux,win32` only, and
  `ProcessMetric.memory` is the wrong type entirely. The delta is documented in the Memory tab's
  header rather than chased with a subprocess on a 5-second poll.
- **Resolved — one shared process classifier.** `memory-report.mjs`'s four groups and
  `idle-cpu.mjs`'s five have already diverged once; Theme D would have made it three. Lifting it to
  `scripts/perf/classify-process.mjs` makes the divergence impossible and gives `--idle` the same
  grouping for free.
- **Resolved — `--soak` is human-run, not CI.** A multi-hour job buys a flaky gate and a slow one.
  It is an instrument a human reaches for, like `idle-cpu.mjs --blurred` already is.
- **Resolved — the hostile-locale job is `macos-14` and unit-only.** `ubuntu-24.04` has no
  `de_DE.UTF-8` without `locale-gen`, and every command this phase pins is a macOS path. Unit-only
  because the e2e suite is [Phase 82](phase-82-the-pyramid-righted.md)'s cost problem.
- **Resolved — renderer heap first.** Theme C's `--heap-diff` uses the CDP attachment that already
  exists. Main-process heap needs `--inspect` on `electron-run.mjs`'s launch flags and becomes its
  own item only if the renderer diff comes back empty.
- **Resolved — an `idleGpuPercent` budget only if the number is stable.** `metrics/gpu.ts`'s load
  figure gets a variance measurement first. A flaky budget is worse than none.
- **Open — does Theme D's cut actually exist?** The phase deliberately does not promise one. If the
  attribution says the floor is Chromium's per-renderer baseline, D ships the attribution, the
  `idleRss` budget and a window-count policy. *Recommendation:* accept that outcome if the table says
  it, and record the repo-state snapshot as a sized follow-up rather than forcing it in.
- **Open — does `assertFlat`'s `Math.abs` stay?** It currently fails a *falling* slope of more than
  500 KB/cycle, which is memory being returned. *Recommendation:* keep it until Theme C's verdict is
  in — a large negative slope is still a sign the measurement is not steady — then decide with the
  data, and say so in the budget's `_` note either way.
- **Open — should the Owner column be sortable?** It is a join result, so its sort order is arbitrary
  across unowned rows. *Recommendation:* not sortable in this phase; the "Own processes only" filter
  covers the question the column exists to answer.
