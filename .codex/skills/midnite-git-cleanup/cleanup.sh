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
# Usage:
#   cleanup.sh                     # dry run against the default branch
#   cleanup.sh --apply             # actually delete
#   cleanup.sh --target release    # compare against another branch

APPLY=0
TARGET=''

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)  APPLY=1 ;;
    --target) TARGET="$2"; shift ;;
    -h|--help) sed -n '2,36p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
if [ -n "$KEEP" ]; then
  echo 'KEEPING (not fully landed):'
  printf "$KEEP" | awk -F'\t' 'NF{printf "  %-36s %s\n", $1, $2}'
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
if [ -z "$STALE" ]; then
  echo 'nothing to clean — no fully-landed branches.'
  exit 0
fi

echo 'STALE (fully landed — will be removed):'
printf "$STALE" | awk -F'\t' 'NF{printf "  %-36s %-64s %s\n", $1, $2, ($3==""?"":"worktree: " $3)}'
echo

if [ "$APPLY" -ne 1 ]; then
  echo 're-run with --apply to delete these.'
  exit 0
fi

# --- apply: worktree first, then the branch it held ---------------------------
echo 'applying:'
printf "$STALE" | while IFS="$(printf '\t')" read -r b how wt; do
  [ -n "$b" ] || continue
  if [ -n "$wt" ]; then
    git worktree remove "$wt" 2>&1 | sed 's/^/  /' \
      && printf '  removed worktree %s\n' "$wt" \
      || { printf '  FAILED to remove worktree %s — leaving branch %s\n' "$wt" "$b"; continue; }
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
printf 'remaining branches:\n'
git for-each-ref refs/heads --format='  %(refname:short) -> %(objectname:short)'
printf 'remaining worktrees:\n'
git worktree list | sed 's/^/  /'
echo
echo 'note: deleted branches leave dangling commits. `git fsck` lists them;'
echo '`git gc --prune=now` sweeps them, which is the irreversible step — left to you.'
