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

- **Command palette** — the keybinding service's CommandId registry is designed to feed one.
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
