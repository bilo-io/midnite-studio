---
name: midnite-git-cleanup
description: Remove branches and worktrees that have fully landed on the target branch. Dry-run by default. Catches duplicate and cherry-picked commits that `git branch -d` misreports as "not fully merged".
---

**Invoke with:** [--apply] [--target <branch>]

Prune stale branches and their worktrees from **Midnite Studio**.

**Style:** terse — lead with the plan, don't narrate the gathering.

## 1 · Always dry-run first

```bash
.agents/skills/midnite-git-cleanup/cleanup.sh
```

Prints the plan and changes nothing. Pass `--target <branch>` to compare against
something other than the default branch.

**Never invoke `--apply` before showing the user the dry-run output and getting an
explicit yes.** Branch deletion is cheap to get wrong and, once the reflog has
expired, tedious to undo. Present the STALE list, then **a direct question to the user** to
confirm — one question, options *Delete them · Cancel*. Only then:

```bash
.agents/skills/midnite-git-cleanup/cleanup.sh --apply
```

## 2 · What "landed" means — two tests, not one

A branch is stale if **either** holds:

| Test | Mechanism | Catches |
|---|---|---|
| ancestry | `git merge-base --is-ancestor` | ordinary merged branches |
| patch-equivalence | `git cherry` (patch-id) | duplicates & cherry-picks |

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

Worktree comes off before the branch it held, because git won't delete a branch
that's checked out somewhere.

## 4 · Aftercare

Deleted branches leave **dangling commits**. `git fsck` lists them; `git gc
--prune=now` sweeps them. The script does neither — pruning is the irreversible
half, and it buys almost no disk. Leave it to a human who knows they want it.

Re-running is idempotent: a clean repo reports `nothing to clean`.
