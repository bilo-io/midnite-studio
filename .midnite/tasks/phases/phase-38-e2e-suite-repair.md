# Phase 38 — Paying off the e2e suite

On 2026-09-01 the Playwright suite was run in full for the first time in weeks, as part of
finally giving it a CI job. **45 of its 442 specs failed, across 17 of 58 files** — and wiring
the job up then found **four more that fail only on the Linux runner**, which Theme I owns. Nothing in
that run was a fresh regression: a bisect against `ec2c75e` — the commit before Phase 36's
performance work — showed the same three sample files failing 15 there against 13 on `main`, so
the rot predates the phase most likely to be blamed for it. This is drift, accumulated over
however many merges have landed since anyone last ran `moon run app:e2e`.

**These counts are a floor.** They were taken on 2026-09-01; a rebase onto `main` later the
same evening picked up another session's renderer work and immediately turned four more specs
red (`files-search`, `files-view`, `files-editor`, `diff-scroll-perf`). Re-measure at the start
of the phase rather than trusting the list — and note that the CI job which would have stopped
this is itself still unlanded (see `outstanding.md`), so the number only moves one way until it
is.

**Why it happened is already written down.** `outstanding.md` has carried the entry since
2026-08-27, when seventeen specs sat red across several merges: *"Nothing runs `app:e2e`
automatically."* The suite is out of `moon run :test` on purpose — it needs a chromium download
— and so it ran only when a human remembered. The CI job added alongside this phase closes the
hole going forward, but it can only block on specs that pass, so it ships with a **ratchet**:
[`packages/app/playwright.ci.config.ts`](../../../packages/app/playwright.ci.config.ts) names
these 17 files in `KNOWN_RED` and CI blocks on the other 41. This phase empties that list.

