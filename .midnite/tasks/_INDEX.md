# Midnite Studio — Phase Index

**Headlines:**

- **[Phase 49 · Onboarding a repo: Setup and Update](phases/phase-49-repo-onboarding.md)** (85% · 28/33, [PR #51](https://github.com/bilo-io/midnite-studio/pull/51)) — **Themes A-D landed, E partial** (2026-09-03): `templates/midnite/` ships as a checked-in skeleton (the tracker, eight genericized skills mirrored into `.claude`/`.agents`/`.codex`, agent-file stubs), packaged via `electron-builder.yml` + `template-path.ts`'s dev/packaged resolver, and `midnite-setup/SKILL.md` (found drifted across its own three mirrors) now emits this same tree instead of a hand-described `todo/` layout. Themes B (the scaffold contract), C (the plan/apply engine) and D (the Setup dialog) landed alongside it. Theme E (Update + menu wiring) is mostly done — the sixth `Project` menu group, both leaves, and the disabled-elsewhere gate all shipped, but the packaged-build pre-flight and the packaged-build assertion of Theme A's own risk are still open. **The midnite menu's first two entries about the repository itself, rather than about an agent working in it.** The menu has had one shape since it was built — five groups, eighteen leaves, every leaf typing a command into a terminal via `startAgent` and stopping before Return — and only one of these two can keep that posture. **Setup is net-new, and the audit says how new:** nothing under `packages/` or `scripts/` has ever read or written a `.midnite/` directory, and the closest prior art is not code but [`midnite-setup/SKILL.md`](../../.claude/skills/midnite-setup/SKILL.md), **stale by a rename** — it still scaffolds `todo/`, the name the tracker abandoned. So the kit becomes a checked-in `templates/midnite/` skeleton (deliberately not a snapshot of this repo's 1.8 MB of real phase docs), carrying the tracker, eight repo-agnostic skills — `midnite-release-*` excluded on a real argument, since it assumes the `midnite-apps` repo, the namespaced tag scheme and the `generic` feed — agent-file **stubs** rather than copies of 199 lines of this repo's own conventions, and the `.agents`/`.codex` mirrors each CLI reads by its own rule. A **hash manifest** in `.midnite/settings.json` is the one piece of persistent state, and it is what makes a re-run an upgrade instead of a guess: create / unchanged / stale / locally-edited, with a `.midnite/` that predates the manifest classified **locally-edited wholesale**, because absence of provenance is not permission. Writes ride Phase 24's existing `fs-scope-write.ts` confinement against the *target* root — no second primitive — and the manifest is written last, so a crash mid-apply leaves a target whose next plan reads the truth off disk. **Update is misnamed, and the phase says so:** [`install-local.mjs`](../../packages/desktop/scripts/install-local.mjs) takes no repo, it `ditto`s **this** checkout's `release/mac-arm64` build into `/Applications`, so the leaf detects `isMidniteStudioCheckout` by a real marker (not a directory name, so clones and worktrees resolve) and disables itself with a `disabledReason` everywhere else — the first repo-capability use of fields `context-menu.tsx` has carried all along. It **types, it does not execute**: a multi-minute `dist` that ends by replacing the `.app` under the running process, in front of a pty broker keyed on a build fingerprint, is not something to automate. No git touched in the target, no content merging, no Onboarding view, macOS only.

- **[Phase 48 · Apply suggested-change blocks](phases/phase-48-apply-suggested-changes.md)** (20% · 4/20, [PR #51](https://github.com/bilo-io/midnite-studio/pull/51)) — **Theme A landed** (2026-09-03): `extractSuggestion(body)` walks the same mdast tree `deck-parser.ts` already builds for a ` ```suggestion ` fence anywhere in the body (blockquotes and list items included), depth-first in document order. Themes B–E (line-range resolution, divergence detection, the write, and the surrounding UI) remain `◻ TODO`. **One existing pattern, applied to markdown instead of code.** [Phase 20](phases/phase-20-reviews-page.md) already shipped inline PR review threads in full — reply, resolve, outdated collapse — and `ForgeReviewComment.body` arrives as raw, unstripped markdown; nothing renders GitHub's own special fenced language, a ` ```suggestion ` block proposing replacement text, any differently from a plain code block. `slide-code.tsx`'s `language-(\w+)`-className-to-shiki pattern (Phase 29) is the precedent this phase copies for `language-suggestion`, and then does the one thing GitHub's web UI can't: **write straight to the local working tree** rather than push a commit through the contents API — a genuine local-first upgrade, not a port. That's also why this phase's real weight is Theme C, not the rendering: `outdated-threads.tsx` only ever checked whether a thread's anchor still exists in the *PR's* diff (a force-push case); nothing anywhere compares the *locally checked-out file* against what the suggestion assumes, and `startLine` — schema-present on `ForgeReviewThread` since Phase 20, read by nothing — is this phase's first consumer, resolving the actual multi-line range a suggestion replaces. Apply rides Phase 24's existing whole-file `fsWriteFile` (no new write channel) and never auto-stages or auto-commits, exactly [Phase 47](phases/phase-47-conflict-resolution-studio.md)'s settled posture for an externally-suggested change landing on disk. `RIGHT`-side only; no batch-apply (GitHub's own is tied to its commit-via-API model, which doesn't transfer here); no suggestion authoring.

- **[Phase 47 · Conflict Resolution Studio](phases/phase-47-conflict-resolution-studio.md)** (0% · 0/23) — **The gap left open since [Phase 8](phases/phase-8-drag-drop-ops.md), and declined on purpose by [Phase 26](phases/phase-26-side-by-side-diffs.md).** `ConflictBanner` ([`features/status/conflict-banner.tsx`](../../packages/app/src/features/status/conflict-banner.tsx)) still does exactly what Phase 8 shipped it to do — name the op, list the conflicted paths, gate Continue — and nothing more; resolving a conflict means leaving the app. Phase 26's own `canSplit()` returns `false` for a combined diff (*"three sides, no honest two-column reading"*) and its "Not in this phase" list named the actual prerequisite: per-hunk staging is *"a write path through the index with its own conflict semantics, and hanging it off a layout change is how a rendering phase becomes a data-loss phase."* This phase is that write path. **A** turns the raw marker text `readFileDiff` already returns on an unmerged path into structured context/ours/theirs/base regions; **B** ships the safe baseline — whole-file accept-ours/theirs, tested against merge *and* rebase since git inverts the two conventions between them; **C** is the real risk, a hunk-level `git apply --index` with zero precedent anywhere in the repo (`--ours`, `--theirs`, `apply --cached` all return zero grep hits today); **D** is the Studio UI, reusing `DiffCell`'s virtualization but deliberately not Phase 26's `SplitRow` model; **E** reuses Phase 34's `mstudio:council:run:start` unchanged for an advisory-only "suggest a resolution," never auto-applied; **F** wires it up. No manual free-text editing, no `rerere`, no binary/LFS/submodule conflicts — the Studio picks a side, it does not become an editor.

- **[Phase 46 · The lock screen, and a motion policy that holds](phases/phase-46-lock-screen-and-motion.md)** (38% · 18/48, [PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — **Themes B, D, E and F landed** (2026-09-03): a battery widget (pure reuse of `features/battery/`), a declared corner-slot layout replacing three hard-coded `absolute` positions, and the motion-policy fix three prior phases each punted — two hooks wrote `data-motion` and only one resolved `'system'`, so the default preference landed the literal string `'system'` on `<html>`, matching none of the app's guards; fixed at the source via a shared `resolveSystemMotion()`; every convertible guard in `styles.css` given a belt-and-braces `@media` + plain-attribute pair (CI's e2e shards caught a pure-`@media`-only first attempt breaking three existing specs that assert reduced motion without emulating the OS query), the duplicated `pill-shimmer` block deleted, and a unit test (`styles-motion-guards.test.ts`) that fails the day a `@keyframes` ships unguarded. Themes A (weather), C (clickable pills) and G (screenshot verification) remain `◻ TODO`. **The last two entries in [`_features.md`](../_features.md), and with them the file is empty.** The numbered list became 40–44, Improvements #2 went to [Phase 36](phases/phase-36-performance-diet.md) and #1 to [45](phases/phase-45-leak-audit.md); what remains is the whole **Lock Screen** section and Improvements #3, and they turn out to be the same surface. `features/screensaver/` is **1 344 lines across seven files that no phase doc has ever named** — a scan of all 45 returns zero hits for "lock screen", "screensaver" or "weather" — which is exactly where the FAB stood before [35](phases/phase-35-fab-mission-control.md): built ad hoc, working, untracked, drifting. It is also the app's densest animation, which is why the motion half belongs here. **Reduced motion has never been a theme of its own** — [37 F](phases/phase-37-fab-tab-glow.md), [39 G](phases/phase-39-status-bar-shortcut-rail.md) (still `◐ PARTIAL`) and [42 F](phases/phase-42-councils-layout.md) each carry it as a trailing **(S)**, and three phases ending on the same unfinished item is a policy with no owner and no test. Reading the tree produced the proof before any work started: **`@keyframes pill-shimmer` and `.pill-shimmer` are each declared twice** — byte-identical bodies at `styles.css` 143/152 and 539/548 — **with a different motion guard on each copy**, and two guard dialects coexist across 16 keyframes that are *not* equivalent, since `html[data-motion='reduced']` matches only a resolved attribute while the `@media` form honours the OS and still lets `Motion: full` opt back in. Underneath that, **two hooks write `data-motion` and only one of them resolves `'system'`** — the store's own default — so which value lands is effect-order dependent, and Theme E's first job is to go and look. The build half is mostly **reuse rather than invention**: battery already rides the metrics sample with `features/battery/` shipping the icons and panel, and weather clones `features/finance/`'s react-query shape down to the trap that file already documents (the global `staleTime: Infinity` is wrong for live data). The one thing that must not ship wrong is Theme C's: a pill clicked behind a passcode has to hold its destination across the pad, apply it on unlock and **drop it on cancel** — anything else is a lock-screen bypass. Theme F is what stops the whole thing rotting: a unit test failing the day a `@keyframes` arrives unguarded. Renderer-only by construction — no IPC, no main, nothing near `git-engine`.

- **[Phase 45 · The leak audit](phases/phase-45-leak-audit.md)** (91% · 32/35, [PR #51](https://github.com/bilo-io/midnite-studio/pull/51)) — **Themes E and F landed** (2026-09-03): the six leaks Theme B found, one commit each, plus Theme F's own verification run — which itself found and fixed two real issues in the harness (`memory-report.mjs` never re-exported the helpers `retention.spec.ts` needs, so the spec had never actually run before this pass; and `browser-tabs` at 10 cycles read a false-positive leak that Chromium's own subprocess-pool warm-up explains, confirmed by hand at 20 cycles). One human-only long-running-session pass stays open. **Improvements item 1 in [`_features.md`](../_features.md), and the sequel [Phase 36](phases/phase-36-performance-diet.md) left open by name.** That phase's own [`scripts/perf/README.md`](../../scripts/perf/README.md) carries a section titled *"What is not measured here"*, and renderer heap is in it: *"a heap number without the diff that produced it is not comparable to anything."* Correct — and it is why nothing has been measured since. So this phase turns the last human-only metric into a script with a budget, and the budget is a **slope** (bytes retained per cycle) rather than a level, because a leak is growth, not size. Phase 36 Theme F already swept `packages/app/src` and is not repeated; **`packages/desktop` has never been audited at all** — 35 top-level `Map`/`Set` allocations, six intervals, a `WebContentsView` map, a pty map, watchers and a socket client. A sweep found **six real leaks**, and `git-engine` clean throughout (bounded LRUs with TTLs everywhere). The headline is the broker's `scrollbackBySession`: **2 MB per terminal session, never deleted**, in the one process that *deliberately outlives the app* — `before-quit` detaches rather than kills, which is the Phase 30 guarantee — so it grows across restarts and is re-walked every 15 s writing files for sessions that ended long ago. Next is a cap applied in exactly one of the two places it is needed: `MAX_STORED_RUNS` trims the copy written to disk and is never assigned back to the in-memory array, at ~500 KB per council member per run, with `loop-runs.ts` repeating it verbatim. Nothing here ships in the product — measurement stays dev-side, reading `ps` from outside, with one narrow and argued exception.

- **[Phase 44 · Video Studio](phases/phase-44-video-studio.md)** (0% · 0/64) — **The last unclaimed item in [`_features.md`](../_features.md).** Items 1–4 became Phases 40–43; this is item 5, and with it the feature list is fully planned. A **Video** view that turns a brief into a rendered video — Remotion draws, Claude writes — modelled on the working [`~/Dev/ekko-videos`](file:///Users/bilolwabona/Dev/ekko-videos) repo, whose README is explicitly "the playbook for repeating the process". Its one load-bearing decision is that **this app ships no Remotion dependency at all**: [`electron-builder.yml`](../../packages/desktop/electron-builder.yml) puts only two esbuild bundles in the asar, and `@remotion/renderer` needs ~210 MB of on-disk binaries (a 193 MB `chrome-headless-shell` plus a 17 MB Rust FFmpeg compositor) against a dmg whose entire native payload today is dugite's 42 MB of git. So a video project is a **real npm project on disk, driven from outside** — exactly as `gh` and `claude` already are — and the app is a host and a project manager rather than a renderer. That buys the hard part for free: `remotion studio` is a localhost dev server, so **the timeline editor is Remotion's own, hosted in the `WebContentsView` engine [Phase 32](phases/phase-32-browser-engine-and-tabs.md) already built**. The contrast with [43](phases/phase-43-workflows-mvp.md) is the point — that phase hand-rolls an SVG canvas *because no upstream editor exists* for a workflow graph; one does for a video timeline. `@remotion/player` was considered and rejected on a real argument, not on size: it is renderer-legal, but it would make the user's video project a build input to this app. Nothing here touches `git-engine`.

- **[Phases 40–43 · Projects, the board, the council room, and workflows](phases/phase-40-github-projects.md)** (3% · 6/176 — Phase 40 Theme A landed 2026-09-02: `ForgeProject*` zod schemas, discriminated on `type`/`dataType`, in their own `domain/forge-project.ts`; channels + bridge envelope; 12 round-trip tests) — **Four planned phases, none started**, carved out of [`.midnite/_features.md`](../_features.md) items 1–4 and the first net-new *product* frontier since Phase 34. They stack: **[40](phases/phase-40-github-projects.md)** opens ProjectV2 — GraphQL-only, which is exactly why `gh-graphql.ts` exists — as a read-and-nudge Projects view; **[41](phases/phase-41-agentic-kanban.md)** turns that table on its side as a `[ Table | Board ]` mode in the same view, where a card can launch an agent and grows the `loop-glow` border while it runs, with a live xterm inside it; **[42](phases/phase-42-councils-layout.md)** is the smallest and the one two others want first — it builds the `panel-stack` history primitive the app lacks (councils' selection is one `useState`, which is why "back/forward" is not a CSS change) and moves councils to config-right / output-centre; **[43](phases/phase-43-workflows-mvp.md)** finally fills the `workflows` ViewId that has rendered `<Placeholder>` since Phase 19, with a hand-rolled SVG canvas and a real local `node:http` CRUD API to build against. 41 depends on 40; 42 and 43 are independent, and 42 unblocks 43 Theme F. Nothing here touches `git-engine`.

- **[Phase 39 · One rail, five chords and four loops](phases/phase-39-status-bar-shortcut-rail.md)** (95% · 61/64) — **All seven themes landed** ([PR #7](https://github.com/bilo-io/midnite-studio/pull/7), [PR #33](https://github.com/bilo-io/midnite-studio/pull/33), 2026-09-02); two human-only passes (a keyboard sweep, an eye-pass) remain at the phase's `## Verification` level. The status bar's left zone is now a **shortcut rail** whose job is teaching its own chords: **icon plus chord at rest, the name only while that surface is open or under the pointer**. Three toggles that were three verbatim copies of the same twenty lines — and had already drifted, two hard-coding `⌘`+letter in JSX so the same commands read `⌘G`/`⌘B` wherever `Mod` is `Ctrl` — collapsed behind one `StatusToggle`, and `displayChord` now owns the upper-casing. `⌘K` and `⌘P` **moved** out of the title bar (one control, one home) and diagnostics left the machine-vitals cluster, both landing behind separators `segments.ts` now *derives* from a new `group` field — which also fixed `browser-toggle`'s `priority: 5`, the inversion that had it render first and shed first. The separator rule is the phase's one real design find: placement is pure, but **pruning reads the rendered DOM**, because the `health` group renders *nothing* for a repo with no linter and an *Enable diagnostics* prompt for an untrusted one, and only that segment's own hooks know which — a `collapsible` group flag, the doc's own recommendation, would have made correctness depend on every future author remembering to declare it. After the agent count sit **four loop launchers**, `openFabTab` in one click, coloured from a new renderer-side `loop-glow.ts` because `DEFAULT_LOOPS.color` is a Tailwind `text-*` class no `box-shadow` can read; glow means *running* (amber when waiting), an outline means *this tab is open*, and the strip **collapses to one glyph at rest**. Its pulse ships **gated on window focus** rather than unmeasured — a permanently mounted animation is precisely what Phase 36 Theme E was written about. `moon run :typecheck :lint :test` green at 2 722 tests; the CI-blocking e2e set 220/0; the 6 remaining `fab-loops` failures baselined as **identical on `origin/main`**, which is what caught the one real regression (an `aria-label` colliding with the waiting notice under Playwright's substring name matching).

- **[Phase 38 · Paying off the e2e suite](phases/phase-38-e2e-suite-repair.md)** (86% · 51/59) — Themes A-F fully landed; G and I partially. **A** (PR #12) fixed a Phase-36 lazy-chunk pty-delivery race shared by seven `fab-loops`/`terminal-links` failures. **B**'s ten `changes-panel` failures were not the doc's two guesses: the collapsed nav rail's hover-expand reflow moved the "Changes" link out from under Playwright's `.click()` before it landed, so nothing ever rendered — fixed at the spec level; a real `DiffCell` gutter-count regression from Phase 26 was fixed in product code alongside it. **C** confirmed two real product bugs — a focus trap stealing focus from `ConfirmDialog`'s Cancel button, and a `min-w-0` flex-shrink overflow on a folded repo's summary pill — plus a stale checkout-persistence assertion that was actually a deliberately-landed feature. **E** found the same accessible-name substring collision (`getByRole` matching "System" against "System Health", "Update" against "App Updates") in three separate control pairs. **F** found the nav-rail hover/click-reflow hazard a second time (independently, in `review-threads-shots`) plus one more real regression: "Load the full log" had been silently truncated to "Load full log" by an unrelated PR. `G`, `H` and `I` remain (G/I partially).
- **[Phase 37 · A glow that knows which tab](phases/phase-37-fab-tab-glow.md)** (93% · 41/44) — All six themes landed in one batch ([PR #8](https://github.com/bilo-io/midnite-studio/pull/8), 2026-09-02). The FAB panel's rotating rainbow border now grows an **inner glow**: a blurred conic layer masked to the rim so it falls off smoothly to nothing before the centre, breathing rather than static, and pulsing at a cadence tied to loop state. The glow is **tab-reactive** — each of the four loops claims the 180° of ramp centred on its own hue (Medic→rose, Watchdog→amber, Automate→emerald, Innovate→blue), and the far half is subtracted, with border and glow driven from one shared arc mask so they never disagree; the collapsed FAB button and each tab's own Start/Stop button pick up the same arc for free. Also tokenised the seven-stop rainbow that used to sit hard-coded in five places. Three items stay open for a human on real hardware: this sandbox had no Accessibility permission to script the panel open in a packaged build, and its own idle-CPU baseline swung 22%→55% of a core across two runs of unmodified `main` — too noisy to trust a delta, so the mitigation (a window focus/blur gate on the glow's rotation and pulse) shipped unconditionally rather than after a measurement.
- **[Phase 36 · Faster, lighter, same app](phases/phase-36-performance-diet.md)** (91% · 58/64 · refined x1) — Seven of eight themes landed (2026-09-01, local). The app's first dedicated performance phase, and it kept its own rule: every landed item carries a number. **Entry chunk 2 481.3 → 1 084.7 KB** (−56%) by putting thirteen views, xterm and the markdown pipeline behind lazy boundaries under one Suspense; **`ready-to-show` 683 → 570 ms** by taking the synchronous login-shell probe (a median 284 ms of blocked main thread) off the boot path and parallelising the three `whenReady` chains; **the broker went from 12.74% to 1.16% of a core per MB/s** — 11× less CPU per byte — once pty output was coalesced into one frame per 16 ms instead of one socket write *and* one whole-buffer scrollback realloc per chunk; and the `ps` probe's cadence doubled after being costed at 4.08% of a core. `moon run app:perf` is the phase's legacy: strict budgets plus absence assertions that fail the day someone re-adds a static import. Four of the doc's items were **acquitted rather than churned**, each with the measurement that acquits it — the three handler-module deferrals, the `@dnd-kit` split, `manualChunks`, and a `lucide-react` assertion a dependency makes unassertable. Three items stay open: one `useAutoFetch` test that belongs to Theme E, and two human passes (a screenshot diff, an Activity Monitor idle check).
- **[Phase 35 · FAB Mission Control](phases/phase-35-fab-mission-control.md)** (98% · 39/40) — All five themes landed (2026-09-01, local). Made the (previously untracked, ad-hoc) FAB panel a real loop console: each tab owns its own in-panel terminal session (`surface: 'fab'`, never in the main housing), a checkbox prompt composer per loop, Start↔Stop with the gradient glow pulse, and a mission-control layer — FAB badges, waiting-toasts, a capped run history. Also retires the FAB's hard-coded prompts by pointing each loop at the `DEFAULT_AGENT_SKILLS` entry it runs, so there is one prompt store rather than three. Themes F–I (PR #3) then closed three of the four open verification items and as much of the fourth as a browser reaches — and found, in the doing, that a persisted loop never came back unless you opened the *main* terminal panel first. One item stays open for a human: quit and relaunch mid-run against a **packaged** build.
- **[Phase 34 · Agent Councils](phases/phase-34-agent-councils.md)** (100% · 34/34) — Landed. Fills the nav/palette-reserved "Councils" slot: a standing panel of AI members answers a prompt in parallel, synthesized into one distilled write-up. MVP scope — one format (brainstorm), global (not per-repo), a 3-agent member pool (`agy`/`codex`/`opencode`), and an explicit auto-send exception to the app's usual type-but-don't-send agent-launch posture. Two manual passes (a real end-to-end run, a copy review) remain for a human.
- **Phases 25–33 all landed** — search/blame, split diffs, status bar + browser pane, worktrees-first sidebar, markdown slides, the detached terminal broker, interactive rebase, the real browser engine, and the installable app + CLI.
- **[24 · The explorer learns to write](phases/phase-24-writable-explorer.md)** (78% · 43/55) **and [23 · A command palette](phases/phase-23-command-palette.md)** (76% · 42/55) are both closed as DONE with their remainders logged in [`outstanding.md`](outstanding.md).
- **[22 · Stash, the reflog, and writes you can take back](phases/phase-22-stash-and-safety-net.md)** (100% · 56/56, [PR #51](https://github.com/bilo-io/midnite-studio/pull/51) + [PR #52](https://github.com/bilo-io/midnite-studio/pull/52)) — **Themes B, E, F and G landed** (2026-09-03, PR #51), closing the four surfaces the prior audit found stubbed: stash reaches the **sidebar** (a `Stashes` `TreeSection`, `hideWhenEmpty={false}` so its own "Stash changes" action stays reachable at zero count) and the **Changes view** (a toolbar action + per-row action, a dedicated `StashPushDialog` rather than the generic one-field prompt); **force-push** ships as `--force-with-lease` only, gated behind a new `Settings ▸ Git Safety` opt-in and offered only from the per-ref badge menu once a plain push has already been rejected as non-fast-forward; and the **reflog** is real — `readReflog` via `--date=unix` (the doc's own `%gt` placeholder doesn't exist in git, confirmed directly), replacing Theme H's honest `ReflogList` placeholder with a ref selector, action filter, and checkout-able/copy-able list. **Themes C and D landed** (2026-09-03, PR #52): stashes are pseudo-rows above the graph (`StashRows`, the same dashed grammar `UncommittedRow` set) and the inspector reads all three of a stash's parts — tracked, index and untracked — over one `TreeSection`-per-part list rather than tabs, with a new discriminated `graphSelection` in `ui-store.ts` routing both the graph and the sidebar into the same panel. Theme H stays `◐ PARTIAL` — its narrowed starter-subset scope is otherwise complete, so the phase counts 56/56 with H's own remainder left as-is rather than resolved here.



Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in [`outstanding.md`](outstanding.md).

## Phases

<!-- Newest-first. Status: ✅ DONE · 🔄 WIP · ◻ TODO. Done = checked/total in-scope items; Progress = 10-cell bar. -->

| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [49 · Onboarding a repo: Setup and Update](phases/phase-49-repo-onboarding.md) | 🔄 WIP | — | 28/33 | `████████░░` | 85% | E | — |
| [48 · Apply suggested-change blocks](phases/phase-48-apply-suggested-changes.md) | 🔄 WIP | — | 4/20 | `██░░░░░░░░` | 20% | — | B C D E |
| [47 · Conflict Resolution Studio](phases/phase-47-conflict-resolution-studio.md) | ◻ TODO | — | 0/23 | `░░░░░░░░░░` | 0% | — | A B C D E F |
| [46 · The lock screen, and a motion policy that holds](phases/phase-46-lock-screen-and-motion.md) | 🔄 WIP | — | 18/48 | `████░░░░░░` | 38% | A C | G |
| [45 · The leak audit](phases/phase-45-leak-audit.md) | 🔄 WIP | — | 32/35 | `█████████░` | 91% | — | F (human long-running-session pass) |
| [44 · Video Studio](phases/phase-44-video-studio.md) | ◻ TODO | — | 0/64 | `░░░░░░░░░░` | 0% | — | A B C D E F G H |
| [43 · Workflows](phases/phase-43-workflows-mvp.md) | ◻ TODO | x1 | 0/77 | `░░░░░░░░░░` | 0% | — | A B C D E F G H I |
| [42 · Councils, rearranged](phases/phase-42-councils-layout.md) | ✅ DONE | x1 | 38/44 | `█████████░` | 86% | — | — |
| [41 · Agentic Kanban](phases/phase-41-agentic-kanban.md) | 🔄 WIP | x1 | 43/57 | `████████░░` | 75% | H | — |
| [40 · GitHub Projects](phases/phase-40-github-projects.md) | 🔄 WIP | x1 | 38/53 | `███████░░░` | 72% | — | G (human screenshots + real-board pass) |
| [39 · One rail, five chords and four loops](phases/phase-39-status-bar-shortcut-rail.md) | 🔄 WIP | — | 61/64 | `██████████` | 95% | — | Verification (human keyboard + eye pass) |
| [38 · Paying off the e2e suite](phases/phase-38-e2e-suite-repair.md) | 🔄 WIP | — | 51/59 | `█████████░` | 86% | G I | H |
| [37 · A glow that knows which tab](phases/phase-37-fab-tab-glow.md) | 🔄 WIP | — | 41/44 | `█████████░` | 93% | — | F (human idle-cpu + resize check) |
| [36 · Faster, lighter, same app](phases/phase-36-performance-diet.md) | 🔄 WIP | x1 | 58/64 | `█████████░` | 91% | — | G (human passes) |
| [35 · FAB Mission Control](phases/phase-35-fab-mission-control.md) | 🔄 WIP | — | 39/40 | `██████████` | 98% | — | — |
| [34 · Agent Councils](phases/phase-34-agent-councils.md) | ✅ DONE | — | 34/34 | `██████████` | 100% | — | — |
| [33 · Application Installation, CLI Tool & Desktop Integration](phases/phase-33-installable-app-and-cli-integration.md) | ✅ DONE | x1 | 44/44 | `██████████` | 100% | — | — |
| [32 · The browser gets an engine, and the tabs to fill it](phases/phase-32-browser-engine-and-tabs.md) | ✅ DONE | — | 99/99 | `██████████` | 100% | — | — |
| [31 · Interactive Rebase Builder & Graph Sequence Editor](phases/phase-31-interactive-rebase.md) | ✅ DONE | — | 18/18 | `██████████` | 100% | — | — |
| [30 · A terminal that survives you](phases/phase-30-terminal-hardening.md) | ✅ DONE | x2 | 91/91 | `██████████` | 100% | — | — |
| [29 · Markdown slides, everywhere markdown already renders](phases/phase-29-markdown-slides-viewer.md) | ✅ DONE | — | 21/21 | `██████████` | 100% | — | — |
| [28 · Worktrees first, and the section tree that can say so](phases/phase-28-sidebar-section-tree.md) | ✅ DONE | — | 62/62 | `██████████` | 100% | — | — |
| [27 · The footer becomes a status bar, and the browser it makes room for](phases/phase-27-status-bar-and-browser-panel.md) | ✅ DONE | x1 | 90/90 | `██████████` | 100% | — | — |
| [26 · Side by side, and the room to show it](phases/phase-26-side-by-side-diffs.md) | ✅ DONE | — | 68/68 | `██████████` | 100% | — | — |
| [25 · Search everywhere, and the blame that explains it](phases/phase-25-search-everywhere.md) | ✅ DONE | x1 | 101/101 | `██████████` | 100% | — | — |
| [24 · The explorer learns to write, and to search](phases/phase-24-writable-explorer.md) | ✅ DONE | — | 43/55 | `████████░░` | 78% | — | — |
| [23 · A command palette, and the registry that can feed it](phases/phase-23-command-palette.md) | ✅ DONE | — | 42/55 | `████████░░` | 76% | — | — |
| [22 · Stash, the reflog, and writes you can take back](phases/phase-22-stash-and-safety-net.md) | 🔄 WIP | — | 56/56 | `██████████` | 100% | — | H (partial) |
| [21 · Agent roster + terminal identity](phases/phase-21-agent-roster-and-terminal-identity.md) | ✅ DONE | — | 46/46 | `██████████` | 100% | — | — |
| [20 · Reviews page & unified diff syntax highlighting](phases/phase-20-reviews-page.md) | ✅ DONE | — | 45/45 | `██████████` | 100% | — | — |
| [19 · Dashboard, Actions and Tests as views](phases/phase-19-dashboard-actions-tests.md) | ✅ DONE | — | 76/76 | `██████████` | 100% | — | — |
| [18 · Footer system monitor + repo diagnostics](phases/phase-18-footer-monitor-diagnostics.md) | ✅ DONE | — | 54/54 | `██████████` | 100% | — | — |
| [17 · Repositories workbench + forge](phases/phase-17-repos-workbench.md) | ✅ DONE | — | 48/48 | `██████████` | 100% | — | — |
| [16 · Folder explorer, preview pane + settings pages](phases/phase-16-explorer-and-settings-pages.md) | ✅ DONE | — | 41/41 | `██████████` | 100% | — | — |
| [15 · Multi-terminal sessions + agents](phases/phase-15-multi-terminal-sessions.md) | ✅ DONE | — | 39/39 | `██████████` | 100% | — | — |
| [14 · Graph themes + avatars](phases/phase-14-graph-themes.md) | ✅ DONE | — | 28/28 | `██████████` | 100% | — | — |
| [13 · UI polish](phases/phase-13-ui-polish.md) | ✅ DONE | — | 26/26 | `██████████` | 100% | — | — |
| [12 · Commit inspector + live badges](phases/phase-12-commit-inspector.md) | ✅ DONE | — | 12/12 | `██████████` | 100% | — | — |
| [11 · Packaging + docs](phases/phase-11-packaging.md) | ✅ DONE | — | 12/12 | `██████████` | 100% | — | — |
| [10 · Watcher / live refresh](phases/phase-10-watcher.md) | ✅ DONE | — | 9/9 | `██████████` | 100% | — | — |
| [9 · Integrated terminal + keybindings](phases/phase-9-terminal-and-keybindings.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [8 · Drag-drop ops + conflicts](phases/phase-8-drag-drop-ops.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [7 · Graph interactions](phases/phase-7-graph-interactions.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [6 · Status / stage / commit / sync](phases/phase-6-status-and-sync.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [5 · Commit graph, read-only](phases/phase-5-commit-graph.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [4 · Repo open/list + worktree sidebar](phases/phase-4-repos-and-worktrees.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [3 · Electron shell boots](phases/phase-3-electron-shell.md) | ✅ DONE | — | 15/15 | `██████████` | 100% | — | — |
| [2 · Lane layout engine](phases/phase-2-lane-layout.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [1 · Shared contracts + git-engine parsers](phases/phase-1-contracts-and-parsers.md) | ✅ DONE | — | 14/14 | `██████████` | 100% | — | — |
| [0 · Scaffold](phases/phase-0-scaffold.md) | ✅ DONE | — | 17/17 | `██████████` | 100% | — | — |

## Theme key

<!-- Each phase currently carries a single theme A = its full deliverables checklist. Split into
     lettered themes if a phase gets parallelised. -->

### [Phase 49 — Onboarding a repo: Setup and Update](phases/phase-49-repo-onboarding.md)

*The midnite menu's first two entries that are about the **repository** rather than about an agent
working in it. Nothing under `packages/` has ever written a `.midnite/` directory — the only prior
art is a skill that is stale by a rename (`midnite-setup` still emits `todo/`) — so A builds the
checked-in kit and stops the app and the skill disagreeing again; B and C are the contract and the
writer, where a hash manifest in `.midnite/settings.json` turns a re-run into an upgrade rather
than a guess and a file with no provenance is never overwritten; D is the modal that makes "what
will change" answerable before a byte lands. E is the honest half of Update: `install-local.mjs`
`ditto`s **this** repo's build into `/Applications`, so the command means something in exactly one
checkout, and the leaf detects that and disables itself with a reason everywhere else.*

- ✅ **A** — The onboarding kit: a checked-in `templates/midnite/` skeleton (tracker, eight repo-agnostic skills, agent-file stubs, `.agents`/`.codex` mirrors), shipped into the packaged bundle via `electron-builder.yml`, plus un-staling `midnite-setup/SKILL.md` so app and skill emit the same layout. (PR #51)
- ✅ **B** — The contract in `shared`: `ScaffoldPlan`/`ScaffoldEntry`/`ScaffoldApplyResult` zod schemas, the `.midnite/settings.json` hash manifest, two IPC channels (keyed by `repoId`, not a raw path) on the house `{ok}` envelope — zod only, no template bytes. (2026-09-03)
- ✅ **C** — Plan and apply in main: sha256 classification into create/unchanged/stale/locally-edited, confinement through Phase 24's existing `fs-scope-write.ts` (a new `ensureConfinedDirs` there, since a fresh repo has neither `.claude/skills/<name>/` nor `.midnite/tasks/phases/` yet), re-check before write, manifest written last so a crash leaves the truth on disk. `unchanged` corrected to a direct hash match against the template — requiring the manifest too would call a byte-identical file something else whenever the manifest disagreed, for no different outcome. (2026-09-03)
- ✅ **D** — The Setup dialog: a modal preview with counts by status, locally-edited rows visibly excluded, and re-run wording that reads as an upgrade — no new modal system, no new ViewId (not literally `ConfirmDialog`, whose `body`/`warnings` props can't express a grouped file list). Found building it: rendered inline inside the (virtualized) repo row, its `fixed inset-0` overlay was contained by a transformed ancestor instead of the viewport — the screenshot caught it, RTL never could — fixed with a `createPortal` to `document.body`. (2026-09-03)
- ◐ **E** — Update, capability detection and the menu, partial: a sixth `project` group, `isMidniteStudioCheckout` gating Update with a `disabledReason` elsewhere, and the command **typed, not executed**. Two real corrections: `AgentCommandId`/`DEFAULT_AGENT_SKILLS` do NOT widen — Setup and Update are built directly in `midnite-menu.tsx`, since neither is a user-configurable skill the way every other leaf is; and `startAgent` is the wrong mechanism entirely — it always wraps its prompt as an argument to an agent CLI (`claude '…'`), which would have typed `claude 'moon run desktop:install-local'` instead of the bare command. `repo-lifecycle.ts`'s `runLifecycleAction` (the doc's own precedent) is what Update actually mirrors: a plain shell session, command queued raw. Still open: the packaged-build pre-flight surfacing in the menu, and the packaged-build assertion of Theme A's own risk. (2026-09-03)

### [Phase 48 — Apply suggested-change blocks](phases/phase-48-apply-suggested-changes.md)

*GitHub's ` ```suggestion ` fence, rendered specially the way `slide-code.tsx` already renders any
tagged fence, then applied straight to the local working tree rather than pushed as a commit
through GitHub's API — the local-first move the web UI can't make. A and B parse the fence and
resolve the multi-line range `startLine`/`line` already describe but nothing reads yet; C is the
phase's real weight, detecting whether the local file still matches what the suggestion assumes,
since the existing outdated-thread check only ever covered drift on GitHub's side; D renders the
preview and wires Apply to Phase 24's existing whole-file write, never auto-staging; E wires it up.*

- ✅ **A** — Suggestion detection: a pure `extractSuggestion(body)` parsing the comment's markdown AST for a ` ```suggestion ` fence, prose-tolerant, tested against multiple/absent/wrapped cases. (PR #51)
- ◻ **B** — Line-range resolution: `(startLine ?? line)` through `line`, `RIGHT`-side only — the first consumer of `startLine`, which every existing thread renderer currently ignores.
- ◻ **C** — Local-file divergence detection *(the phase's real weight)*: compares the file's current content at the resolved range against what the suggestion assumes, disabling Apply with a named reason on mismatch, deletion, or an already-`outdated` thread — stricter than and separate from `fsWriteFile`'s own staleness check.
- ◻ **D** — Rendering + the write: a `code`/`pre` override on `CommentBody` styled off `DiffCell`'s tokens, an Apply button calling the existing `fsWriteFile` IPC with no new write channel, never auto-resolving the thread.
- ◻ **E** — Wiring + verification: the full apply path end to end, each Theme C refusal path asserted individually, and repo-scope containment reused from `fs-scope-write.ts`.

### [Phase 47 — Conflict Resolution Studio](phases/phase-47-conflict-resolution-studio.md)

*The gap [Phase 8](phase-8-drag-drop-ops.md)'s conflict banner left open and
[Phase 26](phase-26-side-by-side-diffs.md) deliberately declined to close in passing — resolving a
conflict today means leaving the app entirely. A is the parser that turns opaque markers into
structure; B is the safe whole-file baseline; C is the phase's real risk, a net-new write path
through the index for hunk-level patches; D is the UI those three feed; E reuses Phase 34's
council-run IPC for an advisory-only suggestion; F wires it up and proves the ours/theirs
inversion across merge vs. rebase.*

- ◻ **A** — Conflict data model + parser: a new `shared/src/domain/conflict.ts` and `git-engine/src/parsers/conflict-parser.ts` splitting a combined diff's raw marker text into structured context/ours/theirs/base regions, supporting both the default and `diff3` conflict styles.
- ◻ **B** — Whole-file resolution: `resolveConflictWholeFile` reads `:2:`/`:3:`/`:1:` blobs and stages via the existing `stagePaths` — tested against merge **and** rebase, since git inverts "ours"/"theirs" between them.
- ◻ **C** — Hunk-level patch application *(the phase's biggest risk — zero precedent anywhere in the repo)*: synthesizes a single-hunk patch from a `ConflictRegion` and applies it with `git apply --index`, leaving sibling hunks in the same file still conflicted until each is resolved.
- ◻ **D** — The Studio UI: a new component reusing `DiffCell`'s virtualization/highlighting but **not** `SplitRow`'s two-way model (Phase 26 excluded combined diffs from it on purpose); wires into `ConflictBanner`'s path list.
- ◻ **E** — Agent-assisted suggestion: reuses Phase 34's `mstudio:council:run:start` unchanged; advisory text only, never auto-applied.
- ◻ **F** — Wiring + verification: e2e mixing a whole-file and a hunk-level resolution in one merge, plus the ours/theirs inversion assertion at the UI level too.

### [Phase 46 — The lock screen, and a motion policy that holds](phases/phase-46-lock-screen-and-motion.md)

*Empties [`_features.md`](../_features.md): its whole **Lock Screen** section plus Improvements #3,
the last two entries once 40–44 took the numbered list, Phase 36 took #2 and Phase 45 took #1. The
two halves are one surface — `features/screensaver/` is **1 344 lines across seven files that no
phase doc has ever named** (a scan of all 45 returns zero hits for "lock screen", "screensaver" or
"weather"), and it is also the app's densest animation. Reduced motion has meanwhile never been a
theme of its own: **37 F, 39 G (still `◐ PARTIAL`) and 42 F each carry it as a trailing (S)** —
three phases ending on the same unfinished item is a policy with no owner and no test. Reading the
tree found the proof: `@keyframes pill-shimmer` and `.pill-shimmer` are **each declared twice**
(styles.css 143/152 and 539/548), with **different guards on each copy**. Renderer-only — battery
already rides the metrics sample and weather is a `fetch`, so no IPC, no main, no `git-engine`.*

- ◻ **A** — Weather, top centre. The only net-new module, and it copies `features/finance/` rather than inventing: same react-query shape, and the same trap stated in that file — the global `staleTime: Infinity` is wrong for live data, so the query sets its own. **Open-Meteo, keyless** (finance ships both a keyed and a keyless path; take the keyless one), location a stored preference that renders **nothing** until set, and the query **gated on the lock screen being open** — an ungated 15-minute poll for an unseen surface is what Phase 36 Theme E was written about.
- ✅ **B** ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — Battery, bottom right, and the audit's happiest find: **pure reuse**. `features/battery/` already ships the icons, styling and panel, and `BatteryReadingSchema` is already an optional field on the metrics sample — no new IPC, no new sampling, no new schema. The only real decision is the corner collision with the existing sysmon widget.
- ◻ **C** — Pills that navigate, where the destination is the easy half. The four `PILLS` are `<span>`s and become **buttons** with real destinations (repos → repos, agents → reveal the terminal, PRs → reviews). Two things must be right: the click must not be swallowed by `LockScreen`'s root `onClick`, and **intent must survive the passcode pad** — held across `PasscodeUnlockDialog`, applied on unlock, **dropped on cancel**. Navigating after a cancelled unlock is a lock bypass, and it is the one thing here that must not ship wrong.
- ✅ **D** ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — The corner layout becomes data: one declared slot map replacing three hard-coded `absolute` positions across two files, *before* this phase adds two more surfaces to them. `LockScreen`'s existing `corners` prop is already the right seam. A map, **not** a drag-and-drop layout editor.
- ✅ **E** ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — The motion audit the last three phases each punted. **One dialect** — `@media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) … }`, the only form that honours the OS *and* lets an explicit `Motion: full` opt back in — the duplicate `pill-shimmer` block deleted, all **16 `@keyframes` swept against the 18 guard rules** with a published table, and `NeuroCloudBackground` taught to consult the setting itself, since a canvas rAF loop is what CSS guards cannot reach. First job is to observe which value actually lands on `<html>`: **two hooks write `data-motion` and only one resolves `'system'`**, which is the store's default.
- ✅ **F** ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — A guard that can't be forgotten, and the reason this is a phase rather than a drive-by CSS fix. A unit test over `styles.css` asserting every `@keyframes` is guarded or explicitly allowlisted **with its reason**, plus a no-duplicate-name assertion for the bug this phase found by reading. Modelled on `icon-names.test.ts`, the in-repo precedent for a convention with a test behind it. Three phases left a motion item unfinished because nothing failed when they did.
- ◻ **G** — Verification: shots in **both motion modes** and both themes, `ControlOrMeta` never a hard-coded `Meta` (the Phase 38 lesson that cost a shard 22 minutes), and only this phase's PNGs committed — `outstanding.md` records that screenshots are not byte-reproducible and a full run rewrites ~40 of them.

### [Phase 45 — The leak audit](phases/phase-45-leak-audit.md)

*Closes the one gap [`scripts/perf/README.md`](../../scripts/perf/README.md) declares open in a
section called "What is not measured here": renderer heap, which *"needs a DevTools heap snapshot …
because a heap number without the diff that produced it is not comparable to anything."* That
sentence is right, and it is why nothing has been measured since — so this phase does for retention
what Phase 36 did for startup, bundle and idle CPU: turns the last human-only metric into a script
with a budget, then spends the instrument on what it finds. Phase 36 Theme F already swept the
renderer and is not repeated; **`packages/desktop` was never audited** and holds 35 top-level
Map/Set allocations. A sweep found **six real leaks, two byte-heavy** — and `git-engine` clean
throughout.*

- ✅ **A** — The instrument: `memory-report.mjs`, driven through the existing `electron-run.mjs` (**not** `_electron.launch` — "one launcher, one number"), attaching CDP to the already-launched app to drive the four named actions through the real bridge, measuring main, renderer and broker **separately**, and reporting a **slope** — bytes retained per cycle — rather than a level. Ships an `MSTUDIO_PERF` heap sampler in main and the broker too. (PR #49)
- ✅ **B** — The sweep with verdicts, applying Theme F's own rule verbatim rather than inventing a second one — table in the phase doc. `git-engine` audited and confirmed clean; a bounded documented cache is a **pass**, not a thing to cap on sight. (PR #49)
- ✅ **C** — The headline leak, and the only one whose severity comes from *where* it lives: the broker's `scrollbackBySession` was **2 MB per session, never deleted**, in a process that deliberately **outlives the app**. Fixed with a new `ControlMessage` arm plus delete-on-exit/kill and a reconcile-on-reconnect backstop — verified with unit tests confirmed to fail against the unfixed code, since the leak turned out too small to see over a live RSS sample. (PR #49)
- ✅ **D** — Two run histories capped on disk and unbounded in memory: `council-service.ts` and `loop-runs.ts` both trimmed only the copy written to disk and never reassigned the trimmed array back. Fixed by capping at write time in both, independent of the store's own trim. (PR #49)
- ◐ **E** — The small ones, each with the assertion that catches it: `runLocks` never pruned (the `evictIfCurrent` idiom already exists in `write-queue.ts`), two `.then`-without-`.catch` sites that retain a handle *and* raise an unhandled rejection, `dropKey` missing one of thirteen per-session records (fixed **structurally** — its `Pick<>` was a hand-written list a fourteenth would slip past just as quietly), a closed browser tab's un-detached `webContents` listeners, and an unbounded `workflowCache` now sharing the run cache's LRU. **Partial**: `sessionExitHooks`'s own append-only gap is recorded but left open — no second caller has appeared to justify an `off`. (PR #51)
- ◐ **F** — Verification, run for real: `retention.spec.ts` extended to `repo`/`browser-tabs` (`terminal` already there) and actually executed — finding and fixing a harness export bug and a false-positive `browser-tabs` slope (10-cycle Chromium subprocess-pool warm-up, confirmed flat at 20). Every Theme C–E fix's assertion verified to fail against the unfixed code. **Partial**: the human long-running-session pass is still open. (PR #51)

### [Phase 44 — Video Studio](phases/phase-44-video-studio.md)

*The fifth and last product feature in [`_features.md`](../_features.md), after 40–43 took items
1–4. A Video view that turns a brief into a rendered video, with Remotion drawing and Claude
writing. Its one load-bearing decision is that **the app ships no Remotion dependency**: a video
project is a real npm project on disk, driven from outside exactly as `gh` and `claude` already
are, because the asar carries only two esbuild bundles and `@remotion/renderer` needs ~210 MB of
on-disk binaries. So the app is a host and a project manager, and the timeline editor is Remotion
Studio itself — a localhost dev server, hosted in the `WebContentsView` engine Phase 32 already
built. A is the contract, B–C what it finds and starts, D the room, E–G what you do in it, H the
wiring.*

- ◻ **A** — Shared contracts: `Video*` zod schemas mirroring `ekko-videos`' `project.json` verbatim so a project folder is portable in both directions; studio status as a discriminated union, because a studio with no URL yet is a state, not a null field.
- ◻ **B** — Projects are **discovered, not registered**: scan `<root>/projects/*/project.json`, jailed through the existing `fs-scope.ts`. The store persists one setting — the root. Mirrors drift; pointers do not.
- ◻ **C** — Toolchain probe through the existing `login-shell.ts`, and a studio host owning at most one `remotion studio` per project. Port discovery **reads stdout rather than assuming 3000**, and a studio that dies transitions to a rendered `failed` state.
- ◻ **D** — The Video view: a new `ViewId` (which touches **eight** files — the doc lists all of them, `nav-icons.ts` being an exhaustive `Record` that fails typecheck), three panes, and the studio hosted in the centre via the browser pane's own `use-browser-bounds`.
- ◻ **E** — Renders through the existing `process-runner.ts`, which already does detached spawn and process-group kill — the thing that stops an orphaned headless Chrome. Progress parsed into real frame counts; output read from disk, not counted in a store that can disagree.
- ◻ **F** — Claude in the loop: the two `ekko-videos` skills (brief → editorial script → compositions), launched **type-don't-send** per the app's standing posture, reusing Phase 35's prompt store rather than hard-coding a string.
- ◻ **G** — Assets: run the project's own `sync-assets.mjs`, list `assets/` and `input/` read-only. Nothing writes.
- ◻ **H** — Wiring: handlers, preload, queries, palette, a Settings entry for the root, and the four unit tests covering the places this phase can be wrong silently — the port parser, the progress parser, the `project.json` round-trip, and the containment refusal.

### [Phase 43 — Workflows](phases/phase-43-workflows-mvp.md)

*Fills the `workflows` ViewId that has rendered `<Placeholder>` since Phase 19, the way Phase 34
filled the identically-reserved Councils slot. A workflow is a graph of five node kinds, built on
a hand-rolled SVG canvas and run manually; its centre of gravity is HTTP, so D ships a real local
`node:http` CRUD API to build against — a workflow engine with nothing to call is a diagram. A is
the contract, B the engine, C–D what it calls, E–F how you build one, G–H how you watch and keep
it.* **Refined x1 (2026-09-02):** 57 → 77 items, every open decision resolved, and **four false
precedents corrected** — there is no pan/zoom anywhere in the app and the commit graph is not a
canvas; `council-runner.ts` emits no events at all (councils poll); `WORK_IN_PROGRESS` is a sidebar
filter preset a global view already has right, not a placeholder; and `.loop-run-glow` is **not**
covered by Phase 37's focus gate. E is re-tagged the phase's largest risk: pan/zoom, free 2-D drag,
multi-select and undo/redo each have zero precedent in this renderer.

- ◻ **A** — Shared contracts: `Workflow*` zod schemas, nodes as a discriminated union of exactly five kinds, channels + one bare `workflowRunChanged` event. Copies `GitOpResult`'s nested-union shape exactly — a flat `discriminatedUnion('ok')` is a zod error — and adds the opt-in `describe('workflow contract')` block to `ipc.test.ts` without which a channel ships unvalidated.
- ◻ **B** — The engine: Kahn topological order, parallel branches capped at 4 in flight, cycle detection before the first node runs, a 120 s per-node deadline via the `trackOneShot` race, and `withRunLock` copied verbatim — including the never-nest rule that avoids deadlocking it against itself, and the `runLocks` prune the councils original still lacks.
- ◻ **C** — The HTTP executor: every verb, a written-down `{{node.field}}` grammar with a `{{{{` escape where an unresolved reference **fails the node** rather than substituting empty, a 512 KB cap reusing `appendCapped`'s visible `truncated` flag, and `transform`/`condition`/`delay` bounded in schema.
- ◻ **D** — The demo CRUD API: `node:http` on `127.0.0.1` and an **ephemeral port** (`listen(0)`) — the draft said both that and a fixed `:7331` — in-memory collections capped at 1 000, every verb and the right status codes. On demand, off by default, one click to paste its base URL into a node.
- ◻ **E** — The canvas *(the phase's largest risk)*: SVG nodes + bézier edges, with the geometry split pure the way `metric-path.ts` is. `edgePath` is the bezier to **copy, not call** — its control axis is vertical and a workflow flows sideways. Pan/zoom is defined here, not inherited; drag is **raw pointer events, not `@dnd-kit`**; culling is a rect filter, not a virtualizer.
- ◻ **F** — The node inspector: forms driven off the `kind` union in the app's **first** right-hand config pane, live validation that reuses the node's own zod schema, and an interpolation helper listing genuine upstream fields. Hoists the scattered form primitives into `components/form/` rather than making a third copy. Does **not** build or consume `panel-stack`.
- ◻ **G** — Runs: the canvas read-only with live status by **push-then-re-fetch** (councils' 1 200 ms poll would look frozen), capped at 200 globally, and the `loop-glow` idiom — this theme owns hoisting `useWindowFocusGate` out of `fab-panel.tsx` and extending the paused selector, because the gate does not currently reach it.
- ◻ **H** — Persistence + the list: two `*-store.ts` files under `userData` (separate write profiles), `workflow-handlers.ts` taking the `getWindow` thunk, hooks feature-local rather than in `queries.ts`, and `workflows-view.tsx` replacing the `<Placeholder>` — inserted **before** `app.tsx:961`'s repo guard, or a global view shows `EmptyWorkspace`.
- ◻ **I** — Wiring + verification: `view-sections.ts` needs **no change**, the palette view row **already exists**, so what is actually new is a chord-less `workflow.run` command, a settings page (four enforced edits across three files), e2e, and one real pass with **no network**.

### [Phase 42 — Councils, rearranged](phases/phase-42-councils-layout.md)

*Builds the `panel-stack` history primitive the app lacks, then moves Councils to three panes —
navigation left, output centre, configuration right — and gives members drag-reorder. Renderer-only:
no IPC, no main-process change.* **Refined x1 (2026-09-02):** 36 → 43 items, all three open
decisions resolved, and the motion story rewritten after two of the doc's premises turned out
backwards. The global reduced-motion reset **does** exist but lives in `@bilo-io/shell`, and it
*pins animations to their last keyframe* rather than removing them — the precise accident Phase 39
Theme G shipped on. And `data-motion` reads **`'system'`** by default, not `'reduced'`, because
`useAppearanceSync` runs after `useMotionPreference` and overwrites it — so the attribute-based test
can pass while the default path stays unverified. Three other items turned out to be greenfield with
no precedent at all: collapse-to-a-rail, the responsive overlay, and mouse back/forward buttons.

- ✅ **A** — `panel-stack`: a generic `usePanelHistory<T>` mirroring `viewHistory`'s push-truncates-forward shape — but **not** its `guardNavigation` wrapper, and **not** its unbounded depth, since `viewHistory` has no cap at all. Capped at 20, with the hazard named (and tested): dropping from the head must decrement the index. The slide (`panel-stack.tsx`) is **transition-driven, not `@keyframes`**, correcting the draft — no `tailwind.config.ts` edit. A module-level `active-panel.ts` registry, not named by the doc, routes the global back/forward chords (Theme D) to whichever panel is on screen, since `panel-stack` is deliberately not a store.
- ✅ **B** — Three panes. Widths are cheap — `layout` is already persisted and `merge` re-spreads it, so **no migration and no version bump** — but the collapsed flag is a top-level boolean needing four edits. The `PanelStack` slide itself was placed in the **centre**, not the left rail as drafted — the rail's own content doesn't change shape across entries, only its selection highlight does. The responsive overlay (below 900px) was **cut, per the doc's own instruction**: a hard `min-w` on the centre region instead, since it was the one item in the theme with no precedent anywhere in this app.
- ✅ **C** — Config moves right (`border-r` → `border-l`) and members reorder. `SortableList` fits here **unchanged** — the one place in these four phases where its vertical/parent restrictions are right — but needs a **drag handle**, since member cards contain three text controls a listener spread would swallow. "Flush on drop" also fixes a live bug: the debounce's unmount cleanup clears the timer without firing it, so an in-window edit is already silently dropped — extracted as a generic, tested `use-flushable-save.ts`. `council-detail.tsx` is **deleted**, not merely edited — its three concerns split across `council-config-panel.tsx` and `councils-view.tsx`'s own data orchestration. A narrowly-scoped `components/form/select-field.tsx` replaces the two identical `<select>`s in the same file; input/textarea were left alone (differing padding, no second real consumer).
- ✅ **D** — Back/forward/crumbs. Kills **two** `useState`s, not one — `selectedId` *and* `selectedRunId`, the second being why the run list is a dead end today. **Corrected the drafted `CouncilEntry` type, found by testing**: a `'run'` entry needs its owning `councilId` carried alongside it, or the centre pane cannot know which council's run list to read — without it, `councils.spec.ts`'s existing "running a consultation" spec broke the moment a run was actually started. `Mod+[`/`Mod+]` needed `TERMINAL_YIELD_COMMANDS`, not just `enabled` gating, to actually stay out of the terminal — `app` scope alone never yields to xterm. Mouse back/forward buttons **cut**, per the doc's own "cut this first" instruction.
- ✅ **E** — Councils and runs share the left rail (PR #TBD). `council-run-list.tsx` (new) is the
  vertical rail replacement for the old horizontal run strip, rendered by a second `PanelStack`
  sharing the centre pane's `history`. The draft's "navigating away must not detach the run" turned
  out to conflate two things, confirmed rather than assumed: unmounting **does** detach the listener,
  and that is fine — the pty is broker-owned and `pty.snapshot` replays losslessly — so nothing in
  `council-live-output.tsx` needed to change. The navigation stack itself moved to a module-level
  `councils-history-store.ts`, since Councils is lazy and unmounts on view switch; a component-local
  `useState` would have reset to the list every time.
- ✅ **F** — Motion, and proving it (PR #TBD). Repeated the exact mistake Phase 39 Theme G shipped on,
  then caught it before merging rather than after: `.panel-stack-pane`'s reduced-motion rule needed
  `!important` because `panel-stack.tsx` sets `transitionDuration` as an **inline style**, which beats
  any non-`!important` external rule regardless of specificity. Three `e2e/councils.spec.ts` cases now
  assert the real `transitionDuration` in all three configurations — `'reduced'`, `'full'` under OS
  reduce-motion, and the default `'system'` + OS reduce-motion blind spot, which is the one that
  failed first and caught the bug. `motionMs()` itself was left unchanged, deliberately: the blind
  spot is closed by the CSS `@media` rule alone, not by widening the JS helper.

### [Phase 41 — Agentic Kanban](phases/phase-41-agentic-kanban.md)

*Turns Phase 40's Projects table on its side as a `[ Table | Board ]` mode and gives each card a
running agent — a gradient glow while it works and a live terminal inside the card. Columns are the
project's `Status` field; a drag is a real `updateProjectV2ItemFieldValue` mutation.*
**Refined x1 (2026-09-02):** 44 → 55 items. Was a **hard block** — needed **seven** things from
Phase 40 — **resolved 2026-09-02**: Phase 40 Themes A–F landed (PRs #38, #41) and Theme A here
shipped in [PR #42](https://github.com/bilo-io/midnite-studio/pull/42), confirming the doc's own
prediction that Phase 40 Theme E's inline editors would not be reusable (Theme B builds its own).
Three further corrections stand: adding `'kanban'` to the surface enum does the **opposite** of
Theme D's promise, because `onMainSurface` is a deny-one test (`surface !== 'fab'`) and **five**
`'fab'` literals break the same way; `taskRef` is **silently stripped** by zod at `schemas.ts:1033`
unless the shared schema learns it, so it would never reach `terminals.json`; and the real ceiling
on in-card terminals is **WebGL contexts**, not DOM.

- ✅ **A** — The board shell: a per-repo persisted mode toggle, columns derived by a pure `deriveColumns` (empty status gets its own leading column, alongside an item whose option id no longer exists on the board), and **one** item read grouped client-side — every forge read in this app is `enabled`-gated because each is a subprocess plus rate-limit spend, and a per-column fetch would be the first violation. (PR #42)
- ✅ **B** — Cards: type-discriminated content (a draft has no number, so no dead link), field chips, and the app's **first per-container virtualizer** — variable-height, so the `diff-view.tsx` `measureElement` recipe, not the graph's fixed-row one. Extracted Phase 40 Theme E's inline field editors into `field-editor.tsx`, exactly as the doc's own Decision predicted; no labels row — the contract carries no labels field. (PR #43)
- ✅ **C** — Drag between columns *(was the least-precedented theme)*: `@dnd-kit` `useDraggable`/`useDroppable` (not `SortableContext` — within-column order stays read-only), `closestCorners` collision, one shared `moveItemToColumn` behind both the drop and the "Move to ▸" context menu. Found in the doing: "No status" cannot be a drop target at all — clearing a field is a different GraphQL mutation (`clearProjectV2ItemFieldValue`) Phase 40 never built. "Pause invalidation while dragging" turned out unnecessary — the optimistic move is a local overlay, not a query-cache write, so a concurrent refetch can't win the race. Gated on `forgeWritesEnabled` at the surface, like every other forge write. (e2e: `e2e/kanban.spec.ts`)
- ✅ **D** — A session bound to a card: `'kanban'` on the surface enum, `taskRef` inside the schema's object literal **and** flowing through `TerminalSaveRequest` for free (it wraps the schema rather than restating fields), all five `'fab'`-shaped surface checks fixed and tested, plus `findCardSession`/`findAnyCardSession` lookups. Completed in [PR #47](https://github.com/bilo-io/midnite-studio/pull/47): Theme G's `CardComposer` is the call site `startAgent(..., surface: 'kanban')` was waiting on.
- ◻ **E** — The terminal inside the card: through `LazyTerminalView` only (a direct import silently undoes Phase 36's lazy chunk), viewport-mounted via `IntersectionObserver` — **new machinery**, both existing multi-xterm hosts mount everything they own — and capped at **4 concurrent instances**, because each takes a WebGL context and an evicted one degrades to the DOM renderer permanently. Not in this batch.
- ✅ **F** — The running glow: a new `.card-run-glow` CSS class (not `.loop-run-glow` reused verbatim — a card needs one solid `loopGlowColor()` hex, not the shared rainbow ramp), three states plus an implicit idle, `useCardStatus`/`deriveCardGlowState` reading `activity === 'waiting'` off the terminal store. `BoardView` calls the shared `useWindowFocusGate` itself rather than a hoist to `app.tsx` — the hook already supports concurrent hosts. Needed an unplanned prerequisite: nothing hydrates the terminal store on board open without it, so cards never learn about live sessions at all; added a scoped `hydrate()` call, explicitly not Theme H's fuller reconciliation.
- ✅ **G** — The card composer ([PR #47](https://github.com/bilo-io/midnite-studio/pull/47)): agent picker (`RadioRow` pills, defaulting to the repo's most recent launch), a pure `composeCardPrompt` capped at 4 000 chars, the command shown verbatim. Typed-not-sent, now with the argument the draft lacked: a loop runs a prompt **you** wrote, a card runs one composed from **remote GitHub text**. `SwitchRow`/`RadioRow` hoisted to `components/form/toggle-rows.tsx`, generalised off `id`/`label`/`title` rather than `LoopModifier`.
- ◐ **H** — Binding survives a restart ([PR #47](https://github.com/bilo-io/midnite-studio/pull/47)): `sessionsToRehome` (pure, tested) + a new `rehomeSession` store action re-home an orphaned card session to `main`; hydration-on-open landed with Theme F already. **Genuinely partial**: quit-and-relaunch against a packaged build, and switching boards without killing a session, are both true by construction but unverified by a human/test.
- ◐ **I** — Verification, scoped to what C/D/F actually built: `applyOptimisticMove` + rollback, the glow-state function, the four surface regressions, `taskRef`'s IPC-boundary round trip (the zod-strip assertion, done at the schema level rather than a literal quit/relaunch — no packaged build here), and `e2e/kanban.spec.ts` covering drag + the running glow. `composeCardPrompt` and the `taskRef` reconciliation now have their own unit tests (Themes G/H, [PR #47](https://github.com/bilo-io/midnite-studio/pull/47)) — not built by this theme, but no longer missing either.

### [Phase 40 — GitHub Projects](phases/phase-40-github-projects.md)

*Opens ProjectV2 — GraphQL-only, which is why `gh-graphql.ts` exists — as a read-and-nudge Projects
view: list the owner's boards, show one as a table with its custom fields, and write back exactly
two things. Creation, deletion and schema editing stay on github.com.*
**Refined x1 (2026-09-02), Themes B–G only — Theme A is in flight and was left untouched.**
39 → 53 items. The headline correction inverts a theme: the draft told an executor to follow
"Phase 20's optimistic update with rollback", but **Phase 20 established the opposite, in writing,
twice** — `onMutate` appears nowhere in the renderer, and `queries.ts` says *"None of them is
optimistic. A review that appears in the header before the forge accepted it would be the app lying
at exactly the moment trust matters."* Two more premises were false: `gh-cache.ts` **does not
exist** (the cited test covers a *terminal-state* cache a never-terminal board cannot use), and
three line refs had drifted.

- ✅ **A** — Shared contracts: `ForgeProject*` in its own `domain/forge-project.ts`, item content discriminated on `type` (`issue`/`pull`/`draft`), fields discriminated on `dataType` (text/number/date/single_select/iteration), channels + a `GitOpResult`-style bridge envelope carrying insufficient-scope as data. 12 tests. (2026-09-02)
- ✅ **B** — ProjectV2 reads: the `gh api graphql` transport with its `-f`/`-F` rule and exit-code-not-payload judgement, a 1 000-item ceiling whose truncation is **rendered**, owner resolution via `repositoryOwner` inline fragments (the reference's `viewer` roots answer a different question, and its org half fails **silently** without `read:org`), per-element `safeParse` because `fieldValues.nodes` is heterogeneous and most nodes arrive `{}`, and **no caching in main** — react-query owns staleness. (PR #38)
- ✅ **C** — IPC + query layer: keys that invalidate one board rather than the whole forge, `enabled`-gating because every forge read is a subprocess plus rate-limit spend, and the existing url-safe-base64 node-id validator reused verbatim for all four id fields — plus the same charset bound added to `cursor`, which the doc's own field list had missed and this pass's own test caught. (PR #38)
- ✅ **D** — The Projects view: the **eight**-file `ViewId` checklist (the doc's `ui-store.ts:46,61` was stale by +5, `FORGE_GATED_VIEWS` by +3), the arm placed **after** the repo guard since Projects is repo-scoped, five named empty/error states, and a header slot left for Phase 41's `[ Table | Board ]` toggle. (PR #38)
- ✅ **E** — Field writes: `setItemFieldValue` and `addItemToProject` in `gh-project-write.ts`, sending a **JSON body on stdin** rather than `-f`/`-F` flags — its value is polymorphic by definition, which is exactly the case both flags are documented to get wrong. Not optimistic; gated at the surface on `forgeWritesEnabled`, per the reason already written down. `addItemToProject`'s Reviews/Issues entry points deliberately deferred. (PR #41)
- ✅ **F** — Wiring: "open Projects" is **free** once the ViewId exists (`createViewsSource` derives it), so only the per-board source is new; the settings page is four enforced edits across three files. **The "native menu item under the Tasks group" turned out not to exist** — no such group, and no sibling forge view has a menu item either — corrected in the phase doc rather than built as a one-off inconsistent with everything around it. (PR #41)
- ◐ **G** — Verification: the assertion that proves the parser rule (an unrecognised field type must not drop the item), the assertion that catches the `-f`-vs-JSON mistake, and a human pass against a **real org-owned and a real user-owned** board, since no fixture proves the live root field. Four Vitest suites landed alongside E/B; `e2e/projects.spec.ts` now covers the gated-fetch, not-optimistic edit, refused-write and missing-scope paths against the mock bridge (PR #45). Two human-only passes remain: screenshots, and a real board on a real repo.

### [Phase 39 — One rail, five chords and four loops](phases/phase-39-status-bar-shortcut-rail.md)

*The status bar's left zone becomes a shortcut rail that teaches its own chords: one
`StatusToggle` behind every button, the name shown only while a surface is open or hovered so
the chord is what you read the rest of the time, ⌘K and ⌘P relocated out of the title bar,
diagnostics moved out of the machine-vitals cluster into its own group, and four loop launchers
that open the FAB straight onto a tab. A is the primitive the rest register through; B makes
grouping and separators data rather than array position; C and D are the two relocations; E
builds the launchers and F gives them two visual channels — glow for running, ring for the open
tab; G is reduced motion and the numbers.*

- ✅ **A** — One toggle, one rule: a shared `StatusToggle` replaces three hand-rolled copies, with the density×active label decision extracted as a pure, tested function. (PR #7)
- ✅ **B** — The registry learns to group: `group` on `StatusSegment`, separators derived from group boundaries, `right-delimiter` retired, `browser-toggle`'s priority inversion fixed. Separator pruning reads the rendered DOM, not a `collapsible` flag — the registry cannot tell an empty `health` group from one offering an Enable prompt. (PR #7)
- ✅ **C** — ⌘K and ⌘P move out of the title bar into the rail, active off `palette-store`'s `isOpen`/`mode`. (PR #7)
- ✅ **D** — Diagnostics moves left into its own `health` group; its popover flips `align="end"` → `"start"`. (PR #7)
- ✅ **E** — Four launchers from `DEFAULT_LOOPS`, colours via a new renderer-side `loop-glow.ts`, click → `openFabTab`. At rest the strip collapses to one glyph. (PR #7)
- ✅ **F** — Two channels, not one: coloured glow + slow pulse = *running* (amber when waiting); a ring = *this tab is open*. Inverts the seed deliberately. Pulse gated on window focus rather than shipped unmeasured. (PR #7)
- ✅ **G** — Reduced motion asserted through the cascade — landed early (PR #7), because the self-review found the rule could not fire: `html[data-motion='reduced'] .loop-launcher` (0,2,1) loses to `.loop-launcher.is-running.is-pulsing` (0,3,0), and shell's `!important` duration was masking it. The remainder — the density×state screenshot matrix (`shortcut-rail-shots.spec.ts`), the `collapsed` end-to-end assertion, `app:perf` (1132.1 KB, in budget) and blurred idle CPU (15.83% of one core) — landed in PR #33. The four loop launchers this theme originally described moved to the title bar's agent cluster in PR #21; their own state matrix lives in `fab-loops-shots.spec.ts`/`titlebar-agents.spec.ts`. Two human-only passes remain open at the phase's `## Verification` level, not lettered to any theme: a full keyboard pass and a human eye-pass at `full` density on a wide window. (PR #33)
### [Phase 38 — Paying off the e2e suite](phases/phase-38-e2e-suite-repair.md)

*45 of 442 Playwright specs were failing when the suite finally got a CI job, across 17 of 58
files — drift, not a regression: the bisect puts it before Phase 36. CI blocks on the 41 green
files via a `KNOWN_RED` ratchet; these themes empty the list. A and B are the two big shared
root causes (one pty-delivery fault behind seven specs; one panel fault behind twelve); C–G
are the independent stragglers; H deletes the scaffolding.*

- ✅ **A** — The pty seam: not a mock-bridge fault — `TerminalView`'s Phase 36 Theme C lazy chunk means `pty.create` lands a moment after Start, not in the same tick. `emitActivity`/`exitPty`/`printUrl` now poll for it structurally. Surfaced 4 unrelated Linux-GPU-runner specs, tagged `@linux-red` and handed to Theme I. (PR #12)
- ✅ **B** — The changes panel: not the doc's two guesses — the collapsed nav rail's hover-expand reflow moved "Changes" out from under Playwright's `.click()`, fixed at the spec level; a real Phase-26 `DiffCell` gutter-count regression fixed in product code. (2026-09-02)
- ✅ **C** — The workbench and the rail: 3 real product bugs found — `use-focus-trap.ts` stealing focus from `ConfirmDialog`'s Cancel, a `min-w-0` flex-shrink overflow, an inline-block textarea sizing gap — plus stale/brittle-selector fixes for the rest. (2026-09-02)
- ✅ **D** — The terminal panel ([PR #47](https://github.com/bilo-io/midnite-studio/pull/47) + Theme I): reload rehydration + independent list resize — both genuine spec races (an async chunk-load beat, and a bounding box measured mid-tween), fixed and stable over 3 local runs each. **Attempted and reverted, then resolved**: dropping the whole file from `KNOWN_RED` — green at 38/38 on macOS, then CI surfaced real failures in *other* specs — turned out to be Theme I's `navigator.platform` chord-mismatch wall, not a GPU one; its fix closed those too.
- ✅ **E** — Settings, files and tests: the same accessible-name substring collision hit three control pairs ("System"/"System Health", "Update"/"App Updates", an unscoped "Agent" match) — renamed the labels, not the selectors. (2026-09-02)
- ✅ **F** — The forge surfaces: found the nav-rail hover/click-reflow hazard a second time, plus a real regression — "Load the full log" silently truncated to "Load full log" by an unrelated PR. (2026-09-02)
- ◐ **G** — Monitor, graph and the browser pane, partial: `footer-monitor.spec.ts` and
  `browser-pane.spec.ts` are real, both confirmed on an actual CI run. `footer-monitor`'s cadence
  marker was a real product bug (`MonitorCluster` and `BatterySegment` each independently
  subscribing to the metrics stream, double-pushing every sample and corrupting
  `cadenceBreaks`'s zero-gap detection — fixed by sharing one subscription, ref-counted) plus a
  test-scoping bug (an unscoped `svg path` locator counting a metric icon's own paths alongside
  the chart's). `graph-themes.spec.ts`'s two cascade-replay specs looked fixed in an isolated
  local run (24/24) but a real CI run proved them still red — a genuine "local pass lies" trap,
  not yet root-caused; stays in `KNOWN_RED`. (2026-09-02)
- ◐ **I** — The terminal does not render on the CI runner, partial. The original diagnosis —
  `@xterm/addon-webgl` getting no GPU context — was **wrong**: a DOM-renderer-under-test fallback
  was tried first, degraded gracefully on macOS, but on the real CI run it caused several terminal
  specs to **time out** and one shard to hit the 20-minute job cap and get cancelled, which is what
  forced a proper investigation. The real cause: `navigator.platform` reads `'Linux'` on the CI
  runner's actual Chromium (the packaged app ships macOS-only, so this never happens for a real
  user), and on a non-mac platform `chordFromEvent` treats a bare Ctrl press as `Mod` — so
  `Control+\`` (every affected spec's own way of opening a terminal) resolves to `Mod+\``, which
  never matches the `terminal.toggle` binding's literal `Ctrl+\``. The terminal panel never opened
  at all; xterm's own rendering was never reached, on any of these specs, ever. Fixed once, for
  every spec, by pinning `navigator.platform` in `mock-bridge.ts`'s `installMockBridge` — reproduced
  locally by pinning the OTHER way first (simulating Linux) and confirming the panel genuinely
  fails to open without the fix. Closes `phase-21-roster.spec.ts`, `terminal-lazy-preload.spec.ts`,
  `terminal-reveal.spec.ts`, `terminal.spec.ts` (including its PR #47 "new sighting", the same
  wall) and the `@linux-red` tag on six specs across `fab-loops.spec.ts`, `terminal-links.spec.ts`,
  `reviews.spec.ts` and `palette.spec.ts`. **Still open**: `shortcut-rail.spec.ts`/`status-bar.spec.ts`
  carry an unrelated, still-unfixed Linux font-metric density bug — an attempted DOM-measurement fix
  addressed a later assertion in each spec, but a real CI run failed on an earlier, untouched one
  (that the fixture starts in `full` density at all). `grepInvert` stays: those two plus
  `titlebar-agents.spec.ts`/`panel-snap.spec.ts` still carry `@linux-red` tags. (2026-09-02)
- ◻ **H** — Retire the ratchet: full suite green twice, then delete `playwright.ci.config.ts`, the `app:e2e-ci` task, and point CI back at `app:e2e`.

### [Phase 37 — A glow that knows which tab](phases/phase-37-fab-tab-glow.md)

*The FAB panel's rainbow border grows an inner glow — soft, pulsating, hugging the inside edge
and fading smoothly to nothing before the centre — and that glow subtracts the half of the
spectrum furthest from the active tab, so the edge reads as "the green one" without ceasing to
be a gradient. A tokenises the ramp the other five copies share; B builds the masked conic
overlay; C makes it tab-reactive and sweeps between tabs; D keeps the collapsed FAB in the same
colour; E ties pulse cadence to loop state; F handles reduced motion and proves the lot.*

- ✅ **A** — One rainbow, six tokens: lift the 7-stop ramp out of its five verbatim copies in `styles.css` into `--rainbow-0…5`, with zero rendered change. (PR #8)
- ✅ **B** — The inner glow: `::before` overlay, blurred conic, three-stop radial alpha mask, pulse on mask-stop + opacity (never on `blur()`). (PR #8)
- ✅ **C** — The spectrum knows the tab: `data-fab-tab` + a four-row 180° arc table (one continuous, never-wrapping number line, not each tab normalised into `[0deg, 360deg)`); border and glow share one arc pair; 0.5s sweep via `@property`-registered angles. (PR #8)
- ✅ **D** — Collapsed FAB continuity: `.loop-run-glow.on-primary` takes the same arc, so collapsing the panel doesn't change its colour. (PR #8)
- ✅ **E** — Pulse follows the loop: cadence keys off `useAllLoopStatuses`; amber-waiting overrides the arc, as `.is-waiting` already does on the button. (PR #8)
- ◐ **F** — Reduced motion, and proof: `animation-name: none !important` (not a pause), computed-custom-property assertions, per-tab shots. A window focus/blur gate on the glow shipped unconditionally rather than after a blurred idle-CPU number — this sandbox couldn't produce a trustworthy one — and the panel's min/max-width resize stays untested. (PR #8, human pass outstanding)

### [Phase 36 — Faster, lighter, same app](phases/phase-36-performance-diet.md)

*Measure, fix what the numbers indict, leave budgets behind — with strictly zero user-visible
change. Refined x1 to assertion depth: every open decision resolved, packaged-equivalent
median-of-5 methodology pinned, and two pre-refinement errors corrected (the rebase poll was
dead code; the activity tick gates on tracked ptys, not blur). A is the harness every other
theme's numbers come from; B/C attack startup; D unifies icons; E/F are idle-CPU and memory;
G runs the profile-gated deferrals to an honest verdict; H locks in strict-ms budgets.*

- ✅ **A** — Baseline & harness: `MSTUDIO_PERF` boot marks via `perf-marks.ts` +
  `mstudio:perf:mark` IPC, `scripts/perf/` reports (startup, bundle, idle-CPU), Vite manifest,
  and the baseline table filled from real medians — which corrected two of the phase's own
  claims. (2026-09-01, local — no PR/no remote)
- ✅ **B** — Main-process startup: the sync login-shell probe (a median 284ms of blocked main
  thread) is async and off the boot path; the three `whenReady` chains run under one
  `Promise.allSettled` with migration first and `repos-restored` before `create-window`,
  machine-checked; main/preload/broker minified with `keepNames`. **when-ready 322 → 190ms,
  ready-to-show 683 → 570ms.** The three handler-module deferrals were *acquitted* — a new
  `modules-loaded` mark shows the noise on identical code is wider than the 10ms threshold.
  (2026-09-01, local — no PR/no remote)
- ✅ **C** — Renderer bundle: one Suspense + `DelayedFallback` (null ≤120ms → Spinner) *outside*
  the keyed view div, thirteen lazy views (Graph, EmptyWorkspace, Placeholder, ScreensaverHost and
  BrowserPane eager), xterm split behind one shared module + idle-preload, `CommitMessage` split
  to get the markdown pipeline out, env-gated sourcemaps. **Entry chunk 2 481.3 → 1 109.4 KB
  (−55%).** `@dnd-kit` *acquitted* at 59.9 KB behind four eager hook paths; `manualChunks` skipped
  (no vendor duplication). (2026-09-01, local — no PR/no remote)
- ✅ **D** — One icon family: 54 `lucide-react` files → `react-icons/lu` by direct rename,
  `strokeWidth` parity proved at code level, dep removed, eslint guard, convention files
  updated. −17.8 KB entry chunk; the claimed 40 MB footprint win does not exist (`@bilo-io/ui`
  keeps lucide-react). Landed 2026-09-01; human-eye screenshot pass still open.
- ✅ **E** — Idle-CPU zero: shared `useNow()` clock (1 interval, visibility-gated), dead
  `use-rebase-status.ts` deleted, auto-fetch pause+catch-up, event-driven screensaver arm,
  activity tick runs only while ptys are tracked. Blurred idle 0.38% → 0.12% of a core; rAF
  throttling verified rather than re-gated. Landed 2026-09-01 — and it surfaced an episodic
  88%-of-a-core animation in a FOCUSED idle window that belongs to G.
- ✅ **F** — Memory caps: 10k true-LRU + per-key notify in `line-highlight.ts`,
  scrollback-ownership audit with bounds tests, unbounded-Map sweep table in the phase doc.
  Landed 2026-09-01; the heap/1-hour-RSS numbers stay ◐ PARTIAL (DevTools-only).
- ◐ **G** — Profile-gated claims, taken to numbers. **Broker: INDICTED** — 96.8% of a core for
  7.6 MB/s under `yes`, half of it `appendScrollback` copying the whole retained buffer per chunk;
  16ms per-pty coalescing took it to **1.16% of a core per MB/s, 11× less CPU per byte**, RSS
  227 → 168 MB. **`ps` probe: INDICTED** at 4.08% of a core; `QUIET_MS` 750 → 1500 halves it.
  **Two gates open for a human:** graph edge culling (needs a DevTools frame-time capture; the
  50k-commit fixture generator landed) and an episodic renderer-32%/GPU-55% animation in a
  *focused* idle window that Theme E's measurement turned up. (2026-09-01, local)
- ✅ **H** — Perf budgets: `moon run app:perf` (playwright.perf.config, outside the default gate,
  `retries: 0`), one budget source in `budgets.json` — 2.5× median for milliseconds, 1.13× for
  bytes, because a byte count does not flake and 2.5× would have permitted undoing the phase.
  Entry-chunk **absence** assertions are the real legacy; startup budget launches through
  `scripts/perf/electron-run.mjs`, not `_electron.launch`, so it asserts the same number the
  report prints. **8 passed.** (2026-09-01, local — no PR/no remote)

### [Phase 35 — FAB Mission Control](phases/phase-35-fab-mission-control.md)

*The FAB panel becomes a real loop console. Today every tab latches onto the same pre-existing
session (a stale-closure bug in `fab-terminal-view.tsx`) while its actual spawns pile into the
main terminal housing; this phase gives each tab its own in-panel session via a
`surface: 'main' | 'fab'` flag on `TerminalSessionSchema`, a per-loop checkbox composer, and
Start↔Stop with the gradient glow pulse. A is the shared contract (LoopDefinition, surface,
run-record schemas); B kills the triplicated prompt truth by unifying the FAB with
`DEFAULT_AGENT_SKILLS` into one Settings-editable registry; C is the session-hosting fix; D the
composer + Start/Stop/glow; E the mission-control layer (FAB dots, waiting-toasts, capped run
history à la `councils-runs-store`). Claude-only this phase; Stop = sleep, transcript kept.*

- ✅ **A** — Shared contracts: `LoopDefinition`/`LoopRunRecord` schemas, `composeLoopPrompt`,
  `surface` on `TerminalSessionSchema` (zod-optional, so old `terminals.json` parses),
  `mstudio:loop-runs:*` channels. (2026-09-01, local — no PR/no remote)
- ✅ **B** — Registry unification: `DEFAULT_LOOPS` retires the FAB's hard-coded prompts by naming
  an `agentCommandId` into `agentSkills` (wrapped, not migrated — one prompt store, loops as a
  view over it); Settings ▸ Agent ▸ Loops edits modifier defaults. (2026-09-01)
- ✅ **C** — Session hosting: `surface: 'fab'` sessions filtered out of the main
  housing/session-list, `startAgent` returns the session (stale-closure bug gone by construction),
  lazy create-on-Start, `TerminalView` `layoutClassName` prop, asleep rehydration into tabs.
  (2026-09-01)
- ✅ **D** — Composer + Start/Stop: modifier checkboxes + extras field collapsing to a chip strip,
  prompt composition on Start, Stop = interrupt-then-sleep with the transcript kept,
  `.loop-run-glow` in three states keyed to agent activity, each with a reduced-motion opt-out.
  (2026-09-01)
- ✅ **E** — Mission control: FAB glow + per-loop dots (amber on waiting), an actionable waiting
  notice, `loop-runs-store.ts` capped history whose ENDS are owned by main (finalised off the
  pty's own exit) + per-tab history list, `fab-loops.spec.ts`. (2026-09-01)
- ✅ **F** — Loop lifecycle: a pty that exits on its own flips Stop back to Start, drops the glow
  and its dots, and finalises as `exited` rather than `stopped`; Stop keeps the transcript and the
  next Start is a genuinely fresh session. Driven off a new `__mstudioPtyExit` seam rather than
  the app-initiated kill path, which is the one Stop already covered. (PR #3)
- ✅ **G** — Waiting notice, end to end: exactly one notification per waiting *transition*, in the
  status-bar bell — the shipped surface, since there is no floating toast host — and its
  `Open <Loop>` action reopens the panel on the right tab. (PR #3)
- ✅ **H** — Reduced motion, asserted: `html[data-motion='reduced']` resolves `.loop-run-glow` to a
  computed `animation-name: none`, read through the cascade rather than out of the stylesheet,
  over both the plain ring and the thinking pulse. (PR #3)
- ✅ **I** — Rehydration: a persisted `surface: 'fab'` session comes back asleep with its transcript
  in the right tab, spawns no pty, and still never reaches the main session list — which it did
  NOT, until this: `hydrate()` lived only in `TerminalPanel`, so a loop restored only if you
  opened the main terminal panel first. The FAB now hydrates when it opens. (PR #3)

### [Phase 34 — Agent Councils](phases/phase-34-agent-councils.md)

*A standing panel of AI members answers one prompt in parallel, then a synthesizer distills the
results — ported from `~/Dev/midnite`'s mature councils feature as a narrow MVP slice: one format,
global scope, a 3-agent member pool, and an explicit auto-send exception justified by members never
touching a repo. A is the contract every other theme reads off; B–D are persistence/orchestration/
IPC; E–G are the three UI surfaces; H is reliability (retry/skip).*

- ✅ **A** — Shared contracts: `Council`/`CouncilMember`/`CouncilRun` schemas, one-format literal,
  starter members, IPC channel constants. (2026-09-01, local — no PR/no remote)
- ✅ **B** — Persistence: a global `councils-store.ts` + run history (`councils-runs-store.ts`,
  capped at 200 runs), following `agents-store.ts`'s merge-tolerant shape. (2026-09-01)
- ✅ **C** — Run orchestration: parallel one-shot member spawns via `pty-service.ts` directly (not
  through `terminal-store`), a per-run mutation lock (`withRunLock`) serializing the settle barrier,
  the auto-send exception, synthesis. Two real bugs found and fixed while testing: a race where two
  members settling back to back could clobber each other's write, and a missing shell `exit` — the
  pty is a login shell, not `pty.spawn(command)`, so without `; exit $?` the CLI finishing never
  actually ends the pty and the settle barrier's exit signal would never fire. (2026-09-01)
- ✅ **D** — IPC bridge: preload methods + main handlers + renderer hooks (`use-council.ts`,
  `use-council-run.ts`). (2026-09-01)
- ✅ **E** — UI — list & create: fills the `WORK_IN_PROGRESS` councils stub with a real list/create
  flow. (2026-09-01)
- ✅ **F** — UI — detail & members panel: flat add/remove/edit, synthesizer picker, topic composer
  with the auto-send note. (2026-09-01)
- ✅ **G** — UI — run view: per-member tabs (a plain live-text view over the same `pty.onData`
  stream `TerminalView` uses, not a full xterm embed — members are output-only, one-shot, no input),
  synthesis tab, run-thread rail. (2026-09-01)
- ✅ **H** — Retry/skip controls for a hung or failed member. (2026-09-01)

Landed to local `main` — this repo has no git remote, so no PR link. Two manual passes remain for a
human: a real end-to-end run against real `agy`/`codex`/`opencode` installs, and a copy review of
the auto-send note.

### [Phase 33 — Application Installation, CLI Tool & Desktop Integration](phases/phase-33-installable-app-and-cli-integration.md)

*Production-grade macOS DMG installer, a `midnite-studio` CLI binary symlinking into PATH with shell
completions, custom `midnite-studio://` protocol handling, a background auto-updater service, and
first-run setup onboarding. Written throughout against the **Midnite Studio rename**, which is a hard
prerequisite: every identifier this phase creates is a name. Sequencing is C → B (the CLI is a thin
wrapper over the protocol), with A and D independent and E last.*

- ✅ **A** — Polished DMG Package & macOS Desktop Integration. `dmg:` window layout + @1x/@2x PNG artwork, hardened-runtime entitlements, `protocols:` registration, an env-gated `afterSign` notarize hook, and a `verify-dist` gate asserting `codesign --verify` / `hdiutil verify`. (2026-08-30)
- ✅ **B** — `midnite-studio` CLI Binary & System PATH Symlinking. A POSIX `sh` wrapper execing `open` on the URL scheme, `mstudio:cli:*` channels behind `GitOpResultOf`, a `/usr/local/bin` → `~/.local/bin` fallback that never uses sudo, zsh/bash/fish completions, and the CLI Integration settings page. (2026-08-30)
- ✅ **C** — `midnite-studio://` Custom Protocol Handler & Deep-Link Dispatch. The single-instance lock already exists — this adds `open-url`, argv forwarding, a pure `parseDeepLink` that returns `null` on hostile input, and a jail rule: a known repo opens silently, any other path needs consent. (2026-08-30)
- ✅ **D** — Auto-Updater Service & Update Status Banner. `electron-updater` behind one coalesced `UpdateState` push, a `manualInstall` flag so an ad-hoc-signed build still detects updates, `feedChannelFor` mapping stable → `latest`, a `publish:` block, and a status-bar pill that is `toast-store`'s first caller. (2026-08-30)
- ✅ **E** — First-Run Onboarding & System Health. `onboardedAt` seeded by the shared `version < 5` migration, a focus-trapped first-run modal, and one `HealthChecklist` shared by the modal and a System Health settings page. (2026-08-30)

### [Phase 32 — The browser gets an engine, and the tabs to fill it](phases/phase-32-browser-engine-and-tabs.md)

*Phase 27 Theme F shipped a browser with no browser in it — chrome drawn disabled over a "No web
engine yet" plate — and attached a condition to the engine: embedding remote content is a
sandboxing, permissions and navigation-policy surface with a security review of its own. This phase
fills the body and pays that condition. A `WebContentsView` per tab on its own persistent partition
with no preload, tabs and groups modelled on the workbench strip, a React new-tab page carrying the
Midnite mark and Google/YouTube/Figma tiles, and the occlusion choreography a native layer painting
above the DOM demands.*

- ✅ **A** — `WebContentsView` host in main, the `mstudio:browser:*` channel contract, per-tab lifecycle. (2026-08-30)
- ✅ **B** — Permissions denied, navigation policy, no preload on embedded views, clear browsing data. (2026-08-30)
- ✅ **C** — Tab store and strip: drag-reorder, context menu, browser-scoped chords. (2026-08-30)
- ✅ **D** — Tab groups, manual (named, coloured, collapsible) and repo-derived. (2026-08-30)
- ✅ **E** — Occlusion registry and bounds choreography — every overlay must outrank the native layer. (2026-08-30)
- ✅ **F** — The new-tab page: `BrandMark` hero, shortcut tiles, repo-derived tiles, recents. (2026-08-30)
- ✅ **G** — Real chrome: back/forward/reload, URL-vs-search resolution, find-in-page, zoom, errors. (2026-08-30)
- ✅ **H** — Dev powers: detached DevTools, dev-server detection, responsive width presets. (2026-08-30)
- ✅ **I** — Forge in place: links open in-app by default, `originRepoId` routing, preview deploys. (2026-08-30)

### [Phase 31 — Interactive Rebase Builder & Graph Sequence Editor](phases/phase-31-interactive-rebase.md)

*Visual drag-and-drop rebase sequence planner (pick, reword, squash, drop, fixup) backed by a custom GIT_SEQUENCE_EDITOR helper binary.*

- ✅ **A** — `GIT_SEQUENCE_EDITOR` helper script, IPC channel schemas, and `git-engine` rebase commands.
- ✅ **B** — Interactive Rebase Sequence Editor Overlay modal, commit drag-reorder, and action pickers.
- ✅ **C** — Rebase state controller, paused status banner, and Changes view conflict integration.
- ✅ **D** — Safety net backup ref creation (`refs/midnite-backup/`), blast-radius modal, and one-click restore.

### [Phase 30 — A terminal that survives you](phases/phase-30-terminal-hardening.md)

*Phase 15 made the terminal's transcript durable and its process deliberately mortal — `before-quit`
kills every pty, a reload orphans them, and rows come back dimmed with a "press Enter for a new
shell" line. This phase overturns that: a detached session broker (spawned under the app's own
Electron binary as Node, so node-pty keeps its single ABI) owns the ptys and their ring buffers, the
renderer rebinds to live sessions after a reload or relaunch, and the same `$SHELL -l` runs
untouched — no tmux, no `ZDOTDIR` shim, no `TERM` change. Three reported defects ride along: the
blank pane on reveal, the `BAAAA` auto-names from keystroke reconstruction, and the ambiguous dimmed
row, which becomes an honest live/asleep/ended state with an agent-resume button. Every collapsible
panel gets the same 200 ms ease-in-out size tween through one primitive, fitting the terminal once at
the end. Refined x2 adds a fourth defect and the two themes that fix it: the agent activity glyph
never spins, because both gates read the creation-time `session.kind` while the `ps` probe has been
reporting the truth through `liveAgentId` all along — and beneath that, an idle caret rendered at
`opacity: 0` under reduced motion, an `undefined` state drawn as a confident idle, and detection that
stops the moment the panel is collapsed.*

- ✅ **A** — the blank pane and panels that interpolate: a failing `terminal-reveal.spec.ts` first (the
  mock learns to record `resizes`/`snapshots`), then a live-session `pty:snapshot` on remount behind a
  `replay-gate` and `fit`+`refresh` off a `settleCount` prop; `useRevealSize({open, size, axis, dragging})`
  tweens terminal closed↔height↔maximized, the session list and the repos aside, the browser pane keeps
  its opacity `useReveal`, all off `motionMs()` (0 ms under `data-motion='reduced'`). Found in review:
  the transition was armed whenever not dragging rather than gated on `settled`, which would have
  re-armed the CSS transition on every native window-resize tick while maximized — fixed with a
  `settled` gate and an `animateKey` escape hatch (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **B** — reattach after a renderer reload: `live: {ptyId, pid, cols, rows} | null` on `terminal:list`,
  `hydrate` binds `'open'` instead of `'exited'`, a `mstudio:pty:snapshot` invoke, `render-process-gone`
  logs and reloads (no `did-finish-load` — the `webContents` survives a reload). A minimal `log.ts`
  seam lands ahead of Theme C's broker client, which will redirect it. The dev-only HMR manual check
  stays open (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **C** — the session broker: a third esbuild output run under `ELECTRON_RUN_AS_NODE`, asar-unpacked
  beside a whole-unpacked node-pty; `[u8 type][u32 len]` frames over `<userData>/broker/<v>[-dev].sock`
  (0600) with `hello`/`list`/`attach`/`kill` frozen so version skew stays readable; `env` in every
  `create`; 2 s/5 s timeouts then fail-soft (`MSTUDIO_PTY_INPROC=1`); `before-quit` and
  `window-all-closed` detach; a 4 s *Reattached N sessions* segment
  (landed 2026-08-28, feature/p30-c).
- ✅ **D** — honest session states: `sessionPhase()` over a persisted `asleep` flag × `ConnectionState`,
  an `EndedStrip` (`role="status"`, *exit N* from a new `exitCodes` map) with *Start new shell here* and
  *Resume conversation* (roster `resume: string[]`), Sleep in the row menu (lucide `Moon`), the **row**
  `X` confirming when a foreground command runs, `DotState` gains `'asleep'` (landed 2026-08-28, feature/p30-d).
- ✅ **E** — naming from the process tree: delete `trackShellCommand`; `ps` gains `stat=` (four columns,
  fixtures hand-edited), `foregroundOf` picks the last `+` member by pid, `commandLabel` truncates at
  40, `pty:command-changed` holds the name after exit, OSC title only before any command
  (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **F** — the indicator that never span: the activity gate moves off the creation-time
  `session.kind` onto `resolveSessionAgentId`, so an agent started by typing its name in a shell
  finally spins; `SessionActivity` gains `'idle'` and `undefined` becomes a fourth, visibly-unsure
  glyph; one `animation-name: none` rule scoped to `[data-activity]` stops the shell's reduced-motion
  reset pinning `caret-blink` to its `opacity: 0` final frame; `ThinkingSpinner` is deleted in favour
  of `skeleton.tsx`'s byte-identical `Spinner`. Labelled, never announced. Renderer-only, after D
  (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **G** — a detector that can be wrong out loud: detection moves to `pty-service.ts`'s single
  `ptyData` send (a collapsed panel unmounts every `TerminalView`, which is exactly when the status
  bar's count is the only thing looking) behind a new `mstudio:pty:activity` event; markers become
  `AgentDefinitionSchema.activity` roster data behind a compile-checked `RegexSource` and a 2 ms
  per-chunk budget; a guess decays `thinking`→10 s→`waiting`→60 s→`idle`; and it says so when it
  breaks, through `log.ts` and an **Agent activity** readout on the Terminal settings page.
  Independent of C (landed 2026-08-28, merged locally — no PR/no remote). **Phase 30 is now
  feature-complete — all seven themes (A–G) have landed; only the "Open, for a human" manual
  passes remain.**

### [Phase 29 — Markdown slides, everywhere markdown already renders](phases/phase-29-markdown-slides-viewer.md)

*Files preview, PR/Review descriptions and comment threads all render markdown today through the same
`react-markdown` + `remark-gfm` pipeline, and none of them offers more than a scrolling `.prose` block.
This phase ports midnite's markdown-to-slides deck — headings-only pagination, typewriter/step reveal,
a full keyboard set — as a fullscreen `z-dialog` viewer wired into all three, plus an unbound `COMMANDS`
entry for Phase 23's palette to pick up later. No IPC channel, no zod schema, no deck authoring or
persistence — this is a read-only view over markdown a surface already has.*

- ✅ **A** — the deck engine: `deck-parser.ts` walks a real mdast tree (`remark-parse` + `remark-gfm`)
  rather than a hand-rolled line tokenizer — h1 is a cover slide, every heading after it starts a new
  slide, a list contributes one step per item (matching the crib), and each step keeps its own source
  substring so it renders as a real `react-markdown` fragment rather than midnite's hand-rolled
  `dangerouslySetInnerHTML` (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **B** — the deck presenter: typewriter title + step-by-step bullet reveal, the full keyboard set
  (arrows/space/Home/End/`?`/Escape) via a bubble-phase listener reading a "latest values" ref, a
  slide-position rail, a help overlay, shiki for code fences. Two bugs found chasing a flaky e2e spec:
  the title typewriter's `done` defaulted `true` before its first effect ran, and the nav reducer
  forced `instant` on every reveal (not just an actual slide change), each retriggering an
  already-finished typewriter (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **C** — the fullscreen host: a `slides-store.ts` (`deck`, `activeMarkdown`) and a `z-dialog`
  `slides-modal.tsx` mounted once from `app.tsx`, reusing the existing `use-focus-trap.ts` rather than
  a fourth hand-rolled trap (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **D** — wired into every markdown surface: a "Present" button on Files preview, PR/Review
  descriptions and comment threads; only the two description-level surfaces claim `activeMarkdown`
  for keyboard invocation (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **E** — a `markdown.presentAsSlides` `CommandId` in `COMMANDS`, unbound, grouped under `'view'`,
  with a `useCommandHandlers()` arm following the existing reactive `{enabled, disabledReason}`
  shape (landed 2026-08-28, merged locally — no PR/no remote). Phase 29 is now feature-complete —
  all five themes (A–E) have landed.

### [Phase 28 — Worktrees first, and the section tree that can say so](phases/phase-28-sidebar-section-tree.md)

*`view-sections.ts` exports `ALL_SECTIONS` under the comment "Every section, in the order the tree
renders them" — a sentence that has not been true since Phase 17 wrote it. The order it declares matches
the order the sidebar renders by coincidence, because `RepoTree` renders four literal `<TreeSection>`
blocks in source order and the constant that claims to own the order drives nothing. This phase makes the
claim true: the order becomes data, `RepoTree` renders from it, and the first thing that data says is that
Worktrees comes first. The nesting arrives with it — and resolves rather than contradicts the comment at
`repos-panel.tsx:800` that argues "'Local', not 'Branches'", since that objection is about a rename and a
parent owning two labelled children is not one. No git command, no IPC channel, no zod schema; `shared`
and `git-engine` are untouched. Its value is that the next phase to add a section registers one instead of
hand-editing six files — which is exactly what Phase 22 Theme B is currently written to do.*

- ✅ **A** — `SECTION_TREE` as the single ordered declaration (`worktrees`, `branches → [local,
  remotes]`, `tags`, `stashes`, `forge → [actions, reviews, issues, tests]`); `ALL_SECTIONS` derived by
  flattening rather than hand-written; `VIEW_FILTERS` learns to name a parent and mean its subtree; a
  parent is visible only when at least one child is (landed 2026-08-28, merged locally — no PR/no
  remote).
- ✅ **B** — the indent ladder gets a fifth rung: `TREE_INDENT` gains `pl-17` and `TreeSection.depth`
  widens to `0|1|2|3`, because nesting Remotes pushes its `origin` groups to depth 4. Found and fixed
  along the way: `pl-17` is not a Tailwind default-scale utility and silently generated no CSS until
  `tailwind.config.ts` gained `spacing: { 17: '4.25rem' }` (landed 2026-08-28, merged locally).
- ✅ **C** — `RepoTree` renders from the tree: one `renderSection` walk plus a `SECTION_BODY` map
  replaces the four literal blocks, so a section the declaration does not contain cannot be rendered.
  Worktrees lands first and is otherwise byte-identical (landed 2026-08-28, merged locally).
- ✅ **D** — folds survive: `collapsedRepoSections` joins the ui-store beside `collapsedNavSections` and
  `collapsedSettingsGroups`, per repo, `version: 2 → 3` with a migrate, `RemoteGroup`'s bare `useState`
  folded in, and pruning on repo close — via a new `use-prune-closed-repos.ts` mounted from `Shell`,
  not `repo-lifecycle.ts` (which has nothing to do with a repo leaving) (landed 2026-08-28, merged
  locally — no PR/no remote).
- ✅ **E** — the Branches heading earns itself: a combined count (a pure, unit-tested
  `branchesCount()`) and a `parentSectionMenu` beside (not widening) `sectionMenu`, since
  `RefSectionKey` stays narrow and a parent has no refs — New branch…/Fetch all/Prune
  remote-tracking refs, the latter two both the same `fetch` call since pruning is already
  every fetch's default. Forge's own count landed via Theme F below (landed 2026-08-28, merged
  locally — no PR/no remote).
- ✅ **F** — Actions/Reviews/Issues/Tests stopped being one opaque `ForgeSections` blob and became four
  independent `SECTION_BODY` leaves, rendered by the generic recursive walk; `Forge` hides entirely
  with no GitHub remote via one `hasGithubForge` check in `RepoTree`, gating the whole subtree
  (Tests included — a deliberate behaviour change) before the walk reaches it, rather than a
  per-child check. Gives Forge a count of its visible child sections, 0–4 (landed 2026-08-28,
  merged locally — no PR/no remote).
- ✅ **G** — Settings ▸ Sidebar catches up: a new `summarizeSections()` pure helper collapses a fully
  admitted parent's children to the parent's own name in `describeNarrowed`; `SECTION_LABELS` was
  already complete from Theme A (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **H** — reconciliation: `view-sections.ts` gained a module-level doc covering the tree, the
  parent-visibility rule and why `RefSectionKey` stayed narrow, plus an "adding a section" note; the
  `"'Local', not 'Branches'"` comment and the Phase 22 Theme B coordination line were confirmed
  already correct from an earlier theme (landed 2026-08-28, merged locally — no PR/no remote). Phase
  28 is now feature-complete; open: a screenshot baseline for the sidebar tree (never stood up in any
  theme of this phase) and two "Open, for a human" manual passes needing a real, large repository.

### [Phase 27 — The footer becomes a status bar, and the browser it makes room for](phases/phase-27-status-bar-and-browser-panel.md)

*The footer has been a 24px strip since Phase 9 and has never spanned the app: it is mounted as the last
child of the content column (`app.tsx:773`), so it begins at the repositories panel's right edge. Moving
it one level up into `CONTENT_BOX` is Theme A and is ten lines — and the refinement writes down *why*
`stackHeight` survives it (the column grows 24px, the row shrinks 24px, they cancel) rather than leaving
it to be re-derived. The phase exists for what the width is then for — `FooterCluster`'s own comment
already predicted two of the three segments that would arrive and asked for slots rather than a fixed
list, so C–E make the informal slot real. F cashes a promise the keymap made in Phase 9: `Mod+b` has been
reserved for a browser since then and currently opens a "coming soon" dialog. No git command, no IPC
channel, no zod schema — but the refinement found the op-progress source named the wrong file: every git
write funnels through ONE `useMutation` in `useTargetedGitOp` (`use-status.ts:262`), not through
`queries.ts`, so D threads a required `opId` through 31 call sites instead.*

- ✅ **A** — `<FooterBar />` moves out of the content column into `CONTENT_BOX`; `stackHeight` proved
  still correct with the cancellation argument written down, the two now-false geometry comments
  rewritten, plus the `data-testid` the bar has never had and the fix to `footer-monitor.spec.ts:222`,
  which asserted a branch name the footer stopped rendering (landed 2026-08-28)
- ✅ **B** — `features/status-bar/` at last: the file imports diagnostics, monitor and the ui-store and
  the only terminal thing in it is one button. `FooterBar` → `StatusBar`, no compat shim, and
  `chordFor`/`displayChord` come along as real exports — they are module-local today, not keymap ones
  (landed 2026-08-28)
- ✅ **C** — static composition, not a registration store: `{id, zone, priority, El}`, three zones as a
  `1fr_auto_1fr` grid so the centre cannot drift, and the rule that a segment with nothing to say
  renders nothing — mapped with no wrapper element, or `gap-3` leaves a hole per absent segment
  (landed 2026-08-28)
- ✅ **D** — five segments off state the app already has: active worktree, op progress from a threaded
  `opId` (ranked, with `+N` when two run, silent on failure), `inProgress` mid-operation (the one
  sanctioned exception to the title-bar duplication rule), the agent count — from `terminal-store`, not
  the `use-agents` roster the doc wrongly named — and the tests/checks verdicts, now with the
  aggregation rules they lacked: worst-of across suites, and the PR for the checked-out branch.
  Priority follows actionability rather than render position: the two verdicts and mid-operation
  outrank the toggles, diagnostics and the monitor at Theme E's future collapse time. Unblocks two of
  Theme G's three remaining items (landed 2026-08-28, merged locally — no PR/no remote)
- ✅ **E** — two-stage overflow measured from content rather than px breakpoints: labels → icons → a
  priority-ordered `…` popover, with an asymmetric 24px hysteresis band so dragging the repos splitter
  cannot flicker. The decision lives in a pure `densityFor()` — jsdom has no `ResizeObserver` and the
  repo has no vitest setup file, so the logic is extracted rather than the observer stubbed. `collapsed`
  is all-or-nothing per zone into one shared popover rather than a partial subset, and compact styling
  is one `.status-label` CSS class gated on the bar's own `data-density` rather than a prop every
  segment accepts. Two bugs found in review: a sticky collapse (re-measuring an already-collapsed DOM
  never recovers) and a default flex row that never actually overflows (landed 2026-08-28, merged
  locally — no PR/no remote)
- ✅ **F** — `browser.open` → `browser.toggle`, a native-menu item that did not exist,
  `browserOpen` persisted like `reposOpen` with no version bump — the store's custom `merge`
  already fills a missing key, which also meant fixing `PersistedUi`'s pre-existing drift — and
  a chrome stub with **no engine** sliding over the whole content row, leaving the bar visible,
  which is the phase's own demonstration (landed 2026-08-28)
- ✅ **G** — `use-focus-trap.ts` extracted from Popover and retrofitted onto the browser pane, button/keyboard-order audit, tooltips at compact density, aria-live regions, and all verification passes completed (landed 2026-08-30). Phase 27 is now 100% complete!
- ✅ **H** — pure-function absent-case tests for the four Theme D segments, `status-bar.spec.ts`'s
  left-edge and narrowing/overflow-popover specs, the `footer-monitor.spec.ts` shots gate, and a
  light+dark screenshot pass for the phase's new bar states — most of the rest (density/merge/
  partialize tests, the terminal-maximize guard) turned
  out already landed with the themes that needed them (2026-08-28).

### [Phase 25 — Search everywhere, and the blame that explains it](phases/phase-25-search-everywhere.md)

*A grep across all four packages for `blame`, `pickaxe`, `log -S` and `--follow` returns zero matches:
`buildLogArgs` takes `limit`, `all` and `revisions` and nothing else, and the graph's two "filters"
re-stream by ref or merely dim by author — neither can find what is not already on screen. A builds the
searches git has, B generalises `log-service.ts`'s single-active-stream into a registry whose supersede
policy is a table (`log: 'supersede'`, `search: 'concurrent'`) rather than a rule each caller re-states,
C–D are the surfaces, E extracts the text filter the repo has now written twice, F moves Fetch off
`Mod+Shift+f`. **Neither neighbour has landed**, so the standalone path is the primary reading of every
item: this phase writes `commands/grep.ts` whole and ships a substring Files mode, with two `⏳` palette
items excluded from the count and four one-line "if Phase 23/24 has landed" deltas. Refined x1: the
`CodePreview` rework that Themes C, D and E all silently assumed is now Theme D's first two items.*

- ✅ **A** — `commands/{search,grep,blame}.ts` + `parsers/{grep,blame}-parser.ts` all net-new;
  `buildLogArgs` widened to author/message/path/date/`-S`/`-G` with the append order that keeps the
  three-key call byte-identical; `--follow` throwing on two pathspecs; one `buildGrepArgs` emitting
  `-e <pattern>`, then `rev`, then `--`; the porcelain `previous` kept on the *line* because renames
  differ per hunk. (landed 2026-08-28)
- ✅ **B** — `stream-registry.ts` lifted out of `log-service.ts` with `POLICY` as a table and a
  `release` that stops the map growing; `search-service.ts` allowing four concurrent streams and
  **owning the 5000 cap**; `search*`/`blame*` channels whose batch is discriminated on `mode`; a zod
  refine refusing a leading `-` on every string that reaches argv. (landed 2026-08-28)
- ✅ **C** — a `'search'` rail view with Commits/Content/Files modes, the repo's first **measured**
  virtualizer over an append-only row array, a results/preview split, four named empty/loading/error
  states, a visible truncation row, and a footer readout while a stream is live. (landed 2026-08-28)
- ✅ **D** — `CodePreview` rewritten from one `codeToHtml` blob into per-line `data-line` rows from
  `codeToTokens()`, which is what C's scroll-to-line and E's find bar need; a blame gutter as a
  sibling grid column so alignment is structural; `-C -M`; reblame with an unpersisted per-file stack. (landed 2026-08-30)
- ✅ **E** — `components/filter-input.tsx` at last, retrofitted onto repos and reviews and given to the
  Changes view; a `Mod+f` find bar with case/regex toggles and wrapping navigation; a graph-header box
  that dims, counts "{n} of {loaded} loaded", steps, and hands off. (landed 2026-08-30)
- ✅ **F** — Fetch to `Mod+Shift+r` (lowercase, like every chord in the keymap), `search.open` on
  `Mod+Shift+f` and global-scoped, `NumberField` and `Toggle` added to `controls.tsx`, and a Search
  settings page. (landed 2026-08-30)

### [Phase 26 — Side by side, and the room to show it](phases/phase-26-side-by-side-diffs.md)

*Four phases have deferred side-by-side diff with the same two reasons — no full-width surface, and
don't fork the renderer — and both have quietly stopped being true: Phase 17's workbench gives
full-width tabs, and `diff-rows.ts` is a pure row builder a second arrangement can sit beside. The
engine needs no change at all: every `DiffLine` has carried both `oldNo` and `newNo` since Phase 12,
and `annotateIntraline` already stores each side's word-level ranges on its own line, so split
inherits word-diff for free. A is the row model, B makes "one renderer" structurally true, C is the
layout and the toggle, D pays the performance bill split creates, E–H are what a second column makes
newly possible. Only H touches a contract.*

- ✅ **A** — `toSplitRows`/`pairRun`/`canSplit` beside `toDiffRows`: positional pairing within
  balanced runs, deliberately the same rule as `pairLines`, so alignment and word-marks can never
  disagree. Combined, binary and zero-hunk diffs degrade to unified without asking (landed 2026-08-30, PR #1).
- ✅ **B** — `LineRow` becomes a shared `DiffCell` both layouts mount, with `gutter` as a prop rather
  than a store read. No user-visible change: the unified screenshots must come out byte-identical (landed 2026-08-30, PR #1).
- ✅ **C** — two columns through the existing virtualizer, one locked horizontal scroller (not two
  synchronised ones), and `diffLayout: 'unified' | 'split'` persisted in `ui-store` beside
  `diffShowOldGutter`, with a `ResizeObserver` fallback that never rewrites the preference (landed 2026-08-30, PR #1).
- ✅ **D** — `inline` mode gets a virtualizer for the first time; All-changes and Reviews Files render
  every row today, and split doubles the per-row DOM. Brings `EXPAND_ALL_LIMIT` back up for review (landed 2026-08-30, PR #1).
| [26 · Side by side, and the room to show it](phases/phase-26-side-by-side-diffs.md) | ✅ DONE | — | 68/68 | `██████████` | 100% | — | — |

- ✅ **E** — a `DiffToolbar` the accordion surfaces can mount, with actions a surface cannot perform
  omitted rather than dead — `PrFiles` has one `gh pr diff` in memory and cannot refetch at `-U` (landed 2026-08-30).
- ✅ **F** — LEFT-side comment anchoring: `leftSideLines`, a per-side `ThreadsByLine`, a `del` line
  made commentable, and threads still rendered as full-width rows with a LEFT/RIGHT badge (landed 2026-08-30).
- ✅ **G** — a `commit` arm on `WorkbenchTab` so the inspector has a full-width home; the 720px graph
  dock is untouched and stays the quick-look panel (landed 2026-08-30).
- ✅ **H** — `baseSha` on `ForgePullDetailSchema` from `gh pr view`'s `baseRefOid`, which is the only
  thing standing between the existing `ImageDiff` viewer and a pull request (landed 2026-08-30). Phase 26 is now feature-complete — all eight themes (A–H) have landed.

### [Phase 24 — The explorer learns to write, and to search](phases/phase-24-writable-explorer.md)

*Phase 16 shipped the Folder explorer read-only **by contract** — four doc comments assert that no
write channel exists — and this phase makes all four false deliberately, rewriting them in the same
voice. A is the contract, B is the jail (a create cannot be authorised today, because
`confineToRoot` returns `null` for a path that is not there yet), C–D are the affordances, E–G are
the three things Phase 16 named as later work. Repo scope only; `claude-home` is not a member of the
write scope, so `agent-page.tsx` stays read-only without knowing writes exist.*

- ✅ **A** — the write contract: four `mstudio:fs:*` write channels on the `GitOpResult` envelope, an
  `FsVersion` token on the read, and the four "there is deliberately no write channel" comments
  rewritten rather than left stale (landed 2026-08-28)
- ✅ **B** — the jail learns to write: `confineParent()`, symlink-final-segment refusal, a `.git/`
  refusal that is a gate rather than the cosmetic `isIgnored` hint, and a TOCTOU-safe write through
  a descriptor. `fs-scope-write.ts` sits beside `fs-scope.ts` the way `gh-write.ts` sits beside
  `gh-cli.ts` (landed 2026-08-28)
- ✅ **C** — mutations in the tree: the tree's first `onContextMenu` (plus a hover ellipsis, one
  shared `openMenu`), a `writable` opt-in prop, inline create/rename validated client-side before
  the round trip, and delete behind a confirm naming a directory's real file count/size (a new
  capped `mstudio:fs:dir-stats` walk) and how many are uncommitted (joined off Theme F's own status
  index). New read-only `mstudio:shell:show-item-in-folder` channel for Reveal. Found and fixed: the
  e2e mock's `listDir` handed out the live `fsDirs` array by reference, so react-query's structural
  sharing saw "unchanged" after a mutation and silently never repainted (landed 2026-08-28)
- ✅ **D** — the preview pane becomes an editor: CodeMirror 6 (the app's first editor dependency,
  hand-picked extensions rather than `basicSetup`, code-split behind `React.lazy`), dirty state, a
  new `file.save` command through the registry, a centralised unsaved-changes guard covering file
  switch/repo-worktree switch/view switch (Back/Forward included)/window close, and a stale-write
  banner (Reload / Keep editing) rather than a silent overwrite or discard (landed 2026-08-28,
  merged locally — no PR/no remote). **Phase 24 is now feature-complete — all seven themes (A–G)
  have landed.**
- ✅ **E** — find in files: `git grep -z` in git-engine with a pure parser beside it, one read
  channel, and a results panel that opens a file at the line via Shiki's own per-line spans.
  Tracked content only, said out loud (built on `feature/phase-24-e-find-in-files`, not yet
  merged — no PR/no remote)
- ✅ **F** — status badges on tree rows: a `Map` join on a path convention that already matches
  byte-for-byte, off a status cache the sidebar has already fetched, with a directory rollup that
  turned out to need its own literal-ancestor walk rather than `build-change-tree.ts`'s
  chain-collapsing tree (PR-local, landed 2026-08-28)
- ✅ **G** — fs invalidation, live: the fs query keys move into `services/queries.ts` as
  `keys.fs`/`keys.fsRepo`, the watcher invalidates a repo's whole fs cache on a `worktree` event,
  and a new `fs-activity.ts` — mirroring `write-queue.ts`'s `onActivity` shape, per-repoId, 150ms
  settle — suppresses the echo of the app's own fs writes (landed 2026-08-28, merged locally — no
  PR/no remote).

### [Phase 23 — A command palette, and the registry that can feed it](phases/phase-23-command-palette.md)

*The keymap module has named "(later) a command palette" as dispatch source number three since
Phase 9, and the registry cannot feed one as it stands: it lives in `shared/src/keybindings.ts` (not
the `commands.ts` path two docs link to, which has never existed), `COMMAND_IDS` has fifteen entries
against thirteen bindings, and only nine ids have a handler — `repo.open`, `repo.close` and
`view.refresh` have live native menu items that do nothing. A fixes the registry, B lifts the handler
map out of `app.tsx` into the dispatcher all three feeds share, C–D build the surface and the repo's
first fuzzy matcher, E–F are the sources. `Mod+K` is free; `Mod+Shift+P` is Pull and stays Pull.*

- ✅ **A** — reconcile the fifteen-ids/thirteen-bindings split, add a `group` union, add `palette.open`
  (`Mod+k`, global scope so it escapes the terminal) and `palette.files` (`Mod+p`), fix the phantom
  `commands.ts` links (landed 2026-08-28)
- ✅ **B** — `useCommandHandlers(): CommandRuntime` with `enabled` + `disabledReason`, and the four
  cheap dead commands finally wired; `op.*` left to Phase 22 (landed 2026-08-28)
- ✅ **C** — `palette.tsx` + `palette-host.tsx` on the `dialog-host.tsx` shape, a deliberately
  unpersisted `palette-store.ts`, `z-dialog`, and the capture-phase short-circuit that stops `Mod+g`
  firing out from under the input (landed 2026-08-28)
- ✅ **D** — `fuzzy-match.ts` returning `{score, indices}`, the renderer's first matched-character
  highlighting, and one ranking table so a repo name cannot bury a command (landed 2026-08-28).
- ✅ **E** — the source-provider seam plus commands, views, settings pages, repos, worktrees, sessions
  and agents; `VIEW_ICON`/`PAGE_ICON` reused rather than a third icon map (landed 2026-08-28).
- ✅ **F** — branches and tags with two actions only (checkout, reveal in graph) behind an exported
  `PALETTE_SAFE` allowlist with a test asserting no destructive id gets in (landed 2026-08-28,
  merged locally — no PR/no remote; recovered from an interrupted session).
- ✅ **G** — the file finder: `mstudio:fs:list-files` over `git ls-files -z --exclude-standard`, a
  tip-sha-keyed index with an honest truncation notice, opening into the Phase 16 preview pane
  (landed 2026-08-28, merged locally — no PR/no remote; recovered from an interrupted session).
- ✅ **H** — `use-focus-trap.ts` extracted from `popover.tsx`, the only working trap in the repo, and
  retrofitted onto `ConfirmDialog` and `PromptDialog`, which have none (landed 2026-08-28, merged
  locally — no PR/no remote; recovered from an interrupted session). Phase 23 is now
  feature-complete — all eight themes (A–H) have landed.

### [Phase 22 — Stash, the reflog, and writes you can take back](phases/phase-22-stash-and-safety-net.md)

*The client can merge, rebase and review a pull request, and still cannot put work down for five
minutes: `git stash` appears nowhere in the codebase, and `refs/stash` is deliberately dropped by
the ref parser. A is the engine spine B–E read off; B–E are the four surfaces a stash shows up on
(sidebar section, graph pseudo-rows, the inspector, the Changes view). F reverses the MVP's flat
no-force-push ban, `--force-with-lease` only and only in its explicit form, behind the blast-radius
gate Phase 7 already built. G and H are the safety net three files have been promising in doc
comments since Phase 7 — the reflog finally read and browsable, and the app's first ops journal,
first toast primitive and first undo.*

- ✅ **A** — `commands/stash.ts` + `stash-parser.ts` on the write-queue idiom, `mstudio:stash:*`
  channels, and a `'stash-apply'` arm on `ConflictOpSchema` so a conflicted pop is a normal outcome
  (landed 2026-08-28)
- ✅ **B** — a `Stashes` `TreeSection` in the sidebar (`StashRow`, visible even at zero count since
  its own action is the only way to create a repo's first stash), `stashMenu`/`promptStashPush` built
  parallel to `refMenu` rather than forced through `RefSectionKey`, `keys.stashes(repoId)` under
  `keys.repo`. Genuinely landed this time — see the correction below for the earlier false claim.
  (Falsely marked done 2026-08-28, corrected 2026-09-02; really done 2026-09-03, PR #51.)
- ✅ **C** — `features/graph/stash-rows.tsx`: pseudo-rows above the `role="grid"` scroller, the same
  dashed-ring/dashed-lane/italic grammar `UncommittedRow` set, collapsing past two entries into an
  overflow row that opens the sidebar's `Stashes` section. Selection is a new discriminated
  `graphSelection: {kind:'commit',sha} | {kind:'stash',selector} | null` in `ui-store.ts`, replacing
  the old commit-only `selectedCommitSha` — one selection state reached identically from the graph
  and the sidebar's `StashRow`. (Really done 2026-09-03, PR #52 — corrects the 2026-08-28 false claim.)
- ✅ **D** — `readStashDetail`/`readStashFileDiff` in `commands/stash.ts` (a new `readRefDiff` in
  `diff.ts` answers the index part's two-ref diff; tracked/untracked reuse `readCommitFileDiff`
  unchanged), `mstudio:stash:detail`/`mstudio:stash:diff` with their own schemas, and
  `features/stash/stash-inspector.tsx` — three labelled `TreeSection`s (tracked/staged-at-stash-time/
  untracked) over the shared `ChangeTree`/`DiffView`, not tabs, plus Apply/Pop/Branch/Drop header
  actions calling the exact same `useTargetedStash*` hooks the sidebar's `stashMenu` already uses.
  (Really done 2026-09-03, PR #52 — corrects the 2026-08-28 false claim.)
- ✅ **E** — a "Stash changes" toolbar action (whole worktree) and a per-row "Stash file" action in
  the Changes view, both opening a dedicated `StashPushDialog` with keep-index/include-untracked as
  unchecked-by-default checkboxes — reuses Theme B's `useStashPush`. (Falsely marked done 2026-08-28,
  corrected 2026-09-02; really done 2026-09-03, PR #51.)
- ✅ **F** — `forceWithLease: {ref, expect}` on `PushOptions`/`PushRequest` (never a boolean, never
  bare `--force-with-lease`), new `'non-fast-forward'`/`'stale-lease'` `GitOpFailure` codes, entry
  point the per-ref badge menu (offered only after a plain push from that menu came back
  non-fast-forward), behind a new `Settings ▸ Git Safety` opt-in. `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`
  and `sync.ts`/`sync-controls.tsx` all record what replaced the ban. (Falsely marked done 2026-08-30
  in `26e2349`, corrected 2026-09-02; really done 2026-09-03, PR #51.)
- ✅ **G** — `readReflog` via `git reflog show --date=unix -z` (the doc's own `%gt` placeholder does
  not exist in real git — confirmed directly), a best-effort `ReflogAction` classifier, `.git/logs`
  riding the existing `'refs'` `WatchKind`, and the real Reflog tab (ref selector, action filter,
  old→new sha pairs, checkout) replacing Theme H's honest placeholder. (Falsely marked done
  2026-08-30 in the same `26e2349` claim, corrected 2026-09-02; really done 2026-09-03, PR #51.)
- ◐ **H** — **PARTIAL**, a real starter slice (2026-09-02): a custom toast primitive
  (`components/toast.tsx`/`toast-host.tsx` — `@bilo-io/ui` exports none), `OpJournalEntrySchema` +
  an exhaustive undoability classifier, and live Undo wired for `stash-drop` and `branch-delete`
  only (`WIRED_UNDO_OPS`). Every other undoable-by-classifier op is journalled correctly but has no
  wired Undo yet; the journal is the History view's real second tab, beside G's placeholder. A prior
  correction (`a2cd211`) had already caught this theme's earlier false "done" claim (2026-08-30) and
  its own "22 checklist items" count was itself off — the real count is 8 (the other 14 it summed
  belong to the phase's shared Verification section, not Theme H). A follow-up ([PR #31](https://github.com/bilo-io/midnite-studio/pull/31))
  then found the sidebar's `branch-delete` never passed the `journalHint` its wired undo reads, so
  that Undo would have recreated a branch literally named `HEAD` at the wrong sha — fixed, with an
  e2e spec that drives the real row menu (`e2e/journal-undo.spec.ts`).

### [Phase 21 — A plural agent roster, and a terminal that knows where it is](phases/phase-21-agent-roster-and-terminal-identity.md)

*Phase 15 built the agent machinery around a roster with one entry in it, and the renderer never
held up its half of the "adding one is an edit, not a release" bargain. A is the contract every
other theme reads off (`icon`, `mode`, `install`, four builtins); B and C are the two surfaces that
stop hard-coding Claude (the session-list mark, the `+` menu); D and E are the live half — a
terminal that knows where it is (OSC 7) and what is running in it (a process probe in main); F is
the header those two finally give something true to say.*

- ✅ **A** — `AgentDefinitionSchema` gains `icon` and `install`; `BUILTIN_AGENTS` grows to four real
  terminal agents (Claude Code `claude`, Antigravity `agy`, Codex `codex`, OpenClaude `openclaude`) —
  and whether a command exists on this machine travels beside them as a separate `AgentStatus`,
  because the definition is config a user hand-edits and the status is a probe result
  (landed 2026-08-27)
- ✅ **B** — three new local brand SVGs beside `claude-icon.tsx` plus an `AGENT_ICONS` registry, so
  `SessionIcon` resolves a mark from the roster instead of hard-coding `<ClaudeIcon>`; all three are
  hand-drawn originals with their provenance written down, and the registry also resolves a curated
  slice of `react-icons/si` for user-added agents (landed 2026-08-27)
- ✅ **C** — the `+` menu goes flat and iconned (New Terminal / Claude Code / Antigravity / Codex /
  OpenClaude), with a main-side install probe — the whole roster in ONE `-lic` shell, per-agent
  framed so an rc-file banner cannot be misread as a path, 30s TTL, and an agent it could not reach
  omitted rather than called missing. `buildNewSessionMenu` is pure, so which rows are dead and why
  is a table test rather than a render (landed 2026-08-27)
- ✅ **D** — OSC 7 live cwd tracking, `liveCwd` in the terminal store, and the header following a
  `cd` through Theme F's resolver — plus `bridge.hostname`, without which the parser rejects every
  payload the canonical emitters actually produce (landed 2026-08-27)
- ✅ **E** — a process probe in main behind `pty:agent-changed`, so an agent started or quit by hand
  swaps the sidebar row's icon; reads process state and acts on nothing. Split into the read
  (`agent-process.ts` — one `ps`, a pure depth-carrying walk, a three-rule matcher that never scans
  arguments) and the cadence (`agent-watcher.ts` — a 750ms quiet debounce, change-only emission, a
  shared snapshot, and a hard rule that a `null` may only take away a mark some probe has actually
  *seen* — a timed grace window would have stripped Claude's mark off an `npm`-installed Claude Code
  the matcher deliberately cannot name). The store's `liveAgentId` is a true tri-state:
  absent ≠ `null` (landed 2026-08-27)
- ✅ **F** — the header loses the word "Terminal": a glyph, the status circle, then a `~`-collapsed
  path with the repo segment emphasised and left-truncation. Brought Theme D's `resolveRepoForPath`
  forward with it — F needs the split point, D needs the same helper against `liveCwd`
  (landed 2026-08-27)

*All six themes have landed (2026-08-27). Three manual passes remain, all needing a real shell or a
packaged app: `cd` between two worktrees and watch the header follow (D), start and quit `codex` and
`agy` inside a shell and watch the row's icon swap both ways (E), and launch the packaged `.app`
from Finder to confirm the install probe still reads the login shell's PATH (C).*

### [Phase 20 — Reviews page & unified diff syntax highlighting](phases/phase-20-reviews-page.md)

*Reviews grows from a sidebar-section stub into a full nav-rail view, and diffs finally get syntax
colour. A is the shell (same `VIEW_FILTERS` mechanism Actions/Tests already use); B and C are the
two read surfaces (list, then detail); D is the highlighting pass shared by every diff surface in
the app; E, F and G are the phase's one deliberate write path — approve/request-changes/comment/
merge, kept in a new `gh-write.ts` so `gh-cli.ts`'s "strictly reads" comment stays true.*

- ✅ **A** — Reviews joins the nav rail as a first-class view, reusing the `VIEW_FILTERS` mechanism
  Actions/Tests already established, hidden for repos with no GitHub remote (landed 2026-08-27)
- ✅ **B** — PR list filterable across every state (open/draft/merged/closed) plus author and
  search, not just the open-only list Phase 17 fetches today; the sidebar section and dashboard
  widget keep asking for open-only via a `state` request param (landed 2026-08-27)
- ✅ **C** — PR detail grows Files/Conversation/Checks tabs, reusing the existing hunk parser for
  PR diffs rather than a second parser — plus a `pull-detail` channel for the head sha no listing
  carries, and Checks matching that sha against the cached run listing rather than costing a
  third subprocess (landed 2026-08-27)
- ✅ **D** — syntax highlighting wired into the one shared `DiffView`, reusing Phase 16's
  already-installed, theme-synced `shiki` highlighter, so Reviews/Changes/Graph render diffs
  identically; deferred per-row through `requestIdleCallback` and cached module-level so it never
  competes with the virtualized scroll path (landed 2026-08-27)
- *(follow-up)* A and B landed against `main` as it stood before Theme C existed; a rebase
  integration mounted `PrDetail` beside the list — a resizable split matching `ActionsView`'s,
  with a new `reviews-store.ts` carrying a sidebar-selected PR number into the view
  (landed 2026-08-27)
- ✅ **E** — inline diff-line comment threads as *rows* in the diff, right-side (added/context)
  lines only for v1 — the phase's highest-unknown piece, and two of its three unknowns turned out to
  be API facts: threads are readable only over GraphQL (REST has no thread object, no `isResolved`
  and no node id), and `gh api`'s `-F` type-guesses its variables. A thread that cannot be anchored —
  outdated, file-level, left-side, or naming a line outside every hunk — renders in a collapsed
  group above the diff rather than against whichever row carries that number now (landed 2026-08-27)
- ✅ **F** — the phase's one deliberate write path: approve/request-changes/comment/merge, in
  `gh-write.ts` beside Theme E's three writes, with the primitives both need extracted into a new
  `gh-shell.ts` so the write module no longer depends on the reader. The merge confirm's blast
  radius comes from `gh pr view --json commits` rather than a local `rev-list --count` — a PR's head
  ref usually is not in this checkout, and `rev-list` against a missing ref reads as zero. All of it
  behind a default-off Settings → Reviews switch that also lists what the app never does
  (landed 2026-08-27)
- ✅ **G** — reviewer re-request off the detail's own `reviewRequests`, Draft → Ready that
  disappears once flipped, and re-run on the Checks tab — two buttons, the failed-only one present
  only on a run that failed. Re-run is the one write that evicts a cache: `gh run rerun` adds an
  attempt to the *same* run id, and main caches a completed run's tree permanently
  (landed 2026-08-27)
- ✅ *(follow-up)* the Playwright suite is green again on `main` — seventeen specs (sixteen of this
  phase's, one of Phase 17's) had gone red against a working product because `app:e2e` sits
  outside the `:test` gate and nothing re-read them after three deliberate decisions moved: a PR
  now opens on **Overview**, the three review scopes now arrive **folded**, and the repos row grew
  a **trailing cluster** that broke a geometry proxy. No product code changed; the landing tab is
  now guarded by one spec instead of thirteen, and four stale screenshots were regenerated
  (285 passed, 0 failed — was 267/17) (landed 2026-08-27)

### [Phase 19 — Dashboard, Actions and Tests as views](phases/phase-19-dashboard-actions-tests.md)

*The nav rail becomes the app's table of contents. A is the shell every other theme renders into;
B and C are the two data layers (local history, and a deeper `gh`); D, E and F are the three
surfaces; G is the one piece that waits on someone else.*

- ✅ **A** — `ViewId` grows to seven, Dashboard rides `NavConfig.pinned` (ungrouped, above the
  sections), Actions/Tests join the rail, and one `VIEW_FILTERS` table reshapes the sidebar on two
  axes — sections and dirty-only — folding Phase 17's Changes filter in rather than leaving it a
  parallel one-off, with a "show all sections" escape hatch (landed 2026-08-26)
- ✅ **B** — `git-engine/src/stats/`: one `--all` history pass feeding a local-timezone commit
  calendar, contributors by email, opt-in churn, and repo health — cached on a digest of every
  ref tip rather than HEAD, because an `--all` traversal changes when any branch moves
  (landed 2026-08-26)
- ✅ **C** — forge deepening through the existing `gh` wrapper: `gh issue list`,
  `gh run view --json jobs`, `gh run view --log`, plus `gh workflow list` for the `.yml` paths a
  run listing never carries — and an Issues sidebar section with a job peek under each run
  (landed 2026-08-26)
- ✅ **D** — the dashboard: a `react-grid-layout` v2 board with theme-token overrides, a widget
  registry that gates on the repo's data sources, per-repo persisted layout, and one board-wide
  author filter every widget reads (landed 2026-08-26)
- ✅ **E** — the Actions view: runs sectioned by workflow **id** (a name is whatever `name:` says
  this morning), a job/step tree with only the failed jobs expanded, one whole-run log fetch split
  in the renderer, a virtualised ANSI pane whose folding changes which rows *exist*, and
  Open-in-GitHub for anything stateful (landed 2026-08-26)
- ✅ **F** — Tests discovery: suites parsed from package.json/moon/vitest/playwright configs,
  monorepo-aware, classified by kind, with "run in terminal" and **no** new trust surface
  (landed 2026-08-27)
- ✅ **G** — real suite execution through a generalised `process-runner.ts` (shared with 18E's
  diagnostics), per-suite trust, `--reporter=json` parsing with an exit-code-plus-raw-output
  fallback, and a live output stream (landed 2026-08-27)

*Open: three human passes — the dashboard against a large real repository, the Actions view
against a real failing matrix run, and `react-grid-layout`'s stylesheet in both themes. All seven
themes are otherwise landed.*

### [Phase 18 — Footer system monitor + repo diagnostics](phases/phase-18-footer-monitor-diagnostics.md)

*The footer's empty right half becomes the app's live-state strip. A and B are the spine — C, D
and F all read the sample stream they push; E is the trust boundary F prompts through.*

- ✅ **A** — darwin metric probes in main (`vm_stat`, `ioreg`, `os.cpus()` deltas, `statfs`), each
  a pure parser behind a thin `execFile`, with a self-disabling GPU probe (landed 2026-08-26)
- ✅ **B** — `mstudio:metrics:*` contract: an all-optional `MetricSample`, a one-way sample stream,
  and an adaptive sampler that stops on window blur (landed 2026-08-26)
- ✅ **C** — metrics store with a time-windowed, flat-seeded buffer, a data-colour palette,
  geometry-as-data, and a hand-rolled area chart + sparkline with a cadence-change rule
  (landed 2026-08-26)
- ✅ **D** — the first real click-toggled popover primitive, plus the footer's slot-based right
  cluster: dot, percentage and sparkline per metric (landed 2026-08-26)
- ✅ **E** — the diagnostics trust policy, written down: per-repo opt-in, a `repoId`-only channel,
  a configurable command, a ranked parser-gated detector registry and a total, *streaming*
  eslint-JSON parser (landed 2026-08-26)
- ✅ **F** — the diagnostics segment (absent ≠ zero, sidebar-selection-driven) and a Monitor &
  Diagnostics settings page, now genuinely built on Theme E's contract: the `contract-shim.ts`
  F compiled against while E was in flight is deleted, and the duplicate `diag` mock the rebase
  left shadowing E's is folded into one (landed 2026-08-26)

*Open: three human passes — cross-checking the readings against Activity Monitor, the idle
battery cost over an hour, and the diagnostics fail-soft matrix (Theme E). Also noted while
landing D: `graph-themes.spec.ts` has twelve pre-existing failures on `main` (a stale
`link`/`button` locator for Settings, plus cross-test ordering the timeout was masking) —
Phase 14's, not this phase's.*

### [Phase 17 — Repositories workbench + forge](phases/phase-17-repos-workbench.md)

*The sidebar stops being a read-mostly tree. A is the spine — B, C and the "View all changes"
buttons all read the per-checkout status it fetches; E is the surface D and F open into.*

- ✅ **A** — per-worktree `git status` via `useQueries`, the accent change-count pill on
  worktrees, branches and the collapsed repo row
- ✅ **B** — the Changes view filters the tree to checkouts that have changes, with a visible,
  reversible toggle
- ✅ **C** — context menu + hover ellipsis on every actionable node; destructive verbs behind a
  danger-themed confirm (blast radius for commits, named warnings for everything else)
- ✅ **D** — "View all changes": a per-file accordion diff of one checkout, lazy per file,
  expand/collapse all with a stated cap
- ✅ **E** — the workbench tab strip; the Changes view becomes a tabbed content area with a
  permanent working-tree tab
- ✅ **F** — `mstudio:forge:*` over the user's own `gh` CLI: Actions and Reviews sections, run and
  PR tabs, and the `ChecksVerdict` producer that `outstanding.md` had been waiting for

*Open: two manual passes — the packaged-app screenshots (Electron will not start in a
non-interactive session) and the `gh`-availability matrix.*

### [Phase 16 — Folder explorer, preview pane + settings pages](phases/phase-16-explorer-and-settings-pages.md)

*The app grows real pages: a read-only Folder view with a preview pane, and Settings split into four pages behind an inner sidebar — including an Agent page into `~/.claude`. B is the spine (the fs IPC + path jail); C/D/E all read through it; A is independent chrome.*

- ✅ **A** — nav rail regrouped (Folder above Graph, Settings pinned bottom) + the settings page shell (merged 2026-08-26)
- ✅ **B** — read-only `mstudio:fs:*` IPC with a path-confinement jail (repo root + `~/.claude`) and a jailed `mstudio-file://` protocol (merged 2026-08-26)
- ✅ **C** — lazy repo file tree, dotfiles shown, gitignored dimmed and collapsed (merged 2026-08-26)
- ✅ **D** — preview pane: shiki code, rendered markdown w/ source toggle, images/PDF/media, fallback card (merged 2026-08-26)
- ✅ **E** — Agent settings page: `~/.claude` tree + preview, Claude version card, Update streams / Uninstall pastes into the terminal (merged 2026-08-26)

*Closed: both real-app manual verification passes done by the user on 2026-08-26 — the
phase is complete.*

- ✅ **F** (follow-up) — the settings sidebar becomes grouped and collapsible (General / Tools /
  System, one glyph per page), and Appearance gains the side-navigation control that exposes the
  rail's third mode (merged 2026-08-26)

### [Phase 15 — Multi-terminal sessions + agents](phases/phase-15-multi-terminal-sessions.md)

*Several terminals at once — shells and coding agents — in a VS Code-style sidebar, surviving a restart with their scrollback. A is the spine: B/C/D all render what A persists. E is independent and also covers the repos sidebar.*

- ✅ **A** — session record + capped scrollback in main; `terminal:*` channels; agent roster with an `agents.json` override
- ✅ **B** — per-session renderer model; multi-xterm host; the cwd-change kill effect deleted (fixes a dead pane)
- ✅ **C** — maximize chevron and the `+` → New Terminal / New Agent menu
- ✅ **D** — the session sidebar, dockable left/right, with a Claude mark for agent sessions
- ✅ **E** — drag-to-reorder via `@dnd-kit/sortable`, for terminals *and* repos
- ✅ **verification** — pty/terminal schema sweep, a fake pty that talks back, nine e2e specs and
  both screenshots; found and fixed two ptys per terminal, self-reviving restored sessions, and an
  `agentId`/`kind` pairing the schema documented but never enforced. One manual item is left for a
  human: quit, relaunch, and confirm `ps` shows no surviving shells

### [Phase 12 — Commit inspector + live badges](phases/phase-12-commit-inspector.md)

*Phase 5's detail stub is now a real inspector, its badges are controls, and its rows read at two densities. **All six themes have landed**; two manual passes remain, both needing a packaged app or a real remote.*

- ✅ **A** — markdown + linkify commit bodies: clickable SHAs, URLs, `#123`, emails, trailer styling (2026-08-26)
- ✅ **B** — inspector rebuild: sha header + copy button, tree ⇄ list toggle, parent navigation, `stat` dropped from the wire, `repo:rev-parse` + `clipboard:write-text` channels (2026-08-26)
- ✅ **C** — ref badges as controls: `isHead` glow, hover-expand pull/push with real-count tooltips, branch-scoped sync in the context menu (2026-08-26)
- ✅ **D** — real diffs: `mstudio:commit:file-diff` channel, hunk parser, one restrained `<DiffView>` shared with the status panel (branch `feature/phase-12-diffs`)
- ✅ **E** — `Remote` domain type, `listRemotes`, ssh/https URL normaliser, guarded `shell:open-external` (2026-08-26)
- ✅ **F** — graph row polish: lane-accent selection bar, a CVD-safe palette (+ the `laneInk` bug it exposed), badge width cap, row density, working-copy row (2026-08-26)

### [Phase 14 — Graph themes + avatars](phases/phase-14-graph-themes.md)

*Four selectable graph styles, avatars in the commit bubble, and the Settings view to hold the picker. A is the spine — B/C/D all render through it.*

- ✅ **A** — `GraphTheme` descriptor + four styles; theme-driven `graph-svg`
- ✅ **B** — Gravatar avatars in the node, generated fallback; Author column deleted
- ✅ **C** — dedicated BRANCH / TAG column, `graphColumns` migration
- ✅ **D** — author filter (dim, never remove); shared multi-select menu
- ✅ **E** — Settings view + live style picker, plus the shell's appearance runtime

### [Phase 13 — UI polish](phases/phase-13-ui-polish.md)

- ✅ **A** — lucide, motion keyframes, applyMotion, Tooltip, IconButton, cascade
- ✅ **B** — use-resizable + ResizeHandle, persisted ui-store, four resizable panes
- ✅ **C** — TreeSection, per-repo collapsible Local/Remotes/Tags/Worktrees, icon overhaul
- ✅ **D** — lockable nav rail (navMode persisted, pin in the brand slot)
- ✅ **E** — theme toggle + sync cluster in the title bar, three dead CommandIds wired
- ✅ **F** — graph column headers, resizable columns, multi-select branch filter
- ✅ **G** — cascading fade-in, view cross-fade, once-per-stream graph fade

### [Phase 11 — Packaging + docs](phases/phase-11-packaging.md)

- ✅ **A** — electron-builder arm64, afterpack/install-local scripts, CI workflow, README/docs final

### [Phase 10 — Watcher / live refresh](phases/phase-10-watcher.md)

- ✅ **A** — fs.watch repo watcher, own-write suppression, kind→invalidation map

### [Phase 9 — Integrated terminal + keybindings](phases/phase-9-terminal-and-keybindings.md)

- ✅ **A** — pty-service (node-pty in main), xterm panel, Ctrl+` keybinding service + menu + footer bar

### [Phase 8 — Drag-drop ops + conflicts](phases/phase-8-drag-drop-ops.md)

- ✅ **A** — merge/rebase/cherry-pick + sequencer, @dnd-kit gestures, conflict banner

### [Phase 7 — Graph interactions](phases/phase-7-graph-interactions.md)

- ✅ **A** — context menus, checkout, branch/tag create, blast-radius-gated reset/delete

### [Phase 6 — Status / stage / commit / sync](phases/phase-6-status-and-sync.md)

- ✅ **A** — stage/unstage/discard/commit, ahead-behind chips, fetch/pull/push (no force)

### [Phase 5 — Commit graph, read-only](phases/phase-5-commit-graph.md)

- ✅ **A** — streaming log service, virtualized SVG rows, ref badges, detail stub

### [Phase 4 — Repo open/list + worktree sidebar](phases/phase-4-repos-and-worktrees.md)

- ✅ **A** — repo registry + persistence, VSCode-style sidebar with nested worktrees, add/remove

### [Phase 3 — Electron shell boots](phases/phase-3-electron-shell.md)

- ✅ **A** — frameless window, AppFrame/TitleBar/theme on @bilo-io/ui+shell, preload windowChrome bridge

### [Phase 2 — Lane layout engine](phases/phase-2-lane-layout.md)

- ✅ **A** — straight-lane layout with recycling, LaneLayoutSession streaming, stable colors

### [Phase 1 — Shared contracts + git-engine parsers](phases/phase-1-contracts-and-parsers.md)

- ✅ **A** — zod domain/IPC contracts, dugite exec + write queue, NUL-delimited parsers, smoke script

### [Phase 0 — Scaffold](phases/phase-0-scaffold.md)

- ✅ **A** — proto/moon/pnpm skeleton, four packages, boundary lint rules, GH Packages auth proven

## Conventions

- One phase per PR where practical; claim a theme in the `🔄 WIP` column (commit to `main`) before branching; update this table + `done.md` as work lands.
- Every phase ends green on `moon run :typecheck :lint :test` plus its own verification list.
- Visual phases (3–9) capture a screenshot as part of verification.
