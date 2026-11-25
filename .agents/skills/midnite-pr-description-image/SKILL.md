---
name: midnite-pr-description-image
description: Add one screenshot under `## Screenshots` in a Midnite Studio PR body, but only when the PR changes what a user sees. Captures it with the Playwright shots helper into the session scratchpad and attaches it to the PR on GitHub; screenshots are never committed. Use right after midnite-pr-description, or when the user asks to put a screenshot on a PR.
argument-hint: "[PR number, or nothing for the current branch]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# PR description image: one screenshot, only when it earns its place

Runs after [`midnite-pr-description`](../midnite-pr-description/SKILL.md). It owns one thing:
whether a screenshot belongs on this PR, and getting it into the body. It adds **one image under
`## Screenshots` with no surrounding prose**. Most runs should end at stage 1 with "no image".

For a visual PR the PNG is committed and embedded **before** `gh pr create`, never added later, so
`midnite-pr-create` calls this skill first.

## 0 · Run the script first

Run `node scripts/skills/pr-description.mjs [--base origin/main]`. It regenerates the body so you can slot the image under `## Screenshots`. You still decide whether the PR changes what a user sees, capture the shot, and edit the body. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## 1 · Does the PR change what a user sees?

Two gates, in order.

**A. The file rule.** `git diff --name-only origin/main...HEAD` (three dots), then drop tests
(`*.test.*`, `*.spec.*`, `__mocks__/`), type-only files, prose (`*.md`, `docs/`), snapshots, the
tracker (`.midnite/`), skills (`.claude/`, `.agents/`), scripts and CI config. What
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
- Write to `<session scratchpad>/<slice>/<name>.png` (never under the repo; `docs/screenshots/` is
  git-ignored). `<slice>` is the phase or task slug.
- **Delete the spec afterwards.** Shot specs are not kept in the tree (Phase 116 Theme B purged
  them), and the PNG is not committed either.
- Run it scoped: `pnpm -C packages/app exec playwright test e2e/pr-shots.spec.ts` (the config
  starts its own Vite server). If Playwright is unavailable, or the surface needs a state the mock
  bridge cannot reach, say so and ask the user for the image rather than fake one.

Read the PNG before using it: right surface, nothing clipped, no stray dev overlay.

## 3 · Attach it on GitHub, never commit

Screenshots stay out of git. GitHub has no API for PR image uploads, so show the PNG in the session
thread with its scratchpad path and ask the user to drag it into the PR body or a PR comment; GitHub
hosts it under `user-attachments` and gives back the URL to use in step 4. If the user has already
attached it, use that URL.

## 4 · Put it in the body

Add or replace the section and nothing else. Exactly:

```markdown
## Screenshots
<surface changed, a few words>: captured in the session thread, not committed.
```

One line, nothing else in the section. On an existing PR use `node scripts/skills/pr-body.mjs <n> --set-section "Screenshots" --file <file>`; before
creation, hand the section to `midnite-pr-create`. One image per PR, unless the change has two
distinct states the reviewer must compare.

Every `gh` call uses `GH_TOKEN="$(gh auth token -u bilo-io)"`. Never add an attribution trailer.
