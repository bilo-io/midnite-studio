# Remotion in Claude

Notes on how Claude creates and renders videos with Remotion, for this project. For the
end-to-end workflow (brief → editorial script → build → verify → render) see
[../README.md](../README.md).

> PATH note: `node`/`npx`/`ffmpeg` are Homebrew installs — run
> `export PATH="/opt/homebrew/bin:$PATH"` first in Claude's shell.

## What's available

A Remotion plugin with a router skill (`remotion-best-practices`) plus specialized skills for:

- Creating a new project (`remotion-create`)
- Writing/animating content (`remotion-markup`)
- Captions (transcription + animated display)
- Maps / geo animations (Mapbox, MapLibre, MapTiler, GeoJSON)
- Multimedia (trim/crop/metadata via Mediabunny)
- Structuring compositions for interactive editing in Studio (`remotion-interactivity`)
- Previewing (`remotion-studio`)
- Rendering (`remotion-render`)
- Building a Remotion-powered SaaS app (`remotion-saas`)
- Doc lookup (`remotion-docs`)
- Upgrades (`remotion-upgrade`)

This repo adds two of its own on top — `/video-write-editorial-script` and
`/video-execute-editorial-script` — which are the entry points; the Remotion skills above
are what they defer to for technique.

## How it works

1. **Scaffold** — only needed once per *repo*, not per video: this repo already has
   `video-editor/`, and a new video is a new folder under `video-editor/src/projects/`
   registered in `src/Root.tsx` (see `video-editor/README.md`). For a brand-new repo:
   ```bash
   npx create-video@latest --yes --blank --no-tailwind my-video
   cd my-video
   npm i
   ```
   This is a normal Node/React project.

2. **Design** — Claude writes the video as React components ("compositions"): text, images,
   animations, and timing all live in code, following layout/markup best-practice rules baked
   into the skill.

3. **Preview**
   ```bash
   cd video-editor && npm run dev -- --no-open
   ```
   Starts a local dev server (prints a `localhost` URL, e.g. `http://localhost:3000`) with a
   live timeline editor. Specific compositions can be deep-linked, e.g. `/MidnitePilot`. This
   is a real browser app, not a terminal preview. Run it as a background task **without
   piping its output** — `| head` closes the pipe and kills the server.

4. **Render** (only when explicitly requested)
   ```bash
   node scripts/render.mjs <project-id> [label]     # this repo's wrapper
   npx remotion render <composition-id> <out.mp4>   # what it runs underneath
   ```
   In this repo a render is an *iteration of a project*, so it goes to
   `projects/<project-id>/output/vN-<label>.mp4` rather than the app's `out/`.

## Version pinning

Every `remotion` / `@remotion/*` package must sit on the **same exact version**, with no
`^`. Remotion's packages are released in lockstep and a caret on any one of them lets it
drift ahead of the rest; `npx remotion versions` reports the mismatch, and the failure
mode when it doesn't is a confusing runtime error rather than a clean one. Upgrade the
whole set at once with `npm run upgrade`.

## Output directory

Remotion defaults to `out/<composition-id>.mp4` inside the app, which this repo does not
use: renders are iterations of a project, so `scripts/render.mjs <project-id> [label]`
passes an explicit output path and they land in
`projects/<project-id>/output/vN-<label>.mp4` (gitignored, with a tracked
`output/CHANGELOG.md` recording what changed in each cut).

## Claude Code vs. VS Code extension vs. Desktop app

Functionally identical. Everything is driven by shell commands (`npx remotion ...`) and file
edits — nothing in the skill is Desktop-exclusive. Claude Code, the VS Code extension, and
Desktop can all do the same work. The differences are in how each client surfaces the result,
not what Claude can do:

- **Studio preview** is a localhost web server either way — open the printed URL in a browser.
  If an in-harness browser is available, Claude can open it there directly; otherwise it hands
  you the URL.
- **Rendered video** — once it's in a project's `output/`, Claude can send it to you as a file
  directly in the chat so you can watch/download it inline, regardless of client.
