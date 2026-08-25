# Phase 4 — Repo open/list + worktree sidebar

VSCode-SCM-style repositories panel: open via native dialog, persisted list, worktrees nested
under their main repo, selection drives the main area.

## Deliverables

- [ ] `desktop/src/main/repo-registry.ts` — `repoId → git-engine instance` map; `git rev-parse --git-dir` validation; a worktree path resolves to its main repo (handle `.git`-as-file gitdir pointers)
- [ ] `desktop/src/main/repo-store.ts` — persisted opened paths in `app.getPath('userData')/repos.json`
- [ ] IPC handlers: `mgit:repo:{open,open-dialog,list,close,refs,worktrees,worktree-add,worktree-remove}` (zod-validated)
- [ ] Preload: `repo` bridge section
- [ ] `app/src/features/repos/{repos-panel.tsx,repo-item.tsx,use-repos.ts}` — Query-driven list; worktrees nested via ui Collapse/Accordion; open button → native dialog; worktree add/remove actions (remove gated by a confirm)
- [ ] `app/src/state/ui-store.ts` — `selectedRepoId` (a worktree is selectable as the active context)

## Verification

- [ ] Open `~/Dev/midnite` and one of its worktrees — worktree nests under the main repo, not as a sibling
- [ ] Repo list survives app restart
- [ ] Worktree add creates + appears; remove tears down (never `--force`)
- [ ] Screenshot captured
