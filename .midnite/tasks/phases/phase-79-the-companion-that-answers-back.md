# Phase 79 — The companion that answers back

**Brainstormed** · 2026-09-08 · seven decisions settled in the session (see Decisions); the rest
carry a recommendation.

Every agent surface in this app is a terminal you type into. The FAB opens four loops
([Phase 35](phase-35-fab-mission-control.md)), the quick-access menu opens Loops and Notes
([Phase 58](phase-58-notes-and-the-menu.md)), a note hands itself to `/midnite-exec-adhoc`, a board
card runs an agent ([Phase 41](phase-41-agentic-kanban.md)), and the status bar has a popover whose
whole body is still the string *"Midnite Assistant Menu (Blank for now)"*. All of it is silent, and
all of it waits for a keyboard.

This phase adds a **companion**: a chat thread in its own resizable panel, with a microphone and a
send button docked at the bottom, that **greets you, tells you where the repo stands, hands your
request to a real agent session, fills the wait with something better than a spinner, and reads
the answer back**. It is deliberately *not* a new inference path. The concierge script is
deterministic. The thinking is done by the agent CLI the app already launches, either in a pty
the user can see or headlessly through the process runner councils already use. The companion's
job is grounding, routing, timing and voice.

**Three things the scan found that shape this design.**

**First: the hand-off already exists.**
[`features/agent/use-skill-handoff.ts:28`](../../../packages/app/src/features/agent/use-skill-handoff.ts)
resolves the primary agent and starts a pty session with the skill string typed and **not sent**
(`autoSend: false` at `:71`). `AGENT_COMMANDS` in
[`features/agent/agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts)
already names `execBacklog`, `execAdhoc`, `execSwarm`, `brainstorm`, `refine`, `addressIssue`,
`prReview`, `prFeedback`, and `DEFAULT_AGENT_SKILLS` in
[`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) maps them to user-overridable
skill strings. "Ask it to start an adhoc task, a swarm, a backlog task" is a call into that seam,
not a launcher.

**Second: the companion needs no MCP client.** [Phase 57](phase-57-mcp-server.md) built an MCP
*server* — eight tools (`repo.list`, `repo.resolve`, `status.get`, `graph.log`, `diff.file`,
`branch.list`, `forge.pulls`, `forge.checks`) behind
[`main/mcp/dispatch.ts:37`](../../../packages/desktop/src/main/mcp/dispatch.ts)
`dispatchMcpCall(tool, rawInput)`. The companion lives in the same process, so "uses MCP to
understand the state of the editor" means calling the dispatcher directly and getting the same
zod-validated, size-capped, audited answers an external agent would — without a socket round-trip
and without the server being enabled (it is off by default in `mcp-store.ts`).

**Third: "the response is ready" is already a signal.**
[`main/activity-detect.ts`](../../../packages/desktop/src/main/activity-detect.ts) classifies every
agent pty as thinking, waiting or idle from per-agent marker regexes and emits it over
`mstudio:pty:activity` (`channels.ts:866`). The loading state ends on that event, not a timer.

**And one thing it found missing.** There is no speech, audio or `AudioContext` code anywhere in
the app, and **Chromium's `SpeechRecognition` does not work in Electron** — it routes to Google's
speech service with an API key Electron does not ship, and fails with a network error. Text-to-speech
via `speechSynthesis` *does* work and uses the macOS voices. So voice-out is free and voice-in needs
a provider, which is Theme F's whole shape.

**Builds on.**
- [`components/fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx) and the
  `fabPanel` `useResizable` block at [`app.tsx:682`](../../../packages/app/src/app.tsx) — the
  right-docked resizable column the companion panel sits beside. `LAYOUT_BOUNDS.fabPanelWidth`
  (`ui-store.ts:425`, `{ min: 240, max: 640 }`) is the geometry precedent.
- [`features/quick-access/quick-access-menu.tsx:21`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx)
  — the frozen `ROWS` array with mnemonics `L` · `N` · `I` · `G`. The `C` leaf goes here.
- [`features/status-bar/assistant-menu.tsx:33`](../../../packages/app/src/features/status-bar/assistant-menu.tsx)
  — the blank popover, the "trigger from the assistant" the brief names.
- [`styles.css:1814-1847`](../../../packages/app/src/styles.css) — the `.gradient-frame[data-loop-state]`
  cadence rules and `fabGlowClass` at `app.tsx:1445`. Theme H adds a sibling attribute, not a
  second animation system.
- [`main/process-runner.ts:126`](../../../packages/desktop/src/main/process-runner.ts) `runProcess`
  and [`main/council-runner.ts:83`](../../../packages/desktop/src/main/council-runner.ts) — the
  headless-agent precedent: spawn, cap output at `OUTPUT_TAIL_CAP`, time out, cancel.
- [`main/db/credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts) — the
  only `safeStorage` consumer today; the STT key follows its shape.
