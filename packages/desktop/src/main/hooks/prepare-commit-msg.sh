#!/bin/sh
# midnite-studio:prepare-commit-msg:v1
#
# midnite-studio: stamp a commit with the agent session that made it.
#
# Installed into THIS repository's hooks directory only when the user turns on
# Settings ▸ Agents ▸ "Stamp commits with the session" (default off) — see
# `main/hooks/install.ts`, which writes this exact file and never overwrites a
# hook it did not put there itself.
#
# `MSTUDIO_SESSION_ID`/`MSTUDIO_AGENT_ID` are set in the environment of every
# pty the broker spawns for an agent session (Phase 78 Theme E, `pty-env.ts`)
# — a plain shell session gets neither, so a human's own `git commit` from any
# terminal this hook fires in is untouched whether the switch above is on or
# off. With the switch off, the vars are simply never set and this hook is
# never installed to read them in the first place.
#
# git passes the commit-message file as $1 (`prepare-commit-msg`'s own
# contract); $2 (source: message/template/merge/squash/commit) and $3 (the
# commit being amended/cherry-picked) are not consulted — an existing
# `Midnite-Session:` trailer is reason enough to skip, which already covers
# amend without needing to inspect $2.
#
# Deliberate bypass: unset MSTUDIO_SESSION_ID (any shell session already has),
# or `git commit --no-verify`.

msg_file="$1"

[ -n "$MSTUDIO_SESSION_ID" ] || exit 0
grep -qi '^Midnite-Session:' "$msg_file" 2>/dev/null && exit 0

git interpret-trailers --in-place --trailer "Midnite-Session: $MSTUDIO_SESSION_ID" "$msg_file"

if [ -n "$MSTUDIO_AGENT_ID" ]; then
  git interpret-trailers --in-place --trailer "Midnite-Agent: $MSTUDIO_AGENT_ID" "$msg_file"
fi

exit 0
