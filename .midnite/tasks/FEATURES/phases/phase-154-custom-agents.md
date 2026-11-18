# Phase 154 — Custom agents

Planned 2026-11-18 with the user · grounded against the tree as of `6ba3f3303`.

A new **Agents** page where a user builds their own agent. A custom agent is a **profile** on top of one of the
roster CLIs: a name, an icon and accent, a base CLI, a model, a system prompt, an allowlist of midnite MCP tools, a
set of skills, a limits override, and a **blueprint** (stack choices across five lifecycle stages, kept as design
notes). The page has three tabs — **Your agents**, **Builder**, **Info** — and is a rail view in Studio and in the
Agents app. A custom agent launches from the new-session menu like a roster agent; its limits and its tool allowlist
are enforced for the sessions it starts.

> **Builds on.**
> - **The agent roster** (Phase 21): `AgentDefinitionSchema` and `BUILTIN_AGENTS`
>   ([`terminal.ts`](../../../packages/shared/src/terminal.ts)). A profile references a roster agent by `id`; it
>   never replaces one.
> - **Feature packages and manifests** (Phase 113): `FEATURE_VIEWS`
>   ([`feature-registrations.ts`](../../../packages/shared/src/domain/feature-registrations.ts)), `FEATURE_PLACEMENT`
>   ([`placement.ts`](../../../packages/shared/src/domain/placement.ts)), the extraction guide in
>   [`docs/APPS.md`](../../../docs/APPS.md). **Crib: [`packages/features/councils`](../../../packages/features/councils)**
>   — both halves, a user-data JSON store, Agents placement.
> - **Feature toggles** (Phase 135): a package that contributes a view must be a toggle
>   ([`feature-toggles.ts`](../../../packages/shared/src/feature-toggles.ts)).
> - **Agent limits and the breaker** (Phase 121): `AgentLimitsOverrideSchema`, `resolveAgentLimits`
>   ([`agent-limits.ts`](../../../packages/shared/src/agent-limits.ts)), `limitsFor(sessionId)` in
>   [`agent-breaker.ts`](../../../packages/desktop/src/main/agent-breaker.ts).
> - **Model flags**: `modelsForAgent` / `modelArgsFor` ([`ai-models.ts`](../../../packages/shared/src/ai-models.ts)).
> - **Session env**: every agent pty already carries `MSTUDIO_SESSION_ID` / `MSTUDIO_AGENT_ID`
>   ([`pty-env.ts`](../../../packages/features/terminal/main/pty-env.ts)).
>
> **Scope guardrails.** The feature package is `packages/features/agent-profiles` (not `agents`: that name is the
> module, and `agent` is an existing placement folder); the view id and its label are `agents` / "Agents". A feature
> imports the frame and `shared` only — the roster, the models list, the skills list, `Tooltip` and session launch
> all arrive through a host port, with one adapter in Studio and one in the Agents module. No new eslint exception.
> IPC ops return envelopes and never throw. Icons from `react-icons/lu` only; theme tokens, not the pasted brief's
> `slate`/`zinc` palette. macOS only. Every new test is a vitest unless its header names the browser capability it
> needs. The blueprint is data and UI only: it installs nothing and changes nothing about how an agent runs.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — Shared contract (M).** ◻ `AgentProfileSchema`, the five lifecycle stages and their options as data, the
`agentProfile*` channels and schemas, the bridge slice, and an optional `profileId` on sessions and `PtyCreateRequest`.

**Theme B — Package, store and IPC (M).** ◻ `packages/features/agent-profiles` with a manifest, a
`agent-profiles.json` store in user data, handlers for list, save, delete, import and export, registered in Studio's
main and the Agents host, behind a default-on feature toggle.

**Theme C — Agents page and the Your agents tab (M).** ◻ The `agents` rail view in Studio and the Agents app, the
three-tab shell, and the list: launch, edit, duplicate, import, export, delete, and three starter templates.

**Theme D — Builder tab (L).** ◻ The profile form and the Blueprint section (stages on the left, multi-select options
and a note on the right, a live stack bar at the bottom), with a round info-icon tooltip on every field and option.

**Theme E — Info tab (S).** ◻ The five stages and their options explained, how a profile runs, a glossary, and
documentation links.

**Theme F — Launch (M).** ◻ Custom agents in the new-session menu and on each list row: base CLI command, model
flag, system prompt by flag where the CLI has one and as the first message otherwise, chosen skills named in the prompt.

**Theme G — Enforcement (L).** ◻ The breaker layers a profile's limits over the repo's for sessions that profile
started; the midnite MCP server refuses tools outside the profile's allowlist for those sessions.

## Build order

