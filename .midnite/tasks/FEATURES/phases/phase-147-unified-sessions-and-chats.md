# Phase 147 — Unified sessions and chats

Planned 2026-11-14 · grounded against `2d4626d71`.

**Model:** every theme is a spec'd build for sonnet; no theme needs `Model: opus`.

Today `sessions` (persistent PTYs in `packages/features/sessions/` + `packages/features/terminal/`) and `chats` (turn-based headless CLI/Ollama threads in `packages/features/chats/`) live in separate stores, separate sidebars, and separate views. This phase unifies them behind one sidebar entry and a `Chat | Terminal` view toggle in the content header:

- **One session record, two render modes** — `UnifiedSessionViewMode` (`'chat' | 'terminal'`) and provider capability flags (`nativeResume`, `headlessChat`, `interactivePty`) in `@midnite/studio-shared`.
- **Single-runner lock & handoff** — `claude`, `codex`, and `agy` share a single `engineSessionId` across Chat and Terminal, parking/stopping the PTY before a headless Chat turn and resuming PTY on toggle back.
- **Honest fallback for other providers** — the remaining 9 CLI agents (`cursor`, `copilot`, `openclaude`, `opencode`, `kilo`, `aider`, `cline`, `grok`, `goose`) and `ollama` still get the sidebar entry and toggle, using transcript-summary handoff (Chat → Terminal) and isolated thread/PTY panes without pretending shared native state.
- **Unified sidebar & content toggle** — one merged list in the Sessions/Chats sidebar with an in-header `Chat | Terminal` segmented toggle and capability tooltip.

> **Builds on.**
> - **Shared contracts** — `packages/shared/src/chats.ts` (`Chat`, `ChatMode`), `packages/shared/src/terminal.ts` (`TerminalSessionRecord`, `buildResumeCommand`), `packages/shared/src/agent-invocation.ts`.
> - **Features** — `packages/features/chats/main/engines.ts` (purpose-built drivers for `claude`, `codex`, `agy` + generic stdout driver), `packages/features/chats/main/chat-service.ts`, `packages/features/sessions/renderer/sessions-view.tsx`, `packages/features/terminal/renderer/`.
> - **Desktop adapters** — `packages/desktop/src/main/agent-conversation/index.ts` (`claude` and `codex` transcript UUID locators).
>
> **Depends on:** none. **Unlocks:** single-pane agent workspace across Studio.
>
> **Scope guardrails.** Keep `shared ◀ frame ◀ feature ◀ app` and `shared ◀ runtime ◀ feature/main ◀ desktop` boundaries intact (`eslint.config.mjs`). Do not parse raw PTY ANSI output into structured `ChatMessage` turns. Do not run headless `stream-json` and an interactive PTY simultaneously on the same `engineSessionId`.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — Shared unified session contract (`PR-1`, S).** ✅ Already on main from #1248: `UnifiedSessionViewModeSchema`, `ProviderSyncTierSchema` and `getProviderSyncTier` in `chats.ts` (`claude`/`codex`/`agy` bidirectional, `ollama` chat-only, rest handoff-only); optional `linkedTerminalId`/`preferredView` on `ChatSchema` and `linkedChatId`/`preferredView` on the terminal session record; `session:switch-view` request/response schemas, channel and optional `window.midniteStudio.sessions.switchView`. Tests live in `chats.test.ts` and `terminal.test.ts`. No code change was needed, only this doc catch-up. The `engineSessionId` link stays on the existing `ChatEngineSessionSchema`; Theme C owns any new field.

**Theme B — Antigravity PTY resume support (`PR-3`, S).** ✅ Already landed in #1246 (`buildResumeCommand` returns `["--conversation", id]` for `agy`, tested in `terminal.test.ts`); this PR only ticks the deliverables.

**Theme C — Unified session host & runner lock (`PR-2`, L).** ✅ The host landed in #1250 (filed as "Phase 146 Theme C"): `UnifiedSessionCoordinator` + `unified-session-host.ts` in `packages/desktop/src/main/`, the `session:switch-view` handler, `ChatService` `beforeSend`/`onTurnEnd` hooks, and persisted `linkedChatId`/`linkedTerminalId`/`preferredView`. This theme hardened the lock: `send()` now holds a `starting` slot across the `beforeSend` await (two quick sends could each start a turn on one `engineSessionId`), validates before locking and releases through `onTurnEnd` if the turn fails to start, and `isRunning` covers that window. The coordinator keeps a per-chat lease, refuses a second chat on an `engineSessionId` already held, and releases the keys taken at send time, since a resend rotates the session id and used to leave the old one locked for good.

