# Outstanding — deliberately deferred scope

Recorded here when a phase punts on something; pick these up post-MVP.

- **Phase 84 Themes E.6/F.5: the memory numbers.** Both need a packaged-equivalent build
  (`moon run app:build desktop:bundle`) and a real run of `scripts/perf/memory-report.mjs`
  (`--action=terminal` for E's 10-sessions/1-visible number, `--action=browser-tabs` for F's
  8-tabs/1-active number) — the PR that landed the dispose/discard mechanisms itself did not have
  time to produce them. The mechanisms are unit- and e2e-tested (`session-mount-policy.test.ts`,
  `replay-gate.test.ts`, `browser-service.test.ts`); only the recorded-in-`done.md` number is owed.

- **Phase 84 Theme F: per-app discard opt-in, and navigation-history restore.**
  Both were named in the theme's own doc as "if easy, else defer here." Third-party apps
  (`apps-service.ts`, Phase 83) are excluded from the idle-discard sweep by construction — the
  sweep only ever iterates `browser-service.ts`'s own `tabs` map, which apps never enter — so the
  Verification bullet ("a Phase 83 app is never discarded by default") holds with zero code. What
  is genuinely deferred is the *opt-in* half: giving Spotify/Calendar/YouTube the same idle-discard
  treatment the browser's tabs now get, with a per-app switch beside their on/off toggle in
  Settings. `apps-service.ts` has no visibility bookkeeping today (a disabled app is torn down
  outright, not hidden-and-trackable the way a background browser tab is), so this is a real
  feature addition rather than a threshold tweak — sized more like its own small theme than a
  follow-up line. Separately, `discardBrowserTab`'s reactivation is URL-only: pinned Electron 33.4.11's
  `WebContentsView.webContents.navigationHistory` has no `restore()` (only `getAllEntries()`,
  checked directly against `electron.d.ts`), so back/forward history within a discarded tab does not
  survive a discard — cookies, logins and the URL itself do. Worth a second look if a future
  Electron bump adds a restore path.

- **Phase 84 Theme E.4: the rehydrating terminal's fade.** `fitSignal`/`safeFit` already run
  before any replayed scrollback is written, so a revived session is never mis-sized for its
  first live frame — that half of E.4 was already true. What is genuinely deferred is "wears
  Theme K's terminal fade rather than flashing an empty canvas": Theme K's own per-reveal fade
  primitive now exists (`usePanelRevealFade`, `components/use-reveal.ts`, K.4) and is wired onto
  `terminalTween` — but only at the whole-PANEL level (the panel opening, or its maximize/restore
  toggle), the same open/close animation as before plus a replay on a settle that doesn't unmount
  it. A per-SESSION dispose/reveal fade — the specific ask here, for a session revived from
  `session-mount-policy.ts`'s dispose while the panel itself stays open the whole time — is still
  unbuilt: that transcript swap happens inside `terminal-panel.tsx`'s session slots, underneath
  the panel-level tween K.4 touched, and needs its own reveal key (something like the session id
  plus a per-session reveal counter) rather than reusing `terminalTween.settleCount`, which never
  changes for an in-place session swap. Until it lands, a session revived from dispose can still
  show a blank xterm canvas for the length of the scrollback-snapshot round trip (typically
  single-digit milliseconds) before content pops in.

