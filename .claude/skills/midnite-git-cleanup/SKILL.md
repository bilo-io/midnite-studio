---
name: midnite-git-cleanup
description: Remove branches, worktrees, and merged origin branches that have fully landed on the target branch. Dry-run by default. Catches duplicate, cherry-picked, and squash-merged commits that `git branch -d` misreports as "not fully merged".
argument-hint: "[--apply] [--prune-remote] [--target <branch>] [--no-remote]"
allowed-tools: Bash, Read, AskUserQuestion
---

Prune stale branches, worktrees, and merged `origin` branches from **Midnite Studio**.

**Style:** terse — lead with the plan, don't narrate the gathering.

## 0 · Check `deleteBranchOnMerge` once per repo

If `origin` branches are piling up after every merge, the repo almost certainly has
GitHub's "automatically delete head branches" **off**:

```bash
gh repo view --json deleteBranchOnMerge --jq .deleteBranchOnMerge
gh repo edit --delete-branch-on-merge   # turn it on
```

This is the actual fix for the recurring problem; the script below is the cleanup
for branches that piled up before it was on (or from PRs merged by someone whose
repo doesn't have it set). Flip it once and mention it in your summary — don't
silently re-run the cleanup script forever on a repo that could fix itself.

## 1 · Always dry-run first

```bash
.claude/skills/midnite-git-cleanup/cleanup.sh
```

Prints the plan and changes nothing — local **and** `origin` branches. Pass
`--target <branch>` to compare against something other than the default branch;
`--no-remote` to skip the remote check entirely (e.g. offline).

**Never invoke `--apply` (or `--apply --prune-remote`) before showing the user the
dry-run output and getting an explicit yes.** Branch deletion is cheap to get
wrong; a remote deletion is also visible to every other collaborator and, once the
reflog has expired, tedious to undo. Present the STALE and STALE REMOTE lists,
then **AskUserQuestion** to confirm — one question, options along the lines of
*Delete local + remote · Local only · Cancel*. Only then:

```bash
.claude/skills/midnite-git-cleanup/cleanup.sh --apply                 # local only
.claude/skills/midnite-git-cleanup/cleanup.sh --apply --prune-remote  # local + origin
```

`--prune-remote` is a second, separate opt-in on top of `--apply` — never pass it
without having shown the STALE REMOTE list and gotten a yes specifically for the
remote deletions, since `git push --delete` is a shared-state action other
sessions and collaborators will see.

## 2 · What "landed" means — three tests, not two

A local branch is stale if **either** of the first two holds; an `origin` branch
is stale if **any** of the three does:

| Test | Mechanism | Catches |
|---|---|---|
| ancestry | `git merge-base --is-ancestor` | ordinary merged branches |
| patch-equivalence | `git cherry` (patch-id) | duplicates & cherry-picks |
| merged-PR lookup (`origin` only) | `gh pr list --state merged`, matched by `headRefOid` | squash & rebase merges |

**The second test is why this script exists.** `git branch -d`'s safety check is
ancestry alone — reachability, not content. So a branch whose work *has* landed as
a duplicate commit or a cherry-pick carries the same diff under a different SHA,
is unreachable from the target, and gets refused as "not fully merged". That
refusal is a false alarm, and reading it as "holds unique work" is the easy
mistake: it holds nothing the target lacks.

Branches that qualify **only** via patch-equivalence are labelled as such in the
output, and are the ones worth eyeballing before `--apply` — they're deleted with
`-D`, since `-d` would refuse them. Everything else uses `-d`.

Edge case: a branch whose only unique commits are *empty* can match on patch-id.
Rare, but it's the one way test 2 can flatter a branch, so glance at anything
flagged patch-equivalent.

**`origin` branches get a third test, and it runs first.** A GitHub squash or
rebase merge is invisible to both tests above: squashing N commits into one new
SHA means the branch is never an ancestor, and once N>1 the *patch-id* changes too
(`git cherry` matches per-commit diffs, not the union of several) — so a
squash-merged multi-commit branch is neither an ancestor nor patch-equivalent,
ever, no matter how long it sits merged. This is not a corner case here: every
one of the 16 stale `origin` branches found on 2026-09-04 was a squash merge, and
none would have been caught by ancestry or patch-equivalence alone. `gh pr list
--state merged` is the ground truth GitHub actually has, so for `origin/*` it is
checked first: a branch whose tip equals a merged PR's `headRefOid` is stale
regardless of what the other two tests say. Only a branch with no merged-PR
record (or no `gh`/no auth) falls back to ancestry/patch-equivalence — which is
also why `deleteBranchOnMerge` (§0) is the better fix: this test only catches
branches that already exist, and needs `gh` to catch the common case at all.

## 3 · What it refuses to touch

- **The target branch** and **the current branch** — never candidates.
- **Any branch with unique content** — reported under KEEPING with a count.
- **A stale branch whose worktree is dirty** — reported under BLOCKED and skipped.
  `git worktree remove` refusing a dirty tree is the safety check, so the script
  never passes `--force`. Commit or discard, then re-run.
- **Stashes.** Nothing expires a reflog, because `git stash` entries *are* reflog
  entries — the usual `git reflog expire --expire=now --all` cleanup silently eats
  every stash. The script also warns when a stash is anchored to a commit outside
  the target branch, since deleting branches can leave that base dangling and a
  later `gc` would then break `git stash apply`.
- **A remote branch whose tip has moved past its merged PR's `headRefOid`.**
  Reported under KEEPING REMOTE for a human to look at — someone pushed to it
  after the merge, and blindly deleting could drop work that was never reviewed.
- **Any remote deletion, unless `--prune-remote` is passed alongside `--apply`.**
  The two are independent opt-ins on purpose (§1).

Worktree comes off before the branch it held, because git won't delete a branch
that's checked out somewhere. Watch the worktree-removal output on `--apply`: a
worktree with untracked build artifacts (e.g. a stray `node_modules/`) can fail
`git worktree remove` with "Directory not empty" while still unregistering the
worktree from git — the branch then deletes cleanly (it's no longer "checked out"
anywhere as far as git is concerned) but a full checkout is left orphaned on disk,
outside `git worktree list`. The script surfaces a non-zero exit from `git
worktree remove` as `FAILED` rather than masking it, but still `rm -rf` the
leftover directory by hand if you see one — check `git status --porcelain` inside
it first (it'll fail with "not a git repository" if the worktree metadata is
already gone, confirming it's inert).

## 4 · Aftercare

Deleted branches leave **dangling commits**. `git fsck` lists them; `git gc
--prune=now` sweeps them. The script does neither — pruning is the irreversible
half, and it buys almost no disk. Leave it to a human who knows they want it.

A `--prune-remote` run ends with its own `git fetch origin --prune`, so
`git branch -r` reflects the deletions immediately — no separate fetch needed.

Re-running is idempotent: a clean repo reports `nothing to clean`.
