# Phase 18 — Footer system monitor + repo diagnostics

The footer bar has looked the same since Phase 9. It is 24px of `border-t border-border
bg-card/50` holding a terminal toggle, a branch name, ahead/behind arrows and a changed count —
and because every segment is a left-aligned flex child under one `gap-3`, with no `ml-auto`
anywhere, **the entire right half of the bar is empty**. That empty half is the only always-visible
strip of chrome in the app, and it currently says nothing about the two things a developer
glances down to check: what the machine is doing, and whether the code is clean.

This phase fills it. The right cluster gets four live metric readouts — CPU, RAM, GPU, disk —
each a coloured dot, a percentage and a sparkline, opening into a flyout of area-chart timelines.
Beside them sits a per-repo diagnostics segment: error and warning counts from the selected
repository's own linter.

**The chart work is mostly already done, elsewhere.** `~/Dev/midnite` solved this exact widget,
and its probe modules are written as pure parse functions behind thin `execFile` wrappers,
already using absolute binary paths because a Finder-launched Electron app gets a stripped PATH.
Every reading is available without root: CPU from `os.cpus()` counter deltas, RAM from
`/usr/bin/vm_stat`, GPU from `/usr/sbin/ioreg -c IOAccelerator` — the same
`"Device Utilization %"` counter Activity Monitor graphs, and deliberately **not**
`powermetrics`, which needs sudo. Note `@bilo-io/ui` also ships `AreaChart`/`MetricDial`, but we
are hand-rolling: metric colours are *data* colours with no design-system role, exactly the case
[`lane-colors.ts`](../packages/app/src/features/graph/lane-colors.ts) already argues for raw HSL
triples over token names.

**Scope guardrails.** Running a repository's own linter is **arbitrary code execution from a
directory the user merely opened to look at**, and there is no precedent for it here — every
subprocess today is bundled git, a global PATH binary resolved through `command -v`, or the
user's own shell at their explicit request. So diagnostics are **opt-in per repository**, gated
by a prompt that shows the literal command, and this phase writes that policy down rather than
leaving it implicit. Metrics channels and diagnostics channels both take a **`repoId` only,
never a path** — the [`forge-handlers.ts`](../packages/desktop/src/main/ipc/forge-handlers.ts)
rule. Disk is **capacity, not throughput**: no `iostat`, and no fourth area chart, because a
capacity line is flat for hours and an area chart of it would imply movement that is not there.
darwin probes only, with the per-platform switch in place so Linux is a new branch rather than a
refactor.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

**Themes A, B, C and D landed 2026-08-26** — the metrics half of the phase, end to end:
probes in main, the `mgit:metrics:*` stream, the store and the hand-rolled chart, and the
footer cluster with the app's first popover primitive. E and F (diagnostics) are untouched.
Screenshots: [`docs/screenshots/phase-18/`](../docs/screenshots/phase-18/).

### A — The metrics sampler in main (L) — ✅ DONE (2026-08-26)

- [x] `desktop/src/main/metrics/cpu.ts` — `os.cpus()` reports **cumulative** counters, so a
      single read is meaningless; usage is `(1 - idleDelta / totalDelta) * 100` between ticks.
      Also `cores`, and `os.loadavg()[0]` omitted on win32 where libuv hard-codes it to 0
- [x] `desktop/src/main/metrics/memory.ts` — **not `os.freemem()`**, which on macOS counts
      cached pages as used and reads catastrophically high. Shell `/usr/bin/vm_stat` and
      reproduce Activity Monitor's "Memory Used":
      `max(anonymous - purgeable, 0) + wired + compressed`. The page size **must** come from the
      `page size of (\d+) bytes` header — assuming 4096 is 4× wrong on Apple Silicon. Degrade to
      `os.freemem()` on any parse failure rather than reporting nothing
- [x] `desktop/src/main/metrics/gpu.ts` — `/usr/sbin/ioreg -r -d 1 -w 0 -c IOAccelerator` matched
      for `"Device Utilization %"`. World-readable, so no privilege prompt
- [x] The GPU probe **self-disables after 3 consecutive failures and logs once**. A probe that
      cannot work will otherwise spawn a doomed subprocess every few seconds for the app's whole
      lifetime
- [x] An unreadable GPU is **omitted from the payload entirely** and reaches the renderer as
      `null`, so the chart drops the series. A flat zero line is a lie about a working GPU
