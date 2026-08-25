# Phase 14 — Graph themes, avatars in the node, author filter

Four selectable graph styles modelled on the reference clients, avatars in every commit
bubble, a dedicated BRANCH / TAG column, an author filter, and the Settings view to hold the
picker (it is a `<Placeholder>` today).

Reference: the four-way comparison screenshot (git-graph · GitExtensions · Sourcetree, with
the ASCII `git log` variant dropped) plus a GitKraken capture.

## Deliverables

### A — Theme descriptor + four styles

- [ ] `features/graph/graph-themes.ts` — `GraphTheme` descriptor, four styles
- [ ] `graph-svg.tsx` takes a theme; `edge` switches `straight` | `bezier` | `orthogonal`
- [ ] `git-graph` gets **solid** nodes and arrowheads (markers defined once at list level,
      never per row — 50k rows would mean 50k duplicate `<defs>`)
- [ ] `ROW_HEIGHT` / `LANE_WIDTH` module constants become theme fields

| Style | Edge | Stroke | Avatar | Row | Arrows |
|---|---|---|---|---|---|
| `git-graph` | orthogonal | 2 | 18 | 30 | yes |
| `git-extensions` | straight | 1.5 | 16 | 28 | no |
| `sourcetree` | bezier | 2.5 | 18 | 32 | no |
| `gitkraken` | orthogonal | 3 | 24 | 38 | no |

### B — Avatars in the node

- [ ] `services/avatars.ts` — SHA-256 (not MD5: `crypto.subtle` has it, no new dep),
      lowercased+trimmed email, `d=404` so a miss falls through to our own avatar
- [ ] Deduped by email, not by commit — 50k commits with 12 authors is 12 requests
- [ ] `features/graph/commit-avatar.tsx` — generated initials as the initial state AND the
      error state, so a row never paints an empty circle
- [ ] Node becomes `<clipPath>` + `<image>` + coloured ring, inside the existing SVG
- [ ] **Author column deleted**; name/email/date move to a `<Tooltip>` on the bubble

### C — BRANCH / TAG column (all styles)

- [ ] Ref chips move to a dedicated resizable left column
- [ ] Column order: BRANCH / TAG · GRAPH · COMMIT MESSAGE · DATE · SHA
- [ ] `graphColumns` gains `branchTag`, loses `author`; store `version` → 2 with a migration

### D — Author filter

- [ ] `features/graph/author-filter.tsx` — authors derived from loaded rows, unique by
      lowercased email, counted, sorted by count
- [ ] `components/multi-select-menu.tsx` extracted from `ref-filter.tsx`
- [ ] `graphAuthorFilter` session-scoped: not persisted, cleared by `selectRepo`
- [ ] **Dim, do not remove** — `git log --author` omits commits without rewriting `%P`, so
      the lane engine would hold a lane open forever for every filtered-out parent

### E — Settings view

- [ ] `features/settings/settings-view.tsx` replaces the `<Placeholder>`
- [ ] Style picker: four cards, each a live `<GraphSvg>` of a small synthetic history
- [ ] `graphTheme` persisted (it is a preference, unlike the filters)

## Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] `graph-themes.test.ts` — every theme's `rowHeight` clears `avatarSize` + padding and
      every `nodeRadius` holds its avatar (the invariants avatars-everywhere imposes)
- [ ] `avatars.test.ts` — known-email SHA-256; lowercase/trim; one memo entry per email
- [ ] `author-filter.test.ts` — unique by lowercased email, counted, sorted
- [ ] `ui-store.test.ts` — `graphTheme` persists, `graphAuthorFilter` does not and clears on
      repo switch, v1 → v2 migration drops the `author` width
- [ ] Switching style re-measures the virtualizer (`estimateSize` is cached — without an
      explicit `measure()` every row keeps the old height until fully scrolled)
- [ ] Offline: every node shows initials, no broken images
- [ ] **Dragging a ref chip onto another still opens the merge/rebase menu** — Phase 8's
      gesture, relocated to the new column; the easiest thing here to break silently
- [ ] Screenshot per style → `docs/screenshots/phase-14-*.png`
