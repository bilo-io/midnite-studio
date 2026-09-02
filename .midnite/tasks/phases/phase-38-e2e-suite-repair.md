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

### A — The pty seam (M)

**Do this first.** Seven of the 45 — every `fab-loops` failure and both `terminal-links` ones —
fail with the same shape: `pty:activity was not delivered to pty-1`, `pty:exit was not
delivered to pty-1`, `the URL was not delivered to pty-1`. Two unrelated features failing
identically is one fault in the mock bridge's pty event delivery, not nine bugs, and the other
themes are much easier to read once it is gone.

- [ ] Diagnose the delivery failure in
      [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts): whether the listener is
      registered after the event fires, whether the session id the spec addresses (`pty-1`)
      still matches what the app allocates, or whether the subscription moved when terminal
      sessions were reworked. Record the answer in the fix's commit message — the other themes
      may share it.
- [ ] `fab-loops.spec.ts:157` — a waiting loop turns its tab dot and the FAB dot amber.
- [ ] `fab-loops.spec.ts:240` — a loop that exits on its own flips Stop back to Start, and
      history says exited (`pty:exit`, not `pty:activity` — confirm both paths are covered).
- [ ] `fab-loops.spec.ts:359` — the waiting notice is debounced by transition, not by time.
- [ ] `fab-loops.spec.ts:416` — `data-motion='reduced'` also stops the thinking pulse.
- [ ] `fab-loops.spec.ts:512` — a `fabSessions` entry whose session is gone reads as idle
      (`toHaveLength` — a different assertion, so check it is really the same root cause and
      not a passenger).
- [ ] `terminal-links.spec.ts:66` — Cmd+click opens a URL in the output; a bare click does not.
- [ ] `terminal-links.spec.ts:90` — leaves output that is not a link alone.
- [ ] Drop `fab-loops.spec.ts` and `terminal-links.spec.ts` from `KNOWN_RED`.

### B — The changes panel (M)

The largest single cluster: **all ten** `changes-panel` specs fail, every one on
`expect(locator).toBeVisible()`. A whole file failing on one assertion type means the panel
never reaches the state the fixture sets up — one fault, ten symptoms. `diff-view` joins this
theme because both of its failures are `toHaveCount` against the same diff surface.

- [ ] Find the single reason nothing in the panel is visible — most likely the fixture no
      longer produces a selected checkout, or the panel's container moved behind a lazy
      boundary the spec does not await. Fix that before touching any individual assertion.
- [ ] `changes-panel.spec.ts:96` + `:108` — panel totals count a two-sided file once; a row
      shows the counts for the side it is listed on.
- [ ] `changes-panel.spec.ts:119` + `:135` + `:155` — list ordering and full paths, tree
      grouping with collapsed totals, and the tree ⇄ list choice surviving a reload.
- [ ] `changes-panel.spec.ts:170` + `:216` — staging buttons act on their own row; picking a
      file switches the pane back to its single diff and back again.
- [ ] `changes-panel.spec.ts:239` + `:251` + `:278` — the commit button appearing only once a
      message is typed, toolbar buttons surviving very wide totals text, and the textarea
      growing then shrinking back after committing.
- [ ] `diff-view.spec.ts:63` + `:81` — the old line-number column off by default and toggling
      on, and side-by-side switching layout. Both `toHaveCount`: establish whether the expected
      count changed by design (Phase 26 territory) or the rendering broke.
- [ ] Drop `changes-panel.spec.ts` and `diff-view.spec.ts` from `KNOWN_RED`.

### C — The workbench and the rail (M)

`repos-workbench` fails five different ways and `nav-shell` two, and unlike A and B these look
genuinely independent — including two that are strong candidates for *real* product bugs.

- [ ] `nav-shell.spec.ts:103` — "the rail carries all eight views, Dashboard ungrouped above
      the rest" fails on `toEqual` deep equality. The rail's contents are asserted exactly, so
      this says a view was added, removed or reordered without the spec being told. Decide
      which is correct and make the spec the record of it.
