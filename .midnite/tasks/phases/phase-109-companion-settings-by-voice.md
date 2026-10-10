# Phase 109 — Companion settings by voice

**Written with the user** (via `/midnite-ideate`) · 2026-10-10

[Phase 79](phase-79-the-companion-that-answers-back.md) gave the companion a voice,
[Phase 80](phase-80-what-the-companion-says-and-what-you-call-it.md) gave it a local Kokoro voice
and names to answer to, and [Phase 81](phase-81-where-the-companion-can-take-you.md) let it go
anywhere in the app and run the palette's commands by tier. None of them let it change itself. Say
"use a different voice" today and the best it can do is open Settings ▸ Companion: the
`navigate` intent is the **only** settings capability the companion has, and no intent, IPC
channel or MCP tool writes a single companion setting.

This phase builds **one list of voice-settable companion settings with two ways in**. The first
is the companion itself, through a new `setting` intent, so you can change it by speaking. The
second is the `midnite` MCP server, through `companion_settings_*` tools, so an agent in a
terminal can change it for you. Both write through **one renderer setter**, with tiers, lockout
guards and a one-step undo. Four experience layers sit on top of it: a **spoken read-back with
"undo that"**, a **voice audition**, **persona profiles**, and a **"tune me" interview** that
writes the personality text, so you never dictate 4000 characters to whisper-tiny.

Scope guardrails:
- Companion settings stay **renderer-owned**, as the `ui.*` MCP tools already assume. Main
  reaches them only through the existing `requestUiAction` request/reply; this phase does not
  move ownership into main.
- **Secrets never travel by voice.** API keys are not store keys and stay that way, and no STT
  provider or engine changes by voice.
- **Nothing that could switch off the companion's own hearing is voice-settable.**
- **No new inference path.** "Tune me" uses the user's agent CLI through `ask.ts` exactly as the
  router does, with a local template when there is no CLI.

