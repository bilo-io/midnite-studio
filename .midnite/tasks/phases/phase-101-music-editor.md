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

**Theme A — Editor and Generator tabs.** ◻ Not started.

**Theme B — The song model and MIDI files.** ◻ Not started.

**Theme C — The Tone.js engine.** ◻ Not started.

**Theme D — General MIDI instruments.** ✅ Landed. Licence gate passed: FluidR3_GM.sf2 is MIT (Frank Wen) and the `gleitz/midi-js-soundfonts` pre-rendered sets are CC BY 3.0 (code MIT), so attribution is shown in `GmAttribution`. Main downloads one program's sample set on first use into `userData/gm-samples/` and streams progress on `mstudio:media:gm-progress` (`media.audio.gm.*` on the bridge); the 128-program catalogue lives in `shared/media-music-gm.ts`; the renderer's per-track `Tone.Sampler` factory (`music-editor/gm-sampler.ts`) loads Tone lazily and falls back to a synth with a "not downloaded" hint. Upstream has no FluidR3 percussion set, so the channel-10 kit is synthesised. Samples still load from the third-party host via `GM_SAMPLE_BASE_URL` (mirroring deferred, see outstanding.md); the picker is mounted in Settings ▸ Media ▸ Audio until Theme E's per-track UI exists.

**Theme E — Piano roll and arrangement.** ◻ Not started.

**Theme F — Mixer, effects and automation.** ◻ Not started.

**Theme G — Clips, loops and the drum grid.** ◻ Not started.

**Theme H — `music_*` MCP tools and the agent engines.** ◻ Not started.

**Theme I — The agent chat in the composer.** ◻ Not started. Blocked on the Chats page merging.

**Theme J — Export.** ◻ Not started.

**Theme K — Send to Generator.** ◻ Not started. Opens with a research spike.

## A — Editor and Generator tabs (S)

- [ ] Media › Audio gets top-level **Editor | Generator** tabs. The choice is persisted per repo in `ui-store`, and Generator is the default for existing users.
- [ ] Generator renders today's `audio-tab.tsx` body unchanged.
- [ ] Both tabs share the left-hand projects list. A project can hold MusicGen variants and songs side by side.
- [ ] Keybindings in [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) switch tabs: `media.audio.editor` and `media.audio.generator`, chord-free unless a free chord fits.

## B — The song model and MIDI files (M)

- [ ] [`shared/src/media-music.ts`](../../../packages/shared/src/media-music.ts) holds a zod `SongSchema` with:
  - tempo and tempo map
  - time signature
  - tracks with a GM program, channel and colour
  - notes (pitch, start, duration, velocity, all in ticks)
  - CC and pitch bend
  - automation lanes
  - clips
  - mixer state
  - Limits are named constants.
- [ ] Main reads and writes `.mid` through `@tonejs/midi`. The editor's own state goes in a `<song>.json` sidecar, and the `.mid` is always the interchange file.
- [ ] **Import .mid.** Any Standard MIDI File, type 0 or 1, opens as a song. Unsupported events are kept as passthrough wherever `@tonejs/midi` allows.
- [ ] IPC: `mstudio:media:music-{list,read,write,import,delete}` return `GitOpResult` envelopes. The mock bridge is updated.
- [ ] Vitest: schema, `.mid` round trip (notes, CC, pitch bend, tempo map), and importing type-0 and type-1 fixtures.

## C — The Tone.js engine (M)

- [ ] A lazy `music-engine` chunk wraps `Tone.Transport`. It provides:
  - play, pause and stop
  - seek
  - a loop region
  - a metronome
  - a tempo-map-aware tick ↔ seconds conversion
- [ ] A scheduler turns the song model into `Tone.Part`s per track. Edits during playback reschedule only the touched track.
- [ ] Offline rendering (`Tone.Offline`) produces WAV for export and previews.
- [ ] `AudioContext` is resumed only on a user gesture. Playback is suspended when the window is hidden, following the existing visibility gates.
- [ ] Vitest: the scheduler and tick maths run against a fake transport. Real audio is Playwright-only, if needed at all.
- [ ] Bundle delta reported with `scripts/perf/bundle-report.mjs`.

## D — General MIDI instruments (M)

- [x] **Licence check first.** Confirm the licence of the FluidR3_GM pre-rendered sample sets (e.g. `gleitz/midi-js-soundfonts`) and record it in the PR. If it is not clearly permissive, fall back to another GM set and record why.
- [x] Main downloads one instrument's samples the first time it is used, caches them under `userData`, and reports progress over an event channel. The pattern is the same as MusicGen's model download.
- [x] A per-track `Tone.Sampler` loads the GM program's samples. Channel 10 maps to a GM drum kit.
- [x] Instrument picker covers all 128 GM programs, grouped by family, with a download or cached badge.
- [x] Offline: a missing instrument falls back to a Tone.js synth with a visible "not downloaded" hint, never silence.
- [x] A licence and attribution notice appears in the Editor's about popover.

