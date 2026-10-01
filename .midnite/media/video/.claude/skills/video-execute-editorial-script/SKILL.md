---
name: video-execute-editorial-script
description: Build the Remotion composition described by an editorial script (from video-write-editorial-script) - trimming source footage, building each section, and sequencing them into the timeline
---

# Execute an editorial script

Use this when an `EDITORIAL_SCRIPT.md` (see `video-write-editorial-script`) already
exists and it's time to actually build the Remotion composition it describes.

ARGUMENTS: the path to the editorial script, e.g.
"script: projects/acme/marketing/001-launch/EDITORIAL_SCRIPT.md". If it doesn't exist
yet, use `video-write-editorial-script` first — don't improvise a plan from the raw brief
here.

## Process

1. **Read the editorial script in full** before writing any code. It should already
   contain resolved timestamps, frame numbers, pixel coordinates and asset paths — don't
   re-derive them. If something turns out to be missing or wrong, fix the script first
   rather than silently improvising in code — the script is the durable record.

2. **Build inside the shared editor app, don't scaffold a new one.** `video-editor/`
   serves every video: add `src/projects/<project-id>/` — **mirroring the project's
   path** under `projects/` — with a `register.tsx` (its `<Folder>` + `<Composition>`;
   copy `example/000-hello`'s) and one import line in `src/Root.tsx`. Composition ids
   must stay unique across projects: they are what `remotion render` addresses.

3. **Reference assets, don't copy them.** `npm run assets` (`scripts/sync-assets.mjs`)
   mirrors `assets/` and every project's `input/` into `video-editor/public/`, which is
   generated. Shared media is `staticFile("audio/music/x.mp3")`; the project's own media
   is `projectFile("<project-id>")("x.mp4")`.

4. **Build each section as its own component**, following the script's per-section spec
   exactly. Trim source clips with `<OffthreadVideo trimBefore={} trimAfter={}>`.

5. **Sequence the full timeline** per the script's cut points with
   `<Sequence from={} durationInFrames={}>`. A `<Sequence>` defaults to
   `layout="absolute-fill"`; pass `layout="none"` when it only shifts a child's clock
   inside a flex layout.

6. **Treat the script's frame numbers as approximate** unless it says otherwise. Preview
   in Studio (`cd video-editor && npm run dev -- --no-open`) and nudge cut points by eye.

7. **Build only what the script marks as ready.** Skip anything on hold and say so.

8. **Only render when explicitly asked.** Then use
   `node scripts/render.mjs <project-id> [label]`: it renders the next iteration into
   `projects/<project-id>/output/vN-<label>.mp4` and appends a stub to that project's
   `output/CHANGELOG.md`. A still is `node scripts/render.mjs <project-id> <label> --still <frame>`.

9. **Report back** what was built, what was skipped and why, and any deviation from the
   script.

## After building

If the build revealed something the editorial script got wrong, update the script to
match reality before finishing.