> **Findings, verified against the current tree, that this phase is built on.**
>
> **1. Every companion setting lives only in the renderer's zustand store, with no schema and no
> outside setter.** All 14 keys are written by [`companion-page.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx)
> (L68-96) through `useUiStore` setters and persisted in `midnite-studio.ui` v31
> ([`ui-store.ts:3298`](../../../packages/app/src/store/ui-store.ts); partialize 3421-3434,
> migrations 3468-3696). Shared provides enum constants and `CompanionNamesSchema`
> ([`companion.ts:2774`](../../../packages/shared/src/companion.ts)), but there is no zod schema
> for the whole slice. Main's `companion.json` ([`companion-store.ts`](../../../packages/desktop/src/main/companion/companion-store.ts))
> holds only `lastGreeted`. Personality and About me reach main per call on `companion.ask`
> ([`runtime.ts:183`](../../../packages/app/src/features/companion/runtime.ts)).
> `bridge.companion` ([`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts)) has no setter.
>
> **2. The page holds more than voice-safe state.** It covers enable, speak aloud, local voice
> (28 Kokoro ids, `COMPANION_LOCAL_VOICES` [`companion.ts:1258`](../../../packages/shared/src/companion.ts)),
> system voice (a `speechSynthesis` voiceURI), volume (0–1; whistle and elevator music only),
> mic mode, conversation mode plus trigger, recognition engine, hands-free, names (which **are the
> wake words**), honorifics, personality and About me (≤4000 chars each), and elevator-music
> offer. The STT provider select is **local `useState`** (L1060) and is lost on reload. The API
> key is write-only into `companion-stt.vault.json`.
>
> **3. The companion doesn't call MCP tools itself; it acts through intents.** `parseIntent`
> ([`companion.ts:2674`](../../../packages/shared/src/companion.ts)) produces a
> `CompanionIntentSchema` value (L2532), and `act()` ([`handoff.ts:144`](../../../packages/app/src/features/companion/handoff.ts))
> dispatches it. `freeform` goes to the agent CLI through `buildAskPrompt`
> ([`ask.ts:117`](../../../packages/desktop/src/main/companion/ask.ts)), which returns an
> *intent* checked by `parseAskReply` (`companion.ts:3077`). So **for the user's voice, the
> intent pipeline is the path**. MCP is the way in for *other agents*. A new intent kind touches
> five places: schema, grammar, `act()`, router vocabulary and `parseAskReply` fixtures.
>
> **4. There is already a way for main to write renderer state.** `requestUiAction`
> ([`ui-bridge.ts:60`](../../../packages/desktop/src/main/companion/ui-bridge.ts)) sends a
> `CompanionUiActionSchema` action (`state | navigate | command`,
> [`schemas.ts:4147`](../../../packages/shared/src/ipc/schemas.ts)) to the main window. There,
> [`ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts) applies it and
> replies within a **fixed 5 s** `REQUEST_TIMEOUT_MS`. It refuses while locked. A `setting` arm
> is the natural seam, but a confirm-tier write needs a longer, per-action timeout.
>
> **5. MCP writes are gated per family, off by default.** [`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts)
> carries `allowUi`, `allowGateDecide`, `allowModels`, `allowGames`, … each read with a plain
> `=== true`, mirrored in [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts) and
> switched from Settings ▸ MCP. Phase 57 deferred MCP writes in general, and
> [`outstanding.md`](../../outstanding.md) L265-290 still asks whether "switch + tier" is enough
> consent. This phase answers that for one narrow family: **switch + tier + an in-app confirm the
> call waits for**.
>
> **6. Tiers and confirmation already exist.** `COMMAND_ACCESS`
> ([`safety.ts:159`](../../../packages/app/src/features/palette/safety.ts)) maps every command to
> `direct | confirm | never`. A confirm sets `pendingAction` (handoff.ts:392-424), which waits
> 60 s for "yes", Return or the Run chip. [`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx)
> is the modal fallback.
>
> **7. Some settings can lock you out of voice control.**
> - A disabled companion ignores all input: `submitCompanionInput` returns early.
> - Muting speech silences the confirmation of the mute.
> - Renaming changes the wake word at once.
> - `webSpeech` is usually broken in Electron.
> - `companionHandsFree` is inert while `voiceInReady()` is hard `false` (runtime.ts:236).
>
> The detached companion popout keeps a stale copy of any key not in the `broadcast-sync.ts`
> allowlist; today that allowlist holds only `companionDetached` (L268).

> **Effort tags:** **S** ≈ under a day · **M** ≈ 1–2 days · **L** ≈ 3+ days. Order:
> **A → B → (C ∥ D) → (E ∥ F ∥ G ∥ H)**. A and B are the shared foundation. C and D are the two
> ways in. E–H are independent layers and can be swarmed.

## Headlines

**Theme A — One settings list.** ✅ Done ([PR #813](https://github.com/bilo-io/midnite-studio/pull/813)). `shared/src/companion.ts` now has `CompanionSettingsSchema` for the whole companion slice, built from per-key `COMPANION_SETTING_VALUE_SCHEMAS`, with the store's own defaults and clamps; an app vitest checks the two agree. `COMPANION_SETTING_SPECS` covers all 17 `CompanionSettingKey`s, with the voice selection split into `companionVoices.local`/`.system`. Each spec has aliases, a value kind, a tier, guards, a read-back and an example phrase. Type assertions tie the key list to the slice schema and the store's persisted `companion*` keys, so a key added without a spec doesn't compile. `COMPANION_SETTING_KEYS` and `COMPANION_SETTING_TIERS` sit above `CompanionIntentSchema` so Theme C's intent arm can use them. `checkCompanionGuard` implements `lastName`, `wakeWord`, `muteLast` and `tunedText`; the last one lets the page and tuned changes through. Kokoro voices gain `spoken` aliases ("British Emma"). `matchVoice` allows two edits for names of six letters or more, one for four or five, and none for three, and asks between equally close names.

**Theme B — One setter.** ✅ Done ([PR #813](https://github.com/bilo-io/midnite-studio/pull/813)). `app/features/companion/settings-apply.ts` adds `applyCompanionSetting`, `applyCompanionSettings` (several keys as one undoable change), `previewCompanionSetting` (checks without writing, for Theme E's read-back-first) and `undoLastCompanionSetting` (one step, 60 s). Writes are refused while the screen is locked. A `never` key from voice or MCP is refused, and so is a `confirm` key unless the change carries `confirmed`. Guards apply to every source. Every persisted control on Settings ▸ Companion now writes through the setter as `page`; rapid page edits to one key within 5 s count as one undo step. A voice change from outside the page also updates the live volume. `broadcast-sync.ts` gains `COMPANION_SYNC_KEYS`, so the popout no longer speaks in a stale voice. The STT provider is now persisted: `null` means automatic, the select shows what that resolves to via a shared `pickSttProvider`, and the mic sends the choice with `transcribe`. The one v31 → v32 bump seeds `companionSttProvider`, `companionProfiles` and `companionActiveProfile`. The two profile keys sit in `KNOWN_ORPHANS` until Theme G builds the page section.

**Theme C — The companion learns `setting`.** ◻ Not started. A `setting` intent across schema, grammar, `act()`, router vocabulary and `parseAskReply`. Confirm-tier changes use `pendingAction`, and never-tier ones are refused with an offer to open the page. The page gets "Try: …" hints.

**Theme D — `companion_settings_*` on `midnite`.** ✅ Done ([PR #814](https://github.com/bilo-io/midnite-studio/pull/814)). `companion_settings_get`, `companion_settings_set` and `companion_voices_list` are on the `midnite` MCP server behind one default-off `Settings ▸ MCP ▸ Let agents change companion settings` switch (`allowCompanionSettings`, `mcp.json` v10) that refuses all three, reads included. Their schemas and the pure `_get` listing live in a new `shared/src/companion-mcp.ts`; the handlers in `desktop/src/main/mcp/companion-tools.ts` reach the renderer through new `setting`/`settingsState`/`voices` arms on `CompanionUiActionSchema`, and `ui-requests.ts` calls B's setter with `source: 'mcp'`, so tiers, guards and values are only ever checked there. `_get` lists every key with its tier and allowed values; never-tier keys, and personality and About me (whose `tunedText` guard refuses any agent), come back `settable: false` with a note. `requestUiAction` takes a per-action `timeoutMs`: a confirm-tier `_set` waits 35 s in main against the renderer's own 30 s prompt, which asks through the companion's `pendingAction` chip and voice when it is on in this window (a new `onConfirm` arm on `PendingAction`, called by `resolvePending` before it clears) and through `confirm-dialog.tsx` otherwise. Answers are checked against the wall clock, so nothing applies after the deadline, and a late "yes" hears "Too late — ask your agent again." A change the guards or schema would refuse is refused without asking. `companion_voices_list`'s `downloaded` flag reads the Kokoro model off disk in main (`tts-model-files.ts`) without spawning the TTS worker. Every agent change takes the undo slot and posts a toast and transcript line; E's spoken read-back replaces that announcement.

**Theme E — Read-back and spoken undo.** ◻ Not started. Every change is spoken back in the new voice, but before a mute takes effect. "Undo that" works for 60 s, and voice- and MCP-originated changes get an Undo toast.

**Theme F — Voice audition.** ◻ Not started. "Try some British voices" plays 3–4 numbered samples, and you pick with "number two", "that one" or "next". It falls back to system voices when Kokoro is unavailable.

**Theme G — Persona profiles.** ◻ Not started. Named bundles of voice, personality and honorifics; names stay global. Save, switch and delete them by voice, from a Profiles section on the page, or over `companion_profile_*` MCP tools.

**Theme H — "Tune me" and quick tweaks.** ◻ Not started. A spoken interview plus one-line tweaks. A new `'persona'` mode in `ask.ts` writes the text and a summary; you hear the summary and confirm. With no CLI, the interview fills a local template. Raw dictation is never accepted.

## Deliverables

### A — One settings list (M)

- [x] **`CompanionSettingsSchema`** in [`companion.ts`](../../../packages/shared/src/companion.ts): a zod object covering every persisted companion key, including this phase's new `companionSttProvider`, `companionProfiles` and `companionActiveProfile`. It uses the same defaults and clamps the store applies today: volume clamped 0–1, names via `CompanionNamesSchema` (≥1), personality and About me trimmed ≤4000. The store keeps its own partialize and migrate code. A vitest asserts that the store's default companion state parses under the schema and that the two agree on every default.
- [x] **`COMPANION_SETTING_SPECS: Record<CompanionSettingKey, CompanionSettingSpec>`**, total over the settable-key union, so a companion key added to the store without a spec is a type error. Each spec holds:
  - `label` and `aliases: string[]`, the words people use for the setting;
  - `value`, one of `bool`, `enum {values, spoken}`, `number {min, max, step, spokenUnit}`, `text {max}` or `list {min}`;
  - `tier: 'direct' | 'confirm' | 'never'`;
  - an optional `guard`;
  - `readBack(next) → string` and an `example` phrase, used by C's page hints.
- [x] **The tier table, as settled in the brainstorm** (Decision 2):
  - **`never`**: `companionEnabled`, `companionSttEngine`, `companionSttProvider`, `companionHandsFree`.
  - **`confirm`**: `companionSpeakAloud` (only → `false`; → `true` is direct), `companionNames`, `companionMicMode`, `voiceConversation` / `voiceConversationTrigger`, `companionPersonality`, `companionAboutUser`.
  - **`direct`**: `companionVoices.local`, `companionVoices.system`, `companionVolume`, `companionHonorifics`, `companionMusicOffer`, `companionActiveProfile`.

  The STT API key is not a store key and gets no spec.
- [x] **Guards as pure functions** in shared: `checkCompanionGuard(spec, current, next) → { ok: true, effect?: 'readBackBeforeApply' } | { ok: false, reason }`.
  - **`lastName`**: refuses to empty the names list.
  - **`wakeWord`**: a names change speaks the new wake word *before* applying.
  - **`muteLast`**: `companionSpeakAloud → false` reads back first, then writes.
  - Text keys refuse anything that didn't come from H's `tune`/`tweak` flow (Decision 4).
- [x] **Spoken voice aliases.** `CompanionLocalVoiceInfo` gains `spoken: string[]` ("Heart", "Bella", "British Emma", …) beside the accent and gender descriptors it already carries. `matchVoice(text, voices) → { match } | { ambiguous: [a, b] } | { none }` normalises tokens and allows an edit distance ≤ 2, so whisper-tiny's "bela" or "hart" still resolve. System voices are matched by display name at runtime in the renderer, the only place that list exists.
- [x] **Unit tests (vitest, shared):**
  - the spec table is total;
  - every tier assignment above;
  - `matchVoice` against a table of mistranscriptions, including an ambiguous pair;
  - every guard's refusal and effect.

### B — One setter (M)

- [x] **`applyCompanionSetting(change, source: 'voice' | 'mcp' | 'page')`** in a new `app/features/companion/settings-apply.ts`. It is a plain function over `useUiStore.getState()`, keeping [`runtime.ts`](../../../packages/app/src/features/companion/runtime.ts)'s no-hooks rule, because a turn outlives the render that started it. It validates against A's spec and schema, refuses while `screensaverLocked` (the check `ui-requests.ts` already makes), and refuses `never` keys from `voice` and `mcp`. It returns a typed `CompanionSettingResult`: `{ ok: true, previous, next }`, or `{ ok: false, reason: 'locked' | 'never' | 'guard' | 'invalid' }` with the guard's spoken reason.
- [x] **One-step undo.** A `lastChange { keys, previous, at, source }` slot (one change may touch several keys; see G), replaced by any change from any source. `undoLastCompanionSetting()` restores it within 60 s and otherwise reports `expired` or `nothing` (Decision 9).
- [x] **The page writes through the setter.** Every persisted control in [`companion-page.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx) (L68-96) calls `applyCompanionSetting(…, 'page')`. Tiers don't apply to `page`, because the click is the consent, but the guards do. A page change is therefore undoable by voice and reaches the popout.
- [x] **Popout sync.** Add the keys the companion popout reads to the [`broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) allowlist (L268): voices, volume, speak aloud, names, honorifics, personality, About me, profiles and active profile. The detached popout then never reads back a stale voice (Decision 15).
- [x] **Persist the STT provider.** Add `companionSttProvider: 'whisper-local' | 'openai-whisper' | 'deepgram' | null` to the store. `null` keeps today's automatic resolution. Send it with the `transcribe` request so main's `resolveProviderId` ([`stt/index.ts`](../../../packages/desktop/src/main/companion/stt/index.ts) :100) honours it, and delete the page's local `useState` (L1060). The tier stays `never`.
- [x] **The phase's one persist bump, v31 → v32.** It adds `companionSttProvider` (null), `companionProfiles` (`[]`) and `companionActiveProfile` (null), so G lands without a second migration.
- [x] **Tests:**
  - setter result per tier, guard and lock;
  - undo replace and expiry (fake timers);
  - a page toggle routes through the setter (RTL);
  - the v31 → v32 migration on a real v31 blob;
  - the broadcast allowlist carries the new keys.

### C — The companion learns `setting` (M)

- [ ] **`CompanionIntentSchema`** ([`companion.ts:2532`](../../../packages/shared/src/companion.ts)) gains `{ kind: 'setting', key, value }`. Its `key` is restricted to non-`never` keys, so neither the grammar nor the router can express a never-tier change. C establishes the pattern that E–H's intent arms follow.
- [ ] **`parseIntent` grammar** ([`companion.ts:2674`](../../../packages/shared/src/companion.ts)) runs deterministic phrases before the router:
  - **voice:** "use / switch to / change your voice to ⟨voice⟩", resolved through `matchVoice`;
  - **volume:** "volume ⟨n⟩", "louder", "quieter" (±0.1);
  - **honorifics:** "call me ⟨x⟩" (add) and "stop calling me ⟨x⟩" (remove);
  - **names:** "I'll call you ⟨name⟩" / "answer to ⟨name⟩", and "stop answering to ⟨name⟩";
  - **speak aloud:** "stop talking out loud" / "speak out loud";
  - **elevator music:** "turn elevator music off / on";
  - **mic mode:** "push to talk" / "toggle the mic";
  - **conversation mode:** "conversation mode on / off".

  A collision test runs every phrase against the existing vocabulary. "Stop" stays the `stop` intent, and "call me" must not shadow navigation or `switchRepo`.
- [ ] **`act()` arm** ([`handoff.ts:144`](../../../packages/app/src/features/companion/handoff.ts)):
  - `direct` applies the change and hands off to E's read-back.
  - `confirm` sets `pendingAction` with a spoken question ("Answer to 'Nova' from now on? Say yes."), reusing the 60 s / yes / Return / Run-chip path (handoff.ts:392-424).
  - A never-tier request reaching `act()` from free speech gets "That one's in Settings, Companion — want me to open it?", and "yes" navigates there.
  - An ambiguous voice asks "Bella or Isabella?" (Decision 10).
- [ ] **The router learns the settings.** `CompanionVocabulary` gains `settings`: key, aliases, allowed values and tier for non-`never` keys only. `routeVocabularyLines` ([`ask.ts:178`](../../../packages/desktop/src/main/companion/ask.ts)) lists them, so "make your voice a bit more British" routes to a `setting`. `parseAskReply` (`companion.ts:3077`) fixtures cover a valid `setting` reply, an unknown key, an out-of-range value and a `never`-tier key, each of which must be dropped.
- [ ] **"Try: …" hints on the page.** One muted line under each voice-settable control, taken from `COMPANION_SETTING_SPECS[key].example` (for example "Try: 'use voice Bella'"). Never-tier controls get no hint.
- [ ] **`help` mentions settings**, for example "You can tell me to change my voice, what I call you, or how loud I am."
- [ ] **Tests:**
  - a `parseIntent` table of ≥30 phrasings, including whisper-style mistranscriptions and the collision set;
  - `act()` per tier, with ports;
  - the router fixtures.

### D — `companion_settings_*` on `midnite` (M)

- [x] **`MCP_TOOLS`** ([`mcp.ts:335`](../../../packages/shared/src/mcp.ts)) gains three tools, each with a description ≤220 chars:
  - **`companion_settings_get`** (`readOnly: true`): every spec'd key's value, tier and allowed values. Never-tier keys are returned with `settable: false`, and no secret is ever included.
  - **`companion_settings_set`** (`{ key, value }`): returns `{ status: 'applied' | 'approved' | 'declined' | 'timeout' | 'refused', reason?, previous?, next? }`.
  - **`companion_voices_list`** (`readOnly: true`): the local Kokoro list with spoken names and a `downloaded` flag, plus the system voices fetched from the renderer.
- [x] **`CompanionUiActionSchema`** ([`schemas.ts:4147`](../../../packages/shared/src/ipc/schemas.ts)) gains `setting`, `settingsState` and `voices` arms, each with its own result arm in `CompanionUiResultValueSchema`. [`ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts) handles them by calling B's setter with `source: 'mcp'`.
- [x] **A per-action timeout on `requestUiAction`** ([`ui-bridge.ts:60`](../../../packages/desktop/src/main/companion/ui-bridge.ts)). 5 s stays the default. A confirm-tier `setting` waits **30 s** for the in-app answer: the companion asks aloud and shows the Run/Cancel chip when enabled; when disabled, `confirm-dialog.tsx` asks with no speech (Decision 3). On timeout the tool returns `timeout`, and **nothing applies afterwards**: a late "yes" gets "Too late — ask your agent again."
- [x] **A new Settings ▸ MCP switch, `allowCompanionSettings`.** It lands in the next `mcp-store.ts` version, defaults to false, is read with `=== true` like `allowUi`, and is mirrored in [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts). It gates the **whole** `companion_*` family, reads included, because About me is personal (Decision 13). With the switch off, every tool returns a refusal that names the switch.
- [x] **MCP changes are visible and undoable.** Every MCP-originated change is announced by E's read-back, prefixed "Your agent changed…", and takes the undo slot, so "undo that" reverts an agent's change. *(D lands the undo slot (the setter's `source: 'mcp'`) and a toast plus transcript line, "Your agent changed my …", from `ui-requests.ts`; E's spoken read-back with Undo toast replaces that announcement through `announceCompanionSettingChange(result, 'mcp')`, which was not on main when D merged.)*
- [x] **Handlers** in `desktop/src/main/mcp/companion-tools.ts`, wired into `MCP_HANDLERS` ([`dispatch.ts:119`](../../../packages/desktop/src/main/mcp/dispatch.ts)); its mapped type makes a missing handler a type error.
- [x] **Docs.** A paragraph in [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md)'s MCP section, and a note in [`outstanding.md`](../../outstanding.md) (L265-290) recording that this family settles the consent question as switch + tier + in-app confirm. The general MCP-write question stays open for other families. *(Done as `outstanding.md`'s note only: `INITIAL_PLAN.md` has no MCP section — Phase 81 Theme F recorded the same finding and declined to add one to the frozen MVP doc.)*
- [x] **Tests:**
  - handler per tool;
  - switch off → refused;
  - locked → refused;
  - `requestUiAction` honours the per-action timeout (fake timers);
  - confirm-tier `approved` / `declined` / `timeout` paths;
  - `_get` never returns a never-tier value as settable.

