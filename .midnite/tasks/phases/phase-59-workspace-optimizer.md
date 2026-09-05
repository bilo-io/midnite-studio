# Phase 59 — Workspace Optimizer

A repo, once open in this app, accretes weight nobody tracks: a dozen `node_modules` trees across
worktrees, stale build output, worktrees whose branch merged and was forgotten, and a terminal/agent
roster that can leak processes over a long session. Nothing in the app today shows any of that as
one picture. This phase borrows the CleanMyMac X / macOS System Settings aesthetic — segmented
storage bars, circular gauges, an animated Smart-Scan hero — but points it at what this app actually
owns: the repos and worktrees it manages, and the terminal/agent processes it itself spawns. It is
**not** a general-purpose Mac cleaner; a git client has no business owning "scan my whole disk for
junk" or "manage every process on this machine" as an unscoped feature.

**Builds on.**
- [`features/monitor/metric-chart.tsx`](../../../packages/app/src/features/monitor/metric-chart.tsx),
  [`sparkline.tsx`](../../../packages/app/src/features/monitor/sparkline.tsx),
  [`monitor-cluster.tsx`](../../../packages/app/src/features/monitor/monitor-cluster.tsx),
  [`use-metrics-stream.ts`](../../../packages/app/src/features/monitor/use-metrics-stream.ts) — the
  footer's existing hand-rolled SVG chart system (Phase 18). **There is no `recharts` and no
  `framer-motion` dependency in this repo** — the original brief for this feature assumed both, plus
  Shadcn UI; none exist here. Charts and gauges extend this same hand-rolled pattern, and tab
  transitions extend `tailwind.config.ts`'s existing keyframe vocabulary
  (`fade-in`, `fade-in-up`, `halo-breathe`, disarmed by `html[data-motion='reduced']`), not a new
  animation library.
- [`store/metrics-store.ts`](../../../packages/app/src/store/metrics-store.ts) — the zustand
  time-evicted sample window this phase's Memory/GPU history charts copy the shape of.
- [`desktop/src/main/metrics/cpu.ts`](../../../packages/desktop/src/main/metrics/cpu.ts) and
  [`memory.ts`](../../../packages/desktop/src/main/metrics/memory.ts) — real CPU/RAM already read
  (macOS `vm_stat` shelling, `os.cpus()`/`os.loadavg()` diffing). The Memory tab reuses these
  directly rather than re-deriving system stats.
- [`desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) — the
  group-kill precedent (`process.kill(-child.pid, 'SIGKILL')`, because child tools spawn
  grandchildren) this phase's kill action follows, sized right — the heavier pty-broker machinery in
  [`desktop/src/broker/`](../../../packages/desktop/src/broker/) is a different, unrelated problem.
- [`features/graph/use-graph-actions.ts`](../../../packages/app/src/features/graph/use-graph-actions.ts),
  [`features/settings/settings-pages/git-safety-page.tsx`](../../../packages/app/src/features/settings/settings-pages/git-safety-page.tsx) —
  the force-push-with-lease precedent this phase's feature gate copies: a default-off
  `Settings ▸ …` switch guarding a higher-blast-radius surface, with the same
  [`components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx)
  blast-radius pattern (`rev-list --count`-style, here a byte count / a PID + command line) gating
  every destructive action.
