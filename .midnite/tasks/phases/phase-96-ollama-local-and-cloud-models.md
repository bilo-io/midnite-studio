# Phase 96 — Ollama: local and cloud models for agents

Brainstormed with the user · 2026-09-24 · seeded by "add Ollama to the toolchain, then the agent
CLIs Ollama supports (Claude Code, Codex, Cline, OpenCode, Copilot CLI), local and cloud models,
local model management, search and download, and a better model detail view". Grounded against the
tree and against the Ollama docs (`docs.ollama.com/integrations/*`, `/api`, `/cloud`, `/faq`,
`/macos`).

The roster already carries every agent this phase targets — `claude`, `codex`, `cline`, `opencode`
and `copilot` are all in `BUILTIN_AGENTS` — and the icon registry already imports `SiOllama`. What
the app cannot do is *see* Ollama, *manage* its models, or *point* an agent at one. This phase adds
Ollama as a toolchain item with a daemon status, a main-process Ollama client, a Models view
(installed, discover, cloud, pull queue) with a proper model-detail modal, and a per-agent
"backend: native | Ollama" that every launch path honours.

> **Builds on.**
> - **Toolchain.** `readSystemHealth()` ([`system-health.ts:69-136`](../../../packages/desktop/src/main/system-health.ts))
>   probes git/brew/node/pnpm/moon in parallel via `probeBinary(name, fallbackPaths)` (`:24`),
>   over `mstudio:system:health` ([`channels.ts:406`](../../../packages/shared/src/ipc/channels.ts),
>   `SystemHealthResponse` / `ToolchainBinarySchema` at [`ipc/schemas.ts:2395-2402`](../../../packages/shared/src/ipc/schemas.ts)).
>   The Health page lists a hardcoded `toolchainKeys` ([`health-page.tsx:121`](../../../packages/app/src/features/settings/settings-pages/health-page.tsx))
>   over `TOOLCHAIN_TOOLS` ([`toolchain-version.ts`](../../../packages/app/src/features/settings/settings-pages/toolchain-version.ts)).
>   It has **no install action** — a missing tool is a docs link. The Agent page's `submitCommand()`
>   ([`agent-page.tsx:156-170`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx))
>   is the "open a shell pty and queue the install command" precedent.
> - **Roster + launch.** `AgentDefinitionSchema` ([`shared/src/terminal.ts:130-198`](../../../packages/shared/src/terminal.ts))
>   has no env / base-URL / model field; users extend it through `agents.json`.
>   [`start-agent.ts:43-134`](../../../packages/app/src/features/terminal/start-agent.ts) types
>   `command + extraArgs + agentInvocationArgs + prompt` into a pty;
>   [`agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts) holds the per-agent
>   flags. `createPty` ([`pty-service.ts:520-537`](../../../packages/desktop/src/main/pty-service.ts))
>   passes `process.env` + `TERM_PROGRAM` + `GIT_TERMINAL_PROMPT` + `agentFingerprintEnv`
>   ([`pty-env.ts:18`](../../../packages/desktop/src/main/pty-env.ts)) — **no per-session env
>   exists**. The only per-launch override is `extraArgs` (`loopModelArgs`,
>   [`loops.ts:154-172`](../../../packages/shared/src/loops.ts); `LOOP_MODELS` is Claude-only).
> - **Models.** [`ai-models.ts`](../../../packages/shared/src/ai-models.ts) maps agent id →
>   `{cheap, fast}` and returns null for opencode/copilot/cline. The only model picker in the app is
>   `MODEL_OPTIONS` in [`card-composer.tsx:38,289`](../../../packages/app/src/features/projects/board/card-composer.tsx).
>   No model list or detail UI exists anywhere.
> - **Secrets.** [`secrets-vault.ts`](../../../packages/desktop/src/main/secrets-vault.ts) is a
>   `safeStorage` get/set/delete store keyed by `SECRET_KEYS = ['finance.twelveData']`
>   ([`domain/secrets.ts:5`](../../../packages/shared/src/domain/secrets.ts)). `agentApiKeys`
>   ([`ui-store.ts:1498`](../../../packages/app/src/store/ui-store.ts)) is plaintext renderer
>   state and is never injected into a pty.
> - **Local HTTP + progress streams.** [`dev-server-probe.ts`](../../../packages/desktop/src/main/dev-server-probe.ts)
>   is the main-side localhost precedent (its comment says why the renderer does not do this);
>   [`api-client/send.ts`](../../../packages/desktop/src/main/api-client/send.ts) is the main-side
>   HTTP client. Progress streams return an id from an invoke, then push
>   `mstudio:<domain>:<thing>-progress` events (`videoRenderProgress`, `apiRunProgress`,
>   `optimizerScanProgress` in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts)).
> - **Views + dialogs.** A view registers in `VIEW_IDS` ([`domain/view.ts:37`](../../../packages/shared/src/domain/view.ts)),
>   [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx),
>   `RAIL_VIEW_IDS` ([`nav-visibility.ts:10`](../../../packages/app/src/components/nav-visibility.ts)),
>   [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) and
>   [`title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx). Rich dialogs:
>   [`modal.tsx`](../../../packages/app/src/components/modal.tsx) (`sm|md|lg|full`),
>   [`issue-dialog.tsx`](../../../packages/app/src/features/issues/issue-dialog.tsx).