### E — Read-back and spoken undo (S)

- [ ] **Spoken read-back.** Each applied change speaks `spec.readBack(next)` through [`speaker.ts`](../../../packages/app/src/features/companion/speaker.ts) *after* the store write. Because `speaker.ts` reads `companionVoices.local` per utterance (L437), a voice change is confirmed in the new voice ("This is Bella now."). The `readBackBeforeApply` effect reverses the order for `companionSpeakAloud → false` and for name changes.
- [ ] **Phrasing is varied**, drawn from a small pool per key in the style of Phase 80's phrase tables, so ten volume changes don't all sound the same.
- [ ] **An `undoSetting` intent.** "Undo that", "put it back" and "change it back" call `undoLastCompanionSetting()` and read back the restored value. "Nothing to undo" and "That was too long ago" cover the empty and expired cases.
- [ ] **An Undo toast** for `voice`- and `mcp`-originated changes, showing the same 60 s window. Page changes get none, since the control is right there.
- [ ] **Tests:**
  - write-then-speak order, and the reverse for mute;
  - undo after a voice change and after an MCP change;
  - expiry;
  - the toast's Undo restores.

### F — Voice audition (M)

- [ ] **An `audition` intent:** "try some voices", "audition British voices", "let me hear female voices". It filters `COMPANION_LOCAL_VOICES` by the accent and gender descriptors and picks 3–4 voices in a deterministic order, never the current one.
- [ ] **Playback.** Each sample goes through `ttsSynthesize` with a fixed, numbered line ("Hi, I'm number two — Bella."). A turn state machine in [`conversation.ts`](../../../packages/app/src/features/companion/conversation.ts) handles the replies:
  - "number two" / "two": picks that voice;
  - "that one": the last voice played;
  - "next": the next batch;
  - "again": replays the batch;
  - "none" / "stop": ends the audition.

  A pick applies through B's setter (direct tier), and E's read-back follows.
