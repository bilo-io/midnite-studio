# Phase 1 — Shared contracts + git-engine exec/parsers

Typed git reads with heavy unit coverage. No Electron anywhere in this phase.
See INITIAL_PLAN.md → "IPC contract", "Data model", "Git exec conventions".

## Deliverables

- [x] `shared/src/domain/*.ts` — zod schemas + inferred types: `RepoDescriptor`, `Worktree`, `Ref`, `Commit`, `GraphRow`, `StatusEntry`, `StatusResult`, `WatchEvent`, `GitOpResult`
- [x] `shared/src/ipc/channels.ts` — every `mgit:*` channel as a const (single module for main/preload/renderer)
- [x] `shared/src/ipc/schemas.ts` — zod for every invoke payload/response + stream event
- [x] `shared/src/ipc/bridge.ts` — `MidniteGitBridge` type + `declare global` for `window.midniteGit`
- [x] `shared/src/keybindings.ts` — `CommandId` union + default keymap
- [x] `git-engine/src/exec/git-exec.ts` — dugite wrapper `execGit(repoPath, args, opts)`; read env `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`; binary abstracted so a settings flag can later switch to system git
- [x] `git-engine/src/exec/write-queue.ts` — per-repo promise-chain serialization (index.lock)
- [x] Pure parsers (no I/O): `parsers/log-parser.ts` (`%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%D%x00%s%x00`, `-z`), `parsers/status-parser.ts` (`--porcelain=v2 -z --branch`, incl. `u` conflict lines + renames), `parsers/refs-parser.ts` (`for-each-ref` with `%(upstream:track)`, `%(worktreepath)`), `parsers/worktree-parser.ts` (`worktree list --porcelain`)
- [x] `git-engine/src/commands/{log,status,refs,worktrees}.ts` composing exec + parsers
- [x] `git-engine/scripts/smoke.ts` — `pnpm tsx scripts/smoke.ts <repo>` prints parsed log/status/refs/worktrees

## Verification

- [x] Parser unit tests vs fixture strings: renames, conflicts, detached HEAD, `%D` decorations, empty repo
- [x] Integration tests build throwaway repos in vitest temp dirs via dugite
- [x] `smoke.ts` runs clean against `~/Dev/midnite` (a real repo with worktrees)
- [x] `moon run git-engine:test shared:test` green

## Findings while landing this phase

- **`git log -z --pretty=format:` SEPARATES records, it does not terminate them** — verified
  against real git: two commits produce 15 NULs, not 16. The final record therefore arrives
  unterminated and `streamLog` must flush it when the child exits, or every log silently drops
  its oldest commit.
- **Record framing must consume the separator explicitly, not count NUL-split tokens.** The
  token-count approach looks equivalent but corrupts the stream when a chunk boundary lands
  exactly between a record's last field and the following separator: the next chunk then starts
  with a leading NUL, every field shifts by one, and the misparsed records fail the sha check and
  vanish silently. `chunkRecords` scans for the 8th NUL instead. Covered by a regression test.
- **zod v3 `discriminatedUnion` needs distinct discriminator values per arm**, so `GitOpResult`'s
  two `ok: false` arms can't sit in one flat union. Nested as
  `union([success, discriminatedUnion('kind', [conflict, error])])` — same wire shape, same
  TypeScript narrowing.
- **`status --porcelain=v2 -z` spends TWO NUL tokens on a rename record.** A parser that treats
  the payload as one-token-per-record leaks the original path in as a phantom entry.
- **Annotated tags must be peeled** (`%(*objectname)`) or their badges join no graph row —
  `%(objectname)` is the tag object's sha, not the commit's.
- **`refs/remotes/origin/HEAD` is filtered out** — it is a symbolic pointer at the remote default
  branch and would double-badge whichever branch it names.
- **Temp repos need `realpath`**: macOS resolves `/var` → `/private/var` and git always reports
  the resolved path, so raw `mkdtemp` results fail every path assertion.
- Test repos set `commit.gpgsign=false` locally — a machine with global signing on would
  otherwise hang every integration test on a passphrase prompt.