- [ ] `nav-shell.spec.ts:251` — switching views keeps the checkout you were looking at
      (`not.toHaveProperty`). If the checkout is genuinely being dropped on a view switch,
      **that is a product bug and takes priority over the spec.**
- [ ] `repos-workbench.spec.ts:136` — a change count lands on the checkout that owns it, not
      the repo (`toHaveCount`).
- [ ] `repos-workbench.spec.ts:201` — removing a worktree asks first, in danger colours, naming
      what is at stake (`toBeFocused`). A destructive-confirm dialog that no longer takes focus
      is an accessibility regression, not a stale selector — check the dialog, not the spec.
- [ ] `repos-workbench.spec.ts:394` — a signed-out `gh` says what to run rather than failing
      silently.
- [ ] `repos-workbench.spec.ts:468` — a folded repo hangs its branch and count off the trailing
      edge.
- [ ] `repos-workbench.spec.ts:502` — commit message input has equal inset on all sides when
      empty (`toBeLessThanOrEqual`, i.e. a measured-pixel assertion — confirm it is not simply
      brittle before changing the number).
- [ ] Drop `repos-workbench.spec.ts` and `nav-shell.spec.ts` from `KNOWN_RED`.

### D — The terminal panel (S)

Two specs, both about state that has to survive something. Kept separate from Theme A: these
fail on their own assertions rather than on pty delivery, so they may well outlive A's fix —
but re-run them after A lands before spending any time here.

- [ ] `terminal.spec.ts:972` — a reload keeps live sessions live (`toEqual` deep equality).
- [ ] `terminal.spec.ts:1073` — the session list resizes independently of the terminal pane
      (`toBeGreaterThan`).
- [ ] Drop `terminal.spec.ts` from `KNOWN_RED`.

### E — Settings, files and tests (S)

- [ ] `settings-pages.spec.ts:113` — **fix this one first**: it fails on a strict-mode
      violation, `getByRole('navigation', {name: 'Settings pages'}).getByRole('button', {name:
      'System'})` resolving to two elements — the "System" category header and the "System
      Health" page button. That is an ambiguity a screen-reader user hits too, so prefer
      disambiguating the accessible names in the product over `exact: true` in the spec.
- [ ] `settings-pages.spec.ts:75` — the pages are grouped under collapsible category headers.
- [ ] `settings-pages.spec.ts:281` — the Agent page shows the version card and browses
      `~/.claude`.
- [ ] `files-write.spec.ts:204` — the Agent settings page's claude-home tree offers no context
      menu at all. Shares a surface with the previous item; do them together.
- [ ] `tests-view.spec.ts:56` — the sidebar Tests section groups discovered suites by kind.
      Times out clicking the `Tests` button, so the section is not rendering at all.
- [ ] Drop `settings-pages.spec.ts`, `files-write.spec.ts` and `tests-view.spec.ts` from
      `KNOWN_RED`.

### F — The forge surfaces (M)

Seven specs across four files, all on PR/Actions/review surfaces. Four of them time out rather
than assert, which usually means a query that never resolves against the mocked bridge.

- [ ] `actions-view.spec.ts:258` + `:388` — both time out waiting to click **"Load the full
      log"**, so the truncation banner's button is not being rendered. One fix, two specs.
- [ ] `review-threads-shots.spec.ts:247` + `:260` + `:272` — threads light, composer open on a
      line, outdated group expanded. All three time out; these write committed screenshots, so
      expect PNG churn and commit only the shots this theme actually changes.
- [ ] `reviews-loading-shots.spec.ts:176` — a pull request opening with nothing cached
      (`toBeAttached`). Adjacent to the previous item and probably the same loading path.
- [ ] `forge-issues.spec.ts:111` — a failed listing is a different empty from an empty listing.
      A distinction worth keeping: check the product still draws two different empties before
      assuming the spec is stale.