- **Phase 84 Theme K.5: Changes, Projects and Sessions never got the cascade flag.** All three
  were named in the theme's own doc alongside Graph/Actions/Issues/Reviews/Files/Dashboard, all
  five of which landed. Each of the three has a shape the theme's per-list pattern (a shared
  `useCascadeReveal`, keyed on a repo id and — where the view doesn't unmount on its own — a
  reveal counter) doesn't fit directly: **Changes** (`Workbench`)'s file list lives inside
  `status-panel.tsx`, a component this pass never opened, and unlike Actions/Issues/Reviews the
  view itself does not unmount on a repo switch (same "no free ride off a remount" reasoning the
  graph itself needed); **Projects**' default table mode is virtualized
  (`ProjectItemsTable`/`useVirtualizer`, absolutely-positioned rows via `transform`), a materially
  different row-mounting model from every list this pass wired; **Sessions** groups its rows two
  levels deep (a repo group, each with its own `Collapse`d session list), rather than the one flat
  array every wired list has. `view-registry.tsx`'s own comments on each entry carry this same
  reasoning; `view-registry.test.ts`'s cascade set stays exactly `['graph', 'actions', 'reviews',
  'issues', 'files', 'dashboard']` until one of these three is actually wired.

- **Phase 84 Theme K.7's perf number.** "A full cascade settles in ≤ ~400ms; no new infinite
  animation; `idle-cpu.mjs` unchanged" was not measured against a packaged build in this PR — the
  same "needs `moon run app:build desktop:bundle` first" gap Themes E.6/F.5/G.5/H.4 each hit.
  Satisfied by construction in the meantime: every timer Theme K adds is the one self-clearing
  `setTimeout` in `use-cascade-reveal.ts`, sized `(steps + 1) × stepMs + 250ms`, and no
  `setInterval`/`requestAnimationFrame` loop exists anywhere in the new code — `idle-cpu.mjs`
  should read exactly as it did before this theme once a cascade settles, but that has not been
  run and recorded.

- **Phase 84 Theme G.5's number.** "Graph → Files → Graph time-to-first-row before/after; heap of
  the kept-alive Graph at 20k rows" was not measured in the Theme G/H PR. Unlike H.4's `popoutRss`
  (a before/after RSS delta reusing `memory-report.mjs`'s existing launch/CDP-attach shape almost
  verbatim), this needs two things that do not exist yet: a synthetic repo with ≥20k commits
  (`scripts/perf/make-big-repo.sh` builds one, but nothing wires it into a perf script's `--repo`
  yet) and a NEW timing instrument (a `graph-first-batch`-to-visible-row latency, not RSS) plus a
  heap-size read at a specific row count — closer to a new script than a flag on an existing one.
  Left unticked in the phase doc rather than checked without the number, per this repo's own
  "perf claims come with a number" rule.

- **Connect Phase 79's companion voice to its flow.** Themes D/E ([PR #271](https://github.com/bilo-io/midnite-studio/pull/271))
  and F/G ([PR #272](https://github.com/bilo-io/midnite-studio/pull/272)) landed in parallel, so
  three seams between them are connected in shape but not switched on. `voiceInReady()` in
  [`features/companion/runtime.ts`](../../packages/app/src/features/companion/runtime.ts) returns a
  hard `false` — it is the third condition on `autoSend: true`, so until a real speech provider is
  verified end to end, nothing the companion starts can run without a human Return; flipping it is
  a decision that wants a real-machine pass, not a code change. And `HandoffDeps.onMusic` is the
  seam Theme G's audio hangs off; the `music` intent already calls it, so wiring it is one
  assignment. Neither is a bug: each is a default the flow was built to run with, which is what
  let the PRs land in any order.

  **`setCompanionSpeaker(…)` was the third, and it *was* a bug.** Listed here as a harmless
  default, it meant the shipped app never spoke at all — which is the one thing the feature's own
  Settings hint promises. Fixed in the Phase 79 follow-up: `useCompanionSpeakerWiring()` in
  [`register-flow-ports.ts`](../../packages/app/src/features/companion/register-flow-ports.ts)
  hands the flow `companionTtsSpeaker` whenever `companionEnabled && companionSpeakAloud`, live on
  every change, behind a new default-on Settings ▸ Companion ▸ Voice switch. The lesson for the
  next parallel fan-out is that "two seams that fit and were never joined" reads exactly like a
  deliberate default in a doc like this one.

- **Tick the phase docs that landed without being ticked.** Three docs assert far less progress than
  the tree does, and the doc — not `_INDEX.md` — is the accurate record in each case (Phase 69 reconciled
  the index to match each doc's actual box state). Phase 25 has 39 of 101 boxes ticked while `search.ts`,
  `grep.ts`, `blame.ts`, `grep-parser.ts`, `blame-parser.ts`, `stream-registry.ts`, `search-service.ts`
  and `search-view.tsx` all exist; Themes D and E even carry a `✅ DONE` stamp above unticked items.
  Phase 32 has 54 unticked deliverables (Themes E, F, H, I) and Phase 33 has 44 (Themes A–E) with
  `entitlements.mac.plist`, `notarize.cjs`, `verify-dist.mjs` and the `dmg:`/`protocols:` blocks all present in
  `electron-builder.yml`. The fix is per-item verification against the tree, not a bulk tick —
  which is why it is parked here rather than done in passing. The structural bugs (Phase 32's duplicate
  Themes H/I and Phase 33's `◐` stamps) were resolved in Phase 69 Theme B; the remaining work is verifying
  the unticked items against the codebase.
  *(Phase 25's own unreadability is fixed: it held four raw NUL bytes where `\0` was meant, which
  made every grep-based counter see an empty file. It is UTF-8 text again as of 2026-09-04.)*

- **Five persisted preferences with no settings page.** Found by [Phase 63](phases/phase-63-settings-diff-and-orphan-preferences.md)'s
  x1 refinement, which ran the orphan audit rather than leaving it to Theme C: of `PersistedUi`'s 71
  keys, 34 are named nowhere under `features/settings/`, and 9 of those 34 are genuine preferences.
  Four are Phase 63's own. These five are not, and Phase 63 deliberately does **not** build them —
  its Decision 6 fixes orphans only when there are fewer than three:
  - `browserLayout` → the **browser** page. A three-way Full / Split-left / Split-right control for
    the layout the browser pane opens with.
  - `loopChoices`, `loopAgents`, `loopModels`, `loopSchedules` → the **agent** page, inside the
    `Accordion title="Loops"` that already holds their sibling `loopModifierDefaults`
    (`settings-pages/agent-page.tsx:70`). Per loop: a radio group per declared choice, a roster-agent
    select, a model select paired in the same row, and a working-window picker.

  These four `loop*` keys are one coherent block — a "Loops" settings section — not four separate
  chores, and `loopSchedules`' own store comment already calls it *"a standing preference, not a
  property of one run"*. Until they are built they sit in `persisted-keys.ts`'s `KNOWN_ORPHANS`
  allow-list, which (along with the entry below) is what keeps `persisted-keys.test.ts` green;
  building one means deleting its entry from the list, not widening it.

  A fifth joined this block ad hoc: `loopEnabled` (the FAB tab bar's own "Loop" switch, per loop —
  off by default, recolours that tab and its shimmer white while on). It has a real control already,
  just not one under `features/settings/` — the FAB panel is not a settings page — so it sits in
  `KNOWN_ORPHANS` on the same reasoning as its four siblings and would move into the same Loops
  accordion, as a per-loop switch mirroring the tab bar's, whenever that accordion is built.

- **Five more persisted preferences with no settings page — `editor*`.** Landed by
  [Phase 64](phases/phase-64-offline-monaco-and-themes.md) (`#164`, merged onto `main` while Phase
  63 was in flight): `editorFontFamily`, `editorFontSize`, `editorMinimap`, `editorTabSize`,
  `editorWordWrap` in `ui-store.ts`, created for the Monaco editor but never given a settings page —
  Phase 64's own Theme F (still open) covers the palette override selectors, not these five. Sits in
  `persisted-keys.ts`'s `KNOWN_ORPHANS` allow-list beside the five above, added there by Phase 63's
  PR #167 only so its own exhaustiveness test would not fail on a gap this phase never touched.
  Wants a home in `terminal-page.tsx`'s shape — an "Editor" settings page, or an accordion on
  whichever page ends up owning the Monaco surface.