- [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `ViewId` (line 85),
  `viewForPath` (line 1826), and the `FORGE_GATED_VIEWS` list (referenced from
  [`app.tsx:371`](../../../packages/app/src/app.tsx)) as the precedent for gating a nav view behind a
  condition rather than always showing it.
- [`app.tsx:310`](../../../packages/app/src/app.tsx) (`NavItem = { view, label, icon }`),
  [`components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts),
  [`components/nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts),
  [`components/title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx) — how a
  new top-level view actually gets a rail entry (Phase 19's pattern for Dashboard/Actions/Tests).
- [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts),
  [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts),
  [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts),
  [`shared/src/domain/result.ts`](../../../packages/shared/src/domain/result.ts) — the "ops never
  throw across IPC" discriminated-envelope convention this phase's new channels follow (a lighter
  `{ok:true}` / `{ok:false, message}` shape — `GitOpResult`'s `conflict` arm is git-specific and
  doesn't apply here).

**Scope guardrails.**
- **Not a general Mac cleaner.** Smart Scan and Storage only ever look at repos/worktrees Midnite
  already knows about, plus **one** user-chosen extra root per scan — never an unscoped filesystem
  crawl.
- **No sudo, no privileged APIs.** GPU temperature is dropped entirely (no public macOS API exposes
  it without SMC access or a `sudo powermetrics` call) rather than faked or shelled out to a
  privileged tool from a git client.
- **Gated behind a default-off setting**, mirroring force-push-with-lease: kill-any-process and
  cross-repo deletion are real blast radius, and this feature does not appear in the nav rail until
  a human opts in.
- **`git-engine` gains nothing.** This feature isn't git-domain — every new module lives in `app`,
  `desktop` or `shared`. If a theme finds itself wanting a change in `git-engine`, the design is
  wrong.
- **GPU "Tweak Settings" toggles are UI-only stubs this phase** — Hardware Acceleration / Limit
  Background Framerates render and flip visually; neither is wired to a real Electron flag or
  `chrome://flags`-equivalent. Wiring them is a later phase's problem once it's clear anyone wants it.
- **No new fs-delete-queue engineering beyond what Theme C actually needs.** `git-engine`'s
  write-queue is specifically for `index.lock` races and doesn't apply to plain file deletion; keep
  Theme C's delete path sequential and simple rather than building a generalized queue nothing else
  uses yet.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Foundation & feature gate (S)

- [ ] Add `optimizer` to `ViewId` in [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts),
      and a `workspaceOptimizerEnabled` setting (default `false`) alongside the existing
      `Git Safety` force-push flag.
- [ ] Rail entry in [`app.tsx`](../../../packages/app/src/app.tsx)'s `NavItem` list, shown only when
      `workspaceOptimizerEnabled` is true — same conditional pattern as `FORGE_GATED_VIEWS`.
      Icon from `react-icons/lu` per [`CLAUDE.md`](../../../CLAUDE.md)'s one-family rule, registered
      in [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts). No entry in
      [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) — see Decision 5.
- [ ] Add [`features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx):
      the toggle, registered in
      [`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx).
- [ ] Add [`packages/shared/src/optimizer.ts`](../../../packages/shared/src/optimizer.ts): zod
      schemas for `ScanResult`, `StorageBreakdown`, `ProcessInfo`, `GpuStats`, and the
      `{ok:true,...} | {ok:false,message}` envelope every mutating op (clean, kill) returns. Add the
      new channel constants to
      [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) and wire
      [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) +
      [`desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts).
- [ ] Add [`packages/app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts):
      active tab, scan state, cached process/GPU samples — matching the existing `*-store.ts`
      zustand pattern (`dashboard-store.ts`, `metrics-store.ts`), not a new state paradigm.
- [ ] Add [`packages/app/src/features/optimizer/optimizer-page.tsx`](../../../packages/app/src/features/optimizer/optimizer-page.tsx)
      and [`optimizer-layout.tsx`](../../../packages/app/src/features/optimizer/optimizer-layout.tsx):
      the four-tab shell (Smart Scan · Storage · Memory · GPU), tab switch animated via the existing
      `fade-in`/`fade-in-up` keyframes, honouring `motionMs()` for reduced-motion.
- [ ] `optimizer-store.test.ts`: tab switching, scan-state transitions.

### B — Aesthetic components (S)

- [ ] Add [`features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx):
      a thick horizontal bar split into labelled, coloured segments plus a legend — the macOS
      Storage-settings look, hand-rolled SVG/div, no chart library.
- [ ] Add [`features/optimizer/components/circular-gauge.tsx`](../../../packages/app/src/features/optimizer/components/circular-gauge.tsx):
      an SVG ring gauge (used/total, animated fill), sized for the Memory and GPU tabs.
- [ ] Both pull colour from the same token set `metric-palette.ts` already establishes for
      CPU/RAM/GPU/disk in the footer monitor, so the Optimizer's palette and the footer's agree.
- [ ] Storybook-less visual check: a static `optimizer-visual.spec.ts` Playwright screenshot per
      component, light and dark (folds into Theme F's screenshot pass rather than duplicating it).

### C — Workspace Cleaner: Smart Scan + Storage (L)

- [ ] Add [`desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts):
      walks the known repo/worktree registry plus one user-chosen extra root (native folder picker),
      sizing `node_modules`, build-output directories (per-project convention, starting with this
      repo's own `dist`/`.moon` patterns), worktrees whose branch has no unmerged commits against its
      base, and git-gc candidates (loose object count as a proxy).
- [ ] `scanSystem()` IPC returns a `ScanResult`: total reclaimable bytes, a per-category breakdown,
      and a flat list of candidate items with path, size, and category — feeding both Smart Scan's
      summary and Storage's segmented bar + subcategory list.
- [ ] Add [`features/optimizer/smart-scan-tab.tsx`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx):
      the large Scan button that morphs into an animated progress ring during the scan (drives off
      real scan progress events, not a fixed timer), then a summary (junk found, trash, large files)
      with a "Clean" action per category.
- [ ] Add [`features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx):
      the segmented bar (Theme B) plus a subcategory list, each row with its own "Manage" button that
      deep-links to the relevant repo/worktree in the sidebar.
- [ ] Clean/delete actions route through the existing
      [`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) blast-radius
      pattern (item count + total bytes), then a simple sequential delete in `scan-service.ts` — no
      new queue primitive (see Scope guardrails).
- [ ] `scan-service.test.ts` (bare vitest, no Electron): category classification, the merged-branch
      worktree check, byte totals.

### D — Memory & process monitor (M)

- [ ] `getSystemProcesses()` IPC in a new
      [`desktop/src/main/optimizer/process-service.ts`](../../../packages/desktop/src/main/optimizer/process-service.ts):
      full system process list (name, PID, RAM, CPU) via `ps`-style enumeration, matching the
      shell-out pattern `metrics/memory.ts` already uses for `vm_stat`.
- [ ] `killProcess(pid)` follows the [`process-runner.ts`](../../../packages/desktop/src/main/optimizer/process-service.ts)
      group-kill precedent where the target is a process Midnite spawned; for an arbitrary system
      process, a plain `process.kill(pid, 'SIGKILL')` — the OS's own user-permission boundary is the
      real backstop against killing another user's or root's process, not app-side logic (Decision 1,
      settled).
- [ ] Every kill routes through `confirm-dialog.tsx` showing process name, PID, and command line.
- [ ] Add [`features/optimizer/memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx):
      Theme B's circular gauge for Total/Used/Cached RAM (reusing `metrics/memory.ts`'s existing
      Activity-Monitor-style computation), plus a process table (name, PID, RAM, CPU, kill button) —
      hand-rolled table matching this app's existing table components (Phase 19's Actions/Tests
      tables), not a new table primitive.
- [ ] Live polling via the existing metrics-stream cadence (2s/5s adaptive), not a naive
      `setInterval` re-invented per tab.
- [ ] `process-service.test.ts`: parse fixtures for `ps` output, kill routing (Midnite-owned vs
      arbitrary PID), error surface when a kill fails (`{ok:false, message}` — never a thrown IPC
      error).

### E — GPU tab (M)

- [ ] `getGpuStats()` IPC in
      [`desktop/src/main/optimizer/gpu-service.ts`](../../../packages/desktop/src/main/optimizer/gpu-service.ts):
      model/VRAM/current load from Electron's `app.getGPUInfo('complete')`. **No temperature field**
      (Decision 2, settled) — omit rather than fake.
- [ ] Add [`features/optimizer/gpu-tab.tsx`](../../../packages/app/src/features/optimizer/gpu-tab.tsx):
      GPU info card, a 60-second rolling load-history chart reusing
      [`sparkline.tsx`](../../../packages/app/src/features/monitor/sparkline.tsx)'s pattern, and a
      "Tweak Settings" section with two UI-only toggle stubs (Hardware Acceleration, Limit Background
      Framerates) per the Scope guardrails — visibly present, not wired.
- [ ] `gpu-service.test.ts`: the info shape, and the graceful fallback when `getGPUInfo` rejects
      (headless/virtualized environments, CI).

### F — Verification (M)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: nothing new in `git-engine`; `packages/app` reaches the new functionality
      only through `window.midniteStudio`.
- [ ] Playwright: the feature is invisible in the nav rail with the setting off, appears once
      switched on, and the four tabs render and switch.
- [ ] Playwright: Smart Scan → Storage handoff (a scan populates both tabs from one `ScanResult`);
      a clean action shows the confirm dialog with a real byte count and, on confirm, the item
      leaves the list.
- [ ] Playwright: Memory tab's process table renders, and killing a Midnite-spawned test process
      (not a real system process) removes it from the list end-to-end.
- [ ] Playwright: GPU tab renders info + a growing 60s chart; no temperature field is rendered
      anywhere.
- [ ] Screenshots of all four tabs, light and dark, folded in with Theme B's component screenshots.
- [ ] **Open, for a human:** whether killing an arbitrary (non-Midnite) system process from inside a
      git client actually feels right in daily use, or whether Decision 1 should be revisited toward
      the narrower "Midnite's own processes only" scope after a week of real use.

---

## Files this phase touches

**New**
- [`packages/shared/src/optimizer.ts`](../../../packages/shared/src/optimizer.ts) — schemas + envelope (A).
- [`packages/app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) — store (A).
- [`packages/app/src/features/optimizer/optimizer-page.tsx`](../../../packages/app/src/features/optimizer/optimizer-page.tsx) · [`optimizer-layout.tsx`](../../../packages/app/src/features/optimizer/optimizer-layout.tsx) — shell (A).
- [`packages/app/src/features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) · [`circular-gauge.tsx`](../../../packages/app/src/features/optimizer/components/circular-gauge.tsx) — (B).
- [`packages/app/src/features/optimizer/smart-scan-tab.tsx`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx) · [`storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) — (C).
- [`packages/app/src/features/optimizer/memory-tab.tsx`](../../../packages/app/src/features/optimizer/memory-tab.tsx) — (D).
- [`packages/app/src/features/optimizer/gpu-tab.tsx`](../../../packages/app/src/features/optimizer/gpu-tab.tsx) — (E).
- [`packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) — gate UI (A).
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) — (C).
- [`packages/desktop/src/main/optimizer/process-service.ts`](../../../packages/desktop/src/main/optimizer/process-service.ts) — (D).
- [`packages/desktop/src/main/optimizer/gpu-service.ts`](../../../packages/desktop/src/main/optimizer/gpu-service.ts) — (E).

**Changed**
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `ViewId`, gate setting (A).
- [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) — `NavItem` entry, gated (A).
- [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) — icon mapping (A).
- [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) — register the settings page (A).
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — new channels (A).
- [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — bridge wiring (A).
- [`packages/desktop/src/main/metrics/memory.ts`](../../../packages/desktop/src/main/metrics/memory.ts) — exported for reuse if its current shape is footer-private (D).

---

## Verification

See Theme F above — reproduced here per house convention: `moon run :typecheck :lint :test` green,
boundary lint clean, the gate hides/shows the view correctly, and the human pass on Decision 1's kill
scope.

---

## Decisions / open questions

1. **Kill-any-process, strongly gated.** *Settled in the brainstorm.* The Memory tab's process table
   is system-wide and its kill action is not restricted to Midnite's own processes, unlike the
   original narrower proposal — every kill goes through the same blast-radius confirm dialog as
   every other destructive op in this app, and the OS's own user-permission boundary (a non-root
   Electron app cannot kill another user's or root's process without a privilege escalation this app
   will never request) is the real backstop. Revisit narrower if the human verification pass in
   Theme F says it feels wrong.
2. **GPU temperature omitted.** *Settled.* No public macOS API exposes it; `sudo powermetrics` or SMC
   access are both out of bounds for this app. Model/VRAM/load ship; temperature does not.
3. **Scan scope: known repos/worktrees + one user-chosen extra root.** *Settled.* Not an unscoped
   filesystem crawl, but wider than "only what's already open in Midnite" — a single native folder
   picker per scan run.
4. **Feature gate: default-off `Settings ▸ Workspace Optimizer` toggle.** *Settled.* Mirrors the
   force-push-with-lease posture given the blast radius of Themes C and D.
5. **No nav chord.** *Recommendation, not yet settled.* This is a niche, opt-in view — giving it a
   `Mod+N` slot would cost a keybinding for a feature most sessions never enable. Reachable via the
   rail click and the command palette only, following the chord-free precedent `view.refresh` and
   `sync.fetch` already set. Revisit if usage says otherwise.
6. **Build-artifact / node_modules detection is per-project-convention, not exhaustive.** *Open.*
   Theme C starts with patterns this repo itself uses (`node_modules`, `dist`, `.moon`); a repo with
   an unusual layout may under- or over-report reclaimable space. Widening the pattern set is a
   natural follow-up once the feature has real mileage, not a blocker for this phase.
7. **Sequential delete, no queue.** *Settled, recommendation.* `git-engine`'s write-queue is
   `index.lock`-specific; Theme C's plain-file deletes stay a simple sequential loop behind the
   confirm dialog rather than inventing a generalized delete-queue nothing else needs yet.
