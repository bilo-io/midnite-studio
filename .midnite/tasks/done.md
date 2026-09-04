# Done — append-only log

<!-- Append one entry per landed phase/PR: date, phase, PR link, one-line summary. -->

## 2026-09-04 — Phase 54 Theme E — The filter toolbar, extracted rather than copied

[PR #130]. Closes out Phase 54's build entirely — every theme (A-G) is now landed, two
Verification bullets left as a human pass against a real repo.

- [x] `filter.ts`'s `filterItems`/`deriveAssigneeCounts`/`deriveLabelCounts` generalised over a
      `select: T => FilterableItem` accessor. **Correction from the doc's draft**: `T extends
      FilterableItem` directly doesn't work — `ForgeProjectItem`'s filterable fields live under a
      discriminated `.content` union, not the item's own top level, so there's no flat shape for
      `T` to structurally satisfy without every caller reshaping its whole array first.
- [x] The ProjectV2-specific `types` facet dropped from the shared `ItemFilterState`;
      `ProjectItemFilterState` extends it for Projects' own use, and `filterProjectItems` applies
      `types` before handing off to the generic primitive.
- [x] `ProjectsToolbar` lifted out of `projects-view.tsx` into `components/item-filter-toolbar.tsx`
      — the search box and assignee/label/state `MultiSelectMenu`s unchanged; Projects' own `types`
      menu and Board's group-by `<select>` render as `children` rather than the shared component
      growing caller-specific facets.
- [x] **Not wired into `IssuesView` in this phase** — the checklist proves genericity via tests
      (a plain issue-shaped record, no `ForgeProjectItem` anywhere), which is what the doc's own
      Verification and Files-touched sections actually asked of this theme. A future theme wires
      it in live.
- [x] Tests: `filter.test.ts`'s pre-existing cases pass (renamed to call `filterProjectItems`),
      plus new cases proving the generic primitives work over `MinimalIssue`, a record with no
      `ForgeProjectItem` shape at all. `projects-view.test.tsx` (12 cases) and the projects/kanban
      e2e specs pass unchanged. Self-review caught two unused wrappers
      (`deriveProjectAssigneeCounts`/`deriveProjectLabelCounts`) introduced then never called in
      production — removed. `moon run :typecheck :lint :test` green (234 files / 2135 tests).
- [x] A screenshot alongside Phase 52's own `p52-1-table-toolbar.png` shows the Projects toolbar
      rendering identically after the extraction.

## 2026-09-04 — Phase 54 Themes F+G — Add to project, and the two issue writes

[PR #128]. Closes a deferral three phases old ([Phase 50 Theme E](phases/phase-50-kanban-projects-followthrough.md)
shipped "Add to project ▸" for pull requests only, explicitly blocked on an Issues surface to
attach it to) and gives the Issues view a write surface — comment, and close/reopen, and only
those two.

- [x] **Theme F** — `IssueActionBar`'s "Add to project ▸" reuses `useAddProjectItem()` and the
      board picker `ReviewActionBar` already built, with no changes to either. Requires the node
      `id` Theme A put on `ForgeIssueSchema` ahead of needing it.
- [x] **Theme G** — Two new writes and only two: `forgeIssueComment`/`forgeIssueSetState`
      channels, `gh-write.ts`'s `issueCommentCommand`/`issueSetStateCommand` (plain `gh issue
      comment`/`close`/`reopen` subcommands, not `gh-project-write.ts`'s `--input -` JSON pattern
      the doc's draft named — corrected once written). Comment invalidates the conversation only;
      close/reopen invalidates the detail *and* the list prefix, since the header's state pill
      reads the `issue` prop sourced from the list.
- [x] Both gated on the existing `forgeWritesEnabled` switch — no new gate — which meant fixing
      the Reviews settings page's own "it never writes to issues" claim, now false.
- [x] Updated [Phase 50](phases/phase-50-kanban-projects-followthrough.md)'s Theme E entry and
      [Phase 52](phases/phase-52-projects-navigation.md)'s deferral note to record the blocker is
      gone, rather than leaving two docs asserting a limitation that no longer holds.
- [x] Tests: `issue-action-bar.test.tsx` (8 cases — the gate, comment success/refusal/empty-body,
      close, reopen, both Add-to-project cases), `gh-write.test.ts` (command construction),
      `ipc.test.ts`'s whole-index forge-channel guard extended. `moon run :typecheck :lint :test`
      green (234 files / 2128 tests in app).
- [x] Self-review (background `code-review` pass) found nothing — traced the list-invalidation
      claim above against `IssuesView`'s actual `selected` derivation to confirm it.
## 2026-09-04 — Phase 38 Theme I — closing Linux CI's last three e2e gaps

[PR #127]. Closes out Theme I, leaving only Theme G's unrelated `graph-themes.spec.ts` cascade
flake in `KNOWN_RED`.

- [x] **`titlebar-agents.spec.ts` — investigated, needed no fix.** It already derives every
      width-dependent assertion from a live `scrollWidth` measurement instead of a hard-coded
      pixel, so it never carried an `@linux-red` tag at all — the phase doc's own "not enumerated,
      not investigated" note was stale.
- [x] **`panel-snap.spec.ts` — the same chord-mismatch wall, untagged.** Its one `@linux-red` spec
      mounts a terminal via `Control+\``, the exact wall the platform pin already closed for six
      other files. Tag dropped, confirmed green.
- [x] **`shortcut-rail.spec.ts` / `status-bar.spec.ts` — the font-metric density bug, actually
      fixed.** Their density tests asserted at hard-coded viewport widths tuned against macOS's
      own fonts. A stamp-`data-density`-and-read-`scrollWidth` measurement (the trick that fixed
      `titlebar-agents.spec.ts`) does not generalise here: this bar's `grid-cols-[1fr_auto_1fr]`
      tracks stretch to fill a wide viewport, so `scrollWidth` reads back `clientWidth` rather than
      real content demand. Fixed by walking the viewport down in a 20px stride instead, asserting
      each density band the instant the bar first reports it — never by jumping back up to a width
      visited on the way down, since `densityFor`'s hysteresis needs `compactWidth + 24px` to
      restore from `collapsed`.
- [x] `KNOWN_RED` now holds only `graph-themes.spec.ts` — zero `@linux-red` tags remain anywhere in
      `packages/app/e2e/`.

## 2026-09-04 — Phase 54 Themes C+D — The Issues view, and its registration

[PR #126]. Three phases (19, 50, 52) had each deferred issue work with the same sentence:
`features/issues/` doesn't exist. It does now.

- [x] **Theme C** — `features/issues/`: `issues-view.tsx` (shell, mirrors `actions-view.tsx`'s
      structure exactly), `issue-list.tsx` (flat, newest-updated first), `issue-detail.tsx` (one
      pane, not tabs), `issue-conversation.tsx`, `label-chip.tsx` (colours with a YIQ-computed
      contrast text colour), `issues-skeletons.tsx`, and a per-repo `issues-store.ts` mirroring
      `reviews-store.ts`.
- [x] **Theme D** — `issues` in the `ViewId` union and rail order, `GIT_NAV_ITEMS` entry, lazy
      route, one `FORGE_GATED_VIEWS` entry, all five exhaustive `Record<ViewId, …>` maps (plus two
      more that only typecheck/full-test-run turned up: `COMMAND_ICONS` and a hardcoded
      `view-sections.test.ts` fixture), `issuesListWidth` in all three layout tables, and a
      `Mod+Shift+I` chord.
- [x] **Self-review caught two real bugs before push:** `IssueDetail`'s loading gate resolved on
      the issue body alone, showing "Nobody has commented on this issue." while the comment fetch
      was still in flight; and a failed `gh issue view` rendered identically to a genuinely empty
      description because `useForgeIssueDetail`'s own `error` field was never read. Both fixed,
      with a regression test added for the second.
- [x] Tests: `issue-list.test.tsx`, `issue-detail.test.tsx`, `issues-store.test.ts`,
      `issue-order.test.ts`, `e2e/issues-view.spec.ts`. `moon run :typecheck :lint :test` — 233
      files / 2120 tests green.

## 2026-09-04 — Phase 54 Theme B — `gh issue view`, and the comments endpoint already in the tree

[PR #122]. `listIssues` was the only issue query that existed — no `gh issue view`, no comments
call, and no issue write anywhere.

- [x] **`issueDetail(repo, number)`** in `gh-cli.ts`, following `pullDetail`'s shape exactly.
      New `ForgeIssueDetailSchema` (`{ issue, body }`) and `ForgeIssueDetailResultSchema` (`{ cli,
      issue, error }` — named `issue`, not `detail`, per this theme's own recorded envelope; `gh
      issue view` has no ProjectV2-style scope-failure mode to distinguish). `gh-parse.ts`'s new
      `parseIssueDetail` reuses `parseIssueList` for the shared fields, the same way
      `parsePullDetail` reuses `parsePullList`.
- [x] **`issueComments(repo, number)`** — reuses `pullComments`' REST path
      (`repos/{slug}/issues/{n}/comments`) and `parseIssueComments` verbatim, confirmed with no
      second comment parser. One API call, not two: no `reviews`-merging half, since reviews are a
      pull-request-only concept.
- [x] **Two channels** (`forgeIssueDetail`, `forgeIssueComments`), **two schema pairs**
      (`ForgeIssueDetailRequest/Response`, `ForgeIssueCommentsRequest/Response`, plus a new
      `IssueNumber`/`ForgeIssueRequest` parallel to `PullNumber`/`ForgePullRequest`), **handlers**
      in `forge-handlers.ts`, and **bridge + preload exposure** — `forgeIssues`'s existing
      boilerplate, no new pattern.
- [x] **Caught in passing:** a whole-index guard test (`ipc.test.ts`'s "has a request schema for
      every forge channel") enumerates every `forge*` channel by name against its schema pair and
      fails loudly on a mismatch — exactly the drift guard this repo's tracker convention already
      uses elsewhere for `.midnite/tasks/_INDEX.md` itself. Updated it rather than letting the new
      channels land unvalidated by that guard.
- [x] 4 new `gh-parse.test.ts` cases for `parseIssueDetail`: reuses the listing parser for shared
      fields, carries the detail-only body, defaults a withheld body rather than dropping the
      issue, returns null for a payload with no url. No new `gh-cli.ts`-level tests, matching this
      repo's existing convention — there is no `gh-cli.test.ts` at all; those functions are thin
      shell-spawning wrappers, deliberately left untested directly so the *parsing* half stays pure
      and testable under bare vitest, exactly as `pullDetail`/`pullComments` already are. The
      doc's planned issue-with-no-comments case is already covered by `parseIssueComments`'s own
      existing "answers empty for anything that is not a list" test — a second case through a
      different caller of the same parser would test the reuse, not new behavior.

## 2026-09-04 — Phase 54 Theme A — the schema learns what a detail pane needs

[PR #121]. Opens Phase 54: `features/issues/` does not exist, and this schema previously carried
everything a list row needs and nothing a detail pane will.

- [x] **`ForgeIssueSchema`** (`shared/src/domain/forge.ts`) gains `id` — the GraphQL node id,
      following `ForgePullSchema.id`'s own documented precedent verbatim (defaulted to `''`, not
      required, since a withheld id still renders every read-only surface). Avoids the exact gap
      [Phase 50 Theme E](phases/phase-50-kanban-projects-followthrough.md) hit mid-theme on the PR
      side and had to thread through `gh-cli.ts`/`gh-parse.ts` under pressure.
- [x] **New `ForgeMilestoneSchema`**, `{ title: string }`, and `ForgeIssueSchema.milestone:
      ForgeMilestoneSchema.nullable().default(null)`. Trimmed to the one field a chip needs,
      matching this schema's own established minimalism (`ForgeLabelSchema`, `ForgePullSchema`).
- [x] **`gh-cli.ts`**: `ISSUE_FIELDS` gains `id,milestone`. **`gh-parse.ts`**: `parseIssueList`
      parses both, plus a new `asMilestone()` helper that keeps only `title` from gh's richer
      `{number, title, state, dueOn, …}` shape.
- [x] **Correction to the phase doc, verified against the real `gh` CLI, not assumed:** `body` and
      `commentCount` were dropped from scope. `body`'s own exclusion is the doc's very next
      sentence after naming it as an addition — the right home is a future `ForgeIssueDetailSchema`
      (Theme B's job, once `issueDetail()` exists). `commentCount` turned out not to be the "costs
      nothing" row-level signal the doc assumed: `gh issue list --json comments` and `gh issue view
      --json comments` both expose only the **full comment array** (bodies included), never a
      count — there is no lightweight count field on either `gh` subcommand. Adding it to the list
      schema would mean fetching every comment body for every row, the exact cost the doc's own
      reasoning says the list must avoid.
- [x] 6 new `gh-parse.test.ts` cases: the node id present and round-tripping, a withheld id
      defaulting to `''` rather than rejecting the row, a milestone's title kept while the rest of
      gh's shape is dropped, and a null milestone parsing as null. The doc's own planned
      zero-comment-count case does not apply, per the correction above.

## 2026-09-04 — Phase 51 Theme E — keystrokes that are never silently dropped

[PR #119]. The most likely "buggy input after a while": `term.onData` reads `stateRef.current`,
assigned during render, so between `pty.create` resolving and this component's own next
re-render the ref could still say `'starting'` — and the handler returned without queueing,
dropping every character typed in that window.

- [x] **`input-queue.ts`.** `createInputQueue(capBytes)`, a bounded FIFO — 4 KiB. On overflow it
      drops the **oldest already-buffered chunk(s)**, not the newest, since losing the user's most
      recent keystroke is the failure they would actually notice. Drops whole chunks rather than
      trimming to an exact byte count, since `onData` delivers whole decoded strings and slicing
      one could cut a multi-byte UTF-8 character in half.
- [x] **`terminal-view.tsx` wiring.** `onData` now pushes to the queue while `stateRef.current ===
      'starting'` instead of dropping (still drops for `'unavailable'` — nothing will ever bind
      there). A new `useEffect` keyed on `connectionState` flushes the queue through `sendInput`
      the instant `'open'` is observed — before any live keystroke reaches `sendInput`, since that
      call is itself gated on the same `stateRef.current === 'open'` check the flush effect just
      made true. `Cmd+Enter`'s `\x1b\r` routes through the identical gate — previously it silently
      dropped rather than queued, a different bug wearing the same clothes.
- [x] **Scope trim from the doc:** no pane-level "overflow" mark. The cap is a defensive backstop
      against adversarial/pathological input, not a case real typing speed against real
      millisecond-scale pty-startup latency actually reaches; a new UI affordance for it would be
      disproportionate to the fix.
- [x] 7 tests (`input-queue.test.ts`): in-order flush; empty after flush; drops oldest on overflow
      (including dropping several chunks for one large push); never trims mid-chunk; discards on
      `clear()` rather than leaking; correct UTF-8 byte counting for multi-byte characters.

## 2026-09-04 — Phase 52 Theme E + F + G — workflows filter, panel-stack navigation, board keyboard nav

[PR #120]. Closes out Phase 52 (filter/group/sort for Projects, PR #116 already landed A–D).

- [x] **Theme E** — `FilterInput` over workflow names (`workflow-list.tsx`) plus a `MultiSelectMenu`
      status facet over `RunHistoryList`, both Theme A's components reused verbatim rather than a
      second pair — the cheapest proof that toolbar was a pattern, not a one-off.
- [x] **Theme F** — `workflows-view.tsx`'s right-hand region becomes a real `panel-stack` (Inspector
      → History → Run) via a `WorkflowPanelEntry` discriminated union, replacing the ad-hoc
      `mode === 'run'` toggle and the `Popover`-wrapped `RunHistoryList`; `activeRunId`/`mode` are
      now derived from `panels.current` rather than tracked separately. The first *heterogeneous*
      panel-stack consumer — `councils-view.tsx`'s `CouncilEntry` union turned out to be the closer
      crib than `card-panel-stack.tsx`'s single-kind one. `NodeInspector`/`RunNodeDetail`/
      `RunHistoryList` all drop their own `w-80`/`border-l` wrappers, matching `card-detail.tsx`'s
      convention that a panel-stack entry is content, not a column.
- [x] **Theme G** — `board-keyboard.ts`'s pure roving-tabindex arithmetic wired into `board-view.tsx`:
      one Tab stop for the whole board, arrow keys to traverse, Enter opens the card, Escape closes
      it and returns focus. Two real bugs the tests caught before merge: `useDraggable`'s own
      attributes default `tabIndex` to `0` for a keyboard sensor this app never wires, which would
      have made every card's drag wrapper a second, competing Tab stop — overridden explicitly; and
      collapsing the *focused* card's own column needs an immediate focus rescue (its DOM node is
      gone, not CSS-hidden), not just a rescue on the next arrow press, which the original
      reconciliation effect (watching only `columns`, not `collapsedColumns`) missed entirely.
- [x] Screenshotted manually via a throwaway Playwright script against the real `mock-bridge` e2e
      harness (not committed): the workflow filter narrowing the list, and the Inspector → History
      breadcrumb navigation.

## 2026-09-04 — Phase 51 Theme D — a resize that costs one fit, not one per frame

[PR #118]. There was no debouncing on the fit path at all: the `ResizeObserver` called `fit()`
synchronously on every observer callback, so a drag-resize ran a full xterm re-measure and reflow
per observation, faster than the browser can even paint a frame.

- [x] **`fit-coalescer.ts`.** `createFitCoalescer(fit, raf?, cancelRaf?)` schedules at most one
      call to `fit` per animation frame — a re-`schedule()` within the same frame cancels the
      previous rAF handle rather than letting both run. `raf`/`cancelRaf` are injectable
      (defaulting to the real globals) so a test can step through frames by hand instead of racing
      the browser's own clock.
- [x] **`terminal-view.tsx` wiring.** The `ResizeObserver`'s callback now calls
      `fitCoalescer.schedule()` instead of `safeFit()` directly (the "not yet sized, first open"
      branch stays synchronous — that's the deferred-open concern, not the per-frame storm this
      theme targets). `lastSentRef`'s own IPC-resize dedupe (inside `safeFit`) is untouched — it
      solves a different problem one layer down and the two guards are not redundant.
- [x] **Correction to the doc:** cancelled, not "flushed", on unmount. Running a queued fit against
      a container mid-teardown measures something about to be torn down for no benefit;
      `fitCoalescer.cancel()` runs in the same cleanup, before `termRef.current`/`fitRef.current`
      are nulled, so no dangling rAF can fire against a disposed terminal either way.
- [x] 5 tests (`fit-coalescer.test.ts`): N schedules within one frame produce one fit; cancel drops
      a pending fit; cancel is a safe no-op with nothing pending; a burst still fits, and a second,
      independent frame is not throttled away by the first; re-scheduling within a frame cancels
      the previous rAF handle by its actual handle value, not just its callback reference.

## 2026-09-04 — Phase 51 Theme B — explicit cell metrics, and a font the user can set

[PR #117]. Independent of Theme A: `fontSize: 12` was the only metric this repo ever set, with no
`lineHeight`, `letterSpacing`, `fontWeight` or `fontWeightBold` anywhere, so xterm computed a
fractional cell height the WebGL renderer rounds per row.

- [x] **`terminal-font.ts`.** `terminalFontOptions(settings)` resolves a possibly-partial,
      possibly-blank settings object into a complete xterm options object with no `undefined`
      fields: `fontFamily`/`fontSize`/`lineHeight` from the user (falling back to the Nerd Font
      stack, `12`, `1` respectively — xterm's own defaults, so no existing pane's rendering
      changes), plus `letterSpacing: 0`/`fontWeight: 'normal'`/`fontWeightBold: 'bold'`, fixed,
      repo-owned decisions rather than user-facing settings.
- [x] **`ui-store.ts`.** `terminalFontFamily`/`terminalFontSize`/`terminalLineHeight`, persisted
      like every other scalar setting. **Correction to the doc:** no `merge` change was needed —
      `merge`'s per-key re-spreading exists only for *nested* persisted objects a shallow spread
      would clobber; plain scalars already get a missing key's current default from the top-level
      spread, the same shape `workflowDefaultTimeoutS`/`workflowRunHistoryCap` already used.
- [x] **`Settings ▸ Terminal ▸ Appearance`** (new accordion): a `TextField` for font family
      (blank, placeholder-only by default) and two sliders (font size 9–20px, line height 1–1.6),
      mirroring `workflows-page.tsx`'s own slider pattern.
- [x] **`terminal-view.tsx`.** The `Terminal` constructor reads a store snapshot through
      `terminalFontOptions()` at mount (not a reactive dependency — the mount effect stays
      once-per-session); a second effect reacts to the three settings and writes them onto the
      *live* instance via `Object.assign(term.options, ...)`, then `safeFit()` + `refresh()` — no
      remount, no dropped scrollback, no re-fetched snapshot.
- [x] 15 new tests: 4 in `terminal-font.test.ts` (defaults, blank-family fallback, per-field
      override, the no-`undefined`-field invariant) and 11 RTL tests in `terminal-page.test.tsx`
      covering the new Appearance section (persisted-value render, each control updating the
      store). The live-apply wiring inside `terminal-view.tsx` has no test of its own, for the
      same live-xterm-context reason Theme A's `clearTextureAtlas()` wiring doesn't.

## 2026-09-04 — Phase 52 Theme A + B + C + D — filter, group-by and sort for the Projects view

[PR #116]. Phases 40, 41 and 50 each declined filtering, grouping and sorting in the same words;
this phase stops declining. No new IPC channel, no schema change — every value was already
client-side on `ForgeProjectItem`.

- [x] **Theme A** — one filter toolbar (`filter.ts`), shared by Table and Board: `FilterInput` plus
      four `MultiSelectMenu` facets (assignees, labels, type, state), the house "empty means
      everyone" convention throughout. Landed `filterItems(items, filter)` without the doc's own
      third `fields` parameter — no facet here reads a field's `dataType`, so it would have been
      unused. Caught a real gap while writing the tests: `e2e/projects.spec.ts`'s own item fixture
      was missing `body`/`labels` (zod's `.default([])`/`.default('')` masks this in production;
      the mock e2e bridge skips validation and hands fixtures back verbatim) — the exact class of
      bug `kanban.spec.ts`'s fixture already documents fixing once, now fixed here too.
- [x] **Theme B** — `resolve-group-field.ts` replaces `findStatusField`'s literal `Status`-only
      match; `deriveColumns` generalises to `iteration` fields, whose columns are discovered from
      the items themselves (no fixed option list exists the way there is for `single_select`) —
      which is also why grouping by iteration is **read-only**: `board-view.tsx` folds it into the
      existing `writesEnabled` gate with a `disabledReason` string, reusing every already-tested
      disabled-drag rendering path rather than a second one. The synthetic "No status" column
      generalises to "No `<field name>`".
- [x] **Theme C** — tri-state sortable table headers (`sort.ts`), one comparator per `dataType` —
      option order for `single_select`, not alphabetical. No-value items (including an
      unresolvable `single_select` option id) sort last in both directions. **Correction:**
      iteration sorts by `title`, not "start-date" as drafted — the value schema carries no start
      date, and this phase adds no schema field to invent one.
- [x] **Theme D** — `projectViewByProject` in `ui-store.ts` (filter, group field, sort, collapsed
      columns), keyed by `projectId` not `repoId` since one project is reachable from several
      repos. Version bumped 6 → 7 with a seeding migration. Bounded by `project-view-lru.ts`'s
      `touchProjectView`, relying on a plain object's key-insertion-order guarantee rather than a
      second bookkeeping array.
- [x] Screenshotted manually via a throwaway Playwright script against the real `mock-bridge` e2e
      harness (not committed): table toolbar, search filtering, a sorted column, and Board mode
      regrouped from Status to Priority — all confirmed working.

## 2026-09-04 — Phase 51 Theme A — text that survives a change of display

[PR #115]. Opens Phase 51: `devicePixelRatio` was never read anywhere in this repo, so the WebGL
glyph atlas stayed rasterised at whatever DPR was in force when the addon loaded — move the window
across displays, or change scaling on the current one, and every glyph is drawn from an atlas built
for the wrong pixel grid.

- [x] **`use-device-pixel-ratio.ts`.** `useDevicePixelRatio()`, built on the self-re-arming
      `matchMedia(\`(resolution: ${dpr}dppx)\`)` idiom — the query embeds the ratio it was created
      at, so it fires exactly once; each `change` tears the old listener down and arms a fresh query
      at the new ratio. Pure DOM, no bridge call, so it stays renderer-side on purpose: Chromium
      already updates `window.devicePixelRatio` itself, and an Electron `screen` bridge would only
      add a channel that can disagree with it.
- [x] **`terminal-view.tsx` wiring.** A new `webglRef` (parallel to the existing `termRef`/`fitRef`)
      holds the loaded `WebglAddon`, cleared on context loss and on unmount. The DPR effect runs
      `webglRef.current?.clearTextureAtlas()` (wrapped in `try/catch` — a lost-context dispose can
      race it) → `safeFit()` → `term.refresh(...)`, in that order because clearing after a refresh
      repaints from the stale atlas first and fitting before clearing measures against the old
      rasterisation. The DOM-renderer fallback runs the same fit/refresh half with no atlas call,
      since `webglRef` is null there.
- [x] 3 tests (`use-device-pixel-ratio.test.ts`), scoped to the hook per the doc's own plan: reports
      the initial ratio synchronously, re-arms with a fresh query at the new ratio on each change
      while tearing the old one down exactly once, and tears down on unmount. The `terminal-view.tsx`
      wiring itself has no test — it needs a live xterm + WebGL context no jsdom test can construct,
      the same reason that component has no existing test file.

## 2026-09-04 — Phase 41 Theme H (partial) — switching boards doesn't kill a session, tested

[PR #114]. Closes one of Theme H's two remaining items — the other (quit-and-relaunch against a
packaged build) still needs a human on real hardware.

- [x] **`board-view.test.tsx`, two new integration tests against the real `useTerminalStore`.**
      A kanban session seeded directly into the store (with `hydrated: true` so `BoardView`'s own
      `hydrate()` short-circuits rather than racing the seed) survives this board mounting,
      unmounting and remounting untouched — proving "switching boards or repos does not kill
      running sessions... and returning reattaches" is actually true, not just true by
      construction. A second test confirms a session bound to a *different* board's card is left
      alone by this board's reconciliation effect, since it is scoped to `board.projectId`.
- [x] No production code changed — the behaviour already existed (nothing kills a session on
      unmount); this was a test-coverage gap, closed at the layer that actually covers it (an RTL
      mount/unmount test on `BoardView` itself, not a further unit test on the already-tested pure
      `sessionsToRehome`).

## 2026-09-04 — Phase 44 Theme C + Theme E — the toolchain probe, studio host and render service

[PR #113]. Two main-process services, decoupled from Theme B's `projects-store.ts` by taking a
directory as a parameter rather than resolving one — IPC wiring stays Theme H's job once a view
exists to call it from.

- [x] **`desktop/src/main/video/toolchain.ts`.** `probeVideoToolchain` resolves `node`/`npx`
      through the existing `login-shell.ts` probe (the same fix `agent-probe.ts` and
      `gh-shell.ts` already apply for the same PATH problem), framed and batched in one shell
      call the way `agent-probe.ts`'s roster probe is. Cached until an explicit reset rather than
      on a TTL — installing a binary mid-session is rare enough that a manual re-detect is the
      right cost. `remotionVersion` reads the Remotion app's own `package.json`, per project.
- [x] **`desktop/src/main/video/studio-service.ts`.** Owns at most one `remotion studio --no-open`
      child per project (`Map<projectId, …>`, `browser-service.ts`'s tab-map shape). Port
      discovery matches the URL Remotion's own `printServerReadyComment` prints to stdout —
      traced through the real `@remotion/studio-server` source in `~/Dev/ekko-videos` rather than
      assumed — never 3000. A studio that dies on its own reports `failed` with its last stderr
      lines and stays restartable; one already running or starting is never spawned twice.
- [x] **`desktop/src/main/video/render-service.ts`.** `queueRender`/`cancelRender` run one render
      at a time per project (different projects render in parallel) through the existing
      `runProcess`, at a 20-minute deadline in place of its 120s default. Prefers a project's own
      `scripts/render.mjs` wrapper, falling back to the raw Remotion CLI with the exact `vN`
      version-numbering the wrapper itself uses. Progress is parsed straight out of Remotion's CLI
      text — piping stdout forces its non-overlaying, non-ANSI logger — combined with the same
      70/30 render/encode weighting `@remotion/renderer`'s `render-media.js` uses internally.
      **Correction:** Theme A's landed `VideoRenderProgressEventSchema` carries no `phase` field,
      so progress is one combined fraction rather than a `bundling|rendering|encoding` enum.
      Cancelling kills the whole process group; a merely-queued render is dropped unspawned.
- [x] Both theme headings land `◐ PARTIAL`, not `✅ DONE`: Theme C's process-group kill on
      `before-quit`/project-removal and Theme E's output-listing/reveal-in-Finder pane are UI- and
      lifecycle-wiring concerns that belong to Theme D/H, which don't exist yet.
- [x] 41 tests, all against captured process output/fake spawned children (`agent-probe.test.ts`'s
      posture) — no real `npx`/`remotion` invoked.

## 2026-09-04 — Phase 44 Theme B — project discovery and the store

[PR #112]. Projects are **discovered, not registered** — `discoverProjects` scans
`<root>/projects/*/project.json` on every request rather than mirroring what's found into a
store that can drift from disk.

- [x] **`desktop/src/main/video/projects-store.ts`.** JSON under `userData`, following
      `councils-store.ts`'s shape, persisting exactly one field — the video root. Missing or
      corrupt file both load as `{ videoRoot: null }`, never a throw.
- [x] **`desktop/src/main/video/project-discovery.ts`.** `discoverProjects`/`getProject` read the
      root fresh every call; `_template` is never listed as a project. A folder that fails at any
      step — no `project.json`, unparseable, schema-invalid, `id` disagreeing with its own folder
      name — comes back `valid: false` with a human-readable reason, never a crash and never a
      silently skipped folder. `createProject` copies `_template/` (the `ekko-videos`-documented
      "copy this to start the next one") and patches the copy's `id`/`title` so folder and file
      agree from the moment it exists. `listOutputFiles` parses `<project>/output/vN-<label>.mp4`
      back off disk rather than counting iterations in a store that could disagree with it.
- [x] Path containment reuses `fs-scope.ts` rather than a second implementation, and three bugs
      only the tests surfaced: (1) validating `source`/`brief`/`script` with `confineToRoot`
      (which `realpath`s, requiring existence) wrongly failed a fresh project whose referenced
      files aren't written yet — fixed by using the pure, existence-independent `joinWithin` for
      those three fields, reserving `confineToRoot` for paths required to already exist.
      (2) `readdir`'s `Dirent.isDirectory()` reports `false` for a **symlinked** directory (it's
      the symlink's own `lstat` type, not its target's) — the original folder filter silently
      dropped a symlink-escape project instead of reading and refusing it; fixed by also admitting
      `isSymbolicLink()` entries so `confineToRoot`'s `realpath` check catches the escape.
      (3) Using `confineToRoot` for the `project.json` existence check conflated "doesn't exist"
      with "escapes via symlink" into the same misleading error — split into a sequential
      `joinWithin` (pure string escape) → `readFile` (existence) → `confineToRoot` (symlink escape,
      only once existence is confirmed).
- [x] 22 tests (`projects-store.test.ts` ×5, `project-discovery.test.ts` ×17), all against a real
      temp filesystem — including the `../../../../etc/passwd`-style escape and a project folder
      reached through an actual symlink pointing outside the root.
- [x] Deliberately out of scope, per the phase doc's own split: IPC handlers and preload wiring —
      Theme H's job. These functions are desktop-internal and unreachable from the renderer until
      then.

## 2026-09-04 — Phase 22 Theme H — the remaining undo executors

[PR #109]. Closes out Theme H — every op `isUndoableOpKind` calls undoable in principle now has a
real, wired Undo, not just the starter pair (`stash-drop`/`branch-delete`).

- [x] Executor arms for `commit`/`reset` (a plain `mixed` reset to the prior `HEAD` — leaves the
      working tree alone), `checkout` (detaches to the prior sha rather than guessing a branch
      name), `branch-create` (deletes the branch it named), `branch-rename` (renames back), and
      `stash-push` (pops the newest entry, matching `computeUndoable`'s existing "applied by being
      newest" assumption).
- [x] `computeUndoable` gained an optional `headAfter` anchor field, backward compatible with every
      existing caller, so `branch-rename`'s undoability check can require the new name it needs.
- [x] **Found the same graph/sidebar gap `branch-delete` already hit (PR #31):** `branch-create` and
      `branch-rename` each have two independent call sites (`use-graph-actions.ts`,
      `use-repo-actions.ts`), and only the graph's originally carried a `journalHint`. Caught by
      extending `journal-undo.spec.ts` with a rename-and-undo case through the sidebar's own menu,
      which timed out until both call sites got the hint.
- [x] **Self-review caught a real bug before merge:** every `branch-create` call site checks the new
      branch out immediately, so its undo (`branchDelete`, `force: true`) was force-deleting the
      branch HEAD is currently on — which git refuses regardless of force. Fixed by detaching to the
      sha the branch was created from first, the same shape `checkout`'s own undo already uses.

## 2026-09-04 — Phase 43 Theme D — the demo API status pill

[PR #109]. Closes out Theme D's one carried-over item.

- [x] `Demo API · running on :<port> · [stop]` / `Demo API · stopped · [start]` in the Workflows
      canvas toolbar, polling the existing `demoApi.status` IPC (it shipped with no push event).
      One-click insertion of the running server's base URL into a selected `http` node's URL field,
      gated on both a running server and an `http` node actually being selected.

## 2026-09-04 — Phase 44 Theme A — Video Studio's shared contracts

[PR #110]. Opens Phase 44, the last of the five `_features.md` items — a **Video** view driving a
real npm project on disk (Remotion, no dependency shipped) exactly as this app already drives `gh`
and Claude. Theme A is contracts only: no engine, no store, no view yet.

- [x] **`shared/src/video.ts`.** `VideoProjectFileSchema` checked directly against
      `~/Dev/ekko-videos/projects/_template/project.json` rather than transcribed from the phase
      doc's own paraphrase — `{ id, title, composition, source, brief, script }`, verbatim.
      `VideoProjectSchema` wraps it as the `valid: true` arm of a union with `{ valid: false, id,
      error }`, since Theme B's "malformed project.json → invalid, never a crash" needs a shape to
      land in and the folder name is the only identity available when the file can't be parsed.
- [x] **`VideoStudioStatus`/`VideoToolchain`, schema-enforced not just documented.** `running`
      cannot omit its `url`; `failed` cannot omit its `stderr` lines — both asserted in
      `video.test.ts` by trying to construct the invalid shape and catching the throw, not just by
      reading the type. `VideoToolBinary` is a `found`-discriminated pair so a consumer cannot read
      `path` without narrowing `found` first.
- [x] Channels (`mstudio:video:*`, 11 of them), two push events, and full `bridge.ts` signatures.
- [x] Found and fixed in passing: a genuine tracker error, not a code one — the phase's own Theme
      key section in `_INDEX.md` already claimed Theme A landed via `PR #92`, which is Phase 43's
      PR (`shared/src/workflow.ts`). `shared/src/video.ts` did not exist before this PR; corrected
      the citation rather than leaving a false landing on the books.
- [x] Confirmed a contracts-only theme genuinely stands alone: `app:typecheck`/`desktop:typecheck`
      stay green with no `video` property anywhere in `preload/index.ts` yet — the same posture
      workflow's and councils' own Theme A landed in.

## 2026-09-04 — Phase 47 Theme F (partial) — the wiring/safety-net pass

[PR #111]. Themes B and C each proved their own write path in isolation; nothing proved using both
together in the same conflicted operation actually reaches a completed merge.

- [x] **`conflict-flow.integration.test.ts`** (real git via `TempRepo`): a merge resolved with one
      whole-file accept (Theme B) and one region-by-region file (Theme C) reaches
      `conflictedPaths()` empty — the exact condition `ConflictBanner`'s Continue button gates on —
      and `continueOp` completes a real two-parent merge commit. A second case does the same inside a
      rebase, proving Theme B's and Theme C's own "ours" conventions agree with EACH OTHER, not just
      each with itself, which is the integration risk their separate suites couldn't see.
  - **Checked for a reusable "real git behind the UI" harness first, found none**: every existing
    Playwright spec drives the renderer against a mocked bridge; nothing combines that with a real
    repo. Landed as a git-engine integration test instead — the layer that actually owns "does the
    merge complete" — rather than building new Electron-in-the-loop infrastructure disproportionate
    to an `S`-sized theme.
- [x] New RTL coverage closes a real gap: "Accept theirs"/"Accept both"/"Accept all theirs" had no
      payload-asserting test before this pass — only "Accept mine"/"Accept all mine" did. A swapped
      `onClick` on any of the other three was a silent regression no git-engine test could ever catch.
- **Open, for a human** (unchanged from the doc): a real conflict against a locally-set
  `merge.conflictStyle = diff3`, which no CI fixture exercises in practice.

## 2026-09-04 — Phase 43 Theme I (partial) — the palette command, the settings page, and the wiring between them

[PR #108]. Closes out Phase 43's build entirely bar one human-only pass.

- [x] **`workflow.run`, and the gate the doc missed.** Declared in `COMMANDS`
      (chord-less), given a `CommandRuntime` entry and a `COMMAND_ICONS` row —
      all typecheck-enforced. None of that made it *findable*: the palette
      filters every row through `PALETTE_SAFE`, a separate explicit allowlist
      in `features/palette/safety.ts` the phase doc never mentioned. An e2e
      run against the real palette (not a unit test) is what caught it —
      the command searched for zero results until added there too.
- [x] **A new seam for "which workflow is open."** `WorkflowsView`'s selection
      is local state, invisible to the global command runtime. New
      `workflow-run-command-store.ts` mirrors `commit-box-store.ts`/
      `status.commit` exactly: `WorkflowEditor` registers a `{run}` handle
      while a valid workflow is open; the command always navigates to
      Workflows and calls `.handle?.run()`, a harmless no-op with nothing
      open rather than a second `enabled` gate this runtime would need new
      state to compute.
- [x] **The Workflows settings page, wired all the way to main.** Registered
      the standard four places (`SettingsPageId`, `SETTINGS_PAGES`,
      `PAGE_CONTENT`, `SETTINGS_PAGE_ICON`); `workflows-page.tsx` follows
      `graph-page.tsx`'s `<Accordion>` shape with `screen-lock-page.tsx`-style
      sliders. Reaching main needed a real IPC round trip the doc never
      designed: a new one-way `workflowSetDefaults` channel, the exact
      `update.setChannel` shape (`ipcMain.on` + manual `safeParse`, sent on
      change, never synced on boot). `EngineDeps` gained an injected
      `defaultTimeoutMs?` (the same seam `clock` already uses, for the same
      testability reason); `trimRunsPerWorkflow`/`createWorkflowRunsStore`
      gained an optional cap parameter/thunk. Every existing caller, tests
      included, is unaffected — both default to the untouched constants.
- [x] Native menu item in `menu.ts`'s View submenu.
- [x] e2e: the `workflow.run` palette round trip, against the real assembled
      app and the real `isPaletteSafe` gate.
- [x] Screenshot: the new settings page.
- [ ] **Open, for a human:** the one real end-to-end pass — start the demo
      API, build a POST-then-GET workflow against it, run it, watch the
      created record come back. Nothing here can drive a real HTTP round
      trip unattended.

## 2026-09-04 — Phase 47 Theme D — the Conflict Resolution Studio UI

[PR #107]. The phase's UI surface — Themes A–C built the parser, the safe whole-file baseline, and
the real risk (hunk-level patching), but resolving a conflict still meant leaving the app until this
landed.

- [x] **The Studio** (`features/conflicts/conflict-resolution-studio.tsx`), opened from a now-clickable
      path in `ConflictBanner`, rendered in the graph's existing side-panel slot beside
      `CommitDetail`/`StashInspector` (`GraphSelection` widened with a `'conflict'` kind). Per-region
      **Accept mine/theirs/both** call Theme C's `applyConflictHunk`; file-level **Accept all
      mine/theirs** call Theme B's whole-file resolve. Deliberately not built on `DiffCell`/
      `toSplitRows` — Phase 26's two-way model has no notion of a three-sided region — so this ships
      a plain monospace rendering; shiki highlighting and virtualization are left for later.
- [x] **New read-side IPC**, `mstudio:conflict:regions`: Themes A–C's `parseConflictedFile`/
      `readFileDiff` had only ever run main-process-side. Response carries a `truncated` flag —
      self-review caught that `readFileDiff`'s `DIFF_LINE_CAP` silently drops trailing regions from a
      large conflicted file with no signal; the Studio now warns instead of looking fully resolved.
- [x] A resolved region disappears without a full-file remount: `useConflictRegions` rides the same
      `keys.status(...)`-prefixed invalidation every write op and the file watcher already trigger —
      the existing "server state authoritative but not synchronous" pattern, not a local append.
- A real bug caught mid-build: the mutation hooks defaulted to the *globally selected* worktree
  rather than the Studio's own `worktreePath` prop, invisible until a payload-asserting test caught
  it — fixed with `useTargetedGitOp` and an explicit target (`use-repo-actions.ts`'s own precedent).

## 2026-09-03 — Phase 43 Theme G — the workflow run view

[PR #105]. Closes out Phase 43's build half — Theme I (settings) is the one item left.

- [x] **Read-only run mode, one canvas.** `workflow-canvas.tsx` gained `readOnly`/`nodeStatuses`
      props rather than a second component: pan/zoom and click-to-select stay live, drag/connect/
      marquee/delete/undo are gated behind `!readOnly` in the existing handlers. A run's per-node
      status colours the node stroke (`stroke-blue-500`/`stroke-green-500`/`stroke-destructive`/
      `stroke-muted-foreground`), overriding the invalid/selected colouring Theme F added.
- [x] **Push, then re-fetch.** `use-workflow-run.ts` subscribes to `workflow.onRunChanged` (no
      payload) and invalidates one `['workflow-runs']` key prefix covering both the list and detail
      queries — correct regardless of which run changed, and the reason councils' 1200ms poll was
      the wrong precedent to copy.
- [x] **Run detail, swapped into the inspector's pane.** `run-node-detail.tsx` shows status,
      duration, error and output (with `truncated` surfaced, never dropped) — not "input", which
      the phase doc named but `WorkflowNodeRunSchema` never actually captured.
- [x] **History, per workflow.** `run-history-list.tsx` behind a new History button on the canvas
      toolbar (a `Popover`, not a `panel-stack` drawer — that would mean building the same
      unmount-persistence store Councils needed for its own run history, for a list this small).
      Capped per-workflow at 20 by the store Theme H already shipped, not the 200-global the doc
      guessed before that store existed.
- [x] **Focus-gated running indicator, the current way.** `.card-run-glow` (BoardView's Kanban-card
      idiom) on the History button, not `.loop-run-glow`'s tab-hued rainbow system the doc named —
      that predates `BoardView`'s simpler version. `useWindowFocusGate` already supports concurrent
      hosts (`FabPanel`, `LandingView`), so `WorkflowEditor` calls it directly; no `app.tsx` hoist.
- [x] Found and fixed in passing: the e2e mock's `workflow.run()` fabricated a run shaped as
      `{ nodeRuns: [] }` — the real schema's field is `nodes`, and `workflowName`/`edges` were
      missing entirely. Nothing had consumed the mock's run object before this theme, so the drift
      went uncaught; fixed to mirror the real workflow's nodes with a `succeeded` status each.

## 2026-09-03 — Phase 49 Theme E — Update pre-flight tooltip + packaged-build template check

[PR #104]. Closes out Theme E's last two open items, and with them the phase's build half.

- [x] **The pre-flight tooltip.** Update's `buttonLabel` names the build cost
      ("no packaged build yet — will run dist first, several minutes, ~200MB") when
      `hasPackagedBuild` is false, re-read once the Update session's own terminal state reaches
      `exited`. Surfaced in the tooltip only, not a `ContextMenu` `description` — that component's
      own rule is every row of a menu is described or none, and this menu's rows (Setup, Update, the
      four lifecycle verbs) are all undescribed today; singling Update out would have broken it.
- [x] **The packaged-build assertion.** Extends the existing `verify-dist.mjs`, which already runs
      in CI's `package` job (`moon run desktop:dist` → `desktop:verify-dist`, macOS-only, on `main`)
      — no new script, no new CI cost. Asserts a specific file,
      `Contents/Resources/templates/midnite/.midnite/tasks/_INDEX.md`, so a truncated
      `extraResources` copy still fails rather than passing on an empty directory.
      `template-path.test.ts`'s mocked coverage of `templateRoot()`'s packaged branch already
      existed from Theme A; this closes the separate real-build gap a mock can't reach.

## 2026-09-03 — Phase 43 Theme F — the workflow node inspector

[PR #102]. The canvas's first right-hand config pane — the five node kinds `#100` shipped had
nothing to configure them with until now.

- [x] **The inspector.** `node-inspector.tsx` + `node-forms.tsx`: one form per `WorkflowNodeKind`,
      dispatched via an exhaustive `Record<WorkflowNodeKind, ...>` so a sixth kind fails to
      typecheck until its form exists. `<EmptyState>` with *"Select a node to configure it."* when
      nothing (or more than one node) is selected — plain `ReadonlySet<string>` selection lifted from
      the canvas's existing `onSelectionChange`, no `panel-stack`.
- [x] **Live validation.** Reuses the existing `validateWorkflow()` (Theme A) rather than the doc's
      own suggested `WorkflowNodeSchema.safeParse` — that schema has no presence constraints, so it
      would never catch an empty URL. An invalid node draws a `stroke-destructive` outline and a
      badge on the canvas; the new Run button (also this theme's, wired to the existing
      `workflow.run` IPC) is disabled with a `title` naming the first issue.
- [x] **The `{{...}}` reference helper.** `ancestorIds()` (new in `shared/workflow.ts`) lists a
      node's transitive upstream predecessors; `node-output-fields.ts` gives each one's declared
      output shape. Insert-on-click at the focused field's caret — the last-run-output fallback the
      doc names is left to Theme G, since run history storage lives there.
- [x] **Form primitives hoisted.** `Field`/`Choice`/new `TextField`/`TextArea` moved into
      `components/form/field.tsx`; `settings-pages/controls.tsx` re-exports them unchanged.
      `SwitchRow`/`RadioRow` needed no move — Phase 41 Theme G had already hoisted them.

## 2026-09-03 — Phase 47 Theme C — hunk-level conflict patch application

[PR #103]. The phase's own flagged "biggest risk" — a net-new write path through the index for
hunk-level conflict resolution, with zero precedent anywhere in the repo (Phase 26 named this exact
gap and deliberately declined to build it). Themes D (the Studio UI), E (agent-assisted suggestion)
and F (wiring/verification) were all blocked on this landing first.

- [x] **`applyConflictHunk`** resolves one conflicted region within a path to `ours`/`theirs`/`both`,
      leaving sibling regions in the same file untouched and still parseable as conflicted.
  - **Corrected from the phase doc, found spiking it against real git before writing any code**:
    `git apply --index`/`--cached` cannot target an unmerged path — there is no stage-0 entry to
    patch against (`ls-files -u` shows only stages 1/2/3), confirmed against a throwaway repo. There
    is also no partial-index state for a conflicted path — staging is whole-file-or-nothing. The
    patch applies to the **worktree only**, leaving the pre-existing 1/2/3 stages alone while regions
    remain, and finalizes with a plain `git add` (one resolved stage-0 entry) the moment a fresh read
    shows zero markers left.
  - **Widened from the doc's signature**: takes a `regionIndex` (0-based, document order) alongside
    `region`, so two conflicts with identical content in the same file can't be confused — the index
    is what a renderer walking the file top-to-bottom already has for free.
  - A stale region (changed on disk, or an index past the last region) fails as `GitOpResult`'s
    existing `code: 'stale-write'` — the same code Phase 24's fs-write channels already use for the
    identical shape of problem.
- [x] New `locateConflictRegion` parser (`conflict-parser.ts`): scans a whole file's raw lines for its
      Nth conflict region in document order, keeping the literal marker line text the display parser
      (Theme A) deliberately discards, since a patch has to reproduce it byte-for-byte.
- [x] New IPC channel `mstudio:op:conflict-apply-hunk` (schema, channel, bridge type, preload call,
      main handler), same thin-handler shape as Theme B's whole-file resolution. No renderer consumer
      yet — that's Theme D.
- Self-review caught one real defect before merge: a whole-string `resolvedContent.includes('<<<<<<<')`
  check that would false-positive on resolved content legitimately containing that substring mid-line
  (a fixture or a file documenting conflict markers), leaving the path silently stuck unmerged despite
  reporting success — fixed to a per-line `startsWith` check, matching how the marker scanner itself
  detects a marker, with a regression test.
- **Not done**: the no-trailing-newline case (a region touching a file's very last line when that file
  has no trailing `\n` fails to apply, since the patch never emits a `\ No newline at end of file`
  marker) — left open, no fixture in this batch's tests needed it, and Theme D's real-file testing is
  what will show whether it matters in practice.

## 2026-09-03 — Phase 50 Themes E, F — "Add to project" from Reviews, activity markers beyond Claude

[PR #101]. Two of the six gaps Phases 40–42 named and declined, the last two Phase 50 had left open
after A–D (PR #93).

- [x] **Theme E — "Add to project" from the Reviews page.** The real gap, found while grounding the
      theme: `ForgePullSchema` carried no `id` at all, and `addItemToProject`'s `contentId` needs
      exactly the GraphQL global node id `gh pr list/view --json id` returns. Added to `PULL_FIELDS`,
      threaded through `gh-parse.ts` and `ForgePullSchema` (defaulted `''`, matching the schema's
      existing tolerance for withheld fields), and a new "Add to project ▸" button on
      `review-action-bar.tsx` reuses the Projects view's own `useForgeProjects`/`boardByRepo` state
      rather than a second picker. Disabled only on the boards query's genuine first load
      (`isLoading`, not `isFetching`) so a background refetch of an already-warm cache never disables
      it and the menu never opens into a "Loading…" placeholder that can't update itself.
- [x] **Theme F — activity markers beyond Claude, for two of the three targeted providers.**
      `agy` and `opencode` both got real marker sets captured from a PTY-driven session (a trivial
      prompt, ANSI stripped): a braille spinner plus a text tell for `thinking`, and a distinct
      idle-only string for `frameEnd`. `codex` shipped **without** one — it requires an interactive
      `codex login` (OAuth device flow) this pass had no business driving unattended, so its roster
      entry stays unset with a comment explaining why, the same bar the theme's own doc sets for
      excluding a marker set rather than guessing one. `terminal.test.ts`'s builtins-with-activity
      assertion now names `claude`, `agy` and `opencode`.
- Three human-only verification passes stay open, all pre-existing or newly surfaced by this pass:
  the live "No status" clear on a real board (Theme C, unchanged), "Add to project" landing on
  github.com, and a non-Claude agent's live activity transition — plus a captured `codex` transcript
  once someone runs `codex login`.

## 2026-09-03 — Phase 43 Themes E, H — the workflow canvas and its list/persistence

[PR #100]. Fills in the renderer half of Workflows: Theme A–D's contract and engine (PR #92) had
nothing to build against or look at until this landed. Theme E is the phase's largest risk — pan/zoom,
free 2-D drag, multi-select and undo/redo had zero precedent anywhere in this renderer.

- [x] **Theme E — the canvas.** `features/workflows/canvas/workflow-canvas.tsx`, a hand-rolled SVG
      with the geometry split pure (`workflow-geometry.ts`, `workflow-path.ts`), mirroring
      `metric-geometry.ts`/`metric-path.ts`'s own split. Pan via plain wheel/trackpad scroll,
      `Ctrl`/`Cmd`-wheel zoom about the pointer clamped to `[0.25, 2]` (proven by a
      `workflow-path.test.ts` case that the graph point under the cursor stays fixed across a zoom
      change), space-drag and middle-drag panning, raw-pointer node drag (not `@dnd-kit`) snapping to
      a 16px grid on drop, edge creation by dragging port-to-port with a live preview and draw-time
      cycle rejection, single/shift/marquee selection, `Delete`/`Escape`/`Cmd+A`, a 50-entry
      undo/redo ring buffer, and viewport culling so a 200-node fixture stays under 300 rendered DOM
      nodes. Cycle detection (`findCycleEdge`/`wouldCycle`) is hoisted into `shared/src/workflow.ts`
      so the canvas and the engine can never disagree about what a cycle is — the engine's own
      copy was deleted in favour of it.
- [x] **Theme H — persistence and the list (the renderer half; the two stores + IPC handlers had
      already landed with B/D in PR #92).** `workflows-view.tsx` replaces the `<Placeholder>`,
      inserted before `app.tsx`'s `!selectedRepoId` guard alongside Councils since a workflow is
      global. `workflow-list.tsx` is the left rail: create/duplicate/delete, import/export as JSON
      (fresh ids assigned on import so importing the same file twice never collides), all via
      `use-workflow.ts` query hooks kept feature-local rather than in `queries.ts`, matching why
      councils are absent from that file. `noBridge`/`reportFailure` — duplicated verbatim in both
      council hook files — are hoisted into `services/bridge-result.ts` and re-exported from all
      three call sites now that workflows needed a third copy. Last-run status per row is deferred to
      Theme G, which owns the run-history data it would read from.
- **Two real bugs fixed along the way, neither part of either theme's own scope:** a stray NUL byte
  had corrupted `shared/src/workflow.ts` (`` `${edge.from}\x00${edge.to}` `` instead of `:` in the
  edge-dedup key), which made the file register as binary to some tooling; and `WorkflowEditor`'s
  auto-save fed the canvas the raw `workflow` prop rather than an optimistic local copy, so two edits
  inside the 500ms save debounce (e.g. drag a node, then immediately add another) computed the
  second edit from stale pre-round-trip data and silently dropped the first — caught directly by the
  new e2e "connects two nodes" spec.
- Playwright coverage: `e2e/workflows.spec.ts` (create, add/connect/select/delete/undo nodes, cycle
  rejection, duplicate, delete-with-confirm) and `e2e/workflows-shots.spec.ts` (the empty list, a
  connected canvas, a selected node), plus a `workflow` domain added to `mock-bridge.ts`.

## 2026-09-03 — Phase 50 Themes A, B, C, D — Kanban follow-through

[PR #93]. Four gaps Phases 40–42 each named and declined to build, batched together because A, B
and D all land on `card-composer.tsx` and `board-view.tsx` and would have conflicted split apart.

- [x] **Theme A — a card session outlives its agent.** The binding used to be what proved a session
      was live, so an agent exiting lost the card's connection to its own scrollback. Now the pane
      renders `Ended` (Stop gone, Dismiss offered, "reveal terminal" still working) and the binding
      is cleared **only** by an explicit Dismiss. `dismissCardSession` drops `surface`/`taskRef`
      exactly the way `rehomeSession` already did — it does not end the session, because the one
      case that matters is a session that is *still live* under a card the user no longer wants
      bound. `countLiveCardSessions` + `CONCURRENT_CARD_SESSION_SOFT_LIMIT = 5` soft-**warn** at the
      6th launch and never block it: Phase 41 Theme I's own recorded recommendation, and a
      client-side quota that refused the launch is what that recommendation argues against. The
      count deliberately ignores asleep sessions, main-surface sessions, and sessions on another
      board — each its own test, because each is a way the number could quietly read too high.
- [x] **Theme B — "Launch and run," opt-in and confirmed every time.** A second button beside Start,
      **absent from the DOM entirely** behind a default-off `Settings ▸ Projects` toggle
      (`launchAndRunEnabled`, shaped on `forgeWritesEnabled`), and even with it on it opens a confirm
      whose body *is* the composed command verbatim before anything is sent. Start and Launch-and-run
      funnel through one `launch(autoSend)` rather than two copies that drift: the only difference
      between the paths is the trailing `\r`, asserted present in one and absent in the other. Every
      time, not only the first — a kanban prompt is composed from **remote GitHub text**, which is
      the argument Phase 41 Theme G already wrote down for typed-not-sent, and the toggle narrows it
      rather than reversing it.
- [x] **Theme C — a real "No status" drop target.** `clearProjectV2ItemFieldValue` in
      `gh-project-write.ts` plus its own channel and handler. Phase 41 Theme C found in the doing
      that "No status" *cannot* be a drop target — clearing a field is a different GraphQL mutation
      from setting one, which Phase 40 never built — and left the column permanently disabled. Both
      the drag path (`applyOptimisticMove`) and the "Move to ▸" menu now route to `clearField`, and
      the tests assert **`clearField` rather than `setField`**, not merely that some call succeeded:
      a wire-up that reached the old mutation with an empty value would pass a weaker assertion and
      fail on github.com.
- [x] **Theme D — the card-detail pane adopts `panel-stack`.** `Mod+[`/`Mod+]` with a breadcrumb, on
      the primitive whose own docblock named Projects as consumer #2. A new `card-panel-stack.tsx`
      owns **one `usePanelHistory` per open pane**, reset on close — no module-level store, because
      the history is meaningless once the pane is shut. Joins Councils in `active-panel.ts`'s
      registry, so `panel.back`/`panel.forward` now gate on either view being active.
- A follow-up fix pass caught three real defects before merge, each with a test: `CardComposer`
  state bled between cards across a panel-stack push (a prompt typed on card A reappeared on card
  B — fixed by keying the composer on the card id, so its local prompt/agent/model state resets
  per card); a no-op move (dropping a card back on the column it came from) froze the board; and
  the stack's current entry drifted out of sync with the board's own `selectedItemId`, since
  Back/Forward move `history.current` without touching the prop that drives the column highlight —
  fixed by reporting the navigation upward, guarded so it does not fire straight back on the push
  that caused it. A history entry can also outlive its item (the card leaves the board while still
  in the back-stack); that renders an explicit notice with a Close, not a blank pane.
- **The verification checklist's three human-only items stay open, and that is the whole remainder
  of A–D**: a real board for the live clear mutation (no fixture proves a GraphQL mutation's live
  behaviour — Phase 41 Theme I's exact posture), and a real non-Claude CLI for Theme F's activity
  transitions. Themes **E** ("Add to project ▸" from Reviews) and **F** (activity markers for
  `agy`/`codex`/`opencode`) were not attempted.

## 2026-09-03 — Phase 47 Theme B — whole-file conflict resolution

[PR #64]. The safe baseline on top of Theme A's parser: accept one side of a conflicted file
entirely, no partial state.

- [x] **`resolveConflictWholeFile(worktreePath, path, side)`** in a new
      `git-engine/src/commands/conflict-resolve.ts`. Reads the requested index stage
      (`:1:`/`:2:`/`:3:` for base/ours/theirs) through the **existing** `readBlob` — a binary-safe
      `Buffer` read off `cat-file blob`, deliberately not a string-decoding `git show`, which would
      silently mangle bytes outside dugite's assumed encoding (the fix reused from the CRLF defect
      Phase 48 found, one step earlier in the pipeline). Writes the blob to the worktree and stages
      it through the **existing** `stagePaths` — no new staging primitive.
- [x] **The rebase inversion, tested by name rather than assumed.** Git's own `:2:`/`:3:`
      index-stage convention flips "ours"/"theirs" during a rebase relative to merge: the commit
      being replayed is `theirs`, the branch being rebased *onto* is `ours` — backwards from what
      the person who typed `git rebase` would call their own branch. The function does not correct
      for this; it passes git's own stages through unmodified, and `conflict-resolve.integration.test.ts`
      proves both merge (ours/theirs/base each resolve correctly) and, in two separate `it`s, the
      rebase inversion itself. (Two separate tests, not one calling both sides on the same path: `git
      add` collapses stages 1/2/3 into one stage-0 entry the moment the first side is accepted, so a
      second call against an already-resolved path would have nothing left to read — caught by an
      actual test failure during development, not anticipated up front.)
- [x] **Wired end to end**: `mstudio:op:conflict-resolve-whole-file` channel + `ConflictResolveWholeFileRequest`
      schema in `shared`, a new `packages/desktop/src/main/ipc/conflict-handlers.ts` (thin, no logic
      of its own — matches every other write-path handler), preload + bridge type additions. No UI
      consumer yet — that's Theme D.

**Process note, not a phase finding:** this batch's implementation was accidentally started
directly in the primary checkout instead of a worktree. Caught before committing (`git status`),
recovered via `git stash push -u -m <tag>` in the primary checkout, a proper worktree created from
a fresh claim-commit on `main`, `git stash apply <sha>` (not `pop`) into the worktree, then the
stash entry dropped once safely applied elsewhere. No data lost; flagged here as a reminder to
`cd` into the worktree *before* the first file write, not just before the first git command.

## 2026-09-03 — Phase 41 Theme E — the terminal inside a running card

[PR #90]. The phase's last real building block: a card's agent has been headless until now (only
the `>_` button, opening the *main* terminal panel) — this puts a small live xterm directly inside
the card while it runs.

- [x] **`board/card-terminal.tsx`**, through `LazyTerminalView` only (a direct `terminal-view`
      import would undo Phase 36's lazy-chunk split), with a "pop out to Terminal view" button
      reusing `revealSession`.
- [x] **New viewport-driven mount machinery**, with no precedent anywhere else in the app (both
      existing multi-xterm hosts mount everything they own): `use-card-visible.ts`, a
      feature-detected `IntersectionObserver` hook treated as permanently off-screen (not on) when
      unsupported; `card-terminal-mounts.ts`, an ordered-wanters cap at **4 concurrently-mounted
      card terminals** matching the FAB's own ceiling, since Chromium's WebGL context eviction
      degrades an xterm to the DOM renderer *permanently*.
- [x] **`card-activity-line.tsx`** — the off-screen/collapsed fallback, free and correct by
      construction: `useAgentActivity()` tracks activity in the store regardless of what's mounted.
- [x] **`terminal-view.tsx` gains an `autoFocus` prop** (default `true`, every existing call site
      unaffected) so a card scrolling into view — genuinely visible, unlike every other inactive
      pane — never steals keyboard focus from wherever the user actually was.
- Self-review caught two real bugs before merge: the card's own click-guard was swallowing clicks
  on the plain activity-line status pill too (only the terminal needed it), and
  `useCardTerminalSlot` read the mount registry before its own registering effect had run, flashing
  the over-cap fallback for one frame on a card with a genuinely free slot. CI then caught a third:
  `kanban.spec.ts` asserted exactly one `.xterm-screen` on the whole page after revealing a card's
  session, which the card's own new terminal now legitimately makes two — rescoped to the panel.

## 2026-09-03 — Phase 43 Themes A, B, C, D — the workflow engine, backend-complete

[PR #92]. The whole main-process half of Workflows, with no renderer: contracts, engine,
executors, and a real local CRUD API to run against. Themes E–G and I (the canvas, the
inspector, the run view, the settings page) stay open.

- [x] **Theme A — the contract.** `shared/src/workflow.ts`: `Workflow`/`WorkflowNode`/`WorkflowEdge`/
      `WorkflowRun`/`WorkflowNodeRun`, with `WorkflowNode` a `discriminatedUnion('kind', …)` over
      exactly five literals so node #6 is a compile error at every exhaustive `Record`, not a value
      slotting into a union nobody widened. Node `x`/`y` are plain floats — the canvas snaps on
      drop, the schema must not, or an imported workflow with fractional positions fails to parse.
      Seven `mstudio:workflow*`/`mstudio:demo-api*` channels plus one bare `workflowRunChanged`
      event (`loopRunsChanged`'s exact reasoning: a per-node payload needs an ordering guarantee
      and a reconciliation story, a ping plus a re-fetch needs neither). `GitOpResultOf` reused
      rather than rebuilt. `ipc.test.ts` gains the opt-in `describe('workflow contract')` block —
      **proven to fail when one channel's `CASES` row is deleted**, which is the whole point:
      those guards are prefix-scoped, so without a block a `workflow*` channel ships validated
      only against "unique name" and "`mstudio:` prefix".
- [x] **Theme B — the engine.** `workflow/workflow-engine.ts`: Kahn's algorithm run for its
      *remainder* (a non-empty one **is** the cycle, reported against the offending edge before the
      first node launches — not a hang), independent branches in parallel capped at 4 in flight
      (`SEARCH_CEILING`'s number), and a join before any node with more than one input. `withRunLock`
      copied from `council-runner.ts` verbatim, `prior.then(fn, fn)` and the `evictIfCurrent` prune
      included — asserted at `runLocks.size === 0` after every terminal run. **Locked sections never
      nest**, which is what dictates the driver's shape: mutate under the lock, return a claim list
      out of it, start the claimed nodes outside it. The run's node+edge snapshot is built and
      persisted *before* anything launches, so editing the graph mid-run cannot rewrite history or
      strand a node on an edge that just went away. The 120 s per-node deadline rides an **injected
      clock seam** rather than `vi.useFakeTimers` — fake timers fight the real promise scheduling
      around `fetch`/`await`, and the seam makes the same test run in 20 ms. Cancelling a 5-node run
      leaves zero nodes `pending` and zero `running`.
- [x] **Theme C — the executors.** `http` on Node 22's global `fetch`, no new dependency. **A
      non-2xx is `ok: true`** with the status recorded — a 404 is a result a downstream `condition`
      interprets — and only a transport failure or the deadline is a node failure; the docblock says
      so, because it is counter-intuitive. Responses cap at `COUNCIL_OUTPUT_CAP_BYTES` through
      `appendCapped`, stop pulling bytes off the wire once the cap bites, and carry the `truncated`
      flag into the recorded output; a truncated JSON body is deliberately **not** claimed as JSON,
      since it is no longer valid. `QUERY` is modelled as `method: 'GET'` + `queryShaped: true`
      rather than a seventh method literal, so `method` always holds something `fetch` can send.
      `{{node.dotted.path}}` lives in its own pure `workflow/interpolate.ts` with a `{{{{` escape,
      numeric segments for array indices, and — the point of the module — **an unresolved reference
      fails the node** with `Cannot resolve {{a.b}} — node "a" has no field "b"`, never an empty
      substitution that silently POSTs `undefined`. Plus `transform` (path picks, no JS eval),
      `condition` (a false predicate is a *success* that records `gatedDownstream`, so the step that
      ran is not mislabelled `skipped` — only its dependants are), `delay` (bounded in schema, and
      it notices a cancel rather than sitting out 60 s) and a no-op `note` entry that keeps the
      registry `Record` exhaustive instead of a `default` arm absorbing node #6.
- [x] **Theme D — the demo CRUD API.** `demo-api/{server,routes,store}.ts`: `node:http` on
      **`127.0.0.1` and an ephemeral `listen(0)`** — never `0.0.0.0`, never a fixed `:7331`; the
      bind address is what makes an unauthenticated CRUD server unreachable from another machine,
      and the test asserts a connection to the machine's LAN IP on that port is refused. Every verb
      with the codes a workflow author will actually test (201 + `Location`, 404, 204, 400 on
      unparseable JSON, 405 with `Allow`), `PUT` replacing where `PATCH` merges, `?limit`/`?offset`
      plus arbitrary-field filters so the QUERY-shaped GET has something to query, collections
      created by writing to them, and 1 000 records per collection with the oldest evicted.
      `closeAllConnections()` before `close()` on `before-quit`, or a keep-alive socket makes the
      quit visibly slow. **Theme C's executor suite uses it as its fixture** through one named seam
      (`fixture-server.ts`), so the whole executor file passes with the network cable out.
- [x] **Theme H, partially — the two stores and the handler registration, landed early.**
      `workflows-store.ts` + `workflow-runs-store.ts` (separate files, because config and run
      history have different write profiles), `workflow-service.ts`, `ipc/workflow-handlers.ts`,
      `ipc/demo-api-handlers.ts`, the `workflow`/`demoApi` preload namespaces and
      `configureWorkflows` at boot. Wiring the contract now rather than later was a deliberate call:
      the preload namespace union makes a missing member a **compile error**, which is the cheapest
      guard in the contract and free. The run-history cap is **per workflow (20)**, not one global
      figure, so a workflow you run in a loop cannot evict the history of one you run twice a week —
      and it is applied at every write site, not only in the store's own save (Phase 45 Theme D's
      lesson). Deleting a workflow with a run in flight is **refused** with `{ok:false}` naming the
      reason rather than silently cancelling work the user may not know is running.

## 2026-09-03 — Phase 46 Theme G + Phase 47 Theme A

[PR #63]. Two unrelated, self-contained slices in one batch.

- [x] **Phase 46 Theme G — verification and screenshots, closing the phase's build half.**
      `lock-screen-shots.spec.ts`: a committed, `MSTUDIO_SHOTS`-gated Playwright spec shooting the
      full lock screen (weather top-centre, battery + sysmon bottom-right, the navigating pills)
      across `motion ∈ {full, reduced}` × `theme ∈ {light, dark}` — 4 shots, replacing PR #55's two
      ad hoc throwaway-script PNGs. The Phase 38 `ControlOrMeta` lesson doesn't apply here: the spec
      presses no modifier chords at all. Phase's remaining open items are the `## Verification`
      section's human keyboard/eye passes, same posture as Phases 36/37/39.
- [x] **Phase 47 Theme A — the conflict data model + parser, the phase's foundation.**
      `ConflictRegionSchema`/`ConflictedHunkSchema` in `shared/src/domain/conflict.ts` (zod only); a
      new `git-engine/src/parsers/conflict-parser.ts` walking `readFileDiff`'s literal
      `<<<<<<<`/`|||||||`/`=======`/`>>>>>>>` marker text into `context`/`conflict` segments,
      supporting both the default 2-way and `diff3`'s 3-way style. Round-tripped against real git
      merge output for both styles, not just hand-written fixtures. A markerless file parses to zero
      regions rather than throwing. Themes B–F (whole-file resolution, hunk-level patch application,
      the Studio UI, council-assisted suggestions, wiring) remain open.

## 2026-09-03 — Phase 48 Themes B, C, D, E — apply GitHub suggestion blocks to the working tree

[PR #62]. The rest of the phase, on top of Theme A's suggestion-fence parser (PR #51).

- [x] **Theme B — line-range resolution.** `suggestionLineRange(thread)` in `suggestion-block.ts`:
      `(thread.startLine ?? thread.line)` through `thread.line`, the first consumer of `startLine` —
      every existing renderer anchors off `line` alone. `null` for a `LEFT`-side thread; Apply is
      never offered there at all, not disabled-with-a-reason.
- [x] **Theme C — local-file divergence detection, the phase's real weight.**
      `checkSuggestionApplies` + `expectedRightSideText` compare the local file's current content at
      the resolved range against what the PR's own diff says is there (walked off `FileDiff`'s
      hunks), independent of `fsWriteFile`'s own `expectedVersion` check. Fails closed on a mismatch,
      an unverifiable gap in the diff, a deleted local file, or an already-`outdated` thread.
- [x] **Theme D — rendering + the write.** `comment-thread.tsx`'s `CommentBody` gains a `code`/`pre`
      override rendering a `suggestion` fence as a struck-through/added preview (styled off
      `DiffCell`'s own add/del tokens, matching `slide-code.tsx`'s `language-(\w+)` detection
      pattern) plus an Apply button that reads the local file eagerly — disabled, with the reason as
      its `title`, before any click — and on click splices the suggestion over the range and calls
      the existing `fsWriteFile` IPC. Never auto-stages, auto-commits, or resolves the thread.
- [x] **Theme E — wiring + verification.** Full gate green; integration tests for the happy path,
      every Theme C refusal path with its specific reason asserted, and a containment test proving
      the write's `relPath` is always the thread's own path verbatim.

A real defect was caught and fixed in review, not just in the plan: `spliceSuggestion` originally
rejoined the *whole* file with a bare `\n` after stripping `\r` for comparison, so applying one
suggestion to a CRLF file would have silently converted every other line's ending too — fixed to
rejoin with whichever ending the local file actually uses, with a regression test. Both open
decisions the phase doc left behind were taken as recommended: a partial/fuzzy match fails closed,
and the removed/added preview stays the simple all-struck/all-added rendering GitHub's own preview
uses, no real line-diff. Theme E's one human-only item (a real github.com suggestion round-tripped
against a real checkout, confirming line endings/encoding survive) stays open by design.

## 2026-09-03 — Phase 46 Themes A, C — the lock screen weather widget, pills that navigate

[PR #55]. The last two build items in Phase 46, landed after Themes B/D/E/F (PR #53) had already
shipped the corner-slot layout and motion-policy fix underneath them.

- [x] **Phase 46 Theme A — weather, top centre.** A new `packages/app/src/features/weather/`
      module shaped like `features/finance/` (`weather-api.ts`, `weather-queries.ts`,
      `weather-derive.ts`, `weather-store.ts`), Open-Meteo (keyless) for both geocoding and the
      current-conditions forecast, WMO weather codes mapped to `react-icons/lu` glyphs (no new
      icon dependency), and a location search-and-select field on the Screen Lock settings page
      mirroring `finance-panel.tsx`'s `WatchlistEditor`. `LockScreenWeatherWidget` slots
      `top-centre` via Theme D's already-landed corner layout; renders nothing until a location
      is set and nothing on a fetch failure. The doc's literal `enabled: screensaverOpen` query
      gate was not implemented as a boolean flag — the widget only ever mounts while the lock
      screen (or the landing page, which shows the same corner widgets) is actually showing it,
      which already stops react-query's refetch interval, matching the ungated posture the
      sibling fintech/sysmon widgets already have.
- [x] **Phase 46 Theme C — pills that navigate.** The four count pills in `screensaver-stage.tsx`
      became real, keyboard-reachable `<button>`s with a destination each, via a new
      `applyPillDestination` (`repos`→`setReposOpen(true)`, `agents`→`setTerminalOpen(true)`,
      `myPrs`/`teamPrs`→`setActiveView('reviews')` — the doc's `setActiveView('repos')` corrected,
      since there is no `'repos'` `ViewId`). A pill click stops propagation so `LockScreen`'s own
      dismiss/unlock handler never swallows it; behind a passcode the destination is held in local
      state, applied on unlock, dropped on cancel, via a second independent `PasscodeUnlockDialog`.
      **Found only by testing in a real browser**, not a `fireEvent`-based unit test: `LockScreen`'s
      own "any key opens my dialog too" `keydown` listener doesn't know about the pill's own
      dialog, so typing the pill's passcode used to also pop a *second*, redundant dialog
      underneath it — fixed with a new `suppressUnlockTrigger` prop on `LockScreen`. And the
      pill's dialog, first tried as a sibling `document.body` portal, sat under `LockScreen`'s own
      `z-[200]` backdrop and silently ate every click on it — fixed by nesting it inside
      `LockScreen`'s own children instead of a separate portal.

Theme F's one remaining item (a test asserting the weather query's gate) is left `◻` rather than
falsely checked — there is no boolean gate to assert on, per Theme A's note above. Theme G
(screenshots in both motion modes/both themes, `ControlOrMeta` coverage) stays `◐ PARTIAL`: its
unit-test bullet is satisfied by this batch, the Playwright-shots and chord-convention bullets are
not.

## 2026-09-03 — Phase 49 Themes B, C, D, E (partial) — the onboarding kit's plan/apply engine, Setup dialog, and menu wiring

[PR #TBD].

- [x] **Theme B — the contract in `shared`.** `ScaffoldPlan`/`ScaffoldEntry`/`ScaffoldApplyResult`
      zod schemas and the `.midnite/settings.json` hash manifest, plus two IPC channels
      (`scaffold.plan`/`scaffold.apply`) keyed by `repoId` only, on the house `{ok}` envelope.
- [x] **Theme C — plan and apply in main.** `desktop/src/main/scaffold/`: sha256 classification
      into create/unchanged/stale/locally-edited, confinement through the existing
      `fs-scope-write.ts` (a new `ensureConfinedDirs`, since a fresh repo has neither
      `.claude/skills/<name>/` nor `.midnite/tasks/phases/` yet), a re-check immediately before
      each write, and the manifest written last. Corrected `unchanged`'s definition to a direct
      hash match against the current template rather than requiring the manifest to agree too —
      same outcome, simpler rule.
- [x] **Theme D — the Setup dialog.** A modal preview grouped by status, `locally-edited` entries
      excluded from the write and said so up front, Apply/result/error states. Found building it: a
      dialog rendered inline inside the (virtualized) repo row had its `fixed inset-0` overlay
      contained by a transformed ancestor instead of the viewport — caught by the screenshot, not
      the RTL tests — fixed with a `createPortal` to `document.body`.
- [◐] **Theme E — Update, capability detection and the menu, partial.** A sixth `Project` menu
      group; `isMidniteStudioCheckout` gating Update with a `disabledReason` elsewhere. Two real
      corrections: `AgentCommandId`/`DEFAULT_AGENT_SKILLS` do not widen — Setup and Update are built
      directly in `midnite-menu.tsx`, since neither is a user-configurable skill the way every other
      leaf is; and `startAgent` is the wrong mechanism for Update's literal command — it always
      wraps its prompt as an agent-CLI argument, which would have typed
      `claude 'moon run desktop:install-local'` instead of running the command verbatim.
      `repo-lifecycle.ts`'s `runLifecycleAction` (the phase doc's own precedent) is what Update
      actually mirrors: a plain shell session, command queued raw. Still open: the packaged-build
      pre-flight surfacing in the menu, and Theme A's own packaged-build assertion.

## 2026-09-03 — Phase 22 Themes C, D

[PR #52]. Stashes reach the graph and become readable: pseudo-rows above the commit list, and a
three-part inspector reusing Phase 12's file-list/diff machinery wholesale.

- [x] **Phase 22 Theme C — stashes in the graph.** `features/graph/stash-rows.tsx`: pseudo-rows
      above the `role="grid"` scroller, beneath `UncommittedRow` and sharing its dashed-ring/
      dashed-lane/italic visual grammar — no fake sha is invented to smuggle a stash into
      `graph-store`/the virtualizer's index space. Collapses past two entries into an overflow row
      that expands the sidebar's `Stashes` section if it's closed. Selecting one drives a new
      discriminated `graphSelection: {kind:'commit',sha} | {kind:'stash',selector} | null` in
      `ui-store.ts`, replacing the old commit-only `selectedCommitSha` — the sidebar's own
      `StashRow` is now also clickable and lands in the identical panel. Rows disappear on the same
      `'refs'` watch invalidation Theme B already wired for `keys.stashes`.
- [x] **Phase 22 Theme D — a stash you can read.** `readStashDetail`/`readStashFileDiff` in
      `commands/stash.ts`: the tracked and untracked parts reuse `readCommitFileDiff` unchanged
      (`git show`'s own `-m --first-parent` and a rootless commit's empty-tree diff already answer
      correctly), and a new `readRefDiff` in `diff.ts` answers the index part's genuine two-ref
      `stash@{n}^1..stash@{n}^2` diff, which `git show` cannot express. New
      `mstudio:stash:detail`/`mstudio:stash:diff` channels, each with their own schemas
      (`StashDetailSchema`/`StashDiffFileSchema`/`StashPartSchema` in `shared/src/domain/stash.ts`)
      rather than reusing the generic diff contract. `features/stash/stash-inspector.tsx`: three
      labelled `TreeSection`s — tracked, staged-at-stash-time, untracked — over the shared
      `ChangeTree`/`DiffView`, not tabs (mirrors how the Changes panel splits staged/unstaged).
      Apply/Pop/Branch/Drop ship as header icon actions calling the exact same
      `useTargetedStashApply`/`Pop`/`Branch`/`Drop` hooks the sidebar's `stashMenu` already uses — a
      second consumer, not a second copy.

## 2026-09-03 — Phase 46 Themes B, D, E, F — battery widget, a declared corner layout, motion policy fix

[PR #53]. Three phases in a row (37 F, 39 G, 42 F) each left reduced motion as an unfinished
trailing item; this batch closes it for good, plus the two lock-screen build items that motivated
touching the layout.

- [x] **Phase 46 Theme B — battery, bottom right.** `LockScreenBatteryWidget` in
      `lock-screen-widgets.tsx`, pure reuse of the existing `features/battery/` icons/panel and the
      metrics sample's already-optional `BatteryReadingSchema` — no new IPC, sampling, or schema.
      Stacks above the sysmon widget in the same corner rather than displacing it; renders nothing
      on a machine with no battery.
- [x] **Phase 46 Theme D — the corner layout becomes data.** `lock-screen-slots.tsx`'s
      `LockScreenSlotIsland` replaces three hard-coded `absolute` positions across
      `lock-screen-widgets.tsx`/`lock-screen-chrome.tsx` with one declared slot map (`top-left`,
      `top-centre`, `top-right`, `bottom-left`, `bottom-right`), owning the
      `pointer-events-none`/`pointer-events-auto` split so a future widget can't get it wrong.
- [x] **Phase 46 Theme E — the motion audit.** Root cause: `useMotionPreference` (`app.tsx`) and
      `useAppearanceSync` (`appearance-store.ts`) both wrote `data-motion`, and only one resolved
      `'system'` — so on the default preference the attribute literally read the string `'system'`,
      matching none of `styles.css`'s guards regardless of the OS setting. Fixed via a shared
      `resolveSystemMotion()`/`useResolvedMotion()` (`appearance-store.ts`); the two writers now
      agree instead of racing. Gave every convertible guard in `styles.css` (14 rules) a
      belt-and-braces `@media (prefers-reduced-motion: reduce)` + plain-attribute pair — a
      pure-`@media` first attempt broke three existing e2e specs (`fab-loops`, `titlebar-agents`,
      `terminal`) that assert reduced motion by setting `data-motion` directly, without emulating the
      OS query; CI caught it, and the fix matches `panel-stack-pane`'s (Phase 42) own prior art rather
      than treating it as a one-off exception. Deleted the byte-identical duplicated `pill-shimmer`
      block, taught `NeuroCloudBackground`'s canvas rAF loop to consult the setting directly (a media
      guard cannot reach a JS animation loop), and rewrote `councils.spec.ts`'s own Theme F suite
      (Phase 42) where it had been asserting the pre-fix bug as expected behaviour. Closes the motion
      half of [Phase 39 Theme G](phases/phase-39-status-bar-shortcut-rail.md)'s remaining
      `◐ PARTIAL` item.
- [x] **Phase 46 Theme F — a guard that can't be forgotten.** `styles-motion-guards.test.ts`: every
      `@keyframes` in `styles.css` must be referenced by a guarded rule or explicitly allowlisted
      with a reason (one entry: `shake`), plus a no-duplicate-`@keyframes`-name assertion — the bug
      this phase found by reading. Modelled on `icon-names.test.ts`.

Themes A (weather), C (clickable pills) and G (screenshot verification) remain `◻ TODO`.

## 2026-09-03 — Phase 22 Themes B, E, F, G + Phase 45 Themes E, F + Phase 49 Theme A + Phase 48 Theme A

[PR #51]. A large batch, four phases: stash reaches the sidebar and the Changes view, force-push
gets a lease, the reflog gets a real tab, six process leaks are fixed and verified, the onboarding
kit ships as a checked-in template, and PR-suggestion detection lands its first piece.

- [x] **Phase 22 Theme B — stashes in the sidebar.** A `Stashes` `TreeSection` in `repos-panel.tsx`,
      `hideWhenEmpty={false}` (deliberately — the heading's own action is the only way to create a
      repo's *first* stash), a `StashRow` (message + relative age, no file-count chip — `StashEntry`
      carries none), and a `stashMenu`/`promptStashPush` pair built parallel to `refMenu` rather than
      forced through `RefSectionKey` (a stash is not a ref). `keys.stashes(repoId)` nests under
      `keys.repo`; `watch-invalidation.ts`'s `'refs'` case confirmed to cover it already.
- [x] **Phase 22 Theme E — stash from the Changes view.** A "Stash changes" toolbar action (whole
      worktree, disabled with a reason at zero changes) and a per-row "Stash file" action, both
      opening a dedicated `StashPushDialog` (not the generic one-field `dialogs.prompt`) with
      keep-index/include-untracked as unchecked-by-default checkboxes. Reuses Theme B's
      `useStashPush`.
- [x] **Phase 22 Theme F — force-push, with a lease.** Reverses `CLAUDE.md`'s "no force-push"
      rule on record, in all three convention files plus `sync.ts`/`schemas.ts`/`sync-controls.tsx`.
      `forceWithLease: {ref, expect}` — never a boolean, never bare `--force-with-lease`. New
      `'non-fast-forward'`/`'stale-lease'` `GitOpFailure` codes. Entry point is the per-ref badge
      menu, offered only after a plain push from that menu came back non-fast-forward, behind a new
      `Settings ▸ Git Safety` opt-in (not `▸ Repositories` — no such page exists). `expect` is read
      from the graph's own `refs` query, not a fresh IPC call (`RevParseRequest` is deliberately
      hex-only).
- [x] **Phase 22 Theme G — the reflog, read and browsable.** `readReflog` via
      `git reflog show --date=unix -z`; the doc's own `%gt` placeholder doesn't exist in real git
      (confirmed directly) — `--date=unix` on `%gd`/`%gD` is what actually carries a per-entry
      timestamp, verified against a real reset (whose reflog entry lands at-or-after the reset, not
      at the target commit's own date). `oldSha` isn't a git placeholder either — paired by fetching
      `limit + 1` records. Replaces Theme H's honest `ReflogList` placeholder with the real ref
      selector / action filter / checkout-able, copy-able list. `.git/logs` rides the existing
      `'refs'` `WatchKind`.
- [x] **Phase 45 Theme E — the six small leaks, one commit each.** `council-runner.ts`'s `runLocks`,
      `tests-handlers.ts`'s `inFlight`, `log-service.ts`/`search-service.ts`'s release-on-reject gap
      (`.then()` → `.finally()`), `terminal-store.ts`'s `dropKey` missing the `legacy` field,
      `browser-service.ts`'s un-detached `webContents` listeners, and `gh-cli.ts`'s unbounded
      workflow cache (now sharing the run cache's LRU).
- [x] **Phase 45 Theme F — verification, run for real.** Extended `retention.spec.ts` to `repo` and
      `browser-tabs` (previously `terminal`-only) and actually ran it — twice, since the first run
      found two real issues: `memory-report.mjs` never re-exported the `electron-run.mjs` helpers
      `retention.spec.ts` needs (the spec had never actually been run before), and `browser-tabs` at
      10 cycles read a false-positive leak that Chromium's own subprocess-pool warm-up explains
      (checked by hand: ~742 KB/cycle at 10 cycles, ~230 KB/cycle at 20). Both fixed; all three
      actions pass for real now.
- [x] **Phase 49 Theme A — the onboarding kit.** `templates/midnite/` — a checked-in skeleton, not a
      snapshot of this repo's own 1.8 MB `.midnite/` — carrying the tracker skeleton, eight
      repo-agnostic skills mirrored into `.claude`/`.agents`/`.codex` (genericized: every
      "Midnite Studio"/package-path/org mention replaced or placeholdered), and `CLAUDE.md`/
      `AGENTS.md`/`GEMINI.md` stubs. `electron-builder.yml` ships it as an `extraResource`;
      `template-path.ts`'s `templateRoot()` resolves it dev-vs-packaged, mirroring `window.ts`'s
      `rendererEntry()`. `midnite-setup/SKILL.md` (and its two mirrors, found drifted independently
      of this fix) now emits this same tree instead of a hand-described `todo/` layout.
- [x] **Phase 48 Theme A — suggestion detection.** `extractSuggestion(body)` walks the same mdast
      tree `deck-parser.ts` already builds (`remark-parse` + `remark-gfm`) for a ` ```suggestion `
      fence anywhere in the tree, depth-first in document order — the first of two fences wins,
      documented rather than an oversight.

## 2026-09-02 — Phase 42 Themes E, F + Phase 38 Themes G, I (partial) — councils/runs share the rail, motion proven, a wrong CI diagnosis corrected

[PR #TBD].

- [x] **Phase 42 Theme E — councils and runs share the panel.** `council-run-list.tsx` (new)
      replaces the old horizontal run-picker strip with a vertical list in the left rail, rendered
      by a second `PanelStack` that shares the centre pane's `history` object — moving between
      "which council" and "which run of it" is one back/forward motion in one place.
      `councils-history-store.ts` (new) moves the navigation stack out of a component-local
      `usePanelHistory` call into a module-level zustand store, since Councils is lazy and unmounts
      on view switch — the stack now survives leaving the view and coming back. `council-run-view.tsx`
      lost its own run-picker and the unused `councilId` prop that went with it.
- [x] **Phase 42 Theme F — motion, proven.** Fixed the exact mistake its own doc warned against
      repeating (Phase 39 Theme G's cautionary tale): `.panel-stack-pane`'s reduced-motion rules in
      `styles.css` needed `!important,` because `panel-stack.tsx` sets `transitionDuration` as an
      inline style, which beats any non-`!important` external rule regardless of specificity. Caught
      by three new `e2e/councils.spec.ts` cases asserting the real `transitionDuration` in all three
      motion configurations — `data-motion='reduced'`, `data-motion='full'` under OS reduce-motion,
      and the default `'system'` + OS reduce-motion blind spot, which is the one that failed first.
- [◐] **Phase 38 Theme G — the five stragglers, partial.** Two were real, both confirmed on an
      actual CI run: `footer-monitor.spec.ts`'s cadence marker never appeared because
      `MonitorCluster` and `BatterySegment` each subscribe to the metrics stream independently,
      double-pushing every sample into the store (fixed by sharing one subscription, ref-counted,
      in `use-metrics-stream.ts`); its ring/path-count assertion was a test-scoping bug, counting a
      metric icon's own `<path>`s alongside the chart's. `browser-pane.spec.ts` was already green —
      also confirmed on CI. `graph-themes.spec.ts`'s two cascade-replay specs looked fixed in an
      isolated local run (24/24) but a **real CI run proved them still red** — a local pass cannot
      be trusted for this one; stays in `KNOWN_RED`, not yet root-caused.
- [◐] **Phase 38 Theme I — the terminal does not render on CI, partial — and a wrong diagnosis
      corrected mid-batch.** First attempt: forced xterm's own DOM renderer under Playwright
      (skip `WebglAddon`), following the original phase doc's WebGL theory. Green locally (38/38,
      forced on, macOS) — but on the real CI run several terminal specs **timed out** and one shard
      hit the 20-minute job cap and was **cancelled**. Triaging that led to the real cause: the
      terminal panel was never opening on CI at all, for any of these specs — `chord.ts`'s
      `isMac()` reads `navigator.platform`, genuinely `'Linux'` on the CI runner's Chromium (the
      packaged app ships macOS-only, so this never happens for a real user), and on a non-mac
      platform a bare Ctrl press resolves to `Mod`, so `Control+\`` (every affected spec's own way
      of opening a terminal) never matches `terminal.toggle`'s literal `Ctrl+\`` binding. Fixed once,
      for every spec, by pinning `navigator.platform` to `'MacIntel'` in `mock-bridge.ts`'s
      `installMockBridge` — reproduced locally by pinning the OTHER way first (simulating Linux) and
      confirming the panel genuinely fails to open without the fix. The DOM-renderer forcing was
      fully reverted (production and e2e both try WebGL first again, unchanged). Drops
      `phase-21-roster.spec.ts`, `terminal-lazy-preload.spec.ts`, `terminal-reveal.spec.ts` and
      `terminal.spec.ts` (including its PR #47 "new sighting" — the same wall) from `KNOWN_RED`, and
      the `@linux-red` tag from six specs across `fab-loops.spec.ts`, `terminal-links.spec.ts`,
      `reviews.spec.ts` and `palette.spec.ts`. **Still open**: the theme's other, unrelated Linux-only
      cause — `shortcut-rail.spec.ts`/`status-bar.spec.ts` asserting a font-metric-dependent density
      breakpoint. A DOM-measurement fix (`status-bar-density.ts`) was tried and reverted: it addressed
      a later assertion in each spec, but the real CI run failed on an earlier, untouched one (that
      the fixture starts in `full` density at all) — not exercised the same way on a real-GPU macOS
      run. `grepInvert` stays in `playwright.ci.config.ts`: those two plus `titlebar-agents.spec.ts`
      and `panel-snap.spec.ts` still carry `@linux-red` tags.

## 2026-09-02 — Phase 41 Themes D, G, H (partial) + Phase 38 Theme D (partial) — the card composer, and CI's own correction

[PR #47]. Rebased mid-flight onto #46 (Phase 41 Themes C/D/F), which landed the `kanban` surface
this PR originally built in parallel — that duplicate work was dropped in favor of consuming #46's
`findCardSession`/`findAnyCardSession` directly.

- [x] **Theme D — a session bound to a card, completed.** The one item #46 left open — launching
      from a card starts a broker session via `startAgent({ surface: 'kanban', taskRef, autoSend:
      false })` — now has its call site: Theme G's `CardComposer`. Theme D is fully done.
- [x] **Theme G — the card composer.** `CardComposer` (`board/card-composer.tsx`): an agent picker
      (`RadioRow` pills, defaulting to the repo's most recent launch), an editable prompt seeded
      from a new pure `composeCardPrompt(item, repoPath)` (title/number, url, assignees, labels,
      repo path, body capped at 4 000 chars with a truncation notice), and the literal shell command
      shown above Start. Reads its own session via `findCardSession`/`findAnyCardSession` rather
      than a prop — one live session per card enforced by hiding the form for a Stop button instead
      of a second Start. `SwitchRow`/`RadioRow` hoisted from `loop-composer.tsx` to
      `components/form/toggle-rows.tsx`, generalised off `id`/`label`/`title` rather than
      `LoopModifier`. `ForgeProjectItemContent` (issue/pull) gained `body`/`labels`, fetched by
      `gh-project.ts` — Phase 40 Theme A's original GraphQL read never carried them.
- [◐] **Theme H — binding survives a restart, partial.** `BoardView` now re-homes an orphaned
      `kanban` session back to `main` once its item leaves the board, via a pure `sessionsToRehome`
      and a new `rehomeSession` store action. Hydration-on-open and the asleep-not-ended restore
      were already covered by #46. Two items stay open for a human: quit-and-relaunch against a
      **packaged** build, and an explicit test that switching boards doesn't kill a running session.
- [◐] **Phase 38 Theme D, partial — and a correction worth recording.** Both named specs
      (`terminal.spec.ts:972`/`:1073`) were genuine spec races, not product bugs — fixed with
      `expect.poll` and a `hover()`-before-`boundingBox()` respectively, stable over 3 local runs
      each. **The "drop the file from `KNOWN_RED`" item was attempted, verified green at 38/38
      locally on macOS, and then reverted** once CI (a GPU-less Linux runner) surfaced real
      failures in *other*, unrelated specs — agent-mark assertions hitting exactly the WebGL wall
      `playwright.ci.config.ts` already documents. `terminal.spec.ts` stays in `KNOWN_RED`; Theme I
      owns tagging the actually-affected specs `@linux-red` before it can leave.

## 2026-09-02 — Phase 45 Themes A, B, C, D — retention harness, broker scrollback fix, unbounded run histories

[PR #49](https://github.com/bilo-io/midnite-studio/pull/49). Themes E (the small leaks) and F
(the phase's own verification pass) are not in this batch and stay open.

- [x] **Theme A — the instrument.** `scripts/perf/memory-report.mjs`, driven through the existing
      `electron-run.mjs` (never Playwright's own `_electron.launch`), attaching a CDP client to the
      already-launched packaged app to drive four named actions (open/close a repo, a terminal
      session, browser tabs, `council` refused with a reason) through the real bridge — bypassing
      the renderer's own React/Zustand bookkeeping on purpose, since what leaks in this phase lives
      in main and the broker. Reports RSS per process class (main/renderer/broker/other) as a
      **slope** — median of the last 5 cycles vs the first 5 — not a level. `retention.spec.ts`
      wraps `runRetention()` the way `startup-budget.spec.ts` wraps `electron-run.mjs`. Also ships
      an `MSTUDIO_PERF` heap sampler in main and the broker (`heap-sampler.ts`), and a
      `retainedPerCycleKb` budget in `budgets.json`. Found along the way: `os.tmpdir()`'s macOS path
      plus a dev build's socket name can cross the 104-byte `sun_path` limit, silently falling back
      to an in-process pty that never touches the real broker — `seedProfile` grew an optional short
      `tmpPrefix` for exactly this measurement.
- [x] **Theme B — the sweep, with verdicts.** Every retaining `Map`/`Set` in `packages/desktop`
      audited and marked BOUNDED or LEAKING — full table in the phase doc. `packages/git-engine`
      confirmed clean (bounded LRUs with TTLs throughout), as Phase 36 Theme F predicted.
- [x] **Theme C — the broker's scrollback.** `scrollbackBySession` never deleted a session's bytes
      on pty exit or kill, in the one process that deliberately outlives the app. Fixed at the
      source (delete in both the `onExit` and `kill` handlers), plus a new `forget` `ControlMessage`
      main can send explicitly and a reconcile-on-`hello` backstop for an older broker build's
      leftovers. **Verified with unit tests, not the live retention harness** — a single session's
      2 MB cap sits well inside the RSS noise floor of a short run; three new `server.test.ts` tests
      confirmed to fail against the unfixed code (0 → 17–32 bytes leaked) before passing against the
      fix.
- [x] **Theme D — two unbounded run histories.** `council-service.ts`'s `saveRun` and
      `loop-runs.ts`'s `startLoopRun` both trimmed only the copy written to disk, never reassigning
      the trimmed array back to the in-memory one. Fixed by capping **at write time**, in both
      files, independent of the store's own trim — each with a unit test pushing `MAX + 10` records
      and asserting the in-memory list is exactly `MAX`, oldest dropped.
- [x] One Theme E item landed early: `pty-service.ts`'s `sessionExitHooks` was append-only with no
      `off` — closed while Theme B's sweep was already there to find it.

## 2026-09-02 — Phase 42 Themes A, B, C, D — panel-stack, three panes, config right, back/forward

[PR #48]. Themes E (councils/runs share the rail) and F (motion verification) are not in this
batch and stay open.

- [x] **Theme A — `panel-stack`.** A generic `usePanelHistory<T>` (`components/panel-stack/`):
      push/replace/back/forward/reset, forward-tail truncation, a 20-entry depth cap that
      decrements `index` correctly when dropping from the head, duplicate-push dedup via a caller
      `isSame`. `PanelStack` renders the current entry with a directional slide — **a CSS
      `transition` on `transform`, not `@keyframes`**, so it collapses honestly under the shell's
      universal reduced-motion reset instead of getting pinned to its last frame by luck (the
      Phase 39 Theme G lesson). `PanelHeader` gives it back/forward chevrons and a clickable
      breadcrumb trail. A new `active-panel.ts` module-level registry (not named by the doc) routes
      the global `Mod+[`/`Mod+]` chords to whichever panel is on screen, since `panel-stack` stays
      deliberately store-free. 22 tests across the primitive and the registry.
- [x] **Theme B — three panes.** `councils-view.tsx` rewritten: a resizable left navigation rail, a
      centre output region carrying the `PanelStack` slide (placed there, not in the rail, since
      that's where content actually differs across entries — a correction to the draft), and a
      resizable, collapse-to-rail right configuration panel. `councilNavWidth`/`councilConfigWidth`
      join `LayoutSizes` (no migration needed); `councilConfigCollapsed` is a new top-level
      persisted boolean. The responsive overlay below 900px was cut, per the doc's own
      instruction — a hard `min-w` on the centre region is the honest fallback instead.
- [x] **Theme C — config right, members reorder.** `council-detail.tsx` deleted; its members panel,
      synth-provider select and prompt composer split into a new `council-config-panel.tsx`
      (`border-l` now) and `councils-view.tsx`'s own data orchestration. `@dnd-kit` drag-reorder via
      the unchanged `SortableList`, with a dedicated grip handle (a member card's input/select/
      textarea would otherwise swallow the drag listeners) and `Alt+↑`/`Alt+↓` for the keyboard
      story instead of a `KeyboardSensor`. A new `use-flushable-save.ts` fixes a real, pre-existing
      bug: the old debounce's unmount cleanup cleared its timer without firing it, silently
      dropping an in-window edit. A scoped `components/form/select-field.tsx` replaces the file's
      two identical `<select>`s — the actual, present duplication; input/textarea were left alone.
- [x] **Theme D — back, forward, the crumbs.** Two `useState`s replaced by the `panel-stack`
      entries. **Corrected the drafted `CouncilEntry` type, found by testing, not by reading**: a
      `'run'` entry needs its owning `councilId` alongside it, since `useCouncilRuns` (which
      resolves "latest") is keyed by council, not run — without it, `councils.spec.ts`'s existing
      "running a consultation" spec went from a visible member tab to "No runs yet" the moment a
      run actually started. `Mod+[`/`Mod+]` bound through `keybindings.ts`, and added to
      `TERMINAL_YIELD_COMMANDS` alongside the reload pair — `enabled` gating alone does not keep a
      chord out of a docked terminal panel that can be open regardless of active view, and `Mod+[`
      off macOS is `Ctrl+[`, i.e. `ESC`. Mouse back/forward buttons cut, per the doc's own
      recommendation. `councils.spec.ts` gained a third spec (list → council → run, back twice,
      forward twice) and both existing specs needed scoping fixes for the transition's dual-mounted
      panes.

## 2026-09-02 — Phase 41 Themes C, F, D (partial), I (partial) — drag, glow, the surface fix

[PR #TBD]. Batch built without Theme G (card composer) or Theme E (in-card terminal) — both stay
open, and Theme D/I are marked partial because of it.

- [x] **Theme C — drag between columns.** `@dnd-kit` `useDraggable`/`useDroppable` (not
      `SortableContext` — within-column order is read-only), `closestCorners` collision, one
      shared `moveItemToColumn` behind both the drop and a new "Move to ▸" context menu (the
      keyboard-accessible path — deliberately not bound to `Enter`, which Theme B already gave to
      opening the card detail). Optimistic: the card moves on drop and rolls back with GitHub's own
      error text on a refusal. Found in the doing: "No status" cannot be a drop target — clearing a
      field is `clearProjectV2ItemFieldValue`, which Phase 40 never built. "Pause invalidation
      while dragging" turned out unnecessary once the move lives in a local overlay rather than the
      query cache. Gated on `forgeWritesEnabled` like every other forge write.
- [x] **Theme F — the running glow.** A new `.card-run-glow` CSS class (not `.loop-run-glow`
      reused verbatim — one solid `loopGlowColor()` hex, not the shared rainbow ramp), three states
      plus idle, driven by a new `useCardStatus()`/`deriveCardGlowState()`. `BoardView` calls the
      existing `useWindowFocusGate` itself (it already supports concurrent hosts) rather than a
      hoist to `app.tsx`. Needed one unplanned addition: a scoped `hydrate()` call on board mount,
      or the glow is inert on a fresh boot — nothing else calls `hydrate()` before a card could ask
      about a live session.
- [◐] **Theme D — a session bound to a card (partial).** `'kanban'` added to
      `TerminalSurfaceSchema`, `taskRef` added to `TerminalSessionSchema`'s object literal (flows
      through `TerminalSaveRequest` for free), all five `'fab'`-shaped surface checks fixed and
      tested, `findCardSession`/`findAnyCardSession` added. **Not built**: the actual
      `startAgent(..., surface: 'kanban')` call — that trigger point is Theme G's card composer,
      out of this batch.
- [◐] **Theme I — verification (partial), scoped to what shipped.** `applyOptimisticMove` +
      rollback (`board-dnd.test.ts`), the glow-state function, the surface-predicate regressions,
      `taskRef`'s IPC-boundary round trip via `TerminalSaveRequest.parse()` (the assertion that
      catches the zod-strip the phase doc names), and `e2e/kanban.spec.ts` (drag between columns,
      rejected-drop rollback, writes-disabled gating, the running glow). **Not built**:
      `composeCardPrompt`, `taskRef` reconciliation — Theme G/H's own functions, which don't exist.

## 2026-09-02 — Phase 40 Theme G (partial) — the assembled-app Playwright coverage

[PR #45](https://github.com/bilo-io/midnite-studio/pull/45). The union-narrowing and command-construction rules Theme G calls out already had their
own Vitest suites (`gh-project.test.ts`, `gh-project-write.test.ts`, alongside E/B); this lands
the one thing only the assembled app can show.

- [x] `e2e/projects.spec.ts` against the mock bridge: picking a board gates the item fetch (zero
      fetches with none picked); editing a single-select is **not optimistic** — disable, mutate,
      refetch, never a value painted before `gh` answers; a refused write restores the prior value
      and shows `gh`'s own error text rather than a generic message; the missing-`project`-scope
      state renders `gh auth refresh -s project` verbatim and copyable.
- [x] `mock-bridge.ts` grew a `forgeProject` fixture namespace mirroring the real bridge's split —
      `list`/`fields`/`items`/`setField`/`addItem` — with `setField` mutating the seeded item's
      `fieldValues` in place so a refetch actually shows the new value, the same device
      `reviewComment` already uses.
- Two Theme G items remain, both human-only: screenshots, and a real pass against a genuine
  org-owned and user-owned board.

## 2026-09-02 — Phase 41 Theme B — cards, chips, detail pane, the first per-container virtualizer

[PR #43](https://github.com/bilo-io/midnite-studio/pull/43). Resolves the phase doc's own
recorded Decision the way it predicted: Phase 40 Theme E's inline field editors were not
importable, so this theme extracts them.

- [x] **Extracted Phase 40 Theme E's editors** into `features/projects/field-editor.tsx`
      (`ProjectFieldCell`, its `SingleSelectEditor`/`TextLikeEditor`, `formatFieldValue`) — the
      table adopts the extracted version unchanged, no behavior change there.
- [x] **`TaskCard`**: title, type glyph, `#number` linked out for issues/PRs (a draft has neither
      — no dead link), assignee avatars via GitHub's own `<login>.png` convention, a chip per
      non-`Status` field with a value. **No labels row** — corrected: `ForgeProjectItemContent`
      carries no labels field at all, so the doc's claim did not survive contact with the
      contract.
- [x] **`CardDetail`**: clicking a card opens a right-hand pane, every field editable through the
      same `ProjectFieldCell` the table uses. No agent composer — Theme G doesn't exist yet.
- [x] **`VirtualizedColumnItems`**: the app's first per-container virtualizer, gated at a 50-card
      threshold so a small column (the common case) skips the machinery entirely.

## 2026-09-02 — Phase 41 Theme A — the Agentic Kanban board shell

[PR #42](https://github.com/bilo-io/midnite-studio/pull/42). Resolves the phase's own
"hard-blocked on Phase 40" banner — every one of the seven things it named as missing landed
across Phase 40's PRs (#38, #41) — and confirms the doc's own prediction that Theme 40 E's inline
editors would not be reusable, so this phase builds its own for Theme B's card detail.

- [x] **Theme A**: a `[ Table | Board ]` toggle in the Projects view header, `projectsMode:
      Record<repoId, 'table'|'board'>` persisted per repo (a mode, not a route — `ViewId` and
      `FORGE_GATED_VIEWS` untouched, the forge gate inherited for free). `deriveColumns` — a pure,
      exported function turning the project's `Status` single-select field into columns, with a
      leading "No status" column for both an empty value and an orphaned option id (an option
      deleted or renamed on github.com since the item was set), so neither case is dropped or
      invented into the first real column. `BoardView`: horizontal column scroll with vertical
      scroll inside each column, live per-column counts, collapse-to-rail, and the board's own
      empty states. **No query of its own** — Board mode reads exactly the `items`/`fields` Table
      mode already fetched, asserted directly (`items` called exactly once with the board rendered
      and multiple columns populated — Theme I's own acceptance test, satisfied early). Cards are
      placeholders; Theme B builds the real one.

## 2026-09-02 — Phase 40 Themes E, F — field writes and wiring

[PR #41](https://github.com/bilo-io/midnite-studio/pull/41). Finishes Phase 40's read/write pair —
Phase 41 (Agentic Kanban) still needs its own optimistic-drag argument, but the mutation it drags
onto now exists.

- [x] **Theme E — field writes**: `gh-project-write.ts`'s `setItemFieldValue`
      (`updateProjectV2ItemFieldValue`) and `addItemToProject` (`addProjectV2ItemById`), both a JSON
      body on stdin through `gh api graphql --input -` — the one item the phase doc itself flagged
      as most likely to be built wrong, since `-f`/`-F` both get a polymorphic value's type wrong.
      IPC handlers, a non-optimistic `useSetProjectItemField` mutation (invalidates only the edited
      board's items), and inline text/number/date/single-select editors in the table — gated at the
      surface on `forgeWritesEnabled`, disabled-with-explanation when off, exactly as
      `review-action-bar.tsx` already does for Reviews. `addItemToProject`'s cross-surface entry
      points (Reviews/Issues "Add to project ▸") deliberately deferred, per the doc's own
      recommendation.
- [x] **Theme F — wiring**: a command-palette source over already-loaded boards
      (`enabled: false` — opening the palette never itself fetches), and a Projects settings page
      with the `gh auth refresh -s project` command in one durable, copyable place. **The doc's
      "native menu item under the Tasks group" turned out not to exist** — no such group, and
      neither Actions nor Reviews has a menu item either — so that item is corrected in the phase
      doc rather than built as a one-off. The sidebar `VIEW_FILTERS` entry had already landed in
      Theme D.
- [x] **Four of Theme G's Vitest items also landed along the way** and are checked off in the
      phase doc: the `gh-project.ts` fixture suite and the field-value-flattener test shipped with
      Theme B (PR #38); `setItemFieldValue`'s command-construction test and the
      `forgeWritesEnabled`-off RTL test ship with this PR. The Playwright spec and the two
      human-only passes (screenshots, a real org/user board) remain open.

## 2026-09-02 — Phase 40 Themes B, C, D — GitHub Projects reads, IPC and the table view

[PR #38](https://github.com/bilo-io/midnite-studio/pull/38). Continues Theme A's contracts
(PR #23) with the read path Phase 41 (Agentic Kanban) is hard-blocked on.

- [x] **Theme B — ProjectV2 reads**: `gh-project.ts`'s `listProjects`/`projectFields`/
      `projectItems` through `gh api graphql` (no REST endpoint exists for ProjectV2). Owner
      resolution via `repositoryOwner(login:)` — one query, one round trip, answers for both
      user- and org-owned boards, over the alternative of probing which kind the owner is and
      caching that answer. `fieldValues.nodes`' heterogeneous union parsed one element at a
      time so an unrecognised node type drops that field, never the item. Added
      `ForgeProjectReadKind` (`'ok' | 'insufficient-scope' | 'error'`) to Theme A's read-result
      envelopes, kept off `ForgeCliStatus` deliberately — a missing `read:project` scope is
      feature-scoped, not CLI-global, and that enum is read by ten other files.
- [x] **Theme C — IPC + query layer**: `forge-project-handlers.ts` (read-only — the two write
      channels reject with "no handler registered" until Theme E), every GraphQL node id
      validated at the schema boundary before it reaches a shell command. Found and fixed a gap
      in that boundary while resuming this work: `ForgeProjectItemsRequest.cursor` had no
      charset restriction, so a cursor carrying shell metacharacters reached `projectItems`
      unrejected — closed with the same url-safe-base64 regex the node-id fields already use.
      Query keys in `queries.ts` (repo-scoped for the board list, un-prefixed for
      fields/items — a board belongs to an owner, not a repo), every read `enabled`-gated on
      the view being open, `staleTime: FORGE_STALE_MS`, no caching in main.
- [x] **Theme D — the Projects view**: `projects-view.tsx`, the full eight-file `ViewId`
      checklist, `FORGE_GATED_VIEWS` entry, a virtualized item table (the `diff-view.tsx`
      `estimateSize`/`measureElement` recipe), five named empty/loading/error/missing-scope
      states, a header slot reserved for Phase 41's `[ Table | Board ]` toggle, and
      `projectBoardByRepo` persisted per repo (`Pick<>` union, no version bump).

Field writes (Theme E) and the remaining wiring/verification (F, G — including the two
human-only passes the phase doc itself calls out) are left for follow-up PRs.

## 2026-09-02 — Phase 39 Theme G — density×state shots + perf numbers

[PR #33](https://github.com/bilo-io/midnite-studio/pull/33). Closes the theme PR #7 deliberately
held back.

- [x] **Theme G, remainder**: `shortcut-rail-shots.spec.ts` (`MSTUDIO_SHOTS=1`-gated, 5 specs) —
      full density at rest/active/hovered, compact, collapsed with the overflow popover open. The
      collapsed-state end-to-end check was already covered by `shortcut-rail.spec.ts`, so noted
      rather than duplicated. `moon run app:perf`: entry chunk 1132.1 KB against a 1250 KB budget,
      8/8 green. Blurred idle CPU, packaged-equivalent build: 15.83% of one core, no loop running
      — Decision 9's window-focus gate on the pulse (PR #7) is what makes that number hold with a
      loop running too, since the animation this theme worried about doesn't run unfocused either
      way. The four loop launchers this theme's doc originally described moved to the title bar's
      agent cluster in PR #21; their own state matrix already lives in
      `fab-loops-shots.spec.ts`/`titlebar-agents.spec.ts`, so the phase doc's `## Verification`
      section now marks those sub-items moot rather than leaving them permanently unchecked
      against machinery that no longer exists in this zone. Two human-only passes remain open at
      the phase level: a full keyboard sweep and an eye-pass at `full` density on a wide window.

## 2026-09-02 — Phase 38 Themes B, C, E, F + Phase 40 Theme A + Phase 22 Theme H — e2e repair, Projects contracts, the ops journal

[PR #23](https://github.com/bilo-io/midnite-studio/pull/23) (with a follow-up in
[PR #31](https://github.com/bilo-io/midnite-studio/pull/31)). Three phases in one
batch: 27 e2e specs repaired by root cause rather than by patching assertions, the read-only
zod spine for GitHub Projects, and the app's first history mechanism.

- [x] **Phase 38 Theme B — the changes panel**: not either of the doc's two guesses. Every
      `changes-panel` spec was failing on the same `toBeVisible`, because the rail defaults to
      `navMode: 'auto'` — collapsed to icons until hovered — so a plain `.click()` on a cold
      rail races its own hover: the `mouseenter` starts the expansion and the link reflows out
      from under the pointer before `mousedown` lands. Fixed at the spec level (hover, wait for
      the expanded label, then click), because no amount of waiting *after* a click that never
      reached its target can recover it. Alongside it, a real product regression: Phase 26's
      `DiffCell` refactor had silently dropped the always-shown new-line-number gutter column,
      which is what `diff-view`'s two `toHaveCount` specs were counting.
- [x] **Phase 38 Theme C — the workbench and the rail**: three genuine product bugs, not stale
      specs. `use-focus-trap.ts` focused its container unconditionally *after* React had applied
      a child's `autoFocus`, stealing focus from `ConfirmDialog`'s Cancel button on every
      destructive confirm — now it defers when something inside already holds focus. A folded
      repo's branch+count summary carried `min-w-0`, letting flexbox shrink it below its own
      unshrinkable content so the count pill visibly overflowed; dropped the utility so the
      repo-name sibling absorbs the shrink instead. And the commit-message textarea was left
      `inline-block`, sizing its gradient-border wrapper to the line box rather than the border
      box and leaving an asymmetric inset. The one "failure" that was neither was a stale
      checkout-persistence assertion contradicting a deliberately-landed feature.
- [x] **Phase 38 Theme E — Settings, files and tests**: the same fault three times over — an
      accessible-name substring collision, where Playwright's role queries matched "System"
      against "System Health", "Update" against "App Updates", and an unscoped "Agent". Fixed by
      disambiguating the labels rather than the selectors, on the phase doc's own reasoning: it
      is an ambiguity a screen-reader user hits too.
- [x] **Phase 38 Theme F — the forge surfaces**: found the rail hover/click-reflow hazard a
      second time and independently, in `review-threads-shots`, plus one more real regression —
      "Load the full log" had been silently truncated to "Load full log" by an unrelated
      number-formatting PR. `KNOWN_RED` trimmed from B/C/E/F's files, leaving D, G, H, I.
      Self-review then found one more class in `review-writes`: `openPull` clicked the PR row
      where auto-scroll had left it, under the sticky "All Pull Requests" header — the hazard
      `reviews.spec.ts` already documents and centres past.
- [x] **Phase 40 Theme A — shared contracts**: `ForgeProject`, `ForgeProjectField`,
      `ForgeProjectFieldValue` and `ForgeProjectItem` as zod schemas in their own
      `domain/forge-project.ts`, item content discriminated on `type` (issue/pull/draft) and
      field values on `dataType` (text/number/date/single_select/iteration), plus the channels
      and a `GitOpResult`-shaped bridge envelope that carries insufficient-scope **as data**
      rather than as a thrown error. Read-only spine only — Phase 41's board builds on it. 12
      round-trip tests.
- [x] **Phase 22 Theme H — the ops journal, toasts and starter undo** ◐ PARTIAL. `@bilo-io/ui`
      was checked empirically and exports no toast/notification component, so `toast.tsx` +
      `toast-host.tsx` are custom, shaped after `dialog-host.tsx` — a `useToasts(): ToastApi`,
      one stacking host mounted in `app.tsx`, and a `ToastRequest` that can carry an action.
      `OpJournalEntrySchema` records every write the app performs, persisted per repo and
      capped. The undoability classifier (`isUndoableOpKind`/`undoReason`) is exhaustive over
      every op this app can emit and every un-undoable op carries its one-line reason rather
      than a disabled button; undo executes as a **new forward write** through the write queue,
      so it is itself journalled. **What is not done**: only `stash-drop` and `branch-delete`
      have a live Undo executor (`WIRED_UNDO_OPS` in `services/use-journal.ts`) — `commit`,
      `reset`, `checkout`, branch create/move and `stash push` are classified and journalled but
      have no button yet; wire one by adding to `WIRED_UNDO_OPS` plus an executor arm. The
      journal is genuinely the History view's second tab, but Theme G's reflog tab beside it is
      an honest placeholder: Theme G was found unbuilt in this same pass, so there is no reflog
      reader for it to sit next to.

- [x] **Follow-up (PR #31)**: the sidebar's `branch-delete` never passed the `journalHint` its
      wired undo reads. `useTargetedGitOp` defaults `refBefore` to `'HEAD'` and `headBefore` to
      the checkout's oid — right for `commit`/`reset`, wrong for a branch you are not on — so the
      Undo button it still offered would have called `branchCreate` for a branch literally named
      `HEAD` at the wrong sha, and the generic `'Deleted a branch'` label left neither the toast
      nor the journal entry able to say which branch went. The graph's copy had always passed the
      hint; the sidebar's had not, and nothing failed. Found while screenshotting the theme, which
      is the argument for taking the shots: the classifier, the recording and the undo executor all
      had unit coverage and all three were right — only the call site feeding them was wrong.
      `e2e/journal-undo.spec.ts` drives the real row menu through the confirm to the toast, presses
      Undo and asserts the recorded `branchCreate` carries the branch's own name and sha; verified
      red before the fix. Also centred `review-writes`' `openPull` on the PR row before clicking it
      — Playwright's auto-scroll had been leaving it under the sticky section header, the same
      hazard `reviews.spec.ts` already documents, which made a rotating handful of that file's
      tests fail under a loaded runner.

**Also corrected in this pass**: a fuller audit of Phase 22 found the earlier `a2cd211`
correction had not gone far enough. Themes B, C, D, E, F and G were all marked DONE by two
mislabeled historical commits (`7475d79`, `26e2349`) that never shipped the corresponding code —
only Theme A is real, and B–G are reverted to TODO. The phase's item total was itself a
miscount: 70 counted 14 shared Verification-section items against Theme H, and the real sum
across A–H is 56.

## 2026-09-02 — Phase 38 Theme A — The pty seam

[PR #12](https://github.com/bilo-io/midnite-studio/pull/12). Nine of `fab-loops.spec.ts` and
`terminal-links.spec.ts`'s specs were failing on `pty:activity was not delivered to pty-1` and
its siblings — not a mock-bridge fault. `TerminalView` moved behind a lazy chunk in Phase 36
Theme C, so `pty.create` fires once the lazy chunk's Suspense boundary resolves, a moment after
Start rather than in the same tick; these specs called the mock's pty-event injectors against a
hardcoded `pty-1` before that had happened. Confirmed with a debug probe:
`window.__mstudioPty.creates` was empty at the exact moment of failure. Re-measuring at the
start of the theme found three more failures beyond the phase doc's original count — all the
same cause.

- [x] **Theme A**: `emitActivity`/`exitPty`/`printUrl` now poll the injector's return value
      instead of asserting it once, so the fix is structural — any call site, present or future,
      waits out the race rather than assuming it away. Self-review caught one call site the first
      pass missed (it passed locally only by accident of extra UI steps buying enough time).
      Dropped both files from `KNOWN_RED`. Un-ratcheting them ran every spec in both files on the
      CI runner for the first time, which surfaced four *unrelated* specs hitting Theme I's
      already-known GPU-less-runner wall (`@xterm/addon-webgl` gets no context on Linux CI) —
      tagged `@linux-red` per the established convention and handed to Theme I rather than fixed
      here. (PR #12)

## 2026-09-02 — Phase 39 Themes A–F (+ part of G) — One rail, five chords and four loops

[PR #7](https://github.com/bilo-io/midnite-studio/pull/7). Six of seven themes in one batch; Theme G
(reduced-motion assertions, the density×state shot matrix, perf numbers) deliberately held back.
The status bar's left zone becomes a rail whose job is teaching its own chords.

- [x] **Theme A — One toggle, one rule**: `repos-toggle`, `terminal-toggle` and `browser-toggle`
      were three verbatim copies of the same twenty lines with nothing enforcing that they stayed
      identical — and they had already drifted, two hard-coding `⌘`+letter in JSX while the third
      called `displayChord`, so the same commands read `⌘G`/`⌘B` on every platform where `Mod` is
      `Ctrl`. One `StatusToggle` now owns the `Tooltip`, the `aria-pressed`, the glyph slot, the
      chord and the name; each toggle is its store selector, its icon and its `chordFor` line.
      **The name renders only while the surface is open or the button is hovered/focused** — at
      rest the chord is what you read, which is the whole premise. The decision is a pure,
      tested function, and the *density* half of it stays in CSS for a reason worth writing down:
      `use-overflow.ts` measures by synchronously stamping `data-density='full'`, reading
      `scrollWidth`, stamping `'compact'` and reading again, all in one `useLayoutEffect` — a
      React context carrying density would not have re-rendered between those two reads, so both
      would report the same width and `densityFor` would never see a difference. Fixed en route:
      `displayChord` now upper-cases the final key (`⌘G`, not `⌘g`) for a trailing letter that is
      the whole final key only, since `Escape` also ends in a lone `e`.
- [x] **Theme B — The registry learns to group**: `StatusSegment` grows `group`, and separators
      are **derived from group boundaries** instead of being a `<div>` hand-registered in the
      middle of the array (`right-delimiter`, now the shared `StatusSeparator`). Placement is
      pure — `withSeparators` over the registry — but *pruning* reads the DOM, and the case that
      forced that is one the registry cannot see: the `health` group renders **nothing** for a
      repo with no linter and an **"Enable diagnostics" prompt** for an untrusted one, and only
      `DiagnosticsSegment`'s own hooks know which. A segment returning `null` produces no element
      at all, so a zone's live `children` list is already an exact record of what rendered — the
      same no-wrappers constraint `status-bar.tsx` already documents for the `gap-3` reason. Also
      fixed `browser-toggle`'s `priority: 5`, the **lowest** in its zone, so it rendered first and
      would have been the first thing shed on a narrow window; `segments.test.ts` now asserts
      group contiguity and that priority ascends with render order in every zone.
- [x] **Theme C — The palette and Go-to-File join the rail**: both **moved** out of the title bar
      rather than being added, on the argument `status-bar.tsx`'s own header comment already makes
      about git status — two readings of one thing, one at each edge of the window, is one more
      place to disagree and no more information. `active` is real, off `palette-store`'s `isOpen`
      and `mode`, with exactly one of the two ever lit; asserted, because `setQuery` re-derives
      `mode` from a typed sigil and can legitimately move the lit state mid-keystroke.
      `command-icons.ts`'s `palette.open` took `LuCommand`, freeing `LuSearch` for `search.open`.
- [x] **Theme D — Diagnostics moves left**: into its own `health` group between two rules. Its
      `Popover` flipped `align="end"` → `"start"`: `end` right-aligns the panel against its
      trigger, which was correct hard against the window's right edge and puts it off-screen-left
      at the left edge. `Popover` clamps to the viewport, so the failure mode is a panel that
      *detaches* from its trigger rather than one that vanishes — which is why that half of the
      verification is left `◐` for a human eye rather than ticked off a passing test.
- [x] **Theme E — Four launchers**: one segment, not four, so the strip can never split across an
      overflow boundary and can use its own tighter `gap-1`. Colours come from a new
      renderer-side `loop-glow.ts` — `DEFAULT_LOOPS.color` is a Tailwind `text-*` class that a
      `box-shadow` cannot read, and `packages/shared` imports zod and nothing else, so this is the
      same resolution `loop-icons.tsx` already performs for the glyph token. `openFabTab` already
      set panel-open and active-tab in one action, so no new store surface was needed.
      **At rest the strip collapses to one glyph**, expanding on hover, focus, or the moment any
      loop goes live: `FabLoopDots` renders nothing when idle on the argument that the FAB should
      look untouched, and that argument does not transfer — these launchers are *how a loop is
      started*, so hiding them until one runs is circular.
- [x] **Theme F — The strip is mission control**: two facts, two CSS properties. `box-shadow` is
      exclusively the running glow (amber and steady when a loop is waiting on you, as
      `.loop-run-glow.is-waiting`, the FAB tab dot and `fab-loop-dots.tsx` already say);
      `outline` is exclusively "this is the tab the FAB is showing". A loop can be open and idle,
      running and unopened, or both — one `box-shadow` list would have made every combination a
      hand-written string. `is-thinking` gets no fourth state: at 14px, running vs waiting is as
      much as the control carries honestly. **The pulse is gated on window focus** — a divergence
      from the doc, which left it ungated pending Theme G's measurement; this is a permanently
      mounted animation, exactly the shape Phase 36 Theme E was written about, so it ships with a
      gate rather than with nothing.

**Six real defects came out of the self-review**, three of them serious enough to be worth
recording as the phase's own lesson:

- **A reduced-motion rule that could not fire.** `html[data-motion='reduced'] .loop-launcher` is
  (0,2,1) and loses to `.loop-launcher.is-running.is-pulsing` at (0,3,0). It looked correct only
  because `@bilo-io/shell` forces `animation-duration: 0.001ms !important` under reduced motion,
  pinning the pulse to a final frame whose `opacity: 1` happens to be harmless — the exact
  accident the Phase 30 comment at `styles.css:323-334` already documents, and the inverse of
  what this phase claimed about `!important` not being able to defeat it. Worse: **the first test
  written for the fix passed with the bug still present**, because it opened a launcher's tab
  without the loop running, so there was no pulse to kill. The assertion now applies the class
  combination directly and guards on `animation-name: loop-launcher-pulse` before switching
  reduced motion on — and was verified by reverting the fix and watching it fail.
- **The rail's names vanished inside the overflow popover.** The state gate was a `hidden`
  attribute, which travels into `OverflowPopover`'s portal where `[data-density]` does not — so at
  `collapsed` density the popover listed five unlabelled 14px glyphs and their chords, on the one
  surface where the name is the only affordance. `overflow-popover.tsx`'s own header states that
  contract; the gate is now a `[data-density]`-scoped rule on a `data-named` attribute.
- **Tabbing into the launcher strip destroyed focus.** Expanding swaps the collapsed button for
  four launchers, unmounting the element that had just been focused; focus fell to
  `document.body`, the next Tab restarted from the top of the document, and — because Chromium
  fires no `blur` for a removed node — the strip stayed stuck expanded with no pointer near it.
  A keyboard arrival now hands focus forward to the first launcher. The same button's `onClick`
  was unreachable by mouse for the mirror-image reason (`pointerenter` unmounts it before the
  click lands) and could not un-press; it expands the strip and nothing else now, which is what
  makes its `aria-expanded` honest.
- **Theme F's ring was invisible in the state it exists for.** `expanded` keyed on `anyLive`
  alone, so "FAB open on Watchdog, nothing running" collapsed the strip and `is-open` could never
  be seen — one of the three states the theme requires to be distinguishable.
- **A stranded hairline in the title bar.** Removing the two `IconButton`s left their trailing
  separator as the first child of `chrome`, a 1px rule with nothing on its left. Theme B's entire
  premise is that a separator must never be stranded; building that mechanism for the status bar
  and leaving the same bug in the other half of the window would have been quite the irony.
- **Density was measured before separators were pruned.** `useOverflow` ran first, so the first
  `measure()` read a `scrollWidth` that included a rule and its 12px `gap-3` slot the very next
  effect removed — and `lastWidths` cached it. Pruning is now called first, and a later prune
  (diagnostics appearing once trust is granted) calls `remeasure()`. A revision counter was the
  first attempt and meant `setState` in a dependency-free layout effect; eslint was right about it.

Also removed a `showsChordAt` that nothing called — the chord's only axis is density, which lives
in CSS, so an exported and tested predicate with no call site read as covered when it was not.

**Proof.** `moon run :typecheck :lint :test` green — 2 743 tests (app 1 300, desktop 711,
git-engine 446, shared 286), including 66 new ones across nine files. `e2e/shortcut-rail.spec.ts`
(17 specs) covers the rail behaviourally: the stranded-separator case, the popover's names, the
compact-density rule, the `MutationObserver` path where a segment appears after mount, and the
reduced-motion cascade. `playwright.ci.config.ts` — the CI-blocking set — ran **220 passed, 0
failed** locally. `fab-loops.spec.ts` has 6 failures on the branch and **the same 6 on
`origin/main`**, baselined in a detached worktree rather than assumed; the file is already in
`KNOWN_RED`. That baseline is what found the one regression the diff had introduced: the
launchers' `aria-label` was `Open <Label> loop`, colliding with the waiting-notice action's
`Open <Label>` under Playwright's substring name matching. `status-bar.spec.ts` needed two
premise updates — its left-zone-footprint fixture used diagnostics, now a *left*-zone segment
whose presence legitimately changes that width, and its density thresholds moved (measured:
full ≥ ~1200px, compact ~1000–1150px, collapsed ≤ ~950px).
## 2026-09-02 — Phase 37 Themes A, B, C, D, E, F — A glow that knows which tab

[PR #8](https://github.com/bilo-io/midnite-studio/pull/8). All six themes in one batch. The FAB
panel's rotating rainbow border grows an inner glow that subtracts the half of the spectrum
furthest from the active tab, so the panel edge reads as "the green one" without ceasing to be a
gradient — tied to loop state, mirrored on the collapsed FAB, and gated on window focus rather
than left to a measurement this sandbox couldn't trust.

- [x] **Theme A — One rainbow, six tokens**: the seven-stop ramp lifted out of five verbatim hex
      copies in `styles.css` into `--rainbow-0..5` + a `--rainbow-ramp` shorthand. Zero rendered
      change — every consumer resolves to byte-identical values.
- [x] **Theme B — The inner glow**: a `::before` overlay on `.fab-panel-gradient` — no new DOM
      node — paints a blurred conic gradient behind the border, masked by a three-stop radial
      alpha gradient for the centre falloff and pulsed via a registered `--fab-glow-inner` mask
      stop plus opacity (never `filter: blur()`, per Phase 36's rule against per-frame
      re-rasterised blur on a permanently-mounted animation).
- [x] **Theme C — The spectrum knows the tab**: `data-fab-tab` plus a four-row arc table
      (`anchor - 90deg` → `anchor + 90deg` on one continuous, never-wrapping number line rather
      than each tab normalised into `[0deg, 360deg)`) narrows both the border and the glow to a
      shared 180° arc via one mask formula, with a 0.5s sweep between tabs. Hit and fixed a real
      bug along the way: an unregistered custom property referencing a registered one via `var()`
      resolves against the value in force *where it is declared*, not where it is consumed, so a
      `--fab-arc-mask` factored onto `:root` baked in `:root`'s own untouched arc and rendered
      every tab full-spectrum — fixed by writing the same `conic-gradient()` directly on each of
      the three consuming properties instead of sharing it through an inherited variable.
- [x] **Theme D — Collapsed FAB continuity**: the collapsed button and each tab's own Start/Stop
      button pick up the same arc for free from one hoisted attribute table (`[data-fab-tab='…'],
      [data-fab-tab='…'] .loop-run-glow { … }`), so collapsing the panel never changes its colour.
- [x] **Theme E — Pulse follows the loop**: `data-loop-state` (idle/running/thinking/waiting) off
      the existing `useAllLoopStatuses` call drives pulse cadence (one keyframe, three durations);
      `thinking`'s "brighter peak" needed `filter: brightness()` rather than a static `opacity`
      override, because a running keyframe's own animated value always wins over a static
      declaration for the same property. `waiting` drops the arc entirely for a full, steady
      amber ring — on both the border and the glow, each of which needed its mask explicitly
      cleared rather than left narrowed to an arc that no longer means anything against a flat
      fill.
- [x] **Theme F — Reduced motion, and proof**: `animation-name: none !important` (not a duration
      override) for the new `::before`, the 0.5s arc transition suppressed too, `fab-loops.spec.ts`
      extended with computed-`--fab-arc-from`/`--fab-arc-to` assertions per tab plus the
      collapsed-FAB and composer-button inheritance checks, and `panel-glow.spec.ts` re-run clean
      (Theme A touches `.gradient-border`, the exact block with a documented history of a
      popover-positioning regression). A window focus/blur gate pauses the glow's rotation and
      pulse unconditionally, decided upfront rather than after a measurement — Phase 36's rule is
      that a perf claim comes with a number, and this sandbox could not produce a trustworthy one:
      no Accessibility permission for the UI-scripted click needed to open the panel in a packaged
      build, and even the panel-closed *baseline* swung 22% → 55% of a core across two runs of
      identical unmodified `main`. Left open for a human pass on real hardware, along with a
      resize to the panel's min/max width (240/640px) — a DOM-level width override in this
      session's attempt only widened `FabPanel`'s own wrapper, not the `overflow-hidden` tween
      wrapper around it, and clipped the result rather than testing it.

## 2026-09-01 — Phase 36 Themes B, C, G, H — Performance diet: the fixes, and the budgets that keep them

Merged to `main` locally (this repo has no git remote, so no PR link). Four themes in one batch,
branched off the tip that carried A/D/E/F. Every landed item carries a number; four of the doc's
items are **acquitted** with the measurement that acquits them rather than churned through.

- [x] **Theme B — Main-process startup**: the login-shell PATH probe was the single most
      expensive thing in boot and the most pointless place to spend it — a `spawnSync` on the
      main thread ahead of `app.whenReady()`, a median **284 ms** during which Electron could not
      run a line of our JS, while Chromium was starting up on other threads anyway. Now spawned
      un-awaited (inside the single-instance branch, so a deep link does not fire a `zsh -lic`
      nothing will read) with only its real consumers waiting on it: `initPtyService`, because
      every pty inherits this PATH, and `restoreRepos`, the first git exec. The three `whenReady`
      chains — pty service, agent roster, repository list — ran sequentially for no reason beyond
      the order they were written in, and now run under one `Promise.all` with the two orderings
      that *are* real expressed as code: the userData migration precedes all three because it may
      move the stores they read, and `createWindow` follows all three because the renderer's first
      `repo:list` must not be answered with an empty list. Main/preload/broker are minified and
      built concurrently. **`when-ready` 322 → 190 ms · `create-window` 524 → 441 ms ·
      `ready-to-show` 683 → 570 ms**, and `login-shell-done` now *follows* `when-ready`, which was
      the theme's own verification. The three pre-committed handler-module deferrals are
      **acquitted**: a new `modules-loaded` mark (elapsed at the first statement of main's body,
      so "every static import evaluated") reads 147 ms with them, 163 ms with all three stubbed
      out, and 184 ms on a repeat of the unmodified build — the noise on identical code is wider
      than the 10 ms threshold, so nothing there can be honestly indicted.
- [x] **Theme C — Renderer bundle**: the window opens on the graph and paid, before the first row
      of history, for every view it could possibly reach. Thirteen views behind `React.lazy` under
      **one** Suspense boundary (the ternary's order is load-bearing — `settings` and `councils`
      still resolve before the `!selectedRepoId` guard); `GraphView`, `EmptyWorkspace`,
      `Placeholder` and `ScreensaverHost` stay eager on purpose. `DelayedFallback` renders nothing
      for 120 ms and only then a spinner, so a warm chunk never flashes loading UI and the app
      cannot read as slower for having got smaller. xterm leaves through one shared
      `lazy-terminal-view` module — both consumers go through it, so a second static import cannot
      quietly put it back — warmed by `idlePreload` after first paint because `Ctrl+`` is one
      keystroke. `react-markdown` did **not** fall out for free the way the doc predicted: the
      commit inspector renders through the same pipeline and hangs off the eager `GraphView`, so
      `CommitMessage` is now lazy, worth 142 KB on its own. Sourcemaps behind
      `MSTUDIO_SOURCEMAP=1`. **Entry chunk 2 481.3 KB (pre-phase, verified) → 1 109.4 KB, −55%.**
      All 368 functional e2e specs passed unchanged — Playwright's auto-waiting already absorbs a
      boundary that resolves in a frame. Two items acquitted with numbers: `@dnd-kit` is 59.9 KB
      reached by four *eager hook* call sites (a hook cannot move behind a lazy boundary without
      changing its call count, so splitting means converting four sites to render-prop wiring),
      and `manualChunks` is unnecessary because no vendor module is duplicated across chunks.
- [x] **Theme G — Profile-gated claims**: two suspects convicted, one rig handed to a human.
      The **broker** was guilty and worse than the deferral note guessed: under `yes` it held
      **96.8% of one core for 7.6 MB/s**, and the socket write per chunk was only half of it —
      `appendScrollback` reallocated and copied the *entire* retained buffer (capped at
      `SCROLLBACK_BYTES * 2`) on every one of 7 073 chunks a second, which is where the 227 MB RSS
      came from. A per-pty buffer flushed every 16 ms fixes both, because it sits in front of the
      scrollback append as well as the broadcast: writes/s **7 073 → 60.5**, RSS **227 → 168 MB**,
      and normalised for an infinite producer **12.74% → 1.16% of a core per MB/s — 11× less CPU
      per byte**. Holding bytes back is only safe if everything that can observe a stream flushes
      first, so `snapshot`, the disk `flush`, `kill`, `onExit`, shutdown and the 15 s interval all
      do, with five tests pinning that ordering rather than the speed. The **`ps` probe** was
      guilty too: one `ps -axo pid=,ppid=,stat=,args=` costs a median **30.6 ms of CPU**, and a
      chatty pty sustains one probe per `QUIET_MS` forever — 80/min = **4.08% of a core** at 750 ms.
      Raised to 1500 (2.04%); the cost is an icon up to 750 ms later for an agent that starts then
      falls quiet. **Graph edge culling stays open for a human**: ">30% of frame time" needs the
      DevTools Performance panel, so what landed is the rig —
      `scripts/perf/make-big-repo.sh` generates a 50 000-commit fixture over six lanes that merge
      every 97th commit, via `commit-tree` plumbing so it takes minutes rather than an hour.
- [x] **Theme H — Perf budgets**: `moon run app:perf` — three specs, one budget source
      (`scripts/perf/budgets.json`), outside the default gate, `retries: 0`. The size budgets catch
      drift; the **absence** assertions catch the mistake the phase exists because of — one static
      import putting a whole library back on the boot path, which no functional test would notice.
      The diff-scroll timing test moved here from `e2e/diff-scroll-perf.spec.ts`, resolving Phase
      26's open question as *both*: the exact row counts stay in the default gate, the frame-gap
      budget does not, and its threshold drops from an inherited 100 ms tripwire to 22 (2.5× the
      8.5 ms measured). Byte budgets get ~1.15× rather than 2.5× — a byte count does not flake,
      and at 2.5× the entry budget would be 2 712 KB, above where this phase started; a budget
      that permits undoing the phase is not a budget. **8 passed**: entry 1 109.4/1 250 KB · total
      JS 13 731.3/15 800 KB · `ready-to-show` 628/1 425 ms · `first-view-rendered` 194/450 ms ·
      scroll 8.3/22 ms.

**Left open, deliberately.** One `useAutoFetch` fake-timer test that belongs to Theme E (the
behaviour landed, but the hook is defined inline in `app.tsx`, so there is nothing importable to
drive), and two human passes: the `MSTUDIO_SHOTS` before/after screenshot diff, and an Activity
Monitor check that a blurred idle app sits near 0%. Also logged in `outstanding.md`: ~60 KB of
`lucide-react` still ships via `@bilo-io/ui`/`@bilo-io/shell`, which is why Theme H cannot assert
its absence, and the `@dnd-kit` split with the mechanism it would need written down.
## 2026-09-01 — Phase 35 Themes F, G, H, I — the verification items, run rather than read

[PR #3](https://github.com/bilo-io/midnite-studio/pull/3). Phase 35 shipped at 90% with four
verification items open — three `◐ PARTIAL`, one manual. Each was left that way for the same
reason: the half a spec could reach was covered and the half that needed a *process* was not.

**And running them found a bug.** `hydrate()` — the call that turns `terminals.json` back into
store rows — was only ever made from `TerminalPanel`. So a loop that was running when the app quit
came back **only if you happened to open the main terminal panel first**; the FAB tab that owned
it showed "Press Start" over a session sitting on disk the whole time. `fab-panel.tsx` now
hydrates when the console opens — on open rather than on mount, because the read pulls every
session's scrollback with it and most launches never open that panel, and `hydrate()` is a no-op
once `hydrated` is set, so whichever panel opens second pays nothing.

- [x] **Theme F — Loop lifecycle**: a new `__mstudioPtyExit(ptyId, exitCode)` seam in
      `mock-bridge.ts` delivers an exit *nothing in the renderer asked for*. That distinction is
      the whole item: `pty.kill` already fired the same handlers, but it is the app-initiated path
      — the one Stop takes — while the case the checklist doubted is the loop simply finishing,
      because the button state is derived from `sessionPhase` rather than written down by whoever
      pressed Stop. Asserts the Stop→Start swap, the glow and the FAB dots going, the run
      finalising as `exited` rather than `stopped`, and a second Start producing a second pty
      against a different session id (a Start that revived the slept session would show one).
      Both exit paths now mirror main's `noteSessionExit`, so the mocked ledger ends runs the way
      main does.
- [x] **Theme G — The waiting notice, end to end**: there is no floating toast, which is the fact
      that had kept this partial. `useLoopAttention` pushes into `toast-store`, and the status
      bar's `NotificationBell` is the only thing that renders it — so a loop going quiet behind a
      closed panel shows a count on a bell. That being the shipped surface, it is the one
      asserted: the spec starts a loop, leaves the tab, shuts the panel, drives the waiting
      transition, opens the bell, clicks `Open Innovate`, and asserts the panel reopens on *that*
      tab (by visibility, not presence — all four tabs stay mounted so their xterms survive a tab
      switch, so a count assertion would pass whichever tab it landed on). A second test asserts
      the debounce the hook claims: repeating `waiting` is one notice, going not-waiting rearms it.
- [x] **Theme H — Reduced motion, asserted**: through the cascade, via
      `getComputedStyle(el).animationName`, rather than by grepping `styles.css` for the
      `html[data-motion='reduced']` block. A source grep passes even when a later, more specific
      rule has quietly out-ranked the opt-out, and `.loop-run-glow.is-thinking` — which sets two
      animations — is exactly such a rule. Covers the plain spinning ring and the thinking pulse,
      with the attribute removed again to prove it is the attribute doing the work. (`.is-waiting`
      sets `animation: none` on its own, so asserting the opt-out against a waiting loop would
      have proved nothing — noted in the spec.)
- [x] **Theme I — Rehydration**: a launch that starts with a loop already on disk. Two persisted
      halves have to agree and they are stored apart — the session in main's `terminals.json`
      (carrying `surface: 'fab'`), the loop→session map in the renderer's own `fabSessions` slice
      in localStorage — so the spec seeds both, the way a real relaunch hands them over. Asserts
      the tab shows the session asleep with its transcript, that no pty was spawned to show it,
      and that the main session list still excludes it. The drift the split invites gets its own
      test: a `fabSessions` entry whose session is gone reads as idle and Start still works.
- [ ] **Still open for a human**: the same check against a **packaged** build. Only a real quit
      proves the pty died with the app rather than being forgotten by a page reload.

Gate green: 1,226 unit tests, and the full Playwright suite at **386 passed** / 19 skipped, up
from 372. One screenshot — the waiting notice in the bell, the one surface these four touch that
had never been photographed. Phase 35: 36/40 → 39/40.

## 2026-09-01 — Phase 36 Themes A, D, E, F — Performance diet: the instruments, and the first three fixes

Merged to `main` locally (this repo has no git remote, so no PR link). Squashed from
`feature/p36-adef` after a rebase onto the Phase 35 tip; the one conflict was
`shared/src/index.ts`, where Phase 35's `./loops` export and this phase's `./perf` export both
wanted the same line, and both were kept.

- [x] **Theme A — Baseline & harness** (◐ partial): `shared/src/perf.ts` + `perf-marks.ts` put
      boot marks behind `MSTUDIO_PERF === '1'` and a no-op otherwise; the renderer sends its three
      marks over a new one-way `mstudio:perf:mark` channel rather than having a script scrape
      console output. Three reports under `scripts/perf/` — `startup-report.mjs` (cold-start
      medians, `--runs=5`, `--rss`), `bundle-report.mjs` (entry chunk / total JS off Vite's
      newly-enabled `.vite/manifest.json`) and `idle-cpu.mjs` (percent of one core over a chosen
      window, `--blurred`) — all launching the packaged-equivalent app through the shared
      `electron-run.mjs`. Two things that launcher had to get right are written down in it and in
      the phase doc: every run takes a throwaway `--user-data-dir`, because Electron keys the
      single-instance lock on it and a run started beside the installed app quits instantly with
      every mark missing; and the profile is *seeded* before it is measured, because
      `graph-first-batch` never happens unless a repo is selected, which is persisted state the
      app deliberately does not invent. Idle CPU differences cumulative `ps -o cputime` rather
      than reading `%cpu`, which on macOS decays over up to a minute of history and would smear
      boot CPU into an idle number. **The baseline table is now filled** — measured later the
      same day from a pre-phase worktree (`b649a6e`) with the harness cherry-picked onto it, so
      both columns share a base and Phase 35 is in neither; see the addendum below and the phase
      doc's *Baseline table*.
- [x] **Theme D — One icon family**: all 54 `lucide-react` importers moved to `react-icons/lu` —
      the same Lucide set under an `Lu` prefix, so `ChevronLeft` → `LuChevronLeft` and nothing
      changed visually. A `no-restricted-imports`
      entry in `eslint.config.mjs` fails the build on a fresh import of it;
      `components/icons/icon-names.test.ts` asserts every `react-icons/lu` name the renderer
      imports resolves to a defined export, which is the guard against a rename that typechecks
      because the barrel is `any`-ish. The structurally-declared `IconComponent` type is what let
      the migration touch no call site.
- [x] **Theme E — Idle-CPU zero**: `lib/use-now.ts` replaces four independent `setInterval`s (the
      titlebar status, its time section, the world clocks, and the screensaver idle poll) with one
      `useSyncExternalStore` clock that exists only while something is subscribed *and* the
      document is visible, re-aligning each tick to the next wall-clock second so two clocks
      mounted at different moments cannot visibly disagree. Auto-fetch pauses while hidden and
      catches up on return; the activity tick runs only while ptys are actually tracked (the
      pre-refinement doc had this gating on blur, which was wrong). The dead
      `use-rebase-status.ts` poll went with it.
- [x] **Theme F — Memory caps**: `features/diff/line-highlight.ts`'s cache — keyed on full line
      text, the one genuinely unbounded map in the renderer — is a true 10 000-entry LRU with
      per-key subscriber notification. Scrollback ownership audited with bounds tests
      (`broker/scrollback-bounds.test.ts`), and every module-level `Map`/`Set` in
      `packages/app/src` swept and tabulated in the phase doc against one rule: keyed on *content*
      needs a cap, keyed on *mounted components* or a literal enumeration does not, provided it
      deletes on unmount.

### Addendum, same day — the numbers, and what they corrected

The harness was run against a pre-phase worktree (`b649a6e`) and against this batch's tip, both
built packaged-equivalent, medians of 5 cold runs. Three results contradicted the phase's own
expectations, and are recorded as corrections rather than quietly dropped:

- **`lucide-react` does not leave `node_modules`.** `@bilo-io/ui` and `@bilo-io/shell` both
  depend on it, so the "~40 MB footprint win" is not real — corrected above, in the phase doc,
  and in all three convention files. What Theme D actually bought: **−17.8 KB** of entry chunk
  (2 464.0 → 2 446.2 KB), one icon family in our own source, and an eslint rule that holds it.
- **Blurred idle CPU: 0.38 % → 0.12 %** of one core (renderer 0.19 → 0.07). Real, and smaller
  than the theme's title suggests — because Chromium already throttles timers and rAF in an
  occluded window. That is Theme E's rAF item closed with a measurement instead of an argument:
  nothing disables `backgroundThrottling`, so the default stands and no hand-written
  `document.hidden` gates were needed.
- **A focused, untouched window is bimodal, and the first measurement nearly became a false
  claim.** The initial 300 s pair read 27.10 % before vs 0.17 % after — a tenfold "win" that
  four re-runs (two per side, 90 s) demolished: the low mode is 0.85 / 1.09 % before and 0.70 %
  after, and the high mode — worst observed **renderer 32 % + GPU 55 %** — appeared on *both*
  sides. So something animates at frame rate in an idle focused window; it is not explained by
  anything in this batch, and it is now **Theme G's** first job.

Startup was unchanged, which is the correct answer: D/E/F touch no boot path
(`ready-to-show` 711 → 746 ms, inside this machine's spread — `login-shell-done` alone ranged
295–2 457 ms across the day). Those rows are the baseline B and C will be measured against.

Two things the harness found about itself, both fixed in `electron-run.mjs`:

- **it leaked a broker per run.** The pty broker deliberately outlives the app that spawned it,
  so the first before/after batch ended with twelve resident brokers and 23 stray helpers — and
  "after" runs that could no longer boot inside a 60 s budget, which is exactly the failure that
  produced the bogus 27 % contrast above. Teardown now kills anything whose argv names that run's
  throwaway profile.
- **the screenshot pixel-diff is not a parity instrument.** Two runs of the *same* tree differ on
  ~30 of 116 PNGs (the title bar renders a live clock), and most of the 116 are historical
  committed artifacts no current spec rewrites. Reported as unmeasurable; icon parity was
  established at code level instead (react-icons' `IconBase` spreads caller props after the
  glyph's baked attrs, so `strokeWidth` survives; the only real difference is default size,
  `1em` vs 24px, which affects only icons with no size class — an audit found none among the
  migrated sites). The eyes-on pass stays open for a human.

Also landed with the numbers: the *Measurement procedures* section (including the DevTools heap
click-path, since no script can take a heap snapshot) and the Theme F module-level-`Map` sweep as
a table with a bound for every entry in `packages/app/src`.

## 2026-09-01 — Phase 35 Themes A–E — FAB Mission Control

Merged to `main` locally (this repo has no git remote, so no PR link). Turns the FAB panel — which
shipped as untracked ad-hoc work and did not actually work — into a real loop console. The two
symptoms had one shape between them: `fab-terminal-view.tsx` spawned a session per tab *on mount*
and then read `sessions[sessions.length - 1]` out of a pre-call closure snapshot, so all four tabs
latched onto whichever session already existed while the four they really spawned piled into the
main terminal housing, which renders every session unconditionally.

- [x] **Theme A — Shared contracts**: `shared/src/loops.ts` — `LoopDefinitionSchema`,
      `LoopModifierSchema`, `LoopRunRecordSchema`, `DEFAULT_LOOPS` (the four tabs as data), and the
      pure `composeLoopPrompt`, which is the single place a command line is assembled so what ran
      and what history says ran cannot drift. `surface: 'main' | 'fab'` added to
      `TerminalSessionSchema` as zod-*optional*, so every `terminals.json` written before the field
      existed parses unchanged. `mstudio:loop-runs:*` channels + schemas, writes on the
      `GitOpResult` envelope.
- [x] **Theme B — One loop registry**: the hard-coded `FAB_TABS` prompts are gone; a loop names an
      `agentCommandId` and reads its base prompt out of `agentSkills`, so the FAB, the midnite menu
      and Settings all read one store. `loopModifierDefaults` (persisted, edited in a new
      Settings ▸ Agent ▸ Loops section) is split from the per-run checkbox state (session-ephemeral
      on purpose). `loop-icons.ts` maps the schema's icon *token* to a component, keeping
      `packages/shared` free of react and the icon packages.
- [x] **Theme C — A session that lives in the FAB and nowhere else**: `onMainSurface` is the one
      predicate the panel and the session list both filter by. `startAgent` now RETURNS the session
      it created (and takes `surface` / `autoSend`), so the stale-closure bug is gone by
      construction rather than patched — nothing in a tab reads the session list. A FAB launch skips
      `setTerminalOpen(true)` and never takes `activeId`. `TerminalView` grew a `layoutClassName`
      escape hatch so the FAB pane hosts it without fighting `absolute inset-0`; the main housing
      passes the old classes and renders pixel-identically.
- [x] **Theme D — Compose, Start, Stop, glow**: a composer per tab (modifier checkboxes + free-text
      extras) collapsing to a slim chip strip once running. Stop *interrupts then sleeps* — Ctrl+C
      straight at the pty, 300ms, then `sleepSession` — and finalises the ledger row as `stopped`
      first, because main's pty-exit hook would otherwise write `exited` and history would say the
      loop died rather than that you stopped it. Button state derives from `sessionPhase`, so a loop
      that exits on its own flips back to Start with no bookkeeping. `.loop-run-glow` is lifted from
      `.breadcrumb-repo-pill`'s conic border, in three states — steady ring (live), breathing
      (`thinking`), steady amber (`waiting`) — each with its `data-motion='reduced'` opt-out.
- [x] **Theme E — Mission control**: `loop-runs-store.ts` (capped at 200, like council runs) plus
      `loop-runs.ts`, whose ends are owned by MAIN — a run is finalised off the pty's own
      session-keyed exit, so a renderer reload mid-run cannot lose an `endedAt`, and a record still
      `running` at load is finalised `stopped` rather than pretending. `pty-service.ts` grew a
      second, session-keyed exit dispatch beside its ptyId-keyed one for exactly that. The collapsed
      FAB wears the glow with a dot per live loop arced around it (nothing at all when idle);
      `Toast` grew an optional action so the waiting notice can open the FAB on the tab that is
      waiting; history is a collapsed disclosure per tab, expanding a row to the exact composed
      prompt.

Tests: `loops.test.ts`, `loop-runs-store.test.ts`, `loop-composer.test.tsx`,
`terminal-surface.test.ts`, and `fab-loops.spec.ts` — which asserts the original bug in the terms it
broke in (nothing created until Start; what Start creates never reaches the main session list or
opens the main panel). Gate green: 2,620 unit tests, 372 Playwright.

Left open: a packaged quit-and-relaunch pass, the notification click-through, and a
`data-motion='reduced'` assertion — all noted in the phase doc's Verification block.

## 2026-09-01 — Phase 34 Themes A–H — Agent Councils

Merged to `main` locally (this repo has no git remote, so no PR link). Fills the "Councils" nav
slot reserved since Phase 15/19: a standing panel of AI members answers one prompt in parallel, then
a synthesizer distills the results — ported as a narrow MVP slice from `~/Dev/midnite`'s councils
feature (one format, global scope, a 3-agent member pool, an explicit auto-send exception since a
council member only answers a prompt and never touches a repo).

- [x] **Theme A — Shared contracts**: `Council`/`CouncilMember`/`CouncilRun`/`CouncilRunMember` zod
      schemas in `shared/src/council.ts`, a one-value `CouncilFormat` literal (`'brainstorm'`), the
      four starter-member personas, `mstudio:council:*` IPC channels/schemas, all writes returning
      the `GitOpResult` envelope. `agentInvocationArgs`/`toAgentPrompt`/`shellQuote` moved from
      `start-agent.ts` into `shared/src/agent-invocation.ts` so `council-runner.ts` (main) and
      `start-agent.ts` (renderer) share one table instead of two copies drifting.
- [x] **Theme B — Persistence**: `councils-store.ts` (global `councils.json`, merge-tolerant of a
      malformed entry) and a separate `councils-runs-store.ts` (`council-runs.json`, capped at 200
      runs) — kept apart because run history writes far more often than council/member edits.
- [x] **Theme C — Run orchestration**: `council-runner.ts` spawns every member as a one-shot pty
      directly through `pty-service.ts` (a small `onPty`/`offPty` per-ptyId listener registry added
      there), races each against a 120s timeout, and once all settle spawns the synthesizer the same
      way. Two real bugs found and fixed while writing `council-runner.test.ts`: two members
      settling back to back could race a plain read-modify-write of the run object and silently drop
      one's write (fixed with a per-run mutation lock, `withRunLock`); and the pty is a real login
      shell with the command typed in, not `pty.spawn(command)`, so the CLI finishing does not make
      the shell exit on its own — `spawnOneShot` now appends `; exit $?` so the settle barrier's only
      signal (the pty's exit event) actually fires, carrying the CLI's real exit code.
- [x] **Theme D — IPC bridge**: `ipc/council-handlers.ts`, preload wiring, and
      `use-council.ts`/`use-council-run.ts` renderer hooks (the run hook polls at upstream's own
      1200ms cadence while a run is live).
- [x] **Theme E — UI, list & create**: `CouncilsView`/`CouncilList`/`CouncilCreateDialog` replace the
      `WORK_IN_PROGRESS` stub `view-sections.ts` carried since Phase 15/19; wired into `app.tsx`
      ahead of the `!selectedRepoId` check, since a council is global like Settings.
- [x] **Theme F — UI, detail & members panel**: `CouncilDetail` — flat add/remove/edit members
      (debounced auto-save), a synthesizer picker, and a bottom composer carrying the auto-send
      safety note.
- [x] **Theme G — UI, run view**: `CouncilRunView` — per-member tabs and a synthesis tab, each
      showing `CouncilLiveOutput` while running (a plain append-only text view over the same
      `pty.onData`/`pty.onExit` stream `TerminalView` subscribes to, not a full xterm embed — a
      member has no interactive input, so the terminal-emulator machinery buys nothing), then the
      server's own cleaned text once settled. ANSI-stripping and carriage-return collapsing moved
      into `shared/src/ansi.ts` so the live view's client-side cleanup and `council-output.ts`'s
      server-side cleanup share one regex.
- [x] **Theme H — Retry/skip controls**: skip kills the pty and settles the member `skipped` without
      waiting for a real exit; retry re-reads the council's *current* member config and re-runs,
      clearing a stale synthesis and re-opening the settle barrier.

Verified: `moon run :typecheck :lint :test` green (shared/git-engine/desktop/app), a new
`e2e/councils.spec.ts` (create → starter members → run → synthesis, against `mock-bridge.ts`'s new
`council` block), and four screenshots (empty state, detail with members, run tabs + synthesis,
one member's answer). Two things are explicitly left for a human: a real end-to-end run against
real `agy`/`codex`/`opencode` installs, and a copy read of the auto-send note.

## 2026-08-30 — Phase 32 Themes G, H, I & Phase 33 Theme E — Real Browser Chrome, Dev Powers, Forge Links & First-Run Onboarding

- [x] **Phase 32 Theme G — Real Browser Chrome**: Added `FindBar` bottom drawer component, wired `resolveInput` URL/search engine resolution on address bar submit, find-in-page IPC channels (`browserFind`/`browserFindStop`), and zoom/navigation error page integration.
- [x] **Phase 32 Theme H — Dev Powers**: Added responsive viewport width presets (Mobile 390px, Tablet 834px, Laptop 1280px, Full) to `BrowserPane`, detached DevTools toggle, and dev-server port probing.
- [x] **Phase 32 Theme I — Forge In Place**: Implemented strict regex preview deploy URL matcher in `preview-deploy.ts` and in-app link handling settings/routing.
- [x] **Phase 33 Theme E — First-Run Onboarding & System Health**: Created `HealthChecklist` component, `FirstRunModal` with focus trap, and integrated system health diagnostics across settings and onboarding.

## 2026-08-30 — Screensaver Lockscreen & Host Integration

- [x] **Adhoc Lockscreen**: Ported and completed the lockscreen screensaver from `midnite` to `midnite-studio`. Added `Spinner` rAF orbit/ellipsis animation with mode-based tinting, expanded title word lists for active/waiting/idle modes, CSS sheen and pill shimmer keyframes, and full keyboard/passcode host integration.

## 2026-08-30 — Phase 33 Themes A, B, C, D & Phase 32 Themes E, F — Package DMG, CLI Binary, Auto-Updater & Occlusion / New Tab Page

- [x] **Phase 33 Theme A — Polished DMG Package & macOS Integration**: Added `dmg`, `protocols`, `publish`, `entitlements`, `entitlementsInherit`, `afterSign` notarize hook, and `Midnite Studio` identity to `electron-builder.yml`. Created `verify-dist.mjs` asserting DMG/ZIP existence, 50MB+ size, strict codesign verification, `hdiutil` verification, and `Info.plist` URL schemes.
- [x] **Phase 33 Theme B — CLI Binary & System PATH Symlinking**: Created executable `midnite-studio` POSIX wrapper, `mstudio:cli:*` IPC handlers for auto/user PATH symlinking, and settings UI on `CliPage`.
- [x] **Phase 33 Theme C — Custom Protocol Scheme & Jail**: Added `setAsDefaultProtocolClient('midnite-studio')`, `open-url` handling, and deep-link protocol handler `useDeepLinks()`.
- [x] **Phase 33 Theme D — Auto-Updater Service**: Wired `update-service.ts` managing `autoUpdater` events mapped to single `UpdateState` channel `EVENT_CHANNELS.updateState`. Added status bar segment `UpdatePill` and settings UI on `UpdatesPage`.
- [x] **Phase 32 Theme E — Occlusion & Bounds Choreography**: Wired occluders counter (`incrementOccluders`/`decrementOccluders`) in `Popover` component and integrated `effectiveVisible` hiding logic in `useBrowserBounds.ts`.
- [x] **Phase 32 Theme F — New Tab Page**: Created `NewTabPage` component rendering `BrandMark` hero, search/URL input, shortcut tiles, and recents list.

## 2026-08-30 — Phase 32 Theme I & Phase 33 Theme E — Preview Deploy Matcher & First-Run Onboarding Modal

- [x] **Phase 32 Theme I**: Implemented `packages/app/src/features/browser/preview-deploy.ts` matching preview URLs (Vercel, Netlify, Pages.dev, Surge, Render, Fly.dev) with full test coverage in `preview-deploy.test.ts`.
- [x] **Phase 33 Theme E**: Implemented `packages/desktop/src/main/system-health.ts` for system health probes with `system-health.test.ts`, mounted `<OnboardingModal />` in `app.tsx`, and registered `CliPage`, `UpdatesPage`, and `HealthPage` in `settings-view.tsx`.

## 2026-08-30 — Phase 32 (E,F,G,H) & Phase 33 (A,B,C,D) — WebContentsView Controls, PATH Symlink Helpers & Update State

- [x] **Phase 32 (Themes E, F, G, H)**: Added DevTools support (`detach`/`bottom`) to `browser-service.ts`, wired Back/Forward/Reload and DevTools toggle buttons in `browser-pane.tsx`, created input resolver `resolve-input.ts` turning typed text into URLs or search engine queries with vitest coverage.
- [x] **Phase 33 (Themes A, B, C, D)**: Created pure deep-link parser `protocol-parse.ts` for `midnite-studio://open` and `clone`, created PATH symlink target helper `cli-path.ts`, created update state helpers `update-state.ts` and feed channel resolver `feed-channel.ts`. Exposed IPC channels, zod schemas, preload bridge, and mock bridge definitions.

## 2026-08-30 — Rename — Midnite Git becomes Midnite Studio

Ad hoc, outside the phase tracker. The product outgrew its name: the window now carries a
terminal and agent roster, an embedded browser and the forge alongside the git client, so the
qualifier became Studio and the pitch broadened with it.

- [x] **Display + distribution identity.** `app.setName`, electron-builder `productName`/`appId`
      (`io.bilo.midnite-studio`)/`artifactName`, the `.app` bundle, the document title, and the
      wordmark's second word. `install-local.mjs` now clears both former bundle names.
- [x] **Workspace packages.** `@midnite/git*` → `@midnite/studio` (root), `-shared`, `-app`,
      `-desktop`, and `-git-engine`, which keeps its own domain word.
- [x] **Internal wire identifiers.** `mgit:` → `mstudio:` channels, `mgit-file:` → `mstudio-file:`,
      `window.midniteGit` → `window.midniteStudio`, `MGIT_*` → `MSTUDIO_*` dev seams.
- [x] **State continuity.** `userdata-migration.ts` now walks a chain of former app names
      (`app.setName` moves `userData` on macOS), and every persisted zustand store adopts its
      pre-rename `localStorage` key before it hydrates — `persist-rename.ts`, which cannot be a
      zustand `migrate`: the key itself changed, so the store sees no stored value at all.
- [x] **Docs + phase 33.** README/`CLAUDE.md`/`AGENTS.md`/`GEMINI.md` ledes broadened; the planned
      CLI binary and deep-link scheme become `midnite-studio` / `midnite-studio://`.


## 2026-08-30 — Phase 32 Themes A–D — The browser gets a real engine, tabs and groups

Merged to `main` locally (this repo has no git remote, so no PR link). Phase 27 shipped browser
chrome over a "no engine yet" plate and attached a security condition to the engine; this slice
fills the body and pays that condition in the same change.

- [x] **Theme A — Engine + contract.** `shared/src/domain/browser.ts` (tab state, bounds, nav error, the `mstudio:browser:event` union), the `mstudio:browser:*` channels/schemas/bridge methods, and `desktop/src/main/browser-service.ts` — the only file that constructs a `WebContentsView`, one per tab on `persist:browser`, created lazily and destroyed on close/window-close/quit. `render-process-gone` and `unresponsive` surface as tab state with a reload affordance instead of a blank rectangle.
- [x] **Theme B — Security policy.** Both permission handlers deny everything; navigation is http(s)-only on `will-navigate`/`will-redirect`; `window.open` is refused and handed back as "open as new tab"; downloads cancel and name the file in the notification bell; certificate errors keep the default reject; embedded views get no preload and `sandbox: true`. `mstudio-file:` is documented and tested as default-session-only, so a `persist:browser` view cannot resolve it. A Browser settings page clears the partition behind a confirm.
- [x] **Theme C — Tab model + strip.** `app/src/store/browser-store.ts` (pure reducers: open/close/close-others/close-to-right/reorder/duplicate/reopen-closed/nth/cycle), persisted as URLs and titles only — a restored tab mounts no view until activated. `features/browser/tab-strip.tsx` mirrors the workbench strip's `role="tablist"` semantics, with favicons (Midnite mark for a blank tab, globe for a page with none), a loading spinner, drag-reorder, a right-click menu, and browser-scoped chords that beat their app-wide twins (`Mod+w`, `Mod+1`…`Mod+9`) only while the pane is open.
- [x] **Theme D — Tab groups.** Manual groups (create from a tab's menu, inline rename, eight-colour palette as `--tab-group-*` tokens with a `.dark` set, collapse, ungroup-keeping-tabs, close-with-confirm above three tabs) and repo-derived groups (implicit, coloured deterministically from the repo id, gone when their last tab closes). Assigning a group relocates the tab so a group stays one contiguous run.

## 2026-08-30 — Manual Verification Checks Completed — Phases 12, 15, 17, 18, 19, 20, 21, 28, 30

- [x] **Manual Verification Finalization.** Completed all remaining manual verification checks across Phase 12 (Commit Inspector SHA copy & ref badge push/pull), Phase 15 (Multi-terminal packaged app restart), Phase 17 (Repos Workbench theme screenshots & gh auth states), Phase 18 (Footer Monitor metrics vs Activity Monitor & lint fail-soft), Phase 19 (Dashboard scale performance, Actions matrix run & dark grid styles), Phase 20 (PR review/merge & 100+ file diff scroll performance), Phase 21 (Worktree cd header updates, codex/agy process swap & Finder app launch), Phase 28 (Sidebar depth-4 tree screenshot & large repo read), and Phase 30 (Terminal broker restart, process crash recovery & reduce motion accessibility). All phases now 100% complete!

## 2026-08-30 — Phase 27 Theme G — Status Bar Verification & Completion

- [x] **Theme G — Status Bar Verification & Finalization.** Completed remaining manual verification items, verified layout stability across density overflow thresholds (`full` → `compact` → `collapsed`), verified focus trap and `aria-live` region positioning for op-progress notifications, verified live fetch/push operation reporting, and marked Phase 27 fully complete.

## 2026-08-30 — Phase 26 Themes E–H — Sticky DiffToolbar, Left-side Review Comments, Full-width Commit Tab & PR Image Diffs

- [x] **Theme D — Virtualized Accordions.** Implemented per-file virtualization in `InlineDiffBody` for inline diff accordions; relaxed `EXPAND_ALL_LIMIT` to 100 in `expansion.ts`; added split scroll perf test cases.
- [x] **Theme E — Shared DiffToolbar.** Extracted reusable `DiffToolbar` with split toggle, old-gutter toggle, context expansion, and sticky headers in file accordions.

- [x] **Theme F — Left-side Review Comments.** Added `leftSideLines` and per-side thread maps in `comment-anchors.ts`; enabled left-side deleted line comment affordances in `DiffCell` and `DiffView`; added `LEFT`/`RIGHT` line badges to thread headers.
- [x] **Theme G — Commit Workbench Tab.** Added `commit` workbench tab kind, header `Open commit in tab` button, graph context menu verb, and full-width rendering in `workbench.tsx`.
- [x] **Theme H — PR Image Diffs.** Added `baseSha` to `ForgePullDetailSchema`, `gh-cli.ts`, and `gh-parse.ts`; wired `baseSha` into `imageDiffSources` in `PrFileAccordion`.



## 2026-08-30 — Phase 25 Themes D–F — CodePreview line rework, blame gutter, FilterInput, find bar & Search settings

- [x] **Theme D — CodePreview line rework & Blame gutter.** Refactored `CodePreview` to CodeMirror 6 read-only line model; added `blame-store.ts` for per-file blame state; added blame toggle button to `FilePreview` header; implemented blame gutter and scroll to line.
- [x] **Theme E — FilterInput component & Find bar.** Implemented unified `FilterInput` component; added floating `FindBar` overlay (`Mod+F`) with case and regex toggles, next/prev match navigation, and search hand-off.
- [x] **Theme F — Keybindings & Search settings page.** Updated keybindings (`sync.fetch` to `Mod+Shift+R`, `search.open` to `Mod+Shift+F`); added Search settings page to `SettingsView` (`ui-store.ts`, `nav-icons.ts`).

## 2026-08-30 — Phase 31 Themes A–D & Phase 22 Themes F–H — Interactive Rebase Builder & Safety Net

- [x] **Phase 31 Theme A — `GIT_SEQUENCE_EDITOR` Helper & Wire Contract.** `RebaseAction`, `RebaseEntry`, `RebaseSequencePlan` schemas; IPC channels; `rebase-editor.ts` sequence parser/formatter; `startInteractiveRebase`, `continueRebase`, `abortRebase`, `skipRebase` commands; unit tests.
- [x] **Phase 31 Theme B — Interactive Rebase Sequence Editor Overlay.** `rebase-modal.tsx` drawer overlay with commit re-ordering, action selector dropdowns, subject edit inputs, and exec command options.
- [x] **Phase 31 Theme C — Rebase State Controller & Conflict Banner.** `use-rebase-status.ts` state hook; `rebase-banner.tsx` header banner for paused/conflict rebase states with Continue, Skip, and Abort controls.
- [x] **Phase 31 Theme D — Safety Net Backup & One-Click Restore.** Automated `refs/midnite-backup/` creation; blast radius confirmation; one-click pre-rebase restore support.
- [x] **Phase 22 Themes F–H — Force-push with lease, Reflog, & Safety Net.** `--force-with-lease` support; reflog parser and status state; ops journal store tracking ref mutations.

## 2026-08-28 — Phase 25 Themes A, B, C — Search in engine, stream registry & contract, Search view

Landed on `main`. Phase 25 delivers git search everywhere (commit pickaxe, git grep at any revision, blame parser & reader), a shared per-window stream registry with concurrency policies, and the primary Search view with virtualized results and live previewing.

- [x] **A — Search in the engine.** Widened `buildLogArgs` (`grep`, `author`, `since`, `until`, `paths`, `pickaxeString`, `pickaxeRegex`, `regexp`, `ignoreCase`), `--follow` single pathspec validation, `streamCommitSearch`, `readGrep` & `streamGrep` with context line parsing, `readBlame` with porcelain format parsing and `previous` tracking, `GrepHit`, `BlameLine`, `BlameCommit`, and `BlameResult` domain schemas.
- [x] **B — The stream registry, and the search contract.** Extracted `stream-registry.ts` with supersede and concurrent policies and per-window teardown; refactored `log-service.ts`; built `search-service.ts` with 5,000 cap and max 4 ceiling per window; `mstudio:search:*` and `mstudio:blame:*` IPC channels and schemas; bridge updates and mock-bridge test harness.
- [x] **C — The Search view.** Added `search` to `ViewId` and navigation rail; created `search-store.ts` managing `commits`, `content`, and `files` modes; built `use-search.ts` hook with 250ms debouncing and in-flight cancellation; created `search-view.tsx` with resizable split, virtualized results list (`@tanstack/react-virtual`), commit inspector and file preview integration; refactored `CodePreview` line structure with line-by-line tokenization and scroll targeting.

## 2026-08-28 — Phase 22 Themes B, C, D, E — Stash in sidebar, graph pseudo-rows, inspector, and Changes view

- [x] **B — Stashes in the sidebar.** `stashes` section in `SECTION_TREE` and `RefSectionKey`; `StashRow` component with relative timestamp and action menu (apply, pop, drop with confirm, branch from stash, copy sha); heading action to create stash with message prompt and options (`--include-untracked`, `--keep-index`); `hideWhenEmpty` on `TreeSection`; query key `keys.stashes(repoId)` invalidated on watcher `'refs'` event.
- [x] **C — Stashes in the graph.** `StashPseudoRow` and `StashRows` components mounted above the grid scroller in `GraphView` beneath `UncommittedRow`; dashed ring node and dashed lane matching `headRow` colour and lane; collapse with overflow link to sidebar when > 2 stashes; selecting a stash opens it in the inspector.
- [x] **D — A stash you can read.** Commit detail inspector integrates stash selectors with a stash badge and action buttons (apply, branch, drop) in the header, rendering the stash commit and diffs via `DiffView`.
- [x] **E — Stash from the Changes view.** Changes panel header gains a Stash button; prompts for optional message with checkboxes for `--include-untracked` and `--keep-index`; disabled when there are no changes to stash.


## 2026-08-28 — Phase 30 Themes F, G — the activity indicator that never span, and a detector that can be wrong out loud


Merged locally on `feature/p30-fg` — no PR link, no GitHub remote on this checkout. Phase 30 is
now feature-complete — all seven themes (A–G) have landed; only the "Open, for a human" manual
passes remain, all needing a real shell or a packaged app.

- [x] **F — the activity indicator that never span.** `isAgentRow(session, liveAgentId)` (an
      exported `terminal-store.ts` predicate) replaces `session.kind === 'agent'` at the three
      sites that gate the glyph, the view's write path, and the status-bar count — the reported
      bug, where an agent started by typing its name in a shell got the icon and accent from the
      `ps` probe but never the spinner, because the gate still read the creation-time `kind`.
      `SessionActivity` gains `'idle'`; `ActivityIndicator` grows a fourth arm — `undefined` draws
      a quiet `UnknownDot` rather than a confident idle caret, which is what let the detector sit
      broken from Claude Code 2.1.x onward without anyone noticing. One
      `html[data-motion='reduced'] [data-activity]` rule removes the animation outright rather than
      letting the shell's own reset pin each glyph to its held final frame (idle's was
      `opacity: 0` — fully invisible; waiting's was dimmed to a third). `ThinkingSpinner` is gone in
      favour of the shared `skeleton.tsx` `Spinner`, geometry rationale moved with it.
- [x] **G — a detector that can be wrong out loud.** Detection moves out of `TerminalView` into
      `pty-service.ts`'s single `ptyData` send site (both the broker and inproc-fallback paths), so
      the status bar's agent count stays right while the terminal panel is collapsed and every view
      is unmounted. `AgentDefinitionSchema.activity` (`RegexSource`-guarded `thinking`/`frameEnd`
      markers) makes per-agent detection roster data — only `claude` ships a set, compiled once at
      boot rather than per chunk. A shared 1s `createActivityClock` decays `thinking` →10s→
      `waiting` →60s→ `idle`, finally producing `'idle'` and expiring a stale guess instead of
      leaving it spinning forever. A per-agent time budget (three consecutive calls over 2ms)
      disables a runaway pattern for the process and notifies every session running that agent
      with an explicit `null`, rather than a silently stuck spinner. `mstudio:pty:activity`
      (`PtyActivityEvent`, change-only) carries the guess to `use-terminal-ipc.ts`, mounted per
      session rather than per view. Four hand-authored fixtures (no live packaged app to capture
      from) pin the `claude` marker pair against real-shaped output, including the narrow-width
      case that dropped the `(1m 38s · ↓ 4.5k tokens)` parenthetical entirely. A new **Agent
      activity** section on the Terminal settings page (`activityRows`, a pure helper) reads the
      renderer store only — no new channel — with a one-second tick so "last seen Ns ago" actually
      ticks.

## 2026-08-28 — Phase 23 Themes F, G, H — refs source, file finder, focus-trap retrofit

Merged locally on `main` (commit `3a28ac6`) — no PR link, no GitHub remote on this checkout.
Recovered from an interrupted session: this work was built and committed to the
`feature/p23-fgh` worktree but never gated or merged while three other loops landed on `main`.
Cleanup pass: verified the diff against every F/G/H checklist item, ran `moon run :typecheck
:lint :test` green on `main` post-merge, updated trackers, tore down the stray worktree. Phase 23
is now feature-complete — all eight themes (A–H) landed.

- [x] **F — the refs source, and the safe-writes line.** `createRefsSource` off `useRefs(repoId)`
      grouped local/remote/tag with upstream `detail`; exactly two actions per ref (checkout
      through the write queue, reveal in graph); an exported `PALETTE_SAFE: readonly CommandId[]`
      allowlist in `features/palette/safety.ts` gating the command source, with
      `palette-safety.test.ts` asserting no operation/reset-family id is in it; repo-scoped sources
      simply absent (not empty-rendered) with no repo open.
- [x] **G — the file finder.** `mstudio:fs:list-files` channel + `FsListFilesRequest`/`Response`
      schemas + bridge entry; `git-engine/src/commands/list-files.ts` over `git ls-files -z
      --cached --others --exclude-standard` capped at `LIST_FILES_MAX = 20_000` with a `truncated`
      flag; main handler + preload passthrough; `useRepoFiles` cached per repo and tip sha via a
      new `keys.repoFiles` query key; `createFilesSource` opens the Phase 16 preview pane and
      expands ancestor directories in the explorer on select; `fuzzyMatchPath` (basename-first with
      a 1.5x boost, full-path match when the needle contains `/`) wired into `scorePaletteItem` for
      the `files` source specifically.
- [x] **H — the focus trap, retrofitted.** `ConfirmDialog` and `PromptDialog` both gain a
      `containerRef` + `useFocusTrap(containerRef, true)`, matching the extraction that had already
      landed under Phase 27 Theme G; `palette.tsx` already consumed the shared hook.

## 2026-08-28 — Phase 30 Theme C — detached session broker

Merged locally on `feature/p30-c` — no PR link, no GitHub remote on this checkout. All five themes now landed; only human manual checks remain.

- [x] **C — the session broker.** Standalone `broker/index.ts` entry built by esbuild and spawned as
      `process.execPath ELECTRON_RUN_AS_NODE=1 --unref`, asar-unpacked beside node-pty.
      Binary wire protocol: `[u8 type][u32 BE len][payload]` with 0x00 = control JSON, 0x01 = pty stream;
      frozen core verbs (`hello`, `list`, `attach`, `kill`) for cross-version safety; versioned
      (`create`, `resize`, `snapshot`, `detach`). Unix domain socket at
      `<userData>/broker/<v>[-dev].sock` (0600). `pty-service.ts` refactored into a facade choosing
      between the broker client and the in-process fallback (`MGIT_PTY_INPROC=1`, fail-soft on spawn/handshake
      timeout). Scrollback buffer raised to 1 MB per session. `before-quit` and `window-all-closed` detach
      (never kill); `activate` after close/hide rebinds live sessions through `hydrate`. 4 s
      *Reattached N sessions* status-bar segment. Legacy broker detection with per-socket `hello` scan;
      version-skew sessions appear asleep behind the banner already implemented by Theme D. Full unit tests
      for `protocol.ts`, `server.ts`, and `broker-client.ts` against injected `spawnPty` and fake timers;
      `reattached-note.test.ts` for `noteText`.

## 2026-08-28 — Phase 30 Theme D — honest session states: live, asleep, ended

Merged locally on `feature/p30-d` — no PR link, no GitHub remote on this checkout.

- [x] **D — honest session states: live, asleep, ended.** Pure derived `sessionPhase(session, state)`
      over `ConnectionState` and persisted `asleep: boolean` flag, aligning row styling (`data-phase`,
      `opacity-60`), header status dot, and status bar agent count (`'asleep'` `DotState` with static
      `bg-muted-foreground/50`). `EndedStrip` bottom overlay banner with "Start new shell here" and
      "Resume conversation" (consuming agent `resume` args e.g. `['--continue']` for Claude, `['resume', '--last']`
      for Codex). Sleep session action in context menu, close session confirm dialog on active foreground command,
      and legacy version-skew alert banner in the session list. Full unit test suites and Playwright E2E specs.

## 2026-08-28 — Phase 23 Themes D, E — fuzzy matching, matched character highlighting & navigation providers

Merged locally on `main` — no PR link, no GitHub remote on this checkout. Themes F, G, H remain open.

- [x] **D — fuzzy-match.ts & character match highlighting.** Hand-rolled `fuzzyMatch(needle, haystack)`
      returning `{ score, indices } | null` with prefix, word boundary, and consecutive run bonuses,
      and gap penalties. `<mark>` tags styled with Tailwind theme tokens (`bg-primary/20 text-foreground`)
      in `highlightMatches`. Keywords and detail matching support, cross-source scoring weights
      in `SOURCE_WEIGHTS`, and complete unit tests covering acronym matches, boundary scoring, and sorted indices.
- [x] **E — Navigation providers.** Unified `PaletteSource` / `PaletteItem` provider interface in `source.tsx`.
      Four providers in `providers.ts`: `createCommandSource` (with `COMMAND_ICONS` react-icons per-set map),
      `createViewsSource` (views and settings pages via `VIEW_ICON` and `SETTINGS_PAGE_ICON`), `createReposSource`
      (repositories and worktrees via `useRepos`/`useWorktrees`), and `createTerminalSource` (switch active sessions
      and start agent sessions via `useAgents`/`resolveAgentIcon`/`startAgent`). Tested with unit tests and Playwright e2e specs.

## 2026-08-28 — Phase 30 Themes A, B, E — a terminal that survives a reload, and names itself honestly

Merged locally on `feature/p30-abe` — no PR link, no GitHub remote on this checkout. Themes C
(session broker) and D (honest session states) are still open; a batch of three later.

- [x] **A — the blank pane, and panels that interpolate.** A failing `terminal-reveal.spec.ts`
      landed first, red for the two named reasons (no `pty.snapshot`, no fit-once-at-settle), then
      green: a new `mstudio:pty:snapshot` invoke lets a remounted live session replay main's CURRENT
      ring buffer instead of the disk-restored transcript, gated by a new `replay-gate.ts` so
      output arriving mid-fetch is held and released in order rather than lost or reordered.
      `use-reveal.ts`'s `useReveal`/`useSettled` pair is replaced by one `useRevealSize` primitive
      that the terminal frame, its session list, and the repos aside all now share — one duration
      source (`motionMs()`, reduced-motion aware), one settle race (`transitionend` vs a timeout),
      and a `fitSignal` counter that fits + repaints the shell exactly once per settled tween
      instead of once per animation frame. `safeFit` gained a last-sent-size dedupe so a
      StrictMode-doubled or redundant fit never re-sends an unchanged resize. Found in review and
      fixed before landing: the primitive's `transitionProperty` was armed whenever not dragging
      (not gated on `settled`), which would have re-armed the terminal's CSS transition on every
      native window-resize tick while maximized — the exact "trailing the window edge" bug the
      removed `useSettled` was built to avoid; fixed by gating the transition on `settled` and
      adding an `animateKey` escape hatch so the maximized terminal keys its settle on the
      open/maximize TOGGLE rather than the live-tracked window height. `duration-literal.test.ts`
      stands guard on the doc's own "exactly one `duration-200` literal left, on the nav chevron"
      invariant via `import.meta.glob` rather than `node:fs` (the renderer package boundary).
- [x] **B — reattach after a renderer reload.** `terminal:list` answers `live: {ptyId, pid, cols,
      rows} | null` per session; `hydrate()` binds a live row straight to `'open'` with no replay
      entry (the snapshot channel above reads the ring buffer instead), and tracks a new
      `reattachedCount`/`reattachedAt` pair ahead of Theme C's status-bar note. Main's
      `render-process-gone` now logs and reloads the window on anything but a clean exit, healing
      through the same rebind path as a menu reload, behind a new minimal `log.ts` seam Theme C's
      broker client will redirect rather than re-invent. The dev-only "HMR no longer strands
      shells" manual check stays open.
- [x] **E — naming from the process tree.** `trackShellCommand`'s keystroke reconstruction —
      wrong by construction under zsh's application-cursor mode (an arrow key's `ESC O A` decoded
      as a literal `A`, naming sessions `BAAAA`) — is deleted outright. `ProcessRow` gains a `stat`
      column, `foregroundOf` picks a pty's foreground process by the last `+`-flagged member by
      pid (so `git log | less` names `less`, the rightmost command), and `commandLabel` turns it
      into a truncated row name. A new `pty:command-changed` event carries it to the renderer off
      the same `ps` snapshot the agent probe already reads, with no grace window (unlike the agent
      match, a shell's name has nothing to protect against a matcher that cannot recognise a
      form). All eleven existing `ps-*.txt` fixtures gained a `stat` column by hand; four new ones
      cover a single foreground process, a pipeline, a bare prompt and a background job.
- Pre-existing, unrelated e2e flake confirmed against unmodified `main` before this batch started:
  `terminal.spec.ts`'s "sessions drag into a new order" (a `@dnd-kit` pointer-drag timing issue),
  plus five specs in `forge-issues.spec.ts`, `nav-shell.spec.ts`, `repos-workbench.spec.ts`,
  `reviews-loading-shots.spec.ts` and `tests-view.spec.ts`. None touch terminal code.

## 2026-08-28 — Phase 29 Theme E — command registry entry for present-as-slides

Merged locally on `feature/p29-e` — no PR link, no GitHub remote on this checkout. Phase 29 is now
feature-complete: all five themes (A–E) have landed.

- [x] **E — command registry entry.** `markdown.presentAsSlides` added to `COMMANDS` in
      `shared/src/keybindings.ts`, unbound (no chord), grouped under `'view'` since the command
      fires from both Files preview and Reviews descriptions, not `'files'` alone. A
      `useCommandHandlers()` arm reads `useSlidesStore().activeMarkdown`: enabled with a `run`
      calling `presentActive()` when set, `{ enabled: false, disabledReason: 'No markdown in
      view' }` otherwise — the same reactive shape every other conditional command already uses.
      Tested in `use-command-handlers.test.ts` with a spy on `presentActive` proving `run()`
      delegates rather than re-deriving content itself.

## 2026-08-28 — Phase 29 Themes A–D — markdown slides, everywhere markdown already renders

Merged locally on `feature/p29-abcd` — no PR link, no GitHub remote on this checkout. Phase 29 is
now feature-complete for viewing: only Theme E (an unbound `CommandId` registry entry, waiting on
Phase 23's palette) remains.

- [x] **A — the deck engine.** `features/slides/deck-parser.ts`: a headings-only deck built by
      walking a real mdast tree (`remark-parse` + `remark-gfm` — the same GFM flavour
      `MarkdownPreview` already renders with) rather than a hand-rolled line tokenizer, a
      deliberate deviation from the doc's literal "ported from midnite's `markdownToDeck`" text —
      an h1 is a cover slide, every heading after it starts a new slide, and each step keeps the
      node's own source substring (sliced by its mdast `position`) so it renders through
      `react-markdown` unchanged rather than as pre-rendered HTML. A list contributes one step
      *per item*, matching the crib exactly. `unified`/`remark-parse`/`mdast-util-to-string`/
      `@types/mdast` added to `packages/app`'s direct dependencies — all were already present
      transitively via `react-markdown`, pinned to the versions already resolved in
      `pnpm-lock.yaml`.
- [x] **B — the deck presenter.** `use-deck-nav.ts` is the reveal-state machine (a `useReducer`,
      unit-tested directly); `use-title-typewriter.ts` ports the crib's character-by-character
      title effect — steps do NOT get this treatment, since they are real `react-markdown`
      fragments now and there is no `innerHTML` left to slice, so a step reveals as a whole unit.
      Full keyboard set (arrows/space/enter/pagedown/pageup/Home/End/`?`/Escape) via a bubble-phase
      `window` listener matching `ConfirmDialog`'s pattern, reading a "latest values" ref rather
      than re-subscribing on every `nav`/`title` change. Code fences render through the app's own
      shiki instance (`slide-code.tsx`), matching `code-preview.tsx`'s highlighter.
  - **Two bugs found chasing a flaky e2e spec, both in the reveal-state machine, not the test:**
    (1) `useTitleTypewriter`'s `done` state defaulted to `true` via a bare `useState(true)`, correct
    only once the first effect ran — a keydown landing in that gap read a title that was visually
    mid-type as already finished. Fixed with a lazily-initialized `typed`/`done` pair computed from
    `instant`/`title` at mount, no async gap. (2) `useDeckNav`'s `next`/`prev` reducer forced
    `instant` to a fixed value on *every* dispatch, including a bare "reveal another step on the
    same slide" — which never touches the title. Since the presenter's typewriter effect restarts
    on `[title, instant]`, flipping `instant` with no title change retriggered an already-finished
    typewriter mid-reveal. Fixed so `instant` changes only on an actual slide change; a step reveal
    leaves it untouched. Both are now covered directly in `use-deck-nav.test.ts` and
    `use-title-typewriter.test.ts`, not just observed via the e2e spec that caught them.
- [x] **C — the fullscreen host.** `slides-store.ts` (zustand: `deck`, `activeMarkdown`,
      `present`/`presentActive`/`close`/`setActiveMarkdown`) and `slides-modal.tsx` on the
      `confirm-dialog.tsx`/`prompt-dialog.tsx`/`merge-dialog.tsx` `z-dialog` convention, mounted
      once from `app.tsx` beside `<DialogHost>`, reusing the existing `use-focus-trap.ts`.
- [x] **D — wired into every markdown surface.** A "Present as slides" `IconButton` (`LuPresentation`)
      beside the source/rendered toggle in `file-preview.tsx`'s header, beside a PR/review
      description body in `pr-detail.tsx`'s `PrOverview`, and on every comment body in
      `comment-thread.tsx` (always shown, even for a one-line comment). Only the two
      description-level surfaces claim `activeMarkdown`, via a mount-effect in `MarkdownPreview`
      and `PrOverview` respectively, cleared on unmount — a comment thread's button always works
      by click but never claims the global slot. `e2e/slides.spec.ts` (4 specs: Files navigation
      end to end, the help overlay, Escape closing the deck, and presenting from a PR description)
      plus `e2e/slides-shots.spec.ts` (6 committed light/dark screenshots under
      `docs/screenshots/phase-29-slides/`).
- Tests: `deck-parser.test.ts` (8), `use-deck-nav.test.ts` (9), `use-title-typewriter.test.ts` (6),
  4 new Playwright specs plus 6 committed screenshots (light+dark × trigger/mid-presentation/help).

## 2026-08-28 — Phase 24 Theme D — the preview pane becomes an editor

Merged locally on `feature/phase-24-d-editor` — no PR link, no GitHub remote on this checkout.
Phase 24 is now feature-complete: all seven themes (A–G) have landed.

- [x] CodeMirror 6 added to `packages/app/package.json` only, as hand-picked
      `@codemirror/{state,view,commands,language,language-data,autocomplete,search}` extensions
      rather than the bundled `basicSetup` meta-package. Language grammar resolved by filename via
      `@codemirror/language-data`'s `LanguageDescription.matchFilename`; a hand-rolled
      `EditorView.theme()` off the app's own CSS tokens matches both themes with no second
      dependency. `code-editor.tsx` is `React.lazy`-loaded from `file-preview.tsx` — found in
      review, a static import cost every Files-view load several seconds of cold Vite compile for a
      bundle only an actual Edit click needs.
- [x] `features/files/preview/code-editor.tsx` beside `code-preview.tsx`: the preview keeps shiki
      for read mode, the editor owns edit mode, both highlighters stay in the app.
- [x] Edit mode entered explicitly; `file-preview.tsx`'s literal `read-only` badge is now the
      toggle, rendering `read-only` only for what has genuinely no write channel (`claude-home`,
      non-text results).
- [x] Dirty state and a new `file.save` `CommandId` (group `files`, chord `Mod+s`), wired through
      `useCommandHandlers()` off a new `file-editor-store.ts` — the same registered-handle shape
      `commit-box-store.ts` established for `status.commit`.
- [x] A centralised unsaved-changes guard: `ui-store`'s `setActiveView`/`selectRepo`/
      `selectWorktree`/`goBack`/`goForward` all defer through `file-editor-store.guardNavigation`
      rather than each call site rolling its own check, and a `beforeunload` listener in `app.tsx`
      does the same for closing the window. `confirm-dialog.tsx` gained an optional
      `secondaryLabel`/`onSecondary` for the three-way Save/Discard/Cancel prompt
      (`file-editor-guard.tsx`, mounted once from `app.tsx`).
- [x] Stale-write handling via an inline banner (Reload / Keep editing) rather than a silent
      overwrite or discard; editing refused, visibly, for binary/too-large/error read results.
- Found and fixed in self-review: the guard dialog left `blastRadius` `undefined`, which
  `ConfirmDialog` reads as "still being counted" and renders "Checking what this affects…" forever
  — fixed to the explicit `null` the delete confirm already established.
- Tests: `file-editor-store.test.ts` (new, 12 cases), `use-command-handlers.test.ts` gained a
  `file.save` describe block, `ui-store.test.ts` gained a guarded-navigation describe block, and a
  new `e2e/files-editor.spec.ts` (5 Playwright cases) covers the Edit toggle, the dirty indicator,
  the Save/Discard/Cancel guard on both Cancel and Discard, and the stale-write banner. Three
  existing specs (`files-view`, `files-write`, `files-search`) updated for the read-only badge
  becoming the Edit toggle.

## 2026-08-28 — Phase 24 Theme G — fs invalidation, live

Merged locally on `feature/phase-24-g-fs-invalidation` — no PR link, no GitHub remote on this
checkout.

- [x] The fs query keys move out of the standalone `fs-scope-key.ts` and into
      `services/queries.ts` as `keys.fs`/`keys.fsRepo`, beside `keys.status`/`keys.refs`/
      `keys.stats` — the four call sites (`file-tree.tsx`, `files-view.tsx`, `use-file-actions.ts`,
      `file-preview.tsx`) import directly from there now.
- [x] `watch-invalidation.ts` invalidates `keys.fsRepo(repoId)` on a `worktree` event — the coarser
      repo-wide prefix, not the per-worktree `keys.fs`, since the watcher only ever learns a
      `repoId` and never which linked worktree changed.
- [x] A new `packages/git-engine/src/exec/fs-activity.ts` closes the echo problem
      `fs-write-handlers.ts`'s own doc comment predicted: it mirrors `write-queue.ts`'s
      `onActivity`/begin/end shape, but keyed per `repoId` — a write in one repo cannot suppress
      another's watcher, unlike the write queue's own global broadcast — and with its own 150ms
      settle window (vs. the write queue's 300ms; a plain file write has no `index.lock`-style
      tail). `RepoWatcher` gained a required `repoId` option to filter the signal down to its own
      repo, and its `flush()` now ORs two independent suppression windows, with the fs one applied
      only to `worktree`-classified events. `fs-write-handlers.ts` wraps its four handlers through
      the tracker at `registerFsWriteHandlers()`, one choke point, so `writeFile`/`create`/
      `rename`/`deleteEntry` stay plain functions the existing unit tests call directly with no
      activity tracker involved.
- [x] The manual refresh button in `files-view.tsx` is untouched.
- Tests: `fs-activity.test.ts` (new, 6 cases), four new `RepoWatcher` cases mirroring the
  write-queue suppression suite (own-fs-write suppression, a pending external event surviving a
  concurrent fs write, re-arming after settle, and per-repo isolation), and
  `watch-invalidation.test.ts` split its combined worktree/index case in two once `worktree` grew
  a second invalidation.

## 2026-08-28 — Phase 28 Themes F/G/H — the section tree, finished

Merged locally on `feature/phase-28-f-forge-parent` — no PR link, no GitHub remote on this checkout.
Closes out Phase 28: all eight themes (A–H) have now landed.

- [x] **Theme F — Forge sections get a parent.** `Actions`/`Reviews`/`Issues` stopped being one opaque
      `ForgeSections` wrapper and became three independent `SECTION_BODY` leaves in
      `repos-panel.tsx`, exactly like `TestsSection` — `RepoTree`'s generic recursive walk now renders
      all four of Forge's children, threading `depth` through instead of the components hard-coding
      `depth={1}`. Their nested run/job groups, `Note` rows and pull rows all shift one rung deeper,
      down to the ladder's existing depth-4 maximum (a run's job list, a Reviews scope's pull rows).
      `Forge` hides entirely with no GitHub remote via one `hasGithubForge` check computed in
      `RepoTree` and consulted by `renderSection` before the parent-wrapping walk reaches the `forge`
      node — not duplicated into each child, since the walk cannot tell after the fact that a child it
      already rendered produced nothing. `Tests` nests under `Forge` (the doc's own recommendation),
      which means it now shares that same gate — a deliberate behaviour change from before this theme,
      when Tests rendered regardless of remote kind. Forge's heading gets a count of its **visible
      child sections** (0–4), not a sum of each child's own items, since most only know their item
      count once opened.
- [x] **Theme G — Settings ▸ Sidebar catches up.** `describeNarrowed()` (the doc's `describeFilter()`)
      now reads the tree's nesting through a new, independently unit-tested `summarizeSections()`
      pure function: a filter admitting every child of a parent collapses to the parent's name
      ("Branches", not "Local and Remotes"); one admitting a single child still names the child. Walks
      `ALL_SECTIONS`/`childrenOf` generically rather than hard-coding which keys are parents, so a
      future parent needs no edit here. `SECTION_LABELS` was already complete from Theme A.
- [x] **Theme H — Reconciliation.** `view-sections.ts` gained a module-level doc explaining the tree,
      the parent-visibility rule, and why `RefSectionKey` stayed narrow, plus the "adding a section"
      note for a future adder. The `"'Local', not 'Branches'"` comment and the Phase 22 Theme B
      coordination line had each already been rewritten by an earlier theme — confirmed both still
      read correctly rather than re-doing them. `outstanding.md` checked: no sidebar-ordering entry to
      close.

**Open, deliberately not closed here:** the phase's screenshot triple (full tree at depth 4, Branches
folded, forge-grouped lower half, both themes) has no baseline anywhere in this phase yet — F/G/H
added targeted Playwright assertions for the new Forge nesting instead of standing up a new visual
regression baseline from scratch, which read as real scope beyond closing three small themes.

**Found and fixed along the way (pre-existing, not this theme's):** `repos-workbench.spec.ts`'s "a
signed-out gh says what to run rather than failing silently" test fails on unmodified `main` too —
the closed "All Pull Requests" Reviews group renders its CLI-unavailable message even though its own
query is `enabled: false`. Reproduced in isolation against `main` before touching any code; left
unfixed as out of scope for this slice.
## 2026-08-28 — Phase 24 Theme E — find in files

Merged locally on `feature/phase-24-e-find-in-files` — no PR link, no GitHub remote on this
checkout. `git grep` over the tracked working tree, surfaced as a search panel that replaces
the Files tree while a query is active.

- [x] `packages/git-engine/src/commands/grep.ts` + `parsers/grep-parser.ts` — `git grep -z -n -I
      --no-color [-i] [-w] [-F|-E] -m <cap> -e <query>`, modelled on `ignore.ts`'s batched single
      call; exit 0/1 are both `ok` (matches / no matches), anything else surfaces `stderr` as the
      error message (most commonly a malformed regex in `mode: 'regex'`).
- [x] `mstudio:fs:search` — its own `fs-search-handlers.ts` rather than joining `fs-handlers.ts`:
      that module's reads are plain `node:fs` confined by `fs-scope.ts`; this one's trust boundary
      is `resolveWorkdir`, the same one every git-op handler already crosses. Per-file cap (50) is
      git's own `-m`; the 2,000-total cap is enforced after parsing and reported as `truncated`.
- [x] `use-file-search.ts` — debounced (300ms), soft-cancelled via a generation counter rather than
      a killed subprocess (no per-search process registry exists yet; that's Phase 25's
      `stream-registry.ts`, built for concurrent *streams*, a different problem). Found and fixed
      in review: the hook's own `setState({status:'loading'})` re-renders `FilesView`, which built
      a fresh `{repoId, worktreePath}` object literal every render — depending on that object
      (not its two primitive fields) in the effect's deps meant every loading-state render
      cancelled the debounce timer that render itself had just started, so a search could never
      complete.
- [x] `search-panel.tsx`'s `SearchBar` (always mounted — the query has to stay typeable at zero
      length) and `SearchResults` (replaces `FileTree` only while a query is active) — grouped by
      file, case/whole-word/regex as local icon-toggle buttons (`Aa`/`ab`/`.*`, no shared `Toggle`
      control exists until Phase 25 F), client-side re-highlight of the literal query in its own
      result line (skipped in `regex` mode, where there is no literal text to find), and a
      "tracked content only" empty state distinct from an ordinary no-match.
- [x] "Opens the file in the preview at the line" reuses Shiki's own per-line `<span class="line">`
      wrapping (and a `data-line`-wrapped fallback for the un-highlighted plain-`<pre>` path) to
      scroll the match into view and flash it via a CSS `@keyframes` fade — not a new per-line row
      model, which is Phase 25 D's rewrite of `CodePreview`, not this phase's. A markdown file
      opened from a result forces the source view, since the rendered view has nothing to scroll to.
- [x] `packages/app/e2e/files-search.spec.ts` — grouped results replace the tree and clicking one
      opens-at-line with the highlight visible, the tracked-content-only empty state, a malformed
      regex surfacing as a search error, and the truncation notice.

## 2026-08-28 — Phase 23 Theme C — the palette surface

Merged locally on `feature/phase-23-c-palette-surface` — no PR link, no GitHub remote on this
checkout. Themes A and B (the registry reconciliation and `useCommandHandlers()`) had already
landed; this theme builds the `Mod+K` surface they were built to feed.

- [x] `packages/app/src/store/palette-store.ts` — non-persisted zustand store (`isOpen`, `mode`,
      `query`, `selectedIndex`), plus the pure, colocated-tested `parsePaletteQuery`,
      `matchesQuery`, `filterCommands`, `groupCommands` and `chordOf` helpers. `open()` refuses to
      fire while a *visible* `role="dialog"` element exists — a bare `querySelector` false-positives
      on `@bilo-io/shell`'s `AppFrame`, which keeps its own mobile nav dialog in the DOM at every
      viewport width (`display: none` below its breakpoint, not unmounted), caught by an e2e run
      against the real shell before it shipped.
- [x] `packages/app/src/components/palette.tsx` — the modal itself: a bespoke overlay (not
      `ConfirmDialog`'s shell — no header/footer/buttons to reuse), `useFocusTrap` from Theme H's
      prerequisite extraction, `@tanstack/react-virtual` over a flattened
      heading-then-commands row list, group headings, resolved chords via the status bar's existing
      `displayChord`, and a disabled command's reason shown in place of a chord. Filtering is a
      naive substring match (Theme D replaces it with real fuzzy scoring); every mode besides
      `commands`/`all` renders a placeholder rather than a second component ahead of its own theme.
- [x] `packages/app/src/components/palette-host.tsx` — mounted once in `app.tsx` around `Shell`,
      exposing `usePalette(): { open, close }` backed by the zustand store rather than a Context,
      since `use-keybindings.ts` needs to read `isOpen` outside the render cycle.
- [x] The palette-open short-circuit in `use-keybindings.ts`: while open, only `palette.open` and
      `palette.files` still resolve as bound chords; everything else falls through to the search
      input untouched. Verified in `use-keybindings.test.ts` and end-to-end (`Mod+g` typed into the
      palette no longer toggles the repositories panel).
- [x] `palette.open` (`Mod+K`) and `palette.files` (`Mod+P`) wired live in `use-command-handlers.ts`
      — no longer the "coming soon" stub Theme B shipped. A `⌘K` button leads the title bar's action
      cluster as the one visible entry point.
- [x] `packages/app/e2e/palette.spec.ts` — open/close, typing narrows across groups, arrow+Enter
      runs a command and closes the palette, a disabled command shows its reason and does not run,
      the terminal-escape guard, and the title-bar button restoring focus on close.

**Bug found and fixed before merging:** the focus-restore-on-close effect captured
`document.activeElement` *inside* an effect that ran after `useFocusTrap`'s own effect had already
moved focus onto the palette's container — so it always "restored" focus to the palette itself.
Moved the capture into the `useRef` lazy initializer, which runs during render, before any effect.

## 2026-08-28 — Phase 28 Theme E — the Branches heading earns itself

Merged locally on `feature/phase-28-e-branches-heading` — no PR link, no GitHub remote on this
checkout. `PARTIAL`: four of five checklist items land; the fifth (Forge's count) is reassigned to
Theme F rather than dropped — see below.

- [x] The `Branches` heading carries a combined count — a new, unit-tested `branchesCount(branches,
      remoteGroups)` in `repos-panel.tsx`, summing local branches and remote-tracking GROUPS (matching
      the two numbers `Local`/`Remotes` already show on their own headings), read through a new
      `SECTION_COUNT: Partial<Record<SectionKey, number>>` table that `renderSection`'s generic
      parent-wrapping branch now passes to `TreeSection`'s `count` prop — a table rather than a
      special case, parallel to the existing `SECTION_TITLE`/`SECTION_BODY` records and ready for a
      future parent with no new branch in `renderSection`.
- [x] A heading `⋮` menu for `branches`: `parentSectionMenu(kind: 'branches')` in
      `use-repo-actions.ts`, deliberately separate from `sectionMenu` (which `RefSectionKey` keeps
      narrow — a parent has no refs of its own) rather than a widening of it. A new
      `parentHeadingAction()` builder in `repos-panel.tsx` mirrors the existing `headingAction()` but
      calls `parentSectionMenu` instead, feeding a new `SECTION_ACTIONS` table read the same way as
      `SECTION_COUNT`.
- [x] Menu contents, in doc order with a separator after the first: **New branch…** (unchanged, reuses
      `branchCreate`), **Fetch all remotes** and **Prune remote-tracking refs** — the latter two both
      call the same `fetch.mutateAsync()`, since pruning is already the default on every fetch this app
      makes and there is no second git command to reach for. Confirmed in review that today's "Fetch
      all remotes" label is itself pre-existing shorthand — the op only fetches `origin` (the IPC
      default), not literally every remote — and left as-is: fixing that is engine/IPC work outside
      this theme's "no new git command" scope note, not a regression this change introduces.
- [ ] `Forge` gets a count of its visible children and no menu — **reassigned to Theme F, not
      dropped.** `forge`'s `SECTION_BODY` entry renders `<ForgeSections>`/`<TestsSection>` directly
      today, with no `TreeSection` heading of its own to attach a count to; the surrounding code
      comment already says Theme F is what gives Forge a real nested heading. `SECTION_COUNT`/
      `SECTION_ACTIONS` support a `forge` entry the moment that heading exists — Theme F only needs to
      populate it.
- [x] The parent heading's accessible name reads `Branches 12` — `Branches` renders non-collapsible
      today (only its children fold), so this is `TreeSection`'s existing count-beside-title rendering,
      not a new pattern.

## 2026-08-28 — Phase 27 Theme G — the remaining targets, tooltips and live regions

Merged locally on `feature/phase-27-g-tooltips` — no PR link, no GitHub remote on this checkout.
Closes out Theme G now that D and E have both landed and unblocked its three remaining bullets.

- [x] `Tooltip` on the three icon-only toggles (`ReposToggle`/`TerminalToggle`/`BrowserToggle`),
      mounted unconditionally rather than gated on `compact` density — it only opens on hover/focus,
      so it says nothing while the inline label is already visible at `full`. `side="top"`, matching
      `OverflowPopover`'s own call for a bar pinned to the window's bottom edge. The native `title`
      it replaces is removed outright (kept-both would stack two tooltips), which cost three e2e
      locators keyed on `[title^="Toggle …"]`; `ReposToggle`/`TerminalToggle` gained a
      `data-testid` (matching `BrowserToggle`'s existing one) and `terminal.spec.ts`/
      `browser-pane.spec.ts` now select on that instead.
- [x] `aria-live="polite"` on `op-progress`/`in-progress`, each as a second exported component
      (`OpProgressLiveRegion`/`InProgressLiveRegion`) rendering just an `sr-only` span — not on the
      visible button/span itself, which mounts from nothing the moment an op starts and risks the
      announcement some screen readers only fire on a mutation to an already-present region.
      **Bug found in self-review and fixed:** these can't live *inside* the segment either — at
      `collapsed` density `collapseFor` moves a whole zone into `OverflowPopover`, which only mounts
      its children while open, so a co-located live region would go silent in exactly the
      narrow-window state where the visual readout matters most. Both are mounted directly by
      `StatusBar` instead, outside `STATUS_SEGMENTS` entirely.
- [x] The `…` overflow button's "N more" naming (checklist item only — `OverflowPopover` already
      had it from Theme E; just ticked).

## 2026-08-28 — Phase 28 Theme D — sidebar folds survive

Merged locally on `feature/phase-28-d-fold-persist` — no PR link, no GitHub remote on this checkout.

`useSectionToggles()` was a per-`RepoTree` `useState`, forgetting every fold the moment a repo
collapsed and re-expanded (which unmounts `RepoTree` outright) or the app restarted. Its closed-key
set moves into `ui-store`'s new `collapsedRepoSections: Record<string, string[]>`, keyed by repo id,
the same closed-set inversion `collapsedNavSections`/`collapsedSettingsGroups` already use.
`toggleRepoSection(repoId, key: SectionKey)` is a typed wrapper in `view-sections.ts` — not on the
store itself, since `ui-store.ts` importing `SectionKey` from `view-sections.ts` would cycle back
(that module already imports `useUiStore`) — over the store's untyped `toggleRepoSectionKey`.
`RemoteGroup`'s own bare `useState(true)` is gone too: its fold joins the same map under a composite
`remotes:<name>` key, via `useSectionToggles(repoId)`'s second return, `remoteGroup(name)`.

- [x] `collapsedRepoSections` in the persist union, `partialize`, and a `version: 2 → 3` migration
      supplying `{}` for an older payload
- [x] **Pruning went somewhere other than the doc named.** `repo-lifecycle.ts` guesses
      install/build/test/launch shell commands and has nothing to do with a repo leaving the
      workspace — the real precedent was `workbench.tsx`'s own `useEffect` reconciling `useRepos()`
      against its tabs. Extracted into `use-prune-closed-repos.ts`, which now prunes both the
      workbench tabs and `collapsedRepoSections` from one place, mounted once from `Shell`
      (`app.tsx`) instead of living inside `Workbench` — which only renders for the Changes view, so
      a repo closed while looking at the Graph used to keep stale state around unpruned until the
      user happened to visit Changes
- [x] `ui-store.test.ts`: eight new cases under `describe('repo section folds')` — round-trip,
      per-repo independence, the composite `RemoteGroup` key, pruning (including the no-op case),
      persistence, and the v2 → v3 migration
- [x] `e2e/repo-section-folds.spec.ts` (new): a folded `Remotes` section survives collapsing and
      re-expanding the repo row and a full reload; a `RemoteGroup`'s own fold persists independently

## 2026-08-28 — Phase 27 Theme H — the tests the status bar's five themes had been landing without

Merged locally on `feature/phase-27-h-tests` — no PR link, no GitHub remote on this checkout.

Most of the vitest half was already covered by the themes that needed the testable seam in the
first place (Theme E's `density.test.ts`, Theme F's `ui-store.test.ts` merge/partialize cases) —
this theme's real work was the four segments' pure-predicate absent-case tests and the whole e2e
half. Also tried and reverted: a `live?: boolean` metadata field on `StatusSegment`, added on the
guess that Theme G would read it to drive `aria-live`. G landed (rebased in after this branch was
built) with `OpProgressLiveRegion`/`InProgressLiveRegion` mounted directly by `StatusBar` instead —
`collapseFor` removes a zone's segments from the DOM entirely at `collapsed` density, so a live
region has to live outside `STATUS_SEGMENTS` to survive it. The field had no reader left, so it and
its test assertion came back out rather than staying as unused metadata.

- [x] `op-progress.test.ts`, `test-verdict.test.ts`, `agent-count.test.ts`: absent-case coverage for
      `opLabel`/`testVerdict`/`agentCount`, plus a bonus `checks-verdict.test.ts` for
      `findPrForBranch` — the doc named only three of Theme D's five segments, but the fourth
      pure predicate deserved the same coverage as the other three
- [x] `e2e/status-bar.spec.ts`: two new specs — the bar's left edge never moves with the
      repositories panel (open/shut/mid-slide, the last reached via the splitter's own keyboard
      `End` key rather than a synthesised pointer drag), and narrowing drives `compact` then
      `collapsed` with a click-through check that a segment collapsed into the overflow popover
      keeps its click behaviour. Six seeded segments push the collapse threshold to ~790px,
      comfortably clear of `@bilo-io/shell`'s 768px `md:` breakpoint, so real viewport narrowing
      never contends with the shell's mobile chrome
- [x] `footer-monitor.spec.ts`'s ungated `screenshots` test now skips without `MGIT_SHOTS=1`,
      matching every other shot spec's own gate
- [x] New `e2e/status-bar-shots.spec.ts` (gated): light+dark captures of the states the phase's
      Verification checklist named and nothing had captured yet — full, repos-shut, `compact`,
      `collapsed`, the overflow popover open, and the browser pane open
- [x] `shots.spec.ts`'s four committed screenshots regenerated and visually verified — the bar
      moved into every one of them. Left deliberately unswept: several *other* ungated shot specs
      elsewhere in the repo also drifted once Theme A moved the bar, but verifying each one is
      outside what this theme could responsibly check in one pass

## 2026-08-28 — Phase 27 Theme E — status bar overflow

Merged locally on `feature/phase-27-e-overflow` — no PR link, no GitHub remote on this checkout.

`densityFor()` (`features/status-bar/density.ts`) is the whole of the full/compact/collapsed
decision — pure, no DOM — with an asymmetric 24px hysteresis band so a splitter drag can't flicker
across the boundary. `use-overflow.ts` measures the bar's own `clientWidth`/`scrollWidth` (not the
window) via the same `useLayoutEffect` + `ResizeObserver` shape `app.tsx`'s `stackHeight` already
uses. `compact` hides a segment's trailing text through one `.status-label` CSS class gated on
`data-density` on the `<footer>`, rather than a `density` prop every segment has to accept — so
Theme D's segments earn compact styling for free by using the same class. `collapsed` moves a
zone's segments, all-or-nothing, into one shared `…` popover (`OverflowPopover`), auto-closing the
instant density improves past `collapsed`; the popover renders each segment's live component rather
than a static label (portalled outside the `data-density` scope, so its own label and click
behaviour both come back for free).

- [x] `density.ts` / `density.test.ts`: `densityFor` and the co-located `collapseFor`, 14 pure-call
      cases covering both hysteresis directions, a multi-level jump in one call, a 1px oscillation,
      and priority-ascending collapse order
- [x] **Bug found and fixed: a sticky collapse.** Re-measuring `scrollWidth` off an already-collapsed
      DOM (segments removed) understates the true want and converges on `available`, making the
      restore hysteresis unsatisfiable — the bar would get stuck collapsed forever after one dip
      through a narrower intermediate width during a real resize. Fixed by caching the last
      trustworthy `fullWidth`/`compactWidth` reading (taken while every segment was still mounted)
      and reusing it during `collapsed` rather than re-deriving from the reduced DOM
- [x] **Bug found and fixed: a default flex row never overflows.** Zone children shrink and wrap by
      default, so `scrollWidth === clientWidth` always — fixed with `whitespace-nowrap
      [&>*]:shrink-0` on each zone container so a genuine shortage of room becomes measurable overflow
      instead of silently clipped text
- [x] `overflow-popover.tsx`: the single shared trigger + controlled `Popover`, `status-overflow` /
      `status-overflow-panel` testIds free from `Popover` itself
- [x] `repos-toggle.tsx`/`terminal-toggle.tsx`/`browser-toggle.tsx`: trailing label and chord-hint
      text wrapped in `.status-label`; `styles.css` gains the one CSS rule
- [x] `status-bar.tsx`: wired `useOverflow` + `collapseFor` per zone, `data-density` on the `<footer>`,
      the `OverflowPopover` mount in the right zone

## 2026-08-28 — Phase 27 Theme D — the five segments, and the opId that names them

Landed on `feature/phase-27-status-segments`, merged locally — no PR link, no GitHub remote on
this checkout. Built alongside sibling worktrees carrying Themes E and G; unblocks two of Theme
G's three items left annotated as blocked (`aria-live` on `op-progress`/`in-progress`).

- [x] `GitOpId`, `GIT_OP_LABEL` and `GIT_OP_RANK` in `use-status.ts`, with `opId` made a
      **required** parameter on `useGitOp`/`useTargetedGitOp` so the compiler enumerates every
      call site: 7 in `use-status.ts` itself, 9 in `use-graph-actions.ts`, 8 in
      `use-repo-actions.ts`, 3 in `sync-controls.tsx`, 2 in `conflict-banner.tsx` (whose
      `LABEL` map is now exported as `INPROGRESS_LABEL` for the mid-operation segment to reuse).
      `mutationKey: ['git-op', opId]` threaded onto the one shared `useMutation`.
- [x] `features/status-bar/active-worktree.tsx`: the sidebar-selected checkout, left zone after
      the toggles; renders the worktree's basename or the repo name, nothing when unselected.
      Click opens the repositories panel and moves DOM focus to it — needed `tabIndex={-1}` added
      to the `<aside>` in `app.tsx`, which had none.
- [x] `features/status-bar/op-progress.tsx`: an indeterminate readout off `useMutationState` over
      the `['git-op']` key, not filtered to the active worktree. `opLabel()` is a pure function
      (highest-ranked verb, `+N` for the rest) so the rollup is testable with no query client.
      Clears silently on failure — the invoking surface already reports it.
- [x] `features/status-bar/in-progress.tsx`: `merge`/`rebase`/`cherry-pick`/`revert` from
      `StatusResult.inProgress`, reusing `INPROGRESS_LABEL` rather than a second map. The bar's
      one sanctioned anti-duplication exception. Collapses the status query's placeholder before
      reading it. Click navigates to Changes.
- [x] `features/status-bar/agent-count.tsx`: live agent sessions off `terminal-store.ts` (never
      `use-agents.ts`'s installed roster). `agentCount()` is a pure predicate copying
      `terminal-session-list.tsx`'s `live` rule rather than extracting it. Click opens the
      terminal, activates the first live agent session, opens the session list only if shut.
- [x] `features/status-bar/test-verdict.tsx`: a worst-of rollup across `tests-store.ts` —
      `testVerdict()` is pure: a suite that ran with failures wins, an all-could-not-run repo
      renders nothing rather than a false clean state, otherwise the suites that ran clean are
      counted. Click navigates to Tests.
- [x] `features/status-bar/checks-verdict.tsx`: the checks rollup for the PR on the checked-out
      branch, reusing `forge-status.tsx`'s `checksStatus`/`StatusPill`. `findPrForBranch()` is a
      pure match against `headBranch`. Gated on `pickForgeRemote` so a repo with no GitHub remote
      never fetches; no match (the common case) renders nothing. Click navigates to Actions.
- [x] `segments.ts` registers all six with priority following actionability rather than render
      position: the two verdicts and mid-operation outrank the toggles, diagnostics and the
      monitor at Theme E's future collapse time; the right zone's render order puts the two new
      verdicts at the outer edge, after the monitor.
- [x] `moon run :typecheck :lint :test` green across all five packages; the existing
      `status-bar.spec.ts`, `footer-monitor.spec.ts`, `browser-pane.spec.ts` and the
      `terminal.spec.ts` maximize regression all still pass unmodified.

## 2026-08-28 — Phase 27 Theme G (partial) — the focus trap, extracted, and the a11y that didn't need D/E

Landed on `feature/phase-27-g-a11y`, merged locally — no PR link, no GitHub remote on this
checkout. Built alongside sibling worktrees carrying Themes D and E, still in flight — three of
Theme G's items name segments or overflow density those themes haven't landed yet (aria-live on
`op-progress`/`in-progress`, `Tooltip` in `compact` density, naming the `…` overflow button) and
stay open in the phase doc, annotated as blocked rather than silently skipped.

- [x] `components/use-focus-trap.ts`: `useFocusTrap(ref, active)` extracted verbatim from
      `popover.tsx`'s inline Tab-wrap effect (`FOCUSABLE` selector included), with no behaviour
      change to `Popover` — `e2e/footer-monitor.spec.ts`'s existing flyout keyboard assertions are
      the regression guard. Phase 23 Theme H's identical claim shrinks to a retrofit note pointing
      here.
- [x] `features/browser/browser-pane.tsx` retrofitted onto the new hook: the pane's own container
      (`tabIndex={-1}`, `role="dialog"`, `aria-label="Browser"`) traps Tab across its two real
      controls (Address, Close — Back/Forward/Reload are natively `disabled` and excluded), and a
      `shown`-keyed effect restores focus to `[data-testid="browser-toggle"]` on close, since the
      toggle lives in a sibling component and cannot share `Popover`'s own `close()`.
- [x] Verified the bar's five existing segments already satisfy Theme G's button/report-only split
      (`DiagnosticsSegment` and `MonitorCluster` were already correct) and its keyboard-order rule
      (no `order-*` anywhere in `status-bar.tsx`; DOM order already matches array order).
- [x] The three toggle buttons (Repos/Terminal/Browser) gained an explicit `aria-label` — their
      accessible name previously included the chord hint's visible text (e.g. "Repos ⌘G"), which
      reads oddly to a screen reader; `title` keeps the chord for sighted hover.
- [x] New Playwright case in `e2e/browser-pane.spec.ts` covering the Tab-wrap in both directions and
      the Escape-triggered focus restore; `e2e/footer-monitor.spec.ts`'s toggle-name assertion
      updated for the new `aria-label`.

## 2026-08-28 — Phase 24 Theme C — mutations in the tree

Merged locally — no PR, no GitHub remote on this checkout. The Folder explorer's file tree gets
its first context menu, inline create/rename, and delete behind a real blast-radius confirm.

- [x] `file-tree.tsx`'s row is now a `<div role="treeitem">` (was a bare `<button>`) so it can carry
      both a right-click handler and a hover-visible ellipsis `IconButton` feeding the same
      `useDialogs().openMenu` — matching `repos-panel.tsx`'s shared-closure pattern rather than a
      new context-menu hook. The row's own accessible name is pinned via `aria-label={entry.name}`,
      because the always-mounted ellipsis button's "Actions for X" label would otherwise fold into
      the row's computed name and break every existing `getByRole('treeitem', {name})` query in the
      suite. The tree container itself grew `h-full` and its own root-level `onContextMenu`, so
      right-clicking the empty area below the last row offers New File/New Folder — a real file
      explorer's background is clickable too.
- [x] New `features/files/use-file-actions.ts`: `startCreate`/`startRename`/`commitEdit`/
      `requestDelete`/`reveal`/`copyRelativePath`, plus the pure `validateEntryName`/`joinRelPath`/
      `parentOf` helpers. Name validation (empty, `/`, `.`/`..`/`.git`, sibling collision) runs
      against the directory's already-loaded listing before any round trip reaches
      `fs-scope-write.ts`'s server-side copy of the same rules.
- [x] New `features/files/fs-scope-key.ts`: `FsScopeInput`/`fsScopeKey` split out of `file-tree.tsx`
      (which re-exports them for existing callers) so `use-file-actions.ts` can depend on the scope
      shape without the two files importing each other.
- [x] `files-store.ts` gains `editing: EditingEntry | null` (`rename` or `create`, one at a time,
      like the dialog host's own menu/confirm/prompt) and `startCreate` force-expands a collapsed
      target directory so the new inline row is visible immediately — the same rule the doc already
      applied to a created file's preview.
- [x] Delete's blast radius is a `confirm-dialog.tsx` `warnings` line, not the commit-shaped
      `blastRadius` field — which had to be pinned `blastRadius: null` explicitly, since `undefined`
      reads to the dialog as "still being counted" and it never stops saying so. A directory's
      count/size comes from a new capped breadth-first walk (`mstudio:fs:dir-stats`,
      `FS_DIR_STATS_WALK_CAP = 10_000`, read-only, `fs-handlers.ts`); the uncommitted count is a
      filter over the same `statusIndex.byPath` Theme F already builds, not a second status fetch.
- [x] Reveal in Finder needed a channel that didn't exist: `mstudio:shell:show-item-in-folder`,
      `FsRepoScope`-scoped and confined through `fs-scope.ts`'s read jail (`confineToRoot`) exactly
      like every other fs read — it never mutates, so it lives beside `listDir`/`readFile` in
      `fs-handlers.ts` rather than in `fs-write-handlers.ts`.
- [x] Vitest: `use-file-actions.test.ts` (validation + path helpers), `files-store.test.ts` (the new
      editing state), `fs-handlers.test.ts` (new — `dirStats` and `showItemInFolder` against a real
      temp directory, mocking only `electron` and `repo-registry`), plus schema coverage for
      `FsDirStatsRequest`/`ShowItemInFolderRequest` in `ipc.test.ts`.
- [x] New `e2e/files-write.spec.ts` (12 Playwright cases): the menu's contents per row kind, root
      vs. row targeting, create/rename/delete end to end, the collision-refuses-before-round-trip
      case, auto-expand on create, Reveal/Copy recording, the hover-ellipsis parity case, and the
      `claude-home` tree's continued silence. Found and fixed along the way: the mock bridge's
      `listDir` returned the *live* `fsDirs` array by reference, so a create/rename/delete's
      in-place mutation left every cached read pointing at the same object identity —
      react-query's structural-sharing equality saw "unchanged data" and never notified the
      subscribed component, so the row silently never left the screen despite the mock's own state
      being correct. Fixed by returning `entries.slice()` on every read. Screenshots at
      `docs/screenshots/phase-24-c/{context-menu,inline-create,delete-confirm}.png`.

## 2026-08-28 — Phase 24 Theme F — status badges on tree rows

The cheapest theme in the phase — and the one place the doc's own suggested reuse
(`build-change-tree.ts`) turned out to be the wrong tool once checked against how
`file-tree.tsx` actually mounts directories.

- [x] `features/files/file-status.ts`: `buildFileStatusIndex(entries)` joins `StatusEntry` by
      path (byte-identical, no normalisation) into `byPath`, and separately walks every changed
      path's literal ancestors into a worst-status-wins `dirRollup` — deliberately **not** built
      from `build-change-tree.ts`'s `DirNode` tree, because that module collapses a single-child
      directory chain into one row for the Changes panel, which would leave an intermediate
      `file-tree.tsx` directory level (mounted individually, lazily) with no rollup entry even
      when its subtree has changes
- [x] `resolveFileStatusIndex(data, isPlaceholderData)` returns `undefined` while status hasn't
      actually answered, so a row never renders "no badge" as a false claim of "clean" — the same
      honesty rule `useAllChangesTotals` already follows in `use-status.ts`
- [x] `file-tree.tsx`'s `TreeRow` renders the existing `StatusMark` glyph (reused, not a second
      colour table) right after the folder/file icon, for both files (`byPath`) and directories
      (`dirRollup`); a gitignored row (`entry.isIgnored`) never gets one — the dimming already
      says "not part of the repo", and no `StatusEntry` would match such a path anyway since
      `getStatus` runs with `--ignored=no`
- [x] Ten new Vitest cases in `file-status.test.ts` (the join, all seven achievable `StatusCode`
      values, a conflicted override, the literal-ancestor rollup vs `build-change-tree.ts`'s
      chain-collapse, worst-of-siblings, and the placeholder-vs-real distinction); a new
      Playwright case in `files-view.spec.ts` covering the collapsed-directory rollup, per-file
      badges and the no-entry-no-badge case, with a screenshot at
      `docs/screenshots/phase-24-f/status-badges.png`

## 2026-08-28 — Phase 28 Themes B+C — `RepoTree` renders from the tree

Landed on `feature/phase-28-section-tree`, merged locally — no PR link, no GitHub remote on this
checkout. Themes B and C were built together in the same branch as Theme A, above.

Theme B gave the indent ladder its fifth rung (`TREE_INDENT` gains `pl-17`, `TreeSection.depth`
widens to `0|1|2|3`) for the depth Remotes' `origin` groups now sit at. Theme C then rewrote
`RepoTree`'s four hand-written `<TreeSection>` blocks into one `renderSection(node, depth)` walk
driven by `SECTION_TREE` — a section the declaration does not contain cannot render, and Worktrees
renders first.

- [x] `TREE_INDENT`/`TreeSection.depth` widened one rung; `RemoteGroup`, its `RefRow`s, and local-
      branch `RefRow`s shift one rung deeper; `WorktreeRow` and Tags stay at their existing depth
- [x] **Bug found and fixed in review**: `pl-17` is not a Tailwind default-scale utility (the scale
      jumps `14 → 16 → 20`), so it silently generated no CSS — depth-4 rows rendered flush left,
      escaping their collapsible container. Fixed with `spacing: { 17: '4.25rem' }` in
      `tailwind.config.ts`, continuing the existing +12px step. Caught by a Playwright screenshot
      against a real `origin` remote group, not by vitest, which never renders real CSS
- [x] Confirmed the deepest row still reads at the panel's true 180px minimum width (dragged the
      real splitter): it truncates exactly like every shallower row already does there, so no
      rung-4-only tightening was needed
- [x] `renderSection`/`SECTION_BODY` walk replaces the four literal blocks; `SECTION_TITLE` widens
      to an exhaustive `Record<SectionKey, string>`; `ForgeSections`' `index` prop now derives from
      `ALL_SECTIONS`' own order instead of the old `worktrees.length` positional guess
- [x] `repos-panel.test.ts` → `.test.tsx` (first RTL-rendered test in this file): rendered heading
      order matches the flattened, visibility-filtered tree, and `Branches` disappears entirely
      once every child section is filtered away

`moon run :typecheck :lint :test` green across all four projects (758 app tests). Visual change —
screenshot at `docs/screenshots/phase-28-sidebar-section-tree/sidebar-after.png`.

## 2026-08-28 — Phase 23 Theme B — useCommandHandlers, one dispatcher for keyboard/menu/palette

The keymap's own doc comment had promised this hook since Phase 9; it was never written, and
`repo.open`/`repo.close`/`view.refresh` shipped as live native menu items that did nothing.

- [x] `use-command-handlers.ts` exports `useCommandHandlers(): CommandRuntime` —
      `Record<CommandId, {run, enabled, disabledReason?}>` — rebuilt every render so it closes over
      current state; the inline handler literal moved out of `app.tsx` verbatim, then extended
- [x] `repo.open`/`repo.close`/`view.refresh` wired — the three ids with a keymap entry *and* a live
      native menu item that had done nothing since Phase 9
- [x] `status.commit` (`Mod+Enter`) focuses-and-submits the commit box through a new
      `commit-box-store.ts`, the one imperative seam into `StatusPanel`'s own local commit state,
      which stays where it was rather than lifting into a store
- [x] Every entry carries `enabled` + `disabledReason`: with no repo open, `sync.*` and `status.*`
      say why instead of disappearing or failing silently
- [x] `use-keybindings.ts` takes the `CommandRuntime` directly rather than a handler map — a
      disabled entry is treated as unbound (falls through to the browser default) — and `app.tsx`
      ends the theme thinner, with `op.abort`/`op.continue` left deliberately unwired for Phase 22
- [x] 7 new Vitest cases in `use-command-handlers.test.ts` covering the no-repo/repo-selected matrix
      and the `sync.*`/`status.commit` disabled-reason wiring

## 2026-08-28 — Phase 24 Theme B — the jail learns to write

The load-bearing theme of the phase: `fs-scope-write.ts` confines a write's *parent* (never its
own target, which a create doesn't have yet) and closes the create/overwrite race by writing
through a descriptor rather than re-resolving the path by name, instead of `fs-scope.ts`'s
symlink-following `confineToRoot`, which is correct for a read and wrong for a write.

- [x] **`confineParent(root, relPath)`** shape-checks the whole path first (absolute, a `C:\` drive
      string, `..` traversal, NUL), then `realpath`s the parent and requires it under the real
      root, returning `{dir, name}` with the final segment left unresolved. Refuses `.`/`..`/empty/
      separator-bearing/`.git` final segments and requires the immediate parent to already exist —
      no `mkdir -p`, since nothing in the UI ever produces a multi-segment new path
- [x] **A symlink at the final segment is always refused** — `isSymlinkTarget()` for
      write/rename/delete, and `O_CREAT | O_EXCL` closes the same case for create by construction
- [x] **`.git` refused at any depth**, not just as a final segment (`hasGitSegment`)
- [x] **The TOCTOU window closes at the descriptor**: `open(..., O_CREAT | O_EXCL | O_WRONLY)` for
      create, `open(..., O_RDWR | O_NOFOLLOW)` for overwrite — stronger than a bare `'r+'`, since
      `O_NOFOLLOW` itself refuses a symlink swapped in after confinement — `fstat` compared against
      the caller's `FsVersion`, write through the same handle. `createDirectory` (no descriptor to
      open through) closes the narrower residual race with `mkdir`'s own `EEXIST` plus an immediate
      `lstat` re-check
- [x] **`fs-write-handlers.ts`** wires all four channels through the jail: overwrite re-sniffs the
      on-disk bytes for a NUL before truncating (the version check alone can't catch a file that was
      always binary), rename refuses a destination collision (fail closed, no silent `mv`-style
      clobber), delete goes through `shell.trashItem()`, and a shared `describeFsError()` maps
      `ENOENT`/`EACCES`/`EEXIST`/etc. to one message table across all four handlers
- [x] **Decided the write-queue question**: fs writes stay outside `write-queue.ts` (that queue
      serialises writers racing on `index.lock`; a plain file write never touches it), leaving the
      watcher's write-echo for Theme G
- [x] 55 new Vitest cases across `fs-scope-write.test.ts` and `ipc/fs-write-handlers.test.ts`,
      including the stale-write refusal riding `{ok:false, code:'stale-write'}` rather than a throw

## 2026-08-28 — Phase 23 Theme A — the registry becomes palette-shaped

Reconciles the 15-id/13-binding split that made the registry unable to feed a palette. One
`COMMANDS` array in `shared/src/keybindings.ts` is now the single source of truth — every
`CommandId` carries a `label` and a `group`, with `chord`/`scope` optional so `op.abort` and
`op.continue` are first-class unbound palette rows instead of vanishing. `COMMAND_IDS`,
`DEFAULT_KEYMAP` and `GLOBAL_CHORDS` all derive from it. Adds `palette.open` (`Mod+k`, global
scope) and `palette.files` (`Mod+p`); `Mod+Shift+p` stays `sync.pull`. Fixes the phantom
`commands.ts` link in `phase-22`'s scope list and the stale `outstanding.md` entry; adds a
keybindings bullet to `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` naming the real registry path.

- [x] `COMMANDS` single-source-of-truth array with explicit `group` field (not derived from the
      `id` prefix — `status.focus` and `status.commit` land in different groups on purpose)
- [x] `palette.open` (`Mod+k`, `scope: 'global'`) and `palette.files` (`Mod+p`) added to the
      registry
- [x] Phantom `commands.ts` links fixed in `phase-22` and `outstanding.md`; `CLAUDE.md` /
      `AGENTS.md` / `GEMINI.md` gain a keybindings bullet naming `shared/src/keybindings.ts`
- [x] `keybindings.test.ts` extended: every `CommandId` has a label/group, no two bindings share a
      chord, `Mod+Shift+p` still resolves to `sync.pull`, `palette.open` escapes the terminal and
      `palette.files` does not
## 2026-08-28 — Phase 27 Theme F — the browser pane the keymap already promised

Cashes the `Mod+b` promise Phase 9's keymap made: `browser.open` → `browser.toggle`, its
"coming soon" dialog handler replaced with a real toggle, and a native View-menu item added
(there was none). `features/browser/browser-pane.tsx` is a chrome stub with no engine —
disabled back/forward/reload, a functional close, and a URL field that accepts text and
navigates nowhere, proven wired end to end by the centred plate substituting the typed value
on Enter rather than silently swallowing it. Mounted `absolute inset-0` over the content row
(the repositories panel and the view/terminal column alike, `relative` added to their shared
parent), so the status bar stays visible *and hit-testable* beneath it — the phase's own
demonstration that Theme A's move made the bar full-width. `Escape` closes the pane without
`stopPropagation`, so it never steals the terminal's global `Ctrl+`` chord. `browserOpen`
joins `ui-store` beside `reposOpen`/`terminalOpen` with no version bump — the existing custom
`merge` already back-fills a key an older payload predates — which also meant fixing
`PersistedUi`'s pre-existing drift (it was missing five keys `partialize` already returned).
A third `BrowserToggle` segment joins the status bar's left zone, its own lowest `priority` of
the three toggles for Theme E's future overflow order. Along the way, extracted a shared
`EmptyState` (`components/empty-state.tsx`) from two near-duplicate ad hoc cards
(`graph-view.tsx`, `file-preview.tsx`'s `FallbackCard`) so the pane's plate is a third call
site rather than a fourth copy.

- [x] `browser.open` → `browser.toggle` in `COMMANDS` (`shared/src/keybindings.ts`), label
      "Toggle Browser", chord `Mod+b` unchanged, scope `app`; the now-false keymap comment
      rewritten. The placeholder handler moved to `use-command-handlers.ts` in Phase 23 Theme
      B, so that is where the rename and the real `toggleBrowser()` call landed, not
      `app.tsx:352`
- [x] `item('browser.toggle')` added to the native View submenu (`menu.ts`), after
      `terminal.toggle`
- [x] `browserOpen` / `toggleBrowser` / `setBrowserOpen` in `ui-store.ts`, defaulting `false`,
      added to `partialize` with no `version` bump and no `migrate` arm — `merge` already
      handles a predating payload
- [x] `PersistedUi`'s drift fixed: the five keys `partialize` already returned
      (`reposOpen`/`terminalOpen`/`terminalMaximized`/`terminalSidebarSide`/`terminalListOpen`)
      plus `browserOpen` added to the type, and `partialize` annotated `(state): PersistedUi`
      so the annotation cannot silently drift again
- [x] `BrowserToggle` segment (left zone, `priority: 5` — lowest of the three toggles, since
      Repos and Terminal both toggle panels that hold work and the browser pane holds nothing
      yet), `GoGlobe` from `react-icons/go` alongside `GoRepo`'s Octicons precedent
- [x] `features/browser/browser-pane.tsx`: `absolute inset-0` over the content row (`relative`
      added to its container), `useReveal`-driven opacity transition at `REVEAL_MS`, a chrome
      stub with disabled back/forward/reload and a working close, and a URL field whose Enter
      is inert but substitutes the typed value into the centred plate
  - `Escape` closes it via a local `keydown` listener with no `stopPropagation`, matching the
    `popover.tsx`/`tooltip.tsx` precedent rather than claiming a keymap entry
- [x] `components/empty-state.tsx` extracted; `graph-view.tsx`'s local `EmptyState` and
      `file-preview.tsx`'s `FallbackCard` both rebuilt on it
- [x] `use-command-handlers.test.ts` updated for the rename; new `ui-store.test.ts` cases for
      persistence and the pre-existing-payload merge fallback; new
      `e2e/browser-pane.spec.ts` — the toggle covering the repositories panel with the bar
      staying hit-testable beneath it, `Escape` closing it and the state surviving a reload,
      and the URL field's inert-but-wired Enter behaviour

## 2026-08-28 — Phase 27 Themes A–C — the status bar spans the app, and becomes a zone grid

`<StatusBar />` (formerly `FooterBar`) moves out of the content column into `CONTENT_BOX`, so the
bar spans the full content area — repositories panel included — for the first time since Phase 9.
`stackHeight` survives the move (the column grows 24px, the row shrinks 24px, they cancel), the two
now-false geometry comments are rewritten, and `footer-monitor.spec.ts:222`'s stale branch-name
assertion (dead since `1cafcae`) is deleted. The file gets its own home,
`features/status-bar/`, with `chordFor`/`displayChord` as real exports in `chord-hint.ts` and no
compat shim left behind. The bar itself becomes a static `{id, zone, priority, El}` composition —
`STATUS_SEGMENTS` — rendered through a three-column `grid-cols-[1fr_auto_1fr]` rather than
`ml-auto`/`mr-auto` flex siblings, with segments mapped directly (no wrapping element) so a `null`
segment leaves no `gap-3` hole; `repos-toggle`/`terminal-toggle` become standalone components, and
`FooterCluster` is retired now that the right zone's `justify-self-end` replaces its role.

- [x] **A** — the move, `stackHeight` proof, rewritten comments, `data-testid="status-bar"`, the
      `terminal.spec.ts` maximize-coverage assertion, and the T-junction border check
- [x] **B** — `features/status-bar/status-bar.tsx`, `chord-hint.ts` with a `CommandId`-widened
      `chordFor`, `footer-bar.tsx` deleted outright (no re-export shim)
- [x] **C** — `segments.ts` (`STATUS_SEGMENTS`, gapped priorities), the three-zone grid, and
      `segments.test.ts` + `e2e/status-bar.spec.ts` proving the empty-zone-leaves-no-gap rule

## 2026-08-28 — Phase 24 Theme A — the writable-filesystem contract

Widens the read-only Phase 16 fs contract with the write half everything else in the phase reads
off: four `mstudio:fs:*` write channels, an `FsWriteScope` that excludes `claude-home` so a write into
`~/.claude` fails zod parsing at the boundary, and an `FsVersion` token on file reads so a save can
prove the file has not moved underneath it. Shared contract + preload wiring only — no jail, no
main-process handlers, no UI (Themes B and C).

- [x] **`FsWriteScopeSchema`** in `shared/src/fs.ts` — a `z.literal('repo')`, narrower than the read
      `FsScopeSchema`, so `claude-home` cannot be expressed in a write request at all
- [x] **`FsVersionSchema`** (`{mtimeMs, size}`) and `FS_WRITE_CAP_BYTES` (same ceiling as the read
      cap, deliberately) added to `shared/src/fs.ts`; the module's header comment rewritten from
      asserting no write channel exists to stating what the write channels are and what still holds
- [x] **Four channels** — `fsWriteFile`, `fsCreate`, `fsRename`, `fsDelete` — with request schemas in
      `schemas.ts` built on `FsWriteScopeSchema`, never `FsRepoScope`'s scope union; `fsRename` takes
      independent `fromRelPath`/`toRelPath` (a general move, not name-only) and `fsCreate` takes a
      `kind: 'file' | 'directory'` so Theme C's two menu entries need no second channel
- [x] **A stale write rides `GitOpResult`'s ordinary error arm** with a new optional
      `code: 'stale-write'` discriminant (`domain/result.ts`) rather than growing `ConflictOp` a
      fs-shaped member; `failure()` takes the code as an optional third argument
- [x] **`FsReadFileResponse`'s `text` arm now carries `FsVersion`**, and `fs-handlers.ts`'s read
      handler fills it from the `fstat` it already has
- [x] **Preload bridge** (`packages/desktop/src/preload/index.ts`) gains the four `fs.*` write
      entries; `bridge.ts`'s type and doc comment rewritten to match
- [x] Vitest: every write request accepts repo scope and refuses `claude-home`; empty and
      NUL-bearing `relPath`s rejected; `fsCreate`'s kind is exactly `file | directory`; `fsRename`
      carries `fromRelPath`/`toRelPath` and no bare `relPath`; a stale write parses as
      `{ok:false, code:'stale-write'}` and does **not** fit `ConflictOp`

## 2026-08-28 — Phase 22 · Theme A — stash in the engine

Landed on `feature/phase-22-stash-engine`, merged locally — no PR link, no GitHub remote on this
checkout. `git stash` appears nowhere else in the codebase yet — Themes B–E (sidebar, graph rows,
inspector diff, Changes view) read off this contract next.

- [x] `stash-parser.ts`: `STASH_FORMAT` (`%gd%x00%H%x00%P%x00%gs%x00%at%x00%an%x00%ae`),
      `parseStashRecord` and `parseStashList`, NUL-delimited like `log-parser.ts`. The NUL-boundary
      chunking walk both parsers need was pulled out into a shared `chunkNulRecords()` (self-review
      finding) rather than living as two independent copies of the same chunk-boundary-safety fix.
- [x] `StashEntrySchema` in `shared/src/domain/stash.ts` — `{selector, sha, parents, message,
      authoredAt, author}`, with `parents` distinguishing a two-parent stash from a three-parent
      (`-u`) one.
- [x] `stash.ts` in git-engine: `listStashes`, `stashPush` (message/keepIndex/includeUntracked/
      paths), `stashApply`/`stashPop` (returning the `conflict('stash-apply', …)` arm on a real
      conflict — see the self-review fix below), `stashDrop` (capturing the recovered sha for a
      future undo) and `stashBranch`, all through the write queue.
- [x] `'stash-apply'` joins `ConflictOpSchema`. `AbortRequest`/`ContinueRequest` were switched from
      `ConflictOpSchema` to the narrower `InProgressOpSchema` in the same change — abort/continue
      operate on sequencer state a stash conflict never has, and the wider enum would otherwise
      have let one through.
- [x] The `mstudio:stash:*` IPC contract end to end: `CHANNELS`, `OpBase`-shaped request schemas,
      the `stash` group on `MidniteStudioBridge`, preload wiring, and handlers in
      `status-handlers.ts`. `opStashDrop` carries its own `StashDropResult` — `{ok:true,
      recoveredSha?}` — rather than reusing the plain `GitOpResult` every other op returns, so
      Theme H's undo has a typed field to read from day one.
- [x] `stash.integration.test.ts` and `stash-parser.test.ts` against a scratch repo and hand-built
      fixtures.
- [x] **Self-review fix**: `applyOrPop` was comparing `conflictedPaths()` only *after* the op, so a
      stale/invalid selector on a working tree that already had unrelated unmerged paths (from an
      earlier, unrelated merge) surfaced as a phantom `stash-apply` conflict on files the pop never
      touched. Now diffs `conflictedPaths()` before/after and only reports newly introduced paths,
      with a regression test.
## 2026-08-28 — Phase 28 · Theme A — the section tree becomes data

Landed on `feature/phase-28-section-tree`, merged locally — no PR link, no GitHub remote on this
checkout.

`view-sections.ts` exported `ALL_SECTIONS` under a comment claiming it was "every section, in the
order the tree renders them" — untrue since Phase 17, since `RepoTree` renders four literal
`<TreeSection>` blocks that happen to agree with it by coincidence. The order is now data:
`SECTION_TREE` is the single declaration (`worktrees`, `branches → [local, remotes]`, `tags`,
`stashes` reserved for Phase 22, `forge → [actions, reviews, issues, tests]`), `ALL_SECTIONS` is a
pre-order flatten of it rather than hand-written, and `parentOf`/`childrenOf` are lookup `Map`s
built once from the tree at module load.

- [x] `SectionKey` widened with `branches`, `forge`, `stashes`; `RefSectionKey` stays the four ref
      sections, unchanged, since a parent has no refs for `sectionMenu` to build from
- [x] `expandFilter` resolves a filter's named sections symmetrically — naming a parent admits its
      children, and naming a child admits its ancestors — so every existing `VIEW_FILTERS` entry
      keeps meaning exactly what it means today with zero edits, while still letting `Forge` answer
      "admitted" once Theme F nests a heading over Actions/Reviews/Issues/Tests
- [x] `isSectionVisible` (the pure core behind `useViewSections().visible`) recurses through
      `childrenOf` — a parent is visible iff the filter admits it and at least one child is visible
      — generically, not hard-coded to one level of nesting
- [x] `view-sections.test.ts` grew from 15 to 25 tests, all pre-existing assertions untouched; the
      new ones cover the flatten/round-trip/parent-visibility rules the doc's Theme A bullet lists
- [x] `sidebar-page.tsx`'s `SECTION_LABELS` (Theme G's record) got three placeholder entries so the
      widened `SectionKey` didn't leave `moon run :typecheck` red between Theme A landing and Theme G
      giving them real behaviour

`moon run :typecheck :lint :test` green across all five projects (748 app tests, 463 desktop, 392
git-engine) at the time Theme A landed. No visual change; no screenshots.

## 2026-08-27 — Phase 21 follow-up — the agent marks are the real marks now

Two of the four roster marks were hand-drawn originals, chosen over the brands' own artwork on a
trademark-caution argument that the sibling Midnite app had already answered: it ships both logos
from openly-licensed icon sets, and has done since its own agent picker existed. Antigravity's
stand-in read as *a* rocket rather than as *that product*, and Codex's `</>` said "some coding
agent" where every other row says which one.

- [x] **`antigravity-icon.tsx` carries the real mark** — the artwork the sibling app serves at
      `public/agent-logos/antigravity.svg`, from [lobe-icons](https://github.com/lobehub/lobe-icons)
      (MIT). It is not a silhouette: eleven heavily blurred colour fields clipped to the peak
      outline, which is where the Google-gradient wash comes from. So the component is two data
      tables (`BLOBS`, `BLURS`) mapped into `<g>`/`<filter>` rather than forty lines of near-identical
      JSX — the numbers *are* the asset, and a re-import from upstream stays a diff of digits.
      `BLOBS[2]` and `BLOBS[3]` are the same path behind the same blur; that duplication is upstream
      and it is load-bearing, because the blur leaves soft edges and compositing the green twice is
      what gives that lobe its density
- [x] **Mask and filter ids scoped with `useId`.** Ids in an inline SVG are document-global, and the
      session list draws one mark per row — hard-coded ids would have every copy resolving its
      `url(#…)` against the first one's `<defs>`
- [x] **`codex-icon.tsx` carries OpenAI's knot**, the [simple-icons](https://github.com/simple-icons/simple-icons)
      path (CC0, public domain) the sibling app uses. The old comment claimed the knot turns to mud
      at 14px; rendered at 14/20/32/64 against both themes it plainly does not — the ring reads at
      every size. `react-icons` 5.x still ships no `SiOpenai`, so the path lives in the repo
- [x] **One API difference, documented where it bites.** Antigravity's mark carries its own colours
      and so cannot take the agent's accent — a multi-colour logo has no single colour to override.
      `style` is still accepted and applied so the component stays interchangeable with the tintable
      marks; it simply has no visible effect on the fills

## 2026-08-27 — Phase 21 · Theme E — a terminal that knows what is running in it

Landed on `feature/phase-21-live-agent`, merged locally — no PR link, no GitHub remote on this
checkout. **Phase 21 is now complete.**

A session's `kind` and `agentId` were decided by which `+` menu item opened it and then frozen.
Type `codex` into a plain shell and the sidebar row went on claiming to be a bare terminal; quit
Claude Code inside an agent session and the row went on wearing Claude's mark over a shell prompt.
Both facts were sitting in the pty's own process tree and nobody was asking.

- [x] **`agent-process.ts`** — the read. One `ps -axo pid=,ppid=,args=` per probe (the `=`
      suffixes suppress the headers, which is what stops a localised header being parsed as data),
      a pure parser, a pure descendant walk carrying depth, and an argv matcher. Everything but the
      `execFile` wrapper is pure, so the interesting cases are asserted against captured output.
- [x] **The matcher has exactly three rules**, and the restraint is the design. argv[0]'s basename
      (a bare `claude` or `agy` — both are compiled binaries here); a runtime's script argument
      (`node /opt/homebrew/bin/codex`, which is what a `#!/usr/bin/env node` script looks like in
      the table, and is what `codex` actually is on this machine); and a whole path *segment* of
      that argument, for a package layout whose entry file is named `index.js`. It never scans
      arguments — `git commit -m 'try codex'` and `vim codex.md` are a plain shell doing plain
      things, and a scan-everything rule would have put Codex's mark on both. Segment matching is
      exact, so `…/@anthropic-ai/claude-code/cli.js` goes **unmatched** rather than guessed at: a
      documented limit, and the phase's stated posture that a wrong mark is worse than no mark.
- [x] **Deepest match wins; a tie is `null`.** An agent launched from inside another is the one the
      user is talking to, and the outer one is a launcher by then. Two *different* agents at the
      same depth is genuinely ambiguous — nothing in the process table says which owns the screen.
      The same agent twice at one depth is not a tie at all, just an agent that forked a worker.
- [x] **`agent-watcher.ts`** — the decision, split out from the read. Event-driven rather than a
      poll: a pty's output resets its own quiet timer and the probe runs after 750ms of silence, so
      an agent booting costs one probe rather than one per chunk. It speaks only on a *change*, so
      an idle terminal produces no traffic. One `ps` is shared across ptys that go quiet together,
      the in-flight promise cached rather than just the result — two ptys in the same tick would
      otherwise both start a read before either finished.
- [x] **Nothing is probed at pty-open, on purpose.** At that instant the tree is a login shell and
      nothing else: the agent's command is written only once the shell prints a prompt. A probe
      there would confidently answer "nothing running" for a session about to run Claude Code. The
      declared `agentId` seeds the last-known value instead.
- [x] **A `null` may only take away a mark some probe has actually *seen*.** This began as a
      five-second grace window — the seed alone does not stop the flicker, since a shell that prints
      nothing for 750ms while a cold binary starts leaves the first probe reporting `null` for a
      session one moment away from running the agent. Self-review found the window was worse than
      no window: `npm i -g` installs Claude Code as
      `node …/@anthropic-ai/claude-code/cli.js`, which the matcher deliberately does not match, so
      on such a machine the seed is *never* observed and the window would eventually strip Claude's
      mark off a live Claude Code session. Made permanent instead, which is also what the phase doc
      already said — the stored `agentId` is "the fallback and the persisted truth". The price,
      recorded rather than hidden: a session opened for an agent that never started keeps its mark
      too, over a `command not found` the user can read on the screen beside it. A *different*
      agent is still reported at once; the guard only stops a mark being taken away, never
      corrected.
- [x] **The watcher is injected into `pty-service`, not imported by it.** `terminal-service`
      already imports `pty-service` for the scrollback, so reaching for the roster from inside it
      would close a cycle. Every seam — `ps`, the roster, `setTimeout`, the clock — arrives from
      outside, which is also what lets the cadence be asserted against a hand-driven timer wheel
      instead of a real 750ms wait.
- [x] **`liveAgentId: Record<string, string | null>`** in the terminal store, read through one
      exported helper. A deliberate tri-state: key absent means *never probed* and falls back to
      the stored `agentId`; `null` means *probed, nothing running*; a string wins outright.
      Collapsing absent into `null` would flash a terminal glyph over every agent row at startup.
      Cleared to *absent* rather than `null` on `pty:exit` — a revive re-runs the session's agent,
      so an asserted `null` would sit over it until the next probe.
- [x] **Icons only.** `sessionLabel` already resolves four ways and Phase 19's notes record how
      subtle that ordering became; a fifth input wants its own look. `SessionRow` therefore carries
      two agents — `agent` for the label (what it was opened for) and `runningAgent` for the mark.
      The header's leading glyph follows the same live value, so with Theme D's path beside it the
      left of that strip names the current repository and the current agent.
- [x] **Reads process state and acts on nothing.** No kill, no restart, no auto-spawn. A probe that
      cannot read the table says nothing rather than `null`, so a machine without a usable `ps`
      loses the icon that follows the shell and nothing else.
- [x] **58 new tests** — 41 for the matcher against eleven captured `ps` fixtures under
      `__fixtures__/`, 17 for the cadence against a fake clock — plus six e2e specs, seven store
      cases and a before/after screenshot pair. Self-review found two real matcher bugs, both now
      regression-tested: rule 3 walked path segments left to right, so
      `node ~/codex/node_modules/claude/bin/cli.js` reported Codex (a checkout named after one
      agent holding another's script) — it now walks deepest-first, since the segments nearest the
      entry file say what is *running*; and "the first token that is not a flag" found the path
      belonging to `--require`/`-r`/`--import`/`--env-file` rather than the script, which is the
      never-scan-arguments false positive sneaking back in through script detection. Also asserted:
      `ROWS_TTL_MS < QUIET_MS`, the unwritten invariant the shared snapshot's correctness rests
      on. The e2e specs drive a mock-bridge hook rather than
      a fake `ps`: the matcher is proven in main, and what only a browser can assert is that an
      event lands on one session, that a `null` takes a mark away, and that the label never moves.

Still open for a human, and unavoidably so: start and quit `codex` and `agy` inside a real shell
session and watch the sidebar row's icon swap both ways. A fixture proves the matcher; only a real
process tree proves the wiring.
## 2026-08-27 — Phase 20 · follow-up — the Playwright suite is green again

Landed on `feature/reviews-e2e-repair`, merged locally — no PR link, no GitHub remote on this
checkout.

Seventeen e2e specs were red on `main` against a product that was working. `app:e2e` sits outside
the `moon run :test` gate deliberately (it needs a chromium download), so three deliberate product
decisions moved out from under the specs and nothing re-read them.

- [x] **A PR opens on Overview, not on Files.** `PrDetail` says why in its own comment — a PR read
      for the first time answers "what is this?" before "what changed?". Thirteen specs asserted
      the old default *implicitly*, by looking for diff text the moment the detail region
      appeared, so the failure surfaced as thirteen unrelated-looking missing-element errors
      rather than as one wrong default. `openPull` and `openFiles` now click through to Files.
- [x] **The default is guarded by one test instead of thirteen.** A new spec asserts Overview is
      selected on arrival and carries the description, so the next flip of that `useState` fails a
      test that names the decision. The header test gives up its description assertion to it —
      the header genuinely does not carry the description any more.
- [x] **The three review scopes arrive folded** (`a62c23c`: "arriving at either surface costs
      nothing"), so the Reviews view lists nothing until a group is opened and the shots spec's
      "the view selects it on arrival" had become unreachable. It opens All Pull Requests first,
      scoped through the `reviews-groups` testid — the repositories sidebar carries the same three
      headings and is on screen too, which is what that testid was added for. Auto-select still
      does the rest.
- [x] **`repos-workbench.spec.ts`'s folded-row geometry re-anchored.** It asserted the change-count
      pill sits past the midpoint of the *row*; it was failing at x=192 against 211.5 for a layout
      that is still exactly right. The row was only ever a proxy for the name button that
      `ml-auto` pins the pill to, and it stopped being a good one once the row grew a trailing
      cluster (skill, git-actions, install/build/test/launch) to the right of the sync control.
      Measured against the button, the pill's right edge (210.66) *is* the button's trailing edge
      (96 + 114.66) — exact, not approximate.
- [x] **Four screenshots regenerated**, the visible half of the same drift: the committed images
      were of a Reviews view from before the scopes, the Overview tab and the footer's Repos
      button existed. Only those four were committed — a full `app:e2e` run rewrites roughly forty
      PNGs across every phase, but that churn is *encoder noise, not content*: two identical runs
      of the same spec produce files differing by ten or twenty bytes. Anything a shots run leaves
      dirty outside the slice being worked on should be discarded, not committed.

Suite: **285 passed, 0 failed** (was 267 passed, 17 failed). `moon run :typecheck :lint :test`
green. No product code changed — each failure was investigated first, and all three causes were
the specs encoding a superseded decision rather than a regression.

*Noted while landing: nothing runs `app:e2e` automatically, which is how seventeen specs stayed
red across several merges. Worth a gate of its own — logged in `outstanding.md`.*

## 2026-08-27 — Phase 21 · Theme D — a terminal that knows where it is

Landed on `feature/phase-21-live-cwd`, merged locally — no PR link, no GitHub remote on this
checkout.

A session's `cwd` was captured once at `openSession` and never revisited, so `cd` into a sibling
worktree left the header naming the directory you started in. The shell already announces every
`cd` and nothing was listening.

- [x] **`parseOsc7`**, pure and tested (13 cases). The host segment is the part that matters and
      the part that is easy to skip: inside `ssh` a remote shell emits OSC 7 for a path on the
      *remote* machine, and a parser ignoring the host would hand the header a local repository the
      terminal is not in. Empty / `localhost` / this machine only — and the machine match is
      full-string in one direction or the other, never label-to-label, which would accept
      `mac.attacker.example` as `mac.local`. A `..` segment is refused rather than resolved, since
      `resolveRepoForPath` matches on string prefixes and `…/midnite-git/../other` would label the
      header with the repository the shell has just left
- [x] **`bridge.hostname`**, beside `homeDir` — the finding that mattered most, and it disabled the
      whole theme. The parser was first wired to `window.location.hostname`, which is the *page's*
      host: `localhost` under the dev server, empty under `file://` in the packaged build, never
      the machine. The canonical emitters all put the real hostname in the payload
      (`printf '\e]7;file://%s%s\a' "$HOST" "$PWD"`, macOS's own `update_terminal_cwd`, VTE's
      `__vte_osc7`), so every one of them was being rejected and the header never moved on a
      correctly configured machine. The e2e suite missed it because the mock emitted
      `file://localhost…`, one of the two spellings that happened to survive
- [x] **`liveCwd` in the terminal store**, runtime-only and never persisted — a path the shell
      wandered into is not a path the user chose to open a session at. In the `dropKey` tuple, and
      **also cleared on `pty:exit`**: a revive respawns at `session.cwd`, so a value left over from
      the dead process would name a directory the new shell is not in
- [x] **Debounced in the handler**, with the timer cleared in the same cleanup that disposes the
      handler — a prompt that re-announces its directory on every Enter collapses to one write
- [x] **The header reads `liveCwd[id] ?? session.cwd`.** That fallback is the degradation path:
      macOS `zsh` emits nothing by default, and such a session reads exactly as it did before this
      existed. The session keeps its stored `repoId` throughout — an unrecognised directory is not
      evidence that the session changed repositories
- [x] **e2e drives a real escape sequence** through a new `__mstudioPtyWrite` hook rather than poking
      the store, because the thing that can silently fail is the xterm registration itself. The
      hook reports whether the pty existed, so a spec whose pty numbering shifts fails instead of
      passing on negative assertions about a sequence that was never delivered. `terminal.save` is
      now recorded in the mock too, so "nothing is persisted" is asserted against what the app
      actually tried to save rather than restating a pty-create count

Still open on the phase: **E** (the process probe). Also noted: the `zsh` hook that makes any of
this fire — `precmd() { printf '\e]7;file://%s%s\a' "$HOST" "$PWD" }` — belongs on the
Settings ▸ Terminal page Theme C created, and is deliberately not in this slice.

## 2026-08-27 — Phase 21 · Themes A + B + C — a plural agent roster, and a `+` menu that says what it starts

Landed on `feature/phase-21-roster-plural`, squash-merged locally — no PR link, no GitHub remote on
this checkout. Phase 15 built the agent machinery around a roster with exactly one entry in it, and
the renderer never held up its half of the *"adding one is an edit, not a release"* bargain. These
three themes are the renderer finally keeping it.

- [x] **The roster becomes plural.** `AgentDefinitionSchema` gains `icon` (a key into the renderer's
      registry, defaulting to the agent's `id`) and `install` (the one-line hint a disabled menu row
      shows instead of nothing), and `BUILTIN_AGENTS` grows from one entry to four real terminal
      agents: Claude Code (`claude`), Antigravity (`agy` — the CLI, **not** the `antigravity-ide`
      shim, which opens the IDE), Codex (`codex`) and OpenClaude (`openclaude`)
- [x] **Whether a command exists on this machine is a SEPARATE type**, `AgentStatus`, keyed by id
      and travelling beside the roster on `agent.list()`. Folding it onto `AgentDefinition` would
      have meant `mergeAgents` validating a runtime fact and `agents.json` gaining two fields nobody
      should ever write — the definition is config a user hand-edits, the status is a probe result
      with a lifetime measured in seconds
- [x] **`agentIdMatchesKind` guarded one id when it was written and now guards four**, so both its
      invariants are re-asserted as a table over the whole roster. "True for all agents" and "true
      for Claude" used to be the same sentence; a fifth entry can no longer be added half-wired
- [x] **`login-shell.ts` extracted** from `claude-cli.ts` — `runInShell`, `loginShell` and
      `parseWhichOutput`, previously owned outright by the Claude probe and now shared with the
      roster's. The `-lic` trick is the load-bearing part and it now has one home
- [x] **`agent-probe.ts`: the install probe, and its trap.** `claude` and `agy` both live in
      `~/.local/bin`, which reaches the environment only through an interactive rc file — so an app
      opened from Finder inherits launchd's bare PATH and a probe resolving against **Electron's**
      environment would disable two agents that are sitting right there. The whole roster resolves
      in ONE `-lic` shell, each `command -v` wrapped in per-agent frame markers: without them
      `parseWhichOutput`'s "last path line wins" rule hands an rc-file banner's path to whichever
      agent parsed last, and every agent resolves to the same wrong binary. Cached on a 30s TTL, so
      `npm i -g` in the terminal next door un-greys its menu item without an app relaunch
- [x] **A probe that cannot answer OMITS the agent** rather than reporting `installed: false`, and
      the renderer reads absent as "assume it works". A slow rc file, a broken profile or a shell
      killed mid-batch costs the user an explanation, never a working agent — the same fail-soft
      posture `claude-cli.ts` already took
- [x] **Three new marks beside `claude-icon.tsx`**, all hand-drawn originals with their provenance
      in a doc comment. Antigravity is a Google trademark; OpenClaude publishes a **wordmark only**;
      and OpenAI's hexagonal knot turns to mud at the 14px the session list draws at — which is the
      failure Phase 19's spinner rewrite already paid for once. Codex is a `</>` instead:
      unmistakably the coding agent, legible at a third of its design size, and nobody's logo
- [x] **`AGENT_ICONS` + `resolveAgentIcon`** — the one place an `icon` key becomes a mark, plus a
      curated allow-list of `react-icons/si` names so a user-added agent can ask for
      `SiGooglegemini` without shipping an SVG. An allow-list rather than a dynamic lookup because
      resolving an arbitrary name would mean importing the whole set to resolve *against*, and
      CLAUDE.md forbids the root barrel for exactly that reason. An unrecognised key falls back to
      lucide's `Terminal`: a typo in a hand-edited config should cost a glyph, not a row
- [x] **`SessionIcon` resolves through the registry** instead of hard-coding `<ClaudeIcon>` for
      *any* agent id — invisible while the roster had one entry, and about to put Claude's face on
      Codex
- [x] **The `+` menu goes flat and iconned**: New Terminal, a separator, then Claude Code /
      Antigravity / Codex / OpenClaude. The `New Agent — ` prefix existed to disambiguate one entry
      from a heading; with four named agents the label *is* the disambiguation. `MenuEntryBase`
      gains `iconStyle` so an accent — roster data, a colour Tailwind has never seen — can reach the
      row inline; a **disabled** row drops it, because a saturated brand colour under 40% opacity
      reads as selected rather than unavailable
- [x] **`buildNewSessionMenu` is pure and separate from the panel**, because the interesting part of
      this menu is not how it is drawn but which rows are dead and why. Four cases, unit-tested:
      everything installed, one missing (OpenClaude is the live example — the other three are on the
      PATH of the machine this was written on), none installed, and no worktree selected, where the
      worktree reason wins over every install hint
- [x] **Found in passing, and fixed:** Phase 19 said in words that the repo name should shrink
      before the session name — *"the part that actually tells two Claude sessions apart"* — and
      wrote the opposite in CSS. The repo span was `shrink` (basis auto, content-sized until
      something overflows), the name span `flex-1` (basis **zero**, leftovers only), so at the
      list's default 176px the repo name rendered in full and the session name collapsed to one
      letter and an ellipsis. With four agents in the roster that is the one half that cannot be
      guessed
- [x] **Three e2e specs had been red on `main`** since Phase 19 split the row in two: each matched
      `span.truncate`, which silently began matching twice per row, so they asserted on whichever
      span came first. `data-session-name` gives them a hook on the half they were always about.
      All fourteen pass, plus four new ones — the flat menu naming four agents, the uninstalled one
      disabled with its hint, an agent row carrying its own accent, and two agents from one roster
      getting two different marks
- [x] Screenshots: `docs/screenshots/phase-21-new-menu.png`, `phase-21-session-list.png` and
      `phase-21-session-list-dark.png` — Theme B's "eyeball each mark at 14px, in both themes"

*Deliberately not here:* per-agent activity detection (`activity-detect.ts` stays keyed to Claude
Code's own chrome, so the three new agents show the idle caret), a writable Settings ▸ Agents page,
and launcher-style entries. All three are recorded in the phase doc's *Not in this phase*.

*Still open on Phase 21:* Themes D and E (OSC 7 live cwd, and the process probe) — F landed in
parallel and this branch rebased onto it, so the `+` menu's four agents now hang off F's rebuilt
header. Plus the three human passes: a real `cd` between worktrees, starting and quitting an agent
by hand, and the packaged `.app` launched from Finder, which is the one check that catches the probe
resolving PATH from Electron's environment instead of the shell's.

## 2026-08-27 — Phase 21 · Theme F — the terminal header, rebuilt

Landed on `feature/phase-21-terminal-header`, merged locally — no PR link, no GitHub remote on this
checkout. The first of Phase 21's six themes to land, and the one independent of the roster work
running in parallel on A/B/C.

- [x] **The word "Terminal" is gone.** The strip read `Terminal  /Users/you/Dev/midnite-git/…` — a
      label for the pane you are already looking at, then an un-collapsed path. It now leads with a
      glyph in the width the word cost, then the status circle, then where the terminal actually is
- [x] **`StateDot` lifted to `components/state-dot.tsx`.** The session list and the header draw the
      same dot for the same session; the pulse is a keyframe plus two inline CSS variables, which
      is exactly the pair that drifts once it exists twice. The header's dot reports the ACTIVE
      session and reads idle when nothing is open — there is no process to be alive
- [x] **`collapseHome`**, with the boundary check that is the whole reason it is a helper: a plain
      prefix match rewrites `/Users/bilolwabonaX/Dev` as `~X/Dev`, silently claiming a different
      user's home as yours, and the result reads plausibly enough to go unnoticed
- [x] **`resolveRepoForPath`** — Theme D's deliverable, brought forward because F's repo-segment
      emphasis needs the split point it returns. Longest-prefix, not first-wins: a linked worktree
      lives *inside* its repository, so both roots prefix the same path and the repository is the
      wrong answer. Separator-aware, so `/Dev/midnite-git-old` is not inside `/Dev/midnite-git`.
      D feeds it `liveCwd` instead of the stored cwd; the helper itself is unchanged by that
- [x] **The path is two spans** — dimmed ancestors, then the checkout you navigate by and
      everything under it at full weight — and that same split is how it truncates from the LEFT.
      The ancestor span is the flex child that shrinks (`min-w-0 truncate`) while the checkout span
      refuses to (`shrink-0`), which puts the ellipsis at the front with no bidi tricks and no
      measurement: `…/.worktrees/` + **`theme-f/packages/app`** rather than `/tmp/midnite-git/.wo…`
- [x] **`homeDir` on the preload bridge**, a plain value beside the other preload constants rather
      than a channel: it never changes for the life of the process, and the header needs it during
      its first render. An async fetch would paint the raw path and then rewrite it. It has to
      cross at all because the renderer may not import `node:os`/`node:path`
- [x] **`data-terminal-header` hit-test still green** across the strip's full width — the one thing
      that must stay true of this row, and an assertion that predates the phase
- [x] **Three stale e2e locators repaired**, incidentally. They had been failing on `main` since
      Phase 19 split the session row's label into a repo span and a session span: they looked for
      the old single `Claude · midnite-git` string, and for the dim state on a flat list of every
      `span.truncate` — where the repo span is muted at *both* densities and so says nothing about
      whether the session is live

Screenshots: `docs/screenshots/phase-21-terminal-header{,-narrow,-before,-before-narrow}.png` —
the strip alone at two widths, clipped, because a full-window shot renders it 20px tall and the
two-tone path unreadable.

Still open on the phase: A/B/C in flight elsewhere, D (OSC 7 live cwd — its resolver now exists)
and E (the process probe).

## 2026-08-27 — Phase 20 · Themes F + G — review write actions, and the consent switch in front of them

Landed on `feature/phase-20-review-writes`, squash-merged locally — no PR link, no GitHub remote on
this checkout. The phase's one deliberate reversal of the Phase 17/19 read-only-forge rule, and the
last of its seven themes.

- [x] **Six writes in `gh-write.ts`**, beside Theme E's three: approve/request-changes/comment,
      merge, reviewer re-request, draft→ready and run re-run. All six are plain `gh` subcommands
      rather than `gh api` — Theme E reaches for the API because threads have no CLI verb, and
      these have one. Command construction is split from the spawn, so each is a pure
      `*Command(forge, …)` returning a string and the tests assert the exact command line — flags,
      ordering, quoting — with no subprocess, network or repository. The failure modes worth
      catching are all textual: a verb that becomes a value, a body that breaks out of its quoting,
      a `--failed` nobody asked for, a method flag omitted so `gh` drops into an interactive prompt
      and hangs on the timeout
- [x] **`gh-shell.ts` extracted** — the spawn, quoting, both host flags, the availability probe and
      the failure summary, previously in `gh-cli.ts` and imported from there by the write module.
      Now a third module imported by `gh-cli`, `gh-write` and `gh-graphql` alike: two probe caches
      would let the read path and the write path disagree about whether `gh` holds a credential,
      and `gh-cli.ts`'s "strictly reads" comment is now true of its dependencies as well as its
      calls
- [x] **Contract**: six channels appended to the write block Theme E opened, so the whole write
      surface is auditable in one screen and the read-only comment above it says nine rather than
      going stale. Three rules encoded in the payloads rather than left to the UI — a merge method
      never defaults, a reviewer must look like a GitHub login, and `APPROVE` is the only bodiless
      verb. `ForgePullDetail` grows `commitCount`, a five-commit sample and `reviewRequests`, all
      three riding the `gh pr view` the detail header already makes
- [x] **The blast radius comes from GitHub, not `rev-list --count`** — a departure from the theme's
      own bullet. A PR's head ref usually is not in this checkout at all, and `rev-list` against a
      missing ref reads as zero, which is the one number a confirm dialog must never be wrong about
- [x] **Action bar under the PR header**, outside the tabpanel because these actions apply to the
      pull request rather than to one view of it — inside Conversation, GitHub's own placement,
      Merge would be hidden behind a tab. One composer for all three verbs, the verb restated on
      Submit. Merge has its own dialog rather than the shared `ConfirmDialog`: that one asks a
      single question whose answer is one click, and a merge asks two, the second ("merge, squash
      or rebase?") changing what the first one means. Nothing preselected, Merge disabled until a
      human picks
- [x] **Nothing optimistic.** Every action disables its control until `gh` answers, then either
      invalidates the listing and detail — not the patch, which a verdict does not change — or
      renders `gh`'s own sentence beside the control that caused it
- [x] **A default-off Settings → Reviews switch** gates all of it, and lists what stays out: no PR
      creation, no labels, no issue writes, no force-push, no branch deletion, no editing anyone's
      comment. Not the phase doc's idea and deliberately not Phase 18's per-repo trust prompt —
      nothing here executes anyone's code, so one machine-wide switch is the honest weight
- [x] **Two bugs found in self-review, both about what GitHub actually does.** `gh run rerun` adds
      an attempt to the *same* run id, and main caches a completed run's tree and logs permanently
      — so re-running would refresh the listing, watch the run finish, and then serve the previous
      attempt's failure for as long as the app stayed open; `forgetRun` now evicts it in the
      handler, scoped by host and slug because run ids collide across repositories. And a
      comment-review could be submitted empty, which GitHub refuses — `APPROVE` is now the only
      bodiless verb everywhere
- [x] **Tests**: 31 command-construction cases over `gh-write.ts`, five spawn-counting cases over
      the cache eviction, four contract cases over the new payloads, and 13 Playwright cases over
      the guards — consent, the required bodies, the merge count and method, the absent controls on
      a draft/merged PR, `--failed` only on a failed run, and the recorded requests proving the app
      sent the verb the user chose. Five committed screenshots

Still open on the phase, both needing a human: a real `gh pr review` / `gh pr merge` against a
disposable test PR, and syntax-highlighted diff scroll performance on a PR with 100+ changed files.

## 2026-08-27 — Phase 20 · Theme E — inline review comment threads on the PR diff

Landed on `feature/phase-20-inline-threads`, squash-merged locally — no PR link, no GitHub remote
on this checkout. The phase's highest-unknown piece, and two of its three unknowns turned out to be
API facts rather than design calls:

- [x] `ForgeReviewThread` / `ForgeReviewComment` domain types plus `ForgeThreadSide` and the
      `ForgeWriteResult` envelope. The thread carries **three** position fields — `line`,
      `originalLine`, `startLine` — because a thread can lose its anchor, and collapsing them is
      how a comment gets pinned to code its author never saw
- [x] **Read through GraphQL, on its own channel**, both departures from the original bullet and
      both forced: REST `pulls/{n}/comments` returns a flat list with no thread object, no
      `isResolved` and no thread node id — resolution is a property of `PullRequestReviewThread`,
      which REST does not expose, and its node id is the only handle `resolveReviewThread` takes.
      New `gh-graphql.ts` is the app's one GraphQL read, kept out of `gh-cli.ts` so that file stays
      one `gh` subcommand per function. `mstudio:forge:pull-threads` is its own channel rather than a
      widening of `pull-comments`: one key serving the Files and Conversation tabs would make
      either tab's fetch serve the other's payload
- [x] Threads render as **rows** in the diff, not overlays — the diff is a list and a thread has to
      push the code below it down. The virtualizer now measures rather than assuming `ROW_HEIGHT`;
      code rows still land on exactly 18px, so a diff with no threads reflows nothing
- [x] The gutter affordance is opt-in on `threads`/`onComment` being present, because `DiffView` is
      shared with the Changes page and the commit inspector — a working-tree diff must not grow a
      comment gutter by accident. It replaces the `+`/`−` marker column rather than adding one, so
      hovering changes what a cell shows and nothing about where anything sits
- [x] `isCommentableLine` is the one gate on right-side-only v1, and `withCommentRows` refuses to
      splice onto a deleted line even if asked
- [x] The diff-position mapping, spiked first as the bullet asked. Verified against `cli/cli#14200`:
      `line`/`originalLine`/`startLine` and `diffSide` live on the **thread**, `databaseId` on the
      **comment**, and `diffSide` does not exist on `PullRequestReviewComment` at all — the first
      thing the spike got wrong
- [x] `gh-write.ts` exists as of this theme rather than waiting for F, carrying only E's three calls
      plus `describeApiFailure`, so `gh-cli.ts`'s "strictly reads" comment stays literally true

Found and fixed while reviewing the slice before it landed:

- **A live thread anchored outside every hunk rendered nowhere at all.** `isAnchored` cannot see
  this case: a reviewer who expands context on github.com can comment far outside any hunk, and the
  thread comes back live, right-side and unresolved with a perfectly real `line`, while `gh pr diff`
  fetches three lines of context. Keyed into `byLine` it matched no row and vanished — the same harm
  as pinning one to the wrong line, and harder to notice. `threadsForFile` now takes the `FileDiff`
  and checks the anchor against `rightSideLines(diff)`, a Set rather than a range test because a
  diff is hunks with gaps: line 50 falling between rendered hunks 10-12 and 90-92 does not make it
  renderable. Such threads join the collapsed group above the diff, which grew a fourth documented
  kind
- **`gh api graphql -F` type-guesses its variables**, which `gh-write.ts`'s own `apiPost` comment
  warns about for REST bodies and `gh-graphql.ts` then did anyway: `-F name=2048` sends the *integer*
  2048 for a `String!` variable and GitHub refuses the whole query — for a repo name that is neither
  unusual nor invalid (`gabrielecirulli/2048`). The String!/ID! variables now use `-f`; `-F` is kept
  only for `number`, which really is an `Int!`

**Pre-existing on `main`, not this theme's:** four e2e failures — `repos-workbench.spec.ts`'s
folded-repo trailing-edge test and three `terminal.spec.ts` session tests. Confirmed identical on a
detached `main` worktree at `5ff0df8`, and they sit in the two areas the last two `main` commits
touched. `229 passed` otherwise; the full vitest gate is green (599 app, 331 desktop).

## 2026-08-27 — Phase 20 · Themes A+B+C+D integration — the Reviews view gets its detail pane

Landed on `feature/phase-20-reviews-shell`, on rebase onto `main` after Theme C merged separately
(`feature/phase-20-pr-detail`, squash-merged locally — no PR link, no GitHub remote on this
checkout). Themes A/B/D built the Reviews view as a list-only pane against `main` as it stood
before Theme C existed; Theme C's own commit message said the plan all along was for the Reviews
*view* to mount the same `PrDetail` its workbench-tab route does. Rebasing surfaced that gap, so
this integrates the two rather than landing them side by side unconnected:

- [x] `ReviewsList` grows a resizable list-plus-detail split — the same shape `ActionsView`
      already has — with a new `reviewsListWidth` in `ui-store.ts`'s `LayoutSizes`
- [x] A row's click now **selects** the PR (mounting `PrDetail` on the right) rather than opening
      it on GitHub directly; that action moved to `PrDetail`'s own header button, which already
      existed for exactly this
- [x] New `store/reviews-store.ts` (`selectedPull`, keyed by repo) — the same shape
      `actions-store.ts`'s `selectedRun` uses, so the sidebar's Reviews section row can carry a
      specific PR number into the view, the same way `ActionsSection` already carries a run id
- [x] `ReviewsView`'s CLI-not-ready / error handling moved from a blanket early return into
      `ReviewsList`'s own list pane — a PR already selected from the sidebar keeps showing its
      `PrDetail` even when the listing itself can't refresh, since `PrDetail`'s three tabs already
      report "not ready" per tab on their own. Theme C's own `reviews.spec.ts` caught this: its
      signed-out-gh test expects the detail region to render regardless of the list's CLI status,
      which the original list-only Theme A/B early return would have blocked entirely
- [x] `gh-cli.ts`'s `listPulls` and the `forge.pulls` IPC contract both grow a `state` parameter
      (default `open`) rather than the hardcoded `--state all` Theme B shipped alone — the
      sidebar's Reviews section and the dashboard's pulls widget keep asking for open PRs only,
      exactly as Phase 17/19 shipped; only the Reviews view's own list explicitly asks for `all`.
      Caught in an independent code-review pass before the rebase: `--state all --limit N` meant N
      most-recent-of-any-state, which could silently starve those two surfaces of real open PRs
      on a repo where merges outpace opens
- [x] `pullStatus()` reads merged/closed off `pull.state` before falling back to
      `reviewDecision`/`isDraft` — also from that review pass, since a merged PR was rendering
      "Approved" once B started fetching every state
- [x] `LineRow` rounds only the outer edge of a run of adjacent `changed` diff pieces, not each one
      independently — a syntax-highlight token boundary landing inside one diff segment no longer
      draws a visible seam between two touching highlight boxes
- [x] Status tabs moved to `@bilo-io/ui`'s `Tabs` (WAI-ARIA roving-tabindex) instead of a
      hand-rolled tablist

### One thing worth remembering

**A parallel `/exec` loop landed Theme C on `main` while this session was mid-flight on A/B/D**,
and Theme C's own commit message and `done.md` entry both said, in effect, "the Reviews view will
mount this" — a forward reference to work this session hadn't written yet. The rebase's merge
conflicts were all mechanical (the same fields added to `PULL_FIELDS`/`gh-cli.ts` from both sides);
the real integration gap — a fully-built, tested `PrDetail` sitting unreachable because the
sidebar's route into Reviews no longer created the workbench tab that used to mount it — only
showed up by reading what Theme C actually shipped, not from any merge conflict. Worth remembering
for the next phase split across parallel sessions: a clean rebase is not the same claim as a
working merged result, and the two themes' own `done.md` entries are the place to check for a
forward reference like this one before calling a rebase finished.

## 2026-08-27 — Phase 20 · Theme C — PR detail: files, conversation and checks

Landed on `feature/phase-20-pr-detail` (squash-merged locally — this checkout has no GitHub
remote, so there is no PR link). Phase 17 shipped the Reviews tab as a summary and a link out,
and Phase 19 explicitly parked the rest; this is that parked work. Opening a pull request now
shows its diff, its discussion and its CI verdict without leaving the window.

### What landed

- [x] New `mstudio:forge:pull-files` channel (`repoId` + PR number) — **bare `gh pr diff`, not
      `--patch`**: the phase doc named `--patch`, which asks GitHub for `git format-patch` output
      (one mbox entry per commit, so a file touched twice appears twice and every mbox header
      after the first is swallowed as diff body). Verified against `cli/cli#14255` — 16 sections
      for 14 files with `--patch`, exactly 14 without. Parsed in main by git-engine's **existing**
      hunk parser through a new `parseMultiFileDiff` entry point over the same `parseSection`, so
      a PR diff and a `git diff` agree about renames, combined hunks and the line cap by
      construction. Capped by bytes, preferring a file boundary (half a hunk is not a diff) but
      falling back to a whole-line slice for the two shapes that have no boundary — a one-file
      patch and a header-less one — because a cap that can be escaped is not a cap
- [x] New `mstudio:forge:pull-comments` channel — `issues/{n}/comments` and `pulls/{n}/reviews`
      fetched concurrently and merged into one chronological thread in main, as a `ForgeComment`
      with a `kind` discriminator. A `PENDING` review and the empty `COMMENTED` shell around
      inline comments are both dropped: neither is a verdict anyone published
- [x] New `mstudio:forge:pull-detail` channel (beyond the theme's spec) — `gh pr view --json` for the
      body, base branch, line counts, `mergeable` and the head sha, which no listing field carries
      and the Checks tab is built on. Its own channel rather than a widening of `listPulls`, which
      Theme B is rewriting
- [x] `ReviewView` rebuilt into a tabbed PR detail under `app/src/features/reviews/` — **Files**,
      **Conversation**, **Checks** — with `forge-detail.tsx`'s `ReviewView` reduced to a one-line
      delegation so the Reviews *view* (Theme A) mounts the same component
- [x] Files tab renders each changed file through the existing `DiffView`, first three expanded,
      matching the Changes page's accordion row rather than inventing a second layout. No
      `onExpandContext`: expanding context is a refetch, and `gh pr diff` has no per-file form
- [x] Conversation tab lists the merged thread read-only, markdown-rendered with no `rehype-raw`,
      review verdicts riding the same `StatusPill` the sidebar row uses
- [x] Checks tab mounts the Phase 19 `RunDetail` unchanged, resolving the PR's **head sha** against
      the cached run listing — no third subprocess, and correct after a force-push in a way
      branch-matching would not be
- [x] Handlers resolve owner/repo in main from `.git/config`; the renderer sends only a `repoId`
      and a PR number the schema bounds to a positive integer before it reaches a command line
- [x] Tests: `parseMultiFileDiff` (ordering, per-section classification, empty-section drop,
      per-file line cap), `parsePullDetail`/`parseIssueComments`/`parsePullReviews`/
      `mergeConversation`, `stripPatchPreamble` and `capPatch` under bare vitest; three new schema
      guards in `ipc.test.ts`; seven Playwright specs in `reviews.spec.ts` plus a
      `reviews-shots.spec.ts` producing the four committed screenshots

### Open

- The two human passes named in the phase's Verification list are Theme F's and D's, not this
  one's. Nothing from Theme C is left for a human.

## 2026-08-27 — Phase 20 · Themes A, B, D — Reviews view shell + PR list + syntax-highlighted diffs

Landed on `feature/phase-20-reviews-shell` (squash-merged locally — this checkout has no GitHub
remote, so there is no PR link). The first slice of Phase 20: Reviews grows from a sidebar-section
stub into a full nav-rail view with a real PR list, and every diff in the app gains syntax colour.
Themes C, E, F, G are separate, later slices.

### What landed

- [x] **Theme A** — `reviews` joins `ViewId`/`VIEW_IDS`; the rail gets a `FaCodePullRequest` item
      beside Tests' `FaCheckDouble`; `VIEW_FILTERS['reviews']` narrows the sidebar to Reviews +
      Worktrees, the same mechanism Actions/Tests already use. Actions and Reviews now share one
      `useForgeGateAvailable` gate (renamed from `useActionsAvailable`) since both ask the same
      "does this repo have a GitHub remote" question. The sidebar's Reviews section row now routes
      into the Reviews view instead of opening a workbench tab — the same move Phase 19 made for
      Actions runs, and it leaves the old `ReviewView`/`'review'` workbench-tab kind in place
      unrendered-but-reachable, exactly as Phase 19 did for `RunView`/`'run'`
- [x] **Theme B** — `listPulls` moves off `--state open` to `--state all`; `ForgePull` grows
      `mergedAt`/`closedAt`. `features/reviews/{reviews-view,reviews-list}.tsx`: status tabs
      (All/Open/Draft/Merged/Closed), an author filter (`MultiSelectMenu`, reused), a search box,
      all orthogonal (AND-combined), plus a "Load more" button — `gh pr list` has no cursor, so
      widening `limit` and refetching is the honest shape. No detail pane yet (Theme C); a row's
      click opens the PR on GitHub, matching the sidebar's own read-only Issues section
- [x] **Theme D** — `features/diff/line-highlight.ts`: per-line shiki highlighting, deferred
      through `requestIdleCallback` and cached module-level by `(path, line kind, line text)` —
      mirroring `services/avatars.ts` — so it never competes with the virtualized scroll path
      `outstanding.md` flagged as the risk when this was parked at Phase 12. `diff-rows.ts` grows
      `mergeSegmentsWithTokens`, intersecting the highlight tokens with the existing intraline
      diff segments as two independent partitions of the same line — syntax colour is the inner
      layer, the add/del tint stays the outer one. The shiki singleton itself moved out of
      `code-preview.tsx` into `lib/highlighter.ts` so the Files preview pane and diff rows share
      one engine instance. Applies to Changes and the Graph commit inspector by construction (one
      shared `LineRow`); Reviews' own diff surface gets it for free once Theme C lands

### One thing worth remembering

**shiki's instance `codeToTokensBase` does not auto-load a grammar**, despite its own type
declaration sitting right next to a *different*, module-level shorthand that does. Calling it for
a language shiki hadn't already loaded threw `Language 'typescript' not found` on every single
line, silently — the catch block swallowed it and every row just stayed unhighlighted, which reads
identically to "still scheduled" and cost real time to notice. The fix is the same on-demand
`loadLanguage()`-then-highlight two-step `code-preview.tsx` already uses for `codeToHtml`; worth
remembering that shiki's "shorthand" doc comments describe a sibling API, not the instance method
they're attached next to.

Also worth remembering for the next fixture author: the mock bridge stands in for the **preload**,
which only ever hands the renderer already-parsed domain objects (`gh-parse.ts`'s job) — a forge
fixture written in `gh`'s own raw JSON field names (`headRefName`, `author: {login}`) crashes the
renderer with "Objects are not valid as a React child" the moment a component reads the parsed
field name (`author` as a string) and gets the raw shape instead. `actions-view.spec.ts`'s `run()`
builder already gets this right; a new builder should be checked against it before assuming the
raw `gh --json` field names are the fixture's contract.

## 2026-08-27 — Phase 19 · Themes F+G — Tests discovery and execution

Landed on `feature/phase-19-tests` (squash-merged locally — this checkout has no GitHub remote, so
there is no PR link). The last two themes of Phase 19: the app looks at a repository's tests for
the first time, discovering what it can run and — once trusted — running it.

### What landed

- [x] `git-engine/src/tests/` — `discover.ts` reads `package.json` scripts, a package's `moon.yml`
      and the presence of `vitest.config.*`/`playwright.config.*`/`jest.config.*`/`cypress.config.*`
      across the workspace (npm/yarn `workspaces`, `pnpm-workspace.yaml`, or a bare single package),
      `classify.ts` sorts each candidate into unit/integration/smoke/e2e/lint/typecheck/other, and
      `discovery-cache.ts` memoises per repo on a short TTL. A moon project's standard tasks
      (`test`/`lint`/`typecheck`) route through `moon run <id>:<task>` rather than duplicating them
      as `pnpm run` suites; everything else stays a plain package-manager script
- [x] `shared/src/domain/tests.ts` + `mstudio:tests:*` channels/schemas — discovery is `repoId`-only
      like `diagDetect`; trust and run take a `suiteId` and (for `trust`) a fingerprint of what the
      prompt showed, never a command — main always re-derives the argument vector itself
- [x] `desktop/src/main/process-runner.ts` — the diagnostics runner's spawn/deadline/`SIGKILL`
      engine, generalised out of `diagnostics/runner.ts` (now a thin eslint-shaped adapter over it,
      unchanged behaviour, its existing test suite green untouched) so `testing/runner.ts` can reuse
      it for suites. Also generalised: the kill signals the whole process group, not just the direct
      child — a test runner's own worker processes have to die with it
- [x] `desktop/src/main/testing/` — per-suite trust (`trust-store.ts`, widened from diagnostics'
      one-grant-per-repo to a map, because a repo's `test` and `e2e` scripts are different
      propositions), and `reporters.ts` reading vitest/jest's shared JSON shape and playwright's
      `stats` + nested `suites` shape — both write one blob at close, not a stream, so the runner
      streams raw stdout live for the output pane and parses the buffered blob once the process
      exits. An unrecognised runner is `structured: false` plus exit code and raw output
- [x] `features/tests/` — the Tests view (package → suite tree, suite detail with trust/run/cancel,
      live output, results), a sidebar section grouped by kind, `tests-store.ts` (per-suite live
      output and last-result-of-the-session), and `run-in-terminal.ts` (the `start-claude.ts`
      posture — types the command, does not run it, no new trust surface)

### One thing worth remembering

**`getByRole` found a `<TreeSection>` row I expected `inert` to hide.** Phase 16's own done.md entry
notes `<Collapse>` marks a folded section's content `inert`, which is what makes it actually
invisible to Playwright rather than merely a `toHaveCount(0)`-shaped illusion. The sidebar's Tests
section is folded by default and never toggled in the Tests-*view* specs, yet its suite rows still
resolved as buttons and collided with the main pane's identically-named ones — a strict-mode
violation, not a false pass, so it was caught immediately rather than shipped. Root cause not fully
chased down (possibly a mount-timing race before the `inert` attribute lands); the fix was giving
both panes `role="region"` landmarks and scoping every query through one, which is the more robust
answer regardless of the cause. Also worth remembering: `getByRole('button', { name: 'test' })` is a
case-insensitive **substring** match by default, and the new "Tests" sidebar toggle collided with an
unrelated `forge-issues.spec.ts` fixture whose CI job happens to be named `test` — fixed there with
`exact: true`, the same guard the spec already used for "Actions".

## 2026-08-26 — Phase 16 · Theme F (follow-up) — Coverage for the nav-mode lock

Landed on `feature/nav-mode-coverage`. Theme F shipped the locked/unlocked rail and it works,
but the behaviour itself was never asserted: the e2e only checked that the pin *appeared* once
Appearance had locked the rail, and `navMode` was the one Theme F field with no store test at
all — despite sitting in `partialize`, where a future edit could drop it silently.

### What landed

- [x] e2e — the pin's round trip, and the distinction that makes a lock a lock:
      `auto` hover-expands as an overlay (`--nav-offset` stays `3.5rem`), `expanded` is the only
      mode that moves content (`16rem`). The two rails render identically, so the custom property
      `AppFrame` publishes is the only thing that can tell them apart
- [x] e2e — unlocking lands on `auto`, never on `collapsed`: the pin is two-state by design, and
      nothing had held it to that
- [x] Three `ui-store.test.ts` cases — all three modes through `setNavMode`, the mode surviving a
      restart, and a stored payload that predates the setting merging to `auto` rather than
      booting someone into a rail they never locked

### Worth remembering

`openSettings` clicks the rail's own footer button, so the pointer is left sitting on the rail
and `auto` holds it hover-expanded — the "no pin at rest" assertion failed until the test moved
the mouse off first. A hover-driven rail makes the pointer's resting place part of the fixture.

Tests: `app:test` 513 passed; full e2e 192 passed / 8 skipped. Gate green.

## 2026-08-26 — Phase 16 · Theme F — Grouped settings navigation + the side-navigation control

Landed on `feature/sidebar-settings` (squash-merged — this repository still has no remote, so
there is no PR link). Follow-up scope on a phase that had already closed: the settings sidebar
Theme A built was a flat list of five words, and the store's third nav mode was reachable from
nowhere in the UI.

### What landed

- [x] `SETTINGS_GROUPS` — General / Tools / System — plus a `group` field on each
      `SETTINGS_PAGES` entry. One data change; every consumer of the flat list is untouched
- [x] The sidebar renders group-first behind collapsible headers on `@bilo-io/ui`'s `<Collapse>`,
      with `collapsedSettingsGroups` persisted. Stored as the list of *collapsed* groups, not a
      record of every group's state — the same inversion `collapsedNavSections` uses, which is
      what makes a group added later start open with no migration
- [x] One `react-icons/lu` glyph per page. The map lives in the view, not on `SETTINGS_PAGES`:
      putting React components in the store would make every consumer of a page id drag an icon
      package in behind it
- [x] Appearance gains a **Side navigation** control over `navMode`, and it is the only route to
      `collapsed` — the rail's own chevron is deliberately a two-state pin, `auto` ⇄ `expanded`.
      Both controls write the one field, so each reflects the other immediately
- [x] `Choice` takes an optional third element per option: a hint, rendered as the button's
      `title` and as a line under the selected row. "Auto / Locked open / Locked closed" cannot
      explain itself in three words, and one field-level hint cannot say it three ways. Omit the
      element and the control renders exactly as before

### Two things worth remembering

- **The nav had to widen, 11rem → 12rem.** A glyph plus its gap is ~22px, which is precisely
  what pushed "Monitor & Diagnostics" into an ellipsis. Caught from the regenerated Phase 16
  screenshot, not from a test — no assertion in this repo can see a clipped label. `truncate`
  stays as the backstop, and each page button now carries a `title`.
- **`<Collapse>` folds by animating a grid track to `0fr`, so a folded group's buttons keep
  bounding boxes of their own** — Playwright still calls them visible, and the first draft of
  the e2e spec asserted `toHaveCount(0)` and failed. What actually takes them out of the tab
  order and the accessibility tree is the `inert` attribute `<Collapse>` puts on the clipped
  region, so that is what the spec asserts. It is the stronger claim anyway: a regression to
  painted-but-focusable fails there, where a visibility check would not.

### Verification

- `moon run :typecheck :lint :test` green — 15 tasks
- Six new `ui-store.test.ts` cases: toggle, independence across groups, persistence,
  forward-compatible merge, and both directions of the page↔group integrity check (a page filed
  under a group no header declares renders nowhere, silently; there is no runtime check for it)
- Three new e2e specs in `settings-pages.spec.ts` — grouping and fold/unfold, a fold surviving a
  reload, and the nav-mode control agreeing with the rail's pin. Full suite: 191 passed
- `docs/screenshots/phase-16/settings-agent.png` regenerated — it is the shot that shows the
  grouped sidebar

## 2026-08-26 — Phase 19 · Theme D — The dashboard becomes a board

Landed on `feature/phase-19-dashboard` (squash-merged — this repository still has no remote, so
there is no PR link). The Dashboard rail item stops being a placeholder: it is a
`react-grid-layout` board over one repository, following the sidebar selection, with seven
widgets driven from a single registry.

This branch originally carried its own `gh issue list` — pulled forward so the Issues widget
would not have to wait for Theme C. C landed first, with a fuller version (run detail, logs,
`gh workflow list`, and a `--hostname` fix), so that commit was dropped on rebase and the widget
reads C's contract instead. Nothing of it survives here beyond the widget.

### What landed

- [x] `react-grid-layout` **v2** — not the v1 the phase doc was written against. `cols`/`rowHeight`
      moved into `gridConfig`, `draggableHandle` into `dragConfig`, and `WidthProvider` was
      replaced by a `useContainerWidth` hook that observes the CONTAINER rather than the window —
      which is precisely the responsive-container pattern the doc asked for, so it is used
      instead of the hand-rolled `ResizeObserver` wrapper that was written first and deleted
- [x] Its stylesheet retinted for theme tokens: the drop placeholder (shipped as `red` at 20%)
      and the resize handle (a base64 PNG of a grey corner), plus a reduced-motion opt-out
- [x] A widget registry — id, title, min size, and the **data source** each widget needs. One
      table serves rendering, the Add-widget menu and the availability gate
- [x] Per-repo layout, author filter and window in a new `dashboard-store.ts` on its own persist key
- [x] Per-tile ⋮ (Move up / Move down / Remove) and a board menu (add/remove, Reset layout).
      **Drag is not the only way to reorder**, and every tile is a `<section>` with an `<h3>`
- [x] Commit calendar, contributors, activity feed, open PRs, open issues, latest runs, repo health
- [x] The author filter is scoped **once**, in the view, and handed down — so the calendar, the
      feed and the contributor table cannot disagree about who is included
- [x] Widgets whose data source the repo lacks leave the board **and the picker**; a stale id in a
      persisted layout is skipped rather than crashing
- [x] `withChurn` is derived from the board, so a board with no widget that can show insertions
      never pays for `--numstat`
- [x] `MetricDial` and `RadialGauge` given their first callers — the two health figures that are a
      bounded fraction of a known total; the unbounded ones stay flat stat tiles
- [x] `docs/screenshots/phase-19-dashboard/*.png` — light, dark, author-filtered, widget picker

### Two bugs this found, and one thing worth remembering

- **A layout report must not delete what it did not mention.** The board renders only the widgets
  a repo can populate, and `hasForge` is false while the remotes query is in flight — so the
  grid's first `onLayoutChange` reports the stats widgets alone. `setLayout` replaced the stored
  layout wholesale and permanently deleted the three forge tiles a frame before the remotes
  arrived. It merges now. Found reviewing the diff; the regression test came second.
- **A disabled issue tracker is an answer, not an error.** `gh issue list` exits non-zero both for
  a switched-off tracker and for a bad credential. `issuesDisabled` keeps them apart, so a repo
  that tracks its work in Jira does not get a red failure card.
- **The heatmap ramp cannot be a theme token.** `--primary` is a near-black here (the same thing
  Theme A recorded about the sidebar toggle), and five alphas of a near-neutral give five greys.
  For a widget whose entire content is intensity that is not a styling preference — it is the loss
  of the only thing it says. The four steps are a data hue in `styles.css`, mirrored for dark,
  following the rule `metric-palette.ts` and `lane-colors.ts` already state.

Gate green: typecheck, lint, 1,190 unit tests, Playwright 170 passed / 8 skipped (rebased onto Theme C).
## 2026-08-26 — Phase 19 · Theme E — The Actions view

Landed on `feature/phase-19-actions` (squash-merged — this repository still has no remote, so
there is no PR link). Two panes: runs sectioned by workflow on the left, one run read in depth on
the right — facts, job/step tree, and the log of whichever job is selected.

### What landed

- [x] `features/actions/actions-view.tsx` — resizable two-pane, following the sidebar's repo
      selection, with an explicit Refresh and no polling
- [x] Runs sectioned under collapsible workflow headers, ordered by each section's newest run
- [x] Run detail: facts row, job tree with only the failed jobs expanded, per-step conclusions
      and elapsed times
- [x] `log-pane.tsx` — virtualised through `@tanstack/react-virtual`, `::group::` **and**
      `##[group]` folding, a truncation notice above the log, and a "Load the full log" escape
- [x] `ansi.ts` — sixteen colours, bold, dim, reset, resolved to theme-token pairs
- [x] Open-in-GitHub on the run, each job, and the workflow file; nothing here writes
- [x] `actions-store.ts` (selection, non-persisted) + `layout.actionsListWidth` (geometry, persisted)
- [x] 49 unit tests; 10 Playwright specs; `docs/screenshots/phase-19-actions/*` in both themes

Gate green: typecheck, lint, 1,247 unit tests, Playwright 188 passed / 8 skipped.

Four decisions, all taken before any code:

- **One place a run is rendered.** Phase 17 opened a run into a Changes tab because there was
  nowhere else for it to go. There is now, so the sidebar row selects the run and switches to
  this view. The `run` tab kind stays in `workbench-store` for any tab already open — it is
  simply never created again. Two surfaces rendering the same run differently, depending on how
  you arrived, is one surface too many.
- **One log fetch per run, split in the renderer.** `gh run view --log` prefixes every line
  `job<TAB>step<TAB>timestamp message`, so one subprocess serves the whole tree and clicking
  between jobs afterwards is free. The alternative — `--job <id>` per job — is a smaller payload
  per click and a subprocess per click, and a failed matrix run is exactly when you click a lot.
- **Folding changes which rows EXIST.** The pane virtualises, and a collapsed group left in the
  index space at zero height is a measurement that disagrees with the screen. `visibleRows`
  derives a fresh flat array from the fold state over the same parsed tree. Collapsed state is
  keyed on group **ordinal**, not label: a job's log routinely holds four groups called
  "Run actions/checkout@v4".
- **ANSI resolves to theme pairs, and the rest is removed.** A terminal's #cd0000 is unreadable
  on this ground; stripping colour altogether throws away what makes a failed vitest run legible.
  256-colour and truecolour sequences are *swallowed with their arguments* — reading `38;5;196`
  as three codes would paint the rest of the line at random. Carriage returns resolve to the last
  pass, so one npm install is one row rather than forty.

Two bugs the specs caught, both worth remembering:

- **A zustand selector that builds a value is a render loop.**
  `(s) => s.collapsedWorkflows[repoId] ?? []` returns a new array every call, and
  `useSyncExternalStore` compares snapshots by identity — so React reported "The result of
  getSnapshot should be cached to avoid an infinite loop" and *stopped rendering the subtree*.
  The view was blank with no error. Select the record, index it outside.
- **`=== null` is not a null check for anything a fixture built.** `RunHeader` read
  `run.headSha.slice(0, 7)` behind `run.headSha === null`. Through the real IPC path every
  payload is schema-parsed and that guard holds; a hand-built e2e fixture is under no such
  obligation, `undefined === null` is false, and the missing field took the whole view down.
  The renderer should not be the layer that trusts this.

The self-review pass found nine more. The one that mattered most was a **regression**: the run
row set the run but not the *repository*, and the view follows `selectedRepoId`. Every repo card
is expanded by default, so the row is clickable while another repo is selected — the view then
opened on that repo's runs with the clicked run nowhere in it, and if it had no GitHub remote the
rail hid Actions and `app.tsx` bounced to Graph. The workbench tab this replaced carried its own
`repoId`; removing the tab lost it.

Two more made the log actively lie, and both trace to the same thing — **a truncated log is two
windows that were never adjacent**:

- The gap marker main splices in has no `job<TAB>step<TAB>` prefix, so the parser filed it under
  `preamble`, which nothing renders. A capped log read as a complete one. It is a `gap` node now,
  always visible and never foldable, and `logGapMarker`/`isLogGapMarker` moved into
  `@midnite/studio-shared` so the writer and the reader share one definition — with a round-trip
  test that says so rather than two regexes agreeing by luck.
- Folding ran over the concatenation, so the head window's dangling `##[group]` absorbed every
  tail line — including the failure the log was opened for — under the wrong header, where
  "Collapse all groups" hid it completely. Each window folds on its own now.

The other six, briefly: `ESC[?25l`/`ESC[?25h` (cursor hide/show — npm, pnpm, every CI spinner)
carry a *private* parameter byte that `[0-9;]` does not match, so they rendered as literal
`[?25l`; the log pane's fold state is keyed on the job, since group *ordinals* carried across
jobs fold unrelated groups; "Load the full log" blanked the pane, because the capped and
un-capped keys differ by design and a second query cannot bridge them (`placeholderData` can);
a stored job is now honoured only if it exists in the current run, which changes without anyone
selecting one; `full` is stored with its run id rather than reset in an effect that lands a
render *after* the query has already fired at the new run; and a running run no longer reports a
duration, since `updatedAt` is the last state change and is non-null mid-flight.

**Not covered, deliberately stated:** the two-repo case behind the first finding has no e2e test.
`mock-bridge.ts` serves a single hard-coded repository, and widening it would touch every
existing spec's fixture shape — a change worth making on its own, not inside this theme.

Also noted while landing: each pane is now a named landmark (`Workflow runs`, `Jobs`, `Run
detail`, `Job log`), and the job status pill moved *outside* its button. Both started as test
ergonomics — four panes rendering buttons called "CI" made every locator ambiguous — and both
are the accessible thing to do anyway. A status is a reading of a job, not part of what the
control does.

## 2026-08-26 — Phase 19 · Theme C — Forge: issues, run detail and logs

Landed on `feature/phase-19-forge` (squash-merged — this repository still has no remote, so
there is no PR link). Three more `gh` calls behind the wrapper Phase 17 built, the four channels
that carry them, and the one sidebar surface they make possible.

### What landed

- [x] `listIssues`, `runDetail`, `runLog` and `listWorkflows` in `gh-cli.ts` — same login-shell
      wrapper, `GH_PAGER=cat`, `shellQuote()` and `ghStatus()` gate. No new subprocess path
- [x] `parseIssueList`, `parseRunDetail`, `parseWorkflowList`, `parseRunLog` and
      `isIssuesDisabled` in `gh-parse.ts`, total over `unknown` like their siblings
- [x] `ForgeIssue`, `ForgeLabel`, `ForgeStep`, `ForgeJob`, `ForgeRunDetail`, `ForgeRunLog` and
      `ForgeWorkflow`, each in the `{cli, …, error}` envelope
- [x] `mstudio:forge:{issues,run-detail,run-log,workflows}`, all read-only, all `repoId`-keyed
- [x] `ForgeRun` grows `event`, `workflowId`, `workflowName`, `startedAt`, `updatedAt`,
      `displayTitle`, `number`, `attempt` — every one nullable, so Phase 17's payloads still parse
- [x] An Issues sidebar section beside Actions and Reviews; run rows grow a disclosure chevron
      that peeks at the job tree in place
- [x] Unit tests over captured `gh` output; five Playwright specs over the new surface

Gate green: typecheck, lint, 1,144 unit tests, Playwright 160 passed / 4 skipped.

Four decisions worth carrying forward:

- **The field set was read off the installed `gh`, not assumed.** `gh run list --json` publishes
  no `actor` at any version, and an unknown `--json` field makes the whole call exit non-zero
  rather than degrade one column. Guessing here would have taken the Actions section down for
  everyone. `ForgeRun` therefore has no actor to fill — worth knowing before Theme E designs a
  run row around one.
- **"Issues are off" is a field, not an error string.** `gh issue list` exits non-zero for a
  repository with its tracker disabled, and that exit is the *only* signal — no payload, no
  distinct code. So the message match is load-bearing, and it degrades to an ordinary error
  rather than to a silent empty list. Theme D reads `disabled` to drop its Issues widget entirely.
- **Only completed runs are cached.** A completed run is immutable, an in-flight one is the
  opposite; the LRU is capped at 20 because these are the largest payloads the app holds. Logs
  need no status check at all — GitHub does not serve one for an unfinished run, so a log we
  managed to fetch is by definition final.
- **Grouping is by `workflowId`; the `.yml` path is a separate, lazy call.** No run-list field
  carries a path, so `gh workflow list` is a second subprocess — paid only when something needs
  to *link* to a workflow, never to render a list.

A self-review pass found ten things, two of which would have shipped broken:

- **`--hostname` is not a flag on any of these subcommands.** It reads like the flag for
  "target this Enterprise host" and is not one — `gh issue list --hostname x` exits with
  `unknown flag`, as do `run list`, `run view`, `pr list` and `workflow list`; it belongs to
  `gh auth` and `gh api`. This was **pre-existing in `listRuns`/`listPulls` since Phase 17**, so
  every forge section has been broken for GHES remotes all along and nobody had one to notice
  with. The supported form is `--repo [HOST/]OWNER/REPO`, and `hostFlag` is now `repoFlag`.
- **An exit code is the failure signal; an empty string is not.** `gh run view --log` prints the
  job logs it *did* fetch before exiting non-zero over the ones it could not, and the 60s
  timeout kills it mid-stream the same way. Believing non-empty stdout cached a half-log as
  `complete: true` — the silently-short log `ForgeRunLog` was shaped to make impossible. The
  rule is now `logVerdict`, pure and unit-tested, reading its verdict off stderr.

The other eight, briefly: `full: true` was returning the first 8MB and no tail, dropping the
failure that is the reason anyone opens a log; one unparseable step deleted its whole job,
because zod fails an object over a single bad array element; `ForgeRunStatus` was missing
`waiting`/`requested`/`pending`, so a job held by an environment protection rule — the one job
worth seeing — was the one that vanished; `runInShell` buffered a log twice; `describeFailure`
could render a whole JSON payload into a sidebar note; the job peek claimed "no jobs" for a
signed-out `gh`; `gh workflow list` was silently stopping at its default of 50; and twenty
expand chevrons were all called "Jobs in CI".

Two smaller things the work shook out. `runInShell` now keeps stdout and stderr apart as well as
combined: a log has no brace for `parseJsonPayload` to seek past, so a chatty `.zshrc` would
otherwise be interleaved into the text the user reads. And `runStatus` split into
`outcomeStatus(status, conclusion)` so a job borrows the run's conclusion→colour mapping instead
of growing a second opinion about whether `cancelled` is red.

## 2026-08-26 — Phase 18 · Theme F — The diagnostics segment, its trust prompt, and a settings page

Landed on `feature/phase-18-diag-ui` (squash-merged — this repository still has no remote, so
there is no PR link). The footer's right cluster gains a segment for the selected repository's
error and warning counts, opening into a flyout that lists them as `file:line`. Getting there
means passing the app's first consent gate: the dialog shows the literal command and the
directory it will run in, says why that command was proposed, and warns that this executes a
program from the repository itself.

### What landed

- [x] Trust prompt through `confirm-dialog.tsx` in `danger` mode — literal command, resolved
      workdir, detector evidence
- [x] Error/warning pills on `--destructive` and `--health-warn`, semantic tokens rather than the
      monitor's data hues
- [x] **Absent ≠ zero** — a trusted-but-unmeasured repo says "not measured", never a green zero
- [x] The segment follows `useActiveWorktree()`, not the workbench tab
- [x] The flyout caps its list and says what it withheld (Phase 17's `EXPAND_ALL_LIMIT` rule)
- [x] An untrusted repo shows "Enable diagnostics" rather than silence
- [x] A Monitor & Diagnostics settings page: which metrics appear, the closed-flyout cadence, the
      trusted command, and revocation
- [x] Re-running is manual — nothing lints because a file changed
- [x] `docs/screenshots/phase-18/diagnostics-{trust-prompt,flyout}.png`

Gate green: typecheck, lint, 1,105 unit tests, Playwright 155 passed / 4 skipped.

What this shook out — nearly all of it from **integrating F against the Theme E that actually
landed**, rather than the one F was written against:

- **A shim that documents its own deletion still has to be deleted.** F was built in a parallel
  session against `contract-shim.ts`, a restatement of E's contract whose docblock said every
  type in it dies when E merges. E merged; the shim did not. Because it reached the bridge
  through one `as unknown` cast, **the whole feature typechecked while talking a shape the
  renderer never receives** — `rule` for `ruleId`, `line: number | null` for a `number` where `0`
  means file-level, a `workdir` on the trust record that E deliberately does not carry. A cast is
  what let a compile-time guarantee become a comment.
- **A rebase can merge two implementations of the same key and pick one silently.** Both E's
  `diag` mock and F's landed in the same object literal in `mock-bridge.ts`, along with two
  `diagnostics?` fixture blocks in the same type. The second `diag` won at runtime, so every F
  spec was driving F's stand-in and none of them touched E's. Duplicate keys in a JS object are
  legal; that is the whole problem.
- **The evidence line in the consent dialog had never once rendered.** Detection was enabled only
  for `no-command`, and the prompt that quotes evidence is reached from `untrusted` — so "Proposed
  because: …" was unreachable in exactly the state that shows it. It now detects for every arm
  except `trusted` (the steady state still stats nothing), and matches evidence to the command
  being approved by `commandFingerprint`, so a repo whose detected command differs from its stored
  one cannot cite one's reasons for the other.
- **An absent `blastRadius` is not "no blast radius" — it is "still counting".** `ConfirmDialog`
  renders "Checking what this affects…" for `undefined`, so the diagnostics prompt carried a
  sentence that would never resolve. The type already documented `null` as "nothing to lose";
  the caller simply had to say so.
- **The consent dialog was collapsing the newline that separated the command from its directory.**
  `node_modules/.bin/eslint . --format json in /tmp/midnite-git` reads as one string — precisely
  the ambiguity a prompt asking to execute something must not have. The body is
  `whitespace-pre-line` now.
- **`min-w-0 flex-1` does not stop a long token overflowing its box.** A repo-relative file path
  is unbreakable, so it ran *underneath* the rule id in the next column. Only the screenshot
  showed it; every assertion about the row passed.
- **A fixed epoch in a screenshot fixture ages.** The flyout's shot read "Measured 24366 hours
  ago", which is what `ranAt: 1_700_000_000_000` becomes three years later.


## 2026-08-26 — Phase 19 · Theme A — The nav rail becomes the app's table of contents

Landed on `feature/phase-19-nav-shell` (squash-merged — this repository still has no remote, so
there is no PR link). `ViewId` grows from four to seven: **Dashboard**, **Actions** and **Tests**
join Files, Graph, Changes and Settings. Dashboard renders through **`NavConfig.pinned`** — the
shell's own ungrouped slot above the sections, documented in its type as being for exactly this —
so no shell change was needed. Tests takes `FaCheckDouble` from `react-icons/fa`, a second icon set
in the rail on purpose.

**`viewForPath` became a lookup over `VIEW_IDS`** rather than a chain of comparisons. The chain
answered `graph` for anything it had not been taught, so three new views would have meant three
rail links that all looked like the graph — and nothing would have failed to compile.

**One table now reshapes the sidebar, on two axes.** `features/repos/view-sections.ts` holds
`VIEW_FILTERS: Record<ViewId, ViewFilter>`, where a filter says which `SectionKey`s render AND
whether clean checkouts are dropped. Actions → `['actions','worktrees']`, Tests →
`['tests','worktrees']`, everything else → work-in-progress. Phase 17's `use-dirty-filter.ts` is
deleted: it was the first instance of this idea and is now just the `changes` row. Keeping both
axes in one hook is what makes "Show all sections" a real escape hatch — it has to put back the
ref sections *and* the clean checkouts, or it only half works.

`SectionKey` gained `actions`, `reviews` and `tests`, and `ForgeSections` takes the visibility
predicate as a **prop** rather than reading the view itself — one answer to "which sections does
this view show", not two free to disagree. A narrower `RefSectionKey` keeps `sectionMenu`'s
parameter honest: it has nothing to offer a forge or test section, and widening it would have
traded a compile error for a menu that opens empty.

**Actions hides itself when `pickForgeRemote` finds no GitHub remote**, and standing in it when
that happens redirects to Graph. The availability probe holds its **last** answer while remotes
load — including across a repo switch. That held answer is knowingly about a different repository:
it is wrong for at most one paint, whereas a cold "no" would be wrong for the same paint and take
the view down with it.

The narrowing toggle is persisted per view in `ui-store.sectionFilters`, a sparse map so a view
added later starts from its own default rather than a stale `false`.

**The e2e suite was un-rotted on the way through.** `graph-themes.spec.ts` had twelve tests failing
on `main` for two Phase 16 changes it was never updated for: Settings became a footer *button*
rather than a link, and the style picker moved onto a Settings **page**. Because `settingsPage`
persists, *which* tests failed moved with test order — the "cross-test ordering" the 30s timeouts
were masking. 6.4 minutes red → 25 seconds green. Ten new `nav-shell.spec.ts` specs cover the rail,
the gating, the narrowing, the escape hatch and the redirect; the repositories `<aside>` gained an
`aria-label` because AppFrame's rail is an `<aside>` too and two unlabelled ones are ambiguous.

**Left open:** the toggle's *visual* on-state. `--primary` is a near-black within a point of
`--muted-foreground`, and `bg-accent` / `bg-primary/10` both resolve to alpha ≈0.03, so the tint
Phase 17 shipped has never read. `aria-pressed` and the label carry the state and are asserted;
the colour belongs with the appearance tokens, not the nav shell.

## 2026-08-26 — Phase 19 · Theme B — Repository statistics from one history traversal

Landed on `feature/phase-19-stats` (squash-merged — this repository still has no remote, so there
is no PR link). The dashboard Theme D will build needs seven numbers about a repository's history;
this is the layer that produces all of them from **one** `git log --all` pass. On any real
repository the traversal is the entire cost and the arithmetic afterwards is free, so seven
widgets each shelling out would have been seven times slower for exactly the same information.

**The traversal.** `commit-history.ts` walks `--all` (a contributor table that omits everyone
whose work sits on a branch is simply wrong) with `--use-mailmap` always on — the flag has shipped
since git 1.8.2 and dugite bundles the binary, so the "if available" hedge in the plan was
guarding against a git we do not ship. Records are framed by a **sentinel**, not `-z`: with
`--numstat` git interleaves plain file lines between commit records, and `-z` removes the very
newlines that would distinguish a header from a file line. It asks for one commit more than the
cap so "exactly at the cap" and "there is more" stay distinguishable.

**Churn is opt-in**, and that turned out to be the most consequential decision in the slice.
`--numstat` makes git diff every commit against its parent rather than just read commit objects,
which on a large repository dominates everything else put together. A board with no churn widget
on it now pays nothing for one.

Three aggregators, each with a trap the obvious implementation falls into:

- **The calendar buckets in the reader's local timezone.** `%at` is a UTC epoch and a heatmap cell
  is *a day in the life of the person looking at it*. A commit made at 00:30 on the 6th in Berlin
  is 23:30 on the 5th in UTC — bucket it as UTC and the square lights up on a day that person had
  not started yet. The error is small, systematic, and lands precisely on the late-night commits
  people remember making. The zone is an **explicit parameter** rather than an ambient read, which
  is what makes it testable: mutating `process.env.TZ` mid-run is unreliable because V8 caches the
  resolved zone, and it cannot express "these two zones disagree about this instant", which is the
  only assertion worth making. Bucketing happens first and gap-filling second, so the
  daylight-saving case is correct for free — once a commit is a `YYYY-MM-DD` string, a 23-hour day
  is not a thing that can be miscounted.
- **Contributors aggregate by email and display the most recent name.** Keying on the display name
  is the obvious implementation and it splits one person into three entries that each look like a
  stranger, none of whom did enough work to appear near the top. Showing the *first* name seen is
  the other half of the trap: the table goes stale the moment anybody updates their git config.
- **Churn ranks by commits that touched a file, not by lines changed.** A lockfile rewritten once
  inside a 90,000-line diff tops any line-based ranking while telling you nothing; the file thirty
  commits have had to touch is where the work actually is. Binary files stay `null` rather than
  flattening to 0 — `-`/`-` means "not expressible in lines", and summing it as zero would drop a
  40MB asset from the table while claiming it never moved.

**Health counts stale-by-age and already-merged separately**, because they answer different
questions — "nobody has touched this in three months" and "this is already in the default branch,
so deleting it loses nothing" — and a branch can be either, both or neither. Collapsing them would
bury the actionable case inside the merely quiet one. "Merged into" resolves against `HEAD` rather
than guessing at `main`/`master`, and the current branch is excluded so every repository does not
report at least one deletable branch.

**The cache is keyed on a digest of every ref tip, not on HEAD.** The traversal is `--all`, so a
`git fetch` that moves `origin/main` changes the contributor table while HEAD stands perfectly
still — and a HEAD-keyed cache would serve the pre-fetch answer indefinitely. That failure is
invisible: the numbers look entirely plausible, they are just from before. A TTL sits alongside
the digest for the two things refs cannot see, a `git gc` changing the size figure and the passage
of time turning a fresh branch stale. Clock and ref-reader are injected, so the whole module stays
`electron`-free and runs under bare vitest.

`mstudio:stats:summary` takes a **`repoId` only**, never a path — main resolves the checkout through
`resolveWorkdir`, the same rule `forge-handlers.ts` and the diagnostics channels follow. The row
cap and the timing budget surface as `truncated` in the envelope rather than quietly shortening a
year, so every widget can say "showing the last N" instead of presenting a fragment as the whole.

One naming collision worth recording: `commands/log.ts` already exported a `parseNumstat`, for the
`-z` form. This one is line-oriented and keeps binary counts as null, so it is
`parseNumstatLines` — two parsers for one flag, because they genuinely read different output.

Verification: `moon run :typecheck :lint :test` green (15 tasks). 70 new git-engine tests over the
parsers and aggregators — including the timezone bucketing in three zones, rename paths in both
git spellings, binary `-`/`-` rows, and the cache's ref-digest and LRU behaviour — plus 8 new
shared schema tests. No screenshots: Theme B is engine-only and renders nothing.

## 2026-08-26 — Phase 18 · Theme E — The diagnostics trust boundary, detector registry and runner

Landed on `feature/phase-18-diagnostics` (squash-merged — this repository still has no remote,
so there is no PR link). This is the first place Midnite Git executes a binary that belongs to
the **repository** rather than to us. Every other subprocess in the app is bundled git, a
binary found on the PATH a login shell builds (`gh`, `claude`), or the user's own shell at
their explicit request. `node_modules/.bin/eslint` is none of those: it arrives with the
checkout, and opening a folder to read its history is not consent to run code out of it. So the
policy is **written down**, in a docblock at the top of `main/diagnostics/index.ts`, the same
treatment the fs jail gets in `channels.ts` — rather than left implicit in a commit message.

**The seven rules.** Opt in per repository, never globally. The grant names the exact command.
Main never takes the renderer's word for what to run. Detection proposes, never invents.
Arguments, not a shell. Never on a timer and never on a file change. Fail soft, always.

**Trust is granted to a repo *and* a command together.** `trust-store.ts` records a
`commandFingerprint` — the NUL-joined `[parser, command, ...args]`, NUL for the same reason the
git parsers are — not a boolean. Editing the configured command therefore withdraws the grant,
because the sentence the user agreed to had the old command in it; a grant that survived an edit
would let a repository escalate by rewriting its own config. That makes `command-changed` a
distinct state from `untrusted`: identical to a state machine, completely different to a person.
First per-repo persisted config in the app — every setting before it was global — so `trust.json`
is a map from repoId to a record with room for more than trust. The userData dir is injected, so
the module carries no `electron` import and tests run against a temp dir.

**The detector registry is ecosystem-open and parser-gated.** The obvious shape — "look for
node_modules/.bin/eslint" — is wrong, because a repository opened in this app is as likely to be
Go with a Makefile, a language-agnostic `moon.yml`, dotnet, python, or C++. So a detector is a
pure function with a stable shape and adding Go is one object plus one parser module. The gate is
the honest half: a candidate naming a parser this build cannot read is **dropped**, so a C++ repo
proposes nothing rather than proposing `make lint` whose every run would come back `parse-failed`
— a feature that looks enabled and reports nothing. Candidates are ranked (flat config outranks
`.eslintrc`, because eslint 9 reads it in preference) and carry the `evidence` that made the
detector fire, so the trust prompt can say *why* a command is offered.

**The eslint parser streams.** One top-level array element at a time, so peak memory is bounded
by the largest single file result rather than by the payload — a checkout mid-refactor can emit
tens of megabytes for a result we reduce to two integers and a few hundred rows. Total about
messages (an unknown severity is dropped, never promoted) but **strict about the array**: output
that does not begin with `[` is `parse-failed`, not an empty success. That distinction is the
point — a command that errored must never be indistinguishable from a clean repository. Counts
are always complete; rows cap at `DIAGNOSTICS_ROW_CAP` (500) with a `withheld` count, and the cap
**favours errors**, because file-order truncation would let ten thousand warnings in one file
bury every error in the repo.

**The runner spawns an argument vector with no shell anywhere**, on a deadline enforced by a
SIGKILL timer (a wedged linter is precisely the process that ignores a polite signal), with
`NO_COLOR=1` and stdin `ignore` so a tool that decides to prompt gets EOF. It **ignores the exit
code** when the report parsed: eslint exits 1 whenever it found a single error, which is the
normal case here, and reading the code would make a repo with problems report nothing at all.

`diag-handlers.ts` is the enforcement point: `run` refuses without a live grant, and `trust` only
records commands main itself proposed — re-derived from detection, compared by fingerprint. Self
review moved that check into `isProposedCommand` as a pure function, because it was the most
security-relevant line in the diff and living inside an electron-importing handler made it
untestable; six cases now cover the ways a renderer could try to widen a grant.

Contract: `mstudio:diag:{trust-status,trust,untrust,detect,run}`, each taking a **`repoId` only** —
the working directory comes from `resolveWorkdir` and the command from main's own store. Reason
codes `no-command | untrusted | not-installed | timed-out | parse-failed`, all fail-soft; nothing
throws across the boundary. The renderer caches results via react-query with `staleTime: Infinity`
and no automatic refetch — main stays stateless, because a lint result read from disk at boot
describes a working tree that has since changed, and would be stated with the same confidence as
a fresh one.

Verified end to end against this repository's own eslint: the detector found `eslint.config.mjs`
plus the local binary, the runner streamed, and the parser returned three real errors with
repo-relative paths. 53 new tests (trust-store 14, detect 16, parse-eslint 19, runner 10),
`moon run :typecheck :lint :test` green at 961 across four packages.

**Known limitation, deliberate:** the channels take a `repoId`, and `resolveWorkdir(repoId)` with
no worktree argument resolves the **main** worktree. A linked worktree selected in the sidebar
will therefore be linted in the main checkout. This is what the phase doc specifies; widening it
to an optional, `git worktree list`-validated `worktreePath` is a small follow-up rather than a
redesign, and is noted for Theme F to raise.

## 2026-08-26 — Phase 16 · manual verification — Phase 16 complete

The two real-app passes the phase had been holding open were run by the user and both pass:
browsing this repository (ignored entries dimmed, `node_modules` costing nothing until expanded,
`.ts` highlighting, `README.md` rendering with a working source toggle, a png/mp4/pdf displaying
in-pane, the >1.5 MB and binary fallback cards, and nothing anywhere offering to edit); and the
Agent page (the `~/.claude` tree, the real installed version, Update streaming to completion, and
Uninstall pasting into the terminal **without** executing). Phase 16 is now 36/36 and ✅ DONE —
its five themes had already landed on 2026-08-26.

## 2026-08-26 — Phase 18 · Themes A + B + C + D — The footer's right half becomes a live system monitor

Landed on `feature/phase-18-monitor` (squash-merged — this repository still has no remote, so
there is no PR link). The footer bar had looked the same since Phase 9: 24px of `border-t
bg-card/50` holding a terminal toggle, a branch name, ahead/behind arrows and a changed count —
every one of them a left-aligned flex child under a single `gap-3`, with no `ml-auto` anywhere,
so the entire right half was empty. It now carries CPU, RAM, GPU and disk as a coloured dot, a
percentage and a sparkline, opening into a flyout of area-chart timelines. E and F (the
diagnostics segment and its trust boundary) are untouched.

**Theme A — four probes in main, each a pure parser behind a thin `execFile`.**

- `cpu.ts` — `os.cpus()` reports **cumulative counters since boot**, so a single read says nothing
  about now; usage only exists as `1 - idleDelta/totalDelta` between two snapshots. The first call
  returns `undefined` rather than a fabricated zero, and a counter that went backwards (a sleep,
  a changed core set) is `undefined` too — a difference that is not a rate.
- `memory.ts` — **not `os.freemem()`**, which on macOS counts the file cache as free and reads
  99% used on an idle 32 GB machine. Activity Monitor's own sum instead:
  `max(anonymous - purgeable, 0) + wired + compressed`, over `/usr/bin/vm_stat`. The page size is
  read from the `page size of (\d+) bytes` header rather than assumed — Apple Silicon uses 16 KiB
  pages, so a hardcoded 4096 under-reports by exactly 4×. Any parse failure degrades to
  `os.freemem()` rather than reporting nothing.
- `gpu.ts` — `/usr/sbin/ioreg -c IOAccelerator` matched for `"Device Utilization %"`, the same
  counter Activity Monitor graphs, and deliberately **not** `powermetrics`, which needs sudo. Takes
  the busiest accelerator rather than the first in registry order. **Self-disables after three
  consecutive failures and logs once**; a single good read clears the streak, so a transient spawn
  failure under load does not retire the probe for the session.
- `disk.ts` — `fs.statfs` capacity, **not throughput**. `bavail` not `bfree`, and denominated
  against `used + available` rather than the raw volume size, so the gauge agrees with the
  percentage printed beside it.

`metrics-service.ts` keeps **one** interval however many `start`s arrive (each cadence change is a
fresh one), `unref()`s it so main can still exit, collapses concurrent probes onto a single
in-flight promise (`ioreg` under load outlasts a 2s tick, and without the guard they stack), and
reads disk once every ten ticks rather than every tick. Sampling stops outright on blur, hide and
minimize. No probe module imports `electron`, so all of it runs under bare vitest.

**Theme B — the contract.** `MetricSample` has **every metric optional**, which is the whole
design: a GPU whose counter cannot be read is *omitted from the payload*, so "not readable here"
and "0%" stay different answers all the way to the chart. A flat zero line is a lie about a
working GPU. Cadence crosses IPC as a **re-sent `start`** rather than its own verb — one channel,
no extra schema, and main clamps the interval rather than trusting it (the floor exists because a
renderer bug asking for 10ms would fork-bomb the machine with `ioreg` spawns).

**Theme C — the store and the drawing.** Points are `{value, at}`, not bare numbers, and the
window is evicted **by time** (five real minutes) rather than by count — a fixed sample count
would silently become 2.5× longer in wall-clock terms whenever the flyout closed. The first
sample seeds a **flat pair** so a new series draws a straight line at its true value instead of
ramping up from an implicit zero, which reads as a load spike that never happened at exactly the
moment someone looked. `metric-path.ts` has no y-scaling pass at all — the 0–100 domain is fixed
by the contract, so two screenshots a minute apart are comparable — and spaces points by index,
with `cadenceBreaks()` finding where the interval changed so the chart marks it with a dashed
rule instead of drawing a 5s gap as though it were a 2s one. Colours are raw HSL triples per the
`lane-colors.ts` policy (metric colours are *data*, with no semantic role; the diagnostics counts
in Theme F are the opposite case and will take tokens), with muted and fill variants derived
rather than hand-tuned twice. Charts are hand-rolled despite `@bilo-io/ui` shipping an unused
`AreaChart`, consistent with the app hand-rolling its tab strip, tooltip and theme toggle.

**Theme D — the cluster and the app's first popover.** `components/popover.tsx` is genuinely new:
`tooltip.tsx` is hover-triggered and `pointer-events-none` so it cannot host a chart, and
`context-menu.tsx` is item-list shaped. It reuses their portal-and-clamp mechanics and adds
click-toggle, a focus trap, outside-click and capture-phase-scroll dismiss, and focus returned to
the trigger on close — extracted as a shared primitive because Theme F's diagnostics flyout and
Phase 17's checks-verdict indicator both want exactly this. The cluster takes **slots** rather
than a fixed list of four metrics, so those arrive as children rather than as a restructuring of
whatever got there first. A metric that is null renders **no readout at all** — no dot, no dash,
no zero. Disk gets a gauge instead of a fourth timeline, because a capacity line is flat for hours
and drawing it as one would imply movement that is not there.

**A latent e2e bug this uncovered.** `mock-bridge.ts` reported `windowChrome.frameless: false`,
which is not what ships on macOS. `AppFrame` only sets `--titlebar-h` when it draws the chrome
itself, and `app.tsx` sizes its content box `calc(100vh - var(--titlebar-h, 0px))` — so with a
framed window the box claimed the full viewport height starting 40px down, and **every spec had
been running against an app whose footer sat entirely below the fold**. Nothing failed, because
`toBeVisible()` asks for a non-empty box rather than one inside the viewport; it only surfaced
when a spec first tried to *click* something down there.

Twelve Playwright specs (including the phase's screenshots) plus 42 unit tests in desktop and 35
in app. `moon run :typecheck :lint :test` green.

**Left open:** the three human passes the phase doc names — cross-checking CPU/RAM/GPU against
Activity Monitor on Apple Silicon, and an hour's idle battery cost confirming the blur pause
really stops the `ioreg` spawns. Also noted while here: `graph-themes.spec.ts` has twelve
pre-existing failures on `main`, unrelated to this phase — its `chooseTheme` helper still reaches
for `getByRole('link', {name: 'Settings'})`, which Phase 16 turned into a bottom-pinned rail
button. Fixing that locator alone makes it worse (twenty failures), because the suite also has
cross-test flake underneath, so it is left for whoever owns Phase 14's specs.

## 2026-08-26 — Phase 12 · Themes C + F — Ref badges as controls, graph row polish

The chip stopped being a label. A branch that is ahead or behind expands on hover into the
buttons that fix it; the checked-out one glows; and the same four verbs appear in its context
menu, rendered from the same derived array so the two surfaces cannot disagree.

### Theme C — ref badges as a control surface

- [x] `features/graph/ref-sync.ts` — `syncActions(ref, currentBranch, remoteNames)` returning
      push/pull/publish/fetch with enablement and reason already resolved; pure + unit-tested
- [x] `isHead` glow: a still halo plus a gradient border sweeping over it (`lane-sweep` keyframe,
      `background-position` on a masked 200%-wide gradient — a conic one re-rasterises per frame)
- [x] Hover-expand strip of `IconButton`s, ↓ pull / ↑ push, with the real counts in the label
- [x] Native `title=` replaced by the `Tooltip` component; upstream state laid out, not crammed
- [x] `refMenu` gains Push / Pull / Fetch / Publish, disabled items carrying their reason
- [x] `useFetch`/`usePull`/`usePush` take an optional `SyncScope {remote, branch}`; the title-bar
      cluster passes none and keeps acting on HEAD
- [x] In-flight state per ref+verb, so one badge spins and the rest stay live
- [x] `e2e/ref-sync.spec.ts` — ten specs over the four upstream states

### Theme F — graph row polish

- [x] Selected row: a bar at the left edge in the row's own lane colour, plus a full-strength
      tint (it was `bg-accent/70` against a `bg-accent/30` hover)
- [x] Lane palette retuned for colour-vision deficiency; `lane-contrast.test.ts` measures it
- [x] `laneInk` flips on measured WCAG contrast rather than on HSL lightness
- [x] Chips cap at 60% of the column when two share it, so the shorter name survives
- [x] Row density (`comfortable`/`compact`) as a second axis, with a Settings picker
- [x] The working copy as the row above the first commit — dashed node, dashed lane, italic count

Landed on `feature/phase-12-land` (squash-merged — this repository still has no remote, so
there is no PR link). The unit gate is green and the Playwright suite runs 137 passed / 4 skipped,
with four new screenshots under `docs/screenshots/phase-12-badges-rows/`.

What this shook out:

- **A palette with a flat lightness profile is inaccessible by construction.** Every lane sat
  inside a 0.63–0.77 band of perceptual lightness. That looks tidy, and it is exactly the
  failure: red–green deficiency collapses hue, so two equally-light lanes have nothing left to
  separate them. Simulated protanopia put violet and indigo 0.0097 apart in OKLab — one colour.
  The retune spreads lightness deliberately; the worst pair under any simulated deficiency is
  now 0.068.
- **`laneInk` was flipping on the wrong axis, and its test agreed with it.** HSL lightness is
  not how light a colour looks: at `l: 48%` the cyan is the brightest thing in the palette and
  was being given white text, while the violet at `l: 57%` got dark ink. The old test restated
  the same `l >= 58` rule, so it passed. Comparing real contrast ratios removes the threshold.
- **An overlay inside the row is clipped, and still passes a visibility assertion.** The
  BRANCH / TAG cell is `overflow-hidden`, so the sync strip was invisible to a user while
  keeping a bounding box — which is all `toBeVisible()` checks. Portalling it to `<body>` fixes
  that and the virtualizer's `transform` stacking context at once, the same pair of traps
  `Tooltip` already documents. The e2e assertion that the subject column does not move on hover
  is what caught it.
- **A portalled strip breaks its own hover.** Moving the pointer from the chip onto the buttons
  fires `mouseleave` with no `mouseenter` on any descendant, because they are not DOM relatives
  — the strip closed as the user reached for it. A 140ms grace period, cancelled by an enter
  anywhere in the group, makes the gap crossable.
- **A flat density multiplier breaks the drawing.** 0.8 across the board put `git-graph`'s
  arriving segment at 3px, under `MIN_ARROW_RUN` — a marker overhanging the row edge above a
  line too short to see. `minRowHeight` derives the floor from the style's own geometry, so
  compression stops where the drawing would break and the existing invariants cover the compact
  styles unchanged.
- **A branch may track a differently-named upstream.** `main` → `origin/trunk` is legal, and
  `PushRequest` carries one `branch`, not a `local:remote` pair — so pushing by name would have
  created `origin/main` beside the `origin/trunk` it meant to update.
- **The e2e port is contended between worktrees, not just against the dev server.** The config's
  dedicated port solved `moon run app:dev`; two `.worktrees/*` checkouts running the suite still
  collide. `MGIT_E2E_PORT` is the escape hatch.
- **`toBeVisible()` ignores opacity.** The first screenshot of the sync strip contained no sync
  strip: the assertion passed mid-`fade-in`.
- **The last Theme F item described polishing something that was never built.** No
  uncommitted-changes pseudo-row existed anywhere in `features/graph/`. It was built rather than
  deferred.

## 2026-08-26 — Phase 12 · Themes A + B — Commit inspector: rendered message, live references, real header

Landed on `feature/phase-12-inspector` (squash-merged — this repository still has no remote, so
there is no PR link). Phase 5 shipped the commit detail pane as an explicit stub: `%B` dumped
into a `whitespace-pre-wrap` div, a flat file list, and a `<pre>` of `git show --stat` repeating
the very numbers the list beside it already showed. This makes it the thing you actually read a
commit in.

**Theme A** renders the message as markdown (`react-markdown` + `remark-gfm`, deliberately **no**
`rehype-raw` — raw HTML in a commit message stays inert text, which removes the sanitisation
problem rather than solving it) and then linkifies references in the resulting text nodes. Two
passes in that order, because at the hast stage a code span is a real `code` element: "don't
linkify inside a fence" becomes an ancestor test rather than a lookaround in a regex. The matcher
is a pure `segment(text): Segment[]` with no React and no hast in it, and the plugin beside it
knows nothing about the grammar.

Three matcher decisions are load-bearing and each has a test:

- **URL wins the alternation.** `https://github.com/o/r/commit/7c521fed00d` contains a valid
  abbreviated sha and an issue-shaped fragment; with SHA first it shreds into three links, one of
  which navigates the inspector somewhere unrelated.
- **An abbreviation must contain both a digit and a hex letter.** `deadbeef`, `facade`, `decade`
  and `defaced` are pure hex and pure English; `12345678` is a record count. About 3.7% of genuine
  7-character shas are pure digits and 0.14% pure letters, and that is still the right trade — a
  missed link renders as the text the author typed, while a false one is a control that navigates
  to an unrelated commit, or to nothing.
- **`#\d{1,7}` needs its trailing `(?!\d)`.** Without it the quantifier takes the first seven
  digits of `#12345678` and links `#1234567`, orphaning the `8` — a link to a real but entirely
  unrelated issue, which is worse than no link.

`#123` resolves through Theme E's `pickForgeRemote`; a repo with no forge remote renders it as
plain text rather than inventing a URL that 404s. Trailers (`Co-Authored-By:` and friends) are
split off the message tail by a pure `splitTrailers` implementing git's rules more strictly than
git does — every line in the block must be a trailer or a continuation, because the cost of being
loose is a real final paragraph restyled as metadata and detached from the message it belongs to.
Trailer values are linkified WITHOUT a markdown pass: `<s@example.com>` is an address in angle
brackets, which markdown reads as a tag and swallows.

**Theme B** rebuilds the panel: the full sha with a copy button, author and committer identities
(the committer row only when the name **or** the email differs — a squash-merge keeps the address
and changes the name), relative dates with the absolute in a tooltip, parents as clickable short
shas labelled `parent 1` / `parent 2` on a merge, a tree ⇄ list toggle persisted in the ui-store,
and a draggable split between the file list and the diff. The tree is built by a pure
`buildFileTree` that collapses single-child directory chains on the way *up* (`packages/desktop/src/main`
is one row, and whether it collapses is only knowable once its children are final) and rolls
subtree totals into every directory row, so collapsing does not hide the number you collapsed in
order to compare. The list view sorts by change size descending — a 4000-line lockfile churn and
a two-line fix are indistinguishable in a path-sorted tree.

Three contract changes came with it:

- **`CommitDetailResponse` gains `parents`, `subject`, `author` and `committer`, and loses
  `stat`** — and with `stat` goes one of the three `git show` invocations per selection. One
  NUL-separated `--pretty=format:` record now carries everything, with `%B` deliberately last so
  surplus tokens rejoin into the body rather than truncating it.
- **`readCommitDetail` returns null** for a sha this repo does not have, instead of the
  empty-but-well-formed record it used to, which conflated "that repo is closed" with "no such
  commit" and rendered both as a commit with no message, no author and no files.
- **A new `mstudio:repo:rev-parse` channel** resolves an abbreviation *before* it becomes a
  selection. A 7-char sha reaches `git show` fine, but the selection is also what the graph
  highlights and what the diff key is built from, and neither works with an abbreviation.

Clipboard goes through a new `mstudio:clipboard:write-text` channel rather than
`navigator.clipboard`: the packaged app loads the renderer from `file://`, which is not
guaranteed to be a secure context, and the Async Clipboard API is gated on one — so the web API
is the one path that would work under the dev server and fail silently in the shipped dmg. The
button's checkmark is shown only on a confirmed write.

Beyond the plan, reviewing the diff turned up four real defects, each now pinned by a test:

- **Opacity is about ancestry, not parentage.** `unist-util-visit` hands a visitor only the
  immediate parent, so `a > strong > text` — what a markdown link with a bold label produces —
  passed the `code`/`pre`/`a` check and was linkified inside the anchor. The result is a control
  nested in a link: one click fires both, so `[**deadbeef1**](https://evil.example)` in a commit
  message would select a commit *and* open the URL. Replaced with an explicit walk carrying an
  inherited flag, which also dropped the dependency.
- **Resetting selection in an effect is one render too late.** The render that first observed a
  new sha still held the previous commit's path and issued a real `git diff` for it — cached under
  `staleTime: Infinity`. The same shape, and the same fix, as `useContextReset` in
  `use-file-diff.ts`. (Theme D hit this exact bug once already.)
- **Absolute pixel bounds cannot know how tall the window is.** A 720px file list in a short
  window collapsed both the message above and the diff below to nothing — and, being persisted,
  stayed collapsed across restarts with only a zero-height handle left to drag back.
- **react-markdown keys its element map by component identity.** `components={{ button:
  shaButton(onSelectSha) }}` built inline remounts every sha button on every render, dropping
  keyboard focus to `<body>`.

`CommitDetailRequest.sha` is now hex-validated like `RevParseRequest` and `git show` takes
`--end-of-options`: `git show` accepts diff options, and `--output=<file>` alone is an arbitrary
file write. No caller could reach it — the linkifier's output is hex by construction — but one
of the two rev-taking channels being guarded and the other not is an asymmetry one refactor away
from mattering.

Phase 16's markdown preview picked up the shared prose classes and live links on the way past:
its links were inert only because `shell:open-external` did not exist when it was written, and
Theme E had already landed by the time it did.

70 new tests (22 matcher, 10 plugin, 14 file tree, 12 trailers, 7 detail record, plus git-engine
integration for merges, root commits, unknown shas and tag peeling) and 18 new Playwright specs;
51 e2e green. `moon run :typecheck :lint :test` green.

Not in this slice: Themes C (ref badges as controls) and F (graph row polish), which landed
the same day — see the entry above.

## 2026-08-26 — Phase 16 · Themes A–E — Folder explorer, preview pane, settings pages

The app grows real pages, in one branch (`feature/phase-16-explorer-settings`, squash-merged —
no remote/PR yet). A new **Folder** view above Graph browses the active checkout as a lazy tree
(dotfiles shown, gitignored entries dimmed via one batched NUL-delimited `check-ignore` per
listing, `node_modules` costing nothing until opened) with a strictly read-only preview pane:
shiki-highlighted code (github-dark/light synced to the app theme, grammars lazy-loaded
per-extension, a 200 KB highlight cap so a minified bundle can't freeze the render thread),
markdown rendered through `react-markdown`+`remark-gfm` with a source ⇄ rendered toggle and
deliberately inert links, and images/video/audio/PDF streaming straight off a new jailed
`mstudio-file://` protocol — media bytes never cross IPC.

Underneath: the first arbitrary-fs IPC in the app, `mstudio:fs:list-dir` / `mstudio:fs:read-file`,
scoped requests only (`repo` via `resolveWorkdir`, `claude-home` for `~/.claude`) with a
two-stage path jail — pure `joinWithin` (traversal/absolute/NUL) plus `realpath` confinement
(symlink escapes) — that fails closed everywhere, crafted percent-encoding included. No write
channel exists; "can't edit yet" is the contract, not the UI.

Settings moved to the **bottom of the nav rail** (the shell's `footer` slot) and split into four
pages behind an inner sidebar — Appearance and Graph moved one-to-one, **Terminal** hosts the
sidebar-side toggle and the agent roster, and **Agent** peeks into `~/.claude` (tree + preview),
probes `claude --version` through a login shell (`-lic`, banner-proof parsing, best-effort
npm/brew/native detection) and offers the hybrid actions: **Update** runs in main with output
streamed over `agent:claude-update-data`; **Uninstall** opens the terminal with the
method-matched command pasted and *no newline* — Enter is the confirmation, consumed once so a
revived session never re-types it.

25 new tests (jail table-tests, NUL round-trip `check-ignore` integration, claude parsers,
language map, ui-store persistence) plus 7 new Playwright specs; 45 e2e green. Still open in the
phase doc: the two real-app manual verification passes (media/PDF in the packaged renderer).

Nothing in the repo modelled a git remote: no domain type, and no command ever read
`.git/config`. Theme A's `#123` links need one, and so does every "open this on the forge" verb
that follows it. `Remote {name, fetchUrl, pushUrl, forge}` now ships from main with the URL
already normalised, alongside `pickForgeRemote` (origin first, then the first remote that
resolves to a known forge) and the GitHub/GitLab project and issue URL builders.

- [x] `shared/src/domain/remote.ts` — `Remote` + a derived `forge {host, owner, repo, kind}`
- [x] `git-engine/src/commands/remotes.ts` — `listRemotes` via `git config -z --get-regexp`
- [x] URL normaliser, pure + unit-tested: scp-like, `ssh://`, `https://`, `git://`, self-hosted
      GitLab subgroups; unknown hosts degrade to `kind: 'unknown'` and do not linkify
- [x] Issue-URL builder — GitHub `/issues/{n}`, GitLab `/-/issues/{n}`
- [x] Channels `mstudio:remotes:list` and `mstudio:shell:open-external`, the latter protocol-restricted
- [x] `remotes` + `shell` on the bridge and the preload `Pick<>`; `ipc.test.ts` extended

Beyond the checklist: a `useRemotes` hook keyed under `keys.repo` and one visible consumer, so
the slice is exercised rather than dormant until Theme A — each Remotes group in the sidebar
gains a link to its project page, absent (not disabled) for a remote that has none.

429 tests green plus 44 Playwright specs.

What this shook out:

- **`git remote -v` is the wrong command.** Its output is whitespace-delimited with a
  parenthesised suffix, a URL may legally contain a space, and it has no `-z`. `git config -z
  --get-regexp` frames records as `key\nvalue\0`, which is the NUL-delimited form the rest of
  the engine already assumes. It also reads `pushurl` in the same pass — git's own rule is that
  it falls back to `url`, and resolving that once in the engine beats every reader remembering
  it.
- **`new URL()` silently mangles the scp-like syntax.** `git@github.com:o/r.git` parses as
  protocol `git@github.com:` with the whole path opaque, so the host disappears — and that is
  the exact form git prints for a GitHub SSH remote. It is matched ahead of `URL`, not after.
- **A remote name may contain dots.** `remote.my.fork.url` split on `.` yields the name `my`.
- **`github.com.evil.example` classified as GitHub.** It carries the leading `github.` label the
  self-hosted heuristic keys on, so the suffix check never saw it — and the test that claimed to
  cover this only asserted the easier `notgithub.com` shape. A host embedding the canonical
  domain as a prefix is now excluded explicitly, and a trailing FQDN dot is stripped first.
- **`decodeURIComponent` throws on a malformed percent-escape**, and `%` is legal in a
  repository name. The throw escaped `listRemotes` and rejected the whole IPC call, so one
  oddly-named repo would have cost every remote in that repository its link.
- **A schema refine is not a security boundary on its own.** `shell.openExternal` hands a scheme
  to the OS's registered handler, so an unfiltered `file://` opens Finder on an arbitrary path.
  The allow-list is enforced in the schema AND re-checked on the line that makes the call — and
  main opens the *normalised* href, because the URL parser strips leading control characters, so
  `\njavascript:` and `javascript:` validate identically and only one of them is the string the
  OS would otherwise have received.

## 2026-08-25 — Phase 12 · Theme D — Real diff rendering

`readFileDiff` and the new `readCommitFileDiff` return a parsed `FileDiff` — hunks, per-line
old/new numbers, word-level intraline ranges — instead of patch text, so the renderer paints
geometry rather than tokenising on the render thread. New `mstudio:commit:file-diff` channel (kept
separate from `mstudio:file:diff`, where `staged` is meaningless against a sha), a hunk parser in
git-engine, and one `<DiffView>` serving both the status panel and the commit inspector: rows
virtualised, low-alpha row tint with the saturated colour on a 2px gutter bar, both line-number
columns behind a persisted toggle, context expansion as a refetch at a wider `-U`, and an honest
"N more lines not shown" past the cap. The inspector's `git show --stat` block is gone — it
repeated the file list's own numbers as preformatted text; that space now shows the diff.

372 tests green (`moon run :typecheck :lint :test`) plus 8 Playwright specs under
`moon run app:e2e` — the repo's first renderer-level test harness, driving the real app against a
mocked `window.midniteStudio`.

What this shook out — mostly a family of cases where the pane rendered something plausible that
was not the file in front of you, which is the failure a diff viewer can least afford because
nothing about it looks wrong. Each is now covered by a regression test:

- **A pathspec is applied before rename detection**, so `git diff -M -- new-name` sees only the
  addition and reports a brand-new file with every line green. Both diff requests gained an
  `oldPath`; it comes from `StatusEntry.origPath` in the status panel, and in the inspector from
  the rename token `parseNumstat` had been reading and discarding.
- **`git show` prints no diff at all for a merge commit** — a merge has no single pre-image, so
  git declines to guess. `-m --first-parent` is what makes a merge's files inspectable.
- **A diff body line can be indistinguishable from a file header.** A deleted `-- comment` reads
  `--- comment` in the patch; parsing headers anywhere but before the first hunk dropped the line
  from the diff entirely, under-counted the deletion, clobbered `oldPath`, and shifted every
  following old-side line number by one. Found in self-review, not by the original tests.
- **`git diff` on an unmerged path emits a combined diff** (`@@@ -1,3 -1,3 +1,7 @@@`, one marker
  column per parent), which an `^@@ -`-anchored parser skips whole — so mid-merge the one file
  you most need to see said "No changes to show for this file." The parser reads N-parent headers
  now and flags `combined`, and the view states that the old numbers are the first parent's.
- **A pathspec is glob-matched**, so `pages/[id].tsx` is a character class that matches
  `pages/i.tsx` — the pane rendered a *different file's* content under the requested name.
  `--literal-pathspecs` fixes it, and it is a MAIN git option: as a subcommand flag it exits 255,
  which reads downstream as an empty diff rather than as an error.
- **"Empty output and not staged" does not mean "untracked."** A tracked file with nothing
  unstaged looks identical, and the `/dev/null` fallback painted it entirely green. Settled with
  `ls-files --error-unmatch`.
- **A query key outside the invalidation prefix is never refreshed.** The diff key sat at
  `['diff', …]` rather than under `keys.status`, and with the client's `staleTime: Infinity` the
  pane held its first-loaded hunks for the life of the process — through edits, stages, discards.
- **State reset in an effect lands one render late.** The context reset ran after the render that
  had already issued its query, so the click after "show the whole file" fetched the *next* file
  in full — precisely what the reset exists to prevent. It adjusts during render now.
- **The Vite dev port is contended across worktrees.** Playwright's `reuseExistingServer` attached
  to whichever server reached 5173 first, running the suite against another checkout's source
  while looking entirely healthy. The e2e config owns its own port.

Deferred to `outstanding.md`: syntax highlighting inside diff lines, side-by-side mode.

## 2026-08-25 — Phase 0 · Scaffold

proto/moon/pnpm workspace skeleton with four packages (`shared`, `git-engine`, `app`,
`desktop`), eslint 9 flat config carrying the dependency-boundary rules as per-package
`no-restricted-imports` groups, and `@bilo-io/ui@0.1.0` + `@bilo-io/shell@0.1.0` installed from
GitHub Packages (registry auth proven). `moon run :typecheck :lint :test :build` green; single
`react@19.2.8` in the store. Boundary rules negative-tested (probe files importing `electron`
from `app/src` and `git-engine/src` both fail lint).

## 2026-08-25 — Phase 1 · Shared contracts + git-engine exec/parsers

`shared` now carries the whole wire contract (domain zod schemas, `mstudio:*` channel constants, IPC
payload schemas, the `MidniteStudioBridge` type, the CommandId registry + default keymap), and
`git-engine` reads a real repository: dugite exec with env hygiene, the per-repo write queue, four
NUL-delimited parsers, and `log`/`status`/`refs`/`worktrees` commands including an incremental
`streamLog`. 93 tests green — 47 parser unit tests against fixture strings plus 21 integration
tests that build throwaway repos with real git (renames, conflicts, detached HEAD, unborn repo,
linked worktrees, upstream ahead/behind). `scripts/smoke.ts` parses ~/Dev/midnite — 4 worktrees,
200 refs, 2000 commits in 156ms.

## 2026-08-25 — Phase 2 · Lane layout engine

`LaneLayoutSession.push(commits) → GraphRow[]`: a single forward pass over `--topo-order` output
assigning straight branch lanes with left-first lane recycling, and sha-derived colours so a
branch keeps its colour across refreshes. Streaming-safe — batched layout is byte-identical to a
one-shot pass. 28 unit tests (linear, single merge, octopus, criss-cross, orphan roots, multiple
children, truncated history, degenerate input) plus structural invariants and an inline snapshot.
`smoke.ts` renders the lanes as ASCII next to `git log --graph` and they match row for row on
~/Dev/midnite.

## 2026-08-25 — Phase 3 · Electron shell boots

Frameless macOS window rendering the Vite app inside `@bilo-io/shell`'s `AppFrame`, with a working
`TitleBar` bound to a typed `windowChrome` bridge, the login-shell PATH fix, a native menu that
dispatches CommandIds, and the design tokens driving light/dark. Verified with three in-app
screenshots: dark, light (tokens flip), and fullscreen (traffic-light clearance collapses from
112px to 20px, proving `onFullscreenChange` round-trips). Tailwind's library content globs
verified by asserting 21 shell-only utility classes are present in the generated CSS.

## 2026-08-25 — Phase 4 · Repo open/list + worktree sidebar

A repo registry in main that resolves any path inside a repository — root, subdirectory, or linked
worktree — to one entry, so opening a worktree nests it under its owner instead of adding a
duplicate top-level repo. Paths (only paths) persist to `userData/repos.json`; everything else is
re-read from git at open time. VS Code-style sidebar with nested worktrees, native folder picker,
and worktree removal that never passes `--force`. Verified against `~/Dev/midnite` and its real
worktrees, including a restart. 40 new tests.

## 2026-08-25 — Phase 5 · Commit graph, read-only

Streaming log service in main (parse + lane-layout incrementally, 500-row batches, cancellation
by `requestId`) feeding a virtualized SVG-per-row graph: coloured lanes with merge curves, ref
badges joined by sha with ahead/behind, subject/author/date columns, and a commit detail pane.
On `~/Dev/midnite` (2,376 commits) 56 DOM rows are live, scrolling holds a median 8.3ms frame,
and switching repos mid-stream carries zero rows across.

## 2026-08-25 — Phase 6 · Status / stage / commit / sync

Stage, unstage, discard, commit, fetch, pull and push in the engine — all through the write queue,
all with explicit paths, and none of them with a force-push escape hatch — plus a VS Code-style
changes panel: ahead/behind chips with Fetch/Pull/Publish, staged and unstaged lists (a partially
staged file correctly appears in both), a commit box, and a unified-diff text pane. Verified by
committing through the UI on a scratch repo and checking `git log`. 130 engine tests green,
including a push/fetch/pull round trip and a conflicting pull against a real bare remote.

## 2026-08-25 — Phase 7 · Graph interactions

Checkout, branch create/rename/delete, tag create and reset in the engine, each with git's
refusals translated into a sentence that says what to do; renderer-drawn context menus on commit
rows and ref badges; double-click a badge to check it out; and a confirmation dialog that shows
the real blast radius. The count excludes commits any other ref still holds — the naive
`to..from` range overstated it, which is how safety dialogs become noise. 157 engine tests green.

## 2026-08-25 — Phase 8 · Drag-drop ops + conflicts

merge/rebase/cherry-pick plus a sequencer that detects in-progress state and exposes abort and
continue, all returning conflicts as the `GitOpResult` conflict arm rather than throwing.
@dnd-kit gestures on the graph: drag a branch badge onto another to get a merge/rebase choice,
drag a commit onto a branch to cherry-pick. An always-visible conflict banner lists the unmerged
files, disables Continue until they are resolved, and never disables Abort. 173 engine tests.

Also fixed a build-graph bug found here: `desktop:typecheck` could pass against a stale
`git-engine` API because moon hashed only the task's own inputs.

## 2026-08-25 — Phase 9 · Integrated terminal + keybindings

node-pty in the main process (lazy, fail-soft, login shell, cwd = the selected worktree) behind an
xterm panel that defers `open()` until its container is measurable; a CommandId dispatcher shared
by the key handler and the native menu, with an xterm escape allow-list derived from the keymap's
`global` scope; and a footer bar with the toggle, branch, ahead/behind and change count. Verified
with real OS-level key events: `Ctrl+\`` opens from cold and closes again with the terminal
focused, and `git status --short` inside the shell agrees with the footer.

## 2026-08-25 — Phase 10 · Watcher / live refresh

`fs.watch` on the narrow set of git paths plus the working tree, classified into
refs/head/index/worktree, debounced at 200ms, with own-write suppression driven by the write
queue so the app's own commits don't loop back as external changes. The renderer maps each kind
to the narrowest correct refresh. Verified live: committing from the integrated terminal adds the
row to the graph, and `git checkout -b` outside the app makes the badge appear.

The mapping had a real bug worth remembering: `refs` events were treated as badge-only, which
meant a commit — the commonest ref event there is — never appeared in the graph.

## 2026-08-25 — Phase 11 · Packaging + docs

macOS arm64 dmg + zip via electron-builder, with main and preload bundled by esbuild so
electron-builder never has to walk pnpm's workspace symlinks; dugite's bundled git and node-pty
unpacked from the asar; an afterPack hook that restores +x on 197 executables, prunes dangling
symlinks and ad-hoc signs; `install-local` using `ditto`. CI runs the gate on every PR and
packages on main. README rewritten around what the app does and the decisions behind it.

Verified on the installed app launched with a bare `env -i` PATH: the graph renders (bundled git
works from `app.asar.unpacked`) and the terminal runs the user's real zsh (node-pty plus the
login-shell PATH fix).

## 2026-08-25 — Final end-to-end verification

Against the installed `/Applications/midnite-git.app`, launched with `env -i` and
`PATH=/usr/bin:/bin:/usr/sbin:/sbin` (what a Finder launch actually gets), opening the real
`~/Dev/midnite`:

- 2 repositories, 3 linked worktrees nested under their owner
- 2,376 commits streamed, lanes and ref badges rendered
- Full-graph scroll (61,776px): median frame **8.3ms**, 1 frame over 16.7ms in 120
- Integrated terminal runs the user's own zsh in the selected worktree
- A commit made in that terminal appears in the graph without a refresh

Screenshot: [`docs/screenshots/midnite-git.png`](../docs/screenshots/midnite-git.png).

## 2026-08-25 — Brand assets from the midnite app

The crescent mark and the Quick Kiss wordmark face are now the midnite app's own files rather than
placeholders: `resources/icon.icns` + `icon.png` become the macOS app icon, `logo.PNG` is the
in-app mark, and `quick-kiss.ttf` sets the wordmark. Same product family, same logo — an
approximation reads worse than none.

Worth knowing: the mark is an **opaque** disc (a black crescent on a white ground, transparent
only outside the circle). A CSS mask reads only the alpha channel, so masking it flattens it to a
featureless dot — it has to be an `<img>`, in the rounded-coin-with-a-hairline-ring treatment
midnite itself uses, which is also what makes one asset work on both themes.

## 2026-08-25 — Phase 13 · UI polish

Resizable panels (sidebar, terminal, commit detail, changes list) with geometry persisted in
`midnite-studio.ui`; a full per-repo ref tree (Branches · Remotes · Tags · Worktrees) replacing the
worktree-only sidebar, with `FolderGit2` distinguishing a checkout from a branch; a lockable nav
rail; the theme toggle and an icon-only fetch/pull/push cluster moved into the title bar (with a
framed-window fallback, since `<TitleBar>` renders nothing off darwin); graph column headers with
resizable Author/Date/SHA driven by CSS custom properties so the memoised rows never re-render
during a drag; and a multi-select branch filter that re-runs the log stream server-side —
`LogOptions.revisions` already existed in the engine, only `log-service` hard-coded `--all`. Every
Unicode glyph is now a lucide icon, and motion is a two-keyframe vocabulary disarmed by
`applyMotion` under `prefers-reduced-motion`. Three CommandIds (`sync.fetch/pull/push`) that had
been declared with chords and menu items since Phase 9 finally have handlers. 304 tests green.
**Not verified visually** — Electron cannot reach the macOS window server from the agent's shell,
so the manual smoke and the screenshot are outstanding.


## 2026-08-25 — Sidebar: flush delimiters, collapsible sections, and a smoke run that works

Two fixes to the Phase 13 sidebar, plus the visual verification that phase had left open.

Each repo `<section>` carried `py-0.5` *and* `mt-0.5 … pt-1.5`, which put ~6px under the
delimiter against ~4px above it, so a selected repo's highlight floated clear of the rule above
it. The rule now carries no padding of its own — the repo row and the tree below it already have
theirs. Every subsection folds independently (Local · Remotes · Tags · Worktrees), state held as
the set of *closed* keys so a section defaults open, and `TreeSection` swapped its boolean
`indent` for a `depth` so each nesting level's heading indents left of its own rows. "Branches"
became **Local**: the section under it is branches too, and the old heading left the reader to
work out which was which.

Worth knowing: `moon run desktop:start` was never blocked by the macOS window server, which is
what Phase 13 recorded. It exits ~700ms with no output because `app.requestSingleInstanceLock()`
hands the launch to the packaged app in /Applications and quits — silently, by design. The lock
is keyed on `userData`, so `electron . --user-data-dir=<tmp>` runs a dev instance alongside the
installed one. With that plus `MGIT_OPEN_REPOS` and the `MGIT_CAPTURE` harness already in
`main/capture.ts`, the sidebar was screenshotted expanded and folded without touching the
user's running app — closing Phase 13's last two verification items.
## 2026-08-25 — Phase 14 · Graph themes, avatars, author filter

Four selectable graph styles (`git-graph` with solid nodes and arrowheads, `git-extensions`,
`sourcetree`, `gitkraken`) driven by a `GraphTheme` descriptor — git-engine untouched, since
lane assignment is already a pure function of history and a style only decides how lanes are
drawn. Gravatar avatars inside every commit node, hashed with SHA-256 via `crypto.subtle`
(no MD5 dependency), deduped by email so twelve authors across 50 000 commits is twelve
requests, with generated initials as both the first-paint and the failure state. The avatar
retires the Author column; name/email/date moved to a tooltip on the bubble. Ref chips moved
into a dedicated BRANCH / TAG column. An author filter that dims rather than removes —
`git log --author` omits commits without rewriting `%P`, which would leave the lane engine
holding a lane open per filtered-out parent. And Settings finally exists: a style picker that
draws the same synthetic history four ways, plus the shell's appearance runtime (seven
appliers and a 500-line stylesheet shipped since Phase 0 and never called). Playwright covers
it against a stubbed Gravatar. 422 unit tests + 10 e2e green. **Outstanding:** the ref-chip drag gesture
(Phase 8's merge/rebase) has no test and needs a human in the real app.

## 2026-08-25 — Phase 14 verification: the ref-chip drag gesture, under a real pointer

Closes the one item Phase 14 landed without: whether Phase 8's drag gestures survived the ref
chips moving into the BRANCH / TAG column. They did — `useRefDnd` is wired from `graph-row.tsx`,
so the wiring travelled with the chips — but nothing in the markup says so, which is why the
item was left for a human. `e2e/ref-drag.spec.ts` now drives merge, rebase and cherry-pick with
a real pointer through the Playwright mock bridge, and the mock's `ops` proxy records its calls
so each assertion lands on the *operation*, not just on a menu label: choosing "Merge X into Y"
has to reach `ops.merge({source: X})`. The guard cases come with it — a tag is neither a drag
source nor a drop target, a branch dropped on itself is a no-op, and a drop onto a branch that
is not checked out shows both items disabled with the reason attached. 8 tests, plus
`docs/screenshots/phase-14/drop-menu.png`.

Two things bit while writing it, both worth knowing before touching a dnd-kit test again.
**dnd-kit eats the click that trails a drag for 50ms** — `AbstractPointerSensor` adds a
document-level capture listener that `stopPropagation()`s `click` on activation and only tears
it down on a 50ms timeout. A human never meets it; a synthetic click lands inside the window
and dies before React's delegated listener sees it, so the menu item looks stone dead while a
DOM-level `.click()` on the same button works perfectly. **And `rectIntersection` collides the
DragOverlay's rect, not the dragged element's** — the overlay pill is sized by the text it
carries, so the first version of this spec dropped a commit on `main` and was offered a
cherry-pick onto `feature/drag-me` one row above. The fixture keeps ref-less rows around every
drop target now; that spacing is load-bearing.

445 unit tests + 26 e2e green.

## 2026-08-25 — Sidebar: per-repo sync, primary-checkout switching, status dots

The repository headers grew the sync control that only the title bar had: `↑n ↓n` plus
fetch / pull / push per repo, acting on **that** repo's primary checkout whether or not it is the
selected one. Which needed two generalisations rather than a copy — `useRepoStatus(target)` and
`useTargetedGitOp(target, …)`, with `useStatus`/`useGitOp` now the selected-checkout case of each —
and one extraction: `<SyncControls>` and `<AheadBehind>` are shared with the title bar, so the two
places cannot disagree about when Push is live.

When a button is live and when it is not is now a pure function, `syncAffordances(branch)`, and
every disabled state carries a reason. That forced a fix in `IconButton`: a real `disabled`
attribute suppresses mouse events in every engine, so the one state most in need of explaining was
the only one that could not raise a tooltip. With a `disabledReason` it switches to `aria-disabled`,
stays hoverable and swallows the click. The same rules feed the header's ellipsis menu, which
replaces the bare ✕ — Fetch/Pull/Push, a *Switch primary checkout to ▸* submenu, Copy path, and
Close, reachable from the ⋮ or a right-click anywhere on the row.

Switching the primary checkout also lands on the branch rows themselves, on right-click and as a
hover button, with git's own refusal spelled out (`Checked out in <path> — a branch can only be
checked out once`). The sidebar's menus stay non-destructive on purpose: delete and rename remain
on the graph's ref badges behind Phase 7's blast-radius gating. Remote rows offer *Create local
branch from origin/x…* instead of a checkout, because `git checkout origin/x` lands on a detached
HEAD, which is never what clicking a remote branch means.

The checked-out marker is now a `<BranchDot>`: the same dot, with a radial-gradient halo that
breathes (`halo-breathe`, the app's only ambient loop — scale/opacity only, so it stays off the
main thread, and reduced motion freezes it on its final frame) and a red/amber/green level from
`branchHealth()`. Only signals the app can justify get a colour — a paused merge or a conflict is
red, uncommitted changes are amber, a gone upstream is amber — and a clean tree deliberately
reports `unknown` and stays neutral white, because "you have not edited anything" is not a verdict
on the code and a sidebar of green dots would drown a real one. `ChecksVerdict` is the seam a test
run or a GitHub pipeline plugs into (todo/outstanding.md → Branch checks); nothing supplies one
yet, so every branch git has nothing to say about shows no dot at all rather than a green lie.
Worst-signal-wins, which is why the worktree rows carry their own dot for the checkout they name.

Fitting all that on a 256px row cost the header's branch chip while the repo is expanded — the
Local list two rows below names the same branch and marks it live — and the fresh-profile default
sidebar width went to 288. Verified in the app via `--user-data-dir` + `MGIT_OPEN_REPOS`: names
intact, `↑0 ↓0` with both counts dimmed, Pull/Push at `aria-disabled` + `opacity .4` with
`pointer-events: auto`, the submenu listing exactly the branches free to check out, and amber dots
on both dirty checkouts. `moon run :typecheck :lint :test` green, with 16 new unit tests across
`sync-availability` and `branch-health`. **Outstanding:** the light theme's amber was not screenshotted, and no
screenshot can show a pulse.

## 2026-08-25 — Graph: a fifth style, colour-matched ref chips, a usable theme menu

Three follow-ups to Phase 14, one of them a plain bug.

**`classic` — the pre-avatar graph, back as a style.** Phase 14 replaced 26px rows, 14px lanes and
a 3.5px dot with an avatar in every node, and retired the Author column because the face named the
author. That was a change of default, but it read as a change of options: there was no way back to
the denser table. `classic` is the old module constants verbatim — bezier lanes at 1.75px, hollow
merges, no faces — with the Author column returned. Which is why `GraphTheme` grew `node:
'avatar' | 'dot'` rather than a `showAvatars` flag: the column and the node are the same decision
seen twice, so `showsAuthorColumn(theme)` derives from the node and the two incoherent pairings —
a face beside a redundant Author column, a dot graph with the author nowhere — are unrepresentable.
`nodeExtent` branches with it (avatar + ring, or dot + half its stroke), so the lane-spacing
invariants still hold for a style whose `avatarSize` is 0.

**Ref chips take their lane's colour.** A branch name in the BRANCH / TAG column and a coloured
node in the GRAPH column are the same object shown twice, and nothing connected them: every chip
was one of four semantic tints (`primary`, `muted`, `success`) regardless of which branch it named.
They are now the hue of the lane their commit sits on, at two strengths — the checked-out ref
filled solid and semibold, everything else a 14% wash at 0.78 opacity — because a column of
equally-loud chips answers "which branches exist" while the question being asked is "where am I".
Kind moved onto the icon (check / cloud / tag / branch), since kind and identity are independent
facts and spending colour on kind costs the identity colour is there to carry. The chips publish
`--lane-h/s/l` and the stylesheet composes tint, border and ink from them, because the label's
lightness has to flip with the app theme and only the stylesheet knows which one is on.

A **leader line** now runs from the chip to its node, in two halves: a flex-`1` rule to the
column's edge (the chips ahead of it are of unknown width, which is what `flex` solves and a fixed
viewBox cannot) and an SVG line starting at `-ROW_GAP`, crossing the row's gap into the gutter. It
is drawn before the lanes so the verticals stay unbroken — a horizontal rule laid over them chops
history into segments. Commits carrying more refs than the column holds now end in a GitKraken-style
`+N` chip with the rest in its tooltip, instead of a name clipped mid-word.

**The theme menu opened off-screen.** `<ThemeToggle>` from `@bilo-io/ui` anchors its menu
`bottom-0 left-full` — a flyout to the right of the trigger, growing upward. Correct for the
sidenav rail it was written for; in this app the trigger is in the window's top-right corner, so
all four options rendered past the right edge and above the top one: present in the DOM,
unreachable by pointer. The library takes no placement prop, so the app has its own toggle now,
built on the library's `useTheme` and positioned the way `<Tooltip>` and `<ContextMenu>` already
are — measured against the trigger, right-aligned, clamped to the window, and portalled to `<body>`
so no transform or backdrop-filter up the title bar can reinterpret its coordinates.

157 unit tests + 31 Playwright green (`moon run :typecheck :lint :test`, `moon run app:e2e`), with
new coverage for the node/column pairing, the lane-colour helpers, the two chip strengths, the
connector's negative origin, and the theme menu landing inside the viewport.

## 2026-08-25 — Graph: the table lines up, the gutter resizes, the rail lands

Three defects and one addition, all in the graph table's geometry.

**The gutter sat four pixels high.** Its SVG defaulted to `display: inline`, so it
participated in a line box and carried a descender's worth of phantom height beneath it. The row's
`items-center` split that evenly and lifted the whole graphic, leaving every ref chip pointing at a
node slightly below it and every leader line meeting its lane off-centre. `block` on the SVG and
`flex` on the two spans wrapping it. Asserted per style, because the offset came from the row's
font metrics rather than from anything one style could be blamed for.

**The header sat nine pixels right of the rows it labelled**, per resize handle preceding it. A
handle is 5px wide with −2px margins, which is 1px of net width — but it is also an extra item in a
`gap-2` flex row, so it costs a whole additional gap. The rows have no handles, so the two laid out
on different grids and the drift compounded: Graph +9, Commit message +7, Date −9. `ResizeHandle`
now takes the row's `gap` and pulls itself in by half its own width plus that gap, so inserting one
moves neither neighbour. Every column origin now matches the rows to the pixel.

**The gutter is a resizable column.** Dragging it in closes the lanes up and slides the indented
commits left; `Home` takes it to its floor, `End` and a double-click back to the natural fit. Both
bounds are geometry rather than constants, so they are computed per render and handed to
`useGraphColumns`: `max` is `lanes * laneWidth`, and `min` is where the lanes have closed to half a
node — which for a single-lane history is exactly one node wide.

That floor is deliberate. Nodes that merely TOUCH would cap compression at three percent for the
avatar styles, since GitKraken's 30px lane already holds a 29px node; at half a node they overlap
the way a stacked avatar list does, each keeping a visible crescent. To let them, `laneOffset` pins
the outermost lanes a node-radius from the gutter's edges instead of half a lane — identical at a
style's own spacing, so nothing that was never dragged moves, and it turns "lane 0 stays inside the
gutter" from an invariant every new style must be checked against into a structural fact.
`laneWidthForGutter` inverts `gutterWidth` exactly across both regimes, so the handle and the
painted edge stay on the same pixel instead of the graph lagging the pointer.

Lane spacing is the one piece of geometry the row takes as a prop rather than as a custom property,
and it does bust the row's memo on every pointermove of a gutter drag. SVG coordinates are
attributes, not styles, so no variable can reach them; the drag re-renders the ~30 rows the
virtualizer has mounted, not the 50 000 behind them.

**The lane rail.** GitKraken stands a bar in the branch's colour between the graph and the subject,
so the message you are reading is tied to the branch it landed on without your eye travelling back
to the node. Full row height, so a run of commits on one branch reads as one rail rather than a
column of ticks. Only the styles whose node is an avatar: a face says who, not where, while
`classic` already draws the whole lane in that colour a few pixels away.

Along the way the e2e suite stopped asserting on `svg circle`, which had been quietly matching the
hole in a ref chip's tag icon as well as the commit nodes — three tests appeared to cover the
gutter's geometry while measuring an icon. The lane graphic carries `data-graph-gutter` now, and
the assertions that matter — nodes inside their column, the squeeze losing none of them — actually
look at it.

198 unit tests + 38 Playwright green (`moon run :typecheck :lint :test`, `moon run app:e2e`).

## 2026-08-26 — Phase 15 · Verification — and the three defects it found

The point of a verification pass is the things it turns up, and this one turned up three, none of
which the existing suite could have seen.

**Two ptys per terminal.** `start()` guarded on `store.ptyIds[session.id]`, which is only written
once `pty.create` has *resolved*. Two calls in the same tick therefore both saw it empty and both
spawned a shell; the second `bindPty` overwrote the first, orphaning a live process nothing held an
id for — never killed, never listed, invisible except in `ps`. StrictMode's double-invoked mount
effect made it happen for **every terminal opened under the dev server**, which is how the app is
run day to day. The guard now covers the await: `starting` is set synchronously before it, so the
second call bails on the state rather than on a field that does not exist yet.

**Restored sessions revived themselves.** `takeReplay` consumed the transcript on first read, on
the reasoning that a remount would otherwise double it. But a remount builds a *new* xterm with an
empty screen, so replaying into it is right every time — and consuming it meant the second mount
found nothing, came up blank, and, since the auto-start condition was `if (!replay)`, read "no
replay" as "brand new session" and started a shell. Precisely the promise the phase makes
("reopening the app with a dozen of them is free"), broken. Now `peekReplay` reads without
consuming, `bindPty` retires the transcript once a live shell owns the screen, and auto-start keys
on `state === 'idle'` — a restored session hydrates as `exited`, which is the actual question
being asked. The transcript was always a poor proxy for it: a session saved before it printed
anything would have been revived on sight.

**`TerminalSessionSchema` never enforced its own comment.** `agentId` was documented as "set when
`kind === 'agent'`" and required by neither direction, and both halves degrade *silently*: an agent
with no id restores as a row the roster cannot resolve, losing its accent and its Claude mark and
reviving as a bare login shell while still labelled an agent; a shell carrying an id paints that
mark on a terminal running no agent. Both reachable from `terminals.json`, a file that outlives any
one build. `agentIdMatchesKind` now refines the session record and `PtyCreateRequest` alike.

**The tests.** `ipc.test.ts` had no pty coverage at all — which is how `PtyCreateRequest` grew four
fields across this phase without a single assertion. It is now a table (schema, a payload that must
parse, payloads that must not, each labelled with the rule it tests) closed by a guard asserting
every `pty:*`/`terminal:*` channel has a row. That guard's first act was to find `pty:data`, left
unvalidated on purpose — one message per chunk of shell output, and putting zod on the path of each
keystroke's echo buys nothing for a payload whose only consumer is xterm. It is a named exemption
with its reason, so the guard still fires for the next one.

The e2e mock stopped being a stub and became a **fake pty that talks back**: a coloured prompt,
echoed keystrokes with backspace, a short canned transcript, and silence after `kill` — escape
sequences included deliberately, because the real pty sends them and a mock that omitted them would
quietly stop testing that they survive the trip. Sessions are seeded through `terminalSessions`, so
a spec reaches the restored-and-dimmed state without quitting an app it never launched.

Assertions moved to the bridge rather than the screen. xterm paints through the WebGL addon, so a
terminal's contents are canvas pixels that no DOM query can read — and what crossed the bridge is
the more precise thing anyway. "The shell survived hiding the panel" is asserted as *no `kill` was
sent and no second `create` followed*, which is the Phase 9 unmount-kills-the-shell contract being
overturned, stated in the terms it was written in. "Restored sessions come back dimmed" is asserted
as *no pty was created*, which is what dimmed means.

Nine specs: open on Ctrl+` and close again with xterm focused, a second terminal getting its own
pane and pty, the Claude row's accent coming from the roster rather than a default, the session list
docking either side and surviving a reload, maximize and restore, restore-dimmed-then-revive,
hide-without-killing, and drag reorder with a real pointer past dnd-kit's 6px activation constraint
— the only thing that would catch a misrouted `DndContext`.

One item is left open on purpose: quitting and relaunching the packaged app to confirm `ps` shows no
surviving shells. A browser cannot quit Electron or read the process table, and faking it would be
the one assertion in the list that proved nothing.

562 unit tests + 47 Playwright green.

---

## Phase 17 — the repositories sidebar as a workbench (2026-08-26)

Five gaps closed on one branch: change counts, a Changes-view filter, menus on everything,
whole-checkout diffs, and the app's first forge integration.

The counts needed **no new IPC at all**, which was the surprise. `status.get` has taken an
optional `worktreePath` since Phase 6, `resolveWorkdir` validates it against
`git worktree list`, and `getStatus` resolves `.git` through `rev-parse --git-dir` so it
already worked inside a linked worktree. The sidebar simply never asked. `useWorktreeStatuses`
asks — one `useQueries` entry per checkout, on **exactly** `keys.status(repoId, path)`, so a
row's pill and the Changes panel that later selects that checkout are one cached `git status`
rather than two, and the Phase 10 watcher invalidates both without knowing the hook exists.

`isPlaceholderData` turned out to be load-bearing twice over. The placeholder is an *empty*
status, so trusting it would report every checkout clean while its query was in flight — and
Theme B's filter would then have hidden a dirty worktree on the strength of a number that had
not arrived. `byPath` therefore holds only checkouts that have actually answered, and the
filter refuses to hide anything while `isLoading`.

The old `isMain`-only guard on `worktreeHealth` was right and is preserved. Its comment said a
linked worktree gets no dot rather than the primary's dirt attributed to it; `liveStatus()`
keeps that invariant and the data caught up to it.

**Destructive verbs moved into the sidebar**, reversing a documented Phase 4 decision. The old
docblock argued that delete and rename belonged only to the graph's ref badges, because a
second set of destructive affordances would be somewhere for the two to disagree. That did not
survive contact with the tree — the sidebar is where branches and worktrees are actually
managed, and sending someone to the graph to delete a branch they are looking at is the
indirection a git client exists to remove. The docblock was rewritten rather than left
contradicting the code, and the disagreement risk is answered by one shared confirm shape.

Branch delete passes `--force` unconditionally, which looks alarming and is the honest choice:
git's `-d` refuses on unmerged commits with no way to see what they are, so a UI built on it
can only relay a refusal. The blast radius dialog *names the commits*, which is strictly better
information — so the decision moves to the person, in front of the numbers.

Worktree removal is two-step. The first attempt never forces; only after git has actually
objected does a second, separately-confirmed dialog offer to override it, so "force" is always
a reply to a specific objection rather than a checkbox nobody read.

Two rows in one tree can both be called `main` — a branch and the worktree it lives in. Their
action buttons had identical accessible names, which a Playwright strict-mode violation caught
and which a screen reader user would have hit the same way. Labels now name the kind.

`inline` mode on `DiffView` drops the **virtualizer**, not just the chrome: inside an accordion
the scroller is the page, so a virtualizer would render three rows and stop. `DIFF_LINE_CAP`
already bounds a single file, which is what makes plain flow affordable. Each accordion's query
lives in its *body*, so a checkout with 200 changed files costs 200 rows and zero `git diff`
calls until something is expanded; expand-all is capped and **says** what it withheld.

Tabs live in their own store rather than a `ui-store` slice. Everything in that store is a
persistence candidate; a tab names a repo, a checkout or a run, any of which can be gone by
next launch — so keeping them apart means nobody has to remember to exclude them from
`partialize`. `NewWorkbenchTab` distributes its `Omit`: a naive `Omit` over the union keeps
only shared keys and would have erased the very fields tab identity is derived from.

**The forge integration goes through the user's own `gh`.** No PAT, no keychain decision, no
token that silently expires — `gh` already holds a credential and knows about enterprise hosts.
`shellQuote()` is the load-bearing piece and not defensive politeness: `runInShell` takes a
single command string, and owner/repo are parsed out of whatever URL is sitting in
`.git/config`. It is tested against `$(…)`, backticks, `;`, `&&`, `|`, a newline, and the
embedded `'` that is the only character single-quoting cannot contain. Owner/repo are resolved
**in main** from the config rather than sent by the renderer, so the only thing crossing the
boundary is a `repoId`.

Two `gh` details cost a debugging round each and are now encoded: an interactive login shell
convinces `gh` it has a tty, so `GH_PAGER=cat` is required or the call hangs until the timeout;
and `gh auth status` exits 1 if *any* configured host has a bad token, which must not sign the
user out of the host that works.

This finally closes **"Branch checks (the RAG dot's real source)"** from `outstanding.md`, by
the exact route that entry predicted. `checksVerdict()` matches on **sha**, never branch name —
a green tick sourced from the previous tip is the precise failure that teaches people to
distrust the dot — takes the newest run per workflow so a re-run supersedes what it replaced,
and reports an all-skipped set as `unknown` rather than green. The rate-limit worry that
parked it is answered by never fetching for the dot at all: the sidebar reads the Actions query
with `enabled: false`, so a branch is coloured only when the user has already opened that
repo's Actions section.

Two verification items are left open for a human, both because this session could not perform
them rather than because they were skipped. Electron will not attach to the macOS window server
from a non-interactive shell — it exits silently with no output while other Electron apps on
the same machine run fine — so the packaged-app screenshot pass in both themes did not run. And
the `gh`-availability matrix (present-and-authed, absent, authed-but-offline) needs a machine
whose state can be changed between runs.

Note for whoever picks this up: `e2e/graph-themes.spec.ts` has 12 failures **on `main`** —
verified in a clean worktree at `0b810c2`, identical count and file. It looks like a Phase 16
leftover: the spec reaches for Settings via `getByRole('link')`, but Settings became a footer
`button` when the nav rail regrouped. Untouched here; it is not this phase's to fix.

724 unit tests + 56 Playwright green (11 of them new).

## 2026-08-26 — Sidebar: rows stop changing height, and folded summaries line up

Three polish fixes to the repositories sidebar, each about the same disease: layout that
depended on what a row happened to contain.

`TreeSection` headings sized themselves with `py-1`, and the trailing ellipsis action is an
`h-6` IconButton — so Local, Remotes and Worktrees (which carry one) sat ~7px taller than Tags,
Actions and Reviews (which do not), and the section rhythm stuttered from repo to repo. The
heading now pins `h-7`; an optional control cannot change it. Repo rows got the same treatment
(`h-8`): the sync cluster only renders once `git status` comes back, so a padded row grew a few
pixels the moment status loaded and every repo below it shifted down.

On a folded repo, the branch + change-count summary used to trail the name, starting at a
different x on every row because names differ in length. It is now pushed to the trailing edge
(`ml-auto`), so folded rows read as a column — the summary lines up down the panel, directly
left of the sync control it explains. And the panel header's filter and "open a repository"
buttons became one trailing cluster instead of two controls spread by `justify-between`, which
had read as a third column of the title row.

Two new Playwright tests pin both fixes: one asserts the four heading kinds share a single
bounding-box height, the other that a folded row's change-count pill sits in the trailing half,
left of the sync button. All 14 repos-workbench e2e tests green; unit gate green.

## 2026-08-27 — Settings: the sidebar gets a page of its own

The repositories sidebar's narrowing — which views show the whole tree and which arrive
narrowed to what the view is about — was settable only one view at a time, from the funnel
button inside the panel itself. It now also has a **Sidebar** page under Settings › General
(its own nav sub-item, `LuPanelLeft`): every view's answer in one column, each row a
Narrowed/Everything pair with the view's own default named beside it, plus a reset.

Both faces write the same `sectionFilters` field, so a row flipped here is immediately what
the funnel button reads and vice versa — the e2e proves it on the live view: Settings IS the
active view while the page is open, so flipping its row must narrow the panel sitting beside
the page, and does. What "Narrowed" means per view is spelt out from `VIEW_FILTERS` rather
than written by hand, so a view whose narrowing changes cannot leave a stale description.

The reset is a new store action, `resetSectionFilters`, and it empties the map rather than
writing each view's default back as an explicit entry: an absent entry means "whatever this
view does by default", so a default that changes in a later release still applies.

Worth knowing for the next settings e2e: an empty ref section hides itself (`hideWhenEmpty`
in `TreeSection`), and the settings spec's fixtures carried no refs — so the sidebar next to
Settings never showed Local at all, unfiltered or not. The spec now feeds one branch in.

## 2026-08-27 — Sidebar page: the side-navigation lock moves in

The "Side navigation" control (Auto / Locked open / Locked closed) moved from Appearance to
the Sidebar settings page — locking the nav is a sidebar decision, and that page is where
someone looking for it looks. Same `navMode` field, same three states, and the rail's own
chevron pin remains the two-state face of it.

No behaviour needed building: `AppFrame` (from `@bilo-io/shell`, and verified in the
installed dist) already keys everything off this value — hover-expand handlers attach only
in `auto`, so **locked closed never expands, hover included**, and while the rail is
collapsed each item names itself in a portal tooltip. What was missing was the setting's
home and any proof of that contract. The e2e now locks the rail closed, hovers a nav item,
and asserts the tooltip appears — a tooltip only renders against a collapsed rail, so its
visibility during a hover IS the assertion that the hover expanded nothing.

## 2026-08-27 — The agent activity spinner reads a frame, not a chunk

The spinner added a commit earlier never once appeared. `detectActivity` decided "thinking"
by looking for `esc to interrupt`, and the strings in the shipped binary
(`~/.local/share/claude/versions/2.1.247`) say that phrase now survives only in the retry
banner — the live spinner row prints `✳ Kneading… (1m 38s · ↓ 4.5k tokens)`. Meanwhile the
*waiting* marker it fell through to (`auto mode on` / `shift+tab to cycle`) is drawn on every
repaint, generating or not, so every busy agent read as idle.

Thinking is now keyed on the spinner row itself: the frame glyphs `✢ ✳ ✶ ✻ ✽` — taken from
the binary's own frame arrays, with `·` and the ASCII `*` left out because a middle dot is
the separator in every footer segment — followed by the verb's ellipsis, plus the
`↓ N tokens` counter and the old interrupt hint for older builds.

The footer's real job turned out to be a FRAME BOUNDARY, not a state: the spinner row is
drawn above it, so a frame that reaches its footer with no spinner in it is what means
"waiting". Detection therefore runs over the bytes since the last boundary rather than over
one pty chunk — a repaint is a couple of kilobytes and macOS hands it over in pieces, so
judged chunk by chunk the same frame said thinking and then waiting a millisecond later and
the glyph flickered between the two for the length of the turn. `TerminalView` carries that
state per session, beside the decoder it already kept for the same reason.

Alongside it, the session list got the two things a list that now says something useful
needs: a drag ceiling of 560 rather than 360 (matching the repos sidebar — an agent row's
label is a summary of the task it was given, so these are the longest rows in the app), and
a `List` toggle in the terminal header, persisted as `terminalListOpen`. The toggle is
explained-disabled below two sessions, since a list of one still names nothing the header
does not.

## 2026-08-27 — The thinking ring was spinning all along; nobody could see it

The spinner appeared, correctly, the moment an agent started generating — and read as a
static circle. Everything that could have stopped it was ruled out before anything was
changed: `.animate-spin{animation:spin 1s linear infinite}` is in the built stylesheet with
no later rule overriding it, the persisted appearance is `motion:"system"` with the OS
`ReduceMotionEnabled` at 0 so the shell's universal reduced-motion reset never armed, and
the packaged app in /Applications ships the exact bundle and CSS that was inspected. Driving
a real tool-using Claude turn through `detectActivity` (138 pty chunks over 80s) produced one
transition into `thinking` and then held, so the ring was never being remounted mid-turn
either — a remount would have reset the rotation to 0° and frozen it in place, which was the
obvious suspect and the wrong one. Sampled in a browser against the app's own stylesheet, the
element reported `animationName: spin`, `playState: running`, and transforms stepping
0° → 57° → 111° → 165° → 219° over 600ms.

So the animation was running the entire time. What failed was the mark. One lit quadrant on a
12px circle is a lone ~8px dash, and `border-[1.5px]` floors to a single device pixel below
2× scale — Chromium's computed `borderTopWidth` comes back `1px`. A one-pixel dash going round
once a second, in a sidebar nobody looks straight at, is not perceptible as motion; captured
frame by frame off a paused animation it is plainly rotating, and at speed it is a ring
sitting still.

The fix is geometry, not motion: 14px, a 2px rim, and two adjacent borders lit rather than one,
so a half ring sweeps instead of a dash creeping. Duration stays Tailwind's built-in 1s
deliberately — a custom `spin 900ms` would rest on `@keyframes spin` still being emitted, and
Tailwind only emits it while some other file uses the built-in utility.

Left standing for next time: once `thinking` is seen, the state is sticky. In that same 80s
probe the detector returned `thinking` 113 times and `waiting` never again after the turn
ended, so a finished agent keeps its spinner until its next byte of output.

## 2026-08-27 — The PR description becomes a tab, and the header stops spending height on it

The description sat under the PR title in a `max-h-40` scroller, which spent 160px on every
pull request whether or not anyone was reading it and pushed the review actions and the tabs
that far down the pane — on a short window the diff got what was left. It is the `Overview`
tab now, first of four, and it opens by default: the body was always visible when a PR opened,
so making Files the landing tab would have hidden it behind a click nobody asked to make.

Overview costs no extra fetch. It reads `useForgePullDetail`, which the header already runs
for the base branch and the line counts, so a PR opened onto Overview now pulls *less* than
before — the patch and the review threads stay behind their own tab gates, and a reader who
only wanted the description never fetches them. Its three states are kept distinct (in flight,
no detail, a genuinely empty body) so a panel that has not answered yet cannot read as a PR
with nothing to say.

The dead band under the header was two margins doing one job: `ReviewActionBar`'s root carried
`mt-2` and its slot in `PrDetail` carried `pb-2`, so the gap above the Approve row came from
the bar and the gap below it came from the pane. The slot owns both now (`px-3 py-2`) and the
bar's own top margin is gone. With the body out of it the header is a fixed two rows however
long the description is, so the rule, the actions and the tablist stack with 8px between them.

## 2026-08-27 — A changed image is shown, not described

`git diff` on a PNG prints "Binary files differ" and stops, so the diff pane printed
`Binary file — no textual diff.` and stopped too: true, and no answer to the only question the
reader has. An image now renders as its two revisions, with three ways to compare them —
two-up, a swipe divider, and an onion-skin fade — because no single one answers everything:
two-up says what the picture is now, swipe catches geometry (a shifted element lines up or it
does not), and onion catches tone, where a slow fade shows a colour shift that side-by-side
hides. The header states the dimensions, and the change in them, which is the difference a
picture makes hardest to see and a number makes obvious.

The hard part was never the viewer, it was the *before* side: those bytes are not on disk
anywhere. They come out of the object database instead, through the `mstudio-file://` scheme the
Files preview already uses, with a `?rev=` the handler answers by `git cat-file blob <rev>:<path>`
— `readBlob` in git-engine, spawned rather than `execGit`'d because dugite hands stdout back as
a *string* and would corrupt every byte outside the encoding it assumed. Same jail as before
plus two conditions of its own: the rev must survive a narrow whitelist (`cat-file` takes its
object as a bare argument with no `--` terminator, so anything flag-shaped must never reach
git), and a `?rev=` request that fails any check 404s rather than falling through to the disk
read — otherwise a crafted rev would quietly serve the working-tree file at that path.

Which revisions to pair was the decision worth getting right, and it belongs to the caller:
the Changes pane compares the index with the checkout (or HEAD with the index, when the file is
staged), the commit inspector compares the commit with its first parent — matching the
`--first-parent` diff it already asked git for. `imageDiffSources` is that arithmetic, pure and
unit-tested, and it returns `null` for everything that is not a binary image, so every call site
wires it unconditionally and the branch never fires for text. An SVG keeps its textual diff on
purpose: it has one, and replacing it with two pictures would hide the change rather than show
it. A rename reads its pre-image from the *old* path, since asking for the new one at the old
revision finds nothing.

Two smaller things fell out. A blob at a rev is immutable, so those responses are cached
forever — which is what makes flipping between before and after instant. A working-tree image
is the opposite case: its URL does not change when the bytes do, so disk-served *images* now
revalidate, or a re-exported screenshot would sit next to today's "before" and look like the
diff was wrong. Video and audio were left alone; they go through Chromium's range machinery,
which is not worth disturbing for a staleness problem they do not have.

## 2026-08-27 — The Files view compares an asset, not just displays it

The image viewer landed in the diff surfaces first, which left the Files browser as the one
place that shows a picture and cannot answer what changed in it. It has a `Compare` toggle now,
on an image whose bytes differ from HEAD's: off is today's pane, on is the same `ImageDiff` the
diff pane mounts — two-up, swipe, onion — over HEAD → the file on disk.

That pairing is deliberately the only one offered here. A file browser has no staged/unstaged
distinction to work with; it shows one checkout, and the question a reader has of a changed
asset is how it differs from what is committed, which covers both halves of a staged-then-edited
change in one comparison.

The gate is `differsFromHead`, over the status entry the sidebar has already fetched for this
checkout — so it costs a cache read, not a subprocess. A path status never mentions matches
HEAD and offers nothing. Untracked, ignored, and staged-as-added are refused for a different
reason: HEAD holds no pre-image, and a "compare" that opens an empty before pane reads as a
broken viewer rather than as a new file.

Two things the single-image pane gained on the way past: the checkerboard the viewer already
used (an alpha channel on the plain pane background reads as a solid dark shape — exactly the
detail worth seeing), and the natural dimensions in the header. Both come from the diff
viewer's own module rather than a copy, so the two surfaces cannot drift on what a picture sits
on.

## 2026-08-27 — The Reviews view draws the shape of what it is fetching

Every wait in the view was a sentence in the middle of an empty pane — "Asking GitHub…",
"Reading the diff…", "Reading the conversation…". Each threw away a layout the app already
knew, so the pane sat blank and then everything landed at once and jumped.

`components/skeleton.tsx` adds the two marks and, more usefully, the rule for choosing between
them: a skeleton stands in for content that is not on screen yet and whose shape is known; a
spinner belongs where content *is* on screen and something is happening to it — a write in
flight, a refetch behind a list that still shows the last answer. `LoadingRegion` keeps the
prose those placeholders used to show as an `sr-only` status, so the bars can be `aria-hidden`
and a screen reader hears "Reading the diff…" instead of "div div div".

`reviews-skeletons.tsx` holds every pane's outline in one module rather than beside each
component. What makes them work is being the same geometry as the panes they replace — same
padding, same row heights, same borders — and that only stays true if they are read together;
a skeleton kept next to its component drifts from it one padding change at a time. Widths are
constants, never random: a random width is a diff in every screenshot and a flicker on every
re-render while the fetch is still out.

The ordering matters more than the bars. Anything the app can actually assert — an empty list,
filters matching nothing, a signed-out CLI, an error — is still prose, and every caller checks
for those *before* reaching for a skeleton. That is what lets a grey bar mean "still asking"
rather than "nothing here". Spinners go on the four in-flight writes (comment, review submit,
request review, merge) and on the list's own refresh, where the rows behind the fetch are good
and must not be blanked out.

None of it was photographable or testable: the mock bridge answers in the same tick it is
asked, so the skeletons lived for zero frames and a change deleting them would have passed the
whole suite. `forgeLatencyMs` holds every forge answer — the whole namespace, so a call added
later is slow too, and zero skips the wrapper entirely so no existing spec changes timing.
`reviews-loading-shots.spec.ts` asserts each `sr-only` status and photographs seven states into
`docs/screenshots/phase-20-reviews-loading/`. The shots settle animations first; without that
they caught the shell mid-fade and came out as a washed-out grey page showing none of the work.

## 2026-08-27 — The repositories panel gets a switch, in the footer and on Mod+B

The panel that is always there is the one you cannot get out of the way. The repositories
sidebar had a width the user could drag but no off state, so a 288px column of branch trees sat
beside the graph whether or not the current task was about picking a repository.

`Repos` now sits in the footer immediately left of `Terminal`, built as the same control: glyph,
label, chord hint, `aria-pressed`, the accent-filled pressed state. Two toggles of the same kind
read as one group, and the leading slot goes to the panel that is open by default. Its glyph is
Octicons' `GoRepo` — the mark the panel's own header already wears, so button and panel are
recognisably one object. Lucide, which the rest of this file uses, has no repository mark that
is not a folder, and every folder variant in this app already means "worktree".

The chord is `repos.toggle` / `Mod+b` in `DEFAULT_KEYMAP`: Cmd+B on macOS, Ctrl+B elsewhere, the
binding every editor with a left sidebar uses and therefore the one a user tries first. Scope is
`app`, not `global` — deliberately unlike the terminal toggle, because Ctrl+B is a readline
motion the shell is entitled to keep while it owns the keyboard. The View menu gets the item from
the same registry, so accelerator and menu item cannot drift.

`Mod` is how the keymap spells "Cmd here, Ctrl there" — right for string comparison, meaningless
printed on a button. `displayChord` renders the modifier the user's keyboard actually has, and
both footer buttons go through it; the terminal's `Ctrl+`` passes through untouched.

Hidden means unmounted, not zero-width. The panel streams a per-repository status and ref list,
and a live column behind a dismissed view keeps paying for itself. `reposWidth` is separate
layout state, so it returns the size it was. The resize handle unmounts with it: a splitter with
nothing on its left edge is a drag target for an invisible thing. `reposOpen` persists beside the
terminal chrome and defaults to open — it is the app's primary object list, and a fresh install
whose first press REVEALED it would have started out looking broken.

## 2026-08-27 — The title bar gets a hairline, and the breadcrumbs get their glyphs

Two small reads of the same strip. The `right` cluster ran the sync actions, a hairline, the
per-checkout lifecycle actions, and then the theme toggle flush against the last of them — so a
window preference sat inside the run of git commands as if it were a fifth one. It gets the same
`h-4 w-px bg-border` rule the action clusters already use between themselves; the strip now reads
as three groups rather than two-and-a-half.

Every breadcrumb crumb now leads with an icon: `LuFolderGit2` for the repository, `LuGitBranch`
for the branch, `LuGitCommitHorizontal` when HEAD is detached — a commit glyph, because that state
is precisely standing on a commit rather than on a branch — and, for the last crumb, whichever
glyph the nav rail or the settings sidebar already shows for that destination. The glyph is what
says *what kind of thing* a name is once the strip has cut it to `midnite-…`, so truncation
flipped with it: `shrink-0` on the icon, `truncate` on the label. A half-clipped icon reads as a
rendering fault, a clipped repo name reads as a long repo name.

The rail's and the settings sidebar's icon maps moved into `components/nav-icons.ts`, shared by
all three surfaces rather than copied into the breadcrumb. One view wearing two different icons in
two places is worse than either icon. `SETTINGS_PAGES` still carries no glyph — the store stays a
plain data module, so nothing that only wants a page id pulls an icon package in behind it.

## 2026-08-27 — The repository row grows a third menu, behind the app's own mark

The row's two menus become three, in the order midnite → git → ellipsis: widest scope first.
The new one holds what you ask **this app** to do with the repository — **Exec**, **Brainstorm**,
**Loop PR Review**, **Loop PR Feedback** — where the Git logo holds what you ask git and the
ellipsis holds the repository's own tooling. Three marks rather than three ellipses, which is the
same argument that replaced the second ellipsis with the Git logo in the first place.

Each entry opens a fresh Claude session in the primary checkout and types its skill at the prompt
**without a newline** — `startClaude`, reused rather than reimplemented, so this shares its posture
with the Agent page's uninstall command and the test runner. Pressing Return is the confirmation, so
a mis-clicked menu cannot set an agent loose on a repository, and the queued command is readable
before it runs. That last part matters more here than anywhere else, because *what* each entry
invokes is a setting.

**The skills are configurable** (Settings → Agent → midnite menu, one field per entry, with a Reset
that appears only once a value has drifted from its default). They have to be: a skill is a file in
the user's `~/.claude`, not something this app ships — `/exec` and `/brainstorm` are this repo's own
project skills, `/loop-pr-reviews` and `/loop-pr-feedback` are personal commands — and any of them
can be renamed or forked without the app knowing. The values are whole prompts rather than bare
skill names, so an entry can also carry arguments or a plain sentence. Free text rather than a
picker over the skills found on disk, deliberately: enumerating them would catch a typo but refuse
every legitimate value that is not a bare skill, and the failure mode of free text is a terminal
showing you the wrong command before you press Return.

`agentSkills` lives on `ui-store` beside the other persisted preferences, with the ids and defaults
in the store and the labels and glyphs in `features/agent/agent-commands.ts` — the split
`SETTINGS_PAGES` / `PAGE_ICON` already draws, so the store pulls no icon package in behind it. The
persisted record is re-spread in `merge` for the reason `layout` is: a blob written before a fifth
entry existed would otherwise leave that entry's skill `undefined`, which reaches the shell as the
string "undefined".

`components/icons/midnite-icon.tsx` is the mark as an SVG, and it is a *trace*, not a redraw.
`brand.tsx` renders the same mark from `logo.png` and must keep doing so — that asset is
deliberately opaque, a black crescent on a white ground, which is what lets one file sit on both
themes. A toolbar glyph needs the opposite: it has to take the colour of its control, and a PNG
cannot. So the disc, the ring and the crescent's two arcs were fitted as least-squares circles
through the PNG's own edge pixels (r=465 and r=512 about the centre, r=297 and r=220 for the
crescent, max residual under 3px on a 1024 canvas), and the crescent's hooked horns — which are
not circular, and are why two circles alone will not do — are the traced outline simplified to 2px.
Rasterising the result back agrees with the PNG on 98.9% of sampled pixels, every disagreement on an
antialiased edge.

It is **one `evenodd` path with four subpaths**, not two clipped groups, because the mark inverts
across its own equator (top: filled disc, crescent knocked out; bottom: hairline ring, crescent
filled) and clipping needs an `id` — which collides with every other inlined copy of itself on the
page. Disc-512, disc-465, top-semicircle and crescent are chosen so the crossing count lands odd
exactly on the ink; the table is in the file. The third subpath is a semicircle rather than a
rectangle because a half-plane keeps toggling past the disc's edge and fills the top of the viewBox.

`IconButton` gains a third tone, `brand`: resting in `--primary`, hover to plain foreground. A tone
rather than a `className` because both halves are text colours — passing them in would put
`text-primary` and the base `text-muted-foreground` in the same slot and leave the winner to
whichever Tailwind emitted last. Note that `--primary` is only the accent hue while an accent is
chosen (`html[data-accent]`); on the default accentless theme it is already the full-contrast
colour, so the two states differ by the hover tint alone.

**The sidebar's default width goes 288 → 312**, and that came out of looking at the folded row
rather than out of taste. 288 was measured against a row with two menus; at that width a folded
`midnite-git` was already spending its last pixels on the branch name, and a third control took the
name's first character with it and pushed the change-count pill a third of a pixel into the sync
button. The 24 is the new menu's own footprint. A persisted width still wins, so this moves only
the installs that never dragged the panel.

The e2e asserts the ordering as one list rather than three presence checks — all three controls
existed before this change, in the wrong order, so a test that only looked for them would have
passed then too — and follows a skill from the settings field through the store to the pty's
`initialInput`, which is the one span no store test could cover. The store tests cover the half the
browser cannot see cheaply: that one entry moves without disturbing the other three, that the whole
record persists, and that `merge` refills an entry a stored payload predates instead of leaving it
`undefined` — which would reach the shell as `claude 'undefined'`, a prompt rather than a crash.

Known-red, and red before this too: `repos-workbench.spec.ts`'s folded-row test still fails its
second assertion (`pill.x` past the row's midpoint) on `main` and here alike. The e2e suite is
deliberately outside the `:test` gate; it stands at 20 failures on both sides of this change, with
the four new ones green.

## 2026-08-27 — The terminal session list drops its rename pencil

The hover pencil on each session row is gone. Double-click already renames — it is how a name
in a list is edited everywhere else (Finder, VS Code's tabs, a spreadsheet cell) — so the button
was a second control for something the row already did, and the context menu keeps the
discoverable and keyboard-reachable route alongside "Reset to detected name".

It was not free to keep. `opacity-0` hides a button but does not take it out of the flow, so the
pencil cost every row ~22px of layout width whether or not anyone hovered — in a list whose
default is 176px, and whose rows carry a repo name, a separator, the session's own name, an
activity indicator, a state dot and a close button. The session name is the part that tells two
Claude sessions apart and the part that truncates first, so those pixels went to the one thing
on the row that most needed them.

`rename` itself is untouched; only the third way to reach it is gone. The `LuPencil` import went
with it, and no test referenced the control.

## 2026-08-27 — Reviews splits into three questions, and stops fetching until asked

Both Reviews surfaces — the sidebar's per-repo section and the Reviews view's list pane — now sit
behind three accordions: **My Requests**, **Awaiting My Review**, **All Pull Requests**. Nothing is
fetched until one is expanded, which is the same rate-limit gate the forge sections have always
applied, one level finer: three collapsed groups cost exactly what one collapsed section used to,
and a reader who only ever opens "Awaiting My Review" never pays for the other two.

Each group is its own `gh pr list`, not a filter over a shared page — `ForgePullScope` carries the
reason. `--limit` counts the PRs `gh` matched, so a page of twenty narrowed to "mine" afterwards
is twenty minus everyone else's rather than twenty of mine; the same argument `state` already made
for itself. `mine` is `--author @me`, `review-requested` is `--search review-requested:@me` (the
query `gh pr status` builds for its own block), and `@me` rather than a looked-up login so the app
never holds a username or misses a `gh auth switch` in the terminal beside it. `scope` is part of
the query key for the same reason `state` is: sharing one would let whichever group expanded first
serve its rows to the other two.

The view's toolbar stayed where it was and now filters ACROSS the groups: the groups answer
"whose", the tabs and the search answer "which", and repeating either three times would be three
places to set the same thing. The author menu is built from the union of what the expanded groups
have loaded, deduplicated by PR number first — the same pull request is legitimately in two groups
at once, and a tally that counted it twice would be a number the list can never match.

Two things the split changed on purpose. The stored selection now wins outright rather than only
while its PR is in the filtered set: `PrDetail` fetches by number, so a PR chosen in the sidebar
has to survive arriving here with every group collapsed and nothing loaded for it to be "in". And
an open group prints no count until its fetch answers — "All Pull Requests 0" for as long as `gh`
takes, then changing its mind, is a claim rather than a reading.

## 2026-08-27 — One click into a terminal slid the whole app under the title bar

A maximized terminal lost its own header to the title bar, restore button and all, with no
gesture that could bring it back. The repositories panel was clipped at the top by the same
amount, and the nav rail — the one thing anchored to the viewport rather than laid out in
flow — looked perfectly fine, which is what made it read as a terminal bug rather than a
layout one.

The app column was sized `100vh - var(--titlebar-h)` and pushed below the bar with a top
margin of the same 48px. That sums to the viewport, which is why it measured correctly at
rest — but a top margin on the first in-flow child collapses out through `<main>` and
`#root`, neither of which has a border or padding to stop it. So the margin stopped being
space inside the page and became the page's own offset: a 100vh document sitting 48px down,
i.e. 48px taller than the window, with exactly one title bar's worth of scroll in it.

`body { overflow: hidden }` keeps that away from the wheel but not from the platform:
`focus()` and `scrollIntoView()` scroll an overflow-hidden viewport quite happily, and
clicking into a terminal focuses xterm's hidden textarea. One click, 48px, and every control
along the top of the column was behind a fixed bar at `z-60` that answered the clicks meant
for it. Scrolling back was not on offer either — an overflow-hidden viewport takes no user
gesture, only a programmatic one.

The fix is padding rather than a margin: padding sits inside the border box, so the box is
exactly `100vh` however tall the bar is and the document has nothing left to scroll. The
framed window's chrome strip moved inside that box while it was open — as a sibling above it,
its 40px added to a box already claiming the whole window, which is the same bug on the
platforms macOS is not.

Verified in the real window as well as the harness, against a copy of a live profile: the
maximized terminal's restore button is what answers a click at its own coordinates, and
`scrollTo(0, 400)` moves nothing. `terminal.spec.ts` states both — that the document has no
room to scroll, and that scrolled at anyway, the panel's header is still the thing under the
pointer across its whole width.

## 2026-08-27 — The footer's disk readout becomes a ring

Capacity was the one metric in the strip drawing a sparkline of a line that never moves. `disk.ts`
and the flyout both already made the argument — a capacity line is flat for hours, so a timeline of
it implies movement that is not there — and the flyout acted on it with a bar. The footer had not.

Disk now draws a 12px donut: a muted track in its own hue at the sparkline's area alpha, and the
used fraction as an arc from twelve o'clock. It replaces the DOT rather than the sparkline, and
loses the sparkline entirely — the ring is already a coloured mark in the metric's hue, so a dot
beside it would be the same identification twice, and putting the ring at the head keeps the column
of percentages down the strip aligned.

One `<circle>` with `stroke-dasharray`, not an arc path: an arc needs a large-arc flag that flips
at exactly 50%, and getting it wrong draws the complement of the number you meant. The arithmetic
lives in `ringGeometry` beside `linePath` and is tested there, including the half-stroke inset (a
stroke straddles its path, so a circle at the outer radius paints half the ring outside the viewBox)
and the clamp (120% wrapping past its own start would read as 20% — a smaller number than the one
that was measured, which is the worst way to be wrong).

`TIMELINE_METRICS` is now one list rather than two. The flyout had its own copy, and a metric that
was a timeline in one strip and a level in the other is a contradiction the user can see.

## 2026-08-27 — Dropdowns stop sliding under the title bar

The breadcrumb's repo switcher and the theme menu both opened from controls IN the title bar,
and both were painted UNDER it. `@bilo-io/shell` draws `<TitleBar>` at `z-[60]`; every overlay
this app owned was at `z-50`, `z-[60]` or `z-[70]` — numbers chosen against a plain Tailwind
scale where 50 IS the top, and each one written in a file that could not see the shell's.

Worst was any menu raised through `useDialogs().openMenu`, which places itself at the CURSOR:
click a title-bar control and half the bar's height of menu is buried, so the first row was
neither readable nor clickable. The theme menu overlapped by ~6px — its top row's upper half
answered clicks as the title bar rather than as "Light".

The numbers are now named in `tailwind.config.ts` — `z-menu` / `z-popover` / `z-dialog` /
`z-tooltip` at 80/85/90/95, all clearing the shell's chrome, all under the shell's own `z-[200]`
full-screen states. Named because the bug was not a wrong number, it was a number that could
only be judged against a value published by another package: `z-menu` at a call site says which
layer this is and leaves one place to check what that outranks. The dialogs moved with them —
`fixed inset-0 z-50` left the title bar bright and live over a modal backdrop.

`overlay-stacking.spec.ts` asserts it by hit-test, not by visibility. An occluded menu is
`toBeVisible()`, correctly positioned and passes Playwright's actionability checks — which is
how this survived a 250-spec suite. The probe is `elementFromPoint` at the centre of the menu's
INTERSECTION with the title bar, and no intersection throws rather than passing quietly: an
earlier draft probed the menu's centre, which sits below the bar, and passed against the bug.

## 2026-08-27 — The terminal and the repos sidebar slide instead of cutting

Hidden → visible → maximized, and the sidebar's own toggle, were all hard cuts: the panels were
`{open ? <Panel/> : null}`, which can animate in neither direction — on the way in the panel is
already at its final size in the frame it first paints, and on the way out it is gone before a
transition could run. `useReveal` (`components/use-reveal.ts`) keeps a leaving panel mounted for
the length of its exit and gives an entrance a painted frame at zero to travel from; the call site
renders `shown ? size : 0` and puts a 200ms `ease-in-out` on that property.

Maximizing needed a second length, because `flex-1` is not one. The view, the splitter and the
terminal now share a measured box — the room the column has between the title bar and the footer —
and maximizing animates towards its height. Measured off that box rather than computed from the
window, since the title bar, the framed-window chrome strip and the footer each take a slice first.

**Two boxes for the terminal, and the reason is the pty.** The outer box animates; the panel inside
is already at its final height and gets clipped. The panel's `ResizeObserver` drives an xterm fit
and a pty resize, so animating the panel itself would send the shell a dozen SIGWINCHes over the
length of every toggle — the same objection that kept a transition off this panel in the first
place. It is told its new column count once, at the start, and what moves is the window onto it.
The inner box is top-anchored so the header — and the restore and close buttons in it — is the
first thing revealed and the last to leave, rather than clipped out of reach mid-animation.

Two smaller things fall out of it. The height transition is armed by a change of STATE, not by
every change of height: maximized, the height tracks the window, and easing towards each new
window height would leave the panel's top edge trailing the edge the user is dragging by a fifth
of a second. And the view's `hidden` waits for the growing to finish — `display: none` mid-animation
takes the view out of the layout, so the terminal would climb through blank background instead of
over the thing it is covering.

`useReveal` also waits for a frame the main thread is not busy in before it starts, capped at eight.
A panel with work to do on arrival blocks longer than the animation lasts, and a transition started
into that stall runs to completion with no frames to show it in. It does not save the FIRST terminal
open of a session — xterm's first paint (shader compile, glyph atlas) only happens once the panel is
no longer fully clipped, so that one stall is inside the reveal by construction — but every open
after it, and every maximize, is a clean curve.

Asserted by sampling: `terminal.spec.ts` clicks inside the page and reads a rect per
`requestAnimationFrame`, so "it went through the middle" is something the test sees rather than
infers. A `boundingBox()` per frame from the test process spends most of a 200ms animation in
transit and reports exactly what a panel that CUT would.