- [x] `desktop/src/main/metrics/disk.ts` — `fs.statfs`, using `bavail` (unprivileged-available,
      what `df` shows) not `bfree`. Read on demand, not on the sample interval
- [x] `desktop/src/main/metrics/metrics-service.ts` — one interval for all clients, `timer.unref()`,
      and concurrent probes collapsed onto a single in-flight promise (`this.inFlight ??= probe()`).
      **2s while a flyout is open, 5s when closed, stopped entirely on window blur or hide**
- [x] Every probe is a **pure parser plus a thin `execFile` wrapper**, in separate exports, with
      `.test.ts` files driven by captured `vm_stat` and `ioreg` output. Absolute binary paths
      throughout, and no `electron` import in any probe module — the pattern
      [`repo-store.ts`](../packages/desktop/src/main/repo-store.ts) uses to stay unit-testable

### B — The contract and the sample stream (M) — ✅ DONE (2026-08-26)

- [x] [`shared/src/domain/metrics.ts`](../packages/shared/src/domain/metrics.ts) — `MetricSample`
      with **every metric optional**, so "not readable on this machine" and "0%" stay different
      answers all the way to the chart
- [x] `mgit:metrics:start` / `mgit:metrics:stop` on `CHANNELS`, `mgit:metrics:sample` on
      `EVENT_CHANNELS` — the [`channels.ts`](../packages/shared/src/ipc/channels.ts) split between
      `invoke` request/response and one-way `webContents.send` pushes
- [x] Schemas + `ipc.test.ts` coverage
- [x] A `metrics` bridge group whose subscription returns `Unsubscribe`, for the StrictMode
      double-mount reason [`bridge.ts`](../packages/shared/src/ipc/bridge.ts) documents
- [x] Preload: `subscribe()` for the sample stream, and `ipcRenderer.send` — not `invoke` — for
      start/stop, matching `pty.input`. **Add `metrics` to the exposed `Pick<MidniteGitBridge, …>`
      union**, which is what makes a half-wired group a compile error
- [x] `registerMetricsHandlers(getWindow)` called from
      [`main/index.ts`](../packages/desktop/src/main/index.ts), following
      `registerPtyHandlers(getWindow)`

### C — The store, the palette and the hand-rolled chart (L) — ✅ DONE (2026-08-26)

- [x] `app/src/store/metrics-store.ts` — a fixed-length ring buffer per metric. The **first**
      sample seeds a flat series at the current value rather than letting the line ramp up from
      zero, which otherwise reads as a load spike that never happened
- [x] Samples are stored as `{ value, at }`, **not bare numbers**. The cadence is adaptive, so
      spacing points evenly by index would silently draw a 5s-apart gap as if it were 2s — the
      chart may space by index, but only because the store kept the timestamps to prove it
- [x] `app/src/features/monitor/use-metrics-stream.ts` — subscribe **once with `[]` deps** and
      write imperatively via `getState()`, the
      [`use-graph-stream.ts`](../packages/app/src/features/graph/use-graph-stream.ts) pattern.
      Re-subscribing on cadence change would drop samples across the gap
- [x] `features/monitor/metric-palette.ts` — raw HSL triples, one palette serving both themes at
      a saturation and lightness legible on each, per the `lane-colors.ts` policy. Derived muted
      variants, not hand-tuned duplicates
- [x] `features/monitor/metric-geometry.ts` — chart width, height, stroke width and area alpha as
      **data**, the way [`graph-themes.ts`](../packages/app/src/features/graph/graph-themes.ts)
      holds geometry rather than scattering constants through JSX
- [x] `features/monitor/metric-chart.tsx` — values are 0–100 so there is no y-scaling pass. Build
      the line as `M x,y L …` and close the area with `L W,H L 0,H Z`. **All areas painted before
      all lines**, series reversed so the first series lands on top and no stroke is buried under
      a later fill
- [x] `features/monitor/sparkline.tsx` — the ~24×12 inline form. Same path maths, no axis, no
      legend, `aria-hidden`: the percentage beside it carries the accessible value
- [x] Tests for the ring buffer, the path geometry and the palette — pure modules with `.test.ts`,
      the convention every one of the 22 existing app tests follows

### D — The footer cluster and a real flyout primitive (L) — ✅ DONE (2026-08-26)

