---
name: video-execute-editorial-script
description: Build the composition (Remotion or HyperFrames, per video.config.json) described by an editorial script (from video-write-editorial-script) - trimming source footage, building each section, and sequencing them into the timeline
---

# Execute an editorial script

Use this when an `EDITORIAL_SCRIPT.md` (see `video-write-editorial-script`) already
exists and it's time to actually build the composition it describes.

## Engine — read `video.config.json` first

The workspace renders with **Remotion** or **HyperFrames** (`{ "engine": … }` at the repo
root; absent = Remotion). Steps 2–6 below have one form per engine; everything else —
the script, `projects/<id>/`, `input/`, shared `assets/`, `scripts/render.mjs`, the
`output/vN` iterations and CHANGELOG — is identical. Follow only your engine's form.

| | Remotion (`video-editor/`) | HyperFrames (`hyperframes-editor/`) |
| --- | --- | --- |
| Composition lives in | `src/projects/<project-id>/register.tsx` + components, one import line in `src/Root.tsx` | `projects/<project-id>/index.html` (plain HTML; sub-compositions in `compositions/`) |
| Assets | `staticFile("audio/x.mp3")`, `projectFile("<id>")("x.mp4")` | `assets/audio/x.mp3`, `assets/input/x.mp4` (mirrored by `npm run assets`) |
| Timing | `<Sequence from={frame} durationInFrames={n}>`, `<OffthreadVideo trimBefore trimAfter>` | `data-start` / `data-duration` in **seconds**, `data-track-index` for layering, `class="clip"` on timed elements |
| Animation | React + `spring()` / `interpolate()` | a **paused GSAP timeline** registered as `window.__timelines["<composition-id>"]` (CSS/WAAPI/Lottie/Three also seekable) |
| Studio | `cd video-editor && npm run dev -- --no-open` | `cd hyperframes-editor && npx hyperframes preview projects/<project-id> --no-open` |

**HyperFrames rules that bite:** every animation must be *seekable* (driven by a timeline,
never `setTimeout`/`requestAnimationFrame`/free-running CSS), so a frame is a pure function
of time; the root element carries `data-composition-id`, `data-start`, `data-duration`,
`data-width`, `data-height`; the composition id in `project.json` should match it. Run
`npx hyperframes check projects/<project-id>` (lint + runtime + layout) before reporting
done. HyperFrames ships its own skills (`/hyperframes`, `/hyperframes-core`,
`/hyperframes-animation`, …); load them when present, and ask the user to run
`npx hyperframes skills update` when they are not. Its first render also fetches a
headless Chrome and loads GSAP from a CDN, so it needs a network once.

ARGUMENTS: the path to the editorial script, e.g.
"script: projects/acme/marketing/001-launch/EDITORIAL_SCRIPT.md". If it doesn't exist
yet, use `video-write-editorial-script` first — don't improvise a plan from the raw brief
here.

## Process

1. **Read the editorial script in full** before writing any code. It should already
   contain resolved timestamps, frame numbers, pixel coordinates and asset paths — don't
   re-derive them. If something turns out to be missing or wrong, fix the script first
   rather than silently improvising in code — the script is the durable record.

2. **Build inside the shared editor app, don't scaffold a new one.**
   *Remotion:* `video-editor/` serves every video: add `src/projects/<project-id>/` —
   **mirroring the project's path** under `projects/` — with a `register.tsx` (its
   `<Folder>` + `<Composition>`; copy `example/000-hello`'s) and one import line in
   `src/Root.tsx`. Composition ids must stay unique across projects: they are what
   `remotion render` addresses.
   *HyperFrames:* `hyperframes-editor/projects/<project-id>/` — **mirroring the project's
   path** — holds the composition as `index.html`; copy `example/000-hello`'s. Keep
   `data-composition-id` equal to the `composition` in `project.json`.

3. **Reference assets, don't copy them.** `npm run assets` (`scripts/sync-assets.mjs`)
   mirrors `assets/` and every project's `input/` into the editor app, which is generated
   (Remotion: `video-editor/public/`; HyperFrames: each project's `assets/`). Shared media
   is `staticFile("audio/music/x.mp3")` / `assets/audio/music/x.mp3`; the project's own
   media is `projectFile("<project-id>")("x.mp4")` / `assets/input/x.mp4`.

4. **Build each section as its own unit** (a component, or a sub-composition under
   `compositions/`), following the script's per-section spec exactly. Trim source clips
   with `<OffthreadVideo trimBefore={} trimAfter={}>` (Remotion) or
   `data-media-start` on a `<video class="clip">` (HyperFrames).

5. **Sequence the full timeline** per the script's cut points with
   `<Sequence from={} durationInFrames={}>` (Remotion; a `<Sequence>` defaults to
   `layout="absolute-fill"` — pass `layout="none"` when it only shifts a child's clock
   inside a flex layout) or `data-start`/`data-duration` on each clip (HyperFrames).

6. **Treat the script's frame numbers as approximate** unless it says otherwise. Preview
   in Studio (the command for your engine is in the table above) and nudge cut points by
   eye.

7. **Build only what the script marks as ready.** Skip anything on hold and say so.

8. **Only render when explicitly asked.** Then use
   `node scripts/render.mjs <project-id> [label]`: it renders the next iteration into
   `projects/<project-id>/output/vN-<label>.mp4` and appends a stub to that project's
   `output/CHANGELOG.md` — it dispatches on the engine, so the command is the same for
   both. A still is `node scripts/render.mjs <project-id> <label> --still <frame>`
   (Remotion: a frame number; HyperFrames: seconds). HyperFrames also takes
   `--format=webm|mov|gif` and `--crf=N`.

9. **Report back** what was built, what was skipped and why, and any deviation from the
   script.

## After building

If the build revealed something the editorial script got wrong, update the script to
match reality before finishing.