- [ ] Drop `actions-view.spec.ts`, `review-threads-shots.spec.ts`,
      `reviews-loading-shots.spec.ts` and `forge-issues.spec.ts` from `KNOWN_RED`.

### G — Monitor, graph and the browser pane (S)

The five stragglers, unrelated to each other; batched so they do not each need a slice.

- [ ] `footer-monitor.spec.ts:52` — disk is drawn as a ring, because capacity does not move.
- [ ] `footer-monitor.spec.ts:221` — a cadence change is marked on the chart rather than
      silently compressed.
- [ ] `graph-themes.spec.ts:264` — the cascade settles once, then never replays on scroll or
      row recycling. Phase 36 Theme B touched graph rendering; check that first.
- [ ] `graph-themes.spec.ts:479` — each style redraws the graph and persists (times out).
- [ ] `browser-pane.spec.ts:129` — closing the pane restores clicks to the content beneath it
      immediately, not after the exit transition. Fails on a deliberate `Timeout 150ms`, so the
      spec is asserting *speed*: if the click now lands late, the pointer-events fix it guards
      has regressed.
- [ ] Drop `footer-monitor.spec.ts`, `graph-themes.spec.ts` and `browser-pane.spec.ts` from
      `KNOWN_RED`.

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

### I — The terminal does not render on the CI runner (M)

Discovered while wiring the job up, and different in kind from every theme above:
these four specs are **green on macOS and red only on Linux**, so they are not drift. Each
one mounts a terminal, and xterm paints its rows through `@xterm/addon-webgl`
([`terminal-view.tsx:363`](../../../packages/app/src/features/terminal/terminal-view.tsx)) — a
GPU-less runner has no WebGL context to give it, so the terminal never becomes visible.

Two fixes were tried and measured before the specs were ratcheted, so nobody repeats them:
raising CI's `expect` timeout to 15s **moved nothing** (the failures were never slow, they were
impossible), and Chromium's SwiftShader software rasteriser
(`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) **also fixed none of
them** while making every shard about 60% slower — 7.6 min to 12.1 min — so it was reverted.

- [ ] Establish what SwiftShader actually gave the page — whether `WebglAddon` still threw,
      whether it fell back, or whether the terminal failed for a second reason entirely that the
      missing context was masking. The two negative results above say the obvious answer is
      wrong, so start by reading the addon's own failure rather than guessing again.
- [ ] Decide the fix: a DOM-renderer fallback under test (cheap, but then the specs no longer
      exercise the renderer the app ships), a canvas-addon fallback, a GPU-enabled runner, or
      moving just these specs to a macOS lane. Each has a real cost — pick deliberately and
      write down why.
- [ ] `phase-21-roster.spec.ts:49` — the session list renders 0 rows. Also worth asking whether
      this spec belongs behind the `MSTUDIO_SHOTS` guard the other screenshot specs use: it
      writes two committed PNGs, which is not something a Linux runner should be doing.
- [ ] `terminal-lazy-preload.spec.ts:73` + `:101` — Phase 36's own specs for the lazy xterm
      chunk. Losing these to the ratchet means the phase's headline optimisation is unguarded
      in CI, which makes this the highest-value item in the theme.
- [ ] `terminal-reveal.spec.ts:45` — revealing a live session replays its buffer with one
      resize.
- [ ] `reviews.spec.ts:400` — the terminal header under a squeezed detail pane. This one is
      **tagged `@linux-red` rather than ignored**, because it is the only terminal spec in a
      ten-spec file; drop the tag rather than editing `KNOWN_RED`.
- [ ] Drop `phase-21-roster.spec.ts`, `terminal-lazy-preload.spec.ts` and
      `terminal-reveal.spec.ts` from `KNOWN_RED`, and remove `grepInvert` from
      `playwright.ci.config.ts` once no `@linux-red` tag remains.

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