- **Interactive rebase** — via a `GIT_SEQUENCE_EDITOR` helper binary that writes the UI's todo
  list; `GIT_EDITOR` for reword. Impossible with libgit2/isomorphic-git; CLI-only trick.
- ~~**Proper diff viewer**~~ — ✅ landed in Phase 12 Theme D: parsed hunks over IPC, one shared
  `<DiffView>`, restrained tinting with intraline word marking, virtualised rows. One piece
  deliberately left out of it, now also landed:
  - ~~**Side-by-side diff**~~ — ✅ landed in
    [Phase 26](phases/phase-26-side-by-side-diffs.md): a `diffLayout: 'unified' | 'split'` toggle
    over the same `<DiffView>`, not a forked renderer — the "full-width diff surface" this waited
    on turned out to be Phase 17's workbench tabs, already built for something else.
- **Stash** — list/apply/pop/drop + a graph affordance.
- **Force-push** — only ever `--force-with-lease`, behind blast-radius confirm gating. No force
  push exists anywhere in the MVP.
- **Auto-updater** — crib midnite's `updater.ts`/`update-state.ts`/`feed-channel.ts`. The
  `zip` target is already built, so the remaining work is a `publish:` block in
  `electron-builder.yml` plus a check on boot. Two gotchas:
  - Use the **named** import `import { autoUpdater } from 'electron-updater'`. The default import
    is `undefined` under `module: commonjs` and crashes main at boot.
  - electron-updater cannot install across **unsigned** builds. Real Developer ID signing is a
    prerequisite, not a follow-up — the current build is ad-hoc signed so it merely launches.
