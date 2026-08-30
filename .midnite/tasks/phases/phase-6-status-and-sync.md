# Phase 6 — Status / stage / commit / sync panel

Working-tree panel for the selected repo/worktree: staged/unstaged lists, stage/unstage/discard,
commit, and VSCode-style sync (fetch/pull/push) with ahead/behind chips.

## Deliverables

- [x] `git-engine/src/commands/{stage,commit,discard}.ts` — all through the write queue; `discard` uses explicit paths only (`checkout -- <paths>` / `clean -f <paths>`), never bare
- [x] `git-engine/src/commands/{fetch,pull,push}.ts` — rely on the user's credential helpers/SSH agent; `GIT_TERMINAL_PROMPT=0` so auth failures error loudly instead of hanging; **no force-push anywhere** (see outstanding.md)
- [x] IPC handlers `mstudio:status:get`, `mstudio:op:{stage,unstage,discard,commit,fetch,pull,push}`
- [x] `app/src/features/status/{status-panel.tsx,file-row.tsx,commit-box.tsx,use-status.ts}` — Query `['status', repoId]`; manual invalidation on op success (watcher makes it live in Phase 10)
- [x] Ahead/behind chips + Sync buttons (fetch / pull / push) surfaced from `StatusResult.branch`
- [x] File-diff stub: `mstudio:commit:file-diff` returning unified diff text in a `<pre>` (proper viewer → outstanding.md)
- [x] Discard gated by a confirm dialog

## Verification

- [x] Integration tests: stage → status shows staged → commit → clean; conflict entries parse; push/pull against a local bare-remote fixture
- [x] Manual: edit/stage/commit in a scratch repo; committed sha appears at graph top after refresh
- [x] Push with no credentials errors visibly (no hang)
- [x] Screenshot captured

Screenshot: [changes panel](../docs/screenshots/phase-6-changes-panel.png) — a scratch repo with a
partially staged file, a staged deletion, and an untracked file; sync bar, both lists, and the
unified-diff pane.

End-to-end smoke: typed a message into the commit box, pressed Commit, and `git log` shows
`feat: commit from the panel` with only the staged content in it — the further unstaged edit to
`src.ts` and the untracked `notes.md` both survived.

## Findings while landing this phase

- **Both `reset HEAD` and `restore --staged` fail in an unborn repo** with "could not resolve
  HEAD" — which is precisely when a user is most likely to be undoing their very first `git add`.
  Before the first commit there is no HEAD to restore the index from, so `rm --cached` is the only
  correct unstage. Triggered as a fallback on the failure, so the normal path stays one git call.
- **Git reports "nothing to commit" on *stdout*, not stderr, and exits 1.** Reading only stderr
  yields an empty, mystifying error for the most common commit failure there is.
- **The commit message goes over stdin (`commit -F -`), never `-m`.** A message is arbitrary user
  text — quotes, newlines, backticks, a leading `-` — and there is no escaping that is right
  across shells. Covered by a test committing exactly that message.
- **`pull` always passes `--rebase`/`--no-rebase` explicitly.** Leaving it to `pull.rebase` means a
  button whose effect on history depends on invisible config.
- **A non-fast-forward push must not suggest force.** The MVP has no force push at all, so the
  message names the actual fix ("Pull first, then push again") — and a test asserts the word
  "force" never appears in it.
- **`git diff` says nothing about untracked files**, so a new file the user can plainly see in the
  changes list rendered an empty pane. Falls back to `diff --no-index /dev/null <path>`.
- **Discard never touches untracked files** and the action is hidden for them: `restore` only
  knows tracked content, and deleting untracked files is a different, far more dangerous
  operation than reverting a tracked change.
- **A stale `desktop/dist` presents as a silently empty panel**, not an error: the renderer's
  `invoke` on an unregistered channel rejects, TanStack Query swallows it into an error state, and
  the placeholder data renders as "no changes". Rebuild desktop after adding a handler.
