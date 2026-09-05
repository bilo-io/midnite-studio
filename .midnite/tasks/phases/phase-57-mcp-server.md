# Phase 57 — Midnite Studio speaks MCP

**Refined: x1** · 2026-09-05 · data model & IPC contract, functionality & edge cases, security & blast radius, testing & verification, file-map precision, per-item acceptance criteria

Every agent this app launches runs **blind**. [Phase 21](phase-21-agent-roster-and-terminal-identity.md)
gave the roster a terminal identity, [Phase 34](phase-34-agent-councils.md) gave it councils, and
[Phase 43](phase-43-workflows-mvp.md) gave it workflows — but a `claude`, `codex` or `opencode`
process started in one of those terminals still learns about the repository the only way any shell
process can: by running `git` and `gh` itself and re-deriving, from scratch, state that main has
*already* parsed, laid out and cached three feet away. It shells out for `git status` while
[`status-handlers.ts`](../../../packages/desktop/src/main/ipc/status-handlers.ts) holds the parsed
answer. It pages through `git log` while the lane layout for those same commits sits in git-engine.
It calls `gh pr list` while [`forge/gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts)
has the PRs, their checks and their review state.

This phase closes that gap the way the ecosystem now expects it to be closed: **the app becomes an
MCP server**. Agents stop re-deriving and start *asking* — `repo.list`, `status.get`, `graph.log`,
`forge.checks` — over the Model Context Protocol, answered by the very services the renderer's IPC
handlers already call.

**Where the cheapness actually is, stated honestly.** The first draft of this phase claimed the
*input* schemas in [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) come
for free. They do not, and the refinement pass proved it: nearly every request schema there extends
`RepoId` (`StatusGetRequest = RepoId.extend({ worktreePath: z.string().optional() })`, `schemas.ts:292`),
and a repo *id* is the one thing an agent in a shell cannot know. MCP tool inputs are therefore
**new schemas, keyed by filesystem path**, and the phase should not pretend otherwise. The reuse is
real but it is on the *other* side: the **response** shapes — `StatusResultSchema`, `GraphRow`,
`Ref`, the diff payloads — are already written, already exported, and are exactly what a tool
returns. And main already exposes every capability behind a service seam
([`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) validates into it); the MCP server
calls those services directly rather than round-tripping through `ipcMain`.

