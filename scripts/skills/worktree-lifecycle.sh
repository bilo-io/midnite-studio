#!/usr/bin/env bash
# Worktree lifecycle for swarm/fleet agents (Phase 151 Theme E).
#
#   worktree-lifecycle.sh create <slug> [--base REF] [--brief FILE] [--no-install]
#   worktree-lifecycle.sh remove <slug|path> [--force] [--delete-branch]
#   worktree-lifecycle.sh stalled [--minutes N]       worktrees whose SCRATCHPAD.md has not moved
#   worktree-lifecycle.sh check <slug|path>           scratchpad untracked? tree clean?
#   worktree-lifecycle.sh list
#
# Rules: work happens in .worktrees/<slug> on feature/<slug>; the primary checkout is never touched and never
# removed; a worktree with uncommitted changes (SCRATCHPAD.md aside, it is deliberately untracked) is only
# removed with an explicit --force. Set MIDNITE_WT_ROOT to run against another repo (tests do).
set -euo pipefail

cmd="${1:-}"; shift || true
# --no-llm is accepted as a documented no-op (this script never calls an LLM), so a skill's step 0 can add it everywhere.
_args=(); for _a in "$@"; do [[ "$_a" == --no-llm ]] || _args+=("$_a"); done
set -- "${_args[@]+"${_args[@]}"}"
root="${MIDNITE_WT_ROOT:-$(git rev-parse --show-toplevel)}"
# the primary checkout is the first entry of `git worktree list`
primary="$(git -C "$root" worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
wt_dir="$primary/.worktrees"

die() { echo "worktree-lifecycle: $*" >&2; exit 1; }

resolve() { # slug|path -> absolute path
  local t="$1"
  if [[ -d "$t" ]]; then (cd "$t" && pwd -P); else echo "$wt_dir/$t"; fi
}

dirty_files() { # NUL-delimited porcelain, ignoring the deliberately-untracked SCRATCHPAD.md
  git -C "$1" status --porcelain -z --untracked-files=all | tr '\0' '\n' | grep -v '^$' | grep -v '^?? SCRATCHPAD.md$' || true
}

case "$cmd" in
  create)
    slug="${1:-}"; shift || true
    [[ -n "$slug" ]] || die "usage: create <slug> [--base REF] [--brief FILE] [--no-install]"
    base="origin/main"; brief=""; install=1
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --base) base="$2"; shift 2 ;;
        --brief) brief="$2"; shift 2 ;;
        --no-install) install=0; shift ;;
        *) die "unknown flag $1" ;;
      esac
    done
    path="$wt_dir/$slug"
    [[ ! -e "$path" ]] || die "$path already exists"
    git -C "$primary" fetch -q origin 2>/dev/null || echo "warn: fetch failed, using local refs" >&2
    git -C "$primary" worktree add "$path" -b "feature/$slug" "$base"
    # SCRATCHPAD.md first, before any edit: brief verbatim, then the standing sections
    {
      echo "## Brief (verbatim from the orchestrator)"
      if [[ -n "$brief" ]]; then cat "$brief"; else echo "(paste the launch prompt here)"; fi
      printf '\n## Goal\n\n## Decisions\n\n## Done\n\n## Surprises\n\n## Next\n\n## Todo\n- [ ] \n'
    } > "$path/SCRATCHPAD.md"
    if [[ "$install" == 1 ]]; then
      (
        cd "$path"
        for v in $(env | grep -o '^MOON_[A-Z_]*' || true); do unset "$v"; done
        export GITHUB_PACKAGES_TOKEN="${GITHUB_PACKAGES_TOKEN:-$(gh auth token 2>/dev/null || true)}"
        pnpm install --frozen-lockfile 2>&1 | tail -3
      )
    fi
    echo "$path"
    ;;
  check)
    path="$(resolve "${1:-}")"
    [[ -d "$path" ]] || die "no such worktree $path"
    if git -C "$path" ls-files --error-unmatch SCRATCHPAD.md >/dev/null 2>&1; then
      echo "SCRATCHPAD.md is TRACKED - git rm --cached SCRATCHPAD.md before merging"; exit 3
    fi
    d="$(dirty_files "$path")"
    if [[ -n "$d" ]]; then echo "dirty:"; echo "$d"; exit 4; fi
    echo "clean"
    ;;
  remove)
    target="${1:-}"; shift || true
    [[ -n "$target" ]] || die "usage: remove <slug|path> [--force] [--delete-branch]"
    force=0; delbranch=0
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --force) force=1; shift ;;
        --delete-branch) delbranch=1; shift ;;
        *) die "unknown flag $1" ;;
      esac
    done
    path="$(resolve "$target")"
    [[ -d "$path" ]] || die "no such worktree $path"
    [[ "$path" != "$primary" ]] || die "refusing to remove the primary checkout"
    case "$path" in "$wt_dir"/*|*/.worktrees/*|*/scratchpad/*) ;; *) die "refusing: $path is not under .worktrees/ or a scratchpad" ;; esac
    d="$(dirty_files "$path")"
    if [[ -n "$d" && "$force" != 1 ]]; then
      echo "refusing: $path has uncommitted changes (use --force to discard):" >&2
      echo "$d" >&2
      exit 4
    fi
    branch="$(git -C "$path" symbolic-ref -q --short HEAD || true)"
    if [[ "$force" == 1 ]]; then git -C "$primary" worktree remove --force "$path"; else git -C "$primary" worktree remove "$path"; fi
    git -C "$primary" worktree prune
    if [[ "$delbranch" == 1 && -n "$branch" && "$branch" != main ]]; then git -C "$primary" branch -D "$branch" >/dev/null; fi
    echo "removed $path"
    ;;
  stalled)
    mins=30
    [[ "${1:-}" == "--minutes" ]] && mins="${2:-30}"
    git -C "$primary" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while IFS= read -r w; do
      [[ "$w" == "$primary" ]] && continue
      sp="$w/SCRATCHPAD.md"
      if [[ ! -f "$sp" ]]; then echo "$w no-scratchpad"; continue; fi
      if [[ -n "$(find "$sp" -mmin "+$mins" 2>/dev/null)" ]]; then echo "$w stalled>${mins}m"; fi
    done
    ;;
  list)
    git -C "$primary" worktree list
    ;;
  *)
    sed -n 2,12p "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
    exit 2
    ;;
esac
