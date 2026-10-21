---
name: midnite-media-image-generate
description: Plan and organise image generation for Midnite Studio's Media ▸ Images page — prompts, aspect, provider, and the file layout. Use when the user wants images generated or a prompt crafted for the Images page.
---

# Media ▸ Images — generate

The Images page generates pictures from a prompt through a provider chosen in the page (`gemini`, `openai`, `agy`, `ollama`; default `agy`). Generation runs in the app, not in the agent.

## Layout

```
<repo>/.midnite/media/image/<project>/
  <name>.png | .jpg | .jpeg | .webp | .gif   the image
  <name>.json                                sidecar written beside every generated image
```

The sidecar (`version: 1`) records `file`, `prompt`, `provider`, `model`, `aspect` (`1:1`, `3:2`, `2:3`, `16:9`, `9:16`), optional `seed` and `createdAt`. A `.json` that does not parse as a sidecar is simply not shown.

## Conventions

- Do not write image files or sidecars by hand; the app writes both together. Importing an existing image by copying it in is fine — it just has no sidecar.
- A prompt is at most 4000 characters; a run makes 1–4 images.
- When asked for a prompt, give one concrete subject, style, lighting and composition paragraph, plus the aspect to pick.

## MCP

No `image_*` tools exist. Provider keys live in Settings; never ask the user to paste them into a file.

## Hand-off to the UI

Give the user the prompt, aspect and provider to use, then send them to **Media ▸ Images ▸ `<project>`** and its create panel. Results appear in the project grid.
