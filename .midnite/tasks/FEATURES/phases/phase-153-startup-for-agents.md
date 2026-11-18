# Phase 153 — Startup for agents

Planned 2026-11-18 · grounded against `main` at `2f02132de` (Phase 152 planned, not built).

Startup becomes something an agent can work with, and it writes its own investor update. The Startup app serves
`startup_*` MCP tools from its own process. The one `midnite` stdio shim joins every running suite app's socket, so
agent configs do not change. A new **Updates** view drafts a monthly investor update with the user's chosen model
(a CLI agent or Ollama), keeps each month's update with history, and copies, exports or opens it as an email draft.

> **Builds on.**
> - **Phase 152 (Projections ↔ Runway)**: [`phase-152-projections-runway-bridge.md`](phase-152-projections-runway-bridge.md).
>   This phase assumes workspace **v3** (catalog, `moneyCurrency`, `sendFleetProjectionToRunway`) and bumps to **v4**.
>   **Do not start Theme D before Phase 152 Theme A has merged.** Themes A and B do not depend on 152.
> - **MCP today** (one server, Studio's):
>   - [`packages/desktop/src/main/mcp/server.ts:82,116`](../../../packages/desktop/src/main/mcp/server.ts) — the socket is
>     `<userData>/mcp/<mcpSocketName(appVersion, buildId, isPackaged)>`, served by
>     [`startMcpSocketServer`](../../../packages/runtime/src/mcp/socket-server.ts) (`:51`, options `{ socketPath, dispatch:
>     ScopedDispatch, log?, requireToken?, onCall? }`; it knows nothing about tools).
>   - [`packages/desktop/src/mcp-shim/socket-resolve.ts:17`](../../../packages/desktop/src/mcp-shim/socket-resolve.ts)
>     `resolveMcpSocketPath(userDataDir)` scans `<userData>/mcp/*.sock`.
>   - [`mcp-shim/user-data-dir.ts:21`](../../../packages/desktop/src/mcp-shim/user-data-dir.ts)
>     `resolveUserDataDir(appName = 'Midnite Studio', …)`. The shim only knows Studio.
>   - Tool definitions: `MCP_TOOLS` in [`shared/src/mcp.ts:397`](../../../packages/shared/src/mcp.ts) (`McpToolEntry
>     { id, title, description, input, output, readOnly }`, `:237`; the description rule at `:381` is "≤ 220 chars, one
>     sentence, starts with a verb", asserted in `mcp.test.ts`).
>   - Handlers: `MCP_HANDLERS` in [`desktop/src/main/mcp/dispatch.ts:147`](../../../packages/desktop/src/main/mcp/dispatch.ts),
>     an exhaustive map over `McpToolId`.
>   - Ownership: [`shared/src/mcp-tool-owners.ts`](../../../packages/shared/src/mcp-tool-owners.ts) — `mcpToolOwner(id,
>     manifests)` reads a `FeatureManifest`'s `owner` + `mcpTools`. `'startup'` is already a `PlacementAppId`.
>   - Consent precedent: `getMcpAllowGames()` gating the game tools (`desktop/src/main/mcp/game-tools.ts`).
>   - Per-run servers precedent: [`runtime/src/agent-run/run-server.ts:30`](../../../packages/runtime/src/agent-run/run-server.ts)
>     (`createRunServers`), [`host.ts:14,37`](../../../packages/runtime/src/agent-run/host.ts) (`ScopedDispatch`, `IterativeHost`).
> - **Headless text today** (Studio only):
>   - [`desktop/src/main/ai/improve-field.ts:139`](../../../packages/desktop/src/main/ai/improve-field.ts) —
>     `runHeadlessText({ prompt, agentId?, repoPath?, ollamaModel?, modelArgs, what }, deps, timeoutMs):
>     Promise<GitOpResult<{ text }>>`. It imports desktop's `process-runner` and `terminal-service.listAgents`.
>   - Its callers [`commit-message.ts`](../../../packages/desktop/src/main/ai/commit-message.ts) and
>     [`doc-edit.ts`](../../../packages/desktop/src/main/ai/doc-edit.ts) set the pattern: build the prompt → run →
>     clean or unfence → envelope; review before write.
>   - Ollama: [`features/models/main/ollama-headless.ts:21`](../../../packages/features/models/main/ollama-headless.ts)
>     `runOllamaPrompt(model, prompt, timeoutMs, deps?)`.
>   - CLI resolution: [`shared/src/agent-invocation.ts:155`](../../../packages/shared/src/agent-invocation.ts) `resolveHeadlessAgent(roster, agentId)`.
> - **Startup host**: [`apps/startup/main/index.ts`](../../../apps/startup/main/index.ts) and
>   [`host.ts`](../../../apps/startup/main/host.ts) (`StartupHostElectron`, `pdf?: InvoicePdfPort`), plus the module's
>   [`main/service.ts`](../../../packages/modules/startup/main/service.ts) (`handleStartupRequest`).

> **Scope guardrails.**
> - No MCP write tool touches invoices, vendors, contracts or the ledger, because those post journal entries.
> - No sending of email: `mailto:` only.
> - No sharing the update anywhere.
> - The shim's merge is additive: Studio's own tools, socket and token scheme do not change, and a shim with only
>   Studio running behaves exactly as today.
> - Moving `runHeadlessText` must not change commit-message or doc-edit behaviour.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_Ask your agent how the company is doing, and get the investor update written for you._ Agents read the runway,
milestones and projections, and can make the small, safe changes. The app drafts the monthly update in the user's
own model and keeps the history. Planned 2026-11-18; build order **A ‖ B**, then **C**, then **D** (after Phase 152
A), then **E**, then **F**.

**Theme A — Shared headless text in the runtime.** ✅ `runHeadlessText` now lives in `packages/runtime/src/ai/headless-text.ts` behind process, roster and Ollama ports; Studio's wrapper maps it back to `GitOpResult` with unchanged behaviour, so Startup can run a prompt.

**Theme B — Per-app MCP sockets and a joining shim.** ✅ `startAppMcpServer` serves a suite app's tools on its own tokened socket; the `midnite` shim joins every live suite socket, lists the union and routes each call to its owner, byte-identical with only Studio running.

**Theme C — `startup_*` tools.** ✅ Eight tools (five reads, three safe writes) are defined in `shared`, owned by a `startup` manifest and served by Startup's own socket through `startupMcpDispatch` over `handleStartupRequest`, so an agent's write goes through the same queue as the window's. Two consent switches in Settings ▸ Agents, off by default and kept outside the workspace, decide what `tools/list` offers; Studio's own list leaves the tools out, so they appear only while Startup runs.

**Theme D — Investor updates: data and drafting.** ✅ Workspace v4 adds `investorUpdates` (v3 files migrate with an empty list), and five ops (`upsert`/`removeInvestorUpdate`, `draftInvestorUpdate`, `exportInvestorUpdateMd`/`Pdf`) join the bridge; a draft returns markdown for review and never saves, and a second update for the same month is refused. `main/investor-update.ts` gathers pre-formatted facts (book cash and burn when a book is linked, else modelled; milestones by month; linked fleet projections), builds the fixed-section prompt and unfences the reply. Startup runs it through the runtime's `runHeadlessText` over new Node-only ports (`createHeadlessTextPorts`: PATH probe of `claude`/`codex`/`agy`, direct Ollama HTTP, 180 s), with no `features/models` import. Settings ▸ AI picks the model (default Claude, stored in `ai-settings.json` beside the consent file, outside the workspace) and has a Test button. Drift: `formatMoney` was in the renderer, so it moved to shared (152 E did the same); `modelArgsFor` was already shared, and drafts use the CLI's own default model. The tick on the Tests item was false when the theme started and is now true.

**Theme E — Updates view.** ◻ A rail view listing updates by month, with a markdown editor and preview, Draft with
review-before-save, Copy, Save as .md, Save as PDF and Email draft.

**Theme F — Agent skill and verification.** ◻ A `midnite-startup-agent` skill doc, vitest across shim, tools,
drafting and view, and one e2e for draft → accept → export.

## Build order

1. **A ‖ B** — disjoint: A is `runtime/src/ai/**` plus Studio's `desktop/src/main/ai/**`; B is
   `runtime/src/mcp/**` plus `desktop/src/mcp-shim/**`.
2. **C** — needs B's per-app server. Uses Phase 130's ops; one write tool needs Phase 152's `sendFleetProjectionToRunway`,
   so if 152 has not landed, ship that tool as the doc's last C item, after 152 A.
3. **D** — needs A, and workspace v3 (Phase 152 A).
4. **E**, then **F**.

## Deliverables

### A — Shared headless text in the runtime (M)

- [x] `packages/runtime/src/ai/headless-text.ts` (net-new), the body of `runHeadlessText` moved verbatim apart from
  its imports:
  ```ts
  export type HeadlessTextPorts = {
    runProcess: (cmd: string, args: string[], opts: { cwd?: string; timeoutMs: number; env?: Record<string, string> }) =>
      Promise<{ ok: true; stdout: string } | { ok: false; message: string }>;
    listAgents: () => Promise<AgentRoster>;          // the roster type resolveHeadlessAgent takes
    runOllama?: (model: string, prompt: string, timeoutMs: number) => Promise<{ ok: true; data: string } | { ok: false; message: string }>;
  };
  export async function runHeadlessText(input: HeadlessTextInput, ports: HeadlessTextPorts, timeoutMs: number):
    Promise<{ ok: true; text: string } | { ok: false; message: string }>;
  ```
  - The runtime may import neither `electron` nor a feature (layer rule), hence the ports. The result is a plain
    envelope; Studio wraps it into `GitOpResult` at its call site.
  - Exported from `runtime/src/index.ts`.
- [x] `desktop/src/main/ai/improve-field.ts` keeps a thin `runHeadlessText` wrapper that builds the ports from
  `process-runner`, `terminal-service.listAgents` and `features/models` `runOllamaPrompt`, and maps the envelope
  back to `GitOpResult`. `commit-message.ts`, `doc-edit.ts` and `plan-blueprint.ts` are **unchanged**.
- [x] Tests: `runtime/src/ai/headless-text.test.ts` with stub ports covers:
  - The CLI path passes `modelArgs(agentId)` and returns trimmed text.
  - An empty reply is `{ ok: false }`.
  - No CLI installed gives the "no CLI" sentence naming `what`.
  - An Ollama model routes to `runOllama`, and with `runOllama` absent gives `{ ok: false, message: 'Ollama is not available in this app.' }`.
  - The existing desktop tests for improve-field, commit-message and doc-edit pass untouched.

### B — Per-app MCP sockets and a joining shim (L)

- [x] **Socket layout:** a suite app's MCP socket lives at `<that app's userData>/mcp/<mcpSocketName(…)>.sock`,
  exactly as Studio's does today. *Landed:* `mcpSocketName` now lives in `runtime/src/mcp/socket-name.ts` (desktop re-exports it). **Drift:** a suite app's userData is `<appData>/Midnite Runtime/apps/<id>` (`appDataDirectory`), not `<appData>/<display name>`, so `resolveSuiteSockets` builds the dir that way; the display name is only the label in "Midnite <App> is not running.". `mcpSocketName` stays the naming function (it moves to
  `runtime/src/mcp/socket-name.ts` if it is not already importable from runtime).
- [x] `runtime/src/mcp/app-server.ts` (net-new):
  `startAppMcpServer({ userDataDir, appVersion, buildId, isPackaged, dispatch: ScopedDispatch, listTools: () =>
  McpToolId[], log? })` wraps `startMcpSocketServer` with the same `requireToken` scheme Studio uses. It answers
  `tools/list` with `listTools()` and `tools/call` through `dispatch`.
  - *Landed:* the list request is the reserved tool name `tools/list` (`MCP_LIST_TOOLS_REQUEST`), answered with `{ tools: ids }`; Studio's `server.ts` was left alone (its audit ring, listing filter and run guard are Studio's, so it is not a pure move).
  - Studio's `server.ts` is refactored onto it only if that is a pure move; otherwise Studio is left alone.
- [x] **Shim joining** (`desktop/src/mcp-shim/`):
  - `suite-sockets.ts` (net-new): `resolveSuiteSockets(apps = SUITE_APP_DISPLAY_NAMES)` returns `{ app: PlacementAppId,
    socketPath }[]` for every app whose `resolveUserDataDir(<display name>)/mcp/*.sock` exists and accepts a
    connection within 300 ms. Display names come from one table in `shared` (`'Midnite Studio'`, `'Midnite
    Startup'`, …), matching each app's `productName`.
  - On `tools/list` the shim asks each live socket and returns the union. Duplicate tool ids keep the first owner
    by `mcpToolOwner` and log a warning to stderr.
  - On `tools/call` it routes by a `tool → socket` map built from the last list, re-listing once on a miss.
  - A socket that dies mid-call answers the MCP error "Midnite <App> is not running." and is dropped from the map.
  - With only Studio running, the output is byte-identical to today's (test). *Landed:* Studio stays the shim's default path and is never asked for a list; the union adds only ids a suite app offers that Studio's registry list lacks, and a call goes to a suite socket only when one offers that id. Theme C must keep `startup_*` out of Studio's own `listMcpToolIds` so they are listed only while Startup runs.
- [x] Tests: `suite-sockets.test.ts` (temp dirs with fake `.sock` servers), and shim merge/route tests with two
  in-process socket servers covering:
  - The union of tools.
  - Routing to the right socket.
  - A dead socket gives the "not running" error.
  - Studio alone matches the current listing.

### C — `startup_*` tools (M)

- [x] Tool definitions appended to `MCP_TOOLS` in `shared/src/mcp.ts` (descriptions follow the `:381` rule):
  - `startup_summary` (read): company, money currency, cash, burn, runway months, default-alive, counts.
  - `startup_runway` (read): `{ scenarioId?, months: 12 | 24 | 36 }` → the `projectRunway` months.
  - `startup_milestones` (read): `{ status? }` → milestones with dependsOn.
  - `startup_projections` (read): fleet projections plus `computeFleetProjection` month-0 figures each.
  - `startup_projection` (read): `{ id }` → one projection with its full result.
  - `startup_upsert_milestone` (write): `MilestoneSchema`.
  - `startup_upsert_projection` (write): `FleetProjectionSchema`.
  - `startup_send_projection_to_runway` (write): `{ projectionId, start }` (needs Phase 152).
  - Reads are `readOnly: true`. Money is returned as minor units plus a `currency` field and a formatted string,
    so an agent never has to guess the exponent.
  - *Landed:* ids and schemas in `shared/src/startup-mcp.ts`; the writes answer `{ revision, planLines? }` (a send says how many plan lines the projection now owns), not the whole snapshot.
- [x] Ownership: `packages/modules/startup/mcp-manifest.ts` (net-new) is a `FeatureManifest`-shaped object with
  `owner: 'startup'` and `mcpTools: [...STARTUP_MCP_TOOL_IDS]`, imported by every consumer that passes manifests
  (`desktop/src/main/mcp/tool-manifests.ts`, `packages/app/src/compose/mcp-tool-manifests.ts`, the shim).
  - *Landed — drift:* the manifest is `Pick<FeatureManifest, 'owner' | 'mcpTools'>` (a module has no `PlacedFeature` to name), imported by Studio's `tool-manifests.ts`, the app's `mcp-tool-manifests.ts` and, through the first, the shim; `defaultMcpToolOwner` also names `startup_*` so a caller without it stays right. **Studio's own list leaves them out:** `listMcpToolIds` skips the tools of `SUITE_SERVED_APPS` (`['startup']`) unless `{ includeSuiteServed: true }`, so the shim lists them only while Startup runs; Studio refuses a stray call with the placeholder text.
  - Studio's `MCP_HANDLERS` gets entries for the startup ids that answer `{ error: 'Open Midnite Startup to use
    this tool.' }`, because the map is exhaustive. Studio never serves them in practice: the shim routes them to
    Startup's socket.
- [x] `packages/modules/startup/main/mcp.ts` (net-new) exports `startupMcpDispatch(store, deps, consent):
  ScopedDispatch`. Each tool maps onto `handleStartupRequest` ops, so there is one code path. Write tools go through
  the store queue like the UI.
- [x] `apps/startup/main/index.ts` starts `startAppMcpServer` on app ready with `startupMcpDispatch`, closes it on
  quit, and passes `listTools` filtered by consent.
- [x] **Consent:** Startup Settings ▸ **Agents** page (`app:startup-agents`, `LuBot`) with two switches stored in
  Startup's app settings (not the workspace):
  - "Let agents read Startup" (default off) — off means `tools/list` returns no startup tools.
  - "Let agents make changes" (default off; disabled until read is on) — off hides the three write tools.
  - A call to a hidden tool answers "Turn on agent access in Midnite Startup ▸ Settings ▸ Agents."
  - *Landed — drift:* the switches ride two new ops on the one `startup` channel (`getAgentConsent`/`setAgentConsent`) over `<userData>/startup/agent-consent.json`, outside `workspace.json`; "changes" is stored off whenever read is. The module hands the host its store via `onReady`, so the MCP server and the window share one store and write queue.
- [x] Tests: `startup/main/mcp.test.ts` covers each read against a seeded store; each write persists through the
  queue and is visible to a following read; consent off means hidden and refused; read-only workspace (`newer-version`)
  refuses writes; `mcp.test.ts` checks the description rule for the new ids.

### D — Investor updates: data and drafting (M)

- [x] Workspace **v4** in `shared/src/startup.ts`:
  - `InvestorUpdateSchema = { id: z.uuid(), period: YearMonthSchema, title: z.string().trim().min(1).max(120),
    markdown: z.string().max(50_000), createdAt, updatedAt: z.iso.datetime(), drafts: z.array(z.object({ at:
    z.iso.datetime(), model: z.string().max(80) })).max(50) }`.
  - `investorUpdates: z.array(InvestorUpdateSchema).max(240).default([])`.
  - `migrateWorkspace` gets a v3 → v4 step that adds the field.
- [x] Ops (+ bridge + type lines):
  - `upsertInvestorUpdate { update }` — one update per `period`; a second for the same month is `invalid`.
  - `removeInvestorUpdate { id }`.
  - `draftInvestorUpdate { period, agentId?, ollamaModel?, notes: z.string().max(2000) }` → `StartupResult<{
    markdown: string; model: string }>`. It **does not save**: the renderer shows it for review first (doc-edit
    pattern).
  - `exportInvestorUpdateMd { id }` and `exportInvestorUpdatePdf { id }` → `{ saved }`.
- [x] `packages/modules/startup/main/investor-update.ts` (net-new, pure apart from the runner):
  - `gatherUpdateFacts(ws, period, now)`:
    - Cash and burn: from the linked book's summary when present, else modelled.
    - Runway months, revenue this month vs last, and the base scenario's next 3 months.
    - Milestones done in the period, in progress, and due next period.
    - Fleet projections linked to Runway, with month-0 net.
    - All money pre-formatted with `formatMoney`.
  - `buildInvestorUpdatePrompt(facts, notes, previous?: string)`. It fixes the sections (`## Highlights`, `##
    Metrics`, `## Milestones`, `## Next month`, `## Asks`) and the rules:
    - Only the facts given, no invented numbers.
    - Markdown only, ≤ 400 words.
    - The previous update's markdown, if any, is for tone continuity.
  - `cleanInvestorUpdate(raw)` unwraps an outer ```markdown fence (as doc-edit does) and trims.
- [x] The runner: `runHeadlessText` from Theme A with ports built in `apps/startup/main`.
  - `runProcess` uses Node `child_process` through runtime.
  - `listAgents` reads installed CLIs through `resolveHeadlessAgent` over a roster probe of `claude`, `codex` and
    `agy` on `PATH`.
  - `runOllama` is a direct HTTP call to `localhost:11434` in a small runtime helper; Startup imports no
    `features/models`.
  - Timeout 180 s. Model args reuse the desktop `modelArgs` table, moved to `shared/src/agent-invocation.ts` if it
    is not already there.
- [x] Startup Settings ▸ **AI** page (`app:startup-ai`, `LuSparkles`): model picker (installed CLI agents + "Ollama"
  with a model name field), default `claude`, stored in app settings, with a "Test" button that runs a 1-line prompt.
- [x] Tests: `investor-update.test.ts`:
  - `gatherUpdateFacts` on a seeded workspace: period boundaries, milestones bucketed, book vs modelled cash.
  - The prompt contains every fact string and the section list.
  - `cleanInvestorUpdate` unfences.
  - `service.test.ts`: draft with a stub runner returns markdown without saving; one update per period; v3 → v4 migration.

### E — Updates view (L)

- [ ] Nav: `{ id: 'startup.updates', label: 'Updates', icon: LuNewspaper }` after Runway in `startup-nav.ts`;
  `TITLES` entry; rendered behind the company gate (it needs company data).
- [ ] `renderer/updates/updates-view.tsx` (net-new), two panes:
  - **Left:** months, newest first, with a **New update** button that defaults to last month.
  - **Right:** the selected update as an editor (textarea, `font-mono`) with a Preview toggle using the frame's
    markdown renderer (`MARKDOWN_PROSE_CLASSES`). Edits save 400 ms after the last change.
  - Read-only workspaces disable everything, as in Projections.
- [ ] **Draft with AI** (`LuSparkles`): a notes box ("anything to mention?"), then `draftInvestorUpdate` with a busy
  state and a Cancel that ignores the late result.
  - The result appears in a review card (diff against the current text when there is one, plain otherwise) with
    **Accept** (upserts, appends to `drafts`) and **Discard**.
  - A failure shows inline `role="alert"` with the runner's message ("No CLI agent installed — pick one in
    Settings ▸ AI.").
- [ ] Actions on an update:
  - **Copy markdown** (clipboard via the renderer).
  - **Save as .md** and **Save as PDF** (main; the PDF goes through `InvoicePdfPort` with the markdown rendered to
    HTML in main by a tiny renderer: headings, lists, bold/italic, links, tables; no scripts, no remote).
  - **Email draft**: `mailto:?subject=<title>&body=<markdown>` opened through the host's `openExternal`. Bodies
    over 1,800 characters are truncated with "… (full update copied to clipboard)" and also copied, because
    `mailto:` length limits vary.
- [x] Tests: `updates-view.test.tsx` covers:
  - New defaults to last month.
  - Draft → review → Accept upserts; Discard does not.
  - A second update for the same month is refused inline.
  - The `mailto:` long-body truncation copies too.
  - Read-only disables.

### F — Agent skill and verification (M)

- [ ] `.claude/skills/midnite-startup-agent/SKILL.md` (net-new; mirrored to `.agents/` and `.codex/` as the repo
  does for skills):
  - How to read the company with `startup_summary` first.
  - When writes are allowed (consent).
  - Never inventing numbers.
  - How to send a projection to Runway.
  - Pointing the user to Updates for the investor update.
- [ ] Fixtures: `suite-bridge.ts` gains `STARTUP_UPDATES_ANSWERS` (a v4 workspace with one update, a stub
  `draftInvestorUpdate` answer).
- [ ] Functional e2e `packages/app/e2e/suite-shell/startup-updates.spec.ts` (header: multi-view flow + clipboard):
  open Updates → New → Draft with AI (stubbed) → Accept → the text is in the editor → Copy markdown puts it on
  the clipboard.
- [ ] The shim's merge/route tests (B) and the tool tests (C) run in the node vitest projects.

## Files this phase touches

| File | Theme | Kind |
|---|---|---|
| `packages/runtime/src/ai/headless-text.ts` (+ test), `runtime/src/index.ts` | A | net-new; edited |
| [`packages/desktop/src/main/ai/improve-field.ts`](../../../packages/desktop/src/main/ai/improve-field.ts) | A | edited (wrapper) |
| `commit-message.ts`, `doc-edit.ts`, `plan-blueprint.ts` | A | (**unchanged**, load-bearing) |
| `packages/runtime/src/mcp/app-server.ts` (+ test) | B | net-new |
| [`packages/desktop/src/mcp-shim/`](../../../packages/desktop/src/mcp-shim/) `suite-sockets.ts` + shim entry | B | net-new; edited |
| [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts), [`mcp-tool-owners.ts`](../../../packages/shared/src/mcp-tool-owners.ts) consumers | C | edited |
| `packages/modules/startup/mcp-manifest.ts`, `main/mcp.ts` (+ test) | C | net-new |
| [`packages/desktop/src/main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), `tool-manifests.ts`, [`packages/app/src/compose/mcp-tool-manifests.ts`](../../../packages/app/src/compose/mcp-tool-manifests.ts) | C | edited |
| [`apps/startup/main/index.ts`](../../../apps/startup/main/index.ts), [`host.ts`](../../../apps/startup/main/host.ts) | C, D | edited |
| [`packages/shared/src/startup.ts`](../../../packages/shared/src/startup.ts), `ipc/bridge.ts`, `main/workspace-store.ts`, `main/service.ts`, `main/bridge.ts` | D | edited (v4, ops) |
| `packages/modules/startup/main/investor-update.ts` (+ test) | D | net-new |
| `renderer/settings/agents-settings.tsx`, `ai-settings.tsx`, `startup-settings.tsx` | C, D | net-new; edited |
| `renderer/updates/updates-view.tsx` (+ test), `startup-nav.ts`, `views/startup-home.tsx` | E | net-new; edited |
| `.claude/skills/midnite-startup-agent/SKILL.md` (+ mirrors), `suite-bridge.ts`, `e2e/suite-shell/startup-updates.spec.ts` | F | net-new; edited |

## Verification

- [ ] `moon run :typecheck :lint :test` green (in CI once Actions is unlocked; until then the focused local gate,
  named in each PR).
- [ ] A — commit messages and doc edits behave exactly as before; Startup runs a prompt through a stub and a real CLI.
- [ ] B — with Studio and Startup both running, one `midnite` server lists both apps' tools and routes each call; with Studio alone the listing is unchanged.
- [x] C — tools are invisible until consent; writes refused until the second switch; a write made by an agent shows in the open app.
- [x] D — a draft never saves itself; the prompt carries only gathered facts; v3 workspaces reach v4.
- [ ] E — draft → accept → copy/export/email works; read-only disables.
- [ ] **Open, for a human:** with the packaged Startup app running, connect Claude Code to `midnite`, ask "what's
  our runway?", then draft and export a real update.

## Not in this phase

- **Write tools for invoices, vendors, contracts or the ledger.** They post journal entries; an agent mistake there is accounting, not a typo.
- **Sending email or sharing the update.** A `mailto:` draft keeps the user in control and needs no credentials.
- **Scheduled or automatic drafting.** A draft is always asked for.
- **Charts inside the update.** Markdown text only; the PDF renders tables, not images.
- **Moving every Studio MCP tool onto the per-app model.** Only the seam and Startup's tools; Studio keeps its server.

## Decisions / open questions

1. **Resolved — Startup serves its own MCP socket** (user decision 2026-11-18), so tools work without Studio and
   writes go through Startup's own store queue.
2. **Resolved — one `midnite` shim joins every running suite app**, so agent configs do not change and a tool is
   listed only while its app runs.
3. **Resolved — read + safe writes**: milestones, fleet projections and send-to-Runway; nothing that posts to the ledger.
4. **Resolved — consent off by default, two switches** (read; then changes), stored in app settings.
5. **Resolved — `runHeadlessText` moves to the runtime behind ports**, so Startup reuses Studio's proven
   prompt → CLI/Ollama → text path rather than a second implementation.
6. **Resolved — model picker: installed CLI agents or Ollama, default Claude.**
7. **Resolved — drafts are reviewed before saving**, with one update per month, history kept as `drafts` stamps.
8. **Resolved — copy, .md, PDF and `mailto:` outputs**; long email bodies are truncated with the full text copied.
9. **Resolved — the shim's token**: Studio's server passes `requireToken: true`, which writes `<socket>.token`
   (`0600`) and demands `{auth}` as the first frame; the shim's `callMcpTool` reads `readSocketToken(socketPath)`
   per dial. So each app's server (`startAppMcpServer`) writes its token beside its own socket and the shim reads
   each one with the same call — no app-specific auth.