- [x] `app/src/components/popover.tsx` — **new, and genuinely absent today**.
      [`tooltip.tsx`](../packages/app/src/components/tooltip.tsx) is hover-triggered and
      `pointer-events-none`, so it cannot host a chart, and `context-menu.tsx` is item-list
      shaped. Reuse their portal-and-clamp mechanics: portalled to `document.body`,
      `useLayoutEffect` positioning clamped to the viewport, Escape and capture-phase scroll
      dismiss. **Read tooltip.tsx's comment about `transform`-induced containing blocks first**
- [x] Click-toggled, focus trapped while open, outside-click dismiss, and focus returned to the
      trigger on close. Extracted as a shared primitive, not inlined into the footer — the
      checks-verdict indicator and the in-progress-op warning both want one next
- [x] `features/monitor/monitor-cluster.tsx` — a new `<div className="ml-auto flex items-center
      gap-3">` in the footer. Nothing existing has to move
- [x] Per metric: a `h-2 w-2 rounded-full` dot with a `0 0 8px` glow, a `tabular-nums`
      percentage, and the sparkline. Footer-scale styling cribbed from
      [`change-count-pill.tsx`](../packages/app/src/components/change-count-pill.tsx)
- [x] A metric that is `null` renders **no readout at all** — no dot, no dash, no zero
- [x] `features/monitor/monitor-flyout.tsx` — the subtle gradient box-shadow glow, three stacked
      area charts (CPU, RAM, GPU) with legends, and disk as a used-of-total gauge rather than a
      fourth flat line
- [x] Opening the flyout escalates the sampler to 2s and closing it drops back to 5s — the
      cadence is a consequence of what is on screen, not a setting the user has to think about
- [x] Animation via the existing `animate-fade-in` Tailwind keyframes, gated on `html[data-motion]`.
      There is no `motion`/`framer-motion` in this repo and this phase does not add one

### E — Diagnostics: the trust boundary and the runner (L) ✅ DONE (2026-08-26)

- [x] A docblock at the top of `desktop/src/main/diagnostics/` **stating the policy** this phase
      establishes: repo-local binaries execute only for repositories the user has explicitly
      trusted, and the prompt names the command. The fs jail's counterpart rule is written down in
      `channels.ts`; this one deserves the same treatment rather than living in a commit message
- [x] `desktop/src/main/diagnostics/trust-store.ts` — trusted repoIds in `trust.json`, keyed by
      repoId like `repos.json`, with the userData dir **injected** so the module carries no
      `electron` import, plus a paired `.test.ts`
- [x] A per-repo diagnostics command and parser choice in the same store. **First per-repo
      persisted config in the app** — every setting today is global
- [x] `desktop/src/main/diagnostics/runner.ts` — `execFile` with an **arg array, never a shell
      string** (unlike `gh-cli.ts`, which needs a login shell to find a Homebrew binary; a
      repo-local `node_modules/.bin` path needs no PATH resolution). Explicit timeout enforced by
      a `SIGKILL` timer, `NO_COLOR=1`, and `stdio: ['ignore', 'pipe', 'pipe']`
- [x] `cwd` comes from `resolveWorkdir(repoId)`, which validates any renderer-supplied worktree
      against the real `git worktree list`. The channel takes a **`repoId` only** — main does not
      take the renderer's word for arguments it is about to execute with
- [x] `desktop/src/main/diagnostics/parse-eslint.ts` — a **total** parser over
      `eslint --format json`, dropping a row it cannot understand rather than guessing, like
      `gh-parse.ts`. Never throws
- [x] `mgit:diag:{trust-status,trust,untrust,detect,run}` + schemas + bridge group + preload +
      `ipc.test.ts`. Everything fails soft to a reason code: `untrusted`, `no-command`,
      `not-installed`, `timed-out`, `parse-failed`
- [x] Detection **proposes** a command from a discovered eslint config, and never invents one. A
      repository with no linter offers nothing rather than failing loudly

### F — The footer segment and the settings page (L)

- [ ] The trust prompt through [`confirm-dialog.tsx`](../packages/app/src/components/confirm-dialog.tsx)
      in `danger` mode, showing the **literal command string** and the resolved working directory.
      Phase 17 already taught that dialog to tint its border, ring, header and glyph
