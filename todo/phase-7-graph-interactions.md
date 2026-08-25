# Phase 7 — Graph interactions: context menus, checkout, branch/tag, reset

Right-click + double-click verbs on commit rows and ref badges, with blast-radius-gated
destructive ops.

## Deliverables

- [ ] `git-engine/src/commands/{checkout,branch,tag,reset}.ts` + error mapping: dirty-tree checkout block, branch-checked-out-in-another-worktree block
- [ ] IPC handlers `mgit:op:{checkout,branch-create,tag-create,reset}`
- [ ] `app/src/components/context-menu.tsx` — renderer-drawn, token-styled popover (not native `Menu.popup`; keeps state/testing in React)
- [ ] `app/src/features/graph/graph-context-menu.tsx`:
  - commit row: create branch here, create tag, checkout (detached), cherry-pick onto current (lands Phase 8), reset current branch here (soft/mixed/hard submenu)
  - branch badge: checkout, merge into current (Phase 8), rebase current onto (Phase 8), rename, delete
- [ ] Double-click branch badge → checkout
- [ ] `app/src/components/confirm-dialog.tsx` — **blast-radius gating**: hard reset / branch delete show `git rev-list --count` of commits that would be orphaned

## Verification

- [ ] Integration tests per command, incl. both checkout-block error paths
- [ ] Manual scratch-repo run-through: create branch/tag, checkout, reset soft/mixed/hard — graph + HEAD badge update after refresh
- [ ] Hard reset confirm shows the correct orphan count
- [ ] Screenshot of the context menu captured
