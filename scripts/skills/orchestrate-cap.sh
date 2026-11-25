#!/usr/bin/env bash
# Sample CPU + RAM and feed the cap state machine (Phase 151 Theme E).
#   scripts/skills/orchestrate-cap.sh [--running N] [--queued N] [--max N] [--chart] [--state FILE] [--json] [--cap N]
#   scripts/skills/orchestrate-cap.sh --transcript FILE [--tail-kb N] [--tail-lines N] [--window N]   (reads only the tail)
# --queued/--max/--chart/--transcript pass straight through to the .mjs. Reads `top -l 2` and `memory_pressure -Q`, then calls orchestrate-cap.mjs. Pass --cpu/--ram to skip sampling.
# Default state file lives in $TMPDIR so the two-checks-in-a-row rule survives between ticks.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
args=("$@")
has() { for a in "${args[@]:-}"; do [[ "$a" == "$1" ]] && return 0; done; return 1; }

if has --transcript; then exec node "$here/orchestrate-cap.mjs" "${args[@]}"; fi
if ! has --cpu || ! has --ram; then
  cpu_line="$(top -l 2 -n 0 -s 1 2>/dev/null | grep 'CPU usage' | tail -1 || true)"
  mem_line="$(memory_pressure -Q 2>/dev/null | tail -1 || true)"
  cpu="$(node -e 'import("'"$here"'/orchestrate-cap.mjs").then(m=>console.log(m.parseCpu(process.argv[1])??0))' "$cpu_line")"
  ram="$(node -e 'import("'"$here"'/orchestrate-cap.mjs").then(m=>console.log(m.parseRam(process.argv[1])??0))' "$mem_line")"
  args+=(--cpu "$cpu" --ram "$ram")
fi
has --state || args+=(--state "${TMPDIR:-/tmp}/midnite-orchestrate-cap.json")
exec node "$here/orchestrate-cap.mjs" "${args[@]}"
