# Phase 4 — Repo open/list + worktree sidebar

VSCode-SCM-style repositories panel: open via native dialog, persisted list, worktrees nested
under their main repo, selection drives the main area.

## Deliverables

- [x] `desktop/src/main/repo-registry.ts` — `repoId → git-engine instance` map; `git rev-parse --git-dir` validation; a worktree path resolves to its main repo (handle `.git`-as-file gitdir pointers)
- [x] `desktop/src/main/repo-store.ts` — persisted opened paths in `app.getPath('userData')/repos.json`
- [x] IPC handlers: `mgit:repo:{open,open-dialog,list,close,refs,worktrees,worktree-add,worktree-remove}` (zod-validated)
- [x] Preload: `repo` bridge section
- [x] `app/src/features/repos/{repos-panel.tsx,repo-item.tsx,use-repos.ts}` — Query-driven list; worktrees nested via ui Collapse/Accordion; open button → native dialog; worktree add/remove actions (remove gated by a confirm)
- [x] `app/src/state/ui-store.ts` — `selectedRepoId` (a worktree is selectable as the active context)

## Verification

- [x] Open `~/Dev/midnite` and one of its worktrees — worktree nests under the main repo, not as a sibling
- [x] Repo list survives app restart
- [x] Worktree add creates + appears; remove tears down (never `--force`)
- [x] Screenshot captured

Screenshot: [repositories sidebar](../docs/screenshots/phase-4-repos-sidebar.png) — `~/Dev/midnite`,
one of its worktrees, and `~/Dev/midnite-git` opened; the worktree nests as `fix/e2e-harness`
under `midnite` rather than becoming a third top-level repo.

## Findings while landing this phase

- **dugite throws — it does not exit non-zero — when git can't be launched**, most often
  "Unable to find path to repository on disk" for a `cwd` that no longer exists. Restoring the
  persisted repo list would therefore *crash boot* the first time a user deleted a repo folder
  between sessions. `execGit` now converts a launch failure into an ordinary `exitCode: -1`
  result, so callers have one failure shape instead of two.
- **`<main>` gets no top offset for the title bar.** AppFrame pads it left for the fixed rail, but
  the bar publishes `--titlebar-h` precisely so the host's in-flow column offsets itself. Without
  it the panel's first rows render *behind* the bar — which reads as a missing header, not a
  layout bug. Caught with `MGIT_EVAL`, not by eye.
- **Git's worktree error wording differs by version.** dugite's bundled 2.43 says
  `'x' is already used by worktree at`, newer builds say `'x' is already checked out at`.
  Matching one phrasing silently degrades to a generic message for half the users.
- **`git worktree add` writes progress to stderr *before* the error**, so "first non-empty line"
  reports `Preparing worktree (checking out 'main')` as the failure. `gitErrorLine` prefers a
  `fatal:`/`error:` line.
- **`repo-store` takes its directory as a parameter** rather than calling `app.getPath`, which
  keeps `electron` out of both it and `repo-registry` — and is what lets the registry's whole
  behaviour (nesting, dedup, persistence, workdir resolution) be tested under plain vitest against
  real repos.
- `resolveWorkdir` ignores a `worktreePath` that isn't one of the repo's own worktrees. It arrives
  from the renderer, and honouring it unchecked would run git *writes* in an arbitrary directory.
- Two dev seams added for headless verification: `MGIT_OPEN_REPOS` (open repos at boot, through
  the same code path as the dialog) and `MGIT_EVAL` (evaluate an expression in the renderer and
  log the JSON result).