**Theme D — Unified sidebar & Chat/Terminal toggle UI (`PR-4`, L).** ✅ The UI landed in #1251 (filed as "Phase 146 Theme D"): `mergeManagedSessions` dedupes linked chat/terminal pairs into one row with a `Chat`/`Terminal` mode pill, `SessionViewToggle` sits in the content header (hidden for plain shells, `Terminal` disabled with a tooltip for `ollama`), and `UnifiedSessionContent` keeps `ChatPane` mounted while hidden so the composer draft survives a toggle. This theme closed two gaps: a rejected `switchView` now toasts instead of leaving an unhandled rejection, and the in-flight guard is a ref, since two clicks in one tick both read the stale `switchingTarget` state and sent two switches. The terminal pane still remounts on toggle back, by design: the coordinator parks the PTY for a Chat turn and resumes it, so there is no live xterm to keep.

**Theme E — Generic provider handoff & verification (`PR-5`, M).** ✅ Most of it landed in #1253 (filed as "Phase 146 Theme E"): `buildTranscriptHandoffPrompt` in `unified-session-coordinator.ts` seeds the last six Chat turns (2,400 chars, 500 per turn) into a new `handoff-only` PTY behind the agent's `agentInteractiveArgs`, `ollama` is refused Terminal in the coordinator and disabled in the toggle, and `unified-sessions-chats.spec.ts` drives sidebar selection and the toggle against a real xterm. This theme closed the banner gap: it now follows the design — amber, the doc's copy, and a `LuX` dismiss that hides it for that chat while the pane lives, without touching the composer — with a jsdom test for the dismiss and an e2e step that dismisses it. The spec needs CI's 15 s expect timeout on a cold Vite server; locally that means `CI=1`.

## Deliverables

### Theme A — Shared unified session contract (`S`)

- [x] **147.A.1** Add `UnifiedSessionViewModeSchema` (`z.enum(['chat', 'terminal'])`), `ProviderSyncTierSchema` (`z.enum(['bidirectional', 'handoff-only', 'chat-only'])`), and `getProviderSyncTier(agentId)` to `packages/shared/src/chats.ts` (returning `'bidirectional'` for `claude`, `codex`, `agy`; `'chat-only'` for `ollama`; `'handoff-only'` otherwise).
- [x] **147.A.2** Extend `ChatSchema` (`linkedTerminalId?: string`, `preferredView?: UnifiedSessionViewMode`) and `TerminalSessionRecordSchema` (`linkedChatId?: string`, `preferredView?: UnifiedSessionViewMode`) in `packages/shared/src/chats.ts` and `packages/shared/src/terminal.ts` with backwards-compatible optional defaults.
- [x] **147.A.3** Add Zod IPC request/result schemas for `session:switch-view` (`{ sessionId, targetView, handoffMode }`) in `packages/shared/src/ipc/` and expose on `window.midniteStudio`.
- [x] **147.A.4** Unit-test `getProviderSyncTier` and backward-compatible schema parsing in `packages/shared/src/chats.test.ts` and `packages/shared/src/terminal.test.ts`.

### Theme B — Antigravity PTY resume support (`S`)

- [x] **147.B.1** Update `buildResumeCommand(agent, conversationId)` in `packages/shared/src/terminal.ts` to return `['--conversation', trimmedId]` when `agent.id === 'agy'` and `conversationId` is non-empty.
- [x] **147.B.2** Add unit tests in `packages/shared/src/terminal.test.ts` covering `agy` with and without a `conversationId`.

### Theme C — Unified session host & runner lock (`L`)

- [x] **147.C.1** Add a main-side `UnifiedSessionCoordinator` (in `packages/desktop/src/main/` wiring `ChatService` + `TerminalService`) that tracks active runner ownership (`'chat' | 'terminal' | 'idle'`) per `engineSessionId`.
- [x] **147.C.2** Implement `switchView` IPC handler: for `bidirectional` providers (`claude`, `codex`, `agy`), cleanly park/stop an active PTY before starting a Chat turn and spawn/resume the PTY with `buildResumeCommand(agent, engineSessionId)` when toggling back to Terminal.
- [x] **147.C.3** Guard `ChatService.send` so a turn fails cleanly with `GitOpResult`/`ChatOpResult` error if the linked PTY is mid-turn and cannot be parked, never mutating the same `engineSessionId` concurrently.
- [x] **147.C.4** Persist `preferredView` and `linkedChatId`/`linkedTerminalId` across restarts in `chat-store.ts` and `terminal-store.ts`.
- [x] **147.C.5** Add integration tests in `packages/desktop/src/main/` proving exclusive runner locking and `engineSessionId` handoff across Chat ↔ Terminal.

### Theme D — Unified sidebar & Chat/Terminal toggle UI (`L`)

- [x] **147.D.1** Merge chat threads and terminal/agent sessions into a unified list item model in `packages/app/src/compose/` + `packages/features/sessions/renderer/sessions-view.tsx`, deduplicating linked pairs into one row.
- [x] **147.D.2** Add a segmented `Chat | Terminal` view toggle in the active session content header, disabling `Terminal` for `chat-only` (`ollama`) with a clear tooltip.
- [x] **147.D.3** Render the active view (`ChatPane` or `TerminalView`) inside the unified content container, preserving scroll/composer draft state when toggling.
- [x] **147.D.4** Add Vitest/jsdom tests for unified row deduplication, header toggle state, and `ollama` disabled-terminal behavior.