- [ ] **Fallback.** If the Kokoro model isn't downloaded, or the tts-broker fails, it auditions system voices from `speechSynthesis.getVoices()` and says so once.
- [ ] **Barge-in.** Speaking during a sample cancels it, reusing `stop`. The audition works in push, toggle and conversation mode.
- [ ] **Tests:**
  - filter and selection;
  - every state-machine transition;
  - the system-voice fallback;
  - a pick lands in the undo slot.

### G — Persona profiles (M)

- [ ] **`CompanionProfileSchema`** `{ id, name, voices: { local, system }, personality, honorifics, createdAt }` in [`companion.ts`](../../../packages/shared/src/companion.ts). It deliberately excludes names, so the wake word never changes on a profile switch (Decision 5). The store holds `companionProfiles` (≤20) and `companionActiveProfile` (id or null), both added by B's v32 migration.
- [ ] **Switching is one change.** A switch writes the profile's voice, personality and honorifics through the setter as a single change, and undo restores all of them. Editing any of those fields while a profile is active marks it *modified* rather than silently rewriting it.
- [ ] **Voice commands:**
  - "save this as Narrator" (confirm if the name exists, since it overwrites);
  - "switch to Narrator" / "be Narrator" (direct);
  - "delete the Narrator profile" (confirm);
  - "what profiles do I have?" (lists them).
