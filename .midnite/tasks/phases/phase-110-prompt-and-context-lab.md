# Phase 110 — Prompt & Context Lab

**Written with the user** (via `/midnite-ideate`) · 2026-10-10

As developers increasingly drive agentic workflows and LLM-assisted coding in Midnite Studio, prompt engineering and context assembly have become core development loops. Midnite Studio already ships agents, chats ([Phase 102](phase-102-chats-page.md)), a 15,000+ node knowledge graph ([Phase 87](phase-87-knowledge-graph-panel.md) & [Phase 89](phase-89-knowledge-graph-variants.md)), local Ollama orchestration ([Phase 96](phase-96-ollama-local-and-cloud-models.md)), and workflows ([Phase 43](phase-43-workflows-mvp.md) & [Phase 97](phase-97-workflow-graph-primitives.md)). However, assembling prompts, inspecting repo context sizes, calculating token footprints, and testing how different models respond to structured prompts has remained ad hoc and opaque.

This phase builds the **AI Prompt & Context Lab**: a first-class studio environment (`prompts` view) dedicated to prompt authoring, dynamic repo context assembly, multi-tokenizer budget estimation, context-window visualization, and multi-model evaluation against local Ollama and installed Agent CLIs.

Scope guardrails:
- **No new API keys or network leakage in renderer.** Model execution strictly uses existing trusted IPC inference lanes: local Ollama daemon (`bridge.ollama`) and installed Agent CLIs via existing runner/pty bridges (`bridge.companion.ask` / agent runner).
- **Offline-safe token estimation.** Precise token counts and breakdown visualizations run in local client-side workers / estimators without pinging remote tokenization services.
- **Bi-temporal template storage.** Templates live in repo-tracked `.midnite/prompts/*.md` (for team sharing via git) with an optional personal overlay in local app data (`midnite-studio.prompts`).

## Headlines

*Prompt engineering, context assembly, multi-tokenizer budget estimation, and model comparison workbench.* Planned 2026-10-10.

**Theme A — Wire contracts & template storage engine.** ◻ Shared Zod schemas for prompt templates, variables, context injectors, and bi-temporal persistence in `.midnite/prompts/` and app storage.
**Theme B — Repo context injector & assembly pipeline.** ◻ Dynamic context gathering: file selections, git diff, graph nodes, branch status, and AST symbols compiled into prompt slots.
**Theme C — Tokenizer engine & budget simulator.** ◻ Client-side offline multi-tokenizer estimation (cl100k, o200k, Claude/Llama ratios) with context window saturation gauges.
**Theme D — First-class Prompt Lab UI.** ◻ Dedicated `prompts` view in the rail with split-screen authoring, context inspection drawer, and live variable preview.
**Theme E — Context window visualizer.** ◻ Interactive proportional visual map showing token breakdown (system prompt, repo context, user instructions, tools) against model context limits.
**Theme F — Multi-model evaluation & comparison run.** ◻ Side-by-side prompt execution and diff viewer across local Ollama models and installed Agent CLIs.

---

## Deliverables

### Theme A — Wire contracts & template storage engine `[M]`
- [ ] Define `PromptTemplateSchema` in `packages/shared/src/prompts.ts` with template metadata (id, title, description, tags, targetModels, systemPrompt, userTemplate, variables).
- [ ] Define `PromptVariableSchema` supporting string literals, file references, git diff tokens, and knowledge graph queries.
- [ ] Define IPC channels and schemas in `packages/shared/src/ipc/` for reading/writing templates from `.midnite/prompts/` in the active repo.
- [ ] Implement main-process prompt store in `packages/desktop/src/main/` managing `.midnite/prompts/` disk synchronization and app-wide user template library.
- [ ] Add unit tests in `packages/shared/src/prompts.test.ts` validating template parsing, variable substitution, and schema validation.

### Theme B — Repo context injector & assembly pipeline `[M]`
- [ ] Implement context collector service in `packages/app/src/features/prompts/context-collector.ts` resolving dynamic tokens: `{{repo.tree}}`, `{{repo.diff}}`, `{{file:path}}`, `{{graph:node}}`.
- [ ] Support token-budget truncation strategies (head, tail, smart summarization) when injected context exceeds budget limits.
- [ ] Connect context collector with `git-engine` via existing IPC bridges for live branch status, staged/unstaged diffs, and commit history.
- [ ] Connect with knowledge graph data store to pull relevant node context and dependencies into prompt variables.
- [ ] Unit tests for context assembly, token truncation, and syntax resolution.

