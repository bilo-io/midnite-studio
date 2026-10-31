---
name: midnite-pr-feedback
description: Analyse feedback on a Midnite Studio pull request (review comments, CI failures, test results) and turn it into an actionable plan, then implement it. Also prunes the PR's own code comments. Use when the user says "midnite-pr-feedback" or "pr-feedback", or asks what to do about comments or a failing build on a PR.
argument-hint: "[PR number or URL]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# PR feedback: analyse and act

Gathers every piece of feedback on one PR in `bilo-io/midnite-studio` (review threads, CI
failures, warnings), builds a plan, and implements it. Input is a PR number or URL, a screenshot of
a comment or failure, or nothing (then the PR of the current branch: `gh pr view --json
number,url`; none means stop and say so).

**Auth.** Every `gh` call and every push uses the `bilo-io` account:
`GH_TOKEN="$(gh auth token -u bilo-io)" gh …`, and pushes use
`git -c credential.helper= -c credential.helper='!f(){ echo username=bilo-io; echo password=$(gh auth token -u bilo-io); }; f' push`.
Never `gh auth switch`.

## 1 · Gather

In parallel, with `--repo bilo-io/midnite-studio`:

```bash
gh pr view <n> --json title,body,state,isDraft,baseRefName,headRefName,url
gh api repos/bilo-io/midnite-studio/pulls/<n>/reviews
gh api repos/bilo-io/midnite-studio/pulls/<n>/comments
gh pr checks <n>
gh pr diff <n>
```

Read all reviewer comments (inline and top level), which checks failed and why (`gh run view <id>
--log-failed | tail -80`), and the diff.

## 2 · Classify CI failures before acting

- **A budget stop** ("The job was not started because an Actions budget is preventing further
  use", every job failing in seconds) is billing, not code. A rerun will not help. Report it; the
  user decides.
- **Known flakes**: the browser-pane specs, fab-loops, the media-model `sdf-panel` slider test and
  the e2e "idle edge lift" spec. Rerun **once**: `gh run rerun <run-id> --failed`. If it fails
  again it is a real failure.
- **Cancelled jobs on a superseded head** are not failures.
- **Never dispatch extra `ci.yml` runs** to chase a result; the macOS runner pool is capped at 5
  concurrent jobs and a PR already uses all 5.
- **Stale branch.** If the base moved and CI needs it: `git fetch origin && git merge origin/main`.
  Never rebase and never force-push.

## 3 · Plan

A numbered checklist, blockers first (CI failures, changes requested), then code changes, then
optional NITs, always ending with the comment-hygiene pass as its own item:

```
1. [ ] **path or area**: what to do
   _Context: reviewer comment / CI error_
```

When invoked on its own, show the plan and ask "proceed? (yes / no / edit)" before changing
anything. When called by `midnite-check-yourself`, run straight through.

## 4 · Execute

Work the list in order, striking each item through as it lands. For each code change:

- Make the change, then verify **scoped only**: `pnpm -C <pkg> exec vitest run <files>`,
  `pnpm -C <pkg> exec tsc --noEmit`, `pnpm exec eslint <changed files>`.
- **No workspace-wide `moon run :typecheck :lint :test`, no full suites, locally.** They exhaust
  RAM; CI is the gate.
- Commit with a clear message. **No `Co-Authored-By`, `Signed-off-by` or any attribution trailer.**
  Never `--no-verify`. Never amend a pushed commit.

If an item fails, stop, say what is done, and ask how to proceed.

## 5 · Comment hygiene pass

Scope: lines this PR added or changed, plus any comment attached to them.

**Delete:** comments that restate the code; narration of the PR's own history ("previously…",
"after review"); explanations a good name already gives; commented-out code, ownerless TODOs and
banners; a comment repeating the assertion below it.

**Cut to one line** whatever survives past about two lines: keep the why (the constraint, the
quirk, the invariant) and drop the reasoning and alternatives.

**Never touch:** licence headers; tool pragmas (`eslint-disable`, `@ts-expect-error`, codegen
markers); JSDoc a public API relies on (trim prose, keep tags); a comment a reviewer asked for;
comments in files the PR did not touch.

Commit it separately (`chore: prune comments`). If nothing changes, say so. Re-run the scoped
eslint afterwards: deleting a comment can strip a load-bearing pragma.

## 6 · Push and report

`git push` (regular, per the command above). When run on its own, append a `## Feedback addressed` list to the PR body
with `gh pr edit`, preserving the original body (when called by `midnite-check-yourself`, skip the body edit: it fills `## Self-review` instead), and print a short summary ending with the PR URL.

## Rules

- Do not force-push, rebase or merge the PR. Merging is the user's decision.
- Do not dismiss or resolve a reviewer's thread; only the reviewer does.
- **A draft PR never gets a reviewer requested.** Review requests wait for the self-review to
  finish and `gh pr ready` (see `midnite-check-yourself`).
- If tracked phase work is involved, the tracker is `.midnite/tasks/` (Headlines in the phase doc,
  only the row in `_INDEX.md`).
- If an input is ambiguous, ask before building the plan.