- [ ] **A Profiles section on the page.** It shows the list with an active badge and a modified dot, and offers Save current as…, Rename, Delete (via `confirm-dialog.tsx`) and Set active.
- [ ] **MCP:** `companion_profile_list` (read), and `companion_profile_save`, `_switch` and `_delete`. Delete is confirm-tier and waits like D. All four are behind `allowCompanionSettings`.
- [ ] **Tests:**
  - schema;
  - switch-as-one-undo;
  - overwrite confirm;
  - modified marking;
  - the page section (RTL);
  - MCP handlers.

### H — "Tune me" and quick tweaks (L)

- [ ] **A `tune` intent:** "let's change your personality", "tune yourself", and "let me tell you about me" (target: About me). It runs a guided state machine in [`conversation.ts`](../../../packages/app/src/features/companion/conversation.ts) with 3–4 fixed questions:
  - **personality:** tone, how much it talks, humour, what to avoid;
  - **About me:** what to call you, what you work on, how you like updates.

  "Skip", "start over" and "cancel" work at any point.
- [ ] **A `'persona'` mode in [`ask.ts`](../../../packages/desktop/src/main/companion/ask.ts)** beside `'route'`. The prompt carries the answers, the current text and `personaLines`' constraints (L214), and the mode returns `{ text ≤ 4000, summary ≤ 200 }`. The reply is validated by a `parseAskReply` extension and keeps the existing 30 s timeout. On failure it falls back to the template.
- [ ] **The template fallback** for no CLI or a failed ask: a deterministic `buildPersonaFromAnswers(target, answers)` in shared fills a fixed template, and its summary is the first sentence (Decision 6).
- [ ] **Read-back, then confirm.** The companion speaks the summary and asks "Want to hear all of it?", reading the full text on yes. It then applies through the confirm tier, and the change is undoable (Decision 11).
- [ ] **A `tweak` intent:** "be more sarcastic", "talk less", "stop being so formal". It sends `{ instruction, current }` to the `'persona'` mode and gets back revised text and a summary, which it reads before asking you to confirm. Honorific phrasings ("don't call me boss") stay C's `setting` intent. With no CLI it says: "I need an agent CLI for that — want me to open Settings, Companion?"
- [ ] **No raw dictation.** Only `tune` and `tweak` can produce a personality or About me write: A's guard refuses text keys from any other origin, and a test asserts that `parseIntent` and the router can't.
- [ ] **Interview answers are ordinary turns** in the companion thread, with no new persistence.
- [ ] **Tests:**
  - every interview state transition;
  - a snapshot of the `'persona'` prompt;
  - `parseAskReply` fixtures for persona replies;
  - the template fallback;
  - a tweak with no CLI;
  - the raw-dictation refusal.