1. **A** first: everything reads the schema and the channels.
2. **B** next: the store and handlers the renderer queries.
3. **C**, then **D** and **E** (D and E are independent of each other once C's shell exists).
4. **F** after D (it needs saved profiles to launch).
5. **G** last: it needs `profileId` on a live session, which F sets.

Suggested PRs: `PR-1` = A + B, `PR-2` = C + E, `PR-3` = D, `PR-4` = F, `PR-5` = G.

## Deliverables

### A — Shared contract (M)

- [ ] New `packages/shared/src/agent-profiles.ts` (zod only), exported from `packages/shared/src/index.ts`:
  - `AGENT_PROFILE_ID_PREFIX = 'profile-'`.
  - `AgentProfileSchema = z.object({ id: z.string().startsWith('profile-'), name: z.string().min(1).max(60),
    description: z.string().max(280).default(''), baseAgentId: z.string().min(1), accent: z.string().min(1),
    icon: z.string().min(1).optional(), model: z.string().min(1).default('default'),
    systemPrompt: z.string().max(20_000).default(''), mcpTools: z.array(z.string()).nullable().default(null),
    skills: z.array(z.string().min(1)).default([]), limits: AgentLimitsOverrideSchema.default({}),
    blueprint: AgentBlueprintSchema.default({}), createdAt: z.number().int(), updatedAt: z.number().int() })`.
    `mcpTools: null` means "no restriction"; `[]` means "no midnite tools at all".
  - `type AgentProfile = z.infer<typeof AgentProfileSchema>`.
  - `parseAgentProfiles(raw: unknown): AgentProfile[]` — keeps valid entries, drops invalid ones and later
    duplicates of an `id` (crib `parseCustomLoops` in [`custom-loops.ts`](../../../packages/shared/src/custom-loops.ts)).
  - `createBlankAgentProfile(ids = defaultIdFactory, now = Date.now()): AgentProfile` — `name: 'New agent'`,
    `baseAgentId: 'claude'`, `accent: '#8b5cf6'`. Reuse `IdFactory` / `defaultIdFactory` from `custom-loops.ts`.
  - `duplicateAgentProfile(profile, ids?, now?)` — new `id`, `name: \`${name} copy\``, fresh timestamps.
  - `profileAgentId(profileId)` / `isProfileAgentId(id)` — the id a profile uses where an agent id is expected.
- [ ] Blueprint data in the same file:
  - `AGENT_BLUEPRINT_STAGE_IDS = ['orchestrate', 'ground', 'act', 'adapt', 'operate'] as const`.
  - `AGENT_BLUEPRINT_STAGES: readonly { id; label; subtitle; summary; options: readonly { id; label; summary; docsUrl }[] }[]`
    with exactly these stages and options:
    1. `orchestrate` — "Understand & Orchestrate" (Frameworks): `langgraph` LangGraph, `crewai` CrewAI,
       `llamaindex-workflows` LlamaIndex Workflows, `custom` Custom / in-house.
    2. `ground` — "Ingest & Ground" (RAG & data): `vector-db` Vector DBs (Pinecone / pgvector), `hybrid-search`
       Hybrid search, `managed-kb` Managed knowledge bases.
    3. `act` — "Connect & Act" (Tools & MCP): `mcp` Model Context Protocol, `api-sdks` Custom API SDKs,
       `local-exec` Local shell / DB execution.
    4. `adapt` — "Optimize & Adapt" (Fine-tuning): `open-weight` Open-weight fine-tuning (Unsloth / Axolotl),
       `managed-apis` Managed APIs (OpenAI / Anthropic), `prompt-evals` Prompt evaluation frameworks.
    5. `operate` — "Secure, Deploy & Operate" (Production): `hosting` Orchestration hosting (Modal / Baseten),
       `guardrails` Guardrails (NeMo / Llama Guard), `observability` Observability (LangSmith / Phoenix).
  - `AgentBlueprintSchema = z.record(z.enum(AGENT_BLUEPRINT_STAGE_IDS), z.object({ options: z.array(z.string()).default([]),
    note: z.string().max(500).default('') }))` (partial: a missing stage means nothing chosen).
  - `blueprintSummary(blueprint): { stageId; stageLabel; optionLabels: string[] }[]` — one entry per stage in stage
    order; unknown option ids are dropped. The stack bar and the list row both render from it.
- [ ] Launch helpers in `packages/shared/src/agent-profile-launch.ts`:
  - `PROFILE_PROMPT_DELIVERY: Record<string, 'flag' | 'first-message'>` — `claude: 'flag'`; every other id resolves to
    `'first-message'` through `promptDeliveryFor(baseAgentId)`.
  - `composeProfilePrompt(profile): string` — `systemPrompt`, then, when `skills.length > 0`, a final paragraph
    `Prefer these skills when they fit: <comma-separated names>.` Returns `''` when both are empty.
  - `resolveProfileLaunch(profile, base: AgentDefinition): { command: string; args: string[]; firstMessage: string | null }`
    — `args = [...base.args, ...modelArgsFor(base.id, profile.model), ...promptFlagArgs]`, where `promptFlagArgs` is
    `['--append-system-prompt', shellQuote(prompt)]` for `'flag'` delivery with a non-empty prompt, else `[]`;
    `firstMessage` is the prompt for `'first-message'` delivery with a non-empty prompt, else `null`. `model:
    'default'` adds no model args. `shellQuote` is a single-quote POSIX quote, exported and unit-tested with a prompt
    containing `'`, `"`, `$`, a backtick and a newline (the line is typed into a login shell, not spawned).
- [ ] Channels in [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts):
  `agentProfileList: 'mstudio:agent-profile:list'`, `agentProfileSave: '…:save'`, `agentProfileDelete: '…:delete'`,
  `agentProfileExport: '…:export'`, `agentProfileImport: '…:import'`.
- [ ] Schemas in [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts):
  `AgentProfileListResponse { profiles: AgentProfile[] }`; `AgentProfileSaveRequest { profile: AgentProfileSchema }`;
  `AgentProfileDeleteRequest { id }`; `AgentProfileExportRequest { id }`; save / delete / export / import responses as
  the `{ ok: true, … } | { ok: false, error }` envelope (`save` and `import` return `profile`; `export` returns
  `path`; `import` and `export` return `{ ok: true, cancelled: true }` when the file dialog is dismissed).
- [ ] Bridge type in [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts):
  `agentProfile: { list; save; delete; export; import }` (crib the `council` slice).
- [ ] `profileId: z.string().optional()` on `TerminalSessionSchema` ([`terminal.ts`](../../../packages/shared/src/terminal.ts))
  and on `PtyCreateRequest` (`schemas.ts`).
- [ ] Registration: `FEATURE_PLACEMENT['agent-profiles'] = 'agents'`; `FEATURE_VIEWS['agent-profiles'] = ['agents']`;
  `'agents'` in `STUDIO_VIEW_ORDER` directly after `'chats'`'s group neighbours (the agent views block);
  `PAGE_WINDOW_ROLES` gains `'agents'` ([`window.ts`](../../../packages/shared/src/domain/window.ts)).
- [ ] `FEATURE_TOGGLES` entry `agentProfiles`: `{ label: 'Custom agents', description: 'Build your own agents on top
  of the roster CLIs.', group: 'agent', requires: [], packages: ['agent-profiles'], views: ['agents'],
  settingsPages: [], commands: [], data: { files: ['agent-profiles.json'], storeKeys: [], vault: [] } }`, default on.
- [ ] Tests: `agent-profiles.test.ts` (schema defaults, `parseAgentProfiles` drops invalid and duplicate entries,
  blank and duplicate factories with an injected id factory and clock, every stage has 3–4 options with unique ids,
  `blueprintSummary` order and unknown-id handling); `agent-profile-launch.test.ts` (flag vs first-message, default
  model adds no args, empty prompt adds nothing, `shellQuote` cases, skills paragraph); update
  `feature-registrations.test.ts` (`LEGACY_VIEW_IDS`), `view.test.ts`, `feature-toggles.test.ts`.

### B — Package, store and IPC (M)

- [ ] Create `packages/features/agent-profiles` by copying `packages/features/councils`' `package.json`, `moon.yml`,
  `tsconfig.json`, `tsconfig.main.json`, `vitest.config.ts`: name `@midnite/studio-feature-agent-profiles`, moon id
  `feature-agent-profiles`, tags `layer-feature`, `app-agents`, `app-studio`.
- [ ] `manifest.ts`: `agentProfilesManifest = defineFeatureManifest({ feature: 'agent-profiles', owner: 'agents',
  views: [{ id: 'agents', global: true, rail: { group: 'agent', label: 'Agents', description: 'Build and manage your
  own agents' } }], settingsPages: [], ipc: [the five channels], events: [], mcpTools: [] })`; `manifest.test.ts` as
  councils' (owner matches placement, view ids equal `FEATURE_VIEWS['agent-profiles']`, channels match
  `/^mstudio:agent-profile:/`).
