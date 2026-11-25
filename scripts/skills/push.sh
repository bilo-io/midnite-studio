#!/usr/bin/env bash
# Push as bilo-io (Phase 151 Theme H). The active gh account is often a different one and 403s, so the
# token comes from `gh auth token -u bilo-io` and goes in through a one-shot credential helper (never
# written to config or argv logs of the remote). Refuses when any commit since the base carries a
# Co-Authored-By / Signed-off-by trailer, or when SCRATCHPAD.md is tracked.
#
#   scripts/skills/push.sh [ref] [--base origin/main] [--fix] [--check]
#     ref      branch to push (default: current branch)
#     --fix    untrack SCRATCHPAD.md with a commit instead of refusing (trailers are never auto-fixed)
#     --check  run the guards only, push nothing
# Exit: 0 pushed/ok, 1 guard refused, 2 usage/git error.
set -euo pipefail

base="origin/main"; fix=0; check=0; ref=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="$2"; shift 2 ;;
    --fix) fix=1; shift ;;
    --check) check=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    --*) echo "push.sh: unknown flag $1" >&2; exit 2 ;;
    *) ref="$1"; shift ;;
  esac
done

ref="${ref:-$(git rev-parse --abbrev-ref HEAD)}"
if [ "$ref" = "HEAD" ] || [ "$ref" = "main" ]; then echo "push.sh: refusing to push '$ref'" >&2; exit 1; fi

# Guard 1: attribution trailers in base..ref.
bad=$(git log --format='%h%n%B' "$base..$ref" | grep -iE '^(Co-Authored-By|Signed-off-by):' || true)
if [ -n "$bad" ]; then
  echo "push.sh: attribution trailer found in $base..$ref; reword the commit (never push it):" >&2
  echo "$bad" >&2
  exit 1
fi

# Guard 2: SCRATCHPAD.md must not be tracked.
if git ls-files --error-unmatch SCRATCHPAD.md >/dev/null 2>&1; then
  if [ "$fix" = 1 ]; then
    git rm --cached -q SCRATCHPAD.md
    git commit -q -m "chore: untrack SCRATCHPAD.md"
    echo "push.sh: untracked SCRATCHPAD.md (commit added)" >&2
  else
    echo "push.sh: SCRATCHPAD.md is tracked; rerun with --fix or 'git rm --cached SCRATCHPAD.md'" >&2
    exit 1
  fi
fi

[ "$check" = 1 ] && { echo "push.sh: guards passed"; exit 0; }

T=$(gh auth token -u bilo-io)
git -c credential.helper= -c "credential.helper=!f(){ echo username=bilo-io; echo password=$T; }; f" push -u origin "$ref"
