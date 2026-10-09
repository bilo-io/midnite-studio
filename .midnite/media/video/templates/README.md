# Templates

A template is a **video that has already been made, reduced to its grammar**:
the structure, transitions, stages and type of a finished project, with a
labelled placeholder wherever the original had copy or a recording. Start the
next video from one when it should feel like the one it came from.

`projects/_template/` is a different thing: an empty project folder (a
manifest, a brief and a changelog stub) to copy for *any* video. A template
here is a working composition you can render, watch and copy.

```
templates/<brand>/<name>/            ← the documentation half
├── README.md          ← the grammar: every section, stage and transition, and why
├── project.json       ← manifest; read by scripts/render.mjs like a project's
├── input/BRIEF.md     ← a brief with the template's structure and blanks to fill
└── output/            ← renders (gitignored) + CHANGELOG.md (tracked)

video-editor/src/templates/<brand>/<name>/   ← the code half, registered in Root.tsx
```

Rendering is the same as for a project, with the `templates/` prefix on the id:

```bash
node scripts/render.mjs templates/midnite/golive-promo
node scripts/render.mjs templates/midnite/golive-promo annotated --comp TemplateGolivePromoAnnotated
node scripts/render.mjs templates/midnite/golive-promo check --still 440
```

| Template | Made from | What it shows |
|---|---|---|
| [`midnite/golive-promo`](midnite/golive-promo/README.md) | `projects/midnite/marketing/001-golive-promo` | Dark/light stages turned over by liquid wipes, claims struck in on the beat, a statement across a change of stage, the breath and the drop, colour cards, and the outro lockup |
