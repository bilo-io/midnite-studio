# Outstanding — deliberately deferred scope

Recorded here when a phase punts on something; pick these up post-MVP.

- **Interactive rebase** — via a `GIT_SEQUENCE_EDITOR` helper binary that writes the UI's todo
  list; `GIT_EDITOR` for reword. Impossible with libgit2/isomorphic-git; CLI-only trick.
- ~~**Proper diff viewer**~~ — ✅ landed in Phase 12 Theme D: parsed hunks over IPC, one shared
  `<DiffView>`, restrained tinting with intraline word marking, virtualised rows. Two pieces
  deliberately left out of it:
  - **Syntax highlighting inside diff lines** — `shiki`/`prism` is a heavy dependency plus a
    language-detection story, and word-level intraline marking already distinguishes a one-token
    edit from a rewrite. Revisit if reading unfamiliar code in the panel proves hard.
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
