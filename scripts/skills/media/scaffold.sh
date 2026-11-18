#!/usr/bin/env bash
# Scaffold a media project folder (Phase 151 Theme E).
#   scaffold.sh <audio|image|doc|sfx|model|terrain|map|video> <project> [--repo DIR] [--name NAME]
# Creates <repo>/.midnite/media/<kind>/<project>/ (and, for doc, a starter <NAME>.md). Never overwrites an
# existing file, and never writes app-owned sidecars (project.json, *.thread.json, <asset>.json, map.json).
set -euo pipefail

kind="${1:-}"; project="${2:-}"; shift 2 || true
repo="$(pwd)"; name=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --name) name="$2"; shift 2 ;;
    *) echo "scaffold: unknown flag $1" >&2; exit 2 ;;
  esac
done

case "$kind" in audio|image|doc|sfx|model|terrain|map|video) ;; *) echo "usage: scaffold.sh <audio|image|doc|sfx|model|terrain|map|video> <project> [--repo DIR] [--name NAME]" >&2; exit 2 ;; esac
if [[ -z "$project" || "$project" == .* || "$project" == */* || "$project" == *\\* ]]; then
  echo "scaffold: project must be a single path segment with no leading dot" >&2; exit 2
fi

dir="$repo/.midnite/media/$kind/$project"
if [[ -d "$dir" ]]; then echo "exists   $dir"; else mkdir -p "$dir"; echo "created  $dir"; fi

if [[ "$kind" == doc ]]; then
  file="$dir/${name:-$project}.md"
  if [[ -e "$file" ]]; then echo "skipped  $file (exists)"; else printf '# %s\n\n' "${name:-$project}" > "$file"; echo "created  $file"; fi
fi
