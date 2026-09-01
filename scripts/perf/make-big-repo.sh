#!/usr/bin/env bash
#
# A repository big enough for the graph to be interesting — Phase 36 Theme G.
#
# Theme G's first gate asks whether edge rendering dominates a graph scroll. It
# cannot be answered against this repo: a few hundred commits fit on a screen and
# a half, and no amount of scrolling produces the frame pressure the question is
# about. So the fixture is generated: ~50 000 commits over a handful of branches
# that merge into each other, which is what makes the LANE layout — and therefore
# the edges — non-trivial rather than one straight line.
#
# Empty commits (`--allow-empty`), because the graph reads history, not trees:
# 50 000 commits with content would be gigabytes and minutes for a picture that
# looks the same. `commit-tree` directly rather than `git commit` in a loop —
# the latter re-reads the index and runs hooks per commit, which turns three
# minutes into forty.
#
#   scripts/perf/make-big-repo.sh [target-dir] [commit-count]
#
# Defaults to a directory under $TMPDIR and 50 000 commits. Re-running against an
# existing directory refuses rather than appending: a fixture whose size depends
# on how many times the script was run is not a fixture.
set -euo pipefail

target="${1:-${TMPDIR:-/tmp}/mstudio-big-repo}"
count="${2:-50000}"
branches=6

if [ -e "$target" ]; then
  echo "refusing to touch an existing path: $target" >&2
  echo "remove it first, or pass a different target" >&2
  exit 1
fi

mkdir -p "$target"
git init --quiet "$target"
cd "$target"

# Local identity, so the generated history does not depend on — or get attributed
# to — whoever ran the script.
git config user.name 'Perf Fixture'
git config user.email 'perf@example.invalid'
git config commit.gpgsign false

empty_tree=$(git hash-object -t tree /dev/null)

# One root commit, then `count` more spread across `branches` heads that
# periodically merge. `commit-tree` writes a commit object from parents and a
# tree with no index involvement and no hooks, and `update-ref` moves the head —
# so each commit is two cheap plumbing calls.
root=$(git commit-tree "$empty_tree" -m 'root')
git update-ref refs/heads/main "$root"

declare -a tips
for b in $(seq 0 $((branches - 1))); do
  tips[b]="$root"
  git update-ref "refs/heads/lane-$b" "$root"
done

echo "generating $count commits across $branches branches in $target…" >&2
for i in $(seq 1 "$count"); do
  b=$(( i % branches ))
  parent="${tips[b]}"

  # Every 97th commit on a lane merges the lane before it, so the layout has real
  # crossings to lay out rather than parallel straight lines.
  if [ $(( i % 97 )) -eq 0 ] && [ "$b" -gt 0 ]; then
    other="${tips[$((b - 1))]}"
    sha=$(git commit-tree "$empty_tree" -p "$parent" -p "$other" -m "merge lane $((b - 1)) into lane $b at $i")
  else
    sha=$(git commit-tree "$empty_tree" -p "$parent" -m "commit $i on lane $b")
  fi

  tips[b]="$sha"
  git update-ref "refs/heads/lane-$b" "$sha"

  if [ $(( i % 5000 )) -eq 0 ]; then echo "  $i/$count" >&2; fi
done

git update-ref refs/heads/main "${tips[0]}"
git symbolic-ref HEAD refs/heads/main
git reset --hard --quiet

echo >&2
echo "done: $target" >&2
echo "  commits: $(git rev-list --count --all)" >&2
echo "  branches: $(git for-each-ref --format='%(refname:short)' refs/heads | tr '\n' ' ')" >&2
echo >&2
echo "Profile a scroll against it:" >&2
echo "  MSTUDIO_PERF=1 MSTUDIO_OPEN_REPOS=$target moon run desktop:start" >&2
echo "  then DevTools ▸ Performance ▸ record a full-speed scroll of the graph" >&2
