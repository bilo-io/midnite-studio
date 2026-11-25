---
name: midnite-media-video-project
description: Orient an agent in Midnite Studio's Media ▸ Video root — layout, engine, project.json — and route to the write and execute editorial-script skills. Use when the user asks for a video and the working directory is a video root.
---

# Media ▸ Video — project

The Video page runs a Remotion or HyperFrames workspace (`video.config.json` says which) scaffolded by **Setup Video**.

## 0 · Run the script first

Run `scripts/skills/media/scaffold.sh video <project>`. It creates the project folder without overwriting anything or writing app-owned sidecars. You still route to the write and execute editorial-script skills. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## Layout

```
<video root>/                         .midnite/media/video/ by default
  video.config.json                   engine
  projects/<group>/<id>/
    project.json                      id, title, composition — engine-neutral
    input/BRIEF.md                    the brief
    EDITORIAL_SCRIPT.md               the plan; source of truth
  video-editor/ | hyperframes-editor/ the engine app
  scripts/  assets/  .claude/skills/  render + helper scripts, media, the two skills
```

## Conventions

- Brief to plan: `/midnite-media-video-write-editorial-script`. Plan to composition code: `/midnite-media-video-execute-editorial-script`. Always plan first.
- Both skills are engine-aware; read `video.config.json` before touching code.
- Do not hand-edit `project.json` fields the app owns; keep `composition` equal to the registered composition id.

## MCP

No `video_*` tools. Music for a video is made in Media ▸ Audio. Sound effects (whooshes, clicks, impacts, ambience) come from **Media ▸ SFX** through `sfx_status` / `sfx_generate` (`/midnite-media-sfx-generate`): call `sfx_status` first and, if it returns a `hint`, ask the user to install Stable Audio Open Small there — an agent never accepts its licence or starts the download. Takes land in `.midnite/media/sfx/<project>/`, and the editor's `npm run assets` mirrors them into `media-sfx/` (`staticFile("media-sfx/<project>/x.wav")` / `assets/media-sfx/<project>/x.wav`).

## Hand-off to the UI

Send the user to **Media ▸ Video ▸ project**: Studio previews, and Render writes the file. The detail view also has buttons that launch the two skills in a terminal.
