# Phase 10 — Watcher / live refresh

Everything updates without manual refresh — including changes made from the integrated terminal
or an external shell.

## Deliverables

- [x] `git-engine/src/watch/repo-watcher.ts` — fs.watch on `.git/HEAD`, `.git/refs/` (recursive), `.git/index`, `packed-refs`, each worktree's gitdir, and the working tree root; classify → `WatchEvent.kind` (`refs|index|worktree|head`); 200ms debounce
- [x] **Suppress-during-own-write** — flag driven by the write queue so the app's own ops don't double-refresh mid-operation
- [x] `desktop/src/main/watch-service.ts` — one watcher per open repo → `mstudio:watch:event`
- [x] `app/src/services/watch-invalidation.ts` — kind → action map: `refs`/`head` → invalidate refs + re-stream log (fresh requestId); `index`/`worktree` → invalidate status
- [x] Remove the Phase 6 manual-invalidation-only paths where the watcher now covers them

## Verification

- [x] Unit tests for debounce + classification against temp repos
- [x] Commit from the integrated terminal → graph + status update within ~1s
- [x] `git checkout -b` from an external terminal → sidebar/badges update
- [x] An app-driven op (stage/commit) refreshes exactly once (no storm)

Screenshot: [live refresh](../docs/screenshots/phase-10-live-refresh.png).

Verified by driving the real app:

| Check | Result |
|---|---|
| `git commit` in the integrated terminal | graph went 2 → 3 rows, `◉main` moved to the new commit |
| `git checkout -b made-outside` in the terminal | new badge appeared; footer switched to `made-outside` |
| Write inside `node_modules` | no event at all |
| 20 simultaneous file writes | ≤ 3 events |
| Writes made through the write queue | no event (own-write suppression) |

## Findings while landing this phase

- **`refs` events MUST re-stream the graph, and the first version got this wrong.** The argument
  for not re-streaming sounded good — badges join rows by sha, so a ref moving only needs the
  badge refreshed — but it holds only when the ref moves to a commit *already in the graph*. The
  commonest ref event by far is a commit, which advances a branch tip to a commit that is not in
  the streamed rows at all. Committing from the integrated terminal did nothing to the graph, and
  no unit test would have caught it: the mapping was internally consistent and wrong.
- **A commit does not touch `.git/HEAD`.** HEAD holds `ref: refs/heads/main`, so a commit updates
  the *ref* file, not HEAD. Anything relying on a `head` event to notice a commit never fires.
- **Own-write suppression needs a settle window, not just a busy flag.** git's writes land
  slightly after the process exits, so dropping events only *while* the queue is busy leaves a
  tail that reads as an external change and re-triggers the very refetch the write already did.
- **Suppression is applied at flush, not at queue time** — a write can start after an event is
  queued but before the debounce fires.
- **Watch narrow paths, not `.git` whole.** Watching the directory would report every loose object
  git writes during a commit; `HEAD`, `index`, `packed-refs` and `refs/` are watched individually,
  and `.git` is excluded from the recursive worktree watcher for the same reason.
- **`worktrees/` is watched** so a checkout in a *linked* worktree is visible — its HEAD lives at
  `.git/worktrees/<name>/HEAD`, nowhere near the paths above.
- **Watching a non-existent path must be a no-op.** `packed-refs` only appears after a gc and
  `worktrees/` only once one exists; throwing there would break startup on a fresh repo.
- The noise filter is a fixed directory list, not a `.gitignore` parser: parsing gitignore per
  event would cost more than the refetch it saves, and a false negative only means one extra
  `git status`.

### Dev-seam fixes this phase forced

- `MGIT_TYPE` lowercased every capital, so `git add -A` reached the shell as `git add -a` — a
  different flag, and invisible unless you read the terminal output. Capitals now carry `shift`.
- Setting `app.setName('midnite-git')` in Phase 9 moved `userData`, so the test scripts were
  clearing a `repos.json` the app no longer read and a stale repo kept loading.
