# Phase 59 — Workspace Optimizer

**Refined: x1** · 2026-09-05 · security & blast radius, data model & IPC contract, functionality & edge cases, testing & verification, file-map precision, sequencing & dependencies

A repo, once open in this app, accretes weight nobody tracks: a dozen `node_modules` trees across
worktrees, stale build output, worktrees whose branch merged and was forgotten, and a terminal/agent
roster that can leak processes over a long session. Nothing in the app today shows any of that as
one picture. This phase borrows the CleanMyMac X / macOS System Settings aesthetic — segmented
storage bars, circular gauges, an animated Smart-Scan hero — but points it at what this app actually
owns: the repos and worktrees it manages, and the terminal/agent processes it itself spawns. It is
**not** a general-purpose Mac cleaner; a git client has no business owning "scan my whole disk for
junk" or "manage every process on this machine" as an unscoped feature.

**The x1 refinement found three modules this phase proposed building that already exist, and one
security deliverable it never listed.** Read these four paragraphs before starting; each changes
what a theme is.

**The GPU probe exists.** [`desktop/src/main/metrics/gpu.ts`](../../../packages/desktop/src/main/metrics/gpu.ts)
already reads utilisation via `ioreg -c IOAccelerator`, already self-disables after three
consecutive failures (`:19-23`) — which is Theme E's "graceful fallback in headless/CI", already
implemented — and its docblock at `:14-17` already argues the `powermetrics`/sudo route is out of
bounds. **Decision 2 re-litigates a decision Phase 18 made in code.** `app.getGPUInfo('complete')`
is still genuinely new, but only for *model and VRAM*; it does not report load. Theme E supplements
the existing probe, it does not replace it.

**The process table exists.** [`desktop/src/main/agent-process.ts:143`](../../../packages/desktop/src/main/agent-process.ts)
already runs `ps -axo pid=,ppid=,stat=,args=` across the **whole system**, with a `ProcessRow` type
(`:48`), `PS_TIMEOUT_MS = 3_000` (`:73`), a pure parser and captured fixtures. Its docblock at
`:26-31` states the posture Theme D is about to reverse, and is worth quoting when you do:
*"There is no kill, no restart and no auto-spawn here, deliberately: the probe exists so the UI can
stop lying about what is running. A button that stops an agent is a write path and wants its own
confirm story."* Theme D **is** that write path. It adds `rss=`/`pcpu=` columns to the existing
reader; it does not write a second `ps` caller with a second parser and a second fixture set.

**The chart system cannot draw bytes.** Every component in `features/monitor/` is parameterised on
`MetricId`, a closed four-member union (`['cpu','memory','gpu','disk']`,
[`shared/src/domain/metrics.ts:22`](../../../packages/shared/src/domain/metrics.ts)), and
[`metric-chart.tsx:15`](../../../packages/app/src/features/monitor/metric-chart.tsx)'s own docblock
says *"There is no y-scaling pass to write (the domain is fixed at 0–100 by the contract)."* So the
GPU load chart is a genuine reuse, and **Theme B's segmented storage bar is a new component in a
byte domain, not an extension** — and its "pull colour from `metric-palette.ts`" is not possible as
written, because storage categories have no `MetricId`.

**And the delete path has no jail.** The repo takes this seriously already:
[`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) confines writes to a
single final segment under one resolved root, refuses a symlink as the final segment *for every one
of write/create/rename/delete*, refuses `.git` at any depth, and closes the TOCTOU window by writing
through a descriptor with `O_NOFOLLOW`. **None of that reaches a recursive tree delete across repos
plus a user-picked root**, which is what Theme C does. `confineTree` is net-new security code and is
now a listed deliverable rather than an assumption. See Decision 8 and Decision 9.

**Builds on.**
- [`features/monitor/metric-chart.tsx:27`](../../../packages/app/src/features/monitor/metric-chart.tsx) —
  `MetricChart({ series, geometry = CHART_GEOMETRY, showBreaks = true, label })`. **Reusable**: the
  `geometry?: MetricGeometry` prop and the pure maths in
  [`metric-path.ts`](../../../packages/app/src/features/monitor/metric-path.ts) make a full-width
  chart a prop, not a fork. Fixed 0–100 domain.
- [`features/monitor/metric-geometry.ts`](../../../packages/app/src/features/monitor/metric-geometry.ts) —
  `MetricGeometry` (`:17`) and the four presets (`SPARKLINE_GEOMETRY` `:34`, `CHART_GEOMETRY` `:45`,
  `GAUGE_GEOMETRY` `:59`, `DONUT_GEOMETRY` `:79`).
- [`features/monitor/format-bytes.ts:12`](../../../packages/app/src/features/monitor/format-bytes.ts) —
  `formatBytes(bytes: number): string` and `formatUsage(used, total)` (`:28`). **Every byte figure in
  Themes B, C and D uses these.** The first draft invented byte formatting three times without
  naming them.
- [`desktop/src/main/agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts) —
  `ProcessRow` (`:48`), `readProcessRows()` (`:143`), `PS_TIMEOUT_MS` (`:73`), fixtures in
  `__fixtures__/`. The process table, already written.
