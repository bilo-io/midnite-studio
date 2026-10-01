# Project template

Copy this folder to start a video. A project id is a **path**, not a single
segment — `<brand>/<category>/<NNN-name>`:

```bash
cp -R projects/_template projects/acme/marketing/001-my-video
```

Then fill in `project.json`, drop the brief in `input/BRIEF.md` (and the
original video, if this edit has one, beside it), and run
`/video-write-editorial-script`.

```
projects/<brand>/<category>/NNN-name/
├── project.json          ← id, title, composition id, paths (read by scripts/render.mjs)
├── EDITORIAL_SCRIPT.md   ← written by /video-write-editorial-script; the source of truth
├── input/                ← supplied and derived build inputs
│   └── BRIEF.md
├── notes/                ← scratch notes, superseded drafts
└── output/               ← iterations: v1-….mp4, v2-….mp4
    ├── CHANGELOG.md      ← what changed in each cut
    └── _stills/          ← verification stills
```

Anything reusable across videos (logos, b-roll, music, fonts) belongs in the
workspace-level `assets/`, not in `input/`. The matching composition folder is
`video-editor/src/projects/<same path>/`.
