## Brief (verbatim from the orchestrator)

You are **Dev slice 2** of a midnite-swarm in repo bilo-io/midnite-studio, an Electron app for macOS arm64.

Goal: Stop the packaged macOS Midnite Studio from re-asking for permissions it already has. Slice addresses symptom 2 ("enable X in System Settings" nags when X is already granted); also gives symptom 3 a path to Full Disk Access.

Slice 2: `feat(settings): Settings > Permissions page with live macOS checks` (Theme B of ISSUES Phase 2, pick S2-B). Page reads each grant live and re-checks on focus: Screen Recording, Microphone, Camera, Accessibility, Full Disk Access, Automation where feasible, Notifications. Deep link per pane. `tccutil reset` action for the app's bundle id gated behind destructive confirm dialog with blast radius, plus guidance for "granted to an older build, toggle off/on".

Full spec: `## Slice 2` in /private/tmp/claude-501/-Users-bilo-ekko-Dev-midnite-midnite-studio/7fdcdc8f-cdae-4c05-b717-95960d2b25b8/scratchpad/swarm-permissions/plan.md plus "Shared rules". Plan not refined; verify anchors against origin/main.

Reuse: PR #1262 (open, not merged) adds packages/desktop/src/main/full-disk-access.ts (access()-based FDA probe). If merged use it; if not write a minimal probe behind the same function name and note overlap on the board. PR #1254 merged; do not re-touch.

Phase doc: .midnite/tasks/ISSUES/phases/phase-2-macos-permission-prompts.md. Update only Theme B Headlines paragraph + checklist, marked in review with PR number. Do not touch _INDEX.md.

Setup: worktree .worktrees/sw-permissions-dev-2 on feat/sw-permissions-settings-page. pnpm install with GITHUB_PACKAGES_TOKEN=$(gh auth token -u bilo-io). unset MOON_* first. No full suite / moon gate. Targeted vitest, tsc --noEmit, eslint ok. Screenshots to /tmp/midnite-shots-sw-dev-2/, not committed. Push with bilo-io token. CI billing-locked; paste commands+results into PR Self-review section.

Flow: build+commit per step; draft PR (midnite-pr-description); midnite-check-yourself, fix, push; local checks; stay draft, no merge, no ready, no reviewers; append `dev2:` lines to ## Log in .../swarm-permissions/BOARD.md.

Standing rules: SCRATCHPAD.md never committed; update after each commit; obey CONTEXT ROTATION/WRAP UP (HANDOFF READY <path>). Report: PR URL, checks, screenshots.

## Todo
- [ ] install
- [ ] shared contract
- [ ] probe + tests
- [ ] handlers + preload + tests
- [ ] page + registration + mock bridge + tests
- [ ] phase doc
- [ ] screenshot
- [ ] PR draft, self-review, checks
