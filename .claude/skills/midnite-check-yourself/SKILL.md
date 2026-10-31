---
name: midnite-check-yourself
description: Self-review the latest PR from this session by running midnite-pr-review and midnite-pr-feedback on it, apply every CRITICAL and WARNING plus the small NITs, commit, push and report. Posts nothing to the PR. Use when the user says "check yourself" or asks for a self-review before requesting review.
argument-hint: "[PR number or URL]"
allowed-tools: Bash, Read, Edit, Write, Skill, Glob, Grep
---

# Check yourself: self-review and fix your own PR

The gate before review. Reviews the session's latest PR in `bilo-io/midnite-studio` with the
[`midnite-pr-review`](../midnite-pr-review/SKILL.md) rubric and the
[`midnite-pr-feedback`](../midnite-pr-feedback/SKILL.md) analysis, fixes what is worth fixing,
pushes, and reports. **It posts nothing to the PR**: no review, no comment, no reply. The only
PR-facing write is an optional `gh pr edit` of the body.

Every `gh` call uses `GH_TOKEN="$(gh auth token -u bilo-io)"`; pushes use
`git -c credential.helper= -c credential.helper='!f(){ echo username=bilo-io; echo password=$(gh auth token -u bilo-io); }; f' push`.

## 1 · Find the PR

Take `$ARGUMENTS`, else the most recent `github.com/bilo-io/midnite-studio/pull/<n>` in this
session, else `gh pr view --json number` for the current branch. None: stop and ask. If several
were mentioned, use the latest and say which.

## 2 · Gather and check out

```bash
gh pr view <n> --repo bilo-io/midnite-studio --json title,body,state,isDraft,baseRefName,headRefName,headRefOid
gh api repos/bilo-io/midnite-studio/pulls/<n>/reviews
gh api repos/bilo-io/midnite-studio/pulls/<n>/comments
gh pr checks <n> --repo bilo-io/midnite-studio
gh pr diff <n> --repo bilo-io/midnite-studio
```

Work in the PR's worktree (`git worktree list`, under `.worktrees/`). If the branch is not checked
out anywhere, ask the user where to work (a worktree is the default; never touch the primary
checkout uninvited). A dirty tree is a stop: do not stash silently. Then
`git fetch origin && git merge --ff-only origin/<head>` to be current. If the base has moved on
and the PR is behind, `git merge origin/main`; never rebase, never force-push.

## 3 · Review

Run `midnite-pr-review` in its **in-session mode** (no GitHub write) over the diff, and fold in
existing reviewer comments and failing CI from step 2. One numbered list, each item tagged
🔴 CRITICAL, 🟡 WARNING, ⚪ NIT or 🟢 PRAISE, with file and line, source (self-review, reviewer,
or CI check) and the proposed fix.

A failing CI check is a CRITICAL only when it names a defect to fix. Classify it as
`midnite-pr-feedback` does first: a known flake gets one rerun (`gh run rerun <id> --failed`), a
budget stop is reported not fixed, and no extra `ci.yml` runs are ever dispatched.

## 4 · Decide

- Always fix every CRITICAL and WARNING.
- Fix NITs when there are at most 5, each touches under 10 lines and sits in a file already being
  changed. Otherwise defer them and say so.
- Never action PRAISE.

Print the action list. Do not pause for confirmation; this runs end to end.

## 5 · Fix

For each item, make the change and verify with **scoped** commands only:
`pnpm -C <pkg> exec vitest run <files>`, `pnpm -C <pkg> exec tsc --noEmit -p <tsconfig>`,
`pnpm exec eslint <changed files>`. **No workspace-wide moon runs and no full suites locally**;
they exhaust RAM, and CI is the gate. If a fix fails or its correct form is unclear, stop, say
what is done and ask. Never skip silently.

Then run the comment-hygiene pass from `midnite-pr-feedback` over the PR's own diff.

## 6 · Commit and push

Stage files explicitly (no `git add -A`: a worktree's untracked `SCRATCHPAD.md` must never land;
confirm with `git ls-files --error-unmatch SCRATCHPAD.md` failing). One commit,
`self-review: address critical and warning feedback`, with a short bullet per fix. **No
`Co-Authored-By`, `Signed-off-by` or other trailer.** No `--no-verify`, no amend, no force-push.
Push with the credential command above.

If a fix changes behaviour the body describes, update the body with `gh pr edit` through
`midnite-pr-description`, filling `## Self-review`. Otherwise just fill `## Self-review` in the
body: what was found and fixed, or "nothing to fix".

## 7 · Report

```
## Done: PR #<n>

Fixed (<count>):
1. 🔴 …
Deferred (<count>):
- ⚪ … (reason)
Praise:
- 🟢 …
Summary: one or two sentences.
<PR url>
```

## The review-request order

A PR is ready for review only after this has run on its current diff and the fixes are pushed.
The order is fixed:

1. The PR opened as a **draft**.
2. This skill: self-review.
3. Implement the findings; push.
4. `gh pr ready <n>`.
5. Only now, and only if the user asked: `gh pr edit <n> --add-reviewer <login>`.

**A draft never has a reviewer requested**: check `gh pr view <n> --json isDraft` first. "Request
a review now" means run steps 2 to 5 in that order, and the report says what the self-review found
and fixed. A diff that changes after the self-review (new commits, a content-changing merge) gets
reviewed again before any re-request.

## Rules

- Never post to the PR: no `gh pr review`, `gh pr comment` or reviews-API POST.
- Never merge the PR.
- Stay within the action list; touch no unrelated files.