- [`main/browser-security.ts:49`](../../../packages/desktop/src/main/browser-security.ts) — the
  handler pair that refuses every permission. Theme F carves out exactly one: `media` (audio only)
  for the app's own renderer origin.
- [`shared/src/agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts) — the
  precedent for framework-agnostic logic both processes need living in `shared`. The phrase banks
  and the intent grammar follow it.
- [Phase 46](phase-46-lock-screen-and-motion.md) — the motion policy every Theme H keyframe
  honours; [Phase 62](phase-62-one-escape-one-dismissal.md) / [Phase 68](phase-68-where-focus-goes.md)
  — the overlay stack and focus-restoration policy the panel joins.
- [Phase 77](phase-77-thirteen-megabytes-of-editor.md) — total JS is 35.4 MB against a 15.95 MB
  budget. Nothing in this phase adds a renderer dependency; the STT SDK, if any, is desktop-only.

**Scope guardrails.**
- **No new inference path.** No Anthropic SDK, no API key for a model. Headless calls go through
  the installed agent CLI via `runProcess`. If the CLI is absent the companion still greets,
  grounds and routes — it just cannot summarise.
- **No MCP client.** In-process `dispatchMcpCall` only.
- **No local speech model.** whisper.cpp is a named sequel (see Not in this phase).
- **No audio assets.** Whistling and elevator music are WebAudio synthesis; phrase banks are JSON.
  Quotes are unattributed by design and must be public-domain or original.
- **Default off.** The companion, the mic, and hands-free run are three separate switches, all
  off until Settings ▸ Companion turns them on.
- **Typed-not-sent stays the default.** `autoSend: true` is passed only when the hands-free switch
  is on, and only after the companion has spoken the command it is about to run.
- **The Loops panel is not touched** beyond sharing the right edge. No fifth tab, no glow changes
  inside it.
- **`shared` gets data and pure functions only** — phrase banks, the intent grammar, the
  companion channel schemas. Nothing that imports `electron`, `node:*` or React.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Companion state and the phrase banks (S)

One state machine, one store, and the words it says, as data.

- [ ] Add [`packages/shared/src/companion.ts`](../../../packages/shared/src/companion.ts) with
      `export type CompanionState = 'off' | 'idle' | 'greeting' | 'listening' | 'thinking' | 'speaking' | 'handoff'`
      and a pure `transition(state, event): CompanionState` table. `handoff` is the state while a
      pty the companion started is still `thinking`/`waiting`; it returns to `idle` on `exit` or
      an `idle` activity event. Every illegal transition returns the current state rather than
      throwing — the store never needs a try/catch.
- [ ] Phrase banks in the same module, typed as `readonly string[]` per kind: `greetings`,
      `signoffs` ("okay, as per your request", "here we are", …), `fillers` (fun facts),
      `quotes` (unattributed), `musicOffers`. Each entry may contain `{name}`, resolved from the
      honorific setting; an empty honorific collapses the surrounding punctuation cleanly
      (`"okay {name}, here we are"` → `"okay, here we are"`), covered by a test.
- [ ] `export function pickPhrase(bank, recent: string[]): string` — random, but never one of the
      last `min(3, bank.length - 1)` picks. Deterministic under an injected RNG for tests.
- [ ] Add [`packages/app/src/store/companion-store.ts`](../../../packages/app/src/store/companion-store.ts):
      `state`, `transcript: CompanionTurn[]` (`{ id, role: 'companion' | 'user' | 'agent', text, at, spoken: boolean }`),
      `recentPhrases`, `activeHandoff: { sessionId, command } | null`. `persist` only `transcript`
      (last 200 turns) under `midnite-studio.companion`, `version: 1`, no `migrate`, with the
      identical-argument `adoptRenamedPersistKey` call the other stores make at module scope.
- [ ] Settings live in `ui-store.ts`, not the companion store, beside the other preferences:
      `companionEnabled: false`, `companionHandsFree: false`, `companionHonorific: ''`,
      `companionVoice: string | null` (a `speechSynthesis` voice URI), `companionMusicOffer: true`.
      Add them to `partialize` and to the Phase 63 orphan-preference guard test.
- [ ] `companion.test.ts`: transition table is total (every state × every event yields a state),
      `pickPhrase` never repeats within the window, honorific interpolation handles empty.

### B — Grounding: the snapshot and the digest (M)

What the companion knows before it says anything.

- [ ] Add `CHANNELS.companionSnapshot = 'mstudio:companion:snapshot'` (invoke) in
      [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) and a
      `CompanionSnapshotSchema` in `shared/src/companion.ts`: `{ repo: RepoDescriptor | null, repos: number, branch, ahead, behind, dirty: { staged, unstaged, untracked }, sessions: { live, thinking, waiting }, openPulls, failingChecks }`.
      Every field is something an existing MCP tool or the terminal registry already returns;
      the handler composes, it does not parse git itself.
- [ ] Main handler in [`packages/desktop/src/main/companion/snapshot.ts`](../../../packages/desktop/src/main/companion/snapshot.ts)
      builds it by calling `dispatchMcpCall('repo.list')`, `'status.get'`, `'branch.list'`,
      `'forge.pulls'`, `'forge.checks'` for the active repo, plus the pty registry's live-session
      activity. Forge calls are best-effort with a 3 s cap — a snapshot with `openPulls: null` is
      valid and the script says "I couldn't reach GitHub" rather than stalling the greeting.
- [ ] Add `CHANNELS.companionDigest = 'mstudio:companion:digest'` and `CompanionDigestSchema`:
      `{ landed: DigestItem[], inProgress: DigestItem[], since: number }` where
      `DigestItem = { kind: 'commit' | 'pr' | 'phase', title, ref, at }`.
- [ ] Digest handler in `main/companion/digest.ts`: **landed** = `graph.log` on the default branch
      since the last time the companion greeted this repo (persisted per repo in the snapshot
      store; first run uses 7 days), merged PRs from `forge.pulls`, and `.midnite/tasks/done.md`
      entries newer than that mark when the file exists. **In progress** = open PRs, non-default
      branches ahead of the default branch, and `_INDEX.md` rows marked WIP. All NUL-delimited git
      through the existing engine; the tracker files are read with the fs jail
      (`fs-scope.ts`) since they sit inside the repo.
- [ ] A pure `summariseDigest(digest): string[]` in `shared/src/companion.ts` that turns the digest
      into 2–5 spoken sentences ("Since Friday, three PRs landed — the browser occlusion fix, …;
      two are still open") with counts collapsed past five items. Unit-tested on fixtures.
- [ ] Preload exposure on `window.midniteStudio.companion.{snapshot, digest}` and the bridge type
      in `shared`.

### C — The panel (M)

A second right-docked column, left of the Loops panel, with the thread and the input bar.

- [ ] Add `companionPanelOpen` / `setCompanionPanelOpen` / `toggleCompanionPanel` to `ui-store.ts`
      beside `fabPanelOpen` (`:628`), and `companionPanelWidth: 360` with
      `LAYOUT_BOUNDS.companionPanelWidth = { min: 280, max: 720 }` beside `fabPanelWidth` (`:369`,
      `:425`). Persist the width; do not persist the open flag (the companion greets on open, and a
      greeting on every launch is a nuisance).
- [ ] Mount [`packages/app/src/features/companion/companion-panel.tsx`](../../../packages/app/src/features/companion/companion-panel.tsx)
      in [`app.tsx`](../../../packages/app/src/app.tsx) as a fifth `useResizable` instance next to
      `fabPanel` (`:682`), ordered so that with both open the DOM reads
      `main · companion · loops`. Its resize handle sits on its left edge; the Loops panel's handle
      is unchanged.
- [ ] The panel body is a `PanelStack` from
      [`components/panel-stack/`](../../../packages/app/src/components/panel-stack/) with one
      root panel (the thread), so `panel.back`/`panel.forward` work if a later theme pushes a
      detail panel. Header: companion glyph, state label ("Listening…"), detach button wired to
      the Phase 55 detach machinery with `surface: 'companion'`.
- [ ] Thread: virtualised list of `CompanionTurn`s, newest at the bottom, auto-scroll that stops
      when the user scrolls up, a "Jump to latest" chip. Agent turns render the ANSI-stripped text
      in a collapsed `<details>` with the spoken summary as the summary line (Theme E).
- [ ] Docked input bar: a growing textarea (Return sends, Shift+Return newlines), a **microphone**
      icon button (`LuMic` / `LuMicOff` from `react-icons/lu`) and a **send** button
      (`LuSendHorizontal`). Mic is `disabled` with a `disabledReason` tooltip until Theme F's
      provider is configured ("Add a speech key in Settings ▸ Companion"). Send is disabled on
      empty input and while `state === 'thinking'`.
- [ ] Add the `C` leaf to `ROWS` in
      [`quick-access-menu.tsx:21`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx):
      label "Companion", mnemonic `C`, `disabled` with `disabledReason: 'Enable in Settings ▸ Companion'`
      while `companionEnabled` is false. Order: `L` · `C` · `N` · separator · `I` · `G`.
- [ ] Add `companion.toggle` to `COMMANDS` in
      [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts), group `view`,
      **no chord** (the `Mod+l` menu plus `C` is two keys; a third chord on this letter is not
      worth a terminal carve-out). Palette label comes from `COMMANDS`, per the rule in `CLAUDE.md`.
- [ ] The panel joins the Phase 62 overlay stack only for its transient popovers (voice picker);
      the panel itself is a layout column, not an overlay, and Escape inside the textarea clears it
      rather than closing the panel.

### D — The concierge flow (M)

The scripted opening. No model call anywhere in this theme.

- [ ] On `setCompanionPanelOpen(true)` from `idle`, run `greet()`: pick a greeting, speak and post
      it, request the snapshot, then post and speak a **static overview** built from it: repo name,
      branch, ahead/behind, dirty counts, live sessions. One sentence per fact, skipped when zero.
- [ ] If `snapshot.repos > 1`, append the offer: "Want to switch to another one?" and render a
      compact repo chooser under the turn. Choosing calls the existing `setActiveRepo`; the flow
      restarts from the overview for the new repo. Saying or typing "no" / "stay" / "this one"
      dismisses it (Theme E's grammar owns the words).
- [ ] Then request the digest and speak `summariseDigest(...)`. Persist the per-repo "last greeted"
      mark only after the digest has been spoken, so an interrupted greeting is replayed next time.
- [ ] End with an open prompt from the `prompts` bank ("What shall we do?"). Transition to `idle`
      (or `listening` if the hands-free switch is on and a provider is configured).
- [ ] A companion that is already open when the active repo changes re-runs the overview and
      digest for the new repo, without the greeting.
- [ ] Every scripted turn is **interruptible**: a click on the mic, a keypress in the textarea, or
      Escape cancels the current utterance (`speechSynthesis.cancel()`), marks the turn
      `spoken: false`, and skips to the open prompt.
- [ ] `concierge.test.ts` drives the flow against a fake snapshot/digest and a fake speaker, and
      asserts the turn order, the skip-when-zero rule and the interrupt path.

### E — Hand-off and read-back (L)

From "start a swarm" to hearing what the swarm did.

- [ ] **Intent grammar**, pure, in `shared/src/companion.ts`:
      `export function parseIntent(text: string): CompanionIntent` where
      `CompanionIntent = { kind: 'command', id: AgentCommandId, body?: string } | { kind: 'switchRepo', name?: string } | { kind: 'dismiss' } | { kind: 'music', on: boolean } | { kind: 'repeat' } | { kind: 'freeform', text }`.
      Verbs come from a table keyed by `AgentCommandId` ("adhoc", "ad hoc task", "swarm",
      "backlog", "next task", "brainstorm", "refine", "review", …). Word-boundary matching,
      case-insensitive, the trailing remainder becomes `body`. Table-driven tests, one row per
      verb, plus negatives ("swarm of bees" is freeform).
- [ ] `kind: 'command'` → `useSkillHandoff()({ skillId: id, repo, body, title })`. The returned
      `TerminalSession.id` is stored as `activeHandoff`, the companion speaks the command it typed
      ("I've typed `/midnite-exec-adhoc` in a new session — press Return when you're ready", or
      with hands-free on, "running `/midnite-exec-swarm` now") and transitions to `handoff`.
      `autoSend` is `companionHandsFree && providerConfigured` and never otherwise.
- [ ] `kind: 'freeform'` → a **headless summariser/router call** through a new
      `mstudio:companion:ask` channel handled in `main/companion/ask.ts` with `runProcess` on the
      primary agent's CLI in print mode (`claude -p`, or the `agentInvocationArgs` equivalent for
      the roster entry), system prompt = the snapshot as JSON plus the list of `AgentCommandId`s,
      user prompt = the text, 30 s timeout, output capped by `OUTPUT_TAIL_CAP`. The reply is
      constrained to JSON `{ say: string, intent?: CompanionIntent }` and re-parsed with zod; a
      reply that fails to parse is spoken as "I didn't follow that" and posted raw in the thread.
      If no CLI is installed the channel returns `{ ok: false, kind: 'error' }` and the companion
      falls back to typing the text verbatim into a fresh agent pty.
- [ ] **Watching the hand-off.** Subscribe to `mstudio:pty:activity` and `mstudio:pty:exit` for
      `activeHandoff.sessionId`. `thinking` keeps the loading state alive; the first `waiting` or
      `idle` after at least one `thinking` ends it. A session that never reports `thinking` within
      20 s of `autoSend` (or of the user's Return, detected via `mstudio:pty:input` echo) speaks
      "it hasn't started yet — did you press Return?" once.
- [ ] **Read-back.** On loading end, fetch the session's last turn: `mstudio:pty:snapshot` for the
      scrollback, cut at the last prompt marker from the roster's `awaitingInput` regex, strip ANSI
      with a small pure `stripAnsi` in `shared` (tested against xterm control sequences, OSC titles
      and cursor moves). Post it as an `agent` turn. Then call `companion:ask` with a fixed
      "summarise for speech in 2–4 sentences" prompt and speak: sign-off phrase, then the summary.
      If the summariser is unavailable, speak the first 240 characters of the cleaned text
      instead, then "the rest is in the thread".
- [ ] Speech is **skippable**: a second click on the speaking FAB, Escape in the panel, or a
      spoken/typed "stop" cancels and marks the turn `spoken: false`. Cap any single utterance at
      60 s by splitting on sentence boundaries and dropping the tail with "…and more in the thread".
- [ ] `kind: 'repeat'` re-speaks the last companion turn; `kind: 'switchRepo'` reuses Theme D's
      chooser, matching `name` against repo names case-insensitively.
- [ ] A hand-off whose session ends with a non-zero exit posts the exit code, speaks "that session
      ended with an error — the details are in the thread", and returns to `idle`.

### F — Voice (L)

Voice-out is free. Voice-in gets a provider seam and a permission carve-out.

- [ ] **TTS** in [`features/companion/speaker.ts`](../../../packages/app/src/features/companion/speaker.ts):
      a queue over `window.speechSynthesis` with `speak(text, { onBoundary, onEnd })`, `cancel()`,
      `voices()`. Uses the `companionVoice` URI when set, else the default voice for the app
      locale. Word-boundary events feed Theme H's speaking pulse. Guard for the well-known
      Chromium bug where long utterances go silent after ~15 s: chunk on sentence boundaries under
      ~200 characters.
- [ ] Voice picker in Settings ▸ Companion listing `speechSynthesis.getVoices()` (async — voices
      load after `voiceschanged`), with a "Say hello" preview button. Filter to the app locale by
      default, with a "Show all" toggle.
- [ ] **Permission carve-out** in
      [`main/browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts): the
      app's own renderer session grants `media` **only** when the request's `mediaTypes` is exactly
      `['audio']` **and** the requesting origin is the app's own (`file://` bundle or the dev
      server origin). Every browser-pane `WebContentsView` session keeps refusing everything. Add
      a test for both branches; the existing "refuses every permission" test stays and now asserts
      the browser session specifically.
