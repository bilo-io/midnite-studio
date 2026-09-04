#!/bin/sh
#
# midnite-git-cleanup — remove branches and worktrees that have fully landed.
#
# DRY-RUN UNLESS `--apply`. Deleting a branch is cheap to get wrong and annoying
# to undo once the reflog has expired, so the default is to print the plan and
# change nothing.
#
# Staleness is decided by TWO tests, not one, and the second is the reason this
# script exists:
#
#   1. ancestry        — `merge-base --is-ancestor`: every commit on the branch is
#                        reachable from the target. This is what `git branch -d`
#                        checks.
#   2. patch-equivalence — `git cherry`: the branch has commits the target cannot
#                        reach, but every one is patch-identical to something
#                        already there.
#
# Test 1 alone is what makes `git branch -d` refuse a branch whose work HAS
# landed — as a duplicate commit or a cherry-pick, which carries the same diff
# under a different SHA. Reachability is not content. Test 2 catches those, and a
# branch that passes only via test 2 is flagged in the output so a human can eyeball
# it before `--apply`.
#
# Deliberately NOT done here:
#   * no `gc`/`prune` — deleting a branch leaves its commits dangling, and pruning
#     them is the irreversible half. Left for a human to run knowingly.
#   * no reflog expiry — `git stash` entries ARE reflog entries, so the usual
#     `reflog expire --all` cleanup silently eats every stash.
#   * no `worktree remove --force` — git refusing a dirty worktree is the safety
#     check, not an obstacle. Dirty ones are reported and skipped.
#
# REMOTE branches get a third test, because the two above cannot see a GitHub
# squash or rebase merge: a squash rewrites N commits into 1 new SHA (and, once
# N>1, the *patch-id* changes too — `git cherry` only matches per-commit diffs,
# not the union of several), so a squash-merged multi-commit branch is neither an
# ancestor nor patch-equivalent, ever, no matter how long it sits merged. `gh pr
# list --state merged` is the ground truth GitHub actually has, so for
# refs/remotes/<remote>/* it is checked FIRST: a remote branch whose tip commit
# equals a merged PR's `headRefOid` is stale regardless of what ancestry/cherry
# say. Only a branch with no merged-PR record falls back to ancestry/cherry
# (plain merge-commit workflows, or no `gh`/no auth available).
#
# Usage:
#   cleanup.sh                     # dry run against the default branch
#   cleanup.sh --apply             # delete local stale branches/worktrees
#   cleanup.sh --apply --prune-remote  # also delete stale remote branches
#   cleanup.sh --target release    # compare against another branch
#   cleanup.sh --no-remote         # skip remote branches entirely (local-only)

APPLY=0
PRUNE_REMOTE=0
NO_REMOTE=0
TARGET=''

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)        APPLY=1 ;;
    --prune-remote) PRUNE_REMOTE=1 ;;
    --no-remote)    NO_REMOTE=1 ;;
    --target)       TARGET="$2"; shift ;;
    -h|--help) sed -n '2,49p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

git rev-parse --git-dir >/dev/null 2>&1 || { echo 'not a git repository' >&2; exit 1; }

# Target: explicit, else origin's default branch, else main/master, else current.
if [ -z "$TARGET" ]; then
  TARGET=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
  [ -n "$TARGET" ] || for c in main master; do
    git show-ref --verify --quiet "refs/heads/$c" && { TARGET=$c; break; }
  done
  [ -n "$TARGET" ] || TARGET=$(git branch --show-current)
fi
git show-ref --verify --quiet "refs/heads/$TARGET" || {
  printf 'target branch %s does not exist\n' "$TARGET" >&2; exit 1; }

CURRENT=$(git branch --show-current)
printf 'target  : %s (%s)\n' "$TARGET" "$(git rev-parse --short "$TARGET")"
printf 'current : %s\n' "${CURRENT:-<detached>}"
printf 'mode    : %s\n\n' "$([ "$APPLY" -eq 1 ] && echo 'APPLY — will delete' || echo 'dry run — no changes')"

