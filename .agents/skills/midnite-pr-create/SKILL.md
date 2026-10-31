---
name: midnite-pr-create
description: Open a draft pull request for the current Midnite Studio branch, or report the existing one, with a body from midnite-pr-description and screenshots embedded at creation for visual changes. Use when the user asks to open, raise or create a PR.
argument-hint: "[base branch, default main]"
allowed-tools: Bash, Read, Glob, Grep
---

# Create the PR

Opens a **draft** PR in `bilo-io/midnite-studio` for the current branch, or reports the one that
exists. Every `gh` call uses `GH_TOKEN="$(gh auth token -u bilo-io)"`; the active account is often
not `bilo-io` and would 403. Never `gh auth switch`.

## 1 · Branch state

```bash
git rev-parse --show-toplevel && git branch --show-current
```

Work from the checkout the branch lives in (normally a worktree under `.worktrees/`). On `main`,
stop: switch to a feature branch first. The base is `main` unless `$ARGUMENTS` says otherwise.

## 2 · Existing PR

`gh pr view --json number,title,url,state,isDraft 2>/dev/null`. If one exists, print its URL, title,
state and whether it is a draft, and **stop**. No duplicates.

## 3 · Current with the base, and pushed

`git fetch origin main`. If `origin/main` has moved and the work needs it, `git merge origin/main`;
**never rebase, never force-push.** Push with the `bilo-io` credential command (also the first push
of a new branch):

```bash
git -c credential.helper= -c credential.helper='!f(){ echo username=bilo-io; echo password=$(gh auth token -u bilo-io); }; f' push -u origin HEAD
```

Commits carry **no `Co-Authored-By`, `Signed-off-by` or other attribution trailer**; check
`git log origin/main..HEAD --format=%B` and stop if one is found. A worktree's untracked
`SCRATCHPAD.md` must not be tracked: `git ls-files --error-unmatch SCRATCHPAD.md` must fail.

## 4 · Understand the change

`git log origin/main..HEAD --oneline`, `git diff origin/main...HEAD --stat`, then read the diff.

## 5 · Screenshots first, when the change is visual

If the PR changes what a user sees, run
[`midnite-pr-description-image`](../midnite-pr-description-image/SKILL.md) now: capture, commit, push
and get the commit-pinned URL **before the PR exists**. Screenshots are embedded at creation, never
added later. If it decides there is no image, carry on.

## 6 · Write the body

Follow [`midnite-pr-description`](../midnite-pr-description/SKILL.md): the title, then the body in
the house template with empty sections left out. `## Self-review` is left out here and added after
step 8.1. Write the body to a file.

## 7 · Open it as a draft, with no reviewer

```bash
GH_TOKEN="$(gh auth token -u bilo-io)" gh pr create --draft --repo bilo-io/midnite-studio \
  --base main --head <branch> --title "<title>" --body-file <file>
```

**Never `--reviewer` on a draft.** Print the PR URL.

## 8 · Self-review, ready, then reviewers

A PR is ready for review only after a self-review has run on its current diff and the findings worth
acting on are fixed and pushed:

1. Run [`midnite-check-yourself`](../midnite-check-yourself/SKILL.md) (it runs `midnite-pr-review`
   and `midnite-pr-feedback`, fixes, pushes).
2. Fill `## Self-review` in the body with what it found and fixed, or "nothing to fix"
   (`midnite-pr-description`, then `gh pr edit <n> --body-file`).
3. Watch CI: `gh pr checks <n> --watch`. A known flake (browser-pane, fab-loops, the media-model
   `sdf-panel` slider, e2e "idle edge lift") gets one `gh run rerun <run-id> --failed`. Never
   dispatch extra `ci.yml` runs: the macOS pool is capped at 5 concurrent jobs and one PR run
   already uses all five. A budget stop ("not started because an Actions budget is preventing
   further use") is billing, not code: report it.
4. When it is green, `gh pr ready <n>`.
5. Request reviewers only now and only if the user asked: check `gh pr view <n> --json isDraft`,
   then `gh pr edit <n> --add-reviewer <login>`. **A draft never has a reviewer requested.**
   "Request a review now" means steps 1 to 5 in order.

## Rules

- No worktree is created here; use the checkout the branch is in.
- No amend, no rebase, no force-push, no push to `main`. Never merge; the user decides.
- No local workspace-wide gate (`moon run :typecheck :lint :test`, full suites): they exhaust RAM.
  Scoped vitest, tsc and eslint only; CI is the gate.
- Phase work leaves `.midnite/tasks/` consistent (a `done.md` entry, the phase doc's Headlines,
  only the row in `_INDEX.md`) before the PR opens.