**Builds on.** The suite's own conventions, which are good and should not be renegotiated
here: specs drive the renderer against a mocked `window.midniteStudio`
([`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts)) rather than Electron, so
every path is deterministic; `retries: 0`, because a retry masks a race rather than absorbing
flake; and a dedicated `strictPort` on 5273 so two worktrees running at once collide loudly
instead of silently testing each other's source.

**Scope guardrails.** **Fix the specs or fix the product — but say which.** Every item below is
a failing assertion, and each one resolves as either "the spec drifted from an intended change"
(update the spec) or "the app actually broke and nobody noticed" (fix the app, keep the spec).
Those are very different outcomes and the second is the reason this phase is worth doing at
all; a theme that silently rewrites every assertion to match current behaviour has destroyed
the evidence rather than paid the debt. **Never delete a spec to make it pass.** On retries: the base config now allows
**two in CI and none locally** (`retries: process.env.CI ? 2 : 0`), added with the job because
the suite failed about one run in two, a different spec each time, on variance no developer can
reproduce. That is a floor, not a budget — do not raise it, do not add per-spec retries, and
treat a spec that needs the retry *every* time as a real race to fix here. Making the wait
explicit is always better than tolerating the retry.
**`KNOWN_RED` only shrinks.** A file leaves the list when its whole file passes; nothing is
ever added, because from now on CI catches it the same day.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The pty seam (M) — ✅ DONE (PR #12, 2026-09-02)

**Do this first.** Seven of the 45 — every `fab-loops` failure and both `terminal-links` ones —
fail with the same shape: `pty:activity was not delivered to pty-1`, `pty:exit was not
delivered to pty-1`, `the URL was not delivered to pty-1`. Two unrelated features failing
identically is one fault in the mock bridge's pty event delivery, not nine bugs, and the other
themes are much easier to read once it is gone.

- [x] Diagnosed: not a mock-bridge fault at all. `TerminalView` moved behind a lazy chunk in
      Phase 36 Theme C, so `pty.create` no longer fires synchronously with Start (or the panel's
      auto-opened shell) — it fires once the lazy chunk's Suspense boundary resolves, a moment
      later. Confirmed with a debug probe: `window.__mstudioPty.creates` was empty at the exact
      moment of failure. Fix: `emitActivity`/`exitPty`/`printUrl` now poll the injector's return
      value instead of asserting it once, so any call site — present or future — waits out the
      race structurally. Re-measuring at the start of this theme found **3 more failures beyond
      the original count** (drift since the doc was written); all the same cause.
- [x] `fab-loops.spec.ts:157` — a waiting loop turns its tab dot and the FAB dot amber.
- [x] `fab-loops.spec.ts:240` — a loop that exits on its own flips Stop back to Start, and
      history says exited (`pty:exit`, not `pty:activity` — both paths covered).
- [x] `fab-loops.spec.ts:359` — the waiting notice is debounced by transition, not by time.
- [x] `fab-loops.spec.ts:416` — `data-motion='reduced'` also stops the thinking pulse.
- [x] `fab-loops.spec.ts:512` — a `fabSessions` entry whose session is gone reads as idle. Same
      root cause as the rest, not a passenger — confirmed by reproduction.
- [x] `terminal-links.spec.ts:66` — Cmd+click opens a URL in the output; a bare click does not.
- [x] `terminal-links.spec.ts:90` — leaves output that is not a link alone.
- [x] Dropped `fab-loops.spec.ts` and `terminal-links.spec.ts` from `KNOWN_RED`.

**Handoff to Theme I.** Un-ratcheting these two files ran every one of their specs on the CI
runner for the first time, which surfaced a *second*, unrelated failure class: 4 specs (1 in
`fab-loops.spec.ts`, both in `terminal-links.spec.ts`, plus one more in `fab-loops.spec.ts`) open
a REAL second terminal and hit the same GPU-less-runner wall `terminal-lazy-preload.spec.ts` and
friends already carry — `@xterm/addon-webgl` gets no context, so `.xterm-screen` (or the panel
itself) never becomes visible. Tagged `@linux-red` per the established per-spec convention rather
than re-adding whole files to `KNOWN_RED`, so the rest of each file keeps blocking. These four are
now Theme I's to close alongside its existing three.

### B — The changes panel (M) — ✅ DONE (2026-09-02)

The largest single cluster: **all ten** `changes-panel` specs fail, every one on
`expect(locator).toBeVisible()`. A whole file failing on one assertion type means the panel
never reaches the state the fixture sets up — one fault, ten symptoms. `diff-view` joins this
theme because both of its failures are `toHaveCount` against the same diff surface.

- [x] Find the single reason nothing in the panel is visible — most likely the fixture no
      longer produces a selected checkout, or the panel's container moved behind a lazy
      boundary the spec does not await. Fix that before touching any individual assertion.
- [x] `changes-panel.spec.ts:96` + `:108` — panel totals count a two-sided file once; a row
      shows the counts for the side it is listed on.
- [x] `changes-panel.spec.ts:119` + `:135` + `:155` — list ordering and full paths, tree
      grouping with collapsed totals, and the tree ⇄ list choice surviving a reload.
- [x] `changes-panel.spec.ts:170` + `:216` — staging buttons act on their own row; picking a
      file switches the pane back to its single diff and back again.
- [x] `changes-panel.spec.ts:239` + `:251` + `:278` — the commit button appearing only once a
      message is typed, toolbar buttons surviving very wide totals text, and the textarea
      growing then shrinking back after committing.
- [x] `diff-view.spec.ts:63` + `:81` — the old line-number column off by default and toggling
      on, and side-by-side switching layout. Both `toHaveCount`: establish whether the expected
      count changed by design (Phase 26 territory) or the rendering broke.
- [x] Drop `changes-panel.spec.ts` and `diff-view.spec.ts` from `KNOWN_RED`.

**Found:** neither of the doc's two guesses was the cause. The nav rail defaults to a
collapsed, hover-to-expand state; every spec's `open()` helper clicked "Changes" as its
first interaction, and Playwright's `.click()` computes its target point before the
hover-triggered reflow moves the item out from under it, so the click silently lands
elsewhere and nothing ever renders. Fixed at the spec level (hover, wait for the settled
label, then click). `diff-view:63` (old-line-number gutter count) *was* a real regression —
Phase 26's `DiffCell` refactor collapsed to a single `showGutter` toggle and dropped the
always-shown new-line number — fixed in `diff-cell.tsx`. `:81` was a stale count (the
Levenshtein aligner in `split-diff-rows.ts` correctly produces 4 add-cells for an uneven
diff, not 1); the assertion was updated to match.

### C — The workbench and the rail (M) — ✅ DONE (2026-09-02)

`repos-workbench` fails five different ways and `nav-shell` two, and unlike A and B these look
genuinely independent — including two that are strong candidates for *real* product bugs.

- [x] `nav-shell.spec.ts:103` — "the rail carries all eight views, Dashboard ungrouped above
      the rest" fails on `toEqual` deep equality. The rail's contents are asserted exactly, so
      this says a view was added, removed or reordered without the spec being told. Decide
      which is correct and make the spec the record of it.
- [x] `nav-shell.spec.ts:251` — switching views keeps the checkout you were looking at
      (`not.toHaveProperty`). If the checkout is genuinely being dropped on a view switch,
      **that is a product bug and takes priority over the spec.**
- [x] `repos-workbench.spec.ts:136` — a change count lands on the checkout that owns it, not
      the repo (`toHaveCount`).
- [x] `repos-workbench.spec.ts:201` — removing a worktree asks first, in danger colours, naming
      what is at stake (`toBeFocused`). A destructive-confirm dialog that no longer takes focus
      is an accessibility regression, not a stale selector — check the dialog, not the spec.
- [x] `repos-workbench.spec.ts:394` — a signed-out `gh` says what to run rather than failing
      silently.
- [x] `repos-workbench.spec.ts:468` — a folded repo hangs its branch and count off the trailing
      edge.
- [x] `repos-workbench.spec.ts:502` — commit message input has equal inset on all sides when
      empty (`toBeLessThanOrEqual`, i.e. a measured-pixel assertion — confirm it is not simply
      brittle before changing the number).
- [x] Drop `repos-workbench.spec.ts` and `nav-shell.spec.ts` from `KNOWN_RED`.

**Found:** both flagged real bugs were real. `repos-workbench:201` — `use-focus-trap.ts`
unconditionally called `container.focus()` after React applied a child's `autoFocus`,
stealing focus from `ConfirmDialog`'s Cancel button every time; fixed to only focus the
container when nothing inside already has it. `repos-workbench:468` — `min-w-0` on a
folded repo's branch+count summary let flexbox shrink it below its unshrinkable content,
visibly overflowing the container; dropped from `repos-panel.tsx`. `repos-workbench:502`
was also real: an inline-block `<textarea>` sized to its line box rather than its border
box, leaving a gap under it; added `block`. `nav-shell:251` (checkout dropped on view
switch) was a stale spec — worktree selection persisting across view switches is a
deliberate, already-landed feature (`e36b6ac`); the assertion was inverted to match. The
other three were stale-selector fixes, not bugs.

### D — The terminal panel (S) — ✅ DONE (PR #47 + Theme I, 2026-09-02)

Two specs, both about state that has to survive something. Kept separate from Theme A: these
fail on their own assertions rather than on pty delivery, so they may well outlive A's fix —
but re-run them after A lands before spending any time here.

- [x] `terminal.spec.ts:972` — a reload keeps live sessions live (`toEqual` deep equality).
  - Was a spec race, not a product bug: `LazyTerminalView`'s chunk (re-)loads asynchronously after
    a reload, so the mount effect that calls `pty.snapshot` lands a beat after the session rows are
    already visible. Fixed with `expect.poll` instead of a synchronous read right after
    `rows(page)` — reproduced reliably as an empty `Set` without it.
- [x] `terminal.spec.ts:1073` — the session list resizes independently of the terminal pane
      (`toBeGreaterThan`).
  - Also a spec race: the bounding box was measured immediately after `toggleTerminal`, while the
    reveal tween was still settling. `panel-snap.spec.ts`'s own `dragSeparator` already documents
    this exact trap and its fix — `hover()` before `boundingBox()`, so Playwright waits for the
    element to stop moving.
  - Both confirmed stable over 3 repeated local runs each.
- [x] **Attempted and reverted, then resolved by Theme I.** Dropping the whole file from
      `KNOWN_RED` verified green at 38/38 locally on macOS — but macOS has a real GPU. CI (a
      GPU-less Linux runner, or so it looked) surfaced failures in *other* specs entirely
      unrelated to this theme (`'an agent row carries its own mark and its own accent'`, `'two
      agents from the same roster get different marks'`, at least a third before the job was
      cancelled) — the same wall this file's `KNOWN_RED` comment already named. It was not
      actually the GPU: Theme I traced it to a `navigator.platform`-driven chord mismatch that
      kept the terminal panel from ever opening on CI, unrelated to what renders inside it once
      open. Its fix (pinning the platform in `mock-bridge.ts`) closes that wall for every terminal
      spec at once, this file included — see its own "New sighting" item — so the file drops from
      `KNOWN_RED` there.

### E — Settings, files and tests (S) — ✅ DONE (2026-09-02)

- [x] `settings-pages.spec.ts:113` — **fix this one first**: it fails on a strict-mode
      violation, `getByRole('navigation', {name: 'Settings pages'}).getByRole('button', {name:
      'System'})` resolving to two elements — the "System" category header and the "System
      Health" page button. That is an ambiguity a screen-reader user hits too, so prefer
      disambiguating the accessible names in the product over `exact: true` in the spec.
- [x] `settings-pages.spec.ts:75` — the pages are grouped under collapsible category headers.
- [x] `settings-pages.spec.ts:281` — the Agent page shows the version card and browses
      `~/.claude`.
- [x] `files-write.spec.ts:204` — the Agent settings page's claude-home tree offers no context
      menu at all. Shares a surface with the previous item; do them together.
- [x] `tests-view.spec.ts:56` — the sidebar Tests section groups discovered suites by kind.
      Times out clicking the `Tests` button, so the section is not rendering at all.
- [x] Drop `settings-pages.spec.ts`, `files-write.spec.ts` and `tests-view.spec.ts` from
      `KNOWN_RED`.

**Found:** the same substring-collision pattern hit three separate control pairs — the
"System" category heading vs. "System Health" page button (renamed to "System Info"),
the Agent page's "Update" button vs. the "App Updates" settings entry (renamed to
"Update Claude"), and an unscoped `getByRole('button', {name:'Agent'})` matching the
persistent rail's "Agents" section header (fixed by scoping the locator to the settings
nav). `tests-view:56` failed because the Tests section is nested under the forge-gated
parent and the spec's fixture had no remote configured — added one, matching sibling specs.