- [`desktop/src/main/metrics/gpu.ts`](../../../packages/desktop/src/main/metrics/gpu.ts) —
  `parseGpuUtilization` (`:45`), `GpuProbe` (`:56`), `createGpuProbe(run?, log?, platform)` (`:62`).
  The `platform` parameter is injected *specifically* so this is testable off macOS.
- [`desktop/src/main/metrics/memory.ts`](../../../packages/desktop/src/main/metrics/memory.ts) —
  `VmStat` (`:53`), `parseVmStat` (`:65`), `memoryUsedBytes` (`:93`), `probeMemory` (`:122`).
  Note `MemoryReading` (`:39`) is `{ percent, used, total }` — **there is no Cached field**, so
  Theme D's Total/Used/Cached gauge reads raw `VmStat`, not `MemoryReading`.
- [`desktop/src/main/fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts) and
  [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) — the read jail and the
  write jail, and the model `confineTree` extends.
- [`desktop/src/main/repo-registry.ts`](../../../packages/desktop/src/main/repo-registry.ts) —
  `listRepos()` (`:145`), `worktreesFor(repoId)` (`:157`), `resolveWorkdir(repoId, worktreePath?)`
  (`:132`, the existing untrusted-path boundary). What the scan actually walks.
- [`desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  `runProcess<T>` (`:126`), `SpawnFn` (`:37`), `DEFAULT_TIMEOUT_MS` (`:116`),
  `ProcessOutcome<T>` (`:99`). Note it exports **no `killProcess`**; the `process.kill(-pid,'SIGKILL')`
  at `:76` is a closure over a child it just spawned. See Decision 10.
- [`components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `BlastRadius = { count: number; sample: { sha: string; subject: string }[] }` (`:17`) and
  `ConfirmRequest` (`:22`) with `warnings?: string[]` (`:38`). The `sample` is git-only; see
  Decision 7.
- [`features/graph/use-graph-actions.ts:214`](../../../packages/app/src/features/graph/use-graph-actions.ts) —
  `withBlastRadius`, the **fire-the-dialog-then-fill-the-number-in** two-step every destructive op
  copies, and `:452-461`, where the force-push item is gated on the setting **AND** two runtime
  conditions.
- [`components/use-reveal.ts:41`](../../../packages/app/src/components/use-reveal.ts) — `motionMs()`.
- [`packages/app/tailwind.config.ts`](../../../packages/app/tailwind.config.ts) — keyframes at `:141`
  (`fade-in` `:142`, `fade-in-up` `:146`, `halo-breathe` `:155`). **There is no root
  `tailwind.config.ts`.**
- [`desktop/src/main/ipc/repo-handlers.ts:183`](../../../packages/desktop/src/main/ipc/repo-handlers.ts) —
  `dialog.showOpenDialog`, window-parented. Decision 3's folder picker has a precedent.

**Scope guardrails.**
- **Not a general Mac cleaner.** Smart Scan and Storage only ever look at repos/worktrees Midnite
  already knows about, plus **one** user-chosen extra root per scan — never an unscoped crawl.
- **No sudo, no privileged APIs.** GPU temperature is dropped entirely. This is not a new decision;
  `metrics/gpu.ts:14-17` already made it.
- **Gated behind a default-off setting**, mirroring force-push-with-lease — and, like force-push,
  **the setting is never the only gate** (`use-graph-actions.ts:452-461` ANDs it with two runtime
  conditions).
- **`git-engine` gains nothing.** Note the tension this creates with Theme C's git-gc sub-item, which
  wants `parseCountObjects` — resolved in Decision 11.
- **GPU "Tweak Settings" toggles are UI-only stubs this phase**, and must *read* as stubs.
- **No new fs-delete-queue.** But **do** build `confineTree` — a queue is engineering nobody needs; a
  jail is the thing that stops this feature deleting someone's home directory.
- **No new dependency** — and state the claim precisely: `recharts`, `framer-motion` and every
  `@radix-ui/*` are absent from every `package.json` *and* from `pnpm-lock.yaml`. But
  [`@bilo-io/ui` ships an `AreaChart` and is already installed](../../../packages/app/src/features/monitor/metric-chart.tsx),
  which `metric-chart.tsx:12-13` rejected for the footer with reasons that were about a fixed 0–100
  domain. Theme B's byte-domain bar is a different case; re-examine rather than inherit. See
  Decision 12.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Foundation & feature gate (M)

Re-tagged **S → M**: a gated setting is seven edits, not the three the first draft listed.

- [ ] Add `'optimizer'` to the `ViewId` union ([`ui-store.ts:85`](../../../packages/app/src/store/ui-store.ts))
      **and** to `VIEW_IDS` (`:113`), positioned where it should sit in rail order.
- [ ] Add a `VIEW_ICON` entry ([`nav-icons.ts:43`](../../../packages/app/src/components/nav-icons.ts)).
      It is `Record<ViewId, IconType>`, **exhaustive** — omitting it is a typecheck failure, not a
      blank rail row. No `VIEW_COMMAND` entry (Decision 5); that map is `Partial`, so omission is free.
- [ ] **Sequence against [Phase 60](phase-60-view-registry-and-error-boundaries.md).** Phase 60
      replaces `app.tsx`'s 17-branch ternary with an exhaustive `Record<ViewId, ViewEntry>` in
      `components/view-registry.tsx`, and asserts `ui-store.ts` is unchanged. **Land 60 first.** Then
      this item is one `VIEW_COMPONENT` entry rather than a ternary branch, and 60's typecheck
      guarantee does the work. If 59 lands first, 60's line-number anchors and its "17-branch" count
      go stale and must be re-derived.
- [ ] The gate is **seven edits**, all in [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts)
      except the last two, following `allowForceWithLease` exactly: state + setter on the interface
      (`:1024`), a member of the `PersistedUi` `Pick<>` union (`:1194`), default `false` + setter in
      the creator (`:1246`), an entry in `partialize` (`:1697`), a `SettingsPageId` member (`:139`), a
      `SETTINGS_PAGES` row (`:181`) in group `'system'` beside `monitor`/`health`, and a
      `SETTINGS_PAGE_ICON` entry ([`nav-icons.ts:87`](../../../packages/app/src/components/nav-icons.ts)).
      The first draft named three of the seven.
- [ ] **Do not bump `version` and do not write a `migrate` arm.** `version: 8` (`:1626`).
      `allowForceWithLease` (Phase 22) and `launchAndRunEnabled` (Phase 50) were both added with no
      migrate arm — zustand's default merge supplies `false` for an older blob. "Add a setting" reads
      as "bump and migrate", and here it must not.
- [ ] Rail entry in **`WORKSPACE_NAV_ITEMS`** ([`app.tsx:333`](../../../packages/app/src/app.tsx)),
      filtered at all **three** call sites (`:970`, `:977`, `:984`). Note `FORGE_GATED_VIEWS` (`:371`)
      keys on a *runtime capability probe*, not persisted state — the filter shape transfers, the
      source of truth does not.
- [ ] Handle the view being active when the setting is switched **off**: extend the redirect effect
      at [`app.tsx:608`](../../../packages/app/src/app.tsx) to send `activeView === 'optimizer'` back
      to `'graph'`. Without this, turning the gate off leaves the user stranded on a hidden view.
- [ ] Add `packages/shared/src/domain/optimizer.ts` — **not** `shared/src/optimizer.ts`. Every other
      schema lives under `domain/` ([`domain/metrics.ts`](../../../packages/shared/src/domain/metrics.ts),
      `domain/repo.ts`, `domain/result.ts`); a top-level module would match nothing.
- [ ] The schemas, with fields named rather than listed:
      `ScanCategory = z.enum(['nodeModules','buildOutput','staleWorktree','looseObjects'])`;
      `ScanItem = { path: string; bytes: number; category: ScanCategory; repoId: string | null }`;
      `ScanResult = { totalBytes: number; byCategory: Record<ScanCategory, number>; items: ScanItem[]; truncated: boolean }`;
      `ProcessInfo = { pid: number; ppid: number; name: string; argv: string; rssBytes: number; cpuPercent: number; ours: boolean }`;
      `GpuStats = { model: string | null; vramBytes: number | null; loadPercent: number | null }`.
      No temperature field anywhere — the schema is where that guardrail is enforced, exactly as
      `MetricSampleSchema` enforces it for the footer.
- [ ] The envelope is `OptimizerResultOf<T>` in the same file: `{ ok: true; value: T } | { ok: false; message: string }`.
      Modelled on `GitOpResultOf` ([`domain/result.ts:69`](../../../packages/shared/src/domain/result.ts))
      **minus the `conflict` arm**, which is git-specific. Say so in the docstring so nobody
      "fixes" it back to `GitOpResult`.
- [ ] `ScanResult.items` is **capped at 2,000 entries** with `truncated: true` beyond it. A monorepo
      scan produces thousands of paths, and the first draft sent them across IPC as one uncapped
      payload.
- [ ] Channels in [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) following the
      file's `mstudio:<domain>:<verb>` rule: `optimizerScan`, `optimizerScanProgress` (event),
      `optimizerClean`, `optimizerProcesses`, `optimizerKill`, `optimizerGpu`. Schemas in
      `ipc/schemas.ts`, bridge entries in `ipc/bridge.ts`, preload wiring in
      [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts).
- [ ] Add `packages/desktop/src/main/ipc/optimizer-handlers.ts` exporting
      `registerOptimizerHandlers()`, called from `main/index.ts`'s `whenReady()` block. **There are
      37 `*-handlers.ts` files in `main/ipc/` and the first draft's file map listed none** — every
      IPC surface in this repo has one.
- [ ] Add [`store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts):
      `{ tab: OptimizerTab; scan: { state: 'idle'|'scanning'|'done'|'error'; progress: number; result: ScanResult | null; message: string | null }; processes: ProcessInfo[]; gpu: GpuStats | null }`.
      **Not persisted** — a cached `ScanResult` surviving a restart would show byte counts for files
      that no longer exist. Say so in the docstring.
- [ ] Add [`features/optimizer/optimizer-page.tsx`](../../../packages/app/src/features/optimizer/optimizer-page.tsx)
      and [`optimizer-layout.tsx`](../../../packages/app/src/features/optimizer/optimizer-layout.tsx) —
      the split is: `optimizer-page.tsx` is the `ViewId` entry point and owns the store wiring;
      `optimizer-layout.tsx` is the presentational four-tab chrome, so the tab shell can be
      screenshot without a store. Transitions use `fade-in`/`fade-in-up` from
      [`packages/app/tailwind.config.ts:142`](../../../packages/app/tailwind.config.ts), duration from
      `motionMs()` ([`use-reveal.ts:41`](../../../packages/app/src/components/use-reveal.ts)).
- [ ] `optimizer-store.test.ts`: tab switching; the four `scan.state` transitions including
      `scanning → error`; that the store is absent from `localStorage` after a scan.

### B — Aesthetic components (M)

Re-tagged **S → M**: the segmented bar cannot extend the footer's palette or its chart, so it is a
new component with a new domain, not a variant.

- [ ] Add [`features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx):
      `export function SegmentedBar({ segments, total, label }: { segments: readonly { id: ScanCategory; bytes: number }[]; total: number; label: string })`.
      A byte domain, so it takes `total` explicitly — unlike `MetricChart`, whose domain is fixed at
      0–100 by contract.
- [ ] Add [`features/optimizer/components/circular-gauge.tsx`](../../../packages/app/src/features/optimizer/components/circular-gauge.tsx):
      `export function CircularGauge({ percent, label, detail }: { percent: number; label: string; detail?: string })`.
      Reuse `ringGeometry` from
      [`metric-path.ts:128`](../../../packages/app/src/features/monitor/metric-path.ts) — that
      function is pure maths over a `MetricGeometry` and is `MetricId`-free, unlike the palette.
- [ ] **Add a second palette; do not extend `MetricId`.** `metric-palette.ts`'s exports are all
      `(id: MetricId)` over a closed union that flows into `MetricSampleSchema`, the footer and
      `metricsPresent`; widening it to carry storage categories would change the metrics contract to
      colour a bar. Add `features/optimizer/category-palette.ts` with one hue per `ScanCategory`,
      **chosen to not collide with** `METRIC_HUES`
      ([`metric-palette.ts:25`](../../../packages/app/src/features/monitor/metric-palette.ts)), and
      say in its docstring why it is separate. The first draft's "pull colour from `metric-palette.ts`"
      is not expressible.
- [ ] Both components clamp: a `percent` above 100 or below 0 renders at the bound rather than
      overflowing its ring, and segments summing above `total` render proportionally rather than
      past the bar's end. Assert both — a scan racing a delete produces exactly this.
- [ ] Every byte figure renders through `formatBytes` / `formatUsage`
      ([`format-bytes.ts:12`](../../../packages/app/src/features/monitor/format-bytes.ts)). No local
      formatting anywhere in this phase.
- [ ] `segmented-bar.test.tsx` / `circular-gauge.test.tsx`: the segment widths sum to 100% of the
      track; a zero total renders an empty track rather than `NaN`; the clamps above.
- [ ] Screenshots live in `packages/app/e2e/optimizer-shots.spec.ts` — **the repo convention is
      `*-shots.spec.ts`** (18 such files); the first draft's `optimizer-visual.spec.ts` matches
      nothing. Owned by Theme F, listed here only as its subject.

### C — Workspace Cleaner: Smart Scan + Storage (L)

- [ ] **Add `confineTree(root: string, target: string): Promise<string | null>` to
      [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts)** — the deliverable
      the first draft never listed. `fs-scope-write` today confines a **single final segment** under
      one resolved root and never descends; Theme C deletes **directory trees, across repos, plus one
      user-picked root**. `confineTree` resolves both sides with `realpath` and refuses unless the
      target is strictly under the root. Without this, Theme C has no jail at all.
- [ ] The recursive walk **refuses to traverse any symlinked directory**, and the delete refuses any
      path whose `lstat` says symlink. `fs-scope-write.ts:32-38`'s `O_NOFOLLOW` protects a file
      descriptor, not a tree walk — a symlink swapped into a `node_modules` subtree between scan and
      delete escapes the root entirely.
- [ ] **Delete moves to the trash, not to nothing.** Use Electron's `shell.trashItem`, not
      `fs.rm({ recursive: true })`. This drops the risk class of the whole feature by an order of
      magnitude for one API call, and it is what makes a mis-scan recoverable. See Decision 9.
- [ ] Add [`desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts)
      exporting `scanWorkspace(opts: { extraRoot?: string; signal: AbortSignal; onProgress: (done: number, total: number) => void }): Promise<ScanResult>`.
      It enumerates via `listRepos()` then `worktreesFor(repo.id)`
      ([`repo-registry.ts:145`/`:157`](../../../packages/desktop/src/main/repo-registry.ts)) — both
      already exist and neither was named.
- [ ] **Sizing is a JS `readdir`+`lstat` walk, not `du`.** Nothing in this repo shells `du` and there
      is no directory-sizing helper of any kind, so this is greenfield and the choice must be made
      here rather than by whoever writes it. A walk is cancellable via `AbortSignal`, gives real
      progress events, and cannot be defeated by a path with a newline in it. Bound it: **max depth
      12, max 200,000 entries, and stop at `signal.aborted`.**
- [ ] `node_modules` and build output are matched by an exported, testable predicate —
      `export function classify(path: string): ScanCategory | null` — seeded with `node_modules`,
      `dist`, `.moon`. A **directory matching `node_modules` is sized and not descended into**, or the
      walk's entry budget is spent on npm's own tree.
- [ ] `.git` is refused at any depth, matching `fs-scope-write.ts`'s existing rule. The git-gc
      sub-item does not change this — see Decision 11.
- [ ] **Stale worktrees, defined rather than implied.** `Worktree.branch` is **nullable** on a
      detached HEAD and `Worktree` carries **no base**
      ([`shared/src/domain/repo.ts:8`](../../../packages/shared/src/domain/repo.ts)), so "no unmerged
      commits against its base" has no answer for a detached worktree. The rule: a worktree is a
      candidate when `branch !== null`, it is not `isMain`, and its branch is merged into the repo's
      default branch. A detached worktree is **never** a candidate. Also note `RepoEntry.path` is
      always the *main* worktree (`repo-registry.ts:29`).
- [ ] Progress is a **stream, not a return value**: `optimizerScanProgress` events carry
      `{ done, total }`, so Smart Scan's ring is driven by real progress. The first draft required
      "real scan progress events" in one item and defined a single-shot `scanSystem()` return in
      another.
- [ ] Add [`features/optimizer/smart-scan-tab.tsx`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx):
      the Scan button morphing into a progress ring driven by those events, then a per-category
      summary with a Clean action each.
- [ ] Add [`features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx):
      the Theme B segmented bar plus a subcategory list, each row deep-linking to the repo/worktree in
      the sidebar via the existing selection actions.
- [ ] **Clean routes through the two-step confirm**, copying `withBlastRadius`
      ([`use-graph-actions.ts:214`](../../../packages/app/src/features/graph/use-graph-actions.ts)):
      open the dialog with `blastRadius: undefined`, then fill it in. Because `BlastRadius.sample` is
      `{sha, subject}[]` and cannot hold a path or a byte count, **the item count goes in `count` and
      the size goes in `warnings: string[]`** — whose docblock at
      [`confirm-dialog.tsx:38`](../../../packages/app/src/components/confirm-dialog.tsx) exists for
      *"consequences that are not measured in commits"*, which is exactly this. `danger: true`.
      See Decision 7.
- [ ] **Re-validate at delete time.** A `ScanResult` is computed, rendered, confirmed and only then
      acted on — minutes may pass. Before each delete: re-run `confineTree`, re-`lstat`, and skip
      (reporting it) any path that no longer exists, is now a symlink, or no longer resolves under a
      known root. The repo already closes a far narrower TOCTOU window for a single file; this one is
      wider.
- [ ] `scan-service.test.ts` (bare vitest, no Electron): `classify` for each category; the walk's
      depth and entry bounds; abort mid-walk leaves no partial delete; the detached-HEAD worktree is
      not a candidate; a symlinked directory is not traversed.
- [ ] `confine-tree.test.ts`: a path outside the root is refused; a symlink pointing outside is
      refused; `.git` at depth is refused; a legitimate `node_modules` under a registered repo is
      allowed.

### D — Memory & process monitor (M)

- [ ] **Extend [`agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts), do not
      duplicate it.** Add `rss=` and `pcpu=` to the existing `-axo` column list (`:143`), widen
      `ProcessRow` (`:48`), and extend the existing pure parser and its `__fixtures__/`. The first
      draft proposed a net-new `process-service.ts` with a second `ps` caller, a second parser and a
      second fixture set, citing `metrics/memory.ts`'s `vm_stat` as the precedent when the real
      precedent was `ps`, in this file, already system-wide.
- [ ] Quote `agent-process.ts:26-31`'s docblock in the new kill module's header and answer it:
      *"There is no kill … deliberately … A button that stops an agent is a write path and wants its
      own confirm story."* This phase is that story; the file that reverses a documented decision
      should say which decision and why.
- [ ] Add `packages/desktop/src/main/optimizer/kill-service.ts` exporting
      `killProcess(pid: number, expectArgv: string): Promise<OptimizerResultOf<void>>`.
      **`expectArgv` is not optional and is the PID-reuse guard**: re-read the row immediately before
      signalling and refuse if `argv` no longer matches. The table polls every few seconds and a PID
      can be recycled between render and confirm.
- [ ] **`SIGTERM`, then `SIGKILL` after 3s** — not a bare `SIGKILL`. A `SIGKILL` on a pty or agent
      child bypasses the broker's own teardown
      ([`desktop/src/broker/`](../../../packages/desktop/src/broker/)) and leaves its socket state
      behind.
- [ ] **A self-preservation deny-list**, refusing before it signals: Midnite's own `process.pid`, its
      broker, and the OS processes whose loss ends the session (`launchd`, `WindowServer`,
      `loginwindow`). Decision 1's "the OS permission boundary is the backstop" is true for root and
      other users and **false for the user's own processes** — which include their editor, their
      browser, their `ssh-agent` and this app.
- [ ] `ProcessInfo.ours` is computed in main, not guessed in the renderer, and **it is derived from
      the pty/agent session registry, not from `process-runner.ts`** — which exports no pid→handle
      map, so "did Midnite spawn this?" has no answer there. See Decision 10.
- [ ] Rows the app cannot signal (another user's, root's) render with the kill button disabled and a
      reason, rather than offering an action that will fail. `-axo` already lists them.
- [ ] Every kill routes through `confirm-dialog.tsx` with `danger: true`, the process name and PID in
      the title, and the full `argv` in `warnings` — for the same reason bytes go there.
- [ ] Add [`features/optimizer/memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx):
      Theme B's `CircularGauge` for Total/Used/Cached, computed from **raw `VmStat`**
      ([`memory.ts:53`/`:65`](../../../packages/desktop/src/main/metrics/memory.ts)) — `MemoryReading`
      is `{percent, used, total}` and has no Cached field — plus a process table matching the
      Actions/Tests table shape from Phase 19, not a new table primitive.
- [ ] **Polling cadence: the process table gets its own divisor, not the 2s metrics tick.** A full
      `ps` every 2s is far heavier than `vm_stat`;
      [`metrics-service.ts:61`](../../../packages/desktop/src/main/metrics/metrics-service.ts) already
      gives coarse probes a divisor (`DISK_REFRESH_EVERY_TICKS = 10`). Use the same mechanism at
      **every 5th tick**, and poll only while the Memory tab is visible.
- [ ] `agent-process.test.ts` additions: the widened `-axo` parse against a new fixture, including a
      process whose `argv` contains spaces and one containing a newline.
- [ ] `kill-service.test.ts`: the argv-mismatch refusal; the deny-list; TERM-then-KILL escalation; a
      failed kill returns `{ok:false, message}` and never throws across IPC.

### E — GPU tab (S)

Re-tagged **M → S**: the load probe and the CI fallback already exist.

- [ ] `getGpuStats()` in `packages/desktop/src/main/optimizer/gpu-service.ts` **combines two
      sources**: `app.getGPUInfo('complete')` for `model` and `vramBytes`, and the existing
      `createGpuProbe` ([`metrics/gpu.ts:62`](../../../packages/desktop/src/main/metrics/gpu.ts)) for
      `loadPercent`. `getGPUInfo` does not report load and the existing probe does not report model;
      the first draft attributed all three to one call.
- [ ] `app.getGPUInfo` returns `Promise<unknown>` in Electron's own types, so **parse it with a zod
      schema** and return `{ model: null, vramBytes: null }` on a shape mismatch rather than reading
      through an `any`.
- [ ] Reuse the existing self-disable: `createGpuProbe` already stops after three consecutive
      failures and takes an injected `platform` so it is testable off macOS. Theme E's "graceful
      fallback in headless/CI" is **already implemented** — verify it covers `getGPUInfo` rejecting
      too, and extend only if it does not.
- [ ] Add [`features/optimizer/gpu-tab.tsx`](../../../packages/app/src/features/optimizer/gpu-tab.tsx):
      an info card, and a 60-second rolling load chart using **`MetricChart` with a custom
      `geometry`**, not `Sparkline`. `Sparkline`
      ([`sparkline.tsx:19`](../../../packages/app/src/features/monitor/sparkline.tsx)) is hardcoded to
      `SPARKLINE_GEOMETRY` (~28×12) and `aria-hidden` — it is explicitly the inline form. `id: 'gpu'`
      keeps the footer's colour, and the 0–100 domain fits.
- [ ] The two "Tweak Settings" toggles ship **visibly disabled with a "not wired yet" caption**, not
      merely inert. A stub that flips but does nothing reads as a bug; a disabled control with a
      reason reads as a plan.
- [ ] `gpu-service.test.ts`: the combined shape; a `getGPUInfo` rejection yields nulls rather than
      throwing; a malformed `getGPUInfo` payload fails the zod parse and degrades.

### F — Verification (M)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: nothing new in `git-engine` (see Decision 11); `packages/app` reaches the
      feature only through `window.midniteStudio`.
- [ ] Playwright: the view is absent from the rail with the setting off, appears when switched on,
      and **switching it off while the view is active redirects rather than stranding**.
- [ ] Playwright: the four tabs render and switch.
- [ ] Playwright: Smart Scan → Storage handoff from one `ScanResult`; a Clean shows the confirm with
      a real item count and a real byte figure, and on confirm the item leaves the list.
- [ ] Playwright: the extra-root folder picker — the widest blast radius in the phase, and untested in
      the first draft.
- [ ] Playwright: the Memory tab's table renders; killing a Midnite-spawned test process removes it.
- [ ] Playwright: the GPU tab renders info and a growing 60s chart; **no temperature field appears
      anywhere**; the two Tweak toggles render disabled with their caption.
- [ ] `optimizer-shots.spec.ts`: all four tabs, light and dark.
- [ ] A scan of a fixture tree with a symlink escaping the root does not size or delete anything
      outside it.
- [ ] A delete whose target vanished between scan and confirm is skipped and reported, not thrown.
- [ ] `shell.trashItem` is what runs — assert the file is recoverable, not gone.
- [ ] **Deliberately not automated:** the arbitrary-PID kill path, which is the whole subject of
      Decision 1. Killing a real system process cannot be a test. Stated here as a choice rather than
      left as a gap.
- [ ] **Open, for a human:** whether killing an arbitrary (non-Midnite) system process from inside a
      git client actually feels right in daily use, or whether Decision 1 should narrow to "Midnite's
      own processes only" after a week.

---

## Files this phase touches

**New**
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) — schemas + `OptimizerResultOf` (A). **Under `domain/`, not top-level.**
- `packages/desktop/src/main/ipc/optimizer-handlers.ts` — `registerOptimizerHandlers()` (A).
- [`packages/app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) — unpersisted (A).
- [`packages/app/src/features/optimizer/optimizer-page.tsx`](../../../packages/app/src/features/optimizer/optimizer-page.tsx) · [`optimizer-layout.tsx`](../../../packages/app/src/features/optimizer/optimizer-layout.tsx) (A).
- [`packages/app/src/features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) · [`circular-gauge.tsx`](../../../packages/app/src/features/optimizer/components/circular-gauge.tsx) (B).
- `packages/app/src/features/optimizer/category-palette.ts` — the second palette (B).
- [`packages/app/src/features/optimizer/smart-scan-tab.tsx`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx) · [`storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) (C) · [`memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx) (D) · [`gpu-tab.tsx`](../../../packages/app/src/features/optimizer/gpu-tab.tsx) (E).
- [`packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) (A).
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) (C).
- `packages/desktop/src/main/optimizer/kill-service.ts` (D) · `gpu-service.ts` (E).
- `packages/app/e2e/optimizer-shots.spec.ts` (F).

**Changed**
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) — **`confineTree`** (C). The security deliverable the first draft omitted.
- [`packages/desktop/src/main/agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts) — `rss=`/`pcpu=` columns, widened `ProcessRow`, new fixtures (D). **Extended, not duplicated.**
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `ViewId`, `VIEW_IDS`, the gate's four store edits, `SettingsPageId`, `SETTINGS_PAGES`. **No `version` bump, no `migrate` arm.**
- [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) — `VIEW_ICON` **and** `SETTINGS_PAGE_ICON`; both are exhaustive `Record`s (A).
- [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) — `WORKSPACE_NAV_ITEMS`, the three filter sites, the `:608` redirect (A).
- [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) — the `PAGE_CONTENT` entry (A).
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) · [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — six channels (A).
- `packages/app/src/components/view-registry.tsx` — one `VIEW_COMPONENT` entry, **if [Phase 60](phase-60-view-registry-and-error-boundaries.md) has landed** (A).

**Deliberately unchanged**
- [`packages/desktop/src/main/metrics/gpu.ts`](../../../packages/desktop/src/main/metrics/gpu.ts) — reused for load; the phase supplements it (E).
- [`packages/app/src/features/monitor/metric-palette.ts`](../../../packages/app/src/features/monitor/metric-palette.ts) — **load-bearing.** `MetricId` flows into `MetricSampleSchema` and the footer; widening it to colour a bar is not an option (B).
- [`packages/app/src/features/monitor/metric-chart.tsx`](../../../packages/app/src/features/monitor/metric-chart.tsx) · [`metric-path.ts`](../../../packages/app/src/features/monitor/metric-path.ts) · [`format-bytes.ts`](../../../packages/app/src/features/monitor/format-bytes.ts) — imported as-is (B, E).
- [`packages/desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) — **not** the kill precedent; see Decision 10.
- [`packages/git-engine/src/stats/health.ts`](../../../packages/git-engine/src/stats/health.ts) — `parseCountObjects` reached read-only through an existing handler (Decision 11).

---

## Verification

See Theme F — its fifteen items **are** this phase's verification, and are checklist items there
rather than duplicated here. The first draft's prose stub in this section left the phase with zero
verification checkboxes, which is what let nine deliverables ship unverified.

---

## Not in this phase

- **A generalized delete queue.** `confineTree` plus a sequential loop; a queue is engineering
  nothing else needs.
- **Wiring the two GPU "Tweak Settings" toggles.** They ship visibly disabled.
- **GPU temperature.** Settled in code since Phase 18.
- **Widening `MetricId`.** Decision 12.
- **Extending the scan's pattern set beyond `node_modules`/`dist`/`.moon`.** Decision 6.

---

## Decisions / open questions

1. **Settled — kill-any-process, strongly gated, with three additions.** The table is system-wide and
   the kill is not restricted to Midnite's own processes. But the OS permission boundary is **not**
   a sufficient backstop on its own: it protects root and other users, and does nothing for the
   user's own editor, browser or this app. Theme D therefore adds a self-preservation deny-list, an
   argv-match PID-reuse guard, and TERM-before-KILL. Revisit narrower if the human pass says it feels
   wrong.

2. **Settled, and already settled in code.** GPU temperature is omitted.
   [`metrics/gpu.ts:14-17`](../../../packages/desktop/src/main/metrics/gpu.ts) made this call in
   Phase 18 — *"Deliberately not `powermetrics`, which … needs sudo."* This decision now records
   agreement rather than reaching a conclusion.

3. **Settled — known repos/worktrees plus one user-chosen root per run.** The picker is
   `dialog.showOpenDialog`, window-parented, as at
   [`repo-handlers.ts:183`](../../../packages/desktop/src/main/ipc/repo-handlers.ts).

4. **Settled — a default-off `Settings ▸ Workspace Optimizer` toggle**, in group `'system'` beside
   Monitor and Health. Seven edits, no version bump (Theme A).

5. **Settled — no nav chord.** `VIEW_COMMAND`
   ([`nav-chords.ts:34`](../../../packages/app/src/components/nav-chords.ts)) is
   `Partial<Record<ViewId, CommandId>>` with 5 of 17 entries and `navChord` returns `undefined` for
   the rest, so omission is the majority case and costs nothing. Promoted from *recommendation* to
   *settled* on that evidence.

6. **Open — build-artifact detection is per-project convention, not exhaustive.** Seeded with
   `node_modules`, `dist`, `.moon`. *Recommendation:* ship the three, make `classify` an exported
   pure predicate with its own test so widening it later is a one-line change plus a case, and accept
   under-reporting on an unusual layout. Over-reporting is the dangerous direction and the trash-not-
   unlink decision is what makes it survivable.

7. **Resolved — item count in `count`, bytes and argv in `warnings`.** `BlastRadius` is
   `{count, sample: {sha, subject}[]}` and `sample` is git-only; a byte figure or a PID+argv cannot be
   expressed in it. Rather than widen a type eight call sites depend on, use `warnings?: string[]`,
   whose docblock at [`confirm-dialog.tsx:38`](../../../packages/app/src/components/confirm-dialog.tsx)
   exists for *"consequences that are not measured in commits"* — precisely this case.

8. **Resolved — `confineTree` is a deliverable, not an assumption.** The first draft cited
   `fs-scope.ts`'s `joinWithin`/`resolveScopeRoot` and `fs-scope-write.ts` as covering the delete
   path. They do not: they confine a single final segment under one root and never descend, while
   Theme C deletes trees across repos plus an arbitrary picked root. Every one of `fs-scope-write`'s
   five stated bounds is inapplicable to a tree walk.

9. **Resolved — `shell.trashItem`, not `fs.rm`.** One API call turns every mistake in this feature
   from permanent into recoverable, and there is no argument for the irreversible version in a tool
   whose whole risk is over-reporting reclaimable space. The first draft left "how does it delete"
   unstated, which is the single highest-leverage gap the refinement closed.

10. **Resolved — `ours` comes from the session registry, not `process-runner.ts`.** The first draft
    said the kill "follows the `process-runner.ts` group-kill precedent where the target is a process
    Midnite spawned". There is no such precedent to follow: `process.kill(-pid,'SIGKILL')` at
    `process-runner.ts:76` is a closure over a child that module just spawned, reachable only through
    the `SpawnedProcess` handle, and no pid→handle map survives the call. Ownership is answered by
    the pty/agent session registry or not at all.

11. **Resolved — the git-gc figure is read, not re-implemented, and `git-engine` still gains
    nothing.** `parseCountObjects`
    ([`git-engine/src/stats/health.ts:42`](../../../packages/git-engine/src/stats/health.ts)) already
    returns `{sizeBytes, loose}` from `count-objects -vH`. The guardrail forbids *changing*
    `git-engine`, not calling it — main already may. So the scan calls the existing health path
    read-only. If that turns out to require a new export, **drop the `looseObjects` category from this
    phase** rather than amend the guardrail.

12. **Resolved — a second palette, and the "no chart library" claim restated.** `recharts`,
    `framer-motion` and `@radix-ui/*` are absent from every `package.json` **and** from
    `pnpm-lock.yaml`. But `@bilo-io/ui` ships an `AreaChart` and is already installed;
    [`metric-chart.tsx:12-13`](../../../packages/app/src/features/monitor/metric-chart.tsx) rejected it
    for the footer on grounds that were about a fixed 0–100 domain. Theme B's byte-domain bar is a
    different case, so the honest claim is *"no new dependency"*, not *"no chart library exists"*. The
    hand-rolled bar still wins on the palette question alone: the installed chart would not know
    about `category-palette.ts` either.

13. **Settled — sequential delete, no queue.** (The first draft labelled this *"Settled,
    recommendation"*, which is two statuses at once. It is settled.)

14. **Open — is this still one phase?** Honestly refined it is ~90 items spanning `app`, `desktop` and
    `shared`, with fifteen new files and a net-new security primitive; Theme C alone is an **L**.
    *Recommendation:* split it. **A + B** (the gate, the shell, the two components) is a real
    PR-sized phase that ships a visible, harmless surface. **E** is an **S** that ships on top of it.
    **C** and **D** each deserve their own phase, because each carries a distinct blast radius and a
    distinct security deliverable — `confineTree` for one, the deny-list and PID guard for the other.
    Shipping them together means one review covering both recursive deletion and arbitrary process
    termination, which is the review least likely to be done well.
