# Outstanding — deliberately deferred scope

Recorded here when a phase punts on something; pick these up post-MVP.

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

- **Nothing runs `app:e2e` automatically.** — still open, but no longer unexamined. The
  Playwright suite is out of `moon run :test` on purpose (it needs a chromium download) and so
  it runs only when a human remembers; on 2026-08-27 seventeen specs sat red on `main` across
  several merges because no one did.

  **2026-09-01: the job was built, measured, and deliberately held back.** Running the suite in
  full for the first time in weeks found **45 failures across 17 of 58 files**, and a bisect
  against `ec2c75e` rules out Phase 36 — the same three sample files fail 15 there against 13 on
  `main`. So it is drift, and [Phase 38](phases/phase-38-e2e-suite-repair.md) owns repairing it.
  What already landed is the scaffolding the job needs, so the follow-up is small:
  [`playwright.ci.config.ts`](../../packages/app/playwright.ci.config.ts) — the **ratchet**,
  naming every currently-red file so CI can block on the 41 green ones — the `app:e2e-ci` moon
  task that runs it, and CI-only `retries: 2` plus 15s/60s timeouts in
  [`playwright.config.ts`](../../packages/app/playwright.config.ts).

  **Why the job itself is not wired up yet.** A four-way-sharded ubuntu job was built and run:
  three shards go green in 5–7 minutes, and **shard 2 never completed once across four runs** —
  still inside its Playwright step after 22 minutes where its siblings finish in six. The cause
  is unknown; it does not reproduce in a local run of the same shard. Merging a *blocking* job
  in that state would have wedged every PR, and the job carried no `timeout-minutes`, so a hang
  would have held a runner for GitHub's 6-hour default rather than failing fast. Both are
  cheap to fix and neither should be guessed at under merge pressure.

  **The counts below are already a floor, not a total.** Rebasing onto `main` mid-way picked up
  another session's renderer work, and a local run of one shard then failed four specs that had
  passed an hour earlier (`files-search`, `files-view`, `files-editor`, `diff-scroll-perf`) —
  which is the same rot arriving in real time, and the argument for landing the job rather than
  perfecting the list first. Re-measure when it lands; do not trust these numbers to be current.

  Measured along the way, so the follow-up does not repeat them: unsharded the job took
  **21m30s** against 3m0s locally (a private repo's ubuntu runner is 2-core, so Playwright takes
  one worker where a 12-core laptop takes six); four shards bring that to ~6 min. And four specs
  fail **only** on Linux because xterm paints through `@xterm/addon-webgl` and a GPU-less runner
  has no context to give it — a 15s timeout moved nothing and SwiftShader fixed none of them
  while costing 60% more runtime, so both were reverted and Phase 38 Theme I owns the real
  answer.

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
