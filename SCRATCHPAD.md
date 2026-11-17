## Brief (verbatim from the orchestrator)
You are L2 in a fleet building the level editor in the midnite-studio repo. Task: Phase 137 Themes B, C and E only of .midnite/tasks/FEATURES/phases/phase-137-level-editor-editing-essentials.md. Done = PR squash-merged into main. Worktree .worktrees/p137-bce (branch feature/p137-bce). Theme A (multi-selection in edit model) landed #1311 - use its selection API. B clipboard+duplicate, C floorplan multi-select, E align/distribute; pure functions first. Keep changes local to your themes; follow doc's Build order. Others build J, F/D/G, H/I later in same renderer folder.

Setup: work ONLY in worktree; keep SCRATCHPAD.md (Brief verbatim, Goal/Decisions/Done/Surprises/Next, Todo); never commit it. Install: unset $(env | grep -o '^MOON_[A-Z_]*'); export GITHUB_PACKAGES_TOKEN=$(gh auth token -u bilo-io); pnpm install --frozen-lockfile.
Build: Skill midnite-build "phase 137 themes B, C and E only", unattended, record choices in PR body. Board: /private/tmp/claude-501/-Users-bilo-ekko-Dev-midnite-midnite-studio/51532037-920d-40c4-838d-b94dc3b745b0/scratchpad/BOARD-level.md (read Contracts, append own API under Contracts, Log lines `HH:MM L2 ...`). Tick checkboxes + Headlines in phase doc; never touch _INDEX.md. Commit often, no trailers. Screenshots to /tmp/midnite-shots-p137-bce/, never committed.
Gate (CI billing-locked): tsc per touched pkg, eslint touched, vitest touched, node scripts/tracker-check.mjs. Never full moon test. Rebase on origin/main before merge. Push via bilo-io token. Draft PR no reviewers; midnite-check-yourself; fix CRITICAL/WARNING; gh pr ready; body says "Merged on local gate — CI locked (billing)"; gh pr merge <n> --squash --admin. Cleanup worktree after. Final report via SubagentHandback: PR URL + merge sha, exported API lines, open items.
(Condensed: original text was long; content above preserves all instructions.)

## Goal
Phase 137 B, C, E.
## Decisions
## Done
## Surprises
## Next
## Todo
- [ ] read doc + board
- [ ] pure fns B
- [ ] pure fns E
- [ ] pure fns C
- [ ] UI wiring
- [ ] docs/headlines
- [ ] gate, PR, self-review, merge
