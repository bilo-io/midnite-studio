# Outstanding — deliberately deferred scope

Recorded here when a phase punts on something; pick these up post-MVP.

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

- **Five more persisted preferences with no settings page — `editor*`.** Landed by
  [Phase 64](phases/phase-64-offline-monaco-and-themes.md) (`#164`, merged onto `main` while Phase
  63 was in flight): `editorFontFamily`, `editorFontSize`, `editorMinimap`, `editorTabSize`,
  `editorWordWrap` in `ui-store.ts`, created for the Monaco editor but never given a settings page —
  Phase 64's own Theme F (still open) covers the palette override selectors, not these five. Sits in
  `persisted-keys.ts`'s `KNOWN_ORPHANS` allow-list beside the five above, added there by Phase 63's
  PR #167 only so its own exhaustiveness test would not fail on a gap this phase never touched.
  Wants a home in `terminal-page.tsx`'s shape — an "Editor" settings page, or an accordion on
  whichever page ends up owning the Monaco/CodeMirror surface.

- **Interactive rebase** — via a `GIT_SEQUENCE_EDITOR` helper binary that writes the UI's todo
  list; `GIT_EDITOR` for reword. Impossible with libgit2/isomorphic-git; CLI-only trick.
- ~~**Proper diff viewer**~~ — ✅ landed in Phase 12 Theme D: parsed hunks over IPC, one shared
  `<DiffView>`, restrained tinting with intraline word marking, virtualised rows. Two pieces
  deliberately left out of it:
  - **Syntax highlighting inside diff lines** — now much cheaper than when this was parked:
    Phase 16 landed `shiki` (lazy per-extension grammars, both github themes synced to the app
    theme) and a language map (`app/src/lib/languages.ts`) for its file previews, so the "heavy
    dependency plus a language-detection story" is already paid for. What remains is wiring
    `codeToHtml` into `<DiffView>`'s virtualised rows without regressing scroll performance.
    Word-level intraline marking still covers the common case; revisit when reading unfamiliar
    code in the panel proves hard.
  - **Side-by-side diff** — earns its keep only in a full-width diff surface, which does not
    exist yet; the inspector is a narrow side panel.
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

## Image diffs in a pull request

The image viewer is wired into the Changes pane and the commit inspector, and not into the
Reviews page. It needs a revision pair, and `ForgePullDetail` carries only `headSha` — there is
no base sha in the shape, so there is nothing to read the "before" from. Two things would have
to hold: the forge domain would need the base sha, and both objects would have to be in the
local checkout, which for a fork's PR means a fetch first. Until then a binary image in a PR
keeps the sentence, which is at least not misleading.

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