### F — The forge surfaces (M) — ✅ DONE (2026-09-02)

Seven specs across four files, all on PR/Actions/review surfaces. Four of them time out rather
than assert, which usually means a query that never resolves against the mocked bridge.

- [x] `actions-view.spec.ts:258` + `:388` — both time out waiting to click **"Load the full
      log"**, so the truncation banner's button is not being rendered. One fix, two specs.
- [x] `review-threads-shots.spec.ts:247` + `:260` + `:272` — threads light, composer open on a
      line, outdated group expanded. All three time out; these write committed screenshots, so
      expect PNG churn and commit only the shots this theme actually changes.
- [x] `reviews-loading-shots.spec.ts:176` — a pull request opening with nothing cached
      (`toBeAttached`). Adjacent to the previous item and probably the same loading path.
- [x] `forge-issues.spec.ts:111` — a failed listing is a different empty from an empty listing.
      A distinction worth keeping: check the product still draws two different empties before
      assuming the spec is stale.
- [x] Drop `actions-view.spec.ts`, `review-threads-shots.spec.ts`,
      `reviews-loading-shots.spec.ts` and `forge-issues.spec.ts` from `KNOWN_RED`.

**Found:** `actions-view` was a real regression — "Load the full log" had been silently
truncated to "Load full log" in an unrelated number-formatting PR; one-line text fix.
`review-threads-shots` was the same nav-rail hover/click-reflow hazard Theme C found
independently, at this spec's wide viewport where the rail starts collapsed; fixed at the
spec level only (Theme C owns any product-level nav-rail fix). `reviews-loading-shots:176`
was a stale premise — the status bar's own PR-list query now warms the same cache before
Reviews is ever opened, so the whole-pane loading skeleton it wanted is no longer
reachable; updated to assert the real current skeleton. `forge-issues:111` was a locator
bug, not a fixture issue — the product already distinguishes a failed listing from an
empty one; the shared seeded error text just matched twice, ambiguating an unscoped
`getByText`.