- [ ] **Capture** in `features/companion/recorder.ts`: `getUserMedia({ audio: true })` on first
      mic press, `MediaRecorder` in `audio/webm;codecs=opus`, chunks every 250 ms. Push-to-talk
      by default (hold the mic button or the spacebar while the textarea is empty); a
      "tap to toggle" option in Settings. Release → stop → hand the blob to main.
- [ ] **Provider seam** in `shared/src/companion.ts`:
      `SttProviderId = 'openai-whisper' | 'deepgram'`, and in
      [`main/companion/stt/`](../../../packages/desktop/src/main/companion/stt/) an interface
      `SttProvider = { transcribe(audio: Uint8Array, mime: string, signal: AbortSignal): Promise<string> }`
      with one implementation shipped (see Decision 8) and a `fake.ts` for tests. Channel
      `mstudio:companion:transcribe` (invoke, `Uint8Array` structured-cloned like `pty:data`) with a
      15 s timeout, returning `GitOpResult<{ text: string }>`.
- [ ] **Key storage**: `main/companion/stt/credentials.ts` mirrors
      [`db/credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts) —
      `safeStorage.encryptString`, on disk under `userData`, never in `localStorage`, never crossing
      to the renderer in plaintext. Settings ▸ Companion has a masked field with "Test" that runs a
      one-second silent clip through the provider and reports the round-trip time.
- [ ] Transcript text lands in the textarea, **not** sent: the user reads it and presses Return
      (or, with hands-free on, it is submitted after a 1.5 s pause during which pressing any key
      cancels). Mic errors (denied, no device, provider 401/429) are spoken once and shown inline
      with the recovery step.
- [ ] `listening` state is entered on capture start and left on transcript arrival or cancel;
      Theme H keys the FAB off it.

### G — The loading personality (M)

What happens between "on it" and "here we are".

- [ ] `features/companion/filler.ts`: while `state === 'handoff'` or `'thinking'`, after a **6 s**
      quiet threshold, speak one item from `fillers` or `quotes` (alternating), then wait
      **25–40 s** (randomised) before the next. Never start a filler while the agent is `waiting`
      (it is asking the user something), and never speak over a read-back.
- [ ] **Whistle synth** in `features/companion/audio/whistle.ts`: a single `OscillatorNode`
      (sine, gentle vibrato via a second LFO oscillator on `detune`) through a `GainNode`
      envelope, playing one of five short melodies encoded as `[midi, beats][]` in
      `shared/src/companion.ts`. Melodies are original, eight to twelve notes. Volume follows the
      system output; a "Companion volume" slider in Settings scales the master gain.
- [ ] **Elevator loop** in `features/companion/audio/elevator.ts`: a 16-bar loop of two
      triangle-wave chords plus a soft filtered-noise brush on beats 2 and 4, looped via
      `AudioBufferSourceNode` rendered once with an `OfflineAudioContext`. Fades in over 2 s,
      fades out over 1 s on any state change away from loading.
- [ ] After **20 s** of loading with `companionMusicOffer` on, speak one item from `musicOffers`
      ("Shall I put on some elevator music?"). "yes" / "sure" / "go on" (grammar `kind: 'music'`)
      starts the loop; "no" dismisses for this hand-off. Never offered twice in one hand-off.
- [ ] The `AudioContext` is created lazily on the first sound and suspended (not closed) when idle
      for 60 s, so a silent companion costs no audio thread — measured with
      `scripts/perf/idle-cpu.mjs` before and after, numbers in the PR.
- [ ] Every filler, whistle and loop stops instantly on: read-back start, mic press, textarea
      keypress, panel close, window blur if the Phase 36 visibility gates say the window is hidden.
- [ ] Tests: scheduler timings under fake timers (threshold, spacing, the no-overlap rules), and
      the melody encoder against a golden set of frequencies.

### H — FAB choreography, the popover, and Settings (M)

The companion's face, and where its switches live.

- [ ] A `data-companion-state` attribute on the FAB button (`app.tsx:1445`) and on the FAB panel's
      `gradient-frame` host, mirroring `data-loop-state`, driven from `companion-store`. Values:
      `idle` (no rule — today's look wins), `listening`, `thinking`, `speaking`, `handoff`.
- [ ] `styles.css` rules beside the `[data-loop-state]` block (`:1814`): **listening** — a slow
      2.4 s breathing scale on the conic-gradient border with the hue shifted cool (teal/blue) and
      a soft inset glow; **thinking** — the conic border rotates (`@property --angle`, 3 s
      linear infinite) with the box-shadow pulsing 0 → 24 px; **handoff** — the thinking rotation
      at half speed with the loop-running hue, so it reads as "an agent has it"; **speaking** —
      the body gradient brightens and the box-shadow radius is set from a CSS variable
      `--companion-level` (0–1) that `speaker.ts` bumps on each word boundary and decays over
      180 ms, so the glow pulses with the words.
- [ ] Companion state **wins over** loop state on the FAB when both are non-idle (the companion is
      the thing you are talking to), except `waiting` from a loop still shows its amber ring
      underneath as an inset — an agent asking you something must never be hidden by a whistle.
- [ ] Reduced motion (Phase 46's policy): no rotation, no breathing, no pulse — each state becomes
      a static hue and a fixed glow radius. Covered by the existing motion-policy test harness.
- [ ] The status-bar **assistant popover**
      ([`assistant-menu.tsx`](../../../packages/app/src/features/status-bar/assistant-menu.tsx))
      replaces its placeholder body with: the current state label with the same glyph the FAB
      uses, the last companion turn (two lines, ellipsised), a "Repeat" row, and an "Open
      companion" row that calls `setCompanionPanelOpen(true)`. While `companionEnabled` is false it
      shows one row: "Enable the companion in Settings".
- [ ] **Settings ▸ Companion** page: add `'companion'` to `SettingsPageId` (`ui-store.ts:176`), a
      `SETTINGS_PAGES` row (`group: 'tools'`, beside `mcp` at `:239`), a `PAGE_CONTENT` entry and a
      `SETTINGS_PAGE_ICON` in `nav-icons.ts`. Sections: **Enable companion** (master switch) ·
      **Voice** (voice picker, preview, volume) · **Microphone** (provider, masked key, Test,
      push-to-talk / toggle) · **Hands-free run** (default off, with the same explanatory copy
      pattern as Git Safety's force-push switch) · **Personality** (honorific, music offer). The
      page appears in the palette for free via `providers.ts:166`.
- [ ] e2e: a Playwright spec that enables the companion via settings, opens it from the quick-access
      menu with `C`, asserts the greeting turn renders, types "start an adhoc task", and asserts a
      new terminal session appears with the skill string typed and not executed. Speech and audio
      are stubbed at the `window` level in the fixture.

## Files this phase touches

| Package | Path | Themes |
|---------|------|--------|
| shared | [`src/companion.ts`](../../../packages/shared/src/companion.ts) (new: state machine, phrase banks, `parseIntent`, `stripAnsi`, `summariseDigest`, schemas, melodies) | A B D E G |
| shared | [`src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) (`companion:snapshot`, `:digest`, `:ask`, `:transcribe`) | B E F |
| shared | [`src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) (`companion.toggle`, chord-free) | C |
| desktop | [`src/main/companion/`](../../../packages/desktop/src/main/companion/) (new: `snapshot.ts`, `digest.ts`, `ask.ts`, `stt/`) | B E F |
| desktop | [`src/main/browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts) (audio-only carve-out for the app origin) | F |
| desktop | [`src/main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts) (called, not changed) | B |
| desktop | [`src/preload/`](../../../packages/desktop/src/preload/) (bridge for the four channels) | B E F |
| app | [`src/features/companion/`](../../../packages/app/src/features/companion/) (new: panel, thread, input bar, `speaker.ts`, `recorder.ts`, `filler.ts`, `audio/`) | C D E F G |
| app | [`src/store/companion-store.ts`](../../../packages/app/src/store/companion-store.ts) (new) | A |
| app | [`src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (panel open/width, settings, `SettingsPageId`, `SETTINGS_PAGES`) | A C H |
| app | [`src/app.tsx`](../../../packages/app/src/app.tsx) (fifth `useResizable`, panel mount, `data-companion-state` on the FAB) | C H |
| app | [`src/features/quick-access/quick-access-menu.tsx`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx) (`C` leaf) | C |
| app | [`src/features/status-bar/assistant-menu.tsx`](../../../packages/app/src/features/status-bar/assistant-menu.tsx) (placeholder → mini transcript) | H |
| app | [`src/features/settings/settings-pages/companion-page.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx) (new) | H |
| app | [`src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) (settings page icon) | H |
| app | [`src/styles.css`](../../../packages/app/src/styles.css) (`[data-companion-state]` rules) | H |
| app | [`e2e/`](../../../packages/app/e2e/) (companion spec + speech/audio stubs) | H |

## Verification

- [ ] `moon run :typecheck :lint :test` green; no `no-restricted-imports` hit (nothing in `shared`
      imports `electron`, `node:*` or React; nothing in `app` imports `@modelcontextprotocol/sdk`
      or any STT SDK).
- [ ] `shared/src/companion.test.ts` covers the transition table totally, the no-repeat picker,
      honorific collapse, every grammar verb plus negatives, `stripAnsi` against a captured Claude
      Code frame, and `summariseDigest` fixtures.
- [ ] `main/companion/*.test.ts` covers the snapshot with a failing forge (3 s cap, `null`
      fields), the digest's landed/in-progress split on a fixture repo, `ask` with a fake process
      runner (valid JSON, garbage, timeout, no CLI), and `transcribe` with the fake provider.
- [ ] `browser-security.test.ts` asserts: app origin + `['audio']` → granted; app origin +
      `['audio', 'video']` → refused; browser-pane session + anything → refused.
- [ ] Concierge flow test: greeting → overview → switch offer (only with >1 repo) → digest →
      prompt, and the interrupt path, against fakes.
- [ ] Filler scheduler test under fake timers: 6 s threshold, 25–40 s spacing, no filler during
      `waiting`, music offer at 20 s exactly once.
- [ ] Playwright: the Theme H spec above, plus "companion disabled → `C` leaf disabled with
      reason, popover shows the enable row".
- [ ] Idle CPU: `scripts/perf/idle-cpu.mjs` with the companion enabled and idle differs from
      baseline by under 0.5 % of a core; the `AudioContext` is suspended after 60 s (asserted via a
      dev-only log line behind `MSTUDIO_PERF=1`).
- [ ] Bundle: `scripts/perf/bundle-report.mjs` shows the renderer entry chunk unchanged within
      noise; the companion feature is a lazy chunk loaded on first open.
- [ ] Human pass (packaged Mac): enable, hear the greeting in the chosen voice, say "start an adhoc
      task" over a real provider, confirm the session appears typed-not-sent, press Return, hear a
      filler at ~6 s, accept elevator music at ~20 s, hear the sign-off and the summary when the
      agent finishes, watch the FAB run listening → thinking → handoff → speaking → idle. Repeat
      with reduced motion on and confirm the static looks.

## Not in this phase

- **Local speech recognition** (whisper.cpp or an on-device model). It fits the app's offline
  posture and is the natural sequel once the provider seam has proven the UX; it brings a native
  module and a model download that this phase does not need.
- **An MCP client.** The companion is in-process. External MCP servers as companion tools is a
  different feature.
- **A direct model API.** No Anthropic SDK, no model key. The CLI is the brain.
- **Wake words / always-on listening.** Push-to-talk and toggle only.
- **Bundled audio assets, licensed music, or attributed quotes.**
- **A fifth Loops tab, changes to the Loops panel's glow, or changes to the title-bar sync
  cluster.**
- **Multi-language voices or translation.** App locale only.
- **Companion actions beyond the `AgentCommandId` set** (no "commit this", no "push"). Every
  write still goes through an agent session the user can see.

## Decisions / open questions

1. **Whole feature in one phase, eight themes.** *Settled.* Themes A, B and D are independent of
   audio and can land first; F and G are the voice half; E is the spine.
2. **STT is a cloud provider behind a seam, key in `safeStorage`.** *Settled.* Chromium's
   recogniser is unusable in Electron; local whisper is the named sequel.
3. **Intent: keyword grammar first, headless CLI fallback.** *Settled.* No API key, no SDK; the
   summariser rides the same channel.
4. **Panel: a sibling right-docked column, both panels can be open.** *Settled.* Own `useResizable`,
   own persisted width, DOM order `main · companion · loops`.
5. **Read-back: spoken summary, full cleaned text in the thread.** *Settled.* Verbatim fallback
   to 240 characters when no CLI.
6. **Personality content: curated JSON plus WebAudio synthesis, no assets.** *Settled.* Honorific
   is a setting, empty by default.
7. **Gating: default-off feature, separate hands-free switch, audio-only permission carve-out for
   the app origin.** *Settled.* `autoSend` only with hands-free on and after the command is spoken.
8. **Which STT provider ships first?** *Open.* **Recommendation: OpenAI Whisper** (`/v1/audio/transcriptions`,
   accepts the webm/opus blob as-is, one request per utterance, no streaming protocol to
   implement). Deepgram stays a second `SttProviderId` behind the same interface.
9. **Headless calls: `claude -p` directly, or through the council runner's wrapper?** *Open.*
   **Recommendation: `runProcess` from `process-runner.ts` directly**, with the roster's
   `agentInvocationArgs` so a Codex primary works too; the council runner adds run-lock and
   member semantics the companion does not need.
10. **Does `handoff` block a second command?** *Open.* **Recommendation: yes, with an override.**
    While one hand-off is live the companion says "the last one is still running — say 'anyway' to
    start another"; `anyway` is a grammar token. Parallel hand-offs are what swarm is for.
11. **Where does the "last greeted" mark live?** *Open.* **Recommendation: main, in a small
    `companion.json` under `userData`** keyed by repo id, beside `mcp.json`, so the digest window is
    right even after the renderer's `localStorage` is cleared.
12. **FAB priority when a loop is `waiting` and the companion is `speaking`.** *Settled in Theme H:*
    companion look on top, loop's amber ring as an inset. An agent asking a question is never
    visually hidden.