- [ ] `main/agent-profiles-store.ts`: `FILE_NAME = 'agent-profiles.json'`; `createAgentProfilesStore(dir)` with
  `load(): Promise<AgentProfile[]>` (missing or malformed file → `[]`; file shape `{ version: 1, profiles: [] }`,
  entries through `parseAgentProfiles`) and `save(profiles)` (pretty JSON + trailing newline, written to a temp file
  and renamed); `nullAgentProfilesStore`.
- [ ] `main/agent-profiles-service.ts`: `configureAgentProfiles(store)`, `listAgentProfiles()`,
  `getAgentProfile(id)`, `saveAgentProfile(profile)` (upsert by `id`, sets `updatedAt`, keeps `createdAt` of an
  existing entry), `deleteAgentProfile(id)`, `resetAgentProfilesState()` for tests. All writes go through one
  in-module promise queue so two saves cannot interleave.
- [ ] `main/index.ts`: `agentProfilesMain = defineFeatureMain<AgentProfilesMainServices>(…)` registering the five
  channels. `AgentProfilesMainServices = { showSaveDialog(defaultName): Promise<string | null>; showOpenDialog():
  Promise<string | null> }` (the host injects Electron's dialogs; the feature imports no `electron`). Export writes
  one profile as `{ version: 1, profile }` to `<name>.agent.json`; import reads that shape, validates with
  `AgentProfileSchema`, assigns a **new** `id` and timestamps, saves, and returns it. Invalid file → `{ ok: false,
  error }`.
- [ ] Studio wiring: dependency in `packages/desktop/package.json` and `packages/app/package.json`; reference in
  `packages/desktop/tsconfig.json`; `packages/desktop/moon.yml` entries mirroring `feature-councils`;
  `packages/desktop/src/main/ipc/agent-profile-handlers.ts` (crib `council-handlers.ts`) called from
  `main/index.ts`; `configureAgentProfiles(createAgentProfilesStore(userData))` beside `configureCouncils`;
  preload slice in `packages/desktop/src/preload/index.ts`; `feature-gate-channels.ts` maps `agentProfiles` to
  `agentProfilesMain.channels`.
- [ ] Agents host wiring: dependency in `packages/modules/agents/package.json`; channels spread in
  `packages/modules/agents/main/module.ts`; configure + register in `main/context.ts`; preload slice in
  `main/bridge.ts`.
- [ ] Repo registration: `'agent-profiles'` in `STUDIO_FEATURES` ([`composition.ts`](../../../apps/studio/src/composition.ts));
  `'feature-agent-profiles'` in `NODE_PROJECTS` ([`gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs))
  and its pinned list in `gate-projects-check.test.mjs`; the `…/main` path in `tsconfig.base.json`;
  `'agent-profiles'` in `apps/agents/tailwind.config.ts`.
- [ ] Tests: `agent-profiles-store.test.ts` (temp dir: missing file, malformed file, round trip, one invalid entry
  dropped); `agent-profiles-service.test.ts` (upsert keeps `createdAt`, delete, concurrent saves both land);
  `main/index.test.ts` (import assigns a new id, invalid import fails with an envelope, cancelled dialog).

### C — Agents page and the Your agents tab (M)

- [ ] `renderer/host.tsx`: `AgentProfilesHost` with `useAgentRoster(): { agents: AgentDefinition[]; status:
  AgentStatus[] }`, `resolveAgentIcon(agent): IconComponent`, `useModelsFor(baseAgentId): AgentModelInfo[]`,
  `useSkills(baseAgentId): { name; description; scope }[]`, `useMcpTools(): { id; label; description }[]`,
  `Tooltip: ComponentType<{ label: ReactNode; side?: 'top' | 'bottom' | 'right'; children: ReactElement }>`,
  `launchProfile?(profile: AgentProfile): void` (optional: absent hides Launch), `openExternal(url): void`;
  `AgentProfilesHostProvider`, `useAgentProfilesHost()` (crib `councils/renderer/host.tsx`).
- [ ] `renderer/use-agent-profiles.ts`: `useAgentProfiles()` (`useQuery(['agent-profiles'])` over
  `bridge()?.agentProfile.list()`), `useSaveAgentProfile()`, `useDeleteAgentProfile()`, `useImportAgentProfile()`,
  `useExportAgentProfile()`; each mutation invalidates `['agent-profiles']` and routes a failed envelope through
  `reportFailure`.
- [ ] `renderer/agents-view.tsx`: `AgentsView` — the page shell (crib the header and `TabStrip` in
  [`models-view.tsx`](../../../packages/features/models/renderer/models-view.tsx)): `PageDetachMark role="agents"`,
  `LuBot`, `h1` "Agents", and a `role="tablist"` with tabs `list` ("Your agents"), `builder` ("Builder"), `info`
  ("Info"). Local state `{ tab, editingId: string | null }`; `data-testid="agents-view"`, `agents-tab-<id>`.
- [ ] `renderer/agents-list.tsx`: `AgentsList` — one card per profile (`data-testid="agent-profile-<id>"`): icon in
  the profile's accent, name, description, base CLI label, model, the `blueprintSummary` chips, and actions Launch
  (only when the host has `launchProfile`; disabled with a reason when the base CLI is not installed), Edit (opens
  the Builder tab on that profile), Duplicate, Export, Delete (confirm dialog naming the agent). Toolbar: "New
  agent", "New from template" menu, "Import".
- [ ] A profile whose `baseAgentId` is not in the roster shows a warning chip "Base CLI not found" and cannot launch.
- [ ] `renderer/templates.ts`: `AGENT_PROFILE_TEMPLATES` — `reviewer` ("Reviewer": reads diffs, reports findings,
  writes nothing), `researcher` ("Researcher": reads and summarises, no file writes), `builder` ("Builder":
  implements a spec, commits often). Each is a partial profile (name, description, accent, systemPrompt, blueprint)
  applied over `createBlankAgentProfile()`.
- [ ] Empty state: a short explanation, the three templates as cards, and "Start from scratch".
- [ ] `renderer/index.ts`: exports the manifest, host, hooks, and `agentProfilesViews = { agents: () =>
  import('./agents-view').then((m) => m.AgentsView) } satisfies Record<ViewIds, …>`; `renderer/testing.ts` exports a
  `TEST_AGENT_PROFILES_HOST` and a profile fixture.
- [ ] Studio view wiring — one entry each in: `VIEW_COMPONENT` ([`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx),
  `global: true`), `VIEW_ICON` (`nav-icons.ts`, `LuBot`), `VIEW_LABELS` + `VIEW_KEYWORDS`
  (`services/palette/providers.ts`, label "Agents", keywords `custom agent`, `profile`, `builder`), `VIEW_LABELS` in
  `sidebar-page.tsx` and `title-bar-nav.tsx`, `VIEW_FILTERS` (`view-sections.ts`), `TEST_VIEW_LABELS` /
  `TEST_VIEW_KEYWORDS` (`companion/renderer/test-catalog.ts`), `AGENT_NAV_ITEMS` (`nav-groups.ts`), `RAIL_VIEW_IDS`
  (`nav-visibility.ts`). No chord.
- [ ] Studio host adapter `packages/app/src/compose/agent-profiles-host.tsx`: `STUDIO_AGENT_PROFILES_HOST satisfies
  AgentProfilesHost` (`useAgentRoster: () => useAgents()`, the app's `Tooltip`, `modelsForAgent` with Ollama models,
  skills through `bridge()?.chats.skills`, tools from `listMcpToolIds`), installed in `studio-providers.tsx`.
- [ ] Agents module wiring: `'agent-profiles'` in `features` and `{ id: 'agents', global: false }` in `views`
  ([`manifest.ts`](../../../packages/modules/agents/manifest.ts)); a row in `AGENTS_NAV.views` and `AGENTS_APP`
  (`renderer/agents-manifest.ts`); `LABEL` and `VIEWS` entries in `renderer/views/agents-home.tsx`;
  `AGENTS_AGENT_PROFILES_HOST` in `renderer/compose/agents-hosts.tsx` (plain `title` tooltip from `plain-ui.tsx`,
  roster from the existing `['agents']` query); `AgentProfilesHostProvider` nested in `AgentsApp` and `AgentsPane`.
- [ ] Tests: `agents-view.test.tsx` (three tabs, Edit switches to Builder with that profile), `agents-list.test.tsx`
  (cards render, duplicate and delete call the mutations, Launch hidden without the port, missing base CLI chip,
  empty state shows templates), `templates.test.ts` (every template parses as an `AgentProfile`); update
  `view-registry.test.ts` (global set), `agents-app.test.tsx` (rail labels), `agents-manifest.test.ts`, the module
  `manifest.test.ts`, `composition.test.ts`, `apps/studio/src/feature-toggles.test.ts`.

### D — Builder tab (L)

- [ ] `renderer/info-tip.tsx`: `InfoTip({ label, side = 'top' })` — a `button type="button"` holding a round
  `LuInfo` (`h-3.5 w-3.5`, `rounded-full`, `text-muted-foreground`), `aria-label="More information"`, wrapped in the
  host `Tooltip`. `renderer/field.tsx`: `Field({ label, info, htmlFor, children })` — label, `InfoTip`, control.
- [ ] `renderer/info-copy.ts`: `FIELD_INFO: Record<FieldId, string>` — one or two plain sentences for each of
  `name`, `description`, `baseAgent`, `model`, `accent`, `systemPrompt`, `mcpTools`, `skills`, each limit key, and
  `blueprint`. Stage and option tooltips read `summary` from `AGENT_BLUEPRINT_STAGES`.
- [ ] `renderer/agent-builder.tsx`: `AgentBuilder({ profileId, onDone })` — edits a draft copy of the profile (or a
  blank one); **Save** validates with `AgentProfileSchema` and calls `useSaveAgentProfile`; **Discard** restores the
  saved copy; an unsaved-changes dot on the Builder tab; leaving the tab with unsaved changes asks to confirm.
  Sections, each a `Field`:
  - **Identity**: name, description, accent (colour input), icon (the roster icon keys via `resolveAgentIcon`).
  - **Base**: base CLI (`select` of the roster, installed ones first, uninstalled disabled with the roster's
    `install` hint), model (`useModelsFor(baseAgentId)`; resets to `default` when the base changes and the model is
    not offered).
  - **System prompt**: `textarea` with a character count, and one line stating delivery for the chosen base
    (`promptDeliveryFor`): "Passed as a system prompt" or "Sent as the first message".
  - **Tools**: a switch "Restrict midnite tools"; when on, a filterable checklist of `useMcpTools()` with select
    all / none. Off maps to `mcpTools: null`.
  - **Skills**: filterable checklist of `useSkills(baseAgentId)` with scope badges; a note that skills are guidance,
    named in the prompt, and not enforced.
  - **Limits**: one number input per `AGENT_LIMIT_KEYS` with `AGENT_LIMIT_LABELS`; empty means "use the repo's
    limit" and shows the default as placeholder.
- [ ] `renderer/blueprint-editor.tsx`: `BlueprintEditor({ value, onChange })` — a three-part layout that is fully
  visible at once (no hidden menus):
  - left `Pipeline`: the five stages as a vertical list (`role="tablist"`, `aria-orientation="vertical"`), each
    with its number, label, subtitle and a count of chosen options; arrow keys move the active stage;
  - right `Configurator`: the active stage's options as toggle cards (`aria-pressed`), each with an icon from
    `react-icons/lu`, its label, an `InfoTip` and a "Docs" link through `openExternal`; below them the stage note
    (`textarea`, 500 max);
  - bottom `StackBar` (`position: sticky; bottom: 0`): `blueprintSummary` as five labelled groups of chips,
    "None chosen" for an empty stage; clicking a group activates that stage.
  Active-stage and pressed-card states use theme tokens and a `transition-colors`; `prefers-reduced-motion`
  removes the transition.
- [ ] Stage and option icons in `renderer/blueprint-icons.ts`: `Record<stageId | optionId, IconComponent>` from
  `react-icons/lu` (asserted complete by a test).
- [ ] Tests: `agent-builder.test.tsx` (save sends the edited profile, invalid name blocks save, base change resets
  an unavailable model, restrict switch maps to `null` / `[]`, delivery line follows the base, every `Field` has an
  `InfoTip`), `blueprint-editor.test.tsx` (clicking a stage activates it, options toggle independently, note edits,
  stack bar mirrors selections, arrow-key navigation), `blueprint-icons.test.ts`, `info-copy.test.ts` (no empty
  strings, every field id covered).

### E — Info tab (S)

- [ ] `renderer/agents-info.tsx`: `AgentsInfo` — four sections with in-page anchor links at the top:
  1. **The five stages** — rendered from `AGENT_BLUEPRINT_STAGES`: each stage's `summary`, then each option's
     `summary` and docs link.
  2. **How a custom agent runs** — base CLI, model flag, system prompt delivery (flag vs first message, listing
     which base CLIs use which from `PROFILE_PROMPT_DELIVERY`), what the tool allowlist and limits enforce, and that
     skills and the blueprint are guidance only.
  3. **Glossary** — `GLOSSARY` in `renderer/info-copy.ts`: RAG, vector database, hybrid search, MCP, tool call,
     fine-tuning, open-weight model, evaluation, guardrails, observability, orchestration, system prompt.
  4. **Links** — docs for each base CLI (`AgentDefinition.docsUrl`) and each blueprint option, opened through
     `openExternal`.
- [ ] Tests: `agents-info.test.tsx` (all five stages and every option render, glossary terms sorted and unique,
  links call `openExternal`).

### F — Launch (M)

- [ ] `packages/features/terminal/renderer/new-session-menu.ts`: `buildAgentSections` accepts `profiles?:
  AgentProfile[]` and returns a third section `'custom'` ("Your agents") listing them first; a row is disabled with
  "Base CLI not installed" when its base is. `NewSessionPickerProps` gains `profiles?` and
  `onNewProfile?(profile)`; the section is absent when either is missing.
- [ ] The terminal host port gains `useAgentProfiles?(): AgentProfile[]` (optional); Studio's adapter fills it from
  the `['agent-profiles']` query, the Agents module's likewise. The terminal feature does not import the
  agent-profiles feature.
- [ ] Opening a profile session: `openSession({ kind: 'agent', agentId: profile.baseAgentId, profileId: profile.id,
  title: profile.name, cwd, repoId })`. `agentInitialInput` uses `resolveProfileLaunch` when the session has a
  `profileId` and the profile still exists, else falls back to the base agent's plain command.
- [ ] First-message delivery: when `resolveProfileLaunch(...).firstMessage` is non-null, queue it with
  `useTerminalStore.getState().queueInput` once the session's agent activity first reports awaiting input (the
  roster's `activity.awaitingInput` pattern); with no such pattern for that CLI, after a fixed 3 s delay. Sent once
  per session, never on revive.
- [ ] `use-terminal-ipc.ts` passes `profileId` on `api.pty.create`; main stores it on the session record.
- [ ] Session chrome: a profile session shows the profile's name, icon and accent in the tab and session list
  (resolved in the terminal host's `resolveAgentIcon` path), falling back to the base agent when the profile was
  deleted.
- [ ] `launchProfile` in both host adapters opens the terminal and starts the session; the Launch button on a list
  card calls it.
- [ ] Tests: `new-session-menu.test.ts` (custom section, disabled row, absent without profiles),
  `terminal-panel` test for `agentInitialInput` with a profile (flag delivery text, default model, deleted
  profile fallback), a first-message test with fake timers (sent once, not on revive).

### G — Enforcement (L)

- [ ] Limits: `resolveAgentLimits(settings, repoPath, profileOverride?)` in
  [`agent-limits.ts`](../../../packages/shared/src/agent-limits.ts) — layer order defaults → global → repo →
  profile. The breaker's `session` seam type gains `profileId?: string`; `limitsFor` in
  [`agent-breaker.ts`](../../../packages/desktop/src/main/agent-breaker.ts) reads the profile through a new seam
  `profile: (id) => Promise<AgentProfile | null>` (bound to `getAgentProfile`) and passes `profile.limits`. The 5 s
  cache stays; a deleted profile means no override.
- [ ] Session env: `pty-env.ts` adds `MSTUDIO_PROFILE_ID` when the session has a `profileId`; add it to
  `DEFAULT_MSTUDIO_ENV_KEYS` ([`agent-env-check.ts`](../../../packages/runtime/src/security/agent-env-check.ts)).
- [ ] MCP shim ([`packages/desktop/src/mcp-shim/client.ts`](../../../packages/desktop/src/mcp-shim/client.ts)): send
  `sessionId: process.env.MSTUDIO_SESSION_ID` (when set) with every tool call frame; the frame schema gains the
  optional field.
- [ ] MCP server ([`packages/runtime/src/mcp/socket-server.ts`](../../../packages/runtime/src/mcp/socket-server.ts)
  and its tool dispatch): a new injected seam `toolAllowlist(sessionId): Promise<ReadonlySet<string> | null>`
  (Studio binds it to session → `profileId` → `profile.mcpTools`; `null` = unrestricted). A call to a tool outside a
  non-null allowlist returns the tool-error result `Tool "<id>" is not allowed for agent "<name>"` and is never
  dispatched. The tool **list** response is filtered the same way so the agent does not see tools it cannot call.
  The runtime imports nothing new; the seam keeps it host-injected.
- [ ] Audit: a refused call is recorded through the existing agent audit log with `outcome: 'denied'` and the
  reason `profile-allowlist`, so it shows in the Audit view.
- [ ] Agents host: bind the same two seams in `packages/modules/agents/main/context.ts`.
- [ ] Tests: `agent-limits.test.ts` (profile layer wins over repo, empty override changes nothing);
  `agent-breaker.test.ts` (a profile session trips at the profile's lower limit; a deleted profile falls back);
  socket-server test (allowed tool dispatches, refused tool returns the error and is not dispatched, list is
  filtered, no `sessionId` means unrestricted); `pty-env` test for `MSTUDIO_PROFILE_ID`.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/agent-profiles.ts` | A | net-new: schema, blueprint stages, factories |
| `packages/shared/src/agent-profile-launch.ts` | A | net-new: prompt delivery, launch resolution |
| `packages/shared/src/ipc/{channels,schemas,bridge}.ts` | A | five channels, schemas, bridge slice, `profileId` |
| `packages/shared/src/terminal.ts` | A | `profileId` on the session |
| `packages/shared/src/domain/{placement,feature-registrations,window}.ts` | A | placement, view id, window role |
| `packages/shared/src/feature-toggles.ts` | A | `agentProfiles` toggle |
| `packages/features/agent-profiles/**` | B C D E | net-new package |
| `packages/desktop/src/main/**`, `preload/index.ts`, `moon.yml`, `tsconfig.json` | B | store, handlers, preload |
| `packages/modules/agents/**` | B C F G | manifest, hosts, main wiring |
| `packages/app/src/components/*`, `compose/*`, palette, settings, repos | C | view maps, host adapter |
| `packages/features/terminal/renderer/*` | F | custom section, profile launch |
| `packages/shared/src/agent-limits.ts`, `packages/desktop/src/main/agent-breaker.ts` | G | profile limit layer |
| `packages/desktop/src/mcp-shim/client.ts`, `packages/runtime/src/mcp/*` | G | session id on calls, allowlist |
| `apps/studio/src/composition.ts`, `scripts/gate-projects-check.*`, `tsconfig.base.json`, `apps/agents/tailwind.config.ts` | B | registration |

## Verification

- [ ] Targeted checks green on every PR: `tsc --noEmit` per touched package, eslint on changed files, vitest on the
  touched suites, `scripts/layer-boundaries.test.mjs`, `tracker-check`, `e2e-budget`.
- [ ] `node scripts/skills/sync-skills.mjs` unaffected; `graphify update .` run after the code lands.
- [ ] **Gate — Studio, built app, throwaway `--user-data-dir`.** Open Agents from the rail; create an agent from
  the Reviewer template; edit name, model and prompt; pick options in all five blueprint stages and see the stack
  bar follow; save; relaunch the app and find it in the list. Shots under `/tmp/midnite-shots-p154/`.
- [ ] **Gate — launch.** Start the saved agent from the new-session menu on a Claude base: the typed command carries
  the model flag and the system prompt flag. Repeat on a non-Claude base: the prompt arrives as the first message,
  once.
- [ ] **Gate — enforcement.** With a restricted allowlist, ask the agent to call a midnite tool outside it: the call
  is refused, the refusal is in the Audit view, and an allowed tool still works. Lower `toolCallsPerMinute` on the
  profile and see the breaker trip at that number.
- [ ] **Gate — Agents app.** The Agents page appears in the Agents app's rail with the same three tabs, and an agent
  saved in Studio is listed there.
- [ ] **Human pass.** Every builder field and blueprint option shows its info tooltip on hover and on keyboard focus;
  the Info tab reads clearly to someone new to the terms.

## Not in this phase

- **Scaffolding from a blueprint.** No repo, dependency or config is generated from the stack choices.
- **Repo-level agents.** Profiles are user-level only; a committed, shared `.midnite/` scope is a later phase.
- **`agents.json` in the Agents app.** Its roster stays `BUILTIN_AGENTS`; profiles there can only use builtin bases.
- **Enforced skills.** Skills are named in the prompt; nothing blocks another skill.
- **Per-CLI system prompt flags beyond Claude.** Other CLIs use first-message delivery until a flag is verified and
  added to `PROFILE_PROMPT_DELIVERY`.
- **Profiles in councils, workflows, loops and chats.** Those keep picking roster agents.
- **A settings page.** The Settings ▸ Agents roster page is unchanged.

## Decisions / open questions

1. **Resolved — a built agent is a runnable profile plus a blueprint** (agreed with the user): the profile launches;
   the blueprint is saved design notes.
2. **Resolved — rail view** in Studio and a view in the Agents app; no Settings page.
3. **Resolved — one user-level JSON file** (`agent-profiles.json`), zod-validated, behind IPC.
4. **Resolved — profile carries** system prompt, model, MCP tool allowlist, skills and limits.
5. **Resolved — blueprint is multi-select with a note per stage.** Hosting, guardrails and observability are not
   alternatives.
6. **Resolved — list actions**: launch, duplicate, import / export, starter templates.
7. **Resolved — Info tab**: the five stages, how profiles run, glossary, links out.
8. **Resolved — system prompt by flag, else first message.** Claude takes `--append-system-prompt`; the builder
   states which delivery applies.
9. **Resolved — limits enforced per session** by layering the profile over the repo in the breaker.
10. **Resolved — tool allowlist enforced by the MCP server**, whatever the base CLI.
11. **Resolved — package name `agent-profiles`, view `agents`**, to stay clear of the `agents` module and the
    `agent` placement folder.
12. **Open — how strong the allowlist is.** The server learns the session from `MSTUDIO_SESSION_ID` in the agent's
    own environment, so an agent that unsets it is treated as unrestricted. That makes the allowlist a guard against
    drift, not a boundary against a hostile agent. A per-session MCP config or socket would close it; decide at
    refine whether that belongs here or in a SECURITY phase.
13. **Open — first-message timing** for CLIs with no `awaitingInput` pattern: the 3 s fallback is a guess to be
    measured per CLI during Theme F.