### G — Monitor, graph and the browser pane (S) — ◐ PARTIAL (2026-09-02)

The five stragglers, unrelated to each other; batched so they do not each need a slice.

- [x] `footer-monitor.spec.ts:52` — disk is drawn as a ring, because capacity does not move.
      A test-scoping bug, not a product one: `BsCpuFill`/`BsHddFill` (Bootstrap icons, via
      `react-icons`) each render as one or more `<path>` elements, so the spec's unscoped `svg path`
      locator was counting icon paths alongside the sparkline's own — 4 where it expected 2. Scoped
      the locator to exclude the icon by its `metric-icon-<id>` testid.
- [x] `footer-monitor.spec.ts:221` — a cadence change is marked on the chart rather than
      silently compressed. A real product bug: `MonitorCluster` and `BatterySegment` both call
      `useMetricsStream()` independently, so every real sample was pushed into `useMetricsStore`
      twice — two same-timestamp points per sample, which `cadenceBreaks`'s `previous <= 0` guard
      silently skips rather than draws a rule at. Fixed by sharing one `onSample` subscription
      across callers via a module-level ref count in `use-metrics-stream.ts`. **Confirmed on a real
      CI run**, not just locally.
- [ ] `graph-themes.spec.ts:264` — the cascade settles once, then never replays on scroll or
      row recycling. **A genuine trap, caught only by actually running CI**: green in an isolated
      local run (24/24, macOS), but a real CI run confirmed it still red on Linux. A local pass
      cannot be trusted for this one — whatever the difference is (timing under a slower/2-core
      runner is the leading guess), it is not yet root-caused. Stays in `KNOWN_RED`.
