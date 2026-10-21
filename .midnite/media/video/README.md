# Video workspace

Scaffolded by Midnite Studio's **Media ▸ Video ▸ Setup Video**. One Remotion app
(`video-editor/`) serves every project; each project is a folder under `projects/`
holding a `project.json`.

```
.
├── .claude/skills/        /video-write-editorial-script (brief → plan), /video-execute-editorial-script (plan → code)
├── assets/{audio,fonts,images,logos,video}/   shared, reusable media
├── projects/_template/    copy this to start a video
├── projects/example/000-hello/                the worked example (composition `ExampleHello`)
├── scripts/               render.mjs · sync-assets.mjs · projects.mjs
└── video-editor/          the Remotion app — `npm install` once, `npm run dev` for Studio
```

Render the next iteration of a project:

```bash
node scripts/render.mjs example/000-hello first-cut
# → projects/example/000-hello/output/v1-first-cut.mp4 (+ a CHANGELOG stub to fill in)
```

`scripts/render.mjs` needs only Node; transcoding an iteration to
another format from Midnite Studio uses the system `ffmpeg`.
