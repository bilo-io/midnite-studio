# Phase 31 — Interactive Rebase Builder & Graph Sequence Editor

Phase 8 introduced visual drag-and-drop git operations (cherry-pick, simple rebase onto branch), but left full interactive rebase parked in `outstanding.md` because `libgit2` and `isomorphic-git` lack sequence editor support. This phase delivers a full-featured, visual Interactive Rebase Builder using a native Node/Electron `GIT_SEQUENCE_EDITOR` helper script communicating back to main process queues.

> **Builds on:** Phase 8 (drag-drop ops), Phase 9 (command keybindings), Phase 12 (commit inspector), Phase 22 (stash & safety net).
>
> **Scope guardrails:** No automatic force-pushing; rebase execution requires explicit confirmation. Conflict resolution reuses the existing Changes panel and staging engine rather than inventing a separate 3-way merge tool.
>
> **Effort tags:** **S** ≈ half a day · **M** ≈ 1–2 days · **L** ≈ 3+ days.

---

## Deliverables

### Theme A — `GIT_SEQUENCE_EDITOR` Helper & Wire Contract · M

- [ ] `packages/shared/src/domain/rebase.ts` — `RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop' | 'break' | 'exec'`, `RebaseEntry`, `RebaseSequencePlan` zod schemas
- [ ] `packages/shared/src/ipc/channels.ts` — `mgit:rebase:start`, `mgit:rebase:continue`, `mgit:rebase:abort`, `mgit:rebase:skip`, `mgit:rebase:status`
- [ ] `packages/git-engine/src/exec/rebase-editor.ts` — IPC / manifest file exchanger script invoked when git executes `GIT_SEQUENCE_EDITOR`
- [ ] `packages/git-engine/src/commands/rebase.ts` — `startInteractiveRebase(repoPath, targetRef, plan)`, `continueRebase()`, `abortRebase()`, `skipRebase()`
- [ ] Unit tests in `git-engine` verifying sequence file parsing and write-back formatting

### Theme B — Interactive Rebase Sequence Editor Overlay · L

- [ ] `packages/app/src/features/rebase/rebase-modal.tsx` — Modal / drawer sequence planner rendering graph commit rows in ordering stack
- [ ] Drag-and-drop re-ordering of commit cards within the sequence list using `@hello-pangea/dnd` or native HTML5 drag-and-drop
- [ ] Per-item action selector dropdown (`pick`, `reword`, `edit`, `squash`, `fixup`, `drop`, `break`, `exec`)
- [ ] In-place subject edit input for `reword` actions and command script string input for `exec` actions
- [ ] Toolbar trigger button ("Interactive Rebase...") and commit graph context menu entry ("Rebase interactive from here...")

### Theme C — Rebase State Controller & Conflict Banner · M

- [ ] `packages/app/src/features/rebase/use-rebase-status.ts` — Hook polling or watching `.git/rebase-merge/` or `.git/rebase-apply/` directory state
- [ ] `packages/app/src/features/rebase/rebase-banner.tsx` — Status bar / header banner displayed when rebase pauses on `edit` or conflict
- [ ] Direct action controls: **Continue Rebase**, **Skip Commit**, **Abort Rebase**
- [ ] Integration with Changes view to highlight conflicted files during paused rebase state

### Theme D — Safety Net Backup & One-Click Restore · S

- [ ] Automated backup ref creation (`refs/midnite-backup/rebase-<timestamp>`) prior to launching git rebase execution
- [ ] Confirmation dialog showing blast radius (`rev-list --count` of commits affected) before executing rebase plan
- [ ] One-click "Undo Rebase" button in safety dialogs / toast notifications restoring the pre-rebase backup ref

---

## Verification

- [ ] Unit tests for `rebase-editor.ts` sequence parser and formatter
- [ ] Reordering 3 commits in the Rebase Modal correctly updates sequence plan
- [ ] Performing `reword` updates commit message without terminal prompts
- [ ] Mid-rebase conflict pauses rebase, displays `rebase-banner`, and allows resolution + continue
- [ ] "Undo Rebase" restores original branch SHA from `refs/midnite-backup/`

---

## Decisions / open questions

- **`GIT_SEQUENCE_EDITOR` integration:** Implemented via Node script communicating with main process write-queue via JSON state files in `.git/`.
- **UI location:** Overlay modal on graph view for maximum context.
- **Safety backup:** Created automatically under `refs/midnite-backup/` to ensure zero data loss on complex rebases.