### Theme C — Tokenizer engine & budget simulator `[M]`
- [ ] Implement lightweight offline token estimation engine in `packages/app/src/features/prompts/tokenizer/` with support for BPE heuristics, cl100k (GPT-4), o200k (GPT-4o), Claude 3/3.5, and Llama 3 tokenization ratios.
- [ ] Offload heavy token calculations to a web worker to ensure smooth 60fps UI performance during active prompt typing.
- [ ] Implement model context window definitions database (`MODEL_CONTEXT_LIMITS`) with token limits and pricing approximations for budget simulation.
- [ ] Unit tests verifying token counts across various code languages, markdown docs, and prompt structures.

### Theme D — First-class Prompt Lab UI `[L]`
- [ ] Register `prompts` in `VIEW_IDS` (`packages/shared/src/domain/view.ts`) and add navigation item with icon in rail / palette.
- [ ] Build `PromptsView` component in `packages/app/src/features/prompts/` featuring template explorer, metadata header, and split editor layout.
- [ ] Implement rich prompt template editor with syntax highlighting for variable placeholders (`{{variable}}`) and inline autocomplete.
- [ ] Build variable input panel allowing quick switching between preset variable sets and live test values.
- [ ] Add 1-click actions: "Copy Assembled Prompt", "Open in Chat", "Send to Terminal Agent", "Export as Markdown".

### Theme E — Context window visualizer `[M]`
- [ ] Build `ContextWindowGauge` component showing percentage of context window utilized against chosen target model.
- [ ] Build interactive stacked bar / treemap visualization displaying token breakdown: System Prompt vs Repo Context vs User Instructions vs Safety / Padding.
- [ ] Add visual warnings and budget cutoff markers when prompt approaches or exceeds 80% / 100% of context window limits.
- [ ] Tests for gauge math, threshold warnings, and responsive layout scaling.

### Theme F — Multi-model evaluation & comparison run `[L]`
- [ ] Implement test runner controller dispatching assembled prompt to selected models via `bridge.ollama` and `bridge.companion.ask`.
- [ ] Build side-by-side comparison matrix displaying response outputs, latency (TTFT / completion time), and estimated completion tokens.
- [ ] Add unified visual diff viewer highlighting semantic or syntactic differences between outputs of different models.
- [ ] Provide evaluation note taking and bookmarking of preferred outputs into the template history.
- [ ] Automated and visual component tests covering multi-model dispatch and response diff rendering.

---

## Files this phase touches

- [`packages/shared/src/domain/view.ts`](../../../packages/shared/src/domain/view.ts) — Add `prompts` to `VIEW_IDS`.
- [`packages/shared/src/prompts.ts`](../../../packages/shared/src/prompts.ts) — Shared schemas and domain types for prompts and variables.
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) — New channels for prompt template disk operations.
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — Zod payload schemas for prompt template CRUD.
- [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — Expose prompt bridge operations on `window.midniteStudio`.
- [`packages/desktop/src/main/prompts/`](../../../packages/desktop/src/main/prompts/) — Main process prompt template filesystem management.
- [`packages/app/src/features/prompts/`](../../../packages/app/src/features/prompts/) — Complete UI components, context injector, tokenizer worker, and comparison view.
- [`packages/app/src/components/nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) — Keybinding and navigation chord registration.

---

## Verification

- [ ] `moon run :typecheck :lint :test` passes clean across all packages.
- [ ] Unit tests pass for `packages/shared/src/prompts.test.ts`.
- [ ] Unit tests pass for context collector and variable resolution logic.
- [ ] Tokenizer worker tests pass with expected estimation accuracy across benchmark texts.
- [ ] Visual verification of `prompts` view rendering, context window visualizer gauge, and comparison runner in desktop dev/packaged app.

---

## Decisions / open questions

1. **Storage location:** Resolved. Templates persist primarily in `.midnite/prompts/*.md` inside the active repository for git tracking and team sharing, with a personal override directory in local app data.
2. **Inference pipeline:** Resolved. No new API keys are introduced; all execution reuses existing local Ollama bridges and installed agent CLI harnesses.
3. **Tokenizer architecture:** Resolved. Hybrid offline token estimation utilizing web workers for non-blocking calculations with fallback character-ratio heuristics.
