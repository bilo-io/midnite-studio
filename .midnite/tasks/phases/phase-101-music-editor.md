# Phase 101 — Music editor with Tone.js and MIDI agents

Brainstormed with the user · 2026-10-03 · grounded against the tree as of `b1d1b7f6`.

Media › Audio gains a second way to make music. Today the tab is a **generator**: you describe a
track and MusicGen renders audio ([Phase 99](phase-99-media-page.md) Theme E). This phase adds an
**Editor**: a DAW-lite built on [Tone.js](https://tonejs.github.io/), where the music is **MIDI**.
You edit it by hand, and agents (Claude, Codex, Antigravity, Ollama) edit it through `music_*`
tools on Midnite's own MCP server.

The tab gets two top-level tabs, **Editor | Generator**. Generator is exactly what ships today and
nothing in it is removed. Both tabs share the same projects under `.midnite/media/audio/<project>/`.

> **Builds on.**
> - **Media › Audio (Phase 99 Theme E).**
>   [`features/media/audio/`](../../../packages/app/src/features/media/audio/) contains:
>   - [`audio-tab.tsx`](../../../packages/app/src/features/media/audio/audio-tab.tsx): projects, session history, the bottom player and the prompt form
>   - [`player-store.ts`](../../../packages/app/src/features/media/audio/player-store.ts)
>   - [`use-audio.ts`](../../../packages/app/src/features/media/audio/use-audio.ts)
>
>   Main side, [`main/media/audio/`](../../../packages/desktop/src/main/media/audio/) contains:
>   - `audio-service.ts`
>   - the MusicGen worker under `musicgen/`
>   - `ollama-expand.ts`
>
>   The contract is the audio section of
>   [`shared/src/media.ts`](../../../packages/shared/src/media.ts) (`AUDIO_PROVIDER_IDS`, export
>   formats, MP3 bitrates).
> - **Models over MCP (Phase 99 Theme G).** This is the pattern to copy:
>   - [`main/mcp/model-tools.ts`](../../../packages/desktop/src/main/mcp/model-tools.ts) holds schema-derived tools that return validation errors as results, never throws.
>   - [`main/media/model/iterative-host.ts`](../../../packages/desktop/src/main/media/model/iterative-host.ts) gives each run a private MCP socket. Claude runs with `--strict-mcp-config` and only `model_*` allowed; Codex runs with `-c mcp_servers.*`.
>   - Edits are pushed live to the editor as single undoable steps.
>   - A Settings ▸ MCP switch, off by default, gates the write tools.
> - **[midi-file-mcp](https://github.com/xiaolaa2/midi-file-mcp)** (MIT, built on `@tonejs/midi`). Its 11 tools are the starting set for `music_*`. We do not run it: it reads and writes files only, cannot push live edits, and is an 11-star package that an `npx` run would download every time.
> - **Chats page (in flight).** The Chats composer, markdown renderer and Stop-beside-Send pattern are what Theme I reuses.
>
> **Scope guardrails.**
> - Generator is untouched.
> - Tone.js and every sample load **lazily**, only when the Editor tab opens. The entry chunk must not grow by more than a few KB; measure it with `scripts/perf/bundle-report.mjs`.
> - Audio runs in the **renderer** (Web Audio needs it). Files, sample caching, MCP and agents run in **main**.
> - `shared` stays zod-only. The renderer reaches main only through the bridge.
> - Nothing here touches the platform rules: macOS only, as everywhere else.
>
> **Effort:** S ≈ a day · M ≈ 2–3 days · L ≈ a week.

## Headlines

**Theme A — Editor and Generator tabs.** ✅ Landed. Media ▸ Audio has an Editor | Generator switch (`audio-sub-tabs.tsx`), persisted in `ui-store`, Generator the default and its body unchanged. Both tabs share the projects list; the Editor tab is a placeholder (`music-editor/editor-tab.tsx`) until Theme E. `media.audio.editor` / `media.audio.generator` are chord-free commands in `keybindings.ts`.

**Theme B — The song model and MIDI files.** ✅ Landed. `shared/media-music.ts` holds `SongSchema` (tempo map, time signature, tracks, notes in ticks, CC, pitch bend, automation, clips, mixer) with named limits. Main reads and writes `.mid` through `@tonejs/midi` (type 0/1, rescaled to 480 PPQ) in `main/media/music/midi-io.ts`, and keeps full editor state in a `<name>.song.json` sidecar. `mstudio:media:music-{list,read,write,import,delete}` return `GitOpResult` envelopes (`media.audio.music.*` on the bridge, mock bridge updated). `.mid` is not an audio extension, so the Generator's variant list never sees songs.

**Theme C — The Tone.js engine.** ✅ Landed. `music-editor/engine/` splits into pure logic and one Tone adapter. `tick-map.ts` converts ticks and seconds through the tempo map and lists metronome clicks; `scheduler.ts` builds per-track timed events and signatures, so a note edit reschedules only the touched track while a tempo change reschedules all; `engine.ts` runs play, pause, stop, seek, loop region and metronome against an `EngineHost`; `tone-host.ts` is the only file that imports Tone (dynamic), pinning the Transport at 60 BPM so transport seconds are real seconds. `offline.ts` renders audible tracks through `Tone.Offline` to a 16-bit WAV (`wav.ts`). The context resumes only on `play()` (a click); a hidden window pauses and suspends it, and does not auto-resume. A transport bar sits above the Editor tab, which plays a C-major preview song until Theme E loads project songs. Tone stays in lazy chunks: the entry chunk moved +1.0 KB.

**Theme D — General MIDI instruments.** ✅ Landed. Licence gate passed: FluidR3_GM.sf2 is MIT (Frank Wen) and the `gleitz/midi-js-soundfonts` pre-rendered sets are CC BY 3.0 (code MIT), so attribution is shown in `GmAttribution`. Main downloads one program's sample set on first use into `userData/gm-samples/` and streams progress on `mstudio:media:gm-progress` (`media.audio.gm.*` on the bridge); the 128-program catalogue lives in `shared/media-music-gm.ts`; the renderer's per-track `Tone.Sampler` factory (`music-editor/gm-sampler.ts`) loads Tone lazily and falls back to a synth with a "not downloaded" hint. Upstream has no FluidR3 percussion set, so the channel-10 kit is synthesised. Samples still load from the third-party host via `GM_SAMPLE_BASE_URL` (mirroring deferred, see outstanding.md); the picker is mounted in Settings ▸ Media ▸ Audio until Theme E's per-track UI exists.

**Theme E — Piano roll and arrangement.** ✅ Landed. The Editor tab now loads and saves the project's real songs through the music IPC (`use-song-document.ts`: song picker, New, Import .mid, 600 ms debounced autosave) and the built-in preview song is gone. `model/` holds the pure parts, all vitest: `song-edit.ts` (add, move, resize, delete, duplicate, quantise, velocity, track ops, instrument choice with the drum kit on channel 10), `history.ts` (snapshot undo/redo, key coalescing for held nudges, `commitExternal` for agent edits as one step), `roll-math.ts` (view transform, hit test, marquee, gesture deltas), `ruler.ts` and `keymap.ts` (Space, Delete, Mod+D, Mod+A, arrows, Q, Mod+Z). `piano-roll.tsx` is one canvas for keyboard gutter, grid and notes plus a velocity lane, so a 10k-note track is a single paint; the gutter previews pitches through `engine.previewNote`. `arrangement.tsx` and `track-row.tsx` give each track a name, colour, mute, solo and Theme D's GM picker, beside a bar/beat ruler, per-track thumbnails and the playhead. Pointer drag on the canvas is covered by `e2e/piano-roll.spec.ts` (e2e cap 476 to 478). H's live edits (`onChanged`) are one undo step each and `onOpen` shows the song.

**Theme F — Mixer, effects and automation.** ✅ Landed. The Editor's lower panel now switches Piano roll | Mixer | Automation. The song model gained one additive field, `track.effects` (`{id, type, bypass, params}`, max 8, default `[]`), so every existing `.song.json` still parses; mixer strips and automation lanes were already in `SongSchema` and are now used. `SongSchema` also rejects duplicate effect ids and automation targets that are not `volume`, `pan` or `fx:<effectId>:<param>` of an existing effect. Pure parts, all vitest: `model/effects.ts` (the seven-effect catalogue with parameter ranges), `model/automation.ts` (linear/step interpolation, expansion to timed events, point edits), `model/mixer-edit.ts` (strip, chain and lane edits, one undo step per gesture) and `engine/mixer-spec.ts` (the song as plain strip data: bypassed effects dropped, mute/solo folded into gain, lanes as timed values). `engine/tone-mixer.ts` maps that onto Tone channels, effect nodes, meters and Transport-scheduled automation, and both the live host and the offline render use it, so an exported WAV carries the mix. The engine calls `host.syncMixer` after every song change, seek, play and stop, and notes are not rescheduled for a mixer edit. In main, `.mid` export writes volume and pan as CC 7 and CC 10 (fader at tick 0 when not the default, plus lane points) and import reads them back into `mixer` and `volume`/`pan` lanes, so CC 7/10 are no longer loose controllers. Decisions: effect parameters are numeric only (the filter is fixed low-pass); linear lanes expand to events at most 0.1 s apart so effect options glide; there is no master effects chain; volume above unity is written to the `.mid` at 127. Screenshots: `docs/screenshots/p101-f/`.

**Theme G — Clips, loops and the drum grid.** ✅ Landed. A clip is a window onto its track's own notes: the notes whose start lies in `[sourceStartTick, + source length)` belong to it and play where the clip sits, repeating while `loop` fills the clip; notes no clip owns play as written, so old songs are unchanged. `expandClips` (`shared/media-music-clips.ts`) is the one place that knows this, and the engine's `setSong`, the offline WAV render, `songToMidi` (so the `.mid` gets the expanded notes), `sliceSong` and `describeSong` all call it first. Schema stays additive: `clip.sourceLengthTicks?` and `track.grid?` (steps 16/32, swing). The arrangement draws clips over each track's thumbnail, drags to move or resize (beat snap, one coalesced undo step) and has New clip, Loop, Split at playhead, Join, Duplicate and Delete (`model/clip-edit.ts`). Drum tracks open a drum grid (`drum-grid.tsx`, `model/drum-grid.ts`): 16 or 32 steps per bar, bar paging, per-step velocity, swing as the share of a step odd steps are delayed by, baked into the note ticks; a step is just a note on a slot, so the piano roll (toggle beside the grid) edits the same data. Decisions taken unattended: split of a looping clip snaps to a repeat boundary; deleting a clip frees its notes to play where they sit; the grid ignores notes more than a quarter step off a slot rather than snapping them.

**Theme H — `music_*` MCP tools and the agent engines.** ✅ Landed. Fourteen `music_*` tools (midi-file-mcp's names, inputs derived from `SongSchema`) sit in the shared `MCP_TOOLS` registry (`media-music-mcp.ts`) and are implemented in `main/media/music/music-mcp.ts` over per-song working copies: every edit validates the whole result against `SongSchema`, answers `{ok:false, errors}` instead of throwing, and pushes one `mstudio:media:music-changed` event carrying the song; `music_save` writes the `.mid` and `.song.json`. `music_render_preview` draws a piano-roll PNG in main (`music-preview.ts`). Every tool that changes a song, opens it or saves is gated by the new default-off Settings ▸ MCP "Let agents edit music" switch (`allowMusic`, `mcp-store` v9); reads work whenever the server is on. Engines (`music-agents.ts`, IPC `music.agent.run/cancel` plus a progress event): Claude and Codex refine over a private per-run server through `iterative-host.ts` with a preview budget, tool-call ceiling and Cancel; Ollama writes the song as JSON with up to three repair rounds; Antigravity writes in one pass until the user registers Midnite in `~/.gemini/antigravity/mcp_config.json` (consent step in Settings, `agy-registration.ts`), then refines through the app's global server, falling back to one pass when that is off. Decision: a registered agy cannot use a per-run socket, so it needs the MCP server and the music switch on.

**Theme I — The agent chat in the composer.** ◻ Not started. Blocked on the Chats page merging.

**Theme J — Export.** ✅ Landed. The Editor's Export split button offers `.mid`, WAV and MP3 (`MEDIA_AUDIO_EDITOR_EXPORT_FORMATS`; `mid` joined `MediaExportFormat`, no ffmpeg). A Range select exports the whole song or the loop region (`sliceSong` cuts and rebases the song). `.mid` is encoded in main; WAV is the Theme C `Tone.Offline` render handed to main over `mediaMusicExport`; MP3 is that WAV through ffmpeg at the chosen `AUDIO_MP3_BITRATES` rate. The toolbar sits beside the Editor and reads the song the editor publishes through `editor-session.ts`, so the plumbing is song-agnostic. Per-track stems are not built.

**Theme K — Send to Generator.** ✅ Landed on the fallback branch. MusicGen-melody is **not** available as ONNX: no `Xenova/` or `onnx-community/` repo exists, `facebook/musicgen-melody` ships PyTorch weights only, and `@huggingface/transformers` (3.8.1 and 4.3.1) has no `musicgen_melody` model type or chroma extractor. Estimated cost if we exported it ourselves is about 1.9 GB download, 6-8 GB RAM and 4-20x slower than real time, which does not fit an 8 GB Mac. The build therefore takes the fallback: a rendered reference plus a deterministic text description. Write-up: [`docs/research/musicgen-melody-onnx.md`](../../../docs/research/musicgen-melody-onnx.md). Build: **Send to Generator** renders the song (or loop region), lands it in the project as `<song>-reference-<stamp>.wav` and records an import session. `describeSong` derives a deterministic description (Krumhansl-Schmuckler key or the declared key signature, tempo, time signature, GM instruments, a tempo+mode mood) that seeds the prompt form's caption and style tags. The variant's sidecar carries `fromSong` and `description`, and the expanded variant row shows "Rendered from <song>". **Limitation:** the clip is a reference only; nothing conditions generation on the melody, because MusicGen-melody has no ONNX build.

## A — Editor and Generator tabs (S)

- [x] Media › Audio gets top-level **Editor | Generator** tabs. The choice is persisted per repo in `ui-store`, and Generator is the default for existing users.
- [x] Generator renders today's `audio-tab.tsx` body unchanged.
- [x] Both tabs share the left-hand projects list. A project can hold MusicGen variants and songs side by side.
- [x] Keybindings in [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) switch tabs: `media.audio.editor` and `media.audio.generator`, chord-free unless a free chord fits.

## B — The song model and MIDI files (M)

- [x] [`shared/src/media-music.ts`](../../../packages/shared/src/media-music.ts) holds a zod `SongSchema` with:
  - tempo and tempo map
  - time signature
  - tracks with a GM program, channel and colour
  - notes (pitch, start, duration, velocity, all in ticks)
  - CC and pitch bend
  - automation lanes
  - clips
  - mixer state
  - Limits are named constants.
- [x] Main reads and writes `.mid` through `@tonejs/midi`. The editor's own state goes in a `<song>.json` sidecar, and the `.mid` is always the interchange file.
- [x] **Import .mid.** Any Standard MIDI File, type 0 or 1, opens as a song. Unsupported events are kept as passthrough wherever `@tonejs/midi` allows.
- [x] IPC: `mstudio:media:music-{list,read,write,import,delete}` return `GitOpResult` envelopes. The mock bridge is updated.
- [x] Vitest: schema, `.mid` round trip (notes, CC, pitch bend, tempo map), and importing type-0 and type-1 fixtures.

## C — The Tone.js engine (M)

- [x] A lazy `music-engine` chunk wraps `Tone.Transport`. It provides:
  - play, pause and stop
  - seek
  - a loop region
  - a metronome
  - a tempo-map-aware tick ↔ seconds conversion
- [x] A scheduler turns the song model into `Tone.Part`s per track. Edits during playback reschedule only the touched track.
- [x] Offline rendering (`Tone.Offline`) produces WAV for export and previews.
- [x] `AudioContext` is resumed only on a user gesture. Playback is suspended when the window is hidden, following the existing visibility gates.
- [x] Vitest: the scheduler and tick maths run against a fake transport. Real audio is Playwright-only, if needed at all.
- [x] Bundle delta reported with `scripts/perf/bundle-report.mjs`.

## D — General MIDI instruments (M)

- [x] **Licence check first.** Confirm the licence of the FluidR3_GM pre-rendered sample sets (e.g. `gleitz/midi-js-soundfonts`) and record it in the PR. If it is not clearly permissive, fall back to another GM set and record why.
- [x] Main downloads one instrument's samples the first time it is used, caches them under `userData`, and reports progress over an event channel. The pattern is the same as MusicGen's model download.
- [x] A per-track `Tone.Sampler` loads the GM program's samples. Channel 10 maps to a GM drum kit.
- [x] Instrument picker covers all 128 GM programs, grouped by family, with a download or cached badge.
- [x] Offline: a missing instrument falls back to a Tone.js synth with a visible "not downloaded" hint, never silence.
- [x] A licence and attribution notice appears in the Editor's about popover.

## E — Piano roll and arrangement (L)

- [x] **Piano roll:**
  - draw, select (click and marquee), move, resize, duplicate and delete notes
  - quantise and snap
  - velocity lane
  - keyboard gutter that previews pitches
  - horizontal and vertical zoom
- [x] **Arrangement:** a track list with name, instrument, colour, mute and solo, plus a timeline with a bar/beat ruler and the playhead.
- [x] Undo and redo across every edit, including agent edits (see Theme H). Theme H's `music.onChanged` event lands through `useSongDocument` as one undoable step, and `music.onOpen` brings the Editor up on that song.
- [x] Keyboard shortcuts: Space play, Delete, Mod+D duplicate, Mod+A select all, arrows nudge, Q quantise.
- [x] Canvas or virtualised rendering, so a 10k-note song stays smooth.
- [x] Vitest: selection and edit reducers, quantise, snap. Playwright only for pointer drag on the real canvas, named in the spec header.

## F — Mixer, effects and automation (L) ✅ DONE

- [x] Mixer strip per track with volume, pan, mute, solo and a meter, plus a master strip.
- [x] **Per-track effects chain** of Tone.js effects (reverb, delay, EQ3, compressor, chorus, distortion, filter), which can be added, removed, reordered and bypassed.
- [x] **Automation lanes** for volume, pan and any effect parameter, using breakpoint editing with linear and step curves. They are written to the song model; CC 7 and CC 10 are mirrored to the `.mid` where they map.
- [x] Vitest: chain graph building and automation interpolation.

## G — Clips, loops and the drum grid (M) ✅ DONE

- [x] Clips on the arrangement timeline. A clip is a note range that can be looped, split, joined and duplicated.
- [x] **Drum grid:** a step-sequencer editor for drum tracks with 16/32 steps, per-step velocity and swing. It reads and writes the same notes as the piano roll.
- [x] Vitest: clip expansion to notes, the step grid ↔ notes round trip, and swing.

## H — `music_*` MCP tools and the agent engines (M) ✅ DONE

- [x] Tools in the shared `MCP_TOOLS` registry, dispatched in main, with input schemas derived from `SongSchema`:
  - `music_list`
  - `music_open`
  - `music_get_info`
  - `music_set_tempo`
  - `music_get_tracks`
  - `music_get_track`
  - `music_get_notes`
  - `music_add_notes`
  - `music_remove_notes`
  - `music_add_cc`
  - `music_add_pitchbends`
  - `music_add_track`
  - `music_save`
  - The names mirror midi-file-mcp's, so prompts written for it carry over.
- [x] `music_render_preview` returns a piano-roll PNG of a bar range. The optional WAV clip from an open renderer is deferred until Theme C's engine exists (see `outstanding.md`); the PNG is the answer today.
- [x] Validation problems are returned as `{ok:false, errors:[…]}`, never thrown.
- [x] Every edit pushes `mstudio:media:music-changed` to the open editor as one undoable step. `music_open` brings the Editor tab up. The events and `media.audio.music.onChanged`/`onOpen` ship here; the editor-side listener, undo entry and tab switch land with Theme E (see `outstanding.md`).
- [x] A Settings ▸ MCP switch, **"Let agents edit music"**, is off by default and gates every write tool. Reads work whenever the server is on.
- [x] **Agent engines:**
  - **Claude and Codex** refine over several passes through a private per-run MCP socket, reusing `iterative-host.ts`, with an iteration budget and Cancel.
  - **Ollama** writes the song as JSON in a single pass, with repair rounds.
  - **Antigravity** writes in a single pass by default. **"Register Midnite in Antigravity"** in Settings asks first, then writes the server into agy's own MCP config. Once registered, agy refines over several passes too. The button can also unregister.
- [x] Vitest: tool schemas and dispatch, note add/remove semantics, validation-error results, the gating switch, and the agy registration (with a fake config file, consent required).

## I — The agent chat in the composer (M)

- [ ] **Blocked on the Chats page PR.** Reuse its composer, message thread and markdown renderer; do not build a third composer.
- [ ] Each song has its own chat thread, persisted beside the song, e.g. "make the bridge sadder" or "add a walking bass on track 3".
- [ ] Engine and model pickers in the composer, showing which engines refine over several passes and which write in one.
- [ ] Pass progress ("Pass n of N") and the latest tool action, with **Stop directly left of Send**.
- [ ] Assistant replies summarise what changed (tracks and bars touched), with a link that selects those notes in the piano roll.

## J — Export (S) ✅ DONE

- [x] `.mid` (the interchange file), **WAV** (offline Tone.js render) and **MP3** (the Generator's existing encoder and `AUDIO_MP3_BITRATES`), through the Media export toolbar (`MEDIA_TAB_EXPORT_FORMATS`).
- [x] Export the whole song or the loop region. Per-track stems are optional.
- [x] Vitest: export format plumbing. The render is covered by Theme C.

## K — Send to Generator (M, research) ✅ DONE (fallback branch)

- [x] **Spike.** Is MusicGen-melody available as ONNX for `@huggingface/transformers`? Record the download size, RAM use and speed on an 8 GB Mac. **No.** No ONNX export on the hub and no `musicgen_melody` support in transformers.js 3.8.1 or 4.3.1, so nothing could be measured. Small is 656 MB measured; melody is an *estimate* of about 1.9 GB (q8), 6-8 GB RAM and 3-4x slower than small, which rules out 8 GB Macs. Verdict: take the fallback branch. See [`docs/research/musicgen-melody-onnx.md`](../../../docs/research/musicgen-melody-onnx.md).
- [x] ~~If it is: an **"Send to Generator"** button renders the arrangement (or loop region) to audio and hands it to Generator as melody conditioning beside the text prompt.~~ Not applicable, per the spike.
- [x] If it is not: hand Generator a rendered reference plus a generated text description (key, tempo, instrumentation, mood, derived deterministically from the song), and record the limitation.
- [x] The resulting variant in Generator links back to the song it came from.

## Files this phase touches

| Package | Files |
|---|---|
| `shared` | new [`media-music.ts`](../../../packages/shared/src/media-music.ts); [`media.ts`](../../../packages/shared/src/media.ts) (export formats); [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts); [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts); the `MCP_TOOLS` registry; [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) |
| `desktop` | new `main/media/music/` (service, MIDI I/O, sample cache, engines); new `main/mcp/music-tools.ts`; [`main/media/model/iterative-host.ts`](../../../packages/desktop/src/main/media/model/iterative-host.ts) (generalised for music); the MCP settings store (new switch); preload |
| `app` | [`features/media/audio/audio-tab.tsx`](../../../packages/app/src/features/media/audio/audio-tab.tsx) (tabs); new `features/media/music-editor/` (engine, piano roll, arrangement, mixer, drum grid, composer); Settings ▸ MCP page; [`test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts) |
| `scripts` | `e2e-budget.mjs` if a real-browser spec is added |

## Verification

- [ ] `moon run :typecheck :lint :test` is green.
- [ ] Generator works exactly as before: generate, play, export.
- [ ] A human pass: compose 8 bars by hand (piano, bass, drums), loop them, add reverb automation, then export `.mid`, WAV and MP3. The `.mid` opens correctly in GarageBand or Logic.
- [ ] Import a third-party `.mid` and play it with GM instruments. An instrument that is not downloaded yet downloads once, then plays offline.
- [ ] Claude builds a short song over several passes through `music_*`, and the edits appear live and can be undone.
- [ ] Antigravity works in a single pass. After "Register Midnite in Antigravity", it refines over several passes.
- [ ] Bundle report shows the entry-chunk delta, and Tone.js plus the editor sit in lazy chunks.
- [ ] A packaged-app pass: the shim, the sample downloads and the AudioContext all work in the signed build.

## Decisions / open questions

1. **Resolved:** **direction 1.** We build our own `music_*` tools on Midnite's MCP server rather than run midi-file-mcp, so edits appear live and the dependency is gone. The tool names mirror midi-file-mcp's.
2. **Resolved:** **DAW-lite** scope, including automation, clips and loops, effects chains and a drum grid, all in **one phase**.
3. **Resolved:** **General MIDI instruments** are pre-rendered sample sets downloaded per instrument and cached, played through `Tone.Sampler`. This keeps Tone.js as the only audio engine and the app small.
4. **Resolved:** **Antigravity** writes in a single pass by default, with an opt-in button that registers Midnite's server in agy's config.
5. **Resolved:** the composer is a **chat thread** built from the Chats page's parts.
6. **Resolved:** exports are **.mid, WAV and MP3**, plus **import .mid** and **Send to Generator**.
7. **Open — sample hosting.** *Recommendation:* mirror the GM sample sets into `bilo-io/midnite-apps` (versioned, under our control) instead of loading them from a third party's GitHub Pages at runtime.
8. **Open — FluidR3_GM licence.** *Recommendation:* verify it before Theme D starts; Theme D's first item is the gate.
9. **Open — preview format for agents.** *Recommendation:* the piano-roll PNG is always available. The audio clip is a bonus only when the renderer is open, because main has no Web Audio.
10. **Resolved — Theme K fallback.** The spike found MusicGen-melody is not available as ONNX and transformers.js cannot load it, so Theme K ships the reference render plus a deterministic text description (key, tempo, instrumentation, mood), and keeps the button. Revisit only if an ONNX export and a `musicgen_melody` model type appear upstream. Evidence: [`docs/research/musicgen-melody-onnx.md`](../../../docs/research/musicgen-melody-onnx.md).
