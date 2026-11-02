# HANDOFF (read first)

- **Goal:** Finish Phase 125 Themes A, B and C (Media ▸ Animations library: store, bulk import, list/filter page) through a draft PR, green CI, tracker update and squash-merge. Themes D, E, F, G and H stay open.
- **Worktree:** `/Users/bilo-ekko/Dev/midnite/midnite-studio/.worktrees/p125-abc` · **Branch:** `feature/p125-abc` (local only; not pushed) · **PR:** none · **Base:** `origin/main`
- **Repo:** `/Users/bilo-ekko/Dev/midnite/midnite-studio` · remote `bilo-io/midnite-studio`. Read `CLAUDE.md` before coding. Phase doc: `.midnite/tasks/phases/phase-125-animations-library.md` (Decisions 1–12 are settled; do not re-ask).
- **Why this file is committed:** so a checkout of this branch has the handover. Delete it from the branch (`git rm SCRATCHPAD.md`) in the commit that opens the PR. It must not land on `main`.

## Decisions and why

Human (2026-11-02), recorded in the phase doc:

1. New top-level Media ▸ Animations page, beside Models. It does not replace the Models page's rig and clip tabs.
2. Preview plays a clip on a chosen rigged model, retargeted by bone name. That is Theme D, not this slice.
3. Global library under the user's app-data directory, shared across repos. A game imports from it later (Theme G).
4. Sketchfab via its official Data API and the user's token (Theme E). Other sites are search links only. No scraping.
5. Mixamo arrives as a bulk folder of FBX files, named from the file names and auto-tagged. GLB/glTF and BVH too.

Made while building:

6. Code lives in `packages/features/media-model/` (`main/animation/`, `renderer/animation/`), not a new package. Same pattern as the SFX tab.
7. One IPC channel, `mediaAnimation`, with an `op` union.
8. The tab is not repo-scoped. The store is global, so it works with no repo open.
9. Files are content-addressed: `clips/<sha256-prefix>-<slug>.<ext>`. A re-import of the same bytes is a dedupe.
10. Parsers are hand-written and read-only (binary FBX, GLB JSON, BVH text). No new dependency. Playback in Theme D uses three's loaders.
11. Licence is a string id (`cc0`, `cc-by`, `cc-by-sa`, `cc-by-nc`, `mixamo-eula`, `custom`, `unknown`). Unknown stays unknown.
12. This PR is A + B + C only. D is the next PR.

Screenshots are committed under `docs/screenshots/p125-abc/` (the user overrode the usual "never commit shots" default). The e2e ratchet goes 482 → 483 because the three panes need a real layout.

## Done

Four commits on the branch, plus the commit that adds this note:

- `3613fb56a` shared wire contract: clip schema, op union, channel, tab (`packages/shared/src/media-animation.ts`, IPC schemas, `media.ts`)
- `5fcff0690` library store, FBX/GLB/BVH metadata readers, Mixamo naming and auto-tags, bulk importer, `mediaAnimation` dispatcher
- `6820ecb9f` Studio and Gamer handlers, preload, bridge, pickers
- `afb4f2c7c` Animations tab: list, search, tag and source filters, import, clip details, vitest/RTL
- This commit: Gamer launcher expects the Animations tab; `packages/app/e2e/animations-shots.spec.ts` (one test, three shots); e2e budget 482 → 483

Themes A, B and C are claimed WIP in `.midnite/tasks/_INDEX.md` on `main` (commit `e4f69de54`). The phase doc's checkboxes are still open. That update happens on this branch just before merge.

## PR and CI

No pull request. Nothing pushed. CI has not run. The pre-push gate has not been run on this slice: `moon run :typecheck && moon run :lint && moon run :test`.

## Next steps, in order

1. `cd` this worktree. Do not redo the store, the parsers, the importer or the tab.
2. Run the Playwright spec so it writes `docs/screenshots/p125-abc/list.png`, `filter.png` and `detail.png`. Read the three PNGs. The spec is `packages/app/e2e/animations-shots.spec.ts`. It opens Media ▸ Animations against the mocked bridge, checks the three panes sit side by side, applies the combat tag filter, and opens Sword Slash.
3. Run the animation and gamer vitest suites, then the full gate. Do not push red.
4. `git rm SCRATCHPAD.md` and commit that removal before opening the PR.
5. Commit the three PNGs. Push `feature/p125-abc`. Open a **draft** PR whose body already embeds them with commit-pinned raw URLs: `https://github.com/bilo-io/midnite-studio/raw/<sha>/docs/screenshots/p125-abc/<file>.png`. Do not add images after the PR exists.
6. `gh pr checks <n> --watch`. A failure in a file this branch did not touch: re-run that job once, then treat it as real. Fix, re-run the local gate, push, repeat until green.
7. On the branch, mark Themes A, B and C done in the phase doc and `_INDEX.md` (Done count, percent, 10-cell bar, theme-key icons, PR number). Leave D, E, F, G and H open. Commit that.
8. If the branch is behind `origin/main`, `git rebase origin/main` and `git push --force-with-lease`.
9. `gh pr ready <n>` then `gh pr merge <n> --squash --delete-branch`.
10. In the primary checkout: `git checkout main && git pull`. Re-read `_INDEX.md`. If a race clobbered the row, fix it on `main` and push. Tear the worktree down (`du -sk` first, then `git worktree remove`, `git branch -D`, `git worktree prune`) and report the freed MB.

## Gotchas

- The primary checkout has unrelated dirty files under `.midnite/media/video/`. Never stage them. Stage only paths in this worktree.
- No `Co-Authored-By`, `Signed-off-by`, or any other attribution trailer. `git config` is already set in this worktree; do not change it.
- Playwright starts Vite on ports 5273, 5292 and 5290 with `reuseExistingServer: false`.
- jsdom reports the Animations panes as 0×0. The RTL suite stubs `MediaLayout` into stacked divs. Only the Playwright spec proves the three-column shell. Search, tag maths, rename and import stay in vitest (`animation-model.test.ts`, `animation-tab.test.tsx`).
- Phase 116's screenshot ban is not on `main`. Committing the PNGs is still allowed, and this slice requires it.
- Theme E cannot be finished without the user's Sketchfab API token. Do not start E, F, G or the timeline (D) in this PR.
- Another agent may still have this worktree open. If a file changes under you, read it before editing. Do not reset the branch.

## Files that matter

- `packages/shared/src/media-animation.ts` — clip schema, tags, manifest
- `packages/features/media-model/main/animation/` — library, parsers, Mixamo names, importer
- `packages/features/media-model/renderer/animation/animation-tab.tsx` — the page
- `packages/desktop/src/main/ipc/media-animation-handlers.ts` — IPC
- `packages/app/e2e/animations-shots.spec.ts` — the shell spec and the three shots
- `scripts/e2e-budget.mjs` — cap is 483
- `.midnite/tasks/phases/phase-125-animations-library.md` and `.midnite/tasks/_INDEX.md`
