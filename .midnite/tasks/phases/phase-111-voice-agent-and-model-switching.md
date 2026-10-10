# Phase 111 — Voice agent and model switching

**Written with the user** (via `/midnite-ideate`) · 2026-10-10

[Phase 21](phase-21-agent-roster-and-terminal-identity.md) added the multi-agent roster, [Phase 79](phase-79-the-companion-that-answers-back.md) gave the companion a voice, and [Phase 109](phase-109-companion-settings-by-voice.md) introduced voice-settable companion configurations. However, asking the companion *"Can you switch global models within Midnite Studio via speech?"* hits a wall: the companion's router and intent grammar have no concept of switching the active primary agent or selecting specific AI models. Furthermore, model choices are fragmented across views (Chats, Media, Settings), and the global `primaryAgent` selection lacks a unified model hierarchy.

This phase introduces **hands-free voice agent and model switching across Midnite Studio**. Speaking commands like *"Switch to Claude Opus"*, *"Use Codex"*, or *"Change model to qwen2.5-coder"* immediately changes the active agent and model, speaks a crisp audio confirmation, and updates the title bar and consuming views. The capability is exposed through three unified surfaces:
1. **The Companion voice interface** via a new `switchAgent` intent with instant local regex parsing and headless fallback.
2. **The `midnite` MCP server** via `companion_agent_*` tools, allowing background agents to inspect and switch the active agent and model.
3. **The Studio Title Bar**, expanding the primary agent dropdown to display the current active model pill and allowing quick model switching directly from the top bar.

Scope guardrails:
- **No new inference path.** Headless routing uses the existing agent CLIs via `ask.ts` or local regex parsing; no external cloud LLM SDKs or keys are introduced.
- **Secrets never travel by voice.** API keys, credentials, and STT engine configurations remain strictly non-voice-settable.
- **Direct execution with verbal read-back.** Switching an agent or model executes directly without interrupting flow, accompanied by spoken read-backs and one-step voice undo.

## Headlines

*Hands-free voice agent and model switching across the desktop workspace, title bar model selector, and MCP tooling.* Planned 2026-10-10.

**Theme A — Global Agent & Model State Contract.** ✅ Landed in PR #817. Added `primaryModelByAgent` in `ui-store`, migration v32 → v33, and model catalog resolution helpers in `shared/src/ai-models.ts`.

**Theme B — Companion Intent Schema & Grammar.** ◻ Add `switchAgent` intent to `CompanionIntentSchema`, local deterministic phrase matcher in `parseIntent`, and router vocabulary expansion in `ask.ts`.

**Theme C — Voice Execution & Spoken Read-backs.** ◻ Wire `switchAgent` into companion `act()` dispatcher with spoken confirmations, invalid model refusals, and one-step undo integration.

**Theme D — Title Bar Model Pill & Quick Switcher.** ◻ Update `TitleBarPrimaryAgent` to display the active model badge alongside the agent icon and support model selection inside the dropdown.

**Theme E — MCP Agent & Model Tools.** ◻ Expose `companion_agent_set`, `companion_agent_get`, and `companion_models_list` tools on the `midnite` MCP server.

**Theme F — View Synchronization & End-to-End Verification.** ◻ Propagate global agent/model changes to Chats, Media generators, and Tasks; add vitest unit tests and Playwright verification specs.

---

## Deliverables

### A — Global Agent & Model State Contract (M)

