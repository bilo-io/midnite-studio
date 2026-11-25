#!/usr/bin/env bash
# Worktree lifecycle for swarm/fleet agents (Phase 151 Theme E).
#
#   worktree-lifecycle.sh create <slug> [--base REF] [--brief FILE] [--no-install]
#   worktree-lifecycle.sh remove <slug|path> [--force] [--delete-branch]
#   worktree-lifecycle.sh stalled [--minutes N]       worktrees whose SCRATCHPAD.md has not moved
#   worktree-lifecycle.sh check <slug|path>           scratchpad untracked? tree clean?
#   worktree-lifecycle.sh list
#   worktree-lifecycle.sh sweep [--apply]             worktrees whose branch landed (ancestor of main, or PR merged/closed)
#   worktree-lifecycle.sh scratchpads                 every .worktrees/*/SCRATCHPAD.md: age, todo count, Next line (resume)
#
# Rules: work happens in .worktrees/<slug> on feature/<slug>; the primary checkout is never touched and never
# removed; a worktree with uncommitted changes (SCRATCHPAD.md aside, it is deliberately untracked) is only
# removed with an explicit --force. Set MIDNITE_WT_ROOT to run against another repo (tests do).
set -euo pipefail

cmd="${1:-}"; shift || true
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

mb_of() { # size of a directory in whole MB
  du -sk "$1" 2>/dev/null | awk '{printf "%d", ($1 + 1023) / 1024}'
}

mtime_of() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }

age_of() { # seconds -> 12s / 5m / 3h / 2d
  awk -v s="$1" 'BEGIN{ if (s<60) printf "%ds", s; else if (s<3600) printf "%dm", s/60; else if (s<86400) printf "%dh", s/3600; else printf "%dd", s/86400 }'
}

drop_scratchpad() { # delete SCRATCHPAD.md only when it is untracked and nothing else is dirty
  local w="$1"
  if [[ -f "$w/SCRATCHPAD.md" ]] && ! git -C "$w" ls-files --error-unmatch SCRATCHPAD.md >/dev/null 2>&1 && [[ -z "$(dirty_files "$w")" ]]; then
    rm -f "$w/SCRATCHPAD.md"
  fi
}

landed_reason() { # <branch> -> why it counts as landed (empty when it does not)
  local b="$1" st
  if git -C "$primary" merge-base --is-ancestor "$b" origin/main 2>/dev/null || git -C "$primary" merge-base --is-ancestor "$b" main 2>/dev/null; then
    echo "merged (ancestor of main)"; return
  fi
  if command -v gh >/dev/null 2>&1; then
    st="$(cd "$primary" && gh pr list --head "$b" --state all --limit 1 --json state --jq '.[0].state // empty' 2>/dev/null || true)"
    case "$st" in
      MERGED) echo "merged (PR merged)" ;;
      CLOSED) echo "closed (PR closed unmerged)" ;;
    esac
  fi
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
    freed="$(mb_of "$path")"
    [[ "$force" == 1 ]] || drop_scratchpad "$path"
    if [[ "$force" == 1 ]]; then git -C "$primary" worktree remove --force "$path"; else git -C "$primary" worktree remove "$path"; fi
    git -C "$primary" worktree prune
    if [[ "$delbranch" == 1 && -n "$branch" && "$branch" != main ]]; then git -C "$primary" branch -D "$branch" >/dev/null; fi
    echo "removed $path (freed ${freed} MB)"
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
  scratchpads)
    now="$(date +%s)"
    found=0
    for sp in "$wt_dir"/*/SCRATCHPAD.md; do
      [[ -f "$sp" ]] || continue
      found=1
      w="$(dirname "$sp")"
      next="$(awk '/^## Next/{f=1;next} /^## /{f=0} f&&NF{sub(/^[ \t]*[-*] +/,""); print; exit}' "$sp")"
      todo="$(awk '/^## Todo/{f=1;next} /^## /{f=0} f&&/^[ \t]*[-*] \[[ xX]\] *[^ ]/{t++; if ($0 ~ /\[[xX]\]/) d++} END{printf "%d/%d", d, t}' "$sp")"
      printf '%s\t%s\ttodo %s\tnext: %s\n' "$(basename "$w")" "$(age_of $((now - $(mtime_of "$sp"))))" "$todo" "${next:--}"
    done
    [[ "$found" == 1 ]] || echo "no scratchpads under $wt_dir" >&2
    ;;
  sweep)
    apply=0
    [[ "${1:-}" == "--apply" ]] && apply=1
    total=0; n=0
    while IFS= read -r w; do
      [[ -n "$w" && "$w" != "$primary" ]] || continue
      branch="$(git -C "$w" symbolic-ref -q --short HEAD || true)"
      [[ -n "$branch" && "$branch" != main ]] || continue
      why="$(landed_reason "$branch")"
      [[ -n "$why" ]] || continue
      mb="$(mb_of "$w")"
      d="$(dirty_files "$w")"
      if [[ -n "$d" ]]; then state="dirty ($(printf '%s\n' "$d" | wc -l | tr -d ' ') files)"; else state="clean"; fi
      action="-"
      if [[ "$apply" == 1 ]]; then
        if [[ "$w" != "$wt_dir"/* ]]; then action="skipped (not under .worktrees/)"
        elif [[ "$w" == "$(pwd -P)" || "$(pwd -P)" == "$w"/* ]]; then action="skipped (current directory)"
        elif [[ -n "$d" ]]; then action="skipped (dirty)"
        else
          drop_scratchpad "$w"
          if git -C "$primary" worktree remove "$w" 2>/dev/null; then
            action="removed"; total=$((total + mb))
            case "$why" in merged*) git -C "$primary" branch -D "$branch" >/dev/null 2>&1 && action="removed + branch deleted" ;; esac
          else
            action="FAILED (git refused; not forced)"
          fi
        fi
      fi
      n=$((n + 1))
      printf '%s\t%s\t%s\t%s MB\t%s\t%s\n' "$(basename "$w")" "$branch" "$why" "$mb" "$state" "$action"
    done < <(git -C "$primary" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}')
    git -C "$primary" worktree prune
    if [[ "$n" == 0 ]]; then echo "nothing to sweep"
    elif [[ "$apply" == 1 ]]; then echo "freed ${total} MB"
    else echo "dry run: re-run with --apply to remove the clean ones"; fi
    ;;
  *)
    sed -n 2,14p "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
    exit 2
    ;;
esac
