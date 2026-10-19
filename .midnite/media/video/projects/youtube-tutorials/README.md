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
2. Fix the relative imports. The copy sits one folder deeper than the
   template, so `../../../shared/` becomes `../../../../shared/`.
3. Fill in `content.ts`, then set `beats.ts` from the episode's own bed.
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
| — | *(none yet)* | |
