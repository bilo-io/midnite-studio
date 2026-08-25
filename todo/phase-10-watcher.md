# Phase 10 — Watcher / live refresh

Everything updates without manual refresh — including changes made from the integrated terminal
or an external shell.

## Deliverables

- [ ] `git-engine/src/watch/repo-watcher.ts` — fs.watch on `.git/HEAD`, `.git/refs/` (recursive), `.git/index`, `packed-refs`, each worktree's gitdir, and the working tree root; classify → `WatchEvent.kind` (`refs|index|worktree|head`); 200ms debounce
- [ ] **Suppress-during-own-write** — flag driven by the write queue so the app's own ops don't double-refresh mid-operation
- [ ] `desktop/src/main/watch-service.ts` — one watcher per open repo → `mgit:watch:event`
- [ ] `app/src/services/watch-invalidation.ts` — kind → action map: `refs`/`head` → invalidate refs + re-stream log (fresh requestId); `index`/`worktree` → invalidate status
- [ ] Remove the Phase 6 manual-invalidation-only paths where the watcher now covers them

## Verification

- [ ] Unit tests for debounce + classification against temp repos
- [ ] Commit from the integrated terminal → graph + status update within ~1s
- [ ] `git checkout -b` from an external terminal → sidebar/badges update
- [ ] An app-driven op (stage/commit) refreshes exactly once (no storm)
