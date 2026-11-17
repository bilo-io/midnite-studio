## Brief (verbatim from the orchestrator)
You are M4 in a fleet building the level editor in the midnite-studio repo. Task: **Phase 138 Themes G and H only** of `.midnite/tasks/FEATURES/phases/phase-138-mcp-level-tools-v2.md`. Done = PR squash-merged into main. Themes A-F on main. G adds game_level_select and game_level_frame (reuse level-store setHighlight from F; frame gives F's Show button a camera move). H adds game_level_view (PNG of open level; LEVEL_EDITOR_VIEW_TIMEOUT_MS=15000). Extend the switch in answerLevelEditorRequest. Gotchas: bump pinned counts in mcp-tool-owners.test.ts (140 total / gamer 99), regenerate tool-manifest.pin.json; mcp.test needs backticked command in each description; desktop vitest needs local tsc -b of runtime, git-engine, desktop first; don't overwrite other themes' tests. Worktree .worktrees/p138-gh, branch feature/p138-gh. Board: /private/tmp/claude-501/-Users-bilo-ekko-Dev-midnite-midnite-studio/51532037-920d-40c4-838d-b94dc3b745b0/scratchpad/BOARD-level.md. Gate/merge rules: local gate only (CI billing-locked), draft PR -> check-yourself -> ready -> squash --admin, body says "Merged on local gate — CI locked (billing)". Push with bilo-io token. Never commit SCRATCHPAD.md.

## Goal
Phase 138 G + H (select/frame/view tools).
## Todo
- [x] read doc/board
- [x] shared+main tools (select/frame/view), pin, dispatch, labels (85b997493)
- [ ] renderer: level-frame, editor-controls registry, bridge select/frame/view, 3D handle frame/capture, plan capture
- [ ] renderer tests green (level-frame, level-editor-agent-view, level-plan-capture, level-capture-pose)
- [ ] tsc media-game + eslint
- [ ] doc ticks + Headlines G/H; board Contracts
- [ ] draft PR -> check-yourself -> ready -> merge
## Decisions
- select/frame readOnly:false in MCP_TOOLS (mcp.test invariant: readOnly == GAME_MCP_READ ids; they are allowed()-gated). view in READ ids.
- bridge answerLevelEditorRequest has overload: view returns a Promise, others sync (existing tests unchanged).
- Editor controls registry (level-editor-controls.ts) lets the bridge move camera / switch 3D / capture.
- 2D tile level view = the visible canvas toDataURL (drawPlan only draws 3D-level plans).
## Surprises
- vitest/tsc in media-game are slow (>2min); run in background.
## Next
run tests, fix, commit renderer.