## E — Piano roll and arrangement (L)

- [ ] **Piano roll:**
  - draw, select (click and marquee), move, resize, duplicate and delete notes
  - quantise and snap
  - velocity lane
  - keyboard gutter that previews pitches
  - horizontal and vertical zoom
- [ ] **Arrangement:** a track list with name, instrument, colour, mute and solo, plus a timeline with a bar/beat ruler and the playhead.
- [ ] Undo and redo across every edit, including agent edits (see Theme H).
- [ ] Keyboard shortcuts: Space play, Delete, Mod+D duplicate, Mod+A select all, arrows nudge, Q quantise.
- [ ] Canvas or virtualised rendering, so a 10k-note song stays smooth.
- [ ] Vitest: selection and edit reducers, quantise, snap. Playwright only for pointer drag on the real canvas, named in the spec header.

## F — Mixer, effects and automation (L)

- [ ] Mixer strip per track with volume, pan, mute, solo and a meter, plus a master strip.
- [ ] **Per-track effects chain** of Tone.js effects (reverb, delay, EQ3, compressor, chorus, distortion, filter), which can be added, removed, reordered and bypassed.
- [ ] **Automation lanes** for volume, pan and any effect parameter, using breakpoint editing with linear and step curves. They are written to the song model; CC 7 and CC 10 are mirrored to the `.mid` where they map.
- [ ] Vitest: chain graph building and automation interpolation.

## G — Clips, loops and the drum grid (M)

- [ ] Clips on the arrangement timeline. A clip is a note range that can be looped, split, joined and duplicated.
- [ ] **Drum grid:** a step-sequencer editor for drum tracks with 16/32 steps, per-step velocity and swing. It reads and writes the same notes as the piano roll.
- [ ] Vitest: clip expansion to notes, the step grid ↔ notes round trip, and swing.

## H — `music_*` MCP tools and the agent engines (M)

- [ ] Tools in the shared `MCP_TOOLS` registry, dispatched in main, with input schemas derived from `SongSchema`:
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
- [ ] `music_render_preview` returns a piano-roll PNG of a bar range. If the renderer is open it can also return a short rendered WAV clip as an audio block, with the PNG as the fallback.
- [ ] Validation problems are returned as `{ok:false, errors:[…]}`, never thrown.
- [ ] Every edit pushes `mstudio:media:music-changed` to the open editor as one undoable step. `music_open` brings the Editor tab up.
- [ ] A Settings ▸ MCP switch, **"Let agents edit music"**, is off by default and gates every write tool. Reads work whenever the server is on.
- [ ] **Agent engines:**
  - **Claude and Codex** refine over several passes through a private per-run MCP socket, reusing `iterative-host.ts`, with an iteration budget and Cancel.
  - **Ollama** writes the song as JSON in a single pass, with repair rounds.
  - **Antigravity** writes in a single pass by default. **"Register Midnite in Antigravity"** in Settings asks first, then writes the server into agy's own MCP config. Once registered, agy refines over several passes too. The button can also unregister.
- [ ] Vitest: tool schemas and dispatch, note add/remove semantics, validation-error results, the gating switch, and the agy registration (with a fake config file, consent required).

## I — The agent chat in the composer (M)

- [ ] **Blocked on the Chats page PR.** Reuse its composer, message thread and markdown renderer; do not build a third composer.
- [ ] Each song has its own chat thread, persisted beside the song, e.g. "make the bridge sadder" or "add a walking bass on track 3".
- [ ] Engine and model pickers in the composer, showing which engines refine over several passes and which write in one.
- [ ] Pass progress ("Pass n of N") and the latest tool action, with **Stop directly left of Send**.
- [ ] Assistant replies summarise what changed (tracks and bars touched), with a link that selects those notes in the piano roll.

## J — Export (S)

- [ ] `.mid` (the interchange file), **WAV** (offline Tone.js render) and **MP3** (the Generator's existing encoder and `AUDIO_MP3_BITRATES`), through the Media export toolbar (`MEDIA_TAB_EXPORT_FORMATS`).
- [ ] Export the whole song or the loop region. Per-track stems are optional.
- [ ] Vitest: export format plumbing. The render is covered by Theme C.

## K — Send to Generator (M, research)

- [ ] **Spike.** Is MusicGen-melody available as ONNX for `@huggingface/transformers`? Record the download size, RAM use and speed on an 8 GB Mac.
- [ ] If it is: an **"Send to Generator"** button renders the arrangement (or loop region) to audio and hands it to Generator as melody conditioning beside the text prompt.
- [ ] If it is not: hand Generator a rendered reference plus a generated text description (key, tempo, instrumentation, mood, derived deterministically from the song), and record the limitation.
- [ ] The resulting variant in Generator links back to the song it came from.

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
10. **Open — Theme K fallback.** *Recommendation:* if MusicGen-melody is not available as ONNX, ship the reference render plus a deterministic text description, and keep the button.
