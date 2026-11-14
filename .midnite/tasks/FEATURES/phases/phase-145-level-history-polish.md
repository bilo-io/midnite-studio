# Phase 145 — Level history, review and polish

**Refined: x1** · 2026-11-14 · file map, contracts, MCP, testing, UI/UX

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

**Model:** every theme is a spec'd build for sonnet; no theme needs `Model: opus`.

Every level save is a git commit (`game-levels.ts` `levelSet`: write queue + a pathspec commit), so a level already
has a full history — but the editor cannot show it. Two people (or a person and an agent) cannot see what changed
between saves except as raw JSON in a diff. This phase turns that history into level-design tools, then closes the
roadmap with the polish a daily-use editor needs:

- **Level history** — the commits that touched this scene, each openable read-only (Unity's version-control
  window, Unreal's "History" on an asset).
- **A visual diff** — added, removed and moved objects and changed tiles drawn over the plan and the 3D view, with
  a semantic list (Unreal's Diff tool for maps, Plastic SCM's visual diff for scenes).
- **Comment pins** — notes pinned to places in a level, stored beside it (Unreal's "comment" actors, Figma-style
  pins).
- **A minimap and a measure tool** — navigation and distances (Unreal's ruler, Tiled's measurement in the status
  bar).
- **An accessibility pass** over everything Phases 137–145 added.
- **Phase 132's open human verification**, carried here so the level editor's foundations are signed off.

Agents get `game_level_history`, `game_level_diff` and `game_level_pins`.

> **Builds on.**
> - **The level service** — `packages/features/media-game/main/games/game-levels.ts` (`levelGet`, `levelSet`,
>   `GameLevelsDeps` with `resolve`, `readManifest`, `send`; `execGit` and `writeQueue` from
>   `@midnite/studio-git-engine`).
> - **Repo conventions** — NUL-delimited git parsing (`-z`, `%x00`), writes through the per-repo write queue.
> - **Phase 138** — the op/query/validate core, the tool recipe, `game_level_view` (H), the editor bridge (C).
> - **Phase 137** — selection (A), outliner (H), context menu (I), shortcuts table (J).
> - **Phase 142** — links (visual diff shows link changes when present).
> - **Phase 132 Theme H** — `.midnite/tasks/FEATURES/phases/phase-132-game-level-editor.md` L520–530, the open human
>   passes.
>
> **Depends on:** Phase 137 (A, H, I, J), Phase 138 (A, C, H). Theme G covers every theme of 137–145 that has
> landed by then. **Unlocks:** none — it closes the roadmap.
>
> **Scope guardrails.** History is read-only: restoring an old version is "open read-only, then copy into the
> current level" or a normal Save of it; no reset, no revert commit from this UI (Not in this phase). Git commands
> are NUL-delimited and read-only, except the pin file's write, which goes through the write queue.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — The level diff core.** ◻ `packages/shared/src/game-level-diff.ts`: `diffLevels(a, b)` → objects added /
removed / moved / changed (by id, with field deltas), tiles changed per layer, map properties changed, links changed.

**Theme B — History IPC.** ◻ `mstudio:games:level-history` (`git log -z` over `levels/<scene>.tmj`) and
`mstudio:games:level-at` (`git show <sha>:levels/<scene>.tmj`), NUL-delimited, capped.

**Theme C — History panel and visual diff.** ◻ A History tab in the bottom panel; selecting a commit overlays the
diff against the open level (green added, red removed ghost, amber moved with an arrow, blue changed); "Open this
version read-only".

**Theme D — Comment pins.** ◻ `levels/<scene>.notes.json`: pins with position, text, author, resolved; drawn in both
views, listed in the outliner, saved with one commit.

**Theme E — Minimap.** ◻ A corner minimap of the plan (2D and 3D levels) showing the viewport rectangle; click or drag
to pan.

**Theme F — Measure tool.** ◻ Tool `M`: click-drag a ruler; tiles, pixels and metres; `Shift` snaps to 45°; in 3D
measures on the ground or terrain.

**Theme G — Accessibility pass.** ◻ Keyboard reachability, focus order, ARIA roles and names, contrast and reduced
motion across the level editor's 137–145 surfaces, with an axe-style rule test per panel.

**Theme H — MCP.** ◻ `game_level_history`, `game_level_diff`, `game_level_pins`; the skill's review loop.

**Theme I — Phase 132's human verification.** ◻ The four open Theme H boxes of Phase 132, run on the built app and
recorded.

## Build order

**A** → **B** → **C**; **D**, **E**, **F** independent; **H** after A, B, D; **G** after everything else that landed;
**I** any time (no code).

## Deliverables

### A — The level diff core (M)

**Files.** `packages/shared/src/game-level-diff.ts`, `game-level-diff.test.ts` (net-new), `packages/shared/src/index.ts`.

```ts
export type LevelObjectDelta = { id: number; layer: string; type: string; name: string;
  kind: 'added' | 'removed' | 'moved' | 'changed';            // moved = only x/y/rotation/elevation differ
  from?: { x: number; y: number }; to?: { x: number; y: number };
  fields?: { name: string; before: unknown; after: unknown }[] };
export type LevelTileDelta = { layer: string; changed: number; cells: { x: number; y: number; before: number; after: number }[] /* first 2,000 */ };
export type LevelDiff = { objects: LevelObjectDelta[]; tiles: LevelTileDelta[]; map: { name: string; before: unknown; after: unknown }[]; links: { from: number; field: string; before: number | null; after: number | null }[]; summary: string };
export function diffLevels(before: unknown, after: unknown): LevelDiff;   // pure; ids are the identity (Tiled's)
```

- `summary` is one line: "3 added, 1 removed, 4 moved, 2 changed · 120 tiles on Ground · sky dusk → night".
- Objects are matched by `id`; an id reused for a different type counts as removed + added.
- Sorted deterministically (layer, then id) so an agent can compare two diffs.

**Acceptance.**

- [ ] A1. Moving one object yields one `moved` delta with from/to.
- [ ] A2. Changing a property yields `changed` with the field delta; changing position *and* a property is `changed`
  with both.
- [ ] A3. Tile deltas count every changed cell and list at most 2,000.
- [ ] A4. Identical levels → empty lists and summary "No changes".

**Done when** A1–A4 pass.

### B — History IPC (S)

**Channels**: `CHANNELS.gamesLevelHistory = 'mstudio:games:level-history'`, `CHANNELS.gamesLevelAt =
'mstudio:games:level-at'`; bridge `games.levels.history(req)`, `games.levels.at(req)`; schemas in
`packages/shared/src/game-level.ts`; preload, manifest `ipc`, mock bridge.

**Files.** `packages/features/media-game/main/games/game-level-history.ts` (+ test, net-new), wired in
`game-service.ts` and `main/index.ts`.

```ts
export const GameLevelHistoryEntrySchema = z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/), author: z.string(), date: z.string() /* ISO */, subject: z.string(), agent: z.boolean() });
export const GameLevelHistoryRequestSchema = z.object({ gameId: z.string().min(1), scene: GameSceneNameSchema, limit: z.number().int().min(1).max(200).default(50), before: z.string().optional() /* sha for paging */ });
export const GameLevelAtRequestSchema = z.object({ gameId: z.string().min(1), scene: GameSceneNameSchema, sha: z.string().regex(/^[0-9a-f]{7,40}$/) });
```

- `git log -z --format=%H%x00%an%x00%aI%x00%s --follow -- levels/<scene>.tmj` parsed on NUL; `agent` is true when the
  commit is one of the game agent's (its known subject prefix or trailer the game-agent service writes — read from
  `game-agent-service.ts`, not guessed).
