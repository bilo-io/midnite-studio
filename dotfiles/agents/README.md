# Agent CLI settings snapshot

Machine-local command-allow / settings files as they existed on this MacBook on 2026-09-14. Restore by copying a file back onto the path in the **On this machine** column.

These are **user-global** configs (home directory / Application Support), not the project files already in this repo (`.claude/settings.json` is the graphify hook config).

## On this machine

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

## What was snapshotted here

| Copy in repo | Source |
|--------------|--------|
| `claude/settings.json` | `~/.claude/settings.json` (117 `permissions.allow` entries) |
| `claude/settings.local.json` | `~/.claude/settings.local.json` |
| `antigravity-cli/settings.json` | `~/.gemini/antigravity-cli/settings.json` |
| `cursor/cli-config.json` | `~/.cursor/cli-config.json` **minus** `authInfo`, `privacyCache`, `autoReviewAvailabilityCache`, `serverConfigCache` |

Not snapshotted (secrets / noise): `~/.claude.json` (oauth + machine IDs), `~/.cursor/mcp.json`, `~/.gemini/oauth_creds.json`, IDE `User/settings.json`.

## Notes

- **Agy** currently stores only two `command(...)` allows (`pnpm test`, `git status`) plus `"toolPermission": "always-proceed"`. Approvals you “always allow” should land in `permissions.allow` in that file; if they are not appearing, they are session-only.
- **Cursor CLI** allowlist on this machine is still tiny (`Shell(ls)`, `Shell(graphify)`). Cursor Desktop does not use this file for composer approvals.
- Restore example: `cp dotfiles/agents/claude/settings.json ~/.claude/settings.json` (merge by hand if the destination already has newer allows).
