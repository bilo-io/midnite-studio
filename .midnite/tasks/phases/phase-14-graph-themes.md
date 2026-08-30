# Phase 14 — Graph themes, avatars in the node, author filter

Four selectable graph styles modelled on the reference clients, avatars in every commit
bubble, a dedicated BRANCH / TAG column, an author filter, and the Settings view to hold the
picker (it is a `<Placeholder>` today).

Reference: the four-way comparison screenshot (git-graph · GitExtensions · Sourcetree, with
the ASCII `git log` variant dropped) plus a GitKraken capture.

## Deliverables

### A — Theme descriptor + four styles

- [x] `features/graph/graph-themes.ts` — `GraphTheme` descriptor, four styles
- [x] `graph-svg.tsx` takes a theme; `edge` switches `straight` | `bezier` | `orthogonal`
- [x] `git-graph` gets **solid** nodes and arrowheads (markers defined once at list level,
      never per row — 50k rows would mean 50k duplicate `<defs>`)
- [x] `ROW_HEIGHT` / `LANE_WIDTH` module constants become theme fields

| Style | Edge | Stroke | Avatar | Row | Arrows |
|---|---|---|---|---|---|
| `git-graph` | orthogonal | 2 | 18 | 30 | yes |
| `git-extensions` | straight | 1.5 | 16 | 28 | no |
| `sourcetree` | bezier | 2.5 | 18 | 32 | no |
| `gitkraken` | orthogonal | 3 | 24 | 38 | no |

### B — Avatars in the node

- [x] `services/avatars.ts` — SHA-256 (not MD5: `crypto.subtle` has it, no new dep),
      lowercased+trimmed email, `d=404` so a miss falls through to our own avatar
- [x] Deduped by email, not by commit — 50k commits with 12 authors is 12 requests
- [x] `features/graph/commit-avatar.tsx` — generated initials as the initial state AND the
      error state, so a row never paints an empty circle
- [x] Node becomes `<clipPath>` + `<image>` + coloured ring, inside the existing SVG
- [x] **Author column deleted**; name/email/date move to a `<Tooltip>` on the bubble

### C — BRANCH / TAG column (all styles)

- [x] Ref chips move to a dedicated resizable left column
- [x] Column order: BRANCH / TAG · GRAPH · COMMIT MESSAGE · DATE · SHA
- [x] `graphColumns` gains `branchTag`, loses `author`; store `version` → 2 with a migration

### D — Author filter

- [x] `features/graph/author-filter.tsx` — authors derived from loaded rows, unique by
      lowercased email, counted, sorted by count
- [x] `components/multi-select-menu.tsx` extracted from `ref-filter.tsx`
- [x] `graphAuthorFilter` session-scoped: not persisted, cleared by `selectRepo`
- [x] **Dim, do not remove** — `git log --author` omits commits without rewriting `%P`, so
      the lane engine would hold a lane open forever for every filtered-out parent

### E — Settings view

- [x] `features/settings/settings-view.tsx` replaces the `<Placeholder>`
- [x] Style picker: four cards, each a live `<GraphSvg>` of a small synthetic history
- [x] `graphTheme` persisted (it is a preference, unlike the filters)

## Verification

- [x] `moon run :typecheck :lint :test` green
- [x] `graph-themes.test.ts` — every theme's `rowHeight` clears `avatarSize` + padding and
      every `nodeRadius` holds its avatar (the invariants avatars-everywhere imposes)
- [x] `avatars.test.ts` — known-email SHA-256; lowercase/trim; one memo entry per email
- [x] `author-filter.test.ts` — unique by lowercased email, counted, sorted
- [x] `ui-store.test.ts` — `graphTheme` persists, `graphAuthorFilter` does not and clears on
      repo switch, v1 → v2 migration drops the `author` width
- [x] Switching style re-measures the virtualizer (`estimateSize` is cached — without an
      explicit `measure()` every row keeps the old height until fully scrolled)
- [x] Offline: every node shows initials, no broken images
- [x] **Dragging a ref chip onto another still opens the merge/rebase menu** — Phase 8's
      gesture, relocated to the new column. Covered by `e2e/ref-drag.spec.ts`: merge, rebase
      and cherry-pick each driven with a real pointer and asserted down to the `ops.*` call,
      plus the guard cases (tag, self-drop, target not checked out)
- [x] Screenshot per style → `docs/screenshots/phase-14/*.png` (Playwright)

## Findings while landing this phase

- **The relocation did not break the gesture — but only a pointer-level test could say so.**
  `useRefDnd` is wired from `graph-row.tsx`, so moving the chips into the BRANCH / TAG column
  carried the drag and drop wiring with them for free. Nothing in the markup shows that,
  which is why the item sat unchecked: the failure mode was silent by construction.
- **dnd-kit eats the click that trails a drag, for 50ms.** `AbstractPointerSensor` adds a
  document-level *capture* listener that `stopPropagation()`s `click` on activation, and its
  teardown removes it only after `setTimeout(…, 50)`. No human meets it — releasing the
  mouse, reading the menu and clicking takes far longer — but a synthetic click lands inside
  the window and dies in the capture phase before React's delegated listener sees it. The
  menu item then looks completely dead: no error, nothing in the DOM, and a DOM-level
  `.click()` on the very same button works. Every gesture in the spec pauses for it.
- **`rectIntersection` collides the OVERLAY's rect, not the dragged element's.** With a
  `<DragOverlay>` the rect being scored is the overlay pill's — sized by whatever text it
  carries — so a commit dropped on a chip can be scored onto a chip one row away. The first
  version of the spec dropped a commit onto `main` and got a menu offering to cherry-pick
  onto `feature/drag-me`, which sat on the adjacent row. The fixture now keeps ref-less rows
  around every drop target; row spacing is load-bearing in that file, not decoration.

- **The avatar sets a floor on node size.** No style can use its reference screenshot's 4px
  dot when the node has to hold a face, so the four differentiate on edge routing, stroke
  weight and row height far more than on nodes. `git-extensions` is the one that suffers.
- **`avatarFor` is a `getSnapshot`.** It cached one object and returned another, so
  `useSyncExternalStore` — which compares by reference — re-rendered every avatar an extra
  time on mount. Found in self-review, not by a test; now asserted by one.
- **A shared `clipPath` needs the element to come to it.** `userSpaceOnUse` resolves against
  the coordinate system where the clip is REFERENCED, so one fixed circle would only ever line
  up with a node in the first lane of the first row. Each avatar translates into the clip's
  space instead.
- **Markers cannot be coloured at the point of use.** SVG resolves `markerEnd` against a
  document-level id, so arrowheads are one marker per lane colour in a list-level `<defs>` —
  a per-row definition would be 50 000 duplicates.
- **`--all` and `--author` cannot both be trusted.** `git log --author` omits commits without
  rewriting `%P`, so a server-side author filter would leave the lane engine holding a lane
  open for every parent that never arrives. Dimming is not a lesser option here; it is the
  only one that keeps the graph honest.
- **The first screenshot found a bug no test would have.** The gutter is sized by the history,
  and a two-lane repo gives the "Graph" header 32px — which the word overflows, rendering the
  table header as "GRAPHCOMMIT MESSAGE".
- **The shell's appearance runtime was entirely unused.** Seven appliers and a 500-line
  stylesheet, shipped since Phase 0, never called. Wiring them was a settings form, not a
  feature build.
