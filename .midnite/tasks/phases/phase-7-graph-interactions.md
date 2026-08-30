# Phase 7 — Graph interactions: context menus, checkout, branch/tag, reset

Right-click + double-click verbs on commit rows and ref badges, with blast-radius-gated
destructive ops.

## Deliverables

- [x] `git-engine/src/commands/{checkout,branch,tag,reset}.ts` + error mapping: dirty-tree checkout block, branch-checked-out-in-another-worktree block
- [x] IPC handlers `mstudio:op:{checkout,branch-create,tag-create,reset}`
- [x] `app/src/components/context-menu.tsx` — renderer-drawn, token-styled popover (not native `Menu.popup`; keeps state/testing in React)
- [x] `app/src/features/graph/graph-context-menu.tsx`:
  - commit row: create branch here, create tag, checkout (detached), cherry-pick onto current (lands Phase 8), reset current branch here (soft/mixed/hard submenu)
  - branch badge: checkout, merge into current (Phase 8), rebase current onto (Phase 8), rename, delete
- [x] Double-click branch badge → checkout
- [x] `app/src/components/confirm-dialog.tsx` — **blast-radius gating**: hard reset / branch delete show `git rev-list --count` of commits that would be orphaned

## Verification

- [x] Integration tests per command, incl. both checkout-block error paths
- [x] Manual scratch-repo run-through: create branch/tag, checkout, reset soft/mixed/hard — graph + HEAD badge update after refresh
- [x] Hard reset confirm shows the correct orphan count
- [x] Screenshot of the context menu captured

Screenshots: [commit context menu with the reset submenu](../docs/screenshots/phase-7-context-menu.png) ·
[blast-radius confirmation](../docs/screenshots/phase-7-blast-radius.png).

Verified by driving the real app against a scratch repo (main, feature, topic, a tag):

| Check | Result |
|---|---|
| Commit-row menu | branch/tag here, detached checkout, reset submenu (soft/mixed/hard) |
| Badge menu on the current branch | Checkout disabled "Already checked out here."; Delete disabled "You cannot delete the branch you are on." |
| Double-click the `feature` badge | HEAD marker moved; `git branch --show-current` → `feature` |
| Hard reset to a commit two branches still hold | "No commits become unreachable" |
| Hard reset to a commit nothing else holds | "2 commits will no longer be reachable", listing both |

## Findings while landing this phase

- **`rev-list --count to..from` is the wrong blast radius, and it overstates the damage.** A
  commit in that range that is also on another branch is not orphaned at all. The first working
  version cheerfully announced "2 commits will no longer be reachable" for two commits sitting
  safely on `feature` and `topic` — precisely the kind of wrong number that teaches people to
  click through safety dialogs unread. The count now asks the real question: reachable from
  `from`, not from `to`, and not from any ref *other than the one being moved* (which has to be
  excluded, since before the operation it is exactly what keeps those commits alive). Refs go in
  over stdin because a repo with hundreds of remote branches would blow the argv limit.
- **The dialog opens before the count arrives.** `rev-list` over a large history is slow enough to
  feel, and blocking the dialog on it makes every destructive action seem broken. It shows
  "Checking what this affects…" and fills in.
- **Cancel takes focus, not Confirm** — for a destructive action the safe option is the one a
  stray Return should hit.
- **Menus are renderer-drawn, not `Menu.popup`.** A native menu can't carry the design tokens, and
  every item would have to round-trip through IPC to reach state that lives in the renderer.
- **`MenuItem` is a two-arm union** (leaf with `onSelect` / parent with `submenu`) rather than one
  shape with both optional, which makes "a leaf that does nothing" unrepresentable.
- **Disabled items carry their reason as a tooltip.** A greyed-out "Checkout" with no explanation
  is the most frustrating thing a menu can show.
- **React synthesises `onMouseEnter` from `mouseover`**, so a dispatched `mouseenter` never opens
  a submenu — relevant only to the headless probes, but it cost a debugging round.
- Ref names are validated against `git check-ref-format`'s rules in the prompt, so the user finds
  out while typing rather than after the dialog closes.
