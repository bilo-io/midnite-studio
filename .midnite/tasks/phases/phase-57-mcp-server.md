# Phase 57 — Midnite Studio speaks MCP

Every agent this app launches runs **blind**. [Phase 21](phase-21-agent-roster-and-terminal-identity.md)
gave the roster a terminal identity, [Phase 34](phase-34-agent-councils.md) gave it councils, and
[Phase 43](phase-43-workflows-mvp.md) gave it workflows — but a `claude`, `codex` or `opencode`
process started in one of those terminals still learns about the repository the only way any shell
process can: by running `git` and `gh` itself and re-deriving, from scratch, state that main has
*already* parsed, laid out and cached three feet away. It shells out for `git status` while
[`status-handlers.ts`](../../../packages/desktop/src/main/ipc/status-handlers.ts) holds the parsed
answer. It pages through `git log` while the lane layout for those same commits sits in git-engine.
It calls `gh pr list` while [`forge-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-handlers.ts)
has the PRs, their checks and their review state.

This phase closes that gap the way the ecosystem now expects it to be closed: **the app becomes an
MCP server**. Agents stop re-deriving and start *asking* — `repo.list`, `status.get`, `graph.log`,
`forge.checks` — over the Model Context Protocol, answered by the very services the renderer's IPC
handlers already call.

The architecture makes this cheaper than it sounds. [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts)
is 2,052 lines of zod payload schemas that already describe exactly these operations, and an MCP
tool definition is a name plus a JSON Schema for its input — which is `zod-to-json-schema` away from
what we have. And main already exposes every capability behind a service seam that
[`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) validates into; the MCP server calls
those services directly rather than round-tripping through `ipcMain`.