- [ ] Error and warning counts as pills — `--destructive` for errors, `--health-warn` for
      warnings. These are **semantic**, unlike the metric colours, so they take tokens; the
      `--health-*` triples in [`styles.css`](../packages/app/src/styles.css) are the precedent
- [ ] **Absent ≠ zero.** A repo that has not been measured shows a distinct resting state, not a
      green "0 problems" — the same trap `useWorktreeStatuses` documents about
      `isPlaceholderData` reporting every checkout clean while queries are in flight
- [ ] The segment follows `useActiveWorktree()` — the sidebar selection — **not** the active
      workbench tab. Several tabs can point at different repos, but the branch and ahead/behind
      segments beside it are sidebar-driven, and a footer disagreeing with itself is worse than a
      footer that is occasionally behind
- [ ] The flyout lists problems as `file:line` with rule and message, capped, and **says what it
      withheld** — the `EXPAND_ALL_LIMIT` rule from Phase 17
- [ ] An untrusted repo shows an "Enable diagnostics" affordance, not silence. A feature that
      renders nothing is indistinguishable from a broken one
- [ ] A Monitor & Diagnostics settings page in the Phase 16 settings shell: which metrics appear,
      the closed-flyout cadence, the per-repo command, and **revoking** trust
- [ ] Re-running is manual and per-repo. The fs watcher fires on every keystroke-save and lint is
      not free; nothing here runs a linter because a file changed

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`bridge.ts`](../packages/shared/src/ipc/bridge.ts), [`ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts), new `shared/src/domain/metrics.ts` + `diagnostics.ts` |
| Main — metrics | new `desktop/src/main/metrics/{cpu,memory,gpu,disk,metrics-service}.ts` + tests, new `desktop/src/main/ipc/metrics-handlers.ts` |
| Main — diagnostics | new `desktop/src/main/diagnostics/{runner,parse-eslint,trust-store}.ts` + tests, new `desktop/src/main/ipc/diag-handlers.ts` |
| Main — wiring | [`desktop/src/main/index.ts`](../packages/desktop/src/main/index.ts), [`desktop/src/preload/index.ts`](../packages/desktop/src/preload/index.ts), [`repo-registry.ts`](../packages/desktop/src/main/repo-registry.ts) (reuse `resolveWorkdir`) |
| Renderer — monitor | new `app/src/features/monitor/{monitor-cluster,monitor-flyout,metric-chart,sparkline,metric-palette,metric-geometry,use-metrics-stream}.*`, new `app/src/store/metrics-store.ts` |
| Renderer — diagnostics | new `app/src/features/diagnostics/{diagnostics-segment,problem-list,use-diagnostics}.*` |
| Renderer — shared | [`footer-bar.tsx`](../packages/app/src/features/terminal/footer-bar.tsx), new [`components/popover.tsx`](../packages/app/src/components/popover.tsx), [`styles.css`](../packages/app/src/styles.css), the Phase 16 settings shell |
| Tests | [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts), new `e2e/footer-monitor.spec.ts` |

## Verification

- [x] `moon run :typecheck :lint :test` green
- [x] `mock-bridge.ts` grows a `metrics` group with a **live handler array and a real splice
      teardown**, not the inert `unsubscribe` that `watch.onEvent` and `menu.onCommand` use. An
      inert stream renders an empty flyout in every spec, which would pass while testing nothing.
      Samples pushed asynchronously via `setTimeout(…, 0)`, as `log.start` already does
- [ ] ◐ PARTIAL — A `metricsSamples?` and a `diagnostics?` field on `MockFixtures`, each commented with the
      state it unlocks
- [ ] ◐ PARTIAL — New Playwright spec: the cluster renders four readouts, a `null` GPU renders three, the
      flyout opens on click and closes on Escape with focus returned, an untrusted repo shows the
      enable affordance, and trusting one surfaces counts
- [ ] ◐ PARTIAL — Unit tests: `vm_stat` and `ioreg` fixture parsing (including the Apple Silicon page-size
      header), the CPU delta maths, the ring buffer's flat-seed behaviour, the chart path
      geometry, and the eslint JSON parser against truncated and non-JSON output
- [ ] **Open, for a human:** cross-check CPU, RAM and GPU against Activity Monitor on Apple
      Silicon. The `vm_stat` formula and the `ioreg` counter are both chosen to match what
      Activity Monitor reports, and that claim can only be checked by looking at both
- [ ] **Open, for a human:** battery cost over an hour idle with the flyout closed, confirming
      the blur pause actually stops the `ioreg` spawns
- [ ] **Open, for a human:** a repository whose lint takes 30s or more, and one whose eslint is
      absent or broken, confirming both fail soft to a reason code

## Not in this phase

- Disk **throughput** — no `iostat`, no I/O timeline. Capacity only
- Linux and Windows probes. The per-platform switch exists and non-darwin degrades to CPU plus
  `os.freemem()`, but `/proc/meminfo`, `gpu_busy_percent` and `nvidia-smi` are a later branch
- GPU memory totals. Apple Silicon's unified memory has no VRAM denominator, so a
  used-of-total gauge cannot be drawn honestly
- Network throughput, per-process CPU, and app-internal metrics (`app.getAppMetrics()`)
- Persisting metric history across restarts. The buffer is a live window, not a log
- Jumping from a diagnostic to the offending line. The Folder view is a **read-only** browser and
  has no editor to land in
- `tsc --noEmit` as a second diagnostics source. The command is configurable, so a user can point
  at it, but detection, dual-parser output and the merged count are not built here

## Decisions / open questions

- **Resolved — the trust model.** Opt-in per repository, prompted on first selection, showing the
  literal command, persisted by repoId. Rejected: auto-running on select (opening an unknown repo
  would be enough to execute its code), and parsing existing artifacts instead of executing
  (eslint's cache format is internal and unstable, and `tsbuildinfo` carries no readable
  diagnostics, so it would mostly report nothing).
- **Resolved — charts are hand-rolled**, despite `@bilo-io/ui` shipping `AreaChart`, `LegendDot`,
  `MetricDial` and `RadialGauge` already installed and unused. Consistent with the app choosing to
  hand-roll its tab strip, tooltip and theme toggle, and with metric colours being data rather
  than design-system semantics. If the hand-rolled chart lands and the library version turns out
  strictly better, swapping is a component change, not an architecture one.
- **Resolved — disk gets a gauge, not a chart**, so "three charts" is three charts.
- **Resolved — the segment follows the sidebar selection**, not the active workbench tab.
- **Resolved — non-uniform time axis (Theme C).** Timestamps are kept in the store, points
  are spaced by index, and `cadenceBreaks()` draws a faint dashed rule where the interval
  changed — the doc's own fallback, taken up front rather than waiting for it to read badly.
  A time-scaled x-axis was rejected as real work for a five-minute window nobody measures
  against.
- **Resolved — the ring buffer is time-windowed, not count-capped (Theme C).** Five real
  minutes at either cadence. A fixed sample count would have made the window silently 2.5×
  longer whenever the flyout closed, so the same chart width would show a different span
  depending on something the user did a minute earlier. A count cap survives only as a
  memory backstop.
- **Resolved — the cluster takes slots (Theme D).** `FooterCluster` renders children rather
  than a fixed list of four metrics, so the diagnostics segment and the checks-verdict
  indicator arrive as children instead of as a restructuring of whatever got there first.
- **Superseded — non-uniform time axis.** The adaptive cadence means a series can hold 2s-apart and
  5s-apart samples, and a chart spacing by index draws them identically. Recommendation: keep the
  timestamps in the store, space by index, and accept the distortion for now — the alternative is
  a time-scaled x-axis, which is real work for a 60-second window nobody measures against. If it
  reads badly, mark cadence changes with a subtle gridline rather than rescaling.
- **Open — one flyout or two.** The monitor and the diagnostics segment sit side by side and each
  opens a panel. Recommendation: two separate popovers over the shared primitive, since their
  contents have nothing to do with each other; revisit if the footer starts feeling like a row of
  competing buttons.
- **Open — where the checks-verdict indicator goes.** Phase 17's `checks-verdict.ts` produces a
  RAG verdict that currently only reaches the sidebar. The footer's right cluster is an obvious
  home for it, and it would want the same popover primitive. Not claimed here, but Theme D should
  leave room for it rather than assuming the cluster's contents are final.
- **Open — a global "trust all repositories" escape hatch.** Convenient for someone who only ever
  opens their own repos, and it undoes the entire point of the gate. Recommendation: leave it out
  of this phase; if the per-repo prompt proves annoying in daily use, that is evidence worth
  having before adding the bypass.
