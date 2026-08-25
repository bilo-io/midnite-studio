# Phase 6 — Status / stage / commit / sync panel

Working-tree panel for the selected repo/worktree: staged/unstaged lists, stage/unstage/discard,
commit, and VSCode-style sync (fetch/pull/push) with ahead/behind chips.

## Deliverables

- [ ] `git-engine/src/commands/{stage,commit,discard}.ts` — all through the write queue; `discard` uses explicit paths only (`checkout -- <paths>` / `clean -f <paths>`), never bare
- [ ] `git-engine/src/commands/{fetch,pull,push}.ts` — rely on the user's credential helpers/SSH agent; `GIT_TERMINAL_PROMPT=0` so auth failures error loudly instead of hanging; **no force-push anywhere** (see outstanding.md)
- [ ] IPC handlers `mgit:status:get`, `mgit:op:{stage,unstage,discard,commit,fetch,pull,push}`
- [ ] `app/src/features/status/{status-panel.tsx,file-row.tsx,commit-box.tsx,use-status.ts}` — Query `['status', repoId]`; manual invalidation on op success (watcher makes it live in Phase 10)
- [ ] Ahead/behind chips + Sync buttons (fetch / pull / push) surfaced from `StatusResult.branch`
- [ ] File-diff stub: `mgit:commit:file-diff` returning unified diff text in a `<pre>` (proper viewer → outstanding.md)
- [ ] Discard gated by a confirm dialog

## Verification

- [ ] Integration tests: stage → status shows staged → commit → clean; conflict entries parse; push/pull against a local bare-remote fixture
- [ ] Manual: edit/stage/commit in a scratch repo; committed sha appears at graph top after refresh
- [ ] Push with no credentials errors visibly (no hang)
- [ ] Screenshot captured