> **Ollama facts this plan relies on** (verified 2026-09-24 — re-check wording before hard-coding).
> - Daemon on `127.0.0.1:11434` (`OLLAMA_HOST` overrides), no auth. REST: `GET /api/tags`,
>   `POST /api/show` (`modelfile, parameters, template, license, details{family, parameter_size,
>   quantization_level}, model_info{<arch>.context_length, …}, capabilities[]`), `POST /api/pull`
>   (NDJSON `{status, digest, total, completed}`), `DELETE /api/delete`, `GET /api/ps`
>   (`size_vram, expires_at, context_length`), `POST /api/create`, `GET /api/version`.
>   OpenAI-compatible `/v1/*` and Anthropic-compatible `/v1/messages`.
> - **Default context is 4096** (`OLLAMA_CONTEXT_LENGTH`); every agent CLI integration asks for
>   **≥ 64k** and a model with **tool calling**.
> - **No official library search API** (ollama/ollama#9142); `ollama.com/search?q=&c=cloud` is
>   server-rendered HTML.
> - **Cloud:** `:cloud` (or older `-cloud`) model names through the local daemon after
>   `ollama signin`; or `https://ollama.com/api/*` / `/v1` directly with
>   `Authorization: Bearer $OLLAMA_API_KEY`. `https://ollama.com/api/tags` lists the cloud catalogue.
> - **Per agent:** Claude Code — env `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN=ollama`,
>   `ANTHROPIC_API_KEY=""`, `--model`. Copilot CLI — env `COPILOT_PROVIDER_BASE_URL=…/v1`,
>   `COPILOT_PROVIDER_API_KEY=`, `COPILOT_PROVIDER_WIRE_API=responses`, `COPILOT_MODEL`. Codex —
>   `codex --oss -m <model>`. Cline and OpenCode — config-file only; `ollama launch <agent>
>   --model <m> --yes -- <args>` configures and launches them.
> - macOS install: `Ollama.app` (dmg, macOS 14+; CLI symlinked to `/usr/local/bin/ollama`), or
>   brew cask `ollama-app` / formula `ollama`.

> **Scope guardrails.**
> - **Package boundaries hold.** Ollama payload schemas, the agent-backend field and the
>   per-agent launch recipe live in `shared` (zod only). Every HTTP call to the daemon or to
>   ollama.com lives in `desktop` main. The renderer reaches Ollama only through
>   `window.midniteStudio` — never a renderer `fetch` to `localhost:11434` or `ollama.com`.
> - **Every IPC op returns a `GitOpResult`-style envelope** — daemon down, model not found, pull
>   interrupted, scrape parse failure are rendered outcomes, never throws.
> - **Nothing writes a CLI's global config unless there is no other way.** Env vars and flags
>   first; `ollama launch` only for the two agents (Cline, OpenCode) that accept nothing else, and
>   the UI says so before the first launch.
> - **Never quit the user's daemon.** Other tools share it. The app starts it and unloads models;
>   it does not stop or restart the server.
> - **Destructive ops keep the confirm** — deleting a model shows its name, size on disk and
>   whether any agent default points at it.
> - **The API key lives in `secrets-vault.ts`**, never in `agentApiKeys` or any renderer storage;
>   the wire carries `hasKey: boolean` only.
> - **Icons are `react-icons` only** (`SiOllama` is already imported).
> - **macOS arm64 only**, like everything else.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

Dependency order: **B** first (everything reads through the client). **A**, **C**, **D**, **F**
then run in parallel. **E** needs **C**. **G** needs **E**. **H** needs **B** (per-session env is
independent and can start at once). **I** needs **E** and **H**.

## Deliverables

### A — Ollama in the toolchain (S) — ✅ DONE (PR #540, 2026-09-24)

- [x] `system-health.ts`: add `ollama` to the parallel probe with fallback paths
      `/usr/local/bin/ollama`, `/opt/homebrew/bin/ollama` and
      `/Applications/Ollama.app/Contents/Resources/ollama`.
- [x] Extend `ToolchainBinarySchema` / `SystemHealthResponse` with an `ollamaDaemon` block —
      `{reachable, version?, host}` from `GET /api/version` through Theme B's client, with a short
      timeout so an absent daemon never slows the Health page.
- [x] `toolchain-version.ts` + `health-page.tsx`: an Ollama row (binary version, daemon
      reachable/unreachable, host), with its docs and release links. Built as a **bespoke row**,
      not a `toolchainKeys` entry — the binary-vs-daemon distinction is a fact none of the four
      existing generic toolchain rows carry.
- [x] Install / Update actions on the Ollama row, reusing the Agent page's `submitCommand()` pty
      pattern: `brew install --cask ollama-app` when Homebrew is present, otherwise a link to the
      dmg. Update is `brew upgrade --cask ollama-app` (or the formula, whichever is installed).
- [x] **Start Ollama**: `open -a Ollama` when the app bundle exists, otherwise `ollama serve` in a
      detached background pty session. Re-probe until reachable (bounded) and render the result.
      No stop/restart control, by design.
- [x] Unit tests: probe fallback resolution, daemon-unreachable envelope, version parse.

### B — Main-side Ollama client and IPC (M) — ✅ DONE (PR #540, 2026-09-24)

- [x] New `desktop/src/main/ollama/client.ts`: `version`, `tags`, `show(model, verbose)`, `ps`,
      `pull(model)` (NDJSON stream), `delete(model)`, `create(from, name, parameters)`, `unload(model)`
      (`keep_alive: 0`). **Correction:** the base URL resolves from `OLLAMA_HOST` (default
      `http://127.0.0.1:11434`) only — there is no Settings ▸ Ollama page yet to read an override
      from (that's Theme C), and the `https://ollama.com` cloud base + vault key is Theme F's own
      scope, not built here.
- [x] `shared/src/ollama.ts`: zod schemas for `OllamaModel` (tags row), `OllamaModelDetail`
      (show — `capabilities`, `contextLength` derived from `model_info["<arch>.context_length"]`,
      `details`, `license`, `modelfile`, `template`, `parameters`), `OllamaRunningModel` (ps),
      `OllamaPullProgressEvent`, `OllamaSearchResultItem`. Parsing is tolerant: unknown fields pass
      through, missing optional ones never fail the whole payload.
- [x] IPC channels `mstudio:ollama:*` (`status`, `list`, `show`, `ps`, `pull`, `pullCancel`,
      `delete`, `create`, `unload`) in `channels.ts`, the bridge type and preload; a
      `mstudio:ollama:pull-progress` event stream, keyed by a pull id returned from `pull`.
      **Correction:** `search` is not wired in this PR — its real backing
      (`ollama/library-search.ts`, the ollama.com scraper) is Theme D's own deliverable, and a
      channel with no handler behind it is dead wiring. `OllamaSearchResultItem`'s shape is
      declared now so Theme D doesn't have to bikeshed naming.
- [x] A main-side pull queue: one active pull per model, cancel aborts the HTTP stream,
      progress coalesced to at most ~10 events/s per pull so a fast link does not flood IPC.
- [x] Unit tests against a stubbed HTTP server: NDJSON chunk splitting across reads, cancel
      mid-layer, 404 model, connection refused → `{ok:false, kind:'error'}`.

### C — The Models view (M) — ✅ DONE (PR #541, 2026-09-24)

- [x] Register `models` in `VIEW_IDS`, `view-registry.tsx`, `RAIL_VIEW_IDS`, `nav-icons.ts`
      (`SiOllama`) and `title-bar-nav.tsx`; a `view.models` command in
      [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) with no chord.
- [x] **Installed** tab: name, tag, family, parameter size, quantisation, size on disk, modified,
      capability chips (from a lazily-fetched `show`), and a **running** badge (VRAM, expires in)
      from `ps`, refreshed on focus and after every write.
- [x] Row actions: open detail (stubbed `onOpenDetail` hook — Theme E wires the real modal),
      unload (when running), delete behind a confirm naming the size. **Correction:** "any agent
      default that points at the model" is not named in the confirm — no per-agent binding exists
      yet (that's Theme H), so there is nothing true to say there until it lands.
- [x] **Pull by name** field (`qwen3.5:14b`, `gpt-oss:120b-cloud`) always visible — the fallback
      when Discover cannot parse.
- [x] Pull queue panel: per-layer progress bar, bytes/total, status line, cancel; survives
      switching views (state lives in `models-pull-queue-store.ts`, a zustand store fed by the
      `onPullProgress` event stream).
- [x] Daemon-down state: an empty state with **Start Ollama** (Theme A) instead of an error wall.
- [x] Settings ▸ Ollama page: host URL, default model for new agent bindings. **Correction:** the
      cloud API key row is a disabled placeholder (Theme F owns the vault key) and the "search
      cache" clear button is not built — Discover's cache is Theme D's own deliverable, and a
      clear button for a cache that does not exist yet would be dead UI.
- [x] vitest/jsdom coverage for the store transitions (queued → pulling → success / cancelled /
      failed) and the three empty states (loading, daemon-down, installed-empty).
- [x] **New, not in the original checklist:** a persisted Ollama host override
      (`ollamaSettingsGet`/`ollamaSettingsSet` IPC, `desktop/src/main/ollama/settings-store.ts` +
      `settings-service.ts`) — Theme B's client resolved only `OLLAMA_HOST`/the hardcoded default
      and explicitly deferred a configurable override to this theme's own Settings page.

### D — Discover: library search (M) — ✅ DONE (PR #543, 2026-09-24)

- [x] Main-side `ollama/library-search.ts`: fetch `https://ollama.com/search?q=<q>` and
      `?c=cloud&q=<q>`, parse name, description, capability tags (tools / thinking / vision /
      embedding / cloud), size variants, pull count and updated date into `OllamaSearchResult[]`.
- [x] Cache results per query for about an hour in main; a failed fetch serves the stale cache
      with a "last updated" note.
- [x] Parser tested against **committed HTML fixtures** (`__fixtures__/ollama-search.html`,
      `ollama-search-cloud.html`, `ollama-search-empty.html` — all three fetched live from
      ollama.com on 2026-09-24). **Correction:** the zero-row/non-empty-page failure code is
      `'parse'` (widening `GitOpFailureSchema`'s closed `code` enum in `domain/result.ts`), not the
      `reason:'parse'` shorthand this doc originally sketched — the repo's own envelope has no
      `reason` field, only `code`. The view falls back to pull-by-name with a link out to
      ollama.com/search.
- [x] **Discover** tab: search field (debounced 300ms), Local / Cloud scope toggle, capability
      filter chips, results as cards; a variant picker that pulls (`name:variant`), or for a cloud
      result appends the `-cloud` suffix (`toOllamaCloudModelName`) instead of downloading.
- [x] Already-installed results show "Installed" instead of Pull.

### E — Model detail modal (M) — ✅ DONE (PR #548, 2026-09-24)

- [x] `features/models/model-detail.tsx` on `modal.tsx` size `lg`, opened from an Installed row
      (`ModelRow`'s `onOpenDetail`, Theme C's own hook for this). **Correction:** Discover and Cloud
      rows are not wired — Themes D/F had not merged yet at branch time. The component's own doc
      comment flags the extension point (an `installed` prop swapping the `show`-backed sections for
      a Pull button) for whichever of D/F/I lands next against a real not-yet-installed row shape.
- [x] Header: name, tag, family, `SiOllama`, local size, modified date. **Correction:** no cloud mark
      yet — no cloud row is reachable in this PR.
- [x] Stat grid: parameter size, quantisation, **context length** (the model's own and the
      effective one — daemon default or `num_ctx`, via new `effectiveContextLength()`/`deriveNumCtx()`),
      architecture, embedding length where present (new `deriveEmbeddingLength()`).
- [x] Capability chips: whatever `show` reports (completion, tools, thinking, vision, embedding).
- [x] **Fit for agents** verdict: ✅ tools + effective context ≥ 64k; ⚠ with the reason ("no tool
      calling", "context 4096 — agents need 64k") and Theme G's fix inline. Also surfaced on
      Settings ▸ Agent's Ollama model picker (Theme H), the other place the phase doc calls for the
      warning.
- [x] Tabs for Modelfile, Template, Parameters and Licence, read-only, reusing `CodePreview` (files
      preview's existing code renderer — no Monaco on the modal's critical path).
- [x] Actions: Delete / Unload (as applicable), "Set as default for <agent>" (writes Theme H's
      `agentBackends`). **Correction:** Pull has no reachable "not installed" case yet (same D/F
      dependency as above); **Launch with…** is a disabled stub — Theme I's own hook, same precedent
      `ModelRow.onOpenDetail` set for this modal itself.
- [ ] **Not built — depends on Theme D/F, unmerged at branch time.** A Discover/Cloud result that is
      not installed opening the modal with search data and a Pull button instead of the `show`-backed
      sections — left for whichever of D/F/I lands next, per the correction above.

### F — Cloud models and account (M) — ✅ DONE (PR #543, 2026-09-24)

- [x] Widen `SECRET_KEYS` with `ollama.apiKey`; Settings ▸ Ollama sets and clears it through the
      vault. The wire shows `hasKey` only — via a new `secrets.has`/`mstudio:secrets:has` channel,
      since the existing `secrets.get` returns the plaintext value (fine for `finance.twelveData`,
      not for this key).
- [x] Sign-in detection: whether the local daemon can reach a cloud model (a cheap probe, `show`
      on `qwen3.5:cloud` — verified live on ollama.com the day this was written), rendered as
      "Signed in via `ollama signin`" / "Not signed in" with a button that runs `ollama signin` in
      a pty (reusing `agent-page.tsx`'s `submitCommand()` precedent — no new IPC channel needed
      for the button itself).
- [x] **Cloud** tab: the catalogue from `https://ollama.com/api/tags` (key-authenticated when a key
      is set), with the same card styling as Discover. **Correction:** no detail modal exists yet
      (Theme E, unbuilt) — both tabs' cards take an `onOpenDetail` no-op prop, matching
      `ModelRow`'s own convention, for Theme E to wire into later.
- [x] Naming normalised in `shared/src/ollama.ts`: `toOllamaCloudModelName`/`toOllamaBareModelName`/
      `isOllamaCloudModelName` — `:cloud`/`-cloud` for the local daemon, the bare name for direct
      `ollama.com` calls. Tested both ways plus a round-trip.
- [x] A cloud model is used through the local daemon when it is signed in, and through
      `https://ollama.com` with the vault key otherwise — `use-terminal-ipc.ts`'s `start()` checks
      `ollama.signInStatus()` + `secrets.has()` and switches `base` + sets a `useOllamaKey` marker
      accordingly. **This also closes Theme H's one open checkbox** (PR #542 left it explicitly for
      this theme): `PtyCreateRequest.useOllamaKey`, resolved only in main
      (`pty-service.ts#withResolvedOllamaKey`) into `ollamaLaunchRecipe`'s `authToken` — the key
      never crosses the bridge. `council-runner.ts` and the workflow agent executor run in main
      already, so they resolve the vault key directly with no marker needed.
- [x] Settings ▸ Ollama links to ollama.com/settings/keys and to the pricing page; the app never
      shows credit balances it cannot read.

### G — The context-length fix (S) — ✅ DONE (PR #548, 2026-09-24)

- [x] `shared/src/ollama.ts`: `agentFitness(detail, effectiveCtx)` → `{fit, reasons[]}` — pure
      function, unit-tested. `effectiveContextLength()`/`deriveNumCtx()` compute `effectiveCtx` from
      `/api/show`'s `parameters` block.
- [x] **Make a 64k variant**: one click (behind a confirm, naming the disk cost) calls `create` with
      `FROM <model>` + `PARAMETER num_ctx 65536` as `<model>-64k`. The original model is untouched.
      **Correction:** no per-layer progress stream — `ollama/client.ts`'s own doc comment on
      `ollamaCreate` (Theme B) already flagged that as out of scope for a one-shot action; the button
      shows a spinner via a plain mutation instead. "Offers it as the agent's model" is the existing
      "Set as default for <agent>" control once the variant is installed and its own detail reopened,
      not an automatic rebind.
- [x] The warning shows in the detail modal (Theme E) and the Settings ▸ Agent picker (Theme H).
      **Correction:** the per-launch picker (Theme I) doesn't exist yet — left for that theme, which
      can call the same `agentFitness()`. No global `OLLAMA_CONTEXT_LENGTH` change, anywhere.
- [x] `agentFitness()` takes no position on local vs. cloud — a caller for a cloud model passes
      whatever `effectiveCtx` its own catalogue implies (a large sentinel by default, per the phase
      doc's cloud-models-fit-by-default decision). No cloud caller exists yet (Theme F, unmerged at
      branch time); the function is ready for it.

### H — Agents on Ollama (L) — ✅ DONE (PR #542, 2026-09-24)

- [x] **Per-session env.** Extend the pty create request with an optional `env: Record<string,
      string>` (zod-validated, keys matching `^[A-Z_][A-Z0-9_]*$`), merged over `process.env` in
      `createPty` **after** the existing fingerprint env. An empty-string value is kept, not
      dropped (`ANTHROPIC_API_KEY=""` depends on it). The broker path carries it too.
- [x] `AgentDefinitionSchema` gains `backends?: ('ollama')[]` for the five supported agents in
      `BUILTIN_AGENTS`. A per-agent binding `{backend: 'native' | 'ollama', model?: string}` lives in
      the persisted agent preferences, not in `agents.json`.
- [x] `shared/src/ollama-launch.ts`: `ollamaLaunchRecipe(agentId, model, base)` → `{env, argsBefore,
      commandOverride?}`, a pure table:
  - [x] **claude**: env `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` (`ollama` locally, the vault
        key against `ollama.com`), `ANTHROPIC_API_KEY=""`; args `--model <m>`.
  - [x] **copilot**: env `COPILOT_PROVIDER_BASE_URL=<base>/v1`, `COPILOT_PROVIDER_API_KEY`,
        `COPILOT_PROVIDER_WIRE_API=responses`, `COPILOT_MODEL=<m>`.
  - [x] **codex**: args `--oss -m <m>` (no profile file written).
  - [x] **cline**, **opencode**: command becomes `ollama launch <agent> --model <m> --yes --`
        followed by the agent's usual args. **Correction:** the one-time notice naming the config
        file did not land — `ollamaLaunchRecipe` carries the `commandOverride` a UI notice would
        key off, but no toast/dialog was wired in this pass; a cheap Theme I follow-up.
- [ ] **Not built — depends on Theme F, unmerged at the time.** The vault key reaching the env in
      main only (a renderer `useOllamaKey: true` marker main resolves) needs a vault slot Theme F
      hasn't added yet. `ollamaLaunchRecipe`/`resolveAgentLaunch` already take an optional
      `authToken` parameter reserved for it, so wiring the marker through is additive once Theme F
      lands — implementing a marker with no vault behind it now would be dead wiring.
- [x] Every launch path resolves the binding: `start-agent.ts` (terminal and cards — which is also
      every loop, companion and sessions-view launch, since all of them call `startAgent()`),
      councils (`council-runner.ts`) and workflow agent nodes (`executors/agent.ts` →
      `node-sessions.ts`), all through the one `resolveAgentLaunch()` resolver. **Known gap:**
      `companion/ask.ts`'s one-shot headless ask (`runProcess`, not a pty) is a fourth,
      architecturally distinct launch path not wired to the resolver — out of this PR's four named
      paths, left for a follow-up.
- [x] Settings ▸ Agent: for each supported agent, a Backend select (Native / Ollama) and a model
      picker. **Correction:** installed models only (`window.midniteStudio.ollama.list()`) — the
      cloud catalogue is Theme F's own scope and Theme G's fit badge isn't built yet, so no badge
      renders; unsupported agents show no control.
- [x] Session identity: an Ollama-backed session carries `backend: 'ollama'` and the model, and its
      row shows a small `SiOllama` corner mark next to the agent icon.
- [x] Headless mode (`agentHeadlessArgs`) composes with the recipe for all five agents — tested
      (`ollama-launch.test.ts`, `council-runner.test.ts` exercises codex headless via a real
      binding).
- [x] Unit tests: every recipe row, the resolver's native/absent/modelless/unsupported-agent
      fallthrough, `PtyCreateRequest.env`'s shouty-snake key validation and empty-string
      preservation. The vault-key-never-in-a-renderer-payload test doesn't apply yet — no vault key
      is wired in this PR (see the Theme F dependency above).

### I — Launch surfaces (M)

- [ ] **Per-launch override**: the card composer's and loop's model picker gains an "Ollama" group
      (installed + cloud, fit badge) beside `LOOP_MODELS`; picking one runs that launch on Ollama
      whatever the agent's default is.
- [ ] **Launch with…** from the detail modal: pick a supported agent and a repo, then open a new
      interactive session through the same resolver.
- [ ] **Wand and Plan-with-AI on Ollama**: `ai-models.ts` gains an `ollama` provider entry, and
      `ai:improveField` / `ai:planBlueprint` accept it — calling `/api/chat` through Theme B's
      client (see Decisions), with the same timeout, cancel and one-retry-on-bad-JSON behaviour the
      CLI path has.
- [ ] Settings ▸ Agent: "Headless AI features use" → primary agent (today) or an Ollama model.

## Files this phase touches

| Area | Files |
|---|---|
| Contract | [`shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts), [`shared/src/agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts), [`shared/src/ai-models.ts`](../../../packages/shared/src/ai-models.ts), [`shared/src/loops.ts`](../../../packages/shared/src/loops.ts), [`shared/src/domain/secrets.ts`](../../../packages/shared/src/domain/secrets.ts), [`shared/src/domain/view.ts`](../../../packages/shared/src/domain/view.ts), [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts), [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), new `shared/src/ollama.ts`, new `shared/src/ollama-launch.ts` |
| Main | [`system-health.ts`](../../../packages/desktop/src/main/system-health.ts), [`pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts), [`pty-env.ts`](../../../packages/desktop/src/main/pty-env.ts), [`broker/`](../../../packages/desktop/src/broker/), [`secrets-vault.ts`](../../../packages/desktop/src/main/secrets-vault.ts), [`agent-probe.ts`](../../../packages/desktop/src/main/agent-probe.ts), [`companion/ask.ts`](../../../packages/desktop/src/main/companion/ask.ts), new `main/ollama/{client,library-search,pull-queue}.ts`, new `main/ipc/ollama-handlers.ts`, [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) |
| Renderer — toolchain/settings | [`health-page.tsx`](../../../packages/app/src/features/settings/settings-pages/health-page.tsx), [`toolchain-version.ts`](../../../packages/app/src/features/settings/settings-pages/toolchain-version.ts), [`agent-page.tsx`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx), new `settings-pages/ollama-page.tsx` |
| Renderer — models | new `features/models/` (view, installed / discover / cloud tabs, pull queue store, `model-detail.tsx`), [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx), [`nav-visibility.ts`](../../../packages/app/src/components/nav-visibility.ts), [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts), [`title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx) |
| Renderer — launch | [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts), [`card-composer.tsx`](../../../packages/app/src/features/projects/board/card-composer.tsx), the loop session hook, [`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx) |
| Fixtures | new `desktop/src/main/ollama/__fixtures__/ollama-search*.html` |

## Verification

- [ ] `moon run :typecheck :lint :test` green; no boundary rule suppressed; no renderer `fetch` to
      `localhost:11434` or `ollama.com` (grep in the PR).
- [ ] Health page with Ollama absent → Install runs the brew cask in a pty; after install the row
      shows the version and "daemon unreachable"; Start Ollama brings it to reachable.
- [ ] Models ▸ Installed lists what `ollama ls` lists, with matching sizes; a running model shows
      its VRAM and unload removes it from `ollama ps`.
- [ ] Pull `qwen3.5` from Discover: progress streams, cancel mid-pull leaves no half model in
      `ollama ls`, a second pull resumes.
- [ ] Delete a model that is an agent's default → the confirm names the agent; after delete the
      agent's picker flags the missing model.
- [ ] Discover with the network off → stale cache or pull-by-name fallback, no error wall; the
      parser test passes against the committed fixture.
- [ ] Detail modal of a 4096-context local model shows ⚠; Make 64k variant creates `<m>-64k` and
      the verdict turns ✅.
- [ ] With `ollama signin` done, a `:cloud` model is usable through the daemon; signed out with a
      vault key, the same agent runs against `https://ollama.com`.
- [ ] Each of claude, codex, copilot, cline and opencode starts on an Ollama model from Settings ▸
      Agent, from a card (per-launch override) and from "Launch with…", and answers a prompt that
      needs a tool call.
- [ ] A council member and a workflow agent node on an Ollama-backed agent both run headless.
- [ ] The wand rewrites a field with an Ollama model selected; with the daemon stopped it shows an
      error envelope, not a hang.
- [ ] The vault key appears in no renderer-bound IPC payload or persisted renderer store
      (unit test plus a devtools check).
- [ ] Human pass on a packaged build: install → pull → run Claude Code on a local model and Codex
      on a cloud model, end to end.

## Not in this phase

- A generic model-provider layer (LM Studio, OpenRouter, vLLM) — Ollama only; the recipe table is
  shaped so a second provider is a new column, not a rewrite.
- An in-app chat / playground against a model.
- A Modelfile editor beyond the one-click 64k variant.
- Stopping or restarting the Ollama daemon.
- Showing cloud credit balances or plan usage.
- Linux / Windows.

## Decisions / open questions

- **One phase covering toolchain, models hub and agent wiring** — resolved (user).
- **Hybrid launch wiring**: env for claude and copilot, `--oss -m` for codex, `ollama launch` for
  cline and opencode — resolved (user).
- **Discover scrapes ollama.com and caches it**, falling back to pull-by-name — resolved (user).
- **Models is its own rail view** plus a Settings ▸ Ollama page — resolved (user).
- **Cloud auth: both `ollama signin` and an optional vault-held `OLLAMA_API_KEY`** — resolved
  (user).
- **Context: warn plus a one-click `-64k` variant**, never a global `OLLAMA_CONTEXT_LENGTH`
  change — resolved (user).
- **Daemon: detect and start, never stop** — resolved (user).
- **Surfaces: per-agent default, per-launch override, Launch with… from the detail modal, and the
  wand / Plan-with-AI** — resolved (user).
- **Wand / Plan-with-AI on Ollama call `/api/chat` directly** — recommend. This narrows Phase 95's
  "no direct model HTTP API" rule for one case: Ollama is a local service with no key to store and
  no CLI to delegate to, and a pty round-trip would only add latency. Every other provider still
  goes through its CLI.
- **Scrape fetches run in main**, not the renderer — recommend (the `dev-server-probe` precedent,
  and the renderer CSP stays closed).
- **Cloud models count as fit for agents by default** — recommend; flag only when the catalogue
  says the context is under 64k.
- **Where the binding lives** — recommend persisted agent preferences, not `agents.json`, so a
  user's custom roster file is never rewritten. Revisit if bindings need to follow a repo.
- **`ollama launch` minimum version** — the Cline/OpenCode rows need an Ollama new enough to have
  `launch`. Recommend a version check in Theme A that disables those two backends with a clear
  "update Ollama" note.
- **Scrape fragility** — the committed fixture catches regressions in our parser, not upstream
  markup changes. Recommend a non-gating weekly check (like `website:sync-install`) if breakages
  prove frequent; not built in this phase.
