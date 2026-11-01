---
name: midnite-media-sfx-generate
description: Make sound effects for a game or a video with Midnite Studio's Media ▸ SFX (local Stable Audio Open Small) through the sfx_* tools on the midnite MCP server — check it is installed, prompt, generate takes as a job, poll, pick, use. Use when the user wants sound effects, foley or short ambiences.
---

# Media ▸ SFX — generate

Media ▸ SFX makes sound effects from a text prompt on this Mac with **Stable Audio Open Small** (Stability AI, 44.1 kHz stereo, up to ~11 s a take, about ten seconds per take on CPU). It is made for effects, foley, ambience and short riffs — not songs (that is Media ▸ Audio).

## Opt-in, and the user's call alone

The model is **not** bundled. The user installs it once from **Media ▸ SFX**: they read the Stability AI Community License (free under US$1M annual revenue; an Enterprise licence above that; "Powered by Stability AI" attribution in a product that ships its sounds), tick the acknowledgement, and the app downloads ~2.1 GB.

- **Always call `sfx_status` first.** If it returns a `hint` (not installed, or the licence text changed), stop and **ask the user** to install it in Media ▸ SFX, quoting the hint. Never try to accept the licence, download the weights, or work around the refusal — no tool does either, by design.
- In an app without the engine (`state: "unavailable"`), say so and suggest Midnite Studio.

## Layout

```
<repo>/.midnite/media/sfx/<project>/
  <name>-<settings>-<stamp>.wav     a take — the settings are in the name: 2s, st12, cfg2p5, neg, s<seed>
  <name>-<settings>-<stamp>.json    sidecar: prompt, every setting, seed, model and revision
```

Name the project after what uses the sounds — the game's id, or the video project's slug.

## MCP

| Tool | Use |
|---|---|
| `sfx_status` | Install state, licence and `hint`; with `generationId`, a run's `status`, `stage`, `fraction` and finished `files` (repo-relative). |
| `sfx_generate` | Starts a run (`repoPath`, `project`, `prompt`, optional `name`, `options`) and returns `generationId` at once. Needs the `Let agents edit music` switch in Settings ▸ MCP. |

Poll `sfx_status({ generationId })` about every 5 s until `status` is `succeeded`, `failed` or `cancelled`.

### Options

| Option | Range | Default | Notes |
|---|---|---|---|
| `seconds` | 0.5–11.8 | 3 | Ask for what the effect needs; a footstep is 0.5–1 s, an ambience bed 8–11 s. |
| `steps` | 1–32 | 8 | The model is distilled for 8; more is slower, rarely better. |
| `cfgScale` | 1–7 | 1 | Above 1 the run is twice as slow, but `negativePrompt` takes effect. |
| `negativePrompt` | text | — | Only with `cfgScale` > 1: "music, speech" keeps an effect clean. |
| `variations` | 1–4 | 1 | Several takes with consecutive seeds — then pick one. |
| `seed` | 0–2147483647 | random | Reuse a sidecar's seed to remake a take exactly. |

## Prompting

- Describe the sound, its source and its space: "heavy wooden door creaks open slowly, small stone room", "8-bit coin pickup, bright", "rain on a tin roof, steady, no thunder".
- One sound per prompt. Make variations, not a longer clip, when you need alternatives.

## Using the takes

- **Games:** `game_import_asset` with `source: { tab: "sfx", repoPath, path: "<project>/<file>.wav" }` copies a take into the game's `assets/` and commits it.
- **Videos:** in a video root at `.midnite/media/video`, the editor's `npm run assets` (`scripts/sync-assets.mjs`) mirrors the `.wav` takes from `.midnite/media/sfx/` into `media-sfx/` — `staticFile("media-sfx/<project>/<file>.wav")` in Remotion, `assets/media-sfx/<project>/<file>.wav` in HyperFrames. A root scaffolded before this mirror existed lacks it: copy the take into the project's `input/` instead.
- Credit "Powered by Stability AI" wherever the product lists its audio credits.

## Hand-off to the UI

Send the user to **Media ▸ SFX ▸ `<project>`** to audition the takes: play each, and "reuse settings" puts a take's prompt, settings and seed back into the form.
