# Phase 1 — Shared contracts + git-engine exec/parsers

Typed git reads with heavy unit coverage. No Electron anywhere in this phase.
See INITIAL_PLAN.md → "IPC contract", "Data model", "Git exec conventions".

## Deliverables

- [ ] `shared/src/domain/*.ts` — zod schemas + inferred types: `RepoDescriptor`, `Worktree`, `Ref`, `Commit`, `GraphRow`, `StatusEntry`, `StatusResult`, `WatchEvent`, `GitOpResult`
- [ ] `shared/src/ipc/channels.ts` — every `mgit:*` channel as a const (single module for main/preload/renderer)
- [ ] `shared/src/ipc/schemas.ts` — zod for every invoke payload/response + stream event
- [ ] `shared/src/ipc/bridge.ts` — `MidniteGitBridge` type + `declare global` for `window.midniteGit`
- [ ] `shared/src/keybindings.ts` — `CommandId` union + default keymap
- [ ] `git-engine/src/exec/git-exec.ts` — dugite wrapper `execGit(repoPath, args, opts)`; read env `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`; binary abstracted so a settings flag can later switch to system git
- [ ] `git-engine/src/exec/write-queue.ts` — per-repo promise-chain serialization (index.lock)
- [ ] Pure parsers (no I/O): `parsers/log-parser.ts` (`%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%D%x00%s%x00`, `-z`), `parsers/status-parser.ts` (`--porcelain=v2 -z --branch`, incl. `u` conflict lines + renames), `parsers/refs-parser.ts` (`for-each-ref` with `%(upstream:track)`, `%(worktreepath)`), `parsers/worktree-parser.ts` (`worktree list --porcelain`)
- [ ] `git-engine/src/commands/{log,status,refs,worktrees}.ts` composing exec + parsers
- [ ] `git-engine/scripts/smoke.ts` — `pnpm tsx scripts/smoke.ts <repo>` prints parsed log/status/refs/worktrees

## Verification

- [ ] Parser unit tests vs fixture strings: renames, conflicts, detached HEAD, `%D` decorations, empty repo
- [ ] Integration tests build throwaway repos in vitest temp dirs via dugite
- [ ] `smoke.ts` runs clean against `~/Dev/midnite` (a real repo with worktrees)
- [ ] `moon run git-engine:test shared:test` green
