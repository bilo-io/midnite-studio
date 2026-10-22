# youtube-tutorials

A series of tutorial videos in one look: the **neon HUD** template
([`templates/youtube-tutorials/neon-hud`](../../templates/youtube-tutorials/neon-hud/README.md)).
Kinetic two-line headlines over small glowing diagrams, cut to a ~123 BPM bed.

```
projects/youtube-tutorials/
└── NNN-slug/                 ← one folder per episode, e.g. 001-install-the-cli
    ├── project.json
    ├── input/BRIEF.md        ← from templates/youtube-tutorials/neon-hud/input/BRIEF.md
    └── output/CHANGELOG.md

video-editor/src/projects/youtube-tutorials/NNN-slug/   ← the episode's composition
```

## Starting an episode

```bash
cp -R projects/_template projects/youtube-tutorials/001-my-episode
cp templates/youtube-tutorials/neon-hud/input/BRIEF.md projects/youtube-tutorials/001-my-episode/input/BRIEF.md
cp -R video-editor/src/templates/youtube-tutorials/neon-hud video-editor/src/projects/youtube-tutorials/001-my-episode
```

Then, in the copied composition folder:

1. Rename the export in `register.tsx` (e.g. `YoutubeTutorials001`), give the
   compositions episode ids instead of `Template…`, and register it in
   `src/Root.tsx`.
2. Keep the relative imports as they are. `src/projects/youtube-tutorials/<episode>/`
   sits at the same depth as `src/templates/youtube-tutorials/neon-hud/`, so
   `../../../shared/` still resolves.
3. Fill in `content.ts`, then set `beats.ts` from the episode's own bed. Measure
   the tempo rather than trusting `beat_track`: the template's 123.05 is a
   librosa tempo bin, and its track actually runs at 124.00 BPM (see episode 1's
   `EDITORIAL_SCRIPT.md`).
4. Fill in `project.json` (`"id": "youtube-tutorials/001-my-episode"`) and
   render:

```bash
node scripts/render.mjs youtube-tutorials/001-my-episode first-cut
```

Every episode imports the kit from `video-editor/src/shared/neon-hud/`, so a new
diagram kind or a fix there reaches the whole series at once.

## Episodes

| # | Title | Status |
|---|---|---|
| 1 | [Midnite video 1 — the automated workflow](midnite-video-1-automated-workflow/EDITORIAL_SCRIPT.md) (`midnite-video-1-automated-workflow`) | v1 first cut |