## Files this phase touches

- **Shared contract:**
  - [`packages/shared/src/companion.ts`](../../../packages/shared/src/companion.ts): schema, specs, guards, `matchVoice`, intent arms, profile schema, `parseAskReply` and `buildPersonaFromAnswers`.
  - [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts): `CompanionUiActionSchema` and result arms.
  - [`packages/shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts): the `companion_*` tools.
  - [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts): `transcribe` carries the provider.
- **Renderer:**
  - `packages/app/src/features/companion/settings-apply.ts` (new): the setter and undo.
  - [`handoff.ts`](../../../packages/app/src/features/companion/handoff.ts): the new intent arms.
  - [`conversation.ts`](../../../packages/app/src/features/companion/conversation.ts): audition and interview state machines.
  - [`speaker.ts`](../../../packages/app/src/features/companion/speaker.ts): read-back.
  - [`ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts): the new arms.
  - [`vocabulary.ts`](../../../packages/app/src/features/companion/vocabulary.ts): the `settings` vocabulary.
  - [`runtime.ts`](../../../packages/app/src/features/companion/runtime.ts).
  - [`companion-page.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx): the setter, hints, Profiles section and persisted provider.
  - `mcp-page.tsx`: the new switch.
  - [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts): v32.
  - [`broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts): the allowlist.
