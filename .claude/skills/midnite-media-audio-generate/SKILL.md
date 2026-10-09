---
name: midnite-media-audio-generate
description: Prepare music or audio generation for Midnite Studio's Media ▸ Audio page — title, style tags, lyrics and duration — and explain the project layout. Use when the user wants a song, a loop or a soundtrack made in the Audio page.
---

# Media ▸ Audio — generate

The Audio page generates music from a prompt (and optional lyrics) and keeps every take as a variant. The local engine is MusicGen small (`Xenova/musicgen-small`, CC-BY-NC-4.0, ~660 MB one-time download); a local Ollama model can expand a short idea into a caption first.

## Layout

```
<repo>/.midnite/media/audio/<project>/
  project.json        session history — each generation appends one session
  <song>.mp3 | .wav | .flac | .m4a | .aac | .ogg    a variant
  <song>.json         sidecar beside every variant
```

## Conventions

- `project.json` and the sidecars are app-owned; a missing or hand-broken `project.json` reads as an empty history, so never "repair" it by hand.
- Limits: title 120 chars, up to 12 style tags of 40 chars, lyrics 5000 chars, duration 10–480 s, up to 4 variants per run, music prompt 400 chars.
- Lyrics may carry section markers: Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro.
- Drafting is the useful agent job: propose a title, style tags, a 400-char prompt and structured lyrics.

## MCP

No `music_*` tools exist yet — they are planned in Phase 101. Until then the agent cannot trigger generation; it only drafts inputs.

## Hand-off to the UI

Give the user the drafted fields and send them to **Media ▸ Audio ▸ `<project>`** to paste them into the create panel and run it. Variants appear in the project once rendered.
