# Video workspace

Scaffolded by Midnite Studio's **Media ▸ Video ▸ Setup Video**. One editor app serves
every project; each project is a folder under `projects/` holding a `project.json`.

You pick the **engine** that authors and renders the compositions — **Remotion** (React)
or **HyperFrames** (HTML + GSAP, by HeyGen, Apache-2.0). The choice is recorded in
`video.config.json` at this folder's root and can be switched later from the Video tab
or Settings ▸ Media. A workspace with no `video.config.json` is Remotion.

```
.
├── video.config.json      { "engine": "remotion" | "hyperframes" }
├── .claude/skills/        /midnite-media-video-write-editorial-script (brief → plan), /midnite-media-video-execute-editorial-script (plan → code)
├── assets/{audio,fonts,images,logos,video}/   shared, reusable media
├── projects/_template/    copy this to start a video
├── projects/example/000-hello/                the worked example (composition `ExampleHello`)
├── scripts/               render.mjs · sync-assets.mjs · projects.mjs · engine.mjs  (dispatch on the engine)
├── video-editor/          Remotion app — `npm install` once, `npm run dev` for Studio
└── hyperframes-editor/    HyperFrames app — `npm install` once, `npm run dev -- projects/<id>` for Studio
```

Only the chosen engine's editor app is scaffolded; switching copies the other one in and
leaves yours untouched. Everything else — `projects/`, `assets/`, `scripts/`, the skills,
the `output/vN` iterations — is identical for both.

Render the next iteration of a project (the same command for both engines):

```bash
node scripts/render.mjs example/000-hello first-cut
# → projects/example/000-hello/output/v1-first-cut.mp4 (+ a CHANGELOG stub to fill in)
```

## Requirements

|             | Remotion                          | HyperFrames                                            |
| ----------- | --------------------------------- | ------------------------------------------------------ |
| Node        | any current LTS                   | **22+**                                                |
| ffmpeg      | only for Midnite Studio transcode | **required** (`brew install ffmpeg`)                   |
| Chrome      | downloaded by Remotion            | downloaded by `hyperframes` on first render            |
| Network     | `npm install`                     | `npm install`, first render (Chrome, GSAP from a CDN)  |

`scripts/render.mjs` needs only Node; transcoding an iteration to another format from
Midnite Studio uses the system `ffmpeg`.

## HyperFrames notes

- A composition is `hyperframes-editor/projects/<project-id>/index.html` — plain HTML with
  `data-*` timing attributes and a paused GSAP timeline. `npm run dev -- projects/<id>` opens
  its Studio; `npx hyperframes check projects/<id>` lints it.
- `npm run assets` mirrors shared `assets/` to `<project>/assets/<kind>/…` and the project's
  `input/` to `<project>/assets/input/…` (generated, gitignored).
- HyperFrames ships its own agent skills; they are not vendored here (they move fast and
  `skills update` would write to your global agent config). Install them with
  `npx hyperframes skills update` and your agent will load them beside the two skills above.
- The CLI sends anonymous usage telemetry unless `DO_NOT_TRACK=1`; Midnite Studio and
  `scripts/render.mjs` set it for you.