- [x] **`primaryModelByAgent` in `useUiStore`** ([`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts)):
  - Store a `Record<string, string | null>` mapping each agent id (e.g. `claude`, `codex`, `agy`, `ollama`) to its currently selected model.
  - Defaults: `claude` → `null` (uses default/`default`), `ollama` → first available or `null`, other agents → `null`.
  - Add actions: `setPrimaryAgent(agentId: string)`, `setPrimaryModel(agentId: string, modelId: string | null)`, and `setPrimaryAgentAndModel(agentId: string, modelId?: string | null)`.
- [x] **Store migration v32 → v33**:
  - Bump `midnite-studio.ui` store version to 33 in [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts).
  - Migrate previous states by initializing `primaryModelByAgent: {}` and preserving existing `primaryAgent`.
  - Register `primaryModelByAgent` in [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts).
- [x] **Model resolution contracts in `shared`**:
  - Define `AgentModelInfo { id: string; label: string; cliModel?: string | null; tier?: 'fast' | 'cheap' | 'default' }` in [`packages/shared/src/ai-models.ts`](../../../packages/shared/src/ai-models.ts).
  - Provide helper `modelsForAgent(agentId: string, ollamaModels?: string[]): AgentModelInfo[]` unifying `LOOP_MODELS`, `cheapModelFor`/`fastModelFor`, and local Ollama model lists.
  - Implement `resolveAgentAndModel(agentInput: string, modelInput?: string, availableAgents?: AgentDefinition[]): { agentId: string; modelId: string | null } | { error: string }`.
- [x] **Unit tests (vitest, shared & app)**:
  - Verify `resolveAgentAndModel` against canonical and misspelled agent/model combinations.
  - Test `ui-store` migration v32 → v33 on serialized state fixtures.

### B — Companion Intent Schema & Grammar (M)

- [ ] **`CompanionIntentSchema` extension** ([`packages/shared/src/companion.ts`](../../../packages/shared/src/companion.ts)):
  - Add `switchAgent` variant:
    ```ts
    z.object({
      kind: z.literal('switchAgent'),
      agentId: z.string(),
      modelId: z.string().nullable().optional(),
    })
    ```
- [ ] **Deterministic regex phrase matching in `parseIntent`**:
  - Match common phrases before routing to the headless CLI:
    - *"switch (to|primary agent to) <agent>"*
    - *"use <agent> (with <model>)?"*
    - *"set (model|agent) to <model|agent>"*
    - *"change (my|the) model to <model>"*
  - Support spoken aliases: "claude", "codex", "gemini", "antigravity", "ollama", "haiku", "sonnet", "opus", "mini", "flash".
- [ ] **Router vocabulary & prompt update in `ask.ts`** ([`packages/desktop/src/main/companion/ask.ts`](../../../packages/desktop/src/main/companion/ask.ts)):
  - Include available agents and known model options in `CompanionVocabulary`.
  - Teach the router prompt: `Use {"kind":"switchAgent","agentId":"<agentId>","modelId":"<modelId>"} to change the active agent or model.`
  - Update `parseAskReply` fixtures and unit tests in shared.

### C — Voice Execution & Spoken Read-backs (M)

- [ ] **Dispatcher execution in `act()`** ([`packages/app/src/features/companion/handoff.ts`](../../../packages/app/src/features/companion/handoff.ts)):
  - Handle `intent.kind === 'switchAgent'`.
  - Validate agent and model availability via `useAgents().status` and `useOllamaStatus()`.
  - Call `useUiStore.getState().setPrimaryAgentAndModel(agentId, modelId)`.
- [ ] **Spoken read-back responses**:
  - Speak clean, natural feedback using the companion TTS:
    - *"Switched primary agent to Claude Sonnet 5.5."*
    - *"Switched primary agent to Codex."*
    - *"Ollama is not running. Unable to switch to qwen2.5-coder."*
- [ ] **One-step undo support**:
  - Record previous `primaryAgent` and `primaryModelByAgent` in `lastChange` slot via `settings-apply.ts`.
  - Saying *"Undo that"* reverts the agent and model to their prior selection.
- [ ] **Unit tests (vitest, app)**:
  - Test dispatching `switchAgent` intent with valid, partial, and unavailable agent/model combinations.
  - Verify spoken string formatting and undo stack behavior.

### D — Title Bar Model Pill & Quick Switcher (S)

- [ ] **Update `TitleBarPrimaryAgent`** ([`packages/app/src/components/title-bar-primary-agent.tsx`](../../../packages/app/src/components/title-bar-primary-agent.tsx)):
  - Render an active model pill next to the agent icon when a non-default model is selected (e.g. `[Claude · Opus 5]`).
  - Add an inline model selector submenu in `PrimaryAgentPickerPanel` for agents offering multiple models (Claude, Ollama).
  - Ensure popover keyboard navigation (`ArrowDown`, `Enter`, `Escape`) supports model list exploration.
- [ ] **Visual testing**:
  - Add visual screenshot tests covering the updated title bar with and without an active model tag.

### E — MCP Agent & Model Tools (S)

- [ ] **Tools on `midnite` MCP server** ([`packages/desktop/src/main/mcp/`](../../../packages/desktop/src/main/mcp/)):
  - `companion_agent_get`: Returns current `primaryAgent`, active model, and list of installed agents.
  - `companion_agent_set`: Sets primary agent and optional model id with validation.
  - `companion_models_list`: Lists available models for an agent (including probed Ollama models).
- [ ] **MCP tool unit tests**:
  - Test input validation, error responses for unknown models, and broadcast notifications.

### F — View Synchronization & End-to-End Verification (M)

- [ ] **View synchronization**:
  - Subscribe Chats composer to global `primaryAgent` and model changes when creating new threads.
  - Ensure Media panels (Model 3D, Sprites, Video, Music) update their default provider suggestions to match the active agent.
- [ ] **Verification**:
  - Run repo test suite: `moon run :typecheck :lint :test`.
  - Manual verification: speak model switch phrases through the companion mic, observe spoken feedback, title bar change, and Chats sync.

---

## Files this phase touches

- [`packages/shared/src/ai-models.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/shared/src/ai-models.ts) — Unified model catalog & flags
- [`packages/shared/src/companion.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/shared/src/companion.ts) — `CompanionIntentSchema` & `parseIntent` grammar
- [`packages/shared/src/loops.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/shared/src/loops.ts) — Loop model definitions
- [`packages/desktop/src/main/companion/ask.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/desktop/src/main/companion/ask.ts) — Headless router prompt & vocabulary
- [`packages/desktop/src/main/mcp/`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/desktop/src/main/mcp/) — MCP server tools
- [`packages/app/src/store/ui-store.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/app/src/store/ui-store.ts) — Store state, setter & migration v33
- [`packages/app/src/store/persisted-keys.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/app/src/store/persisted-keys.ts) — Persisted keys registration
- [`packages/app/src/features/companion/handoff.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/app/src/features/companion/handoff.ts) — Intent execution & speech feedback
- [`packages/app/src/features/companion/settings-apply.ts`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/app/src/features/companion/settings-apply.ts) — Setting undo support
- [`packages/app/src/components/title-bar-primary-agent.tsx`](file:///Users/bilo-ekko/Dev/midnite/midnite-studio/packages/app/src/components/title-bar-primary-agent.tsx) — Title bar widget & popover

---

## Verification

- [ ] `moon run :typecheck :lint :test` passes clean across all workspace packages.
- [ ] Spoken voice command *"Switch to Claude Opus"* triggers `switchAgent` intent, updates `ui-store`, and speaks spoken read-back.
- [ ] Spoken voice command *"Use Ollama <model>"* correctly verifies Ollama daemon state before applying.
- [ ] Saying *"Undo that"* reverts to the prior agent and model combination.
- [ ] Title bar primary agent dropdown displays current model badge and allows interactive model selection.
- [ ] `companion_agent_get` and `companion_agent_set` MCP tools succeed via `midnite` MCP server.