- `level-at` = `git show <sha>:levels/<scene>.tmj`, capped at `GAME_LEVEL_MAX_BYTES`, parsed with `parseGameLevel`;
  a sha not in the repo fails cleanly.

**Acceptance.**

- [ ] B1. Against a temp repo with three level commits, history lists three, newest first; paging with `before`
  works.
- [ ] B2. A commit subject containing a newline-like sequence and a NUL-safe author parse correctly.
- [ ] B3. `level-at` returns the old JSON; an unknown sha fails.

**Done when** B1–B3 pass.

### C — History panel and visual diff (M)

**Files.** `packages/features/media-game/renderer/level/history/history-panel.tsx` (+ test),
`history/diff-overlay.ts` (+ test; draw-list for the plan and props for 3D), `level-plan-draw.ts`,
`3d/level-scene.tsx`, `level-editor.tsx` (read-only "viewing version" mode), `use-levels.ts` (`useLevelAt`).

- A bottom-panel tab **History** (beside 139's Assets and 142's Problems; standalone if those have not landed):
  rows "subject · author · relative date", an agent badge (`LuBot`) for agent commits, `Skeleton` rows while
  loading, `EmptyState` "Not saved yet" for a new scene. Paging on scroll.
- Selecting a row fetches that version and overlays `diffLevels(version, current)`; the overlay legend and the
  semantic list (A's deltas, clickable to select and frame) sit in the panel's right half. Colours from the app's
  HSL tokens (`--health-ok` added, `--health-fail` removed, `--health-warn` moved, `--callout-note` changed); shapes
  differ too (solid / dashed ghost / arrow / ring), so colour is never the only cue.
- **Open read-only**: the editor shows that version with a banner "Viewing <short sha> — read-only" and buttons
  **Back to current** and **Copy selection to current** (pastes through 137 B's clipboard), never a reset.
- A "Compare with saved" entry diffs the unsaved edit state against `HEAD` (the most useful diff while editing).

**Acceptance.**

- [ ] C1. Selecting a commit produces overlay items matching `diffLevels`.
- [ ] C2. The read-only view blocks every edit tool and shows the banner.
- [ ] C3. Copy selection to current adds the objects to the current level as one undo step.
- [ ] C4. Overlay shapes differ per kind (draw-list test asserts dash patterns).

**Done when** C1–C4 pass.

### D — Comment pins (M)

**Files.** `packages/shared/src/game-level-notes.ts` (+ test, net-new: `GameLevelNotesSchema`),
`packages/features/media-game/main/games/game-level-notes.ts` (+ test, net-new: read / write via the write queue,
one commit `Notes on <scene>`), channels `gamesLevelNotes = 'mstudio:games:level-notes'` and `gamesLevelNotesSet =
'mstudio:games:level-notes-set'` (+ bridge, preload, manifest, mock), renderer `notes/pin-layer.tsx`,
`notes/pin-popover.tsx` (+ tests), `level-outliner.tsx` (a Notes section).

```ts
export const GameLevelPinSchema = z.object({ id: z.string().min(1).max(16), x: z.number(), y: z.number(), z: z.number().optional(),
  text: z.string().min(1).max(2000), author: z.string().max(80), createdAt: z.string(), resolved: z.boolean().default(false),
  objectId: z.number().int().optional() });
export const GameLevelNotesSchema = z.object({ version: z.literal(1), pins: z.array(GameLevelPinSchema).max(500) });
```

- File `levels/<scene>.notes.json`, beside the level, never read by the kit (the kit loads only `.tmj`), excluded from
  `levels.list` (which lists `.tmj` only). A pin with `objectId` follows that object.
- Tool: the context menu (137 I) "Add note here", and `N` with the canvas focused (not taken in 137 J's table).
  Pins draw as `LuMessageSquare` markers; click opens a `Popover` with the text, author, Resolve / Delete. Resolved
  pins hide unless "Show resolved" is on.
- Pins are saved immediately (their own commit), independent of the level's Save — notes are review, not level
  data.
- Author = git `user.name` of the game repo (read once in main).

**Acceptance.**

- [ ] D1. Adding a pin writes the notes file and commits only it.
- [ ] D2. A pin with `objectId` moves with the object.
- [ ] D3. Resolved pins hide by default.
- [ ] D4. `levels.list` does not list the notes file.

**Done when** D1–D4 pass.

### E — Minimap (S)

**Files.** `packages/features/media-game/renderer/level/minimap.tsx` (+ test), `level-plan-draw.ts` (a
low-detail `drawPlanThumb`), `level-editor.tsx`, `3d/level-view-store.ts` (`minimap: boolean`, default true).

- 160 × 120 px, bottom-right of the canvas, `bg-background/80` with a 1 px border; redrawn on edit (debounced 250
  ms) and viewport change; the viewport rectangle (plan) or camera frustum footprint (3D) in `hsl(var(--primary))`.
  Click centres the view; drag pans. `role="img"` with an `aria-label` "Minimap". The toggle is a toolbar
  `IconButton` `LuMap` with no key (`M` is Measure, Theme F).

**Acceptance.**

- [ ] E1. Clicking the minimap centres the plan view on that point (pure mapping test).
- [ ] E2. The redraw is debounced.

**Done when** E1–E2 pass.

### F — Measure tool (S)

**Files.** `packages/shared/src/game-level-measure.ts` (+ test: `measure(level, a, b)` → `{ px, tiles, metres }`),
`level-editor.tsx` (tool `measure`, key `M`, `LuRuler`, 2D and 3D; registered in `LEVEL_SHORTCUTS`),
`level-canvas.tsx`, `3d/level-3d-view.tsx` (ground / terrain points via 137 G's `groundPoint`).

- Readout at the ruler's midpoint: "7.5 tiles · 240 px · 15.0 m" (metres only for 3D levels or when
  `metresPerTile` is set); `Shift` snaps to 0/45/90°; in 3D the distance is 3D with the horizontal in brackets.
  `Esc` clears. Rulers are not saved.

**Acceptance.**

- [ ] F1. `measure` returns consistent units for a 32 px, 2 m/tile level.
- [ ] F2. Shift-snapped angles are multiples of 45°.

**Done when** F1–F2 pass.

### G — Accessibility pass (M)

**Files.** Every renderer component net-new in Phases 137–145 that has landed; `packages/features/media-game/renderer/level/a11y.test.tsx`
(net-new: renders each panel and asserts roles, names and focusability with Testing Library queries).

- Checklist, each a test where testable:
  1. Every toolbar control is an `IconButton` with a label (its tooltip) — no unlabeled icon buttons.
  2. Panels (Outliner, Assets, Problems, History) are landmarks (`role="region"` + `aria-label`), reachable by `Tab`
     in DOM order (the app has no F6 pane-cycling convention, so none is invented), and each header toggle has
     `aria-expanded`.
  3. Lists use `role="listbox"` / `option` or a tree (`role="tree"`) with arrow-key navigation and
     `aria-selected`.
  4. The canvas has `role="application"` with an `aria-label` naming the tool and a live region announcing
     selection changes ("Selected 3 objects").
  5. Every animation added (138 F pulse, 140 E dot, 143 F tiles, 145 C overlay) honours reduced motion — asserted
     by spying on `requestAnimationFrame` under `data-motion="reduced"`.
  6. Colour is never the only cue (diff overlay shapes, problem icons, link styles).
  7. Contrast: text tokens only (no hard-coded greys); a grep test fails on hex colours in the level renderer's
     `.tsx` files except the 3D scene's material colours.
- Fixes found are made in the same theme (they are small by construction).

**Acceptance.**

- [ ] G1. `a11y.test.tsx` passes for every landed panel.
- [ ] G2. The hex-colour grep test passes.
- [ ] G3. Reduced-motion spies pass for every animated surface that landed.

**Done when** G1–G3 pass.

### H — MCP (S)

**Tools** (Phase 138's tool recipe):

| Tool | Kind | `allowGames` | Input → output |
|---|---|---|---|
| `game_level_history` | read | no | `{ game, scene, limit?, before? }` → `{ entries: GameLevelHistoryEntry[] }` |
| `game_level_diff` | read | no | `{ game, scene, from: sha \| 'saved', to?: sha \| 'saved' \| 'editor' }` → `LevelDiff` (`to` defaults to `'editor'`, falling back to `'saved'` when the editor is closed) |
| `game_level_pins` | read / write | write only when `add` / `resolve` / `delete` present | `{ game, scene, add?: { x, y, text, objectId? }[], resolve?: string[], delete?: string[] }` → `{ pins }` |

- `game_level_diff` with `to: 'editor'` uses the bridge `snapshot` (138 C). An agent's review loop: make a batch →
  `game_level_diff from: 'saved'` → explain the change in one line → let the user save.
- Skill `## Levels` (seven copies): "Leave review notes with `game_level_pins` instead of chat when a note is about a
  place in the level; summarise your changes from `game_level_diff`."

**Acceptance.**

- [ ] H1. `game_level_diff from: 'saved'` with the editor open diffs against the unsaved state.
- [ ] H2. `game_level_pins` without write fields works with `allowGames` off; with `add` it refuses.
- [ ] H3. Skill copies identical; pin file regenerated.

**Done when** H1–H3 pass.

### I — Phase 132's human verification (S)

Carried from `.midnite/tasks/FEATURES/phases/phase-132-game-level-editor.md` Theme H (L520–530), run on the built
app with a throwaway `--user-data-dir`, results recorded in **this** doc's Headlines and ticked in Phase 132's doc
too:

- [ ] I1. CI gate green on the merge of this phase (`moon run :typecheck :lint :test` in CI).
- [ ] I2. Open Game on a game outside the games root (listed, selected, in the repos panel) and on a folder with no
  manifest (toast); select a game → Level editor tab; Run → Play mode with the console drawer; back to the editor →
  the game pauses and resumes on return.
- [ ] I3. New platformer: paint a ledge, move a coin, Save (one commit; `git log` shows `Edit level level`), the
  running game hot-reloads with the change; New scene `cave`, pick it → the editor opens it and the running game
  restarts in `cave`.
- [ ] I4. New third-person game: add a volume and a model prop, rotate it, Save, see it in Play; in Gamer, Open Game
  survives a relaunch and the same 2D edit works.

**Done when** I1–I4 are ticked here and in Phase 132.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/game-level-diff.ts`, `game-level-notes.ts`, `game-level-measure.ts` (+ tests) | A D F | net-new |
| `packages/shared/src/game-level.ts`, `ipc/*`, `index.ts` | B D | edit |
| `packages/features/media-game/main/games/game-level-history.ts`, `game-level-notes.ts` (+ tests) | B D | net-new |
| `packages/features/media-game/main/games/game-service.ts`, `main/index.ts`, `game-levels.ts` | B D | edit |
| preload, `packages/features/media-game/manifest.ts`, `packages/app/test-support/mock-bridge.ts` | B D | edit |
| `packages/features/media-game/renderer/level/history/*`, `notes/*`, `minimap.tsx`, `a11y.test.tsx` | C D E G | net-new |
| `packages/features/media-game/renderer/level/level-editor.tsx`, `level-canvas.tsx`, `level-plan-draw.ts`, `3d/*`, `level-outliner.tsx`, `level-shortcuts.ts`, `use-levels.ts` | C–G | edit |
| MCP recipe files + seven skill copies | H | edit |
| `.midnite/tasks/FEATURES/phases/phase-132-game-level-editor.md` | I | edit (ticks) |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` (shared, media-game, desktop); eslint on changed files; vitest on the
  touched suites incl. `a11y.test.tsx`; the pin test; `scripts/skill-copies.test.mjs`; `node
  scripts/tracker-check.mjs`.
- [ ] **Open, for a human:** gate on the built app, throwaway `--user-data-dir`**: edit and save a level three times (one by an agent);
  History lists three with the agent badge; select the oldest and see the overlay and semantic list; open it
  read-only and copy an object back; add two pins and resolve one; minimap pans; measure a jump gap; VoiceOver reads
  the toolbar and panels. Theme I's four passes. Shots under `/tmp/midnite-shots-p145/`.

## Not in this phase

- **Revert / reset to a version** from the editor — open read-only + copy, or Save, covers it without rewriting
  history; the Games agent's commit-based Undo remains for agent runs.
- **Three-way merge of level conflicts** — a level conflict stays a git conflict for the repo's normal tools.
- **Threaded pin discussions, mentions** — one text per pin.
- **Branch comparison** — history is the current branch's.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Resolved — Semantic diff by object id.** Tiled ids are stable per map, the same identity Unreal's map diff uses per actor.
2. **Resolved — History is git.** Not a second store: every save is already a commit; the panel is a view onto it.
3. **Resolved — Read-only versions, never a reset.** Destructive operations need a blast-radius confirm in this repo; copying
   forward is non-destructive and covers the need.
4. **Resolved — Pins in a sidecar file.** Committed on their own: review notes must not dirty the level or ride along with an
   unrelated save, and the kit never loads them.
5. **Resolved — `M` is Measure.** (Unreal's ruler is middle-drag; Tiled shows sizes in the status bar; `M` is the common
   graphics-tool key); the minimap toggle has no key.
6. **Resolved — Accessibility as a closing pass with tests.** So every later surface inherits the checks (`a11y.test.tsx` grows
   with each panel).
