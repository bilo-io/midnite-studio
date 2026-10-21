---
name: midnite-media-video-project
description: Orient an agent in Midnite Studio's Media ▸ Video root — layout, engine, project.json — and route to the write and execute editorial-script skills. Use when the user asks for a video and the working directory is a video root.
---

# Media ▸ Video — project

The Video page runs a Remotion or HyperFrames workspace (`video.config.json` says which) scaffolded by **Setup Video**.

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

No `video_*` tools. Audio for a video is made in Media ▸ Audio (`music_*` tools are planned in Phase 101).

## Hand-off to the UI

Send the user to **Media ▸ Video ▸ project**: Studio previews, and Render writes the file. The detail view also has buttons that launch the two skills in a terminal.