### Theme E — Generic provider handoff & verification (`M`)

- [x] **147.E.1** Implement one-way transcript-summary handoff when toggling `handoff-only` providers (`cursor`, `copilot`, `openclaude`, `opencode`, `kilo`, `aider`, `cline`, `grok`, `goose`, custom) from Chat → Terminal, seeding a concise context prompt into the new PTY.
- [x] **147.E.2** Show a non-blocking banner in Chat view for `handoff-only` providers noting that interactive Terminal turns are not synced back into the Chat thread.
- [x] **147.E.3** Add Playwright functional e2e coverage in `packages/app/e2e/` verifying unified sidebar selection and `Chat | Terminal` view toggling.

## Visual & UI/UX Design

All tokens follow Tailwind semantic theme variables (`border-border`, `bg-accent`, `text-foreground`, `text-muted-foreground`, `bg-muted`) and `react-icons/lu` icons.

```
+-----------------------------------------------------------------------+
| Sidebar (Unified List) | Content Header: [Title]  [Chat | Terminal]   |
|------------------------|----------------------------------------------|
| | [icon] Claude fix..  | (if handoff-only)                            |
| |   [Chat]  2m         | [i] Terminal turns aren't synced back.  [x]  |
|   [icon] Local Ollama  |----------------------------------------------|
|     [Chat]  5m         |                                              |
|   [>_]   zsh (shell)   |   Active Pane (ChatPane or TerminalView)     |
|             12m        |                                              |
+-----------------------------------------------------------------------+
```

- **Sidebar row badge (`sessions-view.tsx`):**
  - Uses `SESSION_ROW_HEIGHT_CLASS` with `border-l-2` (`border-primary bg-accent` when selected; `border-transparent hover:bg-accent/60` on hover; `focus-visible:ring-1 focus-visible:ring-ring`).
  - Trailing mode pill: `inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground` with `LuMessageSquare` (`Chat`) or `LuTerminal` (`Terminal`) at `h-3 w-3`. Linked `bidirectional` pairs show a single deduplicated row reflecting `preferredView`.
- **Segmented `Chat | Terminal` toggle (Content header):**
  - Placed right-aligned in the content header (`flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5`), adjacent to `ChatWidthToggle` (Chat mode) or terminal actions.
  - `role="group" aria-label="Session view"` container: `flex shrink-0 items-center rounded-md border border-border p-0.5`.
  - Segments (`Chat` with `LuMessageSquare`, `Terminal` with `LuTerminal`): `inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors text-muted-foreground hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground`.
  - Hidden for standalone shell-only terminals (`!agentId`). While `session:switch-view` is in flight, the target segment shows `opacity-70` and disables double-clicks; errors surface via `useToastStore` while keeping composer draft intact.
- **Disabled `Terminal` tooltip (`ollama` / `chat-only`):**
  - `Terminal` segment renders `aria-disabled="true"` with `cursor-not-allowed text-muted-foreground/50 opacity-60 hover:text-muted-foreground/50`, wrapped in `Tooltip` with `"Ollama runs in Chat mode only — no interactive terminal CLI"`.
- **Non-blocking `handoff-only` banner (`ChatPane`):**
  - Rendered below the content header for `handoff-only` providers when `linkedTerminalId` exists or after a Chat → Terminal handoff: `flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200`.
  - Leading `LuInfo` (`h-3.5 w-3.5 shrink-0 text-amber-400`), copy `"Interactive Terminal turns are not synced back into this Chat thread."`, and trailing dismiss `IconButton` (`LuX`, `ml-auto`) that hides the banner for the session without blocking input.

## Verification

- [ ] `moon run :typecheck :lint :test` passes green with zero boundary violations.
- [x] `moon run app:e2e` passes the unified sessions/chats toggle spec.
- [ ] Manual check: toggle a `claude` session Chat → Terminal → Chat and verify conversation continuity without concurrent-lock errors.
- [ ] Manual check: toggle a generic provider (`aider` or `opencode`) and confirm handoff banner + `ollama` disabled-terminal tooltip.

## Decisions / open questions

- Should standalone shell-only terminals (no `agentId`) show only the Terminal view (hiding the toggle) or offer an "Attach agent chat" action? Default assumption: hide the toggle for plain shells without an `agentId`.
- **Verified (`agy --help`):** Antigravity (`agy`) interactive mode accepts `--conversation <id>` (`--conversation  Resume a previous conversation by ID`) alongside `--prompt-interactive` and headless `-p` / `--output-format stream-json`, so Theme B can wire `['--conversation', trimmedId]` in `buildResumeCommand`.
