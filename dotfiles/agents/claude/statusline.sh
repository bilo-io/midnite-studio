#!/usr/bin/env bash
# Claude Code statusline: folder, branch, PR, model, effort, ctx/5h/7d usage bars.
input=$(cat)

esc=$'\033'
reset="${esc}[0m"
bold="${esc}[1m"
dim="${esc}[2m"
c() { printf '%s[38;5;%sm' "$esc" "$1"; }

FOLDER_C=$(c 110)   # soft blue
PATH_C="$dim"
BRANCH_C=$(c 149)   # green
PR_C=$(c 183)       # lavender
MODEL_C=$(c 116)    # cyan
EFFORT_C=$(c 222)   # sand
SEP="${dim} · ${reset}"

RED=$(c 203)
AMBER=$(c 214)
GREEN=$(c 114)
GRAY=$(c 244)

rag() {
  local pct=$1
  if [ "$pct" -ge 80 ]; then printf '%s' "$RED"
  elif [ "$pct" -ge 50 ]; then printf '%s' "$AMBER"
  else printf '%s' "$GREEN"
  fi
}

bar() {
  # thin, stepped progress bar: filled ▰ / empty ▱ over $2 segments (default 10)
  local pct=$1 width=${2:-10}
  local filled=$(( (pct * width + 50) / 100 ))
  [ "$filled" -gt "$width" ] && filled=$width
  [ "$filled" -lt 0 ] && filled=0
  local empty=$(( width - filled ))
  local out=""
  local i
  for ((i = 0; i < filled; i++)); do out+="▰"; done
  for ((i = 0; i < empty; i++)); do out+="▱"; done
  printf '%s' "$out"
}

shorten_path() {
  # collapse a path to its last $2 components, prefixed with "…" if trimmed
  local p="$1" keep="${2:-2}"
  p="${p/#$HOME/~}"
  IFS='/' read -ra parts <<< "$p"
  local n=${#parts[@]}
  if [ "$n" -le $((keep + 1)) ]; then
    printf '%s' "$p"
    return
  fi
  local out="…"
  local i
  for ((i = n - keep; i < n; i++)); do out+="/${parts[i]}"; done
  printf '%s' "$out"
}

cwd=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd')
segments=()

# 1. folder: trimmed path, folder icon, bold current folder
folder_name=$(basename "$cwd")
parent=$(dirname "$cwd")
if [ "$parent" != "/" ] && [ "$parent" != "." ]; then
  trimmed=$(shorten_path "$parent" 2)
  segments+=("${PATH_C}${trimmed}/${reset}📁 ${FOLDER_C}${bold}${folder_name}${reset}")
else
  segments+=("📁 ${FOLDER_C}${bold}${folder_name}${reset}")
fi

# 2. branch
branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
if [ -n "$branch" ]; then
  segments+=("${BRANCH_C}⎇ ${branch}${reset}")
fi

# 3. PR (clickable OSC 8 hyperlink, "#N")
pr_number=$(printf '%s' "$input" | jq -r '.pr.number // empty')
pr_url=$(printf '%s' "$input" | jq -r '.pr.url // empty')
if [ -n "$pr_number" ] && [ -n "$pr_url" ]; then
  review_state=$(printf '%s' "$input" | jq -r '.pr.review_state // empty')
  pr_color="$PR_C"
  case "$review_state" in
    approved) pr_color="$GREEN" ;;
    changes_requested) pr_color="$RED" ;;
  esac
  link="${esc}]8;;${pr_url}${esc}\\#${pr_number}${esc}]8;;${esc}\\"
  segments+=("${pr_color}${link}${reset}")
fi

# 4. model, stripped of version/semver
model_name=$(printf '%s' "$input" | jq -r '.model.display_name // .model.id // empty')
model_short=$(printf '%s' "$model_name" | sed -E 's/^Claude[[:space:]]+//; s/[[:space:]]+[0-9]+(\.[0-9]+)*.*$//')
[ -n "$model_short" ] && segments+=("${MODEL_C}${model_short}${reset}")

# 5. effort level
effort=$(printf '%s' "$input" | jq -r '.effort.level // empty')
[ -n "$effort" ] && segments+=("${EFFORT_C}${effort}${reset}")

# 6. context window usage
ctx_pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty')
if [ -n "$ctx_pct" ]; then
  ctx_i=$(printf '%.0f' "$ctx_pct")
  cc=$(rag "$ctx_i")
  segments+=("${GRAY}ctx ${cc}$(bar "$ctx_i") ${ctx_i}%${reset}")
fi

# 7 & 8. 5h / 7d rate-limit usage
five_pct=$(printf '%s' "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
if [ -n "$five_pct" ]; then
  five_i=$(printf '%.0f' "$five_pct")
  fc=$(rag "$five_i")
  segments+=("${GRAY}5h ${fc}$(bar "$five_i") ${five_i}%${reset}")
fi

week_pct=$(printf '%s' "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
if [ -n "$week_pct" ]; then
  week_i=$(printf '%.0f' "$week_pct")
  wc=$(rag "$week_i")
  segments+=("${GRAY}7d ${wc}$(bar "$week_i") ${week_i}%${reset}")
fi

out=""
for i in "${!segments[@]}"; do
  if [ "$i" -eq 0 ]; then
    out="${segments[$i]}"
  else
    out="${out}${SEP}${segments[$i]}"
  fi
done

printf '%s' "$out"
