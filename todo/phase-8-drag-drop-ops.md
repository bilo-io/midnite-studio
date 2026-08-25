# Phase 8 — Drag-drop ops: merge / rebase / cherry-pick + conflict surfacing

The GitKraken signature gestures, with a conflict banner + abort/continue flow.

## Deliverables

- [ ] `git-engine/src/commands/{merge,rebase,cherry-pick}.ts` — conflicts map to `GitOpResult { kind: 'conflict', files, op }`
- [ ] `git-engine/src/commands/sequencer.ts` — detects in-progress state (`MERGE_HEAD`, `rebase-merge/`, `CHERRY_PICK_HEAD`), exposes `abort` / `continue`; feeds `StatusResult.inProgress`
- [ ] IPC handlers `mgit:op:{merge,rebase,cherry-pick,abort,continue}`
- [ ] `app/src/features/graph/dnd/{drag-context.tsx,branch-drag.ts,commit-drag.ts,drop-menu.tsx}` — **@dnd-kit**: drag branch badge → branch badge opens drop-menu ("Merge X into Y" / "Rebase X onto Y"); drag commit row → branch badge = cherry-pick (confirmed)
- [ ] `app/src/features/conflicts/conflict-banner.tsx` — shown while `status.inProgress` non-null: conflicted file list, Abort / Continue (Continue disabled while conflicts remain)
- [ ] Interactive rebase noted in `outstanding.md` (`GIT_SEQUENCE_EDITOR` helper), not built here

## Verification

- [ ] Integration tests: merge fast-forward; merge-conflict → abort restores clean state; rebase-conflict → resolve → continue completes; cherry-pick clean + conflicted
- [ ] Manual: two-branch scratch repo — drag-merge; force a conflict, resolve in an editor, Continue
- [ ] Abort always visible during any in-progress op
- [ ] Screenshots: drag preview + drop-menu + conflict banner
