# Phase 133 — Councils threads and synthesis

**Refined: x1** · 2026-11-13 · root cause, data model & contract, functionality & edge cases, UI/UX & interaction, empty / loading / error states, persistence & migration, security, testing & verification, file-map precision

Planned 2026-11-13 by an unattended agent · grounded against the tree as of `5a4e8729b`.

A council run in the screenshot the user sent never finished: the Synthesis tab showed "⚠ Timed out waiting for a
response." above a fragment of its own input ("include] ### Environment Artist (You will define the art"), and the
left rail still said **Running**. The view also hides which agent and model each member runs on, keeps the composer at
the bottom of the config panel, and treats every prompt as a one-shot run with no way to continue it. This phase fixes
the synthesis at its root, shows every terminal state accurately, and turns a run into a thread: provider icons and
model pickers per member and synthesizer, the Chats composer in the content area, member and synthesis tabs drawn as
chat threads, follow-up turns that continue each member's own CLI session, turn counts in the thread list, and a "+"
that creates a council in place (optionally recommended by a small, fast model).

> **Builds on.**
> - **Councils** (Phase 34, rearranged in Phase 42, packaged in Phase 113 Theme N):
>   [`council-runner.ts`](../../../packages/features/councils/main/council-runner.ts) spawns each member and the
>   synthesizer as a one-shot login shell through `CouncilRunnerPorts.createPty` and types the command into it;
>   [`council.ts`](../../../packages/shared/src/council.ts) is the wire contract; the renderer polls
>   `council:run:get` while a run is live.
> - **The agent CLIs' print modes** in [`agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts)
>   (`agentHeadlessArgs`) and the model catalogue in [`ai-models.ts`](../../../packages/shared/src/ai-models.ts)
>   (`modelsForAgent`, `cheapModelFor`, `fastModelFor`).
> - **The AI-thread kit** the app hands to Chats through its host port: `AiComposer`, `ProviderModelPicker`,
>   `MarkdownBody`, `resolveAgentIcon` ([`chats-host.tsx`](../../../packages/app/src/compose/chats-host.tsx), and
>   Agents' plain versions in [`agents-hosts.tsx`](../../../packages/modules/agents/renderer/compose/agents-hosts.tsx)).
> - **Confinement** (Phase 121 Theme E): Seatbelt keeps reads open outside secrets, so a prompt file under `$TMPDIR`
>   stays readable by a confined member.
>
> **Scope guardrails.** No new synthesis formats (brainstorm only), no per-repo councils, no streaming token-by-token
> output (print mode returns whole answers), no council sharing. macOS only, `react-icons` only, every new test a
> vitest unless it names the browser capability it needs.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — Synthesis fix and accurate status.** ✅ The prompt goes to a `0600` `prompt.txt` beside a `run.sh` in a
fresh `midnite-council-*` temp dir, and the shell is only typed `/bin/sh '<run.sh>'; exit $?`, so zsh never redraws a
long line. agy and claude answer in print-mode JSON (`parseCouncilAnswer` in `council-cli.ts`); members, the synthesis
and the run record `timeout` and `cancelled` beside `failed`; a run with no answers skips the synthesis; `council:run:cancel`
stops a turn; a run left live by a closed app reads as interrupted; the rail polls while a run is live.

**Theme B — Provider icons and model pickers.** ✅ Members and the synthesizer carry an optional catalogue `model`
(`councilCliArgs` → `--model`, skipped under an Ollama binding); agy's catalogue lists the 3.8 Flash, Argon and Hydrogen
tiers with `gemini-3.8-flash-low` as fast/cheap. Member tabs, assistant turns and the config rows show each agent's
mark; the config rows and the synthesizer row use the provider/model picker.

**Theme C — Chats composer and thread UI.** ✅ The chat column, `CopyButton`/`copyText` and the stick-to-bottom helpers
moved into `packages/frame/src/chat/`. Chats' `AiComposer` docks under the thread through the host port; each member
tab and the Synthesis tab draw every turn as a user bubble plus an assistant turn (mark, model, status, markdown,
copy, Skip/Retry) with a working row and elapsed seconds while live.

**Theme D — Continue a run.** ✅ `council:run:continue` archives the latest turn into `turns`, resumes each member's
and the synthesizer's CLI session (agy `--conversation`, claude `--resume`) and carries a ≤ 1,500-character excerpt of
the last synthesis. Proven live: a two-turn thread on two Antigravity members and a Claude Haiku synthesizer.

**Theme E — Thread list turns, new-council modal and recommend.** ✅ Thread rows show the first prompt, status and
turn count; the rail header has New thread and New council. The modal (portalled to the body) can ask the fastest
installed CLI (claude haiku, then agy Flash, then codex mini) for a panel, validated by zod and edited before Create.

## Root cause (Theme A)

`spawnOneShot` built `agy -p '<prompt>'; exit $?` and typed it, byte for byte, into an interactive login shell.
`shellQuote` collapses every run of whitespace to one space, so the synthesis prompt (topic, instructions and every
member's full answer, up to 500 KB each) became a single line tens of kilobytes long. zsh's line editor echoes and
redraws that line at 120 columns; the redraw takes longer than the 120 s timeout, so the CLI either never ran or ran
late. On timeout the captured buffer was the shell's echo of its own input, and `cleanCapturedOutput` could not strip
it because the redrawn echo no longer matched the invocation string, so a slice of the prompt
(`[failed — no answer to include] ### Environment Artist (…`) was stored as the synthesis. Members were hit less
because their prompts are short. Separately, the rail's run list (`useCouncilRuns`) never polled, so it kept the
**Running** it read when the run started, and a run persisted mid-flight stayed `running` forever after a quit.

## Build order

1. **A** first: the runner and schema changes every other theme reads.
2. **B** and **D** next (B adds `model` to the schema; D adds `turns` and session ids). They touch the same schema
   file, so they land in sequence on one branch.
3. **C** after B and D: the thread UI renders turns and icons.
4. **E** last: the list rows and the modal.

## Deliverables

### A — Synthesis fix and accurate status (M)

- [x] The prompt never goes through the shell's line editor
  - `spawnOneShot` writes the scrubbed prompt to a `0600` `prompt.txt` and the invocation to a `run.sh` in a fresh
    `mkdtemp` directory under `os.tmpdir()`, and types `/bin/sh '<run.sh>'; exit $?` (a short, fixed-length line).
    The directory is removed when the member or synthesis settles.
  - Newlines in the prompt survive (no `shellQuote` collapse), so the CLI reads the prompt as written.
- [x] Structured output for the CLIs that have it
  - agy: `--output-format json` → `{ conversation_id, status, response }`; claude: `--output-format json` →
    `{ session_id, result, is_error }`. Both verified against agy 1.5.8 and claude on this machine.
  - `parseCouncilAnswer` (new, pure, `council-cli.ts`) finds the last JSON object line, returns
    `{ text, sessionId?, error? }`; anything else falls back to the cleaned text (codex, opencode).
  - A JSON answer with `is_error: true` or a non-`SUCCESS` status settles as `failed` with the CLI's message.
- [x] Claude joins `COUNCIL_MEMBER_PROVIDERS` (it has a print mode, `-p`); the stale "no headless flag" comment goes.
- [x] Every terminal state is recorded for members, the synthesis and the run
  - Member status gains `cancelled`; run status gains `timeout` and `cancelled`; a new `synthesisStatus`
    (`running | succeeded | failed | timeout | cancelled`) says what happened to the synthesis itself.
  - A synthesis that times out sets the run to `timeout`, not `failed`; a synthesis that fails sets `failed`.
  - A run whose every member failed still synthesizes nothing: it settles `failed` with
    "No member answered, so there was nothing to synthesize." instead of spending a synthesis call.
- [x] Cancel a run: `council:run:cancel` kills every live pty, marks running members `cancelled`, the synthesis
  `cancelled` and the run `cancelled`. Returns the `GitOpResult` envelope.
- [x] Interrupted runs are reconciled: a run read as `running`/`synthesizing` that this process is not tracking
  (the app quit mid-run) is rewritten to `failed` with "Interrupted: the app closed while this run was in flight."
- [x] The rail stops saying Running: `useCouncilRuns` polls while any run in the list is live, and a settled
  `useCouncilRun` invalidates the list.
- [x] Tests: `council-runner.test.ts` (temp-file command shape, JSON parse, timeout → `timeout`, cancel, reconcile,
  no-answer short-circuit), `council-cli.test.ts` (parser), `council.test.ts` (new statuses parse; old runs parse).

### B — Provider icons and model pickers (M)

- [x] `CouncilMember.model` and `Council.synthModel` (optional strings, catalogue ids); a run snapshots them as
  `CouncilRunMember.model` and `CouncilRun.synthModel`. Absent means "the CLI's default".
- [x] The model reaches the CLI: `councilCliArgs` (via `councilCliModel(provider, model)`) maps a catalogue id to `--model <cliModel>`
  (Claude's `LOOP_MODELS` ids and `haiku`; agy's ids pass through). Skipped when the agent is bound to Ollama
  (that binding already sets `--model`).
- [x] agy's catalogue is current: `cheapModelFor('agy')`/`fastModelFor('agy')` become `gemini-3.8-flash-low`
  (agy 1.5.8 rejects `gemini-2.5-flash`), and `modelsForAgent('agy')` lists the Flash, Argon and Hydrogen tiers.
- [x] The CouncilsHost port gains `resolveAgentIcon`, `ProviderModelPicker`, `useAgentRoster` (Studio and Agents
  wire the same members their Chats hosts get).
- [x] Icons everywhere a provider shows: each member tab and the Synthesis tab carry their agent's mark in its accent;
  the config rows and the synthesizer row use the provider/model picker, which shows the mark in the trigger and in
  every option.
- [x] Tests: `ai-models.test.ts` (agy rows), `council-cli.test.ts` and `council-runner.test.ts` (model flag present,
  absent for default), `council-thread.test.tsx` (each member tab and its model label; the marks themselves are checked
  in the gate shots).

### C — Chats composer and thread UI (L)

- [x] Chats' presentational thread pieces move down into the frame (`packages/frame/src/chat/`): `copyText`,
  `CopyButton`, `scrollToBottom`, `isNearBottom`, and the column constants (`chat-column.ts`). Chats imports them
  from `@midnite/studio-frame`; behaviour unchanged.
- [x] The CouncilsHost port gains `AiComposer`, `MarkdownBody`, `composerBoxClassName` (the Chats host's members).
- [x] The composer leaves the config panel and docks under the thread in the centre pane (`CouncilComposer`), with
  the injection banner it already had. Enter sends; Stop cancels a live run.
- [x] A member tab is a thread: per turn, the user's prompt as a bubble and the member's answer as an assistant turn
  (agent mark, markdown body, copy, status line, error callout). The Synthesis tab is the same, with the synthesizer.
- [x] A live turn shows a working row (spinner, elapsed seconds, Skip for a member) instead of a raw pty dump.
- [x] Empty states: "Start a thread" with the composer below it (the rail says "No runs yet"); a new council lands
  on the composer.
- [x] Tests: `council-thread.test.tsx` (bubbles and answers per turn, terminal status text), the frame's
  `chat-column.test.ts` (moved) and `stick-to-bottom.test.ts` (near-bottom maths, reduced-motion scroll).

### D — Continue a run (M)

- [x] `CouncilRun.turns` holds the earlier turns of the thread (prompt, each member's answer and status, the
  synthesis), oldest first; the top-level fields stay the latest turn, so a run written before this phase parses as a
  one-turn thread (zod default `[]`, no store version bump).
- [x] Each member and the synthesizer keep their CLI session id (`sessionId`, `synthSessionId`) from the JSON answer.
- [x] `council:run:continue { runId, prompt }`: refuses while the run is live; moves the latest turn into `turns`,
  resets members to `running` with the new prompt and launches them.
  - A member with a session resumes it (agy `--conversation <id>`, claude `--resume <id>`); one without starts fresh.
  - The follow-up prompt is the new prompt plus a bounded excerpt of the previous synthesis (≤ 1,500 characters,
    marked as an excerpt), never the other members' transcripts.
  - The synthesizer resumes its own session and synthesizes the new answers.
- [x] Retry and skip keep working on the latest turn.
- [x] Tests: `council-runner.test.ts` (resume flags, excerpt carried, history kept), `council-prompts.test.ts`
  (`buildFollowUpPrompt`, excerpt bound).

### E — Thread list turns, new-council modal and recommend (M)

- [x] Each thread row shows its turn count ("3 turns") beside the status, and its title is the first prompt.
- [x] A "+" button ("New council", beside "New thread"), right-aligned in the rail's header row (back button, council
  title), opens the new-council modal;
  the top-level list keeps its own "New council" entry, which opens the same modal.
- [x] The modal asks for a name (and optional description). "Recommend members" takes a one-line brief and asks a
  small, fast model for a council (members with name, role, agent; a synthesizer); the result is listed for the user
  to edit or remove before Create.
- [x] `council:recommend { name, brief, providers }` runs in main: tries the installed CLIs in order claude (haiku), agy
  (Flash), codex (mini), falling through on failure, asks for JSON only, validates it with zod
  (`CouncilRecommendationSchema`, 2–6 members, providers from `COUNCIL_MEMBER_PROVIDERS`) and returns the
  `GitOpResult` envelope. A parse failure is a normal `{ ok: false }` the modal shows.
- [x] `council:create` accepts optional `members` and `synthProvider`/`synthModel`, so a recommended council is
  created in one call; without them the starter members are seeded as before.
- [x] Tests: `council-recommend.test.ts` (parse, clamp, bad JSON, fall-through), and in `council-thread.test.tsx` the
  run list (title, status, turn count) and the modal (recommendation rows editable, error shown, starter fallback).

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| [`packages/shared/src/council.ts`](../../../packages/shared/src/council.ts) | A B D E | statuses, model, turns, session ids, recommend schema |
| [`packages/shared/src/ipc/`](../../../packages/shared/src/ipc/) | A D E | `council:run:cancel`, `council:run:continue`, `council:recommend` |
| [`packages/shared/src/ai-models.ts`](../../../packages/shared/src/ai-models.ts) | B | agy rows |
| [`packages/features/councils/main/`](../../../packages/features/councils/main/) | A B D E | runner, output parser, prompts, recommend |
| [`packages/features/councils/renderer/`](../../../packages/features/councils/renderer/) | A–E | thread view, composer, config rows, list, modal, host port |
| [`packages/frame/src/chat/`](../../../packages/frame/src/chat/) | C | net-new: the thread kit moved from Chats |
| [`packages/features/chats/renderer/`](../../../packages/features/chats/renderer/) | C | imports the kit from the frame |
| [`packages/app/src/compose/councils-host.tsx`](../../../packages/app/src/compose/councils-host.tsx) | B C | new host members |
| [`packages/modules/agents/renderer/compose/agents-hosts.tsx`](../../../packages/modules/agents/renderer/compose/agents-hosts.tsx) | B C | new host members |

## Verification

- [x] Targeted checks green: `tsc --noEmit` on shared, frame, councils, chats, app, agents module; eslint on every
  changed file; vitest on the touched suites; `councils.spec.ts` e2e 8/8 (the workspace-wide gate is not run on this
  machine).
- [x] **Gate — a real council run, end to end, in the dev app** with a throwaway `--user-data-dir`: two members on
  Antigravity (`gemini-3.8-flash-low`) and a Claude synthesizer (`haiku`), a short prompt. Screenshots under
  `/tmp/midnite-shots-p133/`: both member tabs with real answers, the Synthesis tab with a real synthesis, the rail
  showing the run as done, and a follow-up turn continuing the thread. Mocks do not count. Not merged until it passes.
  Passed 2026-11-13: each turn completed in 12 s, both members and the synthesis `succeeded` with session ids, and the
  rail read "Done · 2 turns".
- [x] Shots of the new-council modal with a recommendation, and of the config rows with icons and model pickers.

## Not in this phase

- **Streaming answers token by token.** Print mode returns whole answers; a stream-json reader per CLI is its own
  piece of work.
- **Model lists probed live from each CLI** (`agy models`). The catalogue is a snapshot, as `ai-models.ts` says.
- **Codex and OpenCode structured output and resume.** Neither CLI is installed here to verify flags against; they
  keep the text path and start a fresh session per turn.
- **Branching or editing an earlier turn.** A thread only grows at the end.

## Decisions / open questions

All resolved; the option picked in each case was the recommended one.

1. **Resolved — prompt by temp file, not by typing, and still through the host's pty port.** Spawning the CLI directly
   with `child_process` would avoid the shell, but it would bypass the host's confinement (Phase 121 Theme E), which
   lives in `createPty`. A `0600` temp file plus a fixed-length typed line keeps confinement and fixes the redraw.
2. **Resolved — print-mode JSON for agy and Claude.** It returns the answer without the TUI's spinners and gives the
   session id that Theme D resumes. CLIs without it keep the text path.
3. **Resolved — a run is the thread; earlier turns live in `turns`.** Keeping the latest turn in the top-level fields
   means every existing reader (retry, skip, audit) keeps working and old runs need no migration beyond a zod default.
4. **Resolved — the follow-up carries a synthesis excerpt, not the transcripts.** Each member already has its own
   history in its resumed session; the excerpt (≤ 1,500 characters) is the shared pointer to where the council landed.
5. **Resolved — the AI-thread kit reaches Councils through its host port**, as it reaches Chats. Those components live
   in the app, not in the chats feature; only Chats' own presentational helpers move down into the frame.
6. **Resolved — recommend with the fastest installed CLI** (Claude haiku, then agy Flash, then codex mini), JSON
   validated with zod, so a recommendation is cheap and a bad answer is an ordinary error.