**Builds on.**
- [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — the zod payload
  schemas an MCP tool's input schema is derived from, not re-typed beside.
- [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — the house pattern for
  a single-source-of-truth registry (`COMMANDS`, with `COMMAND_IDS`/`DEFAULT_KEYMAP` derived). The
  tool registry copies its shape exactly.
- [`desktop/src/broker/`](../../../packages/desktop/src/broker/) — a working, tested Unix-socket
  server with a length-prefixed frame protocol, a build-fingerprinted socket name
  (`brokerSocketName` in [`broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts))
  and a staleness story. The MCP transport is the same trick with a different payload.
- [`desktop/src/main/fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts) — `joinWithin`
  and `resolveScopeRoot`, the existing answer to "this path must stay inside that root."
- [`desktop/src/main/claude-cli.ts`](../../../packages/desktop/src/main/claude-cli.ts) — the probe
  that already knows whether `claude` is installed and where, which is what `claude mcp add` needs.

**Scope guardrails.**
- **Read-only tools only.** No tool in this phase mutates a repository. Staging, committing and
  branch creation over MCP are real and wanted, but they need the write queue, the blast-radius
  confirm and a consent model that a read-only surface does not — see Decision 5.
- **Off by default, and visibly so.** A local socket that hands any process on the machine a
  parsed view of the user's repositories is a real widening of the app's attack surface. The
  server does not listen until a switch is turned on, and the switch is off on a fresh profile.
- **The shim is not an agent.** It speaks MCP stdio and forwards bytes. No model calls, no API
  keys, no `@anthropic-ai/sdk` — the app remains a *provider* of context, never a consumer of a
  model. (The one exception the roster already makes, `claude-cli.ts`, spawns a CLI; it does not
  hold a key.)
- **No new dependency in `shared`.** `shared` is zod-only by
  [`CLAUDE.md`](../../../CLAUDE.md)'s package boundary rule. `zod-to-json-schema` is a *desktop*
  dependency; `shared` exports the zod schemas and the tool registry, and `desktop` converts.
- **`git-engine` stays electron-free and MCP-free.** It gains nothing in this phase.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The tool contract, in `shared` (M)

One registry, in the house style of `COMMANDS` — every tool id, its title, its one-line description
(the text a model actually reads to decide whether to call it), and its zod input schema, in one
literal that everything else derives from.

- [ ] Add [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts): an `MCP_TOOLS`
      registry keyed by tool id, each entry `{ id, title, description, input: ZodTypeAny, readOnly: true }`.
- [ ] Derive `MCP_TOOL_IDS` and an `McpToolId` union from it, exactly as `COMMAND_IDS` derives from
      `COMMANDS` — never a hand-maintained second list.
- [ ] Reuse the existing payload schemas from
      [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) wherever a tool's input is the
      same shape as an existing IPC call's; only introduce a new schema where MCP genuinely needs a
      different one (a tool takes a repo *path*, where an IPC call often takes a repo id the agent
      has no way to know).
- [ ] Write tool descriptions **for a model, not for a changelog** — each says what the tool
      returns and when to prefer it over shelling out to `git`. This is the single highest-leverage
      text in the phase; a vague description means the agent runs `git status` anyway.
- [ ] Add the frame protocol types for the socket in
      [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) — a `McpRequest`/`McpResponse`
      pair carrying `{ id, tool, input }` and `{ id, ok, result | error }`, mirroring
      [`broker/protocol.ts`](../../../packages/desktop/src/broker/protocol.ts)'s `ControlMessage` discipline.
- [ ] Export it from [`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts).
- [ ] Vitest: every `MCP_TOOLS` entry has a non-empty description; ids are unique; the derived
      `MCP_TOOL_IDS` matches the registry keys.

### B — The server in main (M)

A Unix-socket listener that dispatches a tool call to the same service the matching IPC handler
calls. Not through `ipcMain` — that seam belongs to the renderer, and routing a local socket
through it would mean synthesising a fake sender.

- [ ] Add `packages/desktop/src/main/mcp/server.ts`: a `net.Server` on a socket in the app's
      `userData` dir, named by `mcpSocketName(appVersion, buildId, isPackaged)` — the same
      build-fingerprint scheme as `brokerSocketName`, and for the same reason (a reinstall must not
      leave a new shim talking to an old app).
- [ ] Reuse the length-prefixed framing from [`broker/protocol.ts`](../../../packages/desktop/src/broker/protocol.ts)
      rather than inventing newline-delimited JSON — the parse/backpressure edge cases are already
      solved and tested there.
- [ ] Add `packages/desktop/src/main/mcp/dispatch.ts`: one map from `McpToolId` to a handler
      function, each parsing its input with the registry's zod schema before doing anything —
      the same "validate at the boundary" discipline `handle.ts` documents, and for a boundary that
      is *less* trusted than the renderer, not more.
- [ ] A tool call never throws across the socket: errors serialise into the `{ ok: false, error }`
      arm, matching the `GitOpResult` envelope convention this repo enforces everywhere else.
- [ ] Lifecycle: the server starts only when the setting is on, stops when it is turned off, and
      closes on `before-quit`. Unlink a stale socket file on bind failure the way the broker does —
      order matters, a dead server's file outlives it.
- [ ] Cap concurrent connections and per-call payload size; a runaway agent must not be able to
      wedge main.
- [ ] Vitest (`server.test.ts`): a round trip over a real socket in a tmpdir; an unknown tool id
      returns the error arm rather than closing the connection; an oversized frame is rejected.

### C — The stdio shim (S)

The piece that makes any MCP client able to reach the app: a ~100-line node script that speaks MCP
over stdin/stdout and forwards each tool call to the socket.

- [ ] Add `packages/desktop/src/mcp-shim/index.ts`, bundled to a standalone script by
      [`bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) alongside the broker.
- [ ] Implement the MCP handshake (`initialize`, `tools/list`, `tools/call`) against
      `@modelcontextprotocol/sdk`, with `tools/list` served from the shared registry so the shim
      never carries its own copy of the tool names.
- [ ] When the app is not running or the socket is gone, answer `tools/call` with a clean
      "Midnite Studio is not running" error rather than hanging — an agent blocked on a dead socket
      is worse than one told to shell out.
- [ ] Emit nothing on stdout that is not an MCP frame. An MCP stdio server that logs to stdout
      corrupts its own protocol stream; every diagnostic goes to stderr.
- [ ] Vitest: the shim answers `tools/list` from the registry with the socket absent, and returns
      the not-running error for `tools/call`.

### D — The read-only tool set, v1 (M)

Eight tools chosen because each one replaces a command an agent demonstrably runs today, and each
one is *better* than the command it replaces — parsed, laid out, or already fetched.

- [ ] `repo.list` — the registered repositories, from [`repo-registry.ts`](../../../packages/desktop/src/main/repo-registry.ts).
      An agent in a terminal knows its `cwd` and nothing else; this is how it learns what else exists.
- [ ] `repo.current` — the repo and branch the app is focused on, which no shell command can answer.
- [ ] `status.get` — the parsed working tree: staged, unstaged, untracked, conflicted. Strictly
      better than `git status --porcelain` because the conflict states are already classified.
- [ ] `graph.log` — a page of laid-out `GraphRow`s, with lanes. This is the one an agent cannot
      reproduce cheaply at all; lane layout runs in main by design.
- [ ] `diff.file` — parsed hunks for one path, the same shape `<DiffView>` renders.
- [ ] `branch.list` — local and remote branches with ahead/behind, from the ref layer.
- [ ] `forge.pulls` — open PRs for the current repo, from the `gh` cache in
      [`forge/`](../../../packages/desktop/src/main/forge) — already fetched, so this costs no
      network round trip the app has not already paid.
- [ ] `forge.checks` — the check verdict for a branch head, the same source
      [`checks-verdict.ts`](../../../packages/app/src/features/repos/checks-verdict.ts) reads.
- [ ] Every tool takes an explicit `repoPath` and resolves it through the registry — a tool that
      implicitly acts on "the current repo" is a footgun when two windows are open on two repos.
- [ ] Vitest: each tool's handler against a scratch repo fixture, asserting the shape matches its
      declared output.

### E — Consent, scope and audit (S)

The switch, the boundary, and the record.

- [ ] Add an `mcpServer: { enabled: boolean }` block to the settings store, **default `false`**.
- [ ] Gate every tool's `repoPath` through [`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts)'s
      `joinWithin`/`resolveScopeRoot` — a path outside a registered repository root is refused,
      not clamped.
- [ ] Log every tool call through the one log seam ([`log-service.ts`](../../../packages/desktop/src/main/log-service.ts)):
      tool id, repo, outcome, duration. No payload bodies — a diff hunk in a log file is a leak.
- [ ] Set restrictive permissions (`0600`) on the socket file, and place it under `userData`
      rather than `/tmp`.
- [ ] Vitest: a `repoPath` outside every registered root is refused; the server refuses to bind
      while the setting is off.

### F — The Settings page and the status readout (S)

- [ ] Add `packages/app/src/features/settings/settings-pages/mcp-page.tsx` — the enable switch, the
      socket path, a copyable `claude mcp add midnite-studio <shim path>` line, and the tool list
      rendered from the shared registry (so the page cannot drift from what the server serves).
- [ ] Show the last N tool calls on the page — the cheapest possible answer to "is this thing
      actually being used, and by what?"
- [ ] Register the page in [`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx),
      beside [`agent-page.tsx`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx),
      whose subject it extends.
- [ ] A status indicator while the server is listening — reuse the existing status-bar idiom rather
      than a new chrome element.
- [ ] Icons come from `react-icons/lu`, per [`CLAUDE.md`](../../../CLAUDE.md); no `lucide-react`.
- [ ] Vitest/RTL: the page renders every tool in the registry; the switch is off on a fresh store.

---

## Files this phase touches

- [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) — **new.** Tool registry, derived ids, socket frame types.
- [`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts) — export the new module.
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — reused, not modified, wherever a tool input matches an existing payload.
- `packages/desktop/src/main/mcp/server.ts` — **new.** Socket listener, lifecycle, framing.
- `packages/desktop/src/main/mcp/dispatch.ts` — **new.** Tool id → service handler map.
- `packages/desktop/src/mcp-shim/index.ts` — **new.** The MCP stdio shim.
- [`packages/desktop/scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) — bundle the shim alongside the broker.
- [`packages/desktop/src/main/broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts) — crib `brokerSocketName`/`fingerprintFile`; extract if the copy is exact.
- [`packages/desktop/src/broker/protocol.ts`](../../../packages/desktop/src/broker/protocol.ts) — crib the length-prefixed framing.
- [`packages/desktop/src/main/fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts) — reused for the repo-root boundary.
- [`packages/desktop/src/main/log-service.ts`](../../../packages/desktop/src/main/log-service.ts) — the audit trail.
- [`packages/app/src/features/settings/settings-pages/mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx) — **new.**
- [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) — register the page.
- [`packages/desktop/package.json`](../../../packages/desktop/package.json) — `@modelcontextprotocol/sdk`, `zod-to-json-schema`.

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: `shared/src/mcp.ts` imports zod and nothing else; the shim and server live in `desktop`; `git-engine` is untouched; the renderer reaches none of it except through the existing bridge.
- [ ] `claude mcp add midnite-studio <shim>` followed by `claude` in the app's own terminal lists all eight tools, and a prompt like *"what's uncommitted here?"* answers from `status.get` rather than shelling out.
- [ ] With the setting **off**, the socket does not exist and the shim reports "not running" cleanly.
- [ ] Killing the app mid-session leaves the shim answering errors, not hanging; restarting the app restores service without restarting the agent.
- [ ] A `repoPath` pointing outside every registered repository is refused.
- [ ] `moon run desktop:dist`, install, and confirm the shim path in the packaged bundle is the one the Settings page prints.
- [ ] **Open, for a human:** run a real task end-to-end — ask an agent to summarise the branch's diff against `main` using only MCP tools, and confirm it never invokes `git`.

---

## Decisions / open questions

1. **Transport: Unix socket + stdio shim, not HTTP/SSE.** *Settled.* MCP's HTTP transport would
   mean a listening TCP port on the user's machine, an origin/auth story, and a second security
   surface. The socket is filesystem-permissioned for free, and the broker has already proved the
   pattern in this codebase — including the hard part, what happens when a rebuild replaces the
   binary under a live peer.

2. **Why not route through `ipcMain`?** *Settled.* `handle.ts`'s seam takes a renderer sender and,
   since [Phase 55](phase-55-multi-window-studio.md), sometimes resolves which *window* asked. An
   MCP call has no window. Dispatching to the underlying services directly keeps that seam honest
   and avoids a synthetic sender that would quietly break `handleFromSender`.

3. **Should `graph.log` return lanes?** *Recommendation: yes.* It is the one answer an agent cannot
   cheaply reproduce, and it is the clearest demonstration that this server offers something
   `git` does not. If the payload proves too large for a model's context, page it hard (default 50
   rows) rather than dropping the lanes.

4. **Does the shim need to be a separate process at all?** Yes, and it is worth being explicit:
   MCP clients spawn their server as a child process and talk stdio. The app is a long-lived GUI
   process that cannot be spawned per-agent. The shim is the adapter between those two lifetimes.

5. **Write tools.** *Deferred to a follow-up phase, deliberately.* `stage`, `commit`,
   `branch.create` are the obvious next step and the obvious next hazard: each must go through the
   per-repo write queue, each needs the blast-radius confirm this repo requires of destructive ops,
   and "an agent committed something while I wasn't looking" is a trust failure that would poison
   the feature. Ship the read-only half, live with it, then design consent properly.

6. **Extracting `brokerSocketName`.** If the MCP socket naming is a character-for-character copy,
   move it to a shared `desktop/src/main/socket-name.ts` rather than duplicating it — two copies of
   a build-fingerprint scheme will drift, and the failure mode (a shim talking to the wrong build)
   is silent.

7. **Do other agents get registration too?** `claude mcp add` is the documented path; `codex` and
   `opencode` have their own config formats. *Recommendation:* print the `claude` line in Settings
   and document the raw socket/shim path for the rest, rather than shipping three config writers
   in this phase.