- [ ] `graph-themes.spec.ts:479` — each style redraws the graph and persists (times out). Not
      independently confirmed red or green on CI — bundled with `:264` in the same file, which
      stays ratcheted as a whole until both are actually investigated.
- [x] `browser-pane.spec.ts:129` — closing the pane restores clicks to the content beneath it
      immediately, not after the exit transition. Green locally **and confirmed on a real CI run**.
  - **Reopened 2026-09-03, and fixed in [PR #91].** That confirmation was a single green run, and
    one green run is not evidence a spec is stable: it went red on three consecutive CI runs of an
    unrelated branch — nine attempts, since `retries: 2`.
  - **It was never branch-specific.** Running the full `--shard=1/4` under
    `playwright.ci.config.ts` against a *detached worktree at `origin/main`* reproduces it: `:129`
    flaky there, and `:147` flaky in the same run. `main`'s green was `retries: 2` rescuing it —
    exactly the tolerance Theme H's last item warns "is how the next 45 hide". Anyone re-checking
    a suspected flake here should reach for that comparison first; a single-file local run passes
    13/13 and proves nothing, because the failure only appears under the full shard's load.
  - **Root cause.** The 150 ms budget sits deliberately under `REVEAL_MS` (200), so that a click
    landing proves the pane stopped swallowing clicks *before* its exit finished — the right thing
    to test. But Playwright's actionability check also waits for the target to be **stable across
    two animation frames**, so on a loaded runner the whole budget goes on frames rather than on
    the behaviour under test. The assertion raced the transition it meant to outrun.
  - **The fix records the class from inside the page** rather than polling for it. The guarded
    regression is stateful, not temporal — `pointer-events-none` must land in the same commit that
    starts the fade — but polling from the test races the *other* way: `useReveal` unmounts the
    pane `REVEAL_MS + SETTLE_SLACK_MS` later, so a stalled runner reaches its first poll to find no
    element at all. A `MutationObserver` captures the className at the first frame carrying
    `opacity-0`, and the assertion reads that recording at whatever pace it likes. **Two sessions
    converged on this spec at once** (PR #91 and PR #92); the observer version landed, and a
    simpler `toBeAttached()` + `toHaveCSS(...)` attempt was dropped in its favour precisely because
    it would still have raced that unmount.
  - Measured after: the full shard goes green twice in a row with **0 flaky**, against 1 flaky on a
    branch and 2 on `main` beforehand — and the shard is ~40% faster, since the old test spent its
    150 ms budget on every one of its three attempts.
- [x] Drop `footer-monitor.spec.ts` and `browser-pane.spec.ts` from `KNOWN_RED` — **not**
      `graph-themes.spec.ts`, which a real CI run proved still belongs there.

### H — Retire the ratchet (S)

Only once `KNOWN_RED` is empty. The split config is scaffolding, and scaffolding left standing
becomes a place to hide the next 45.

- [ ] Confirm `moon run app:e2e` — the *full* suite, not the ratchet — is green twice in a row
      locally (twice, because `retries: 0` means a flaky spec would otherwise leave through
      this door).
- [ ] Point the CI `E2E` step at `app:e2e`, delete the `app:e2e-ci` task from
      [`packages/app/moon.yml`](../../../packages/app/moon.yml) and delete
      `packages/app/playwright.ci.config.ts`.
- [ ] Rewrite the `outstanding.md` entry to record the close, with the final count.
- [ ] Consider whether `app:e2e` should now join `moon run :test` for local runs, or stay
      separate on the chromium-download argument that has always justified it. Record the
      decision either way — this is the question that produced the gap in the first place.
- [ ] Re-evaluate `retries: process.env.CI ? 2 : 0` in
      [`playwright.config.ts`](../../../packages/app/playwright.config.ts). It was set to make a
      blocking gate survivable against a suite this phase had not yet repaired; once it has,
      check whether CI is green at `retries: 0` over a week of merges and take the tolerance
      back out if it is. A retry allowance nobody revisits is how the next 45 hide.

### I — The terminal does not render on the CI runner (M) — ◐ PARTIAL (2026-09-02)

Discovered while wiring the job up, and different in kind from every theme above:
these four specs are **green on macOS and red only on Linux**, so they are not drift. Each
one mounts a terminal, and the original diagnosis was xterm's paint step: `@xterm/addon-webgl`
([`terminal-view.tsx:363`](../../../packages/app/src/features/terminal/terminal-view.tsx)) gets
no context on a GPU-less runner. **That diagnosis was wrong** — see below.

**Four more joined the list from Theme A.** Un-ratcheting `fab-loops.spec.ts` and
`terminal-links.spec.ts` ran every one of their specs on the CI runner for the first time, which
hit this exact wall in specs nobody had seen run there before: `terminal-links.spec.ts`'s both
specs (real terminal, mouse/keyboard interaction against `.xterm-screen`), and two
`fab-loops.spec.ts` specs that open a REAL second terminal in the main housing (`Control+\``,
`[data-terminal-panel]`) — "the loop session never appears in the main terminal housing" and "a
restored FAB session still never reaches the main terminal housing". All four are tagged
`@linux-red` in place rather than added to `KNOWN_RED` wholesale, so the rest of each file keeps
blocking; whatever this theme's fix turns out to be, drop the tag along with the rest.

**Two fixes were tried and measured before this batch, both rejected:** raising CI's `expect`
timeout to 15s **moved nothing** (the failures were never slow, they were impossible), and
Chromium's SwiftShader software rasteriser **also fixed none of them** while making every shard
about 60% slower, so it was reverted. **A third was tried and reverted in this batch**: forcing
xterm's own DOM renderer (skip `WebglAddon` outright) under Playwright degraded gracefully on
macOS — 38/38 green, forced on — but on the real Linux CI runner it did not just fail to render:
several terminal specs across every shard **timed out** (60s × 3 retries each), and one shard hit
the job's 20-minute cap and was **cancelled**. The DOM renderer's per-character-cell layout cost,
compounding across several sequential terminal mounts on a 2-core runner, is apparently worse
than SwiftShader's already-rejected software-GPU path.

**The real root cause, found triaging that failure: the terminal panel was never opening on CI
at all**, for every one of these specs, regardless of which renderer xterm would have used —
its rendering was never reached. `chord.ts`'s `isMac()` reads `navigator.platform`, which is
`'MacIntel'` on every real install (`electron-builder.yml` ships macOS only) but genuinely
`'Linux'` on the CI runner's actual Chromium. On a non-mac platform, `chordFromEvent` treats a
bare Ctrl press as `Mod`, so `page.keyboard.press('Control+\`')` — every affected spec's own
`open()` presses exactly this to reveal the panel — resolves to the chord `'Mod+\`'`, which never
matches `terminal.toggle`'s registered `'Ctrl+\`'` binding
([`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts)). This is why neither
of the first two rejected fixes moved anything: neither addressed a failure that happens before
any rendering is even attempted.

- [x] Establish what SwiftShader actually gave the page — whether `WebglAddon` still threw,
      whether it fell back, or whether the terminal failed for a second reason entirely that the
      missing context was masking.
  - **Answered, eventually: neither.** The addon was never reached at all — see the root cause
    above. The DOM-renderer attempt (tried first, on the WebGL theory) is what surfaced this.
- [x] Decide the fix: a DOM-renderer fallback under test, a canvas-addon fallback, a GPU-enabled
      runner, or moving just these specs to a macOS lane.
  - **None of these — the fix is upstream of rendering entirely.**
    [`mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts)'s `installMockBridge` now pins
    `navigator.platform` to `'MacIntel'` via `addInitScript`, once, for every spec — so every e2e
    run sees the one platform this app is ever real on, regardless of what OS actually runs the
    browser. Reproduced locally by pinning the OTHER way (simulating Linux) and confirming the
    terminal panel genuinely fails to open without the fix, and opens correctly with it.
- [x] `phase-21-roster.spec.ts:49` — the session list renders 0 rows.
  - Green with the platform fix (confirmed locally against the real, unforced WebGL renderer —
    no DOM-renderer fallback needed at all).
- [x] `terminal-lazy-preload.spec.ts:73` + `:101` — Phase 36's own specs for the lazy xterm
      chunk. Green with the platform fix.
- [x] `terminal-reveal.spec.ts:45` — revealing a live session replays its buffer with one
      resize. Green with the platform fix.
- [x] `reviews.spec.ts:400` — the terminal header under a squeezed detail pane. Green with the
      platform fix; tag dropped rather than the whole file added to `KNOWN_RED`, since it is the
      only terminal spec in a ten-spec file.
- [x] `palette.spec.ts:148` — "Mod+K opens the palette while the terminal has focus". Green with
      the platform fix.
- [ ] `shortcut-rail.spec.ts:261` and `status-bar.spec.ts:149` — a **different, still-open**
      Linux-only cause from the rest of this theme: both assert a status-bar *density*, decided
      from measured content width, which depends on the fonts installed. An attempted fix
      (`status-bar-density.ts`, reading the real breakpoint from the DOM at test time instead of
      a hard-coded pixel guess) was tried and reverted — it addressed a LATER assertion in each
      spec, but the real CI run failed on an EARLIER one (that the fixture starts in `full`
      density at all), which a real-GPU macOS run does not exercise the same way. Both stay
      `@linux-red`.
- [x] **New sighting (PR #47, 2026-09-02): `terminal.spec.ts` joined this theme's scope, not just
      Theme D's.** Theme D fixed its own two named specs (both spec races) and tried dropping the
      whole file from `KNOWN_RED` — verified 38/38 green on macOS, then reverted once CI failed on
      `'an agent row carries its own mark and its own accent'`, `'two agents from the same roster
      get different marks'` and at least a third before the job was cancelled. These were the same
      chord-mismatch wall as this theme's other five, not a new fault — `terminal.spec.ts`'s own
      `open()` presses `Control+\`` too. Fixed by the same platform pin; verified by running the
      full file (38 specs) locally against the real, unforced renderer.
- [x] Drop `phase-21-roster.spec.ts`, `terminal-lazy-preload.spec.ts`, `terminal-reveal.spec.ts`
      **and `terminal.spec.ts` itself** from `KNOWN_RED`, and the `@linux-red` tag from all six
      affected specs across `fab-loops.spec.ts`, `terminal-links.spec.ts`, `reviews.spec.ts` and
      `palette.spec.ts`.
  - **`grepInvert` stays** — `shortcut-rail.spec.ts`/`status-bar.spec.ts` (above) and
    `titlebar-agents.spec.ts`/`panel-snap.spec.ts` (not enumerated above, not investigated) still
    carry `@linux-red` tags, so removing it is not yet safe.

## Files this phase touches

- `packages/app/e2e/*.spec.ts` — the 17 files named in `KNOWN_RED`.
- `packages/app/e2e/mock-bridge.ts` — Theme A's pty delivery seam.
- `packages/app/playwright.ci.config.ts` — shrinks every theme; deleted by H.
- `packages/app/moon.yml` — `e2e-ci` removed by H.
- `.github/workflows/ci.yml` — the `E2E` step's target, changed by H.
- Renderer source under `packages/app/src/` wherever a failure turns out to be a real bug.
- `docs/screenshots/` — Theme F's specs write committed PNGs.

## Verification

- `moon run app:e2e-ci` green after every theme (it is what CI blocks on).
- `moon run app:e2e` — the count of failures strictly decreasing, theme by theme. Record the
  number in each theme's `done.md` entry, so the phase's progress is a measurement rather than
  an assertion.
- `moon run :typecheck :lint :test` green, as ever.
- On H: the full suite green twice consecutively, and `KNOWN_RED` gone from the tree.

## Not in this phase

- **No new e2e coverage.** This phase repairs; it does not extend. A spec that should exist but
  does not belongs to whichever phase owns that feature.
- **No `retries` and no `test.skip`** as a repair tactic. Both convert a red spec into a
  silently-absent one, which is the disease.
- **Screenshot byte-reproducibility** stays in `outstanding.md`. Theme F will churn PNGs and
  the existing rule — commit only the shots belonging to the slice in hand, `git checkout --`
  the rest — is the workaround until that entry is picked up.

## Decisions

- **Ratchet rather than a big-bang repair.** The alternatives were a non-blocking job (which is
  exactly the arrangement that produced the rot) or fixing all 45 before turning CI on at all
  (which leaves 397 working specs unguarded for however long that takes). Blocking on the
  passing 397 immediately, with the failures written down, protects the majority now and makes
  the debt visible rather than latent.
- **Themes follow root causes, not filenames.** Theme A exists because seven failures across
  two unrelated features share one error string; splitting them by file would have meant
  finding the same bug twice.
- **CI retries twice, local retries none.** The config's standing rule was a flat `retries: 0`
  and the reasoning behind it — a retry masks a real race rather than absorbing infrastructure
  flake — is still right for the run a human does. It was written before the suite had ever run
  in CI, though, and a cold runner fetching lazy chunks is exactly the variance it did not have
  to account for. Strict where a failure is debuggable, tolerant where it is not; Theme H asks
  whether the tolerance is still needed.
- **The suite stays out of `moon run :test`.** Not revisited here — H merely asks the question
  once the suite is green enough for the answer to be honest.

## Open questions

- Are the two nav-shell failures and `repos-workbench:201` real product bugs? They read that
  way (a dropped checkout on view switch; a destructive dialog that does not take focus) but
  none has been reproduced by hand yet. If they are, they deserve to be pulled out of this
  phase and fixed on their own merits rather than as test maintenance.
- How much of Theme B is one fault? Ten specs failing on one assertion type is suggestive but
  not proof; if the panel turns out to be broken in three ways, B is an M that wants splitting.
- Does anything here belong to Phase 36's lazy boundaries after all? The bisect says the rot
  predates it, but it does not rule out Phase 36 having *added* failures on top of the ones
  already there. Worth a diff of the failure list against `ec2c75e` if Theme B resists.