- **Main:**
  - [`ask.ts`](../../../packages/desktop/src/main/companion/ask.ts): `'persona'` mode and settings vocabulary lines.
  - [`ui-bridge.ts`](../../../packages/desktop/src/main/companion/ui-bridge.ts): per-action timeout.
  - [`stt/index.ts`](../../../packages/desktop/src/main/companion/stt/index.ts): honours the provider.
  - `packages/desktop/src/main/mcp/companion-tools.ts` (new), [`dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), [`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts) and [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts).
- **Docs:** [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md) (MCP section) and [`outstanding.md`](../../outstanding.md).

## Verification

- [ ] `moon run :typecheck :lint :test` green. Every theme's own unit and RTL tests listed above pass under vitest; no e2e is needed for logic the vitest layer can reach ([`docs/TESTING.md`](../../../docs/TESTING.md)).
- [ ] **Human pass (packaged app, real mic): voice.** "Use voice Bella" is answered in Bella ("This is Bella now."), and "undo that" restores the previous voice and says so in it.
- [ ] **Human pass: names.** "I'll call you Nova" asks for confirmation, and after "yes" the wake word "Nova" works in conversation mode's wake trigger. "Stop answering to Nova" when it's the only name is refused with the reason spoken.
- [ ] **Human pass: mute.** "Stop talking out loud" is heard *before* the mute takes effect, and "speak out loud" restores speech.
- [ ] **Human pass: refusals.** "Turn yourself off" and "switch to web speech" are refused with an offer to open Settings ▸ Companion, and "yes" opens it.
- [ ] **Human pass: audition.** "Audition British voices" plays numbered samples, and "number two" applies that voice. With the Kokoro model removed, the audition falls back to system voices and says so.
- [ ] **Human pass: MCP.** A Claude Code session in the integrated terminal runs `companion_settings_set` (voice) with the switch on: the change applies, the companion announces "Your agent changed…", and "undo that" reverts it. A confirm-tier `_set` (names) makes the app ask while the call waits; "yes" returns `approved`, and with no answer it returns `timeout` at 30 s and nothing changes. With the switch off, every `companion_*` tool is refused.
- [ ] **Human pass: profiles.** "Save this as Narrator", change the voice, "switch to Narrator", and the voice and personality return together. "Undo that" reverts the switch as one change.
- [ ] **Human pass: "tune me".** Once with an agent CLI installed (summary read back, full text on request, confirm applies), and once with none, using the template fallback. "Be more sarcastic" revises the text with a CLI and points to the page without one.
- [ ] **Lock screen:** with it up, voice and MCP setting changes are both refused.
- [ ] **Detached popout:** a voice change made in the main window is used by the detached companion popout's next utterance, without a reload.
- [ ] **Screenshots committed to the PR(s), repos panel closed:** Settings ▸ Companion with the Profiles section and "Try: …" hints, and Settings ▸ MCP with the new switch.

