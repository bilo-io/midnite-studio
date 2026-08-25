# Outstanding — deliberately deferred scope

Recorded here when a phase punts on something; pick these up post-MVP.

- **Interactive rebase** — via a `GIT_SEQUENCE_EDITOR` helper binary that writes the UI's todo
  list; `GIT_EDITOR` for reword. Impossible with libgit2/isomorphic-git; CLI-only trick.
- **Proper diff viewer** — Phase 6 ships a unified-diff `<pre>` stub only.
- **Stash** — list/apply/pop/drop + a graph affordance.
- **Force-push** — only ever `--force-with-lease`, behind blast-radius confirm gating. No force
  push exists anywhere in the MVP.
- **Auto-updater** — crib midnite's `updater.ts`/`update-state.ts`/`feed-channel.ts`. Gotcha: use
  the **named** import `import { autoUpdater } from 'electron-updater'` (default import is
  `undefined` under `module: commonjs` and crashes main at boot).
- **Interval-tree edge culling** in the graph — only if profiling shows edge rendering as the
  bottleneck on very large repos (see pvigier's benchmarks: ~180x on the naive path).
- **Command palette** — the keybinding service's CommandId registry is designed to feed one.
- **Submodules** — status/graph awareness.
- **Windows/Linux targets** — packaging is macOS arm64 first; keybindings already use Ctrl+`
  everywhere so no rebind needed.
