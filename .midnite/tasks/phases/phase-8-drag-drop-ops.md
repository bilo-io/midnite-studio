# Phase 8 — Drag-drop ops: merge / rebase / cherry-pick + conflict surfacing

The GitKraken signature gestures, with a conflict banner + abort/continue flow.

## Deliverables

- [x] `git-engine/src/commands/{merge,rebase,cherry-pick}.ts` — conflicts map to `GitOpResult { kind: 'conflict', files, op }`
- [x] `git-engine/src/commands/sequencer.ts` — detects in-progress state (`MERGE_HEAD`, `rebase-merge/`, `CHERRY_PICK_HEAD`), exposes `abort` / `continue`; feeds `StatusResult.inProgress`
- [x] IPC handlers `mstudio:op:{merge,rebase,cherry-pick,abort,continue}`
- [x] `app/src/features/graph/dnd/{drag-context.tsx,branch-drag.ts,commit-drag.ts,drop-menu.tsx}` — **@dnd-kit**: drag branch badge → branch badge opens drop-menu ("Merge X into Y" / "Rebase X onto Y"); drag commit row → branch badge = cherry-pick (confirmed)
- [x] `app/src/features/conflicts/conflict-banner.tsx` — shown while `status.inProgress` non-null: conflicted file list, Abort / Continue (Continue disabled while conflicts remain)
- [x] Interactive rebase noted in `outstanding.md` (`GIT_SEQUENCE_EDITOR` helper), not built here

## Verification

- [x] Integration tests: merge fast-forward; merge-conflict → abort restores clean state; rebase-conflict → resolve → continue completes; cherry-pick clean + conflicted
- [x] Manual: two-branch scratch repo — drag-merge; force a conflict, resolve in an editor, Continue
- [x] Abort always visible during any in-progress op
- [x] Screenshots: drag preview + drop-menu + conflict banner

Screenshots: [drop menu](../docs/screenshots/phase-8-drop-menu.png) ·
[conflict banner](../docs/screenshots/phase-8-conflict-banner.png).

Driven end-to-end against a repo with a guaranteed conflict: dragged the `feature` badge onto
`main` (drop target highlighted mid-drag), chose "Merge feature into main", got the conflict
banner with Continue disabled ("Resolve and stage every conflicted file first.") and Abort live,
then aborted — banner gone, `git status` clean, `shared.txt` back to `main side`.

## Findings while landing this phase

- **A drop opens a menu; it never acts.** "Merge X into Y" and "Rebase Y onto X" are the same
  gesture with opposite effects on history, and picking one silently is a decision the user
  cannot see being made.
- **The drag needs an activation distance.** Without `activationConstraint: { distance: 6 }`
  every click on a badge starts a drag and the click handlers — select, double-click to check
  out — stop firing entirely.
- **`DragOverlay`, not an in-place transform.** Graph rows are virtualized, so the dragged badge
  unmounts the moment it scrolls out of view and the drag visibly dies mid-gesture.
- **dnd-kit's drag-end carries no pointer position**, so the view tracks the last pointer move to
  place the drop menu where the user actually released.
- **A conflict clears the error line rather than writing to it.** The banner says everything that
  needs saying and carries the way out; a red toast alongside it is noise.
- **Abort is never disabled.** It is git's own restore path, it always works, and the worst state
  a git client can leave someone in is "something is wrong and I can't find the way out".
- **Cherry-pick reverses the sha list before invoking git.** The graph lists commits newest-first;
  applying them in that order replays the changes backwards and conflicts against itself.
- **One `cherry-pick A B C` invocation, not a loop** — git's sequencer then owns the run, so a
  conflict on the third commit leaves the first two applied and `--continue` resumes correctly.
- **`--no-edit` on merge and `GIT_EDITOR=true` on `--continue`.** Both open an editor by default,
  and with no terminal attached git waits forever.
- **A non-zero exit alone can't distinguish a conflict from a failure** — `git merge` exits 1 for
  both — so the worktree is inspected afterwards; and on a genuine failure any half-started
  sequencer state is aborted so the user is not left in an operation they never chose.

### A build-graph bug this phase surfaced

`desktop:typecheck` had lost its `shared:build`/`git-engine:build` deps during Phase 4 debugging
and was never restored. Worse, moon hashes a task from its **own** declared inputs, so even with
the deps present a change confined to `git-engine` left the task a cache hit — `desktop:typecheck`
reported green against an engine API that no longer existed, then failed baffling­ly one command
later. Both `desktop:typecheck` and `app:typecheck` now list the upstream `src/**` as inputs, and
the fix is verified: touching `git-engine/src/index.ts` now rebuilds the engine and re-runs the
dependent typecheck.