## Not in this phase

- **Enabling the companion by voice.** A disabled companion hears nothing; `companionEnabled` stays a page toggle.
- **The STT engine, provider or API keys by voice.** They are never-tier by design, and a key never travels through a transcript.
- **TTS rate or pitch, or a new TTS provider.** Neither exists today, and adding one is its own phase.
- **A wake-word engine.** Names still go through `parseWakePhrase` on the transcript.
- **Moving companion settings into main.** They stay renderer-owned behind `requestUiAction`.
- **Making hands-free actually work.** `voiceInReady()` stays hard `false`, and `companionHandsFree` stays never-tier.
- **An MCP tool that plays a voice sample.** Agents get `companion_voices_list`, not audio.
- **MCP writes for any other family.** [`outstanding.md`](../../outstanding.md) L265-290 stays open beyond this one.

## Decisions / open questions

1. **Shape: one settings list, two ways in.** ✅ *Resolved (user).* A shared spec table and one renderer setter serve both the companion's `setting` intent and the `companion_*` MCP tools, so the two can't drift apart. For the user's voice the intent pipeline is the path; MCP is for other agents.
2. **Tier policy: guarded.** ✅ *Resolved (user).*
   - `never`: enabled, STT engine/provider/key, hands-free.
   - `confirm` + guard: speak aloud → off, names, mic and conversation mode, personality and About me.
   - `direct`: voices, volume, honorifics, music offer, active profile.
   - Rejected: *strict*, which limits voice to the safe settings only, and *permissive*, which has no confirm steps.
3. **MCP consent for confirm-tier writes: the in-app prompt, with the call waiting.** ✅ *Resolved (user).* The call waits up to 30 s and returns `approved`, `declined` or `timeout`; nothing applies after a timeout.
   - Rejected: refusing confirm-tier writes over MCP, and an MCP that stays read-only.
   - *Open sub-point, with a recommendation:* when the companion is disabled, the prompt falls back to `confirm-dialog.tsx` with no speech, rather than refusing.
4. **Personality by voice: "tune me" plus quick tweaks, never raw dictation.** ✅ *Resolved (user).* Both paths read back a summary and confirm.
5. **Profile contents: voice, personality and honorifics.** ✅ *Resolved (user).* Names and wake words stay global, so a profile switch never changes what you say to wake the companion.
6. **No agent CLI: a template fallback.** ✅ *Resolved (user).* The interview fills a local template, and tweaks point to the page.
7. **One phase with eight themes, not a 109/110 split.** ✅ *Resolved (user).* A → B is serial, and the rest can be swarmed.
8. **Page changes: all four.** ✅ *Resolved (user).* The Profiles section, page writes through the setter, "Try: …" hints, and the persisted STT provider.
9. **Undo depth.** *Recommendation:* **one step**, the last change from any source, for 60 s. A stack invites "undo, undo, undo" confusion out loud, and the page is the place for anything older.
10. **Ambiguous voice names.** *Recommendation:* **ask between the top two** ("Bella or Isabella?") rather than picking the closer match silently.
11. **What the persona read-back says.** *Recommendation:* **the ≤200-char summary**, with the full text only on request. 4000 chars read aloud is about three minutes.
12. **MCP tool naming.** *Recommendation:* **`companion_*` with underscores**, matching the newest families (`model_*`, `game_*`, `terrain_*`, `map_*`) rather than the dotted `ui.*`/`repo.*` style.
13. **MCP gate granularity.** *Recommendation:* **one `allowCompanionSettings` switch gating reads too.** About me is personal, and `ui.state` (read-only) already sits behind `allowUi` on the same reasoning.
14. **Ownership.** ✅ *Resolved:* companion settings stay in the renderer store. Main reaches them only through `requestUiAction`, the seam the `ui.*` tools already use.
15. **Popout sync.** *Recommendation:* **extend the `broadcast-sync.ts` allowlist** rather than relaying writes through main. Each window already persists the same `midnite-studio.ui` key, and the allowlist is the mechanism built for exactly this.