- **Interval-tree edge culling** in the graph — only if profiling shows edge rendering as the
  bottleneck on very large repos (see pvigier's benchmarks: ~180x on the naive path).
- **Finish the `lucide-react` → `react-icons` move.** react-icons became the source for new
  icons when the nav rail switched to it; 13 renderer files still import `lucide-react`, and
  both packages ship. Every glyph the app uses exists in `react-icons/lu` under a `Lu` prefix
  (`GitBranch` → `LuGitBranch`), so the migration is a mechanical rename plus dropping the
  `lucide-react` dependency — worth doing in one pass rather than drifting file by file.
  Nothing is broken meanwhile: the shared structural `IconComponent` accepts both families.
- ~~**Branch checks (the RAG dot's real source).**~~ — ✅ landed in Phase 17 Theme F, by the
  route this entry predicted: the last GitHub Actions conclusion for the branch's head commit,
  read through `gh`. `checksVerdict()` in
  `packages/app/src/features/repos/checks-verdict.ts` produces the `ChecksVerdict` that
  `branchHealth()` had accepted since Phase 13 with no supplier — matched on **sha** rather
  than branch name (a green tick sourced from the previous tip is the exact failure that
  teaches people to distrust the dot), newest run per workflow, and an all-skipped set
  reported as `unknown` rather than green. The rate-limit concern this entry raised is
  answered by never fetching for the dot: the sidebar reads the Actions query with
  `enabled: false`, so a branch is coloured only when the user has already opened that repo's
  Actions section, and shows nothing otherwise. The **local test run** producer
  (`moon run :test` per branch, cached by tip sha) is still unbuilt.

- ~~**Nothing runs `app:e2e` automatically.**~~ — ✅ landed 2026-09-02, by the route this entry
  predicted: its own **blocking** job in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml),
  on every PR alongside `gate`. It runs on **ubuntu**, not the macOS the gate needs — the suite
  drives the renderer in headless chromium against a mocked `window.midniteStudio`, so nothing
  in it is macOS-specific and the runner bills at 1x instead of 10x — sharded four ways, because
  a private repo's runner is 2-core and Playwright takes one worker on it: unsharded the job took
  **21m30s** against 3m0s locally, and four shards bring that to ~6 min.

  It blocks on a **ratchet** ([`playwright.ci.config.ts`](../../packages/app/playwright.ci.config.ts)):
  the suite had 45 failures across 17 of 58 files when it was first run in full, so CI blocks on
  the green majority and [Phase 38](phases/phase-38-e2e-suite-repair.md) empties the list.
  Blocking on everything was impossible with the suite red; blocking on nothing is the
  arrangement that produced the rot in the first place.

  **Two things the wiring-up taught, worth keeping.** A shard that looked hung at 22 minutes was
  not hung — nine `palette.spec.ts` specs pressed a hard-coded `Meta+k`, which does nothing on
  Linux because `Mod` is Ctrl there, and each failure cost three attempts at a 60s timeout. They
  now press `ControlOrMeta`. And the job carries `timeout-minutes: 20`, because without it a job
  inherits GitHub's **6-hour** default — a blocking job that can hold a runner all day is worse
  than no job at all.

  Four specs stay ratcheted for a reason that is **not** drift: they are green on macOS and red
  only on Linux, because xterm paints through `@xterm/addon-webgl` and a GPU-less runner has no
  context to give it. A 15s timeout moved nothing and SwiftShader fixed none of them while
  costing 60% more runtime; both were reverted. Phase 38 Theme I owns the real answer.

- **Screenshot PNGs are not byte-reproducible.** A full `app:e2e` run rewrites roughly forty
  committed images across every phase, and two identical runs of the same spec differ by ten or
  twenty bytes — so `git status` after a suite run says nothing about whether a screenshot's
  *content* changed. The practical rule is to commit only the shots belonging to the slice in hand
  and `git checkout --` the rest. Fixing it properly means a deterministic encode (or comparing
  decoded pixels rather than file bytes) before the shots specs write.

- **Submodules** — status/graph awareness.
- **Windows/Linux targets** — packaging is macOS arm64 first; keybindings already use Ctrl+`
  everywhere so no rebind needed.

- **Windows / Linux packaging.** `electron-builder.yml` targets macOS arm64 only. An Intel or
  Windows build needs node-pty rebuilt on a matching runner, and `windowFrameless()` returns false
  off darwin so those platforms keep their native title bar (which `<TitleBar>` already handles by
  rendering nothing).
- **A real `.gitignore`-aware watch filter.** `isNoise` uses a fixed directory list. Parsing
  gitignore per event would cost more than the refetch it saves, but a repo with an unusual build
  directory will see extra `git status` calls.
- **`load more` beyond the 50,000-commit cap.** The log stream reports `truncated` and the footer
  says so, but there is no control to extend the window yet.
- **Launcher entries — "Open in Antigravity", "Open in VS Code", …** Deferred out of Phase 21 by
  choice, once Antigravity turned out to ship a real terminal agent (`agy`) and the phase no longer
  needed the concept to carry it. Opening an application in its own window is a different feature
  from starting an agent in a pty: it belongs on the repo/worktree context menus Phase 17 built
  rather than in the terminal's `+` menu, it has no place in the agent process probe or the activity
  indicator, and it wants a per-editor "is it installed, and where" resolution of its own
  (`antigravity-ide` lives inside `Antigravity IDE.app/Contents/Resources/app/bin/` and is not on
  `PATH`). Phase 21's `AgentDefinition` deliberately has no `mode` field for it to reuse — that
  field should be designed by the slice that actually needs it.

## MCP repository writes are still deferred; UI steering is not (Phase 57 Decision 5, Phase 81 Theme F)

[Phase 57](phases/phase-57-mcp-server.md) Decision 5 deferred `stage`/`commit`/`branch.create` as
MCP tools pending "a consent model", on the grounds that *"an agent committed something while I
wasn't looking is a trust failure that would poison the feature"*. **That deferral still stands.**

[Phase 81](phases/phase-81-where-the-companion-can-take-you.md) Theme F did not lift it. It shipped
the consent model at a deliberately smaller scale — three `ui.*` tools that steer the window
(`ui.state`, `ui.navigate`, `ui.command`) behind a default-off `Settings ▸ MCP ▸ Let agents steer
the UI` switch, with the command-tier check running in the renderer that owns `COMMAND_ACCESS`,
`confirm`- and `never`-tier commands refused outright, nothing acting while the screen is locked,
and a toast on every steer so it is never silent. Steering the view is a categorically smaller
hazard than committing: nothing leaves the window, every step is visible, and one keystroke undoes
it. `McpToolEntry.readOnly` widened from the literal `true` to `boolean` to carry the distinction.

So the open question is narrower than it was, not answered: **whether the same switch-plus-tier
shape is sufficient consent for a write that touches the repository**, where "one keystroke undoes
it" stops being true.

> **Note on Theme F's own last checklist item, which cannot be executed as written.** It asks that
> *"`docs/INITIAL_PLAN.md`'s MCP section … gain one paragraph"* and that *"`outstanding.md`'s note
> that MCP writes are deferred is amended"*. Neither exists. `INITIAL_PLAN.md` is the frozen
> MVP-era design doc — it has no MCP section and does not mention the companion at all, because
> MCP arrived in Phase 57 and the companion in Phases 79-81, both long after it was written; adding
> a Phase 81 paragraph to it would misrepresent it as a living document. And `outstanding.md` never
> carried a deferred-writes note to amend. This section is that note, written fresh. The Settings ▸
> MCP page copy half of the item *was* delivered, in `mcp-page.tsx`'s hint text.

## xterm throws on unmount under the dev server

`Viewport.syncScrollArea` reads `dimensions` off a renderer the terminal has already disposed,
so every `term.dispose()` can leave one queued callback firing against nothing:

```
TypeError: Cannot read properties of undefined (reading 'dimensions')
    at get dimensions (@xterm/xterm)
    at Viewport.syncScrollArea (@xterm/xterm)
```

Upstream, inside `@xterm/xterm`'s own teardown — not the WebGL addon, which was the first guess
and disposing it first changes nothing. Reachable only through StrictMode's mount → unmount →
mount, so it fires for every pane opened under `moon run desktop:start` and never in a packaged
build. Harmless beyond the console noise, and worth revisiting on the next xterm bump rather than
worked around from outside the library.

## ~60 KB of `lucide-react` ships via `@bilo-io/ui` and `@bilo-io/shell` (Phase 36 Theme C)

Phase 36 Theme D moved all 54 of the renderer's own importers off `lucide-react`, dropped the
dependency, and put an eslint `no-restricted-imports` guard in the way of its return. The
package is nonetheless still in the entry chunk — v1.34.0, imported by `@bilo-io/ui` and
`@bilo-io/shell`, and `app.tsx` pulls `AppFrame`/`ShellProviders`/`TitleBar` out of `shell`
eagerly, so it lands on the boot path.

Nothing in this repo can fix that: it is a third-party import, and the icons it draws are the
shell's own chrome. It is recorded here rather than asserted against, because a bundle-level
"no lucide in the entry" check could only ever fail. Two ways out, both upstream of us: those
packages could move to `react-icons/lu` (the identical Lucide set, which is what this repo now
uses), or expose their icon set as a peer so a consumer already carrying `react-icons` does not
pay for a second copy. Worth raising the next time either package is touched.

Also deferred with it, and separable: **the `@dnd-kit` entry-chunk split**, acquitted at 59.9 KB
in Phase 36 Theme C. The mechanism it would need — render-prop wiring components swapping an
inert implementation for the real one across four eager hook call sites — is written up in the
phase doc's Decisions section, so picking it up later is a matter of doing it, not re-deriving it.

## `lock-screen.tsx` is a dialog that neither traps nor stacks (Phase 68 Theme D)

Phase 68 Theme D swept the role-less overlays and fixed the ones that were plain omissions —
`onboarding-modal.tsx` and `rebase-modal.tsx` got role + `aria-modal` + label + trap,
`help-overlay.tsx` and `multi-select-menu.tsx` got the missing trap. `fab-panel.tsx` and
`screensaver.tsx` were ruled *not modals* (a dismissible panel over live chrome; no interactive
content), and `graph-row.tsx:525`'s overflow popover wants converting to `Popover`, which is a
refactor rather than an aria patch.

[`lock-screen.tsx`](../../packages/app/src/features/screensaver/lock-screen.tsx) is the one real
gap left. It declares `role="dialog"` and carries an `aria-label`, but has **no `aria-modal` and
no focus trap** — so Tab walks straight out of the lock screen into the application it exists to
lock. It is not a one-line `useFocusTrap` call, which is why it was deferred rather than fixed in
passing: it stacks a **nested `role="dialog"`** from
[`passcode-pad.tsx`](../../packages/app/src/features/screensaver/passcode-pad.tsx), so the
question is which of the two owns the trap and what the outer one does while the inner is up.
That is a stacking decision about the screen-lock surface, and it belongs with the screen-lock
work — alongside `passcode-pad`'s raw `z-[110]`, which
[Phase 62](phases/phase-62-one-escape-one-dismissal.md) parked for the same reason.

## Pre-request scripts are editable but never run (Phase 70 Themes B, C)

Theme B ships a **Pre-request Script** editor beside the Tests editor in the
builder's Scripts tab, and Theme B's `runScript` can execute either. But nothing
in the app ever invokes one: Phase 66's send path does not, and Theme C's runner
deliberately does not — the phase doc's own checklist item reads
"`sendApiRequest` then `runScript` per request", which is the Tests script by
position, and the runner matched the existing precedent rather than inventing a
call site the doc never asked for.

So the UI accepts input that nothing consumes. That is a real gap, not a bug in
either theme: wiring it means deciding *when* a pre-request script runs relative
to `{{var}}` interpolation, and whether its `pm.environment.set` mutations must be
visible to the very request that follows it in the same tick — a design question
neither theme's scope covers. Worth its own slice.

## Popover dismisses itself on a mouse click on the environment switcher (Phase 70)

Found while writing Theme E's specs, and documented in
`api-client-environments.spec.ts`'s header rather than patched.

A plain mouse `.click()` on the Environment Switcher's "Select environment" trigger
opens and then immediately closes the popover within the same tick.
`components/popover.tsx`'s capture-phase scroll-dismiss listener fires on a benign
scroll — traced to a `@bilo-io/shell` nav-rail container — that a mouse click on
this particular trigger reliably provokes. Keyboard activation (`focus()` then
`Enter`) does not trigger it, so the specs drive it that way; that is a legitimate
interaction, not a test workaround, but the mouse path is a real defect a user would
hit. Not fixed here because a verification theme changing product behaviour to make
its own assertion pass would measure nothing.

## Phase 75's remaining verification (perf + human-only)

All eight lettered themes (A–H) landed — [PR #204](https://github.com/bilo-io/midnite-studio/pull/204),
[#206](https://github.com/bilo-io/midnite-studio/pull/206), [#207](https://github.com/bilo-io/midnite-studio/pull/207),
[#208](https://github.com/bilo-io/midnite-studio/pull/208), [#205](https://github.com/bilo-io/midnite-studio/pull/205),
[#210](https://github.com/bilo-io/midnite-studio/pull/210), [#215](https://github.com/bilo-io/midnite-studio/pull/215),
[#216](https://github.com/bilo-io/midnite-studio/pull/216). The phase doc's own unit/RTL "Verification"
checkboxes were reconciled against the tree 2026-09-07 (`forge-graph.test.ts` and `gh-project.test.ts`
already cover every case cited; both suites pass — 33 and 25 tests respectively) — they were landed
work left unticked, not missing work. Seven items in the phase doc genuinely remain open, none of
them a lettered theme:

- `moon run app:build desktop:bundle && node scripts/perf/bundle-report.mjs` — confirm the entry
  chunk is unmoved by this phase (no new dependency was added, so this should be a formality, but
  wants a real packaged-equivalent run to say so).
- `node scripts/perf/idle-cpu.mjs --blurred` on a board with running agents and a 200-node graph
  open — confirm the blurred figure matches a closed graph.
- Four **human-only** product checks: a real GitHub board using the dependency feature (edges match
  GitHub's own issue pages, both directions, including a cross-repo blocker); a real board using
  none of the three sources (the zero-edge copy reads as "nothing to draw yet"); starting an agent
  from a node's composer (the board card lights with the same ramp at the same time, and stopping it
  clears both); the running node's ring/bloom at 0.5 zoom reading as the same treatment the card
  wears at 1× (the phase's one visual requirement no assertion can judge).

Closed as ✅ DONE in `_INDEX.md` rather than left `🔄 WIP` forever on items no agent can complete —
matching the precedent set by Phases 22/23/24.

- **Phase 84 Themes B/C — four items scoped down rather than silently skipped.**
  - **B.4's `settingsSync` snapshot carries only `autoFetchEnabled`/`autoFetchIntervalMs`**, not
    Theme F's browser-discard threshold or Theme E's terminal keep-recent count the phase doc's own
    B.4 text names alongside them. Neither theme has landed the main-side consumer that would read
    those fields yet — `SettingsSyncPayloadSchema`
    ([`packages/shared/src/domain/sync-status.ts`](../../packages/shared/src/domain/sync-status.ts))
    grows to carry them when Themes E/F land their own main-side timers/services.
  - **C.4's rate-limit handling backs off on any repeated failure** (including one whose message
    names a rate limit — `looksRateLimited` in
    [`forge-poller.ts`](../../packages/desktop/src/main/forge/forge-poller.ts)), but does not read a
    numeric `x-ratelimit-remaining`/`reset` pair the way the phase doc's C.4 text describes. `gh run
    list`/`gh pr list`/`gh issue list`/`gh project list` are wrapped CLI subcommands, not `gh api` —
    they do not surface HTTP response headers at all. Getting the real numbers would mean polling
    `gh api rate_limit` alongside every listing (an extra subprocess per tick, on top of the listing
    itself), which is a real design decision, not a one-line fix — parked here rather than either
    building it unasked or silently checking the box.
  - **C.2's "through the existing `gh-cli.ts`/`gh-graphql.ts` list calls and `gh-cache.ts`"** doesn't
    quite match the tree: `gh-graphql.ts` serves only PR review threads (irrelevant to the
    runs/pulls/issues/projects listings the poller hashes), and `gh-cache.ts` does not exist as a
    separate module at all — `gh-cache.test.ts` tests caching (`remember`/LRU) that lives inline in
    `gh-cli.ts`, and only for `runDetail`/`runLog`/`listWorkflows`, none of which the poller calls.
    The poller instead calls the same `listRuns`/`listPulls`/`listIssues`
    (`gh-cli.ts`)/`listProjects` (`gh-project.ts`) the renderer's own `queries.ts` already uses — the
    doc's own module names were slightly ahead of what actually exists in this area, in the sense
    CLAUDE.md's "phase docs cite stale line numbers" note already warns about.
  - **The liveness dot's "amber because the last window is minimized" reason is not built.** Themes
    B.2/C.3 both deliberately push nothing while merely paused (gate closed, no error) — a
    `syncStatus` event only fires on an actual failure, recovery, or backoff-window change — so there
    is no signal on the wire main could use to tell the renderer "paused, not failing" without
    inventing a second, differently-shaped push neither theme's own spec calls for. The dot's amber
    states that *are* built (no repo, no event yet, a backed-off fetch/forge source with a reason and
    a "retrying in Xm" detail) all come from signals the themes already produce; "paused because
    minimized" would need main to actively report an idle/hidden state change, which is a real (if
    small) design decision for whichever future work picks it up, not a wiring gap.
