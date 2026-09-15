# Agent CLI settings snapshot

User-global command-allow / settings files for the agent CLIs, kept here so a new machine can be
brought up to the same state. Restore by copying a file back onto the path in the **Paths** table.

These are **user-global** configs (home directory / Application Support), not the project files
already in this repo (`.claude/settings.json` is the graphify hook config).

## Two machines, one union

This started life on 2026-09-14 as a copy of the **`bilolwabona`** MacBook. On 2026-09-15 it was
applied to the **`bilo-ekko`** machine and re-snapshotted, and the two were **merged rather than
replaced**: `permissions.allow` and `trustedWorkspaces` are the union of both hosts, and a key only
one host has is kept.

So a restore may hand a machine entries pointing at paths it does not have. That is deliberate and
mostly harmless — an allow entry naming a directory that does not exist simply never matches — but
three keys break rather than no-op, and were **left out** when this snapshot was applied to
`bilo-ekko`:

| Key | Belongs to | Why it does not travel |
|-----|-----------|------------------------|
| `statusLine.command` | `bilolwabona` | Runs `~/.claude/statusline-command.sh`, which is **not** in this snapshot. A missing script renders as an error in the status line. |
| `permissions.additionalDirectories` | `bilolwabona` | Grants `bilo-mono` / `ekko-web-mono` checkouts that exist only there. |
| `extraKnownMarketplaces.gitkraken` (+ its `enabledPlugins` entry) | `bilolwabona` | A `directory` source under that home; Claude Code cannot load it if the directory is absent. The `warp` and `remotion` marketplaces are GitHub-sourced and do travel. |

`model` is likewise per-machine taste, not something to restore blindly.

## Paths

| Tool | What it is | Path |
|------|------------|------|
| **Claude Code** | User allow/deny lists, plugins, model, attribution | `~/.claude/settings.json` |
| **Claude Code** | Extra user-local allows (merged on top) | `~/.claude/settings.local.json` |
| **Claude Code** | Session/account state — **do not copy into git** | `~/.claude.json` |
| **Antigravity CLI (`agy`)** | `permissions.allow` command list, `toolPermission`, trusted workspaces | `~/.gemini/antigravity-cli/settings.json` |
| **Gemini CLI** (separate from agy) | Auth type / session retention | `~/.gemini/settings.json` |
| **Cursor Agent CLI** | `permissions.allow` / `deny` for `Shell(...)` etc. | `~/.cursor/cli-config.json` |
| **Cursor IDE** | Editor settings, not CLI command allows | `~/Library/Application Support/Cursor/User/settings.json` |
| **Antigravity IDE** | Editor settings, not CLI command allows | `~/Library/Application Support/Antigravity/User/settings.json` |

Project overlays (already in this repo, left alone):

- `/.claude/settings.json` — graphify `PreToolUse` hooks
- `/.claude/settings.local.json` — extra Bash allows for this checkout

## What is snapshotted here

| Copy in repo | Source | Size |
|--------------|--------|------|
| `claude/settings.json` | `~/.claude/settings.json` | 117 allow, 7 deny |
| `claude/settings.local.json` | `~/.claude/settings.local.json` | 12 allow |
| `antigravity-cli/settings.json` | `~/.gemini/antigravity-cli/settings.json` | 56 allow, 22 trusted workspaces |
| `cursor/cli-config.json` | `~/.cursor/cli-config.json` **minus** `authInfo`, `privacyCache`, `autoReviewAvailabilityCache`, `serverConfigCache` | 25 allow |

Not snapshotted (secrets / noise): `~/.claude.json` (oauth + machine IDs), `~/.cursor/mcp.json`,
`~/.gemini/oauth_creds.json`, IDE `User/settings.json`.

## Notes

- **Attribution is off at every knob that has one**, per the repo's no-trailer rule in
  `CLAUDE.md`: Claude Code's `attribution.commit` / `attribution.pr` are `""`, and Cursor's
  `attribution.attributeCommitsToAgent` / `attributePRsToAgent` are `false`. **Agy has no such
  setting** — `.githooks/commit-msg` is the backstop for it.
- **Agy** stores an approval you "always allow" in `permissions.allow` in its settings file. If
  approvals are not appearing there, they were session-only.
- **Cursor Desktop does not use `cli-config.json`** for composer approvals — this file is the CLI
  only.
- Restore example: `cp dotfiles/agents/claude/settings.json ~/.claude/settings.json`. Merge by hand
  if the destination already has newer allows, and re-check the three non-travelling keys above.
- A live Claude Code session rewrites `~/.claude/settings.json` from its own in-memory state, so
  edit it with the CLI closed — or expect `model` to be reverted under you.