**Builds on.**
- [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — 2,052 lines of zod.
  The source of every tool's **output** schema; the source of almost no tool's input (above).
- [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — the house pattern for
  a single-source-of-truth registry (`COMMANDS`, with `COMMAND_IDS`/`DEFAULT_KEYMAP` derived). The
  tool registry copies its shape exactly.
- [`desktop/src/broker/`](../../../packages/desktop/src/broker/) — a working, tested Unix-socket
  server with a length-prefixed frame protocol (`PROTOCOL = 1`, `MAX_PAYLOAD_LENGTH = 16 * 1024 * 1024`,
  `encodeControl`, `createFrameDecoder` in [`broker/protocol.ts`](../../../packages/desktop/src/broker/protocol.ts)),
  a build-fingerprinted socket name (`brokerSocketName(appVersion, buildId, isPackaged)` at
  [`broker-client.ts:100`](../../../packages/desktop/src/main/broker-client.ts)), `chmodSync(path, 0o600)`
  already applied at [`broker/server.ts:432`](../../../packages/desktop/src/broker/server.ts), and a
  staleness story. The MCP transport is the same trick with a different payload.
- [`desktop/src/main/repo-store.ts`](../../../packages/desktop/src/main/repo-store.ts) — the house
  shape for main-side persisted state: `createRepoStore(directory) → { load, save }`, a versioned
  JSON file, **no `electron` import** so it is testable against a temp dir, with `repo-store.test.ts`
  beside it. The MCP enable flag copies this exactly (Decision 8).
- [`desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  `runProcess<T>(…)` with `SpawnFn`/`ProcessSink` seams, `DEFAULT_TIMEOUT_MS = 120_000`,
  `OUTPUT_TAIL_CAP = 200_000`. Already the tested way to manage a child process here.
- [`git-engine/src/exec/git-exec.ts:173`](../../../packages/git-engine/src/exec/git-exec.ts) —
  `resolveRepoRoot(path): Promise<string | null>`. This, not `fs-scope.ts`, is what maps an
  agent-supplied path to a trusted root (Decision 9).
- [`desktop/src/main/cli-path.ts`](../../../packages/desktop/src/main/cli-path.ts) and
  [`claude-cli.ts`](../../../packages/desktop/src/main/claude-cli.ts) — where `claude` is on disk,
  and whether it is installed. `claude-cli.ts` exports `getClaudeInfo(timeoutMs)` but **not** a bin
  path; that comes from `cli-path.ts`.

**Scope guardrails.**
- **Read-only tools only.** No tool in this phase mutates a repository. No tool enters
  `writeQueue.run` ([`write-queue.ts:36`](../../../packages/git-engine/src/exec/write-queue.ts));
  read paths never do, and that is the enforceable form of "read-only". Staging, committing and
  branch creation over MCP are real and wanted, but they need the queue, the blast-radius confirm
  and a consent model that a read-only surface does not — see Decision 5.
- **Off by default, and visibly so.** A local socket that hands any process on the machine a
  parsed view of the user's repositories is a real widening of the app's attack surface. The
  server does not listen until a switch is turned on, and the switch is off on a fresh profile.
- **The shim is not an agent.** It speaks MCP stdio and forwards bytes. No model calls, no API
  keys, no `@anthropic-ai/sdk` — the app remains a *provider* of context, never a consumer of a
  model. (The one exception the roster already makes, `claude-cli.ts`, spawns a CLI; it does not
  hold a key.)
- **No new dependency in `shared`.** `shared` is zod-only by
  [`CLAUDE.md`](../../../CLAUDE.md)'s package boundary rule, and `eslint.config.mjs:71-80` already
  denies it `@midnite/studio-*`. `zod-to-json-schema` is a *desktop* dependency; `shared` exports the
  zod schemas and the tool registry, and `desktop` converts.
- **`git-engine` stays electron-free and MCP-free.** It gains nothing in this phase.
- **No file sink for the audit log.** Main's one log seam
  ([`main/log.ts:14`](../../../packages/desktop/src/main/log.ts), `defaultLogger: Logger = (message) => console.warn(message)`)
  takes a single string and has no levels. This phase adds a bounded in-memory ring, not a logging
  subsystem — Decision 11.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The tool contract, in `shared` (M)

One registry, in the house style of `COMMANDS` — every tool id, its title, its one-line description
(the text a model actually reads to decide whether to call it), and its zod input schema, in one
literal that everything else derives from.

- [x] Add [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) exporting
      `export const MCP_TOOLS` as a `const` object literal keyed by tool id, each entry
      `{ id: McpToolId; title: string; description: string; input: z.ZodTypeAny; output: z.ZodTypeAny; readOnly: true }`.
      `output` is new in this refinement and is the point of the registry: it is what lets a vitest
      assert a handler's return shape without the handler and the doc disagreeing.
- [x] Derive the ids rather than listing them:
      `export const MCP_TOOL_IDS = Object.keys(MCP_TOOLS) as McpToolId[]` and
      `export type McpToolId = keyof typeof MCP_TOOLS`, exactly as `COMMAND_IDS` derives from
      `COMMANDS` in [`keybindings.ts`](../../../packages/shared/src/keybindings.ts). Never a
      hand-maintained second list.
- [x] **Inputs are new schemas keyed by path, not reused `RepoId` extensions.** Add
      `export const McpRepoTarget = z.object({ repoPath: z.string().min(1) })` and build each tool's
      input by extending it. State the reason in the docstring — an agent knows its `cwd`, never a
      `repoId` — so the next reader does not "fix" it back to `RepoId.extend`.
- [x] **Outputs are reused, verbatim.** Every tool's `output` is an existing export from
      [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) or
      [`domain/`](../../../packages/shared/src/domain/) — `StatusResultSchema`, `z.array(GraphRowSchema)`,
      `z.array(RefSchema)`, the file-diff payload — never a re-typed copy. If a tool needs a
      narrower shape, it is `.pick()`ed from the existing one.
- [x] Tool descriptions obey a stated rule, not an aspiration: **≤ 220 characters, one sentence,
      beginning with a verb, naming the shell command it replaces.** e.g. `status.get` →
      *"Returns the parsed working tree (staged, unstaged, untracked, conflicted) for a repository —
      use instead of `git status --porcelain`; conflict states are already classified."* The
      character cap and the "names its shell command" rule are both assertable, which is why they
      are the rule.
- [x] Add the frame protocol types in the same file: `McpRequest = { id: string; tool: string; input: unknown }`
      and `McpResponse = { id: string } & ({ ok: true; value: unknown } | { ok: false; kind: 'error' | 'not-found' | 'refused'; message: string })`.
      **This is deliberately shaped like `GitOpResultOf`** ([`domain/result.ts:64`](../../../packages/shared/src/domain/result.ts))
      — success payload under `value`, failure carrying a discriminating `kind` — and deliberately
      *not* `GitOpResult` itself, whose `kind: 'conflict'` arm is meaningless for a read-only tool.
      The first draft of this phase said `{ ok: false, error }`, which matches neither.
- [x] Add `export const MCP_PROTOCOL = 1` and `export const MCP_MAX_REQUEST_BYTES = 256 * 1024`,
      `export const MCP_MAX_RESPONSE_BYTES = 4 * 1024 * 1024`. These override
      `broker/protocol.ts`'s `MAX_PAYLOAD_LENGTH = 16 * 1024 * 1024`, which is sized for pty output
      and is three orders of magnitude past anything a model should be handed in one frame.
- [x] Export it from [`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts).
- [x] Vitest (`packages/shared/src/mcp.test.ts`): every entry's `description` is non-empty, ≤ 220
      characters and contains a backticked command name; `id` matches its key; `MCP_TOOL_IDS` equals
      `Object.keys(MCP_TOOLS)`; every `readOnly` is `true` (the guardrail, asserted).
- [x] Vitest: every entry's `output` is a zod schema that parses the corresponding fixture in
      [`git-engine/src/testing/`](../../../packages/git-engine/src/testing/) — the check that a tool's
      declared output and the service's real return cannot drift apart silently.
- [x] Vitest: `MCP_TOOLS` imports nothing but `zod` and sibling `shared` modules — the boundary rule
      asserted in the one file most likely to break it.

### B — The server in main (M)

A Unix-socket listener that dispatches a tool call to the same service the matching IPC handler
calls. Not through `ipcMain` — that seam belongs to the renderer, and routing a local socket
through it would mean synthesising a fake sender.

- [x] Add `packages/desktop/src/main/mcp/server.ts` exporting
      `export async function startMcpServer(opts: { userDataDir: string; appVersion: string; buildId: string; isPackaged: boolean; log?: Logger }): Promise<McpServerHandle>`
      and `export type McpServerHandle = { socketPath: string; close: () => Promise<void> }`.
      Named exports, not a class — matching `createRepoStore`/`createWindowsStore`.
- [x] Socket path is `join(userDataDir, 'mcp', mcpSocketName(appVersion, buildId, isPackaged))`,
      where `mcpSocketName` comes from the extracted
      `packages/desktop/src/main/socket-name.ts` (Decision 6) — the same build-fingerprint scheme as
      `brokerSocketName`, and for the same reason (a reinstall must not leave a new shim talking to
      an old app).
- [x] **Honour the 104-byte `sun_path` ceiling.** [`broker-client.ts:598`](../../../packages/desktop/src/main/broker-client.ts)
      already refuses to bind when `Buffer.byteLength(socketPath) >= 104` and falls back in-process;
      an MCP socket under the same `userData` root inherits the same risk with a longer directory
      name. `startMcpServer` returns a `{ ok: false }`-shaped refusal the Settings page renders as
      *"path too long for a Unix socket"* — it does **not** silently not-listen.
- [x] Reuse `createFrameDecoder()` from [`broker/protocol.ts`](../../../packages/desktop/src/broker/protocol.ts)
      rather than inventing newline-delimited JSON, passing `MCP_MAX_REQUEST_BYTES` as its cap.
      Note the behavioural difference and handle it: the broker's decoder **throws** on oversize
      (`protocol.ts:120-122`); the MCP server catches that throw, answers
      `{ ok: false, kind: 'refused', message: 'request too large' }` and **keeps the connection
      open**. An agent that overshoots once must not lose its session.
- [x] Add `packages/desktop/src/main/mcp/dispatch.ts` exporting
      `export const MCP_HANDLERS: { [K in McpToolId]: (input: z.output<(typeof MCP_TOOLS)[K]['input']>) => Promise<unknown> }`
      — a mapped type over the registry, so a tool added to `MCP_TOOLS` without a handler is a
      typecheck failure rather than a runtime 'unknown tool'.
- [x] Every handler parses its input with `MCP_TOOLS[id].input.safeParse` **before** touching the
      filesystem — the same validate-at-the-boundary discipline
      [`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) documents, for a boundary that
      is *less* trusted than the renderer, not more. A parse failure is
      `{ ok: false, kind: 'error', message: issue }`.
- [x] A tool call never throws across the socket: `dispatch` wraps every handler in try/catch and
      serialises into the `{ ok: false, kind, message }` arm defined in Theme A.
- [x] Register it the house way: `registerMcpServer()` in `main/mcp/index.ts`, called inline from
      [`main/index.ts`](../../../packages/desktop/src/main/index.ts)'s `app.whenReady()` block
      alongside `registerStatusHandlers()` et al (`index.ts:241-297`).
- [x] **`before-quit` is synchronous** ([`main/index.ts:500`](../../../packages/desktop/src/main/index.ts)
      says so) and `server.close()` is not. So on quit: call `server.close()` fire-and-forget, then
      `unlinkSync(socketPath)` inside a try/catch, and return. The OS reclaims the descriptor; the
      file is what must not outlive the process, and the sync unlink is the only part that has to
      complete.
- [x] Cap concurrency at **8 simultaneous connections**; the 9th is accepted, answered
      `{ ok: false, kind: 'refused' }` and destroyed. Cap responses at `MCP_MAX_RESPONSE_BYTES`;
      a handler whose serialised result exceeds it answers `kind: 'refused'` with the byte count in
      the message rather than truncating — a silently truncated diff is worse than a refused one.
- [x] Vitest (`packages/desktop/src/main/mcp/server.test.ts`, beside `broker/server.test.ts`):
      round trip over a real socket in `mkdtemp`; unknown tool id returns the error arm and the
      socket stays open; an oversized request returns `refused` and the socket stays open; the 9th
      connection is refused; `close()` removes the socket file.
- [x] Vitest: `statSync(socketPath).mode & 0o777 === 0o600`.

### C — The stdio shim (S)

The piece that makes any MCP client able to reach the app: a ~100-line node script that speaks MCP
over stdin/stdout and forwards each tool call to the socket.

- [x] Add `packages/desktop/src/mcp-shim/index.ts`, added to `bundle.mjs`'s outfile list —
      [`bundle.mjs:64`](../../../packages/desktop/scripts/bundle.mjs) is
      `const outfiles = ['main', 'preload', 'broker'].map(...)`; this becomes
      `['main', 'preload', 'broker', 'mcp-shim']`.
- [x] **`@modelcontextprotocol/sdk` is bundled in, not external.** `bundle.mjs`'s
      `external: ['electron', 'node-pty', 'dugite']` list stays as it is — those three are native or
      host-provided; the SDK is pure JS and the shim must be a single file an MCP client can spawn
      by path with no `node_modules` beside it.
- [x] The shim runs under **plain `node`**, not `ELECTRON_RUN_AS_NODE=1` like the broker: an MCP
      client spawns it, and it cannot assume Electron is on the client's PATH. Say so in the file
      header, because the broker sitting next to it does the opposite.
- [x] Implement `initialize`, `tools/list` and `tools/call` against the SDK's stdio server
      transport, with `tools/list` built from `MCP_TOOLS` via `zod-to-json-schema` so the shim never
      carries its own copy of the tool names.
- [x] When the socket is absent or `connect` yields `ENOENT`/`ECONNREFUSED`, answer `tools/call`
      with a clean *"Midnite Studio is not running, or its MCP server is off (Settings ▸ MCP)"*
      error within **2 seconds**, and answer `tools/list` from the registry anyway. An agent blocked
      on a dead socket is worse than one told to shell out.
- [x] **Reconnect, do not die.** The shim dials the socket per call rather than holding one
      connection, so quitting and relaunching the app restores service without the MCP client
      restarting the shim. This is the deliverable the first draft's verification line assumed and
      never listed.
- [x] Emit nothing on stdout that is not an MCP frame — every diagnostic goes to `process.stderr`.
      An MCP stdio server that logs to stdout corrupts its own protocol stream.
- [x] Vitest (`packages/desktop/src/mcp-shim/shim.test.ts`): `tools/list` answers from the registry
      with the socket absent; `tools/call` returns the not-running error inside 2s; and a spy on
      `process.stdout.write` sees only well-formed frames across a session that also logs to stderr.

### D — The read-only tool set, v1 (M)

Eight tools chosen because each one replaces a command an agent demonstrably runs today, and each
one is *better* than the command it replaces — parsed, laid out, or already fetched. Every handler
below is named with the real function it calls.

- [x] `repo.list` — the registered repositories. Calls
      [`repo-registry.ts:145`](../../../packages/desktop/src/main/repo-registry.ts) `listRepos(): Promise<RepoDescriptor[]>`.
      An agent in a terminal knows its `cwd` and nothing else; this is how it learns what else exists.
- [x] `repo.resolve` — **replaces the first draft's `repo.current`.** Takes `{ repoPath }` (the
      agent's `cwd`), calls [`git-exec.ts:173`](../../../packages/git-engine/src/exec/git-exec.ts)
      `resolveRepoRoot(path)`, and returns the containing registered repo plus its current branch
      from [`refs.ts:34`](../../../packages/git-engine/src/commands/refs.ts) `currentBranch(repoPath)`.
      `repo.current` was cut because "the repo the app is focused on" has no main-side answer since
      [Phase 55](phase-55-multi-window-studio.md) — see Decision 10.
- [x] `status.get` — calls [`commands/status.ts:20`](../../../packages/git-engine/src/commands/status.ts)
      `getStatus(worktreePath: string): Promise<StatusResult>`. Output schema `StatusResultSchema`.
      Strictly better than `git status --porcelain` because the conflict states are already classified.
- [x] `graph.log` — calls [`commands/log.ts:92`](../../../packages/git-engine/src/commands/log.ts)
      `readLog(repoPath, options)` then [`layout/lane-layout.ts:190`](../../../packages/git-engine/src/layout/lane-layout.ts)
      `layoutGraph(commits): GraphRow[]`. **Default 50 rows, hard maximum 200**, `limit` clamped
      server-side rather than trusted. This is the one an agent cannot reproduce cheaply at all;
      lane layout runs in main by design.
- [x] `diff.file` — calls [`commands/diff.ts:67`](../../../packages/git-engine/src/commands/diff.ts)
      `readFileDiff(...)`, the same shape `<DiffView>` renders. A binary or over-cap diff returns
      `{ ok: false, kind: 'refused' }` with the reason, never a truncated hunk list.
- [x] `branch.list` — calls [`commands/refs.ts:14`](../../../packages/git-engine/src/commands/refs.ts)
      `listRefs(repoPath): Promise<Ref[]>` and filters to branches. Ahead/behind is already a field
      on `Ref` ([`domain/ref.ts:10`](../../../packages/shared/src/domain/ref.ts)), parsed from
      `FOR_EACH_REF_FORMAT` — so this is a filter, not new work.
- [x] `forge.pulls` — calls `listPulls(forge, { limit, state })` in
      [`forge/gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts). It takes a `Forge`
      (`{ host, owner, repo, kind }`, [`domain/remote.ts:24`](../../../packages/shared/src/domain/remote.ts)),
      **not** a path — so the tool resolves `repoPath` → remote → `Forge` first, and returns
      `kind: 'not-found'` when the repo has no recognised forge remote. Note in the item that the
      pull *diff* is deliberately uncached (`gh-cli.ts:331`), so this tool does not offer one.
- [x] `forge.checks` — calls `listRuns(...)` (`gh-cli.ts:101`) and `logVerdict(...)` (`gh-cli.ts:700`)
      in main. **Not** `packages/app/src/features/repos/checks-verdict.ts`, which the first draft
      named: that file is in the *renderer*, and main importing renderer modules is a pattern used
      nowhere in this repo. If the verdict logic is genuinely shared, lift it to `shared` in this
      theme rather than reaching across.
- [x] The `gh` caching claim, corrected: there is **no `gh-cache.ts`**. The caches are inline in
      `gh-cli.ts` (`workflowCache`, `WORKFLOW_CACHE_MS`, `remember(...)`, `clearForgeRunCache()` at
      `:590`). "Costs no network round trip the app has not already paid" holds only for a warm
      cache — the tool description must not promise otherwise.
- [x] Every tool takes an explicit `repoPath` and resolves it through `resolveRepoRoot` + the
      registry — a tool that implicitly acts on "the current repo" is a footgun when two windows are
      open on two repos.
- [x] No handler calls `writeQueue.run`. Vitest asserts it: a spy on
      [`write-queue.ts`](../../../packages/git-engine/src/exec/write-queue.ts)'s exported
      `writeQueue.run` records zero calls across the whole tool set. That is the read-only guardrail
      made enforceable rather than remembered.
- [x] Vitest (`packages/desktop/src/main/mcp/tools.test.ts`): each tool's handler against a scratch
      repo built by [`git-engine/src/testing/`](../../../packages/git-engine/src/testing/), asserting
      `MCP_TOOLS[id].output.safeParse(result).success === true`.
- [x] Vitest edge cases, named: an empty repository (no commits) for `graph.log`; a detached HEAD for
      `repo.resolve`; a path inside a worktree rather than the main checkout for `status.get`; a
      repo with no remote for `forge.pulls`; a binary file for `diff.file`.

### E — Consent, scope and audit (M)

The switch, the boundary, and the record. Re-tagged **S → M** in this refinement: the enable flag
turned out to need a main-side store and two IPC channels, which the first draft did not see.

- [ ] **The enable flag lives in main, not in the renderer's `localStorage`.** Add
      `packages/desktop/src/main/mcp-store.ts` — `createMcpStore(directory) → { load(): Promise<McpSettings>; save(s: McpSettings): Promise<void> }`
      over `mcp.json` with `{ version: 1, enabled: false }`, copying
      [`repo-store.ts`](../../../packages/desktop/src/main/repo-store.ts) line for line including its
      injected-directory / no-`electron` shape. The server must know its own setting at boot, before
      any window exists; a value in `useUiStore`'s persisted `localStorage` is not readable by main.
- [ ] Add two channels to [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts):
      `mcpGet: 'mstudio:mcp:get'` and `mcpSet: 'mstudio:mcp:set'`, following the file's own
      `mstudio:<domain>:<verb>` rule and its "a channel string is never written as a literal anywhere
      else" header. Schemas in `ipc/schemas.ts`, bridge entries in `ipc/bridge.ts`, handlers in a new
      `main/ipc/mcp-handlers.ts` registered from `main/index.ts`.
- [ ] Turning the switch on calls `startMcpServer`; off calls `handle.close()`. Both persist through
      `mcpStore.save` **before** acting, so a crash between the two leaves the app off rather than
      listening with the UI saying otherwise.
- [ ] **Gate `repoPath` through `resolveRepoRoot` + `listRepos`, not `fs-scope.ts`.** The first
      draft named `joinWithin`/`resolveScopeRoot`; neither can do this job —
      [`fs-scope.ts:23`](../../../packages/desktop/src/main/fs-scope.ts) `joinWithin` *refuses
      absolute paths outright*, and `resolveScopeRoot` takes a `repoId`. The rule is: resolve the
      supplied path to its repo root, and refuse unless that root is `listRepos()`-registered.
      Refuse, never clamp.
- [ ] Symlink and TOCTOU rule, stated: resolve with `realpath` before the registry comparison, and
      compare resolved-root to resolved-root. A path whose root resolves outside every registered
      repo is `{ ok: false, kind: 'refused' }`.
- [ ] Audit: a bounded in-memory ring of the last **50** calls in `main/mcp/audit.ts` —
      `{ at: number; tool: McpToolId; repoPath: string; ok: boolean; ms: number }` — plus one line
      per call through [`main/log.ts`](../../../packages/desktop/src/main/log.ts)'s `defaultLogger`
      formatted `[mcp] <tool> <ok|err> <ms>ms <repoRoot>`. **No payload bodies and no full paths
      beyond the repo root** — a diff hunk or a home-directory path in a log file is a leak.
- [ ] Socket permissions `0o600` and placement under `userData` — both are already the broker's
      behaviour ([`broker/server.ts:432`](../../../packages/desktop/src/broker/server.ts),
      [`broker-client.ts:144`](../../../packages/desktop/src/main/broker-client.ts)). This item is
      *"apply the existing pattern"*, not *"decide"*; the acceptance criterion is the `statSync` mode
      assertion in Theme B.
- [ ] Vitest (`mcp-store.test.ts`, beside `repo-store.test.ts`): a fresh directory loads
      `{ enabled: false }`; a corrupt `mcp.json` loads `{ enabled: false }` rather than throwing, per
      `repo-store.ts`'s own precedent.
- [ ] Vitest: `startMcpServer` refuses to bind while `enabled` is false; a `repoPath` outside every
      registered root is refused; a symlink pointing into an unregistered repo is refused.

### F — The Settings page and the status readout (S)

- [ ] Add `packages/app/src/features/settings/settings-pages/mcp-page.tsx`, built from `<Accordion>`
      and `<Field>` in [`settings-pages/controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx),
      copying [`git-safety-page.tsx`](../../../packages/app/src/features/settings/settings-pages/git-safety-page.tsx)
      — the house precedent for a default-off switch with real blast radius.
- [ ] **Three registration points, not one.** Add `'mcp'` to the `SettingsPageId` union
      ([`ui-store.ts:139`](../../../packages/app/src/store/ui-store.ts)), a row to the
      `SETTINGS_PAGES` array (`ui-store.ts:181`), **and** an entry in the `PAGES` record in
      [`settings-view.tsx:38-54`](../../../packages/app/src/features/settings/settings-view.tsx). The
      first draft named only the third, which would ship a page with no way to reach it.
- [ ] The switch reads and writes through the new `mcp.get`/`mcp.set` bridge calls — **not** through
      `useUiStore`. No `PersistedUi` key, no `partialize` entry, no `version: 8 → 9` migration:
      main owns this setting (Decision 8), and putting a shadow copy in `localStorage` is exactly the
      drift the store's own `PersistedUi` docstring warns about.
- [ ] Render the socket path and a copyable `claude mcp add midnite-studio -- node <shim path>` line,
      with the shim path taken from the same resolution the packaged build uses so the printed path
      is the real one.
- [ ] Render the tool list from `MCP_TOOLS` — id, title, description — so the page cannot drift from
      what the server serves.
- [ ] Show the last 50 tool calls from Theme E's ring, pulled on an interval while the page is open
      via a `mcpCalls: 'mstudio:mcp:calls'` channel. **Pull, not push**: an event channel for a
      diagnostics list that only exists while one settings page is open would be a subscription to
      manage for no benefit.
- [ ] A listening indicator in [`features/status-bar/`](../../../packages/app/src/features/status-bar/),
      reusing the existing status-bar item idiom rather than a new chrome element, visible only while
      the server is on.
- [ ] Vitest/RTL (`mcp-page.test.tsx`, in the pattern of
      [`workflows-page.test.tsx`](../../../packages/app/src/features/settings/settings-pages/workflows-page.test.tsx)):
      the page renders one row per `MCP_TOOLS` entry; the switch reflects a mocked `mcp.get`; toggling
      calls `mcp.set` with `{ enabled: true }`; the call list renders an empty state with no calls.
- [ ] Vitest: `'mcp'` is present in all three of `SettingsPageId`, `SETTINGS_PAGES` and
      `settings-view.tsx`'s `PAGES` — the three-way registration asserted, since missing one is
      silent.

---

## Files this phase touches

| File | What |
|---|---|
| [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) | **new** — `MCP_TOOLS`, `McpToolId`, `McpRequest`/`McpResponse`, the byte caps |
| `packages/shared/src/mcp.test.ts` | **new** — description rules, id derivation, output-schema fixtures |
| [`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts) | export the new module |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | `mcpGet`, `mcpSet`, `mcpCalls` |
| [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) | request/response schemas for those three; **reused unchanged** as every tool's `output` |
| [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | the `mcp` bridge namespace |
| [`packages/shared/src/domain/result.ts`](../../../packages/shared/src/domain/result.ts) | (**unchanged**) — `GitOpResultOf` is the shape `McpResponse` mirrors, not extends |
| `packages/desktop/src/main/mcp/server.ts` | **new** — `startMcpServer`, lifecycle, framing, caps |
| `packages/desktop/src/main/mcp/dispatch.ts` | **new** — `MCP_HANDLERS`, the mapped type over the registry |
| `packages/desktop/src/main/mcp/audit.ts` | **new** — the 50-entry ring |
| `packages/desktop/src/main/mcp/index.ts` | **new** — `registerMcpServer()` |
| `packages/desktop/src/main/mcp/server.test.ts`, `tools.test.ts` | **new** |
| `packages/desktop/src/main/mcp-store.ts` + `mcp-store.test.ts` | **new** — the enable flag, `repo-store.ts`'s shape |
| `packages/desktop/src/main/socket-name.ts` | **new** — `brokerSocketName`/`mcpSocketName`/`fingerprintFile` + the 104-byte guard, extracted (Decision 6) |
| `packages/desktop/src/main/ipc/mcp-handlers.ts` | **new** — `registerMcpHandlers()` |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) | register the handlers and the server; the `before-quit` sync unlink |
| [`packages/desktop/src/main/broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts) | re-export from `socket-name.ts`; behaviour unchanged |
| [`packages/desktop/src/broker/protocol.ts`](../../../packages/desktop/src/broker/protocol.ts) | (**unchanged**) — `createFrameDecoder` is reused with a smaller cap |
| [`packages/desktop/src/main/forge/gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts) | reused — `listPulls`, `listRuns`, `logVerdict`. **This, not `features/repos/checks-verdict.ts`** |
| [`packages/desktop/src/main/repo-registry.ts`](../../../packages/desktop/src/main/repo-registry.ts) | reused — `listRepos`, `resolveWorkdir` |
| [`packages/desktop/src/main/fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts) | (**deliberately unused**) — `joinWithin` refuses absolute paths; see Decision 9 |
| [`packages/desktop/src/main/log.ts`](../../../packages/desktop/src/main/log.ts) | the one log seam — `defaultLogger`, one string per call |
| `packages/desktop/src/mcp-shim/index.ts` + `shim.test.ts` | **new** — the MCP stdio shim |
| [`packages/desktop/scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) | add `'mcp-shim'` to `outfiles`; `external` list unchanged |
| `packages/app/src/features/settings/settings-pages/mcp-page.tsx` + `mcp-page.test.tsx` | **new** |
| [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) | the `PAGES` record entry |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | `SettingsPageId` + `SETTINGS_PAGES` only — **no** `PersistedUi` key, **no** version bump |
| [`packages/app/src/features/status-bar/`](../../../packages/app/src/features/status-bar/) | the listening indicator |
| [`packages/desktop/package.json`](../../../packages/desktop/package.json) | `@modelcontextprotocol/sdk`, `zod-to-json-schema` — both genuinely new; current runtime deps are exactly `dugite`, `electron-updater`, `node-pty`, `zod` |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: `shared/src/mcp.ts` imports zod and sibling `shared` modules only
      (asserted by its own vitest, since `eslint.config.mjs` has **no** `packages/desktop/src/**`
      block and cannot enforce the desktop half); `git-engine` untouched; the renderer reaches none
      of it except through the new bridge namespace.
- [ ] Every `MCP_TOOLS` description is ≤ 220 characters and names the command it replaces.
- [ ] Every tool's real return value parses against its declared `output` schema.
- [ ] No tool handler enters `writeQueue.run` — asserted by spy, across the whole tool set.
- [ ] `claude mcp add midnite-studio -- node <shim>` followed by `claude` in the app's own terminal
      lists all eight tools, and a prompt like *"what's uncommitted here?"* answers from `status.get`
      rather than shelling out.
- [ ] With the setting **off**, the socket file does not exist and the shim reports "not running"
      within 2 seconds.
- [ ] Quitting the app mid-session leaves the shim answering errors, not hanging; relaunching
      restores service **without restarting the agent** — the per-call dial in Theme C is what makes
      this true.
- [ ] `statSync(socketPath).mode & 0o777 === 0o600`.
- [ ] A `repoPath` outside every registered repository is refused; so is a symlink into one.
- [ ] A request over 256 kB is refused and the connection survives; a 9th connection is refused.
- [ ] The audit ring holds tool id, repo root, outcome and duration — and **no** payload body and no
      path below the repo root. Check the emitted `[mcp]` lines by eye once.
- [ ] The Settings page is reachable: `'mcp'` resolves in all three registration points, and the
      printed shim path is the one that exists after `moon run desktop:dist` + install.
- [ ] **Open, for a human:** run a real task end-to-end — ask an agent to summarise the branch's diff
      against `main` using only MCP tools, and confirm it never invokes `git`.

---

## Not in this phase

- **Write tools.** `stage`, `commit`, `branch.create` — Decision 5. Each needs the per-repo write
  queue, the blast-radius confirm, and a consent model a read-only surface does not have.
- **A file sink or log levels for main.** Decision 11. `main/log.ts` stays one string per call.
- **`codex` / `opencode` config writers.** Decision 7 — the raw socket and shim path are documented
  instead.
- **Caching a pull's diff.** `gh-cli.ts:331` deliberately does not, and this phase does not change
  that decision from the outside.
- **`repo.current`.** Cut — Decision 10.

---

## Decisions / open questions

1. **Resolved — transport is a Unix socket plus a stdio shim, not HTTP/SSE.** MCP's HTTP transport
   would mean a listening TCP port, an origin/auth story, and a second security surface. The socket
   is filesystem-permissioned for free, and the broker has already proved the pattern here —
   including the hard part, what happens when a rebuild replaces the binary under a live peer.

2. **Resolved — do not route through `ipcMain`.** [`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts)'s
   seam takes a renderer sender, and `handleFromSender` calls `resolveWindow(event.sender)` — since
   [Phase 55](phase-55-multi-window-studio.md) it sometimes resolves *which window* asked. An MCP
   call has no window. Dispatching to the underlying services directly keeps that seam honest and
   avoids a synthetic sender that would quietly break `handleFromSender`.

3. **Resolved — `graph.log` returns lanes, paged hard.** It is the one answer an agent cannot
   cheaply reproduce, and the clearest demonstration that this server offers something `git` does
   not. Default 50 rows, hard maximum 200, clamped server-side. Paging is the answer to context
   size; dropping the lanes would remove the reason to call it.

4. **Resolved — the shim is a separate process, necessarily.** MCP clients spawn their server as a
   child and talk stdio. The app is a long-lived GUI process that cannot be spawned per-agent. The
   shim is the adapter between those two lifetimes.

5. **Resolved — write tools are deferred to a follow-up phase, deliberately.** `stage`, `commit`,
   `branch.create` are the obvious next step and the obvious next hazard. "An agent committed
   something while I wasn't looking" is a trust failure that would poison the feature. Ship the
   read-only half, live with it, then design consent properly.

6. **Resolved — extract the socket naming to `main/socket-name.ts`.** It is not only
   `brokerSocketName(appVersion, buildId, isPackaged)` and `fingerprintFile(path)` that would be
   duplicated but the **104-byte `sun_path` guard** at `broker-client.ts:598` — and *that* is the
   copy whose drift is silent and fatal. `broker-client.ts` re-exports from the new module so its
   own behaviour is unchanged.

7. **Resolved — only `claude` gets a generated registration line.** `claude mcp add` is the
   documented path; `codex` and `opencode` have their own config formats and shipping three config
   writers here would triple the surface for a line of text. Settings prints the `claude` command
   and the raw socket/shim paths.

8. **Resolved — the enable flag is main-side state, in `main/mcp-store.ts`.** The server must know
   whether to listen at `app.whenReady()`, before any renderer exists, and `useUiStore` persists to
   the renderer's `localStorage` where main cannot read it. `repo-store.ts` is the exact precedent —
   a versioned JSON file under `userData`, `electron`-free, temp-dir testable. The Settings page
   reaches it over `mcp.get`/`mcp.set` like any other main-owned state, and keeps **no** shadow copy
   in `PersistedUi`.

9. **Resolved — path scoping uses `resolveRepoRoot` + `listRepos`, not `fs-scope.ts`.** The first
   draft named `joinWithin`/`resolveScopeRoot` and neither can do it: `joinWithin(root, relPath)`
   returns `null` for any absolute `relPath` (`fs-scope.ts:23`), and `resolveScopeRoot` takes a
   `repoId`, which is the one identifier an agent cannot have. The rule is resolve-then-compare
   against the registry, with `realpath` on both sides.

10. **Resolved — `repo.current` is cut and replaced by `repo.resolve`.** "The repo the app is
    focused on" has no main-side answer: `selectedRepoId` is renderer state in `useUiStore`, and
    since [Phase 55](phase-55-multi-window-studio.md) there may be several windows with several
    answers. `repo.resolve(cwd)` is better anyway — it is the question the agent actually has, and
    it needs no cross-process notion of focus.

11. **Open — does the audit ring ever reach disk?** In-memory, 50 entries, gone on quit is what this
    phase ships. *Recommendation:* leave it there. A persistent audit trail implies levels,
    rotation and a retention answer, and belongs to whatever phase gives `main/log.ts` structure —
    one sink, designed once, rather than an MCP-shaped log file nothing else writes to.

12. **Open — should `forge.checks`' verdict logic move to `shared`?** `checksVerdict` lives in
    `packages/app/src/features/repos/checks-verdict.ts` and main cannot import it. *Recommendation:*
    lift it to `shared` as part of Theme D if it is pure; if it turns out to depend on renderer
    types, compute the verdict in main from `listRuns` and accept two implementations, with a vitest
    asserting they agree on a shared fixture.