# --- map branch -> worktree path, and note whether that worktree is dirty ------
WT_MAP=$(git worktree list --porcelain | awk '
  /^worktree /  { path=substr($0,10) }
  /^branch /    { ref=substr($0,8); sub(/^refs\/heads\//,"",ref); print ref "\t" path }
')
worktree_for() { printf '%s\n' "$WT_MAP" | awk -F'\t' -v b="$1" '$1==b {print $2; exit}'; }

STALE='' KEEP='' BLOCKED=''

for b in $(git for-each-ref refs/heads --format='%(refname:short)'); do
  [ "$b" = "$TARGET" ] && continue
  if [ "$b" = "$CURRENT" ]; then
    KEEP="$KEEP$b\tcurrent branch — never deleted\n"; continue
  fi

  if git merge-base --is-ancestor "$b" "$TARGET" 2>/dev/null; then
    how='ancestor'
  else
    plus=$(git cherry "$TARGET" "$b" 2>/dev/null | grep -c '^+' || true)
    [ -z "$plus" ] && plus=0
    if [ "$plus" -eq 0 ]; then
      how='patch-equivalent (duplicate/cherry-pick — `git branch -d` would refuse)'
    else
      KEEP="$KEEP$b\t$plus unique change(s) not on $TARGET\n"; continue
    fi
  fi

  wt=$(worktree_for "$b")
  if [ -n "$wt" ] && [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
    BLOCKED="$BLOCKED$b\tworktree $wt has uncommitted changes\n"; continue
  fi
  STALE="$STALE$b\t$how\t$wt\n"
done

# --- remote branches (see the header comment for why gh comes first) ----------
REMOTE='origin'
HAS_REMOTE=0 HAS_GH=0
if [ "$NO_REMOTE" -ne 1 ] && git remote get-url "$REMOTE" >/dev/null 2>&1 \
  && git show-ref --verify --quiet "refs/remotes/$REMOTE/$TARGET"; then
  HAS_REMOTE=1
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    HAS_GH=1
  fi
fi

MERGED_PR_MAP=''
if [ "$HAS_GH" -eq 1 ]; then
  MERGED_PR_MAP=$(gh pr list --state merged --limit 500 \
    --json headRefName,headRefOid,number \
    --jq '.[] | "\(.headRefName)\t\(.headRefOid)\t\(.number)"' 2>/dev/null)
fi
merged_pr_oid() { printf '%s\n' "$MERGED_PR_MAP" | awk -F'\t' -v b="$1" '$1==b{print $2; exit}'; }
merged_pr_num() { printf '%s\n' "$MERGED_PR_MAP" | awk -F'\t' -v b="$1" '$1==b{print $3; exit}'; }

RSTALE='' RKEEP=''
if [ "$HAS_REMOTE" -eq 1 ]; then
  RTARGET="$REMOTE/$TARGET"
  for rb in $(git for-each-ref "refs/remotes/$REMOTE" --format='%(refname:short)'); do
    b=${rb#"$REMOTE/"}
    [ "$b" = 'HEAD' ] && continue
    [ "$b" = "$TARGET" ] && continue

    if [ "$HAS_GH" -eq 1 ] && oid=$(merged_pr_oid "$b") && [ -n "$oid" ]; then
      num=$(merged_pr_num "$b")
      if [ "$(git rev-parse "$rb")" = "$oid" ]; then
        RSTALE="$RSTALE$rb\tmerged via PR #$num\n"
      else
        RKEEP="$RKEEP$rb\tPR #$num merged, but branch tip has moved since — review\n"
      fi
      continue
    fi

    if git merge-base --is-ancestor "$rb" "$RTARGET" 2>/dev/null; then
      RSTALE="$RSTALE$rb\tancestor\n"
      continue
    fi
    plus=$(git cherry "$RTARGET" "$rb" 2>/dev/null | grep -c '^+' || true)
    [ -z "$plus" ] && plus=0
    if [ "$plus" -eq 0 ]; then
      RSTALE="$RSTALE$rb\tpatch-equivalent\n"
    else
      RKEEP="$RKEEP$rb\t$plus unique change(s), no merged PR on record — review\n"
    fi
  done
fi

# --- stash anchors: would any planned deletion orphan a stash's base commit? ---
STASH_WARN=''
i=0
while git rev-parse --verify --quiet "stash@{$i}" >/dev/null 2>&1; do
  base=$(git rev-list --parents -1 "stash@{$i}" 2>/dev/null | awk '{print $2}')
  if [ -n "$base" ] && ! git merge-base --is-ancestor "$base" "$TARGET" 2>/dev/null; then
    STASH_WARN="$STASH_WARN  stash@{$i} is anchored to $(git rev-parse --short "$base"), which is not on $TARGET\n"
  fi
  i=$((i + 1))
done

# --- report -------------------------------------------------------------------
if [ "$NO_REMOTE" -ne 1 ] && [ "$HAS_REMOTE" -eq 0 ]; then
  echo "note: no $REMOTE/$TARGET remote-tracking ref — skipping remote branches."
  echo
elif [ "$HAS_REMOTE" -eq 1 ] && [ "$HAS_GH" -eq 0 ]; then
  echo "note: gh unavailable/unauthenticated — remote branches checked by"
  echo '      ancestry/patch-id only, which misses squash- or rebase-merged PRs.'
  echo
fi
if [ -n "$KEEP" ]; then
  echo 'KEEPING (not fully landed):'
  printf "$KEEP" | awk -F'\t' 'NF{printf "  %-36s %s\n", $1, $2}'
  echo
fi
if [ -n "$RKEEP" ]; then
  echo 'KEEPING REMOTE (not confirmed landed):'
  printf "$RKEEP" | awk -F'\t' 'NF{printf "  %-44s %s\n", $1, $2}'
  echo
fi
if [ -n "$BLOCKED" ]; then
  echo 'BLOCKED (stale, but its worktree is dirty — commit or discard first):'
  printf "$BLOCKED" | awk -F'\t' 'NF{printf "  %-36s %s\n", $1, $2}'
  echo
fi
if [ -n "$STASH_WARN" ]; then
  echo 'STASH WARNING — these stashes rest on commits outside the target branch.'
  echo 'Deleting branches can leave their base dangling and a later gc would then'
  echo 'break `git stash apply`. Pop or re-anchor them first if you care:'
  printf "$STASH_WARN"
  echo
fi
if [ -z "$STALE" ] && [ -z "$RSTALE" ]; then
  echo 'nothing to clean — no fully-landed branches.'
  exit 0
fi

if [ -n "$STALE" ]; then
  echo 'STALE (fully landed — will be removed):'
  printf "$STALE" | awk -F'\t' 'NF{printf "  %-36s %-64s %s\n", $1, $2, ($3==""?"":"worktree: " $3)}'
  echo
fi
if [ -n "$RSTALE" ]; then
  echo 'STALE REMOTE (fully landed on '"$REMOTE"' — will be removed with --prune-remote):'
  printf "$RSTALE" | awk -F'\t' 'NF{printf "  %-44s %s\n", $1, $2}'
  echo
fi

if [ "$APPLY" -ne 1 ]; then
  [ -n "$STALE" ] && echo 're-run with --apply to delete local branches/worktrees.'
  [ -n "$RSTALE" ] && echo 're-run with --apply --prune-remote to also delete remote branches.'
  exit 0
fi

# --- apply: worktree first, then the branch it held ---------------------------
if [ -n "$STALE" ]; then
  echo 'applying (local):'
  printf "$STALE" | while IFS="$(printf '\t')" read -r b how wt; do
    [ -n "$b" ] || continue
    if [ -n "$wt" ]; then
      wt_out=$(git worktree remove "$wt" 2>&1)
      wt_status=$?
      [ -n "$wt_out" ] && printf '%s\n' "$wt_out" | sed 's/^/  /'
      if [ "$wt_status" -eq 0 ]; then
        printf '  removed worktree %s\n' "$wt"
      else
        printf '  FAILED to remove worktree %s (exit %s) — leaving branch %s\n' "$wt" "$wt_status" "$b"
        continue
      fi
    fi
    # -d for ancestors; -D only where patch-equivalence is the evidence, since -d
    # tests reachability and would refuse a landed duplicate.
    if git branch -d "$b" >/dev/null 2>&1; then
      printf '  deleted %s (-d)\n' "$b"
    elif git branch -D "$b" >/dev/null 2>&1; then
      printf '  deleted %s (-D — landed as a duplicate, -d refused on reachability)\n' "$b"
    else
      printf '  FAILED to delete %s\n' "$b"
    fi
  done
  git worktree prune
  echo
fi

# --- apply: remote branches, only with the explicit --prune-remote opt-in -----
if [ -n "$RSTALE" ]; then
  if [ "$PRUNE_REMOTE" -eq 1 ]; then
    echo 'applying (remote):'
    printf "$RSTALE" | while IFS="$(printf '\t')" read -r rb how; do
      [ -n "$rb" ] || continue
      b=${rb#"$REMOTE/"}
      push_out=$(git push "$REMOTE" --delete "$b" 2>&1)
      push_status=$?
      [ -n "$push_out" ] && printf '%s\n' "$push_out" | sed 's/^/  /'
      if [ "$push_status" -eq 0 ]; then
        printf '  deleted %s on %s\n' "$b" "$REMOTE"
      else
        printf '  FAILED to delete %s on %s (exit %s)\n' "$b" "$REMOTE" "$push_status"
      fi
    done
    git fetch "$REMOTE" --prune >/dev/null 2>&1
    echo
  else
    echo 'skipped remote deletion — re-run with --apply --prune-remote to delete the'
    echo 'STALE REMOTE branches listed above.'
    echo
  fi
fi

printf 'remaining local branches:\n'
git for-each-ref refs/heads --format='  %(refname:short) -> %(objectname:short)'
printf 'remaining worktrees:\n'
git worktree list | sed 's/^/  /'
if [ "$HAS_REMOTE" -eq 1 ]; then
  printf 'remaining %s branches:\n' "$REMOTE"
  git for-each-ref "refs/remotes/$REMOTE" --format='  %(refname:short)' | grep -v "/HEAD\$"
fi
echo
echo 'note: deleted branches leave dangling commits. `git fsck` lists them;'
echo '`git gc --prune=now` sweeps them, which is the irreversible step — left to you.'
