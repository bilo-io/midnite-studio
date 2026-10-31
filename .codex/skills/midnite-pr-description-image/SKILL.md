---
name: midnite-pr-description-image
description: Add one screenshot under `## Screenshots` in a Midnite Studio PR body, but only when the PR changes what a user sees. Captures it with the Playwright shots helper, commits it under docs/screenshots/, and links it by commit-pinned raw URL. Use right after midnite-pr-description, or when the user asks to put a screenshot on a PR.
argument-hint: "[PR number, or nothing for the current branch]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# PR description image: one screenshot, only when it earns its place

Runs after [`midnite-pr-description`](../midnite-pr-description/SKILL.md). It owns one thing:
whether a screenshot belongs on this PR, and getting it into the body. It adds **one image under
`## Screenshots` with no surrounding prose**. Most runs should end at stage 1 with "no image".

For a visual PR the PNG is committed and embedded **before** `gh pr create`, never added later, so
`midnite-pr-create` calls this skill first.

## 1 · Does the PR change what a user sees?

Two gates, in order.

**A. The file rule.** `git diff --name-only origin/main...HEAD` (three dots), then drop tests
(`*.test.*`, `*.spec.*`, `__mocks__/`), type-only files, prose (`*.md`, `docs/`), snapshots, the
tracker (`.midnite/`), skills (`.claude/`, `.agents/`, `.codex/`), scripts and CI config. What
remains must include a renderer file: `packages/app/src/**`, `packages/frame/**`,
`packages/features/*/renderer/**`, renderer code under `apps/*/src/**`, styles or assets. None left:
**stop, no image.**

**B. The judgement.** Read the diff of the survivors. A rename, a refactor, a type change, a hook
that returns the same thing, an unrendered constant: no image. A new or changed control, layout,
copy, colour, icon, empty state or panel: yes. When unsure, no image. Say in one line which gate
stopped it.

## 2 · Capture

Use a **throwaway Playwright spec** built on the shots helper
[`packages/app/e2e/shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts):

- The file name ends `-shots.spec.ts` (e.g. `packages/app/e2e/pr-shots.spec.ts`). That suffix is
  what makes `installMockBridge` seed `reposOpen: false`, so **the git repos panel is closed** in
  the shot. Pass `{ reposOpen: true }` only when the shot is about that panel.
- Import `installMockBridge` from `./shots-helper` (not from `test-support/mock-bridge`), seed it
  with `fixtures`, drive the app to the changed surface, and `locator.screenshot({ path })` (crop to
  the changed region) or `page.screenshot` for a whole-view change.
- Write to `docs/screenshots/<slice>/<name>.png`. `<slice>` is the phase or task slug
  (`phase-124-modules`, `adhoc-menu-skills`); create the directory if missing.
- **Delete the spec afterwards.** Shot specs are not kept in the tree (Phase 116 Theme B purged
  them); only the PNG is committed.
- Run it scoped: `pnpm -C packages/app exec playwright test e2e/pr-shots.spec.ts` (the config
  starts its own Vite server). If Playwright is unavailable, or the surface needs a state the mock
  bridge cannot reach, say so and ask the user for the image rather than fake one.

Read the PNG before using it: right surface, nothing clipped, no stray dev overlay.

## 3 · Commit, then link by commit-pinned raw URL

```bash
git add docs/screenshots/<slice>/<name>.png
git commit -m "docs(screenshots): <slice> shot for the PR"   # no trailer
git -c credential.helper= -c credential.helper='!f(){ echo username=bilo-io; echo password=$(gh auth token -u bilo-io); }; f' push -u origin HEAD
SHA=$(git rev-parse HEAD)
```

The URL is pinned to that commit, so it survives a squash-merge and a deleted branch:

```
https://raw.githubusercontent.com/bilo-io/midnite-studio/<SHA>/docs/screenshots/<slice>/<name>.png
```

Push first, or the URL does not resolve. The SHA is a commit that contains the PNG, never a branch
name.

## 4 · Put it in the body

Add or replace the section and nothing else. Exactly:

```markdown
## Screenshots
![<what it shows, a few words>](<raw URL>)
```

No sentence before or after it. On an existing PR use `gh pr edit <n> --body-file <file>`; before
creation, hand the section to `midnite-pr-create`. One image per PR, unless the change has two
distinct states the reviewer must compare.

Every `gh` call uses `GH_TOKEN="$(gh auth token -u bilo-io)"`. Never add an attribution trailer.
