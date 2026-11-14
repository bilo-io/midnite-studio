# Phase 137 — Level editor editing essentials

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

Media ▸ Games ▸ **Level editor** (Phase 132 Themes D–E, Phase 136) edits one object at a time, draws volumes and
paths only in the Floorplan, and has no outliner, clipboard, context menu or shortcut list. This phase brings it to the
pace of Unity, Godot and Tiled: **multi-select** (marquee, Shift and Mod clicks, select all), **cut / copy / paste /
duplicate**, **group move, rotate and scale** with a pivot choice, **align and distribute**, **snap settings** (grid,
angle, surface), **every tool in 3D** (Volume, Path, Rotate), an **outliner** with search, hide and lock, **context
menus**, and a **shortcut cheat-sheet** that reads the same table the key handler does.

> **Builds on.**
> - **The edit model** — `packages/features/media-game/renderer/level/level-edit-model.ts`: `EditState`
>   (`selection: EditSelection` = `{ layerId, objectId } | null`, a single selection), the private `commit()` that
>   pushes one undo step (`UNDO_LIMIT = 100`), `beginStroke` / `endStroke` (a drag is one step), `addObject`,
>   `moveObject`, `deleteObject`, `rotateObject`, `setVolume`, `finishPath`, `undo` / `redo`.
> - **The editor shell** — `packages/features/media-game/renderer/level/level-editor.tsx`: `LevelTool` (L79), `TOOLS`
>   (2D: paint B, erase E, rect R, pick I, entity O, select V), `TOOLS_3D` (select V, entity O, volume R, path P,
>   rotate Y), `TOOLS_IN_3D = { select, entity }`, the local `onKeyDown` (L373, canvas focus only), the fixed
>   `aside w-44` `LayerList` and `aside w-56` palette + inspector.
> - **The plan canvas** — `level-canvas.tsx` (`CanvasPointer`, `hitObject`), `level-plan.ts` (`hitPlan`,
>   `footprintCorners`, `snapPlan`), `level-plan-draw.ts` (`drawPlan`, `PlanOverlay`).
> - **The 3D view** — `3d/level-3d-view.tsx`, `3d/level-scene.tsx` (the `Selected` proxy with drei `Edges` in
>   `#f5a524`, `TransformControls`), `3d/level-world.ts` (`gizmoEdit(state, sel, change: GizmoChange)`,
>   `worldToObjectPoint`, `levelWorldItems`), `3d/level-view-store.ts` (`midnite-studio.level-view`).
> - **The frame's viewport kit** — `packages/frame/src/viewport3d/` (`SnapSettings`, `GRID_STEPS`, `ANGLE_STEPS`,
>   `snapValue`, `effectiveStep`, `TransformModeBar`).
> - **The model editor's outliner and multi-select** as the in-house precedent:
>   `packages/features/media-model/renderer/outliner.ts` (`buildOutline`, `rangeBetween`), `outliner-panel.tsx`,
>   `editor-state.ts` (`selection: number[]`, `toggleSelect`, `selectMany`), `shortcuts.ts` (`SHORTCUTS`,
>   `formatChord`) and `shortcut-help.tsx` (`ShortcutHelp`).
>
> **Depends on:** Phase 132 (D, E) and Phase 136 — both landed. **Independent of Phase 138** (this phase is renderer
> UI; 138 is shared + main + the MCP bridge). **Unlocks:** Phase 139 (needs Theme A's multi-selection and Theme B's
> clipboard), Phase 142 (Theme H's outliner rows carry the problem badges), Phase 143 (Theme B's clipboard is the
> stamp source), Phase 145 (Theme H's tree is the accessibility pass's subject).
>
> **Scope guardrails.** Renderer only: no new IPC channel, no new MCP tool (agents reach every capability here through
> Phase 138's `game_entity_batch` and `game_level_select`; see "MCP"). Nothing crosses a feature boundary; nothing
> moves to the frame except what Theme F names. Every key stays in the editor's local handler, never in
> `packages/shared/src/keybindings.ts` (Phase 132 Decision: a global chord for the tools is out of scope).
> `react-icons` per-set imports only (`react-icons/lu`). macOS only. Every test is a vitest unless it names the browser
> capability it needs (`docs/TESTING.md`).

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — Multi-selection in the edit model.** ◻ `EditState` gains `selected: ObjectRef[]` beside the primary
`selection`; pure `selectOnly`, `toggleSelected`, `addSelected`, `selectInRect`, `selectAllInLayer`,
`selectedObjects`, and group `moveObjects` / `deleteObjects` / `nudgeObjects`, each one undo step. Undo and redo keep
the selection, dropping refs that no longer exist.

**Theme B — Clipboard and duplicate.** ◻ `copySelection` → a versioned `LevelClipboard` JSON, written to the system
clipboard with an in-memory fallback; `pasteClipboard` at the pointer or in place +1 cell; `duplicateSelection` in
place. Mod+C / Mod+X / Mod+V / Mod+D in the local handler.

**Theme C — Floorplan multi-select.** ◻ Marquee on empty ground with Select, Shift adds, Mod toggles, Mod+A selects
the active layer, a group drag moves every selected object as one step, arrow keys nudge. Every selected object gets
the 3D view's amber outline; the group gets a dashed bounds box.

**Theme D — 3D multi-select and the group gizmo.** ◻ Shift / Mod click and a screen-space marquee in the 3D view; the
gizmo drives the whole selection about a **Pivot** or **Centre** origin in **Local** or **World** space (Unity's Z and
X toggles), one `gizmoEditGroup` undo step per drag.

**Theme E — Align and distribute.** ◻ Pure `alignObjects` (min / centre / max on X or Y) and `distributeObjects`
(even centres) against the selection's bounds, from an align bar that appears at two or more selected objects.

**Theme F — Snap settings.** ◻ One snap popover for both views: grid (tile fractions in the plan, the frame's
`GRID_STEPS` in 3D), angle (`ANGLE_STEPS`), and **surface** snap that drops a moved or placed object onto the top of
the box under it. Persisted in `midnite-studio.level-view`.

**Theme G — Every tool in 3D.** ◻ Volume (drag a rectangle on the ground), Path (click points, Enter finishes) and
Rotate (drag to aim) work in the 3D view over a ground raycast; `TOOLS_IN_3D` becomes every 3D tool.

**Theme H — The outliner.** ◻ The left aside becomes a resizable, collapsible outliner: layers with their objects as a
tree, a search box, per-row hide and lock (editor-only, persisted per scene), click / Shift / Mod selection shared
with both views, double-click frames.

**Theme I — Context menus.** ◻ Right-click in the plan, the 3D view and the outliner opens one menu built by
`levelContextMenu(state, target)`: cut, copy, paste, duplicate, delete, frame, hide, lock, select all of this type,
align.

**Theme J — Shortcut cheat-sheet.** ◻ `LEVEL_SHORTCUTS` is the one table the key handler dispatches from and the `?`
cheat-sheet renders, grouped Tools / Selection / Edit / View, with the chord in `<kbd>` chips.

## Build order

1. **A** first — every other theme reads `selected`.
2. **B**, **C**, **E** (plan-side, pure-first) in any order; **J** may start any time after A (it only moves keys
   into a table).
3. **F** before **D** (the group gizmo snaps with F's settings), then **D**, then **G**.
4. **H**, then **I** (the menu's Hide / Lock items need H's state).

## Shared rules for every theme

- **Undo transactions.** Every user gesture is exactly one undo step: a pure op that changes several objects calls
  `commit()` once; a drag is wrapped in `beginStroke` / `endStroke`. This is Unity's `Undo.CollapseUndoOperations` and
  Godot's `UndoRedo.create_action` / `commit_action` model, and the edit model already works this way.
- **Selection outline.** Selected objects use the existing amber `#f5a524` (3D `Edges`, plan stroke 2 px / zoom);
  the primary selection (the inspector's subject) is drawn 1 px thicker. Hover is never drawn in amber.
- **No-throw.** Pure ops return the same `EditState` reference when nothing changed (the existing contract), so
  `commit()` records nothing.
- **Keys** are dispatched only while the canvas or the 3D view has focus (the existing `onKeyDown` contract), so text
  inputs and the inspector keep Mod+C / Mod+V / Mod+A as the system's.

## Deliverables

### A — Multi-selection in the edit model (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-edit-model.ts` | edit: `ObjectRef`, `selected`, the ops below; `select`, `undo`, `redo`, `deleteObject`, `setActiveLayer` keep `selected` consistent |
| `packages/features/media-game/renderer/level/level-selection.ts` | net-new: selection-only pure helpers (bounds, refs ↔ objects) |
| `packages/features/media-game/renderer/level/level-selection.test.ts` | net-new |
| `packages/features/media-game/renderer/level/level-edit-model.test.ts` | edit: group ops and undo cases |

**Contract.**

```ts
// level-edit-model.ts
export type ObjectRef = { layerId: number; objectId: number };
export type EditState = { /* …existing… */ selected: readonly ObjectRef[] }; // createEditState → selected: []
// `selection` stays the PRIMARY ref (inspector subject, gizmo pivot object). Invariant, asserted by tests:
// selection === null ⇔ selected.length === 0, and selection (when set) is an element of `selected` (same layerId/objectId).
export function selectOnly(state: EditState, ref: ObjectRef | null): EditState;      // replaces `select` internally; `select` stays as an alias
export function toggleSelected(state: EditState, ref: ObjectRef): EditState;          // Mod-click; removing the primary promotes the last remaining ref
export function addSelected(state: EditState, refs: readonly ObjectRef[]): EditState; // Shift; the last added becomes primary
export function selectInRect(state: EditState, layerIds: readonly number[], rect: PlanRect, mode: 'replace' | 'add' | 'toggle'): EditState;
export function selectAllInLayer(state: EditState, layerId: number): EditState;
export function selectedObjects(state: EditState): Array<{ ref: ObjectRef; object: LevelObject }>; // skips stale refs
export function moveObjects(state: EditState, refs: readonly ObjectRef[], dx: number, dy: number): EditState; // one commit
export function nudgeObjects(state: EditState, refs: readonly ObjectRef[], dx: number, dy: number): EditState; // = moveObjects, named for keys
export function deleteObjects(state: EditState, refs: readonly ObjectRef[]): EditState;  // one commit; clears selection
export type PlanRect = { x: number; y: number; width: number; height: number }; // map pixels, normalised (width/height ≥ 0)

// level-selection.ts
export function selectionBounds(level: EditLevel, refs: readonly ObjectRef[]): PlanRect | null; // union of footprintCorners / point / polyline extents
export function refKey(ref: ObjectRef): string; // `${layerId}:${objectId}`
export function sameRef(a: ObjectRef | null, b: ObjectRef | null): boolean;
```

`selectInRect` takes objects whose footprint (`footprintCorners`, or the point, or every polyline vertex) is **fully
inside** `rect` — Unity and Godot's marquee rule, which stops a huge floor volume from joining every drag. Locked or
hidden objects (Theme H) are excluded by the caller passing a filtered `layerIds` plus Theme H's
`isSelectable(ref)` predicate, added as an optional last argument `filter?: (ref: ObjectRef) => boolean`.

`undo` / `redo` **keep** the selection (they clear it today): `selected` is filtered to refs that still resolve with
`findObject`, and `selection` follows the invariant. Godot and Unity both restore selection across undo; clearing it
loses the user's place.

**Acceptance.**

- [ ] A1. `createEditState(level).selected` is `[]`; `selectOnly(s, ref)` gives `selected: [ref]`, `selection: ref`.
- [ ] A2. `toggleSelected` adds an absent ref (it becomes primary) and removes a present one; removing the primary
  makes the last remaining ref primary; removing the last ref gives `selection: null`.
- [ ] A3. `selectInRect` with `'replace'` / `'add'` / `'toggle'` returns the documented sets for a fixture of 3
  objects where one straddles the rect edge (never selected).
- [ ] A4. `moveObjects` over 3 refs changes `past.length` by exactly 1, and `undo` restores all three positions with
  the selection intact.
- [ ] A5. `deleteObjects` over 2 refs is one undo step; after `undo` both objects are back and `selected` holds both.
- [ ] A6. A ref whose object was deleted by redo is dropped from `selected` and the invariant holds.
- [ ] A7. Every existing `level-edit-model.test.ts` case passes unchanged (`select` keeps its signature).

**Tests.** `level-selection.test.ts` (bounds of box / point / path mixes, `refKey`), new cases in
`level-edit-model.test.ts` for A1–A6.

**Done when** A1–A7 pass under `pnpm -C packages/features/media-game exec vitest run renderer/level`.

### B — Clipboard and duplicate (S)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-clipboard.ts` | net-new: pure copy / paste / duplicate + the system-clipboard adapter |
| `packages/features/media-game/renderer/level/level-clipboard.test.ts` | net-new |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: Mod+C / Mod+X / Mod+V / Mod+D in `onKeyDown` (moved into Theme J's table once J lands) |

**Contract.**

```ts
export const LEVEL_CLIPBOARD_KIND = 'midnite-level-clipboard';
export type LevelClipboard = {
  kind: typeof LEVEL_CLIPBOARD_KIND; version: 1;
  dimension: '2d' | '3d';
  origin: { x: number; y: number };            // selectionBounds' top-left at copy time, map pixels
  objects: LevelObject[];                       // deep copies, ids stripped (id: 0), positions relative to origin
};
export function copySelection(state: EditState): LevelClipboard | null;                       // null when nothing selected
export function parseClipboard(text: string): LevelClipboard | null;                           // JSON.parse + shape check, never throws
export function pasteClipboard(state: EditState, clip: LevelClipboard, layerId: number, at: { x: number; y: number }): EditState;
export function duplicateSelection(state: EditState): EditState;                                // same positions, new ids
export async function writeClipboard(clip: LevelClipboard): Promise<void>;                      // navigator.clipboard.writeText, falls back to module memory
export async function readClipboard(): Promise<LevelClipboard | null>;                          // system first, then memory
```

- Paste lands in the **active object layer** (or the first object layer when the active one is a tile layer). `at` is
  the pointer's map point when the pointer is over the canvas, else `origin + one tile` (Tiled pastes at the cursor;
  an in-place paste would hide the copy under the original). New ids come from the model's private `nextObjectId`;
  the pasted objects become the selection (primary = last).
- **Duplicate (Mod+D) is in place** — Unity's and Godot's convention: the duplicates are selected so the next drag
  or nudge moves them off the originals.
- Cut = copy then `deleteObjects`, one undo step for the delete.
- A clipboard whose `dimension` differs from the level's pastes nothing and shows the notice "Copied from a 2D level —
  paste it into a 2D level" (`useNotify` from `packages/features/media-game/renderer/chrome.tsx`).
- Tiles are not copied here (Phase 143's stamp brush owns tile copy).

**Acceptance.**

- [ ] B1. `copySelection` of 2 objects gives positions relative to their bounds' top-left and `id: 0`.
- [ ] B2. `pasteClipboard` at `{x:100,y:50}` adds 2 objects with fresh, unique ids, selects them, one undo step.
- [ ] B3. `duplicateSelection` adds copies at identical positions and selects the copies (not the originals).
- [ ] B4. `parseClipboard('not json')` and a wrong `kind` return `null`.
- [ ] B5. With `navigator.clipboard` undefined (jsdom), `writeClipboard` then `readClipboard` round-trips through
  memory.
- [ ] B6. In `level-editor.test.tsx`, Mod+D with one selected object adds one object (count +1) and Mod+Z removes it.

**Done when** B1–B6 pass.

### C — Floorplan multi-select (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-canvas.tsx` | edit: marquee gesture (`CanvasPointer` gains `mod: boolean`; a new `marquee` field on the overlay) |
| `packages/features/media-game/renderer/level/level-plan-draw.ts` | edit: `drawPlan` takes `selected: readonly ObjectRef[]` and `overlay.marquee: PlanRect \| null`; draws every selected outline + a dashed group bounds |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: Select-tool pointer handling for click / Shift / Mod / marquee / group drag; Mod+A; arrow nudge |
| `packages/features/media-game/renderer/level/level-editor.test.tsx` | edit |
| `packages/app/e2e/level-multiselect.spec.ts` | net-new — `// e2e-capability: pointer drag on canvas` (marquee + group drag) |

**Rules.**

- Select tool, pointer down on **empty space** → marquee (dashed `outline` colour rectangle, 10% fill); release calls
  `selectInRect(…, mode)` with `mode = shift ? 'add' : mod ? 'toggle' : 'replace'` over **visible, unlocked object
  layers** (Theme H filter when present, all object layers before it lands).
- Pointer down **on an object**: no modifier → if it is already selected keep the set (so a group drag works), else
  `selectOnly`; Shift → `addSelected`; Mod → `toggleSelected` (no drag starts on a Mod-click).
- Dragging a selected object moves **every** selected object: `beginStroke`, `moveObjects` per pointer move with the
  delta from the press (snapped with `snapPlan` on the primary's position), `endStroke` on release → one step.
- Mod+A → `selectAllInLayer(activeLayerId)`; Escape → `selectOnly(null)`; Delete / Backspace → `deleteObjects`.
- Arrow keys nudge the selection one grid step (Theme F's plan step, one tile before F lands); Shift+arrow nudges 10
  steps. Each key press is one undo step (Unity and Godot nudge the same way).
- Drawing: each selected object stroked amber at 2 px / zoom, the primary at 3 px / zoom, and when 2+ are selected a
  dashed 1 px / zoom bounds rectangle from `selectionBounds`.

**Acceptance.**

- [ ] C1. Clicking empty space with the Select tool and no drag clears the selection.
- [ ] C2. A marquee over 2 of 3 fixture objects selects exactly those 2 (vitest drives `onPointer` with synthetic
  `CanvasPointer`s, no real drag).
- [ ] C3. Shift-click adds, Mod-click toggles, as A2 states.
- [ ] C4. A synthetic group drag of 2 selected objects by (32, 0) moves both and is one undo step.
- [ ] C5. Mod+A selects every object in the active layer; arrow-right nudges them one tile; Shift+arrow-right ten.
- [ ] C6. `drawPlan` with a mocked context strokes `#f5a524` once per selected object and calls `setLineDash` for the
  group bounds when 2+ are selected.
- [ ] C7. The e2e spec marquee-selects two coins on a platformer starter and drags them; both positions change in the
  inspector's X field after re-selecting each.

**Done when** C1–C7 pass and `scripts/e2e-budget.mjs` is updated for the one new spec.

### D — 3D multi-select and the group gizmo (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/3d/level-world.ts` | edit: `gizmoEditGroup`, `groupPivot` |
| `packages/features/media-game/renderer/level/3d/level-scene.tsx` | edit: `selected: number[]` (object ids) replaces `selected: number \| null`; one `Selected` proxy per selected item; the gizmo attaches to a pivot `Object3D` |
| `packages/features/media-game/renderer/level/3d/level-3d-view.tsx` | edit: Shift / Mod click, marquee, Z / X toggles, the pivot + space radios beside `TransformModeBar` |
| `packages/features/media-game/renderer/level/3d/level-marquee.ts` | net-new: pure screen-space marquee selection |
| `packages/features/media-game/renderer/level/3d/level-view-store.ts` | edit: `pivot: 'pivot' \| 'centre'`, `space: 'local' \| 'world'` persisted (sanitised in `merge`, no version bump) |
| `packages/features/media-game/renderer/level/3d/level-3d-logic.test.ts` | edit |

**Contract.**

```ts
// level-world.ts
export type GroupPivot = { centre: [number, number, number]; yaw: number }; // world metres, yaw degrees
export function groupPivot(level: EditLevel, refs: readonly ObjectRef[], primary: ObjectRef, mode: 'pivot' | 'centre'): GroupPivot;
// 'pivot' = the primary object's origin and yaw (Unity "Pivot"); 'centre' = the AABB centre of all items, yaw 0 (Unity "Center").
export function gizmoEditGroup(state: EditState, refs: readonly ObjectRef[], pivot: GroupPivot, delta: GroupDelta): EditState; // ONE commit
export type GroupDelta = { translate?: [number, number, number]; rotateYaw?: number; scale?: [number, number, number] };
// rotate: every item's centre orbits the pivot by rotateYaw about +Y and its own yaw adds rotateYaw.
// scale: centre offsets from the pivot scale per axis; each item's size / sizeY / scale multiplies (clamped ≥ 0.01 m).

// level-marquee.ts
export function marqueeHits(items: readonly { id: number; centre: [number, number, number] }[], project: (p: [number, number, number]) => { x: number; y: number; inFront: boolean }, rect: { x0: number; y0: number; x1: number; y1: number }): number[];
```

- Marquee in 3D: with the Select tool, a press on empty ground that travels more than 4 px **with Shift held**
  draws a screen rectangle (an absolutely positioned `div` with `border border-dashed border-primary bg-primary/10`);
  a plain drag stays an orbit (Phase 136's rule: "a press that travelled is an orbit"). Hits are items whose
  projected centre is inside the rectangle and in front of the camera. Shift-marquee adds; there is no replace
  marquee in 3D (an orbit owns the plain drag).
- **Z** toggles Pivot / Centre, **X** toggles Local / World (Unity's defaults). A two-radio group per toggle sits after
  `TransformModeBar` in the 3D bar, labelled "Pivot" / "Centre" and "Local" / "World", icons `LuCrosshair` /
  `LuGroup` and `LuBox` / `LuGlobe` from `react-icons/lu`. With one object selected, Local is honoured for rotate and
  scale exactly as today; with 2+ objects the gizmo is always oriented by the pivot's yaw in Local, axis-aligned in
  World.
- During a drag only the three objects move (Phase 136 Decision 8); release commits one `gizmoEditGroup`.

**Acceptance.**

- [ ] D1. `groupPivot(…, 'centre')` of two boxes at x = 0 and x = 10 m returns centre x = 5.
- [ ] D2. `gizmoEditGroup` with `rotateYaw: 90` about a centre pivot swaps the two boxes' positions and adds 90 to each
  `rotation`; `past.length` grows by 1.
- [ ] D3. `gizmoEditGroup` with `scale: [2,1,2]` doubles each box's footprint and its distance from the pivot.
- [ ] D4. `marqueeHits` excludes an item behind the camera (`inFront: false`) and one outside the rect.
- [ ] D5. The store persists `pivot` and `space`; a corrupt value falls back to `'pivot'` / `'world'`.
- [ ] D6. Pressing Z and X with the 3D view focused flips the radios' `aria-checked`.

**Done when** D1–D6 pass. Real-gizmo dragging is covered by the Verification gate (WebGL is not driven in e2e here).

### E — Align and distribute (S)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-align.ts` | net-new: pure ops |
| `packages/features/media-game/renderer/level/level-align.test.ts` | net-new |
| `packages/features/media-game/renderer/level/level-align-bar.tsx` | net-new: the bar |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: render the bar in the toolbar row after Redo when `selected.length ≥ 2` |

**Contract.**

```ts
export type AlignAxis = 'x' | 'y';           // plan axes (y = world Z in 3D levels)
export type AlignEdge = 'min' | 'centre' | 'max';
export function alignObjects(state: EditState, refs: readonly ObjectRef[], axis: AlignAxis, edge: AlignEdge): EditState;       // one commit
export function distributeObjects(state: EditState, refs: readonly ObjectRef[], axis: AlignAxis): EditState;                    // ≥ 3 refs, even centre spacing between the two extremes; one commit
```

- Align is against the **selection bounds** (`selectionBounds`), not a key object — Figma, Unreal's Align Actors and
  Godot's align all default to the bounds; a key-object mode is not offered.
- The bar: six `IconButton`s (`chrome.tsx`'s `IconButton`, label = tooltip) — `LuAlignStartVertical`,
  `LuAlignCenterVertical`, `LuAlignEndVertical`, `LuAlignStartHorizontal`, `LuAlignCenterHorizontal`,
  `LuAlignEndHorizontal` — and two distribute buttons `LuAlignHorizontalDistributeCenter` /
  `LuAlignVerticalDistributeCenter`, disabled with label "Select three or more to distribute" below 3. Every name
  must resolve (`packages/app/src/components/icons/icon-names.test.ts` checks the `lu` names the renderer imports; if
  one does not exist in the installed `react-icons`, use `LuAlignLeft` / `LuAlignCenter` / `LuAlignRight` /
  `LuAlignJustify` and say so in the PR).

**Acceptance.**

- [ ] E1. Aligning three boxes on `x`/`min` sets each box's left footprint edge to the bounds' left; one undo step.
- [ ] E2. `centre` aligns footprint centres, `max` right edges; a rotated box uses its rotated footprint.
- [ ] E3. `distributeObjects` on 4 objects keeps the two extremes and spaces the middle two evenly by centre.
- [ ] E4. The bar renders only at 2+ selected; the distribute buttons are disabled at exactly 2.

**Done when** E1–E4 pass.

### F — Snap settings (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-snap.ts` | net-new: plan grid steps, surface snap |
| `packages/features/media-game/renderer/level/level-snap.test.ts` | net-new |
| `packages/features/media-game/renderer/level/level-snap-popover.tsx` | net-new: the popover |
| `packages/features/media-game/renderer/level/3d/level-view-store.ts` | edit: `snap: LevelSnap` (sanitised in `merge`) |
| `packages/features/media-game/renderer/level/level-plan.ts` | edit: `snapPlan` takes the plan step instead of the fixed tile |
| `packages/features/media-game/renderer/level/3d/level-3d-view.tsx` | edit: feed `snap.grid` / `snap.angle` into `TransformModeBar`'s `snap` and the gizmo; apply surface snap on release |

**Contract.**

```ts
export type LevelSnap = {
  enabled: boolean;                       // master switch (the popover's "Snap" switch)
  planStep: 1 | 0.5 | 0.25 | 0;           // fraction of a tile; 0 = off
  grid: number;                           // metres, one of GRID_STEPS (frame)
  angle: number;                          // degrees, one of ANGLE_STEPS (frame)
  surface: boolean;                       // drop onto the top face under the object
};
export const DEFAULT_LEVEL_SNAP: LevelSnap = { enabled: true, planStep: 1, grid: 0.5, angle: 15, surface: false };
export function planSnapStep(level: Pick<EditLevel, 'tilewidth' | 'tileheight'>, snap: LevelSnap): { x: number; y: number } | null;
export function surfaceElevation(items: readonly WorldItem[], footprint: { minX: number; maxX: number; minZ: number; maxZ: number }, excludeIds: ReadonlySet<number>, groundY: number): number;
// highest top (centre.y + size.y/2) among box items overlapping the footprint in XZ, else groundY; returned as elevation above groundY.
```

- **Holding Alt inverts snapping** for the gesture (Unity uses Ctrl to *enable*; Godot and Blender toggle with a
  modifier). Alt is already `CanvasPointer.alt` and `snapPlan(…, alt)` already reads it as "free", so the plan keeps
  its existing meaning and 3D adopts it. `effectiveStep`'s Shift (fine step) stays as the frame defines it.
- The popover opens from a toolbar `IconButton` `LuMagnet` ("Snap settings") and holds: a `SwitchRow`
  (`packages/frame/src/form/toggle-rows.tsx`) "Snap", a `Choice` (`packages/frame/src/form/field.tsx`) for the plan
  step (Tile / ½ / ¼ / Off), selects for grid and angle reusing the frame's `GRID_STEPS` / `ANGLE_STEPS` labels, and a
  `SwitchRow` "Snap to surfaces" (3D only, hidden for 2D). The popover is `Popover` from `chrome.tsx` (props
  `GamePopoverProps`; it already handles Escape and outside click and counts as an occluder).
- Surface snap runs on gizmo **release** (not during the drag) and on Place: the object's `elevation` becomes
  `surfaceElevation(...)` (Unity's surface snapping and Unreal's End-to-floor, reduced to box tops; Phase 141 extends
  it to terrain).

**Acceptance.**

- [ ] F1. `planSnapStep` returns a half-tile step for `planStep: 0.5` and `null` for `0` or `enabled: false`.
- [ ] F2. `surfaceElevation` returns the top of a 2 m crate under the footprint and `0` over open ground; the moved
  object itself is excluded.
- [ ] F3. The store round-trips `snap`; a corrupt `snap.grid` falls back to `DEFAULT_LEVEL_SNAP.grid`.
- [ ] F4. Changing the angle select in the popover changes the value `TransformModeBar` receives.
- [ ] F5. A synthetic plan drag with `planStep: 0.5` lands on half-tile positions; with Alt held it lands unsnapped.

**Done when** F1–F5 pass.

### G — Every tool in 3D (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: `TOOLS_IN_3D` = every `TOOLS_3D` id; no drop back to Select for Volume / Path / Rotate |
| `packages/features/media-game/renderer/level/3d/level-ground.ts` | net-new: `groundPoint(ray, groundY)` and `planPointFromWorld` |
| `packages/features/media-game/renderer/level/3d/level-3d-view.tsx` | edit: tool gestures in 3D |
| `packages/features/media-game/renderer/level/3d/level-scene.tsx` | edit: draft volume box, draft path line, rotate aim line |
| `packages/features/media-game/renderer/level/3d/level-3d-logic.test.ts` | edit |

**Contract.**

```ts
export function groundPoint(origin: [number, number, number], dir: [number, number, number], groundY: number): [number, number, number] | null; // null when parallel or behind
export function planPointFromWorld(level: EditLevel, x: number, z: number): PlanPoint; // wraps level-world's worldToObjectPoint
```

- **Volume (R)**: press on ground → rubber-band box from the press to the pointer (translucent `#f59e0b` at 25%,
  `sizeY` = `DEFAULT_SIZE_Y`); release calls `setVolume(state, layerId, from, to)` with both points through
  `planPointFromWorld` and Theme F's snap. A press that does not travel 4 px adds nothing.
- **Path (P)**: each click on ground appends with `addPathPoint`; the draft draws as a line with point markers;
  Enter → `finishPath`, Escape cancels, Backspace removes the last point (the plan's existing keys). Clicks do not
  orbit; drag still orbits.
- **Rotate (Y)**: press on a selected object and drag on the ground → aim line from its centre; release sets
  `rotation` with `rotationToward` (snapped by Theme F's angle) for every selected object, one step.
- OrbitControls are disabled for the duration of a Volume drag (as TransformControls already does for the gizmo).

**Acceptance.**

- [ ] G1. `groundPoint` returns the intersection for a downward ray and `null` for a ray parallel to the ground.
- [ ] G2. Switching to 3D with Volume, Path or Rotate active keeps that tool (the toolbar radio stays checked).
- [ ] G3. A Volume gesture fed through the view's pure gesture reducer (`volumeFromDrag(from, to, snap)`, exported
  for the test) produces the same `setVolume` arguments as the plan for equal ground points.
- [ ] G4. Rotate over 2 selected objects sets both `rotation`s toward the same ground point in one undo step.

**Done when** G1–G4 pass and the Verification gate's 3D tool pass is ticked.

### H — The outliner (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-outliner.tsx` | net-new: the panel (replaces `LayerList` in the left aside) |
| `packages/features/media-game/renderer/level/level-outline.ts` | net-new: pure tree build, filter, range |
| `packages/features/media-game/renderer/level/level-outline.test.ts` | net-new |
| `packages/features/media-game/renderer/level/level-outliner.test.tsx` | net-new |
| `packages/features/media-game/renderer/level/level-outliner-store.ts` | net-new: editor-only hide / lock, panel widths |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: mount the outliner with `useResizable` + `ResizeHandle`; pass `isSelectable` to C/D |
| `packages/features/media-game/renderer/level/level-plan-draw.ts`, `3d/level-scene.tsx` | edit: skip editor-hidden objects |

**Contract.**

```ts
// level-outline.ts
export type OutlineRow =
  | { kind: 'layer'; layerId: number; name: string; layerKind: 'tile' | 'object'; depth: 0; count: number; visible: boolean }
  | { kind: 'object'; ref: ObjectRef; name: string; type: string; depth: 1; hidden: boolean; locked: boolean };
export function buildLevelOutline(level: EditLevel, opts: { query: string; collapsed: ReadonlySet<number>; hidden: ReadonlySet<string>; locked: ReadonlySet<string> }): OutlineRow[];
// query matches name OR type, case-insensitive; a layer row is kept when any child matches; tile layers have no children.
export function rangeRefs(rows: readonly OutlineRow[], from: ObjectRef, to: ObjectRef): ObjectRef[]; // Shift-click range, model editor's rangeBetween rule

// level-outliner-store.ts — persisted `midnite-studio.level-outliner`, merge-sanitised, no version bump
type OutlinerState = {
  hiddenByScene: Record<string, string[]>;   // key `${gameId}/${scene}` → refKey[]
  lockedByScene: Record<string, string[]>;
  width: number;                             // px, default 224, min 160, max 420
  collapsed: boolean;                        // snap-collapsed via useResizable's onCollapse
};
export function useLevelOutlinerStore(): …; export function isSelectable(gameId: string, scene: string, ref: ObjectRef): boolean;
```

- **Hide and lock are editor-only** (Unity's Scene Visibility and pickability, Godot's lock): they never change the
  `.tmj`, so the game is unaffected and a teammate's checkout is unchanged. The layer row's eye keeps today's
  behaviour (`toggleVisible`, which writes the Tiled layer `visible` flag) because Phase 132 shipped it that way;
  its tooltip says "Hide layer (saved)" and the object eye says "Hide in editor".
- A hidden object is not drawn, not hit-testable and not marquee-selectable; a locked one is drawn but not
  hit-testable or marquee-selectable (it can still be selected from the outliner, so its inspector stays reachable).
- Layout: the aside uses `useResizable({ size: width, onSize, min: 160, max: 420, initial: 224, axis: 'x', edge:
  'end', onCollapse, onExpand })` and a `ResizeHandle` (`packages/frame/src/layout/resizable/`), both exported from
  `@midnite/studio-frame`. Collapsed, the aside is a 32 px strip with an `IconButton` `LuPanelLeftOpen` "Show
  outliner".
- Search: `ExplorerSearch` (`packages/frame/src/layout/explorer.tsx`) at the top, placeholder "Search objects".
- Rows: a `role="tree"` list with `role="treeitem"`, `aria-level`, `aria-selected`, `aria-expanded` on layers. The
  object row: type colour dot (`PLAN_COLOURS`), name (or `type #id`), then hover-revealed `IconButton`s `LuEye` /
  `LuEyeOff` and `LuLock` / `LuLockOpen` (always shown when active). Selected rows: `bg-primary/10`; the primary also
  gets `font-medium`.
- Keyboard: Up / Down move focus (roving tabindex), Space or Enter selects, Shift+Up / Down extend, Left / Right
  collapse / expand a layer, F frames, H toggles hide, L toggles lock (row focus only — not the canvas, where L is
  free for Phase 142's link tool).
- Clicks: plain → `selectOnly`; Shift → `addSelected(rangeRefs(...))`; Mod → `toggleSelected`; double-click → select
  and frame (the 3D view's existing F path; the plan centres the object at the current zoom).
- Empty states: a level with no object layers shows `EmptyState` (`packages/frame/src/layout/empty-state.tsx`) "No
  object layers" with an `EmptyStateButton` "Add object layer" (`addLayer(state, 'object', 'objects')`); a search with
  no match shows "No objects match “query”".
- Over 2,000 rows the list virtualises with `@tanstack/react-virtual` (a frame dependency today; add
  `"@tanstack/react-virtual": "^3.11.2"` to `packages/features/media-game/package.json`, which does not list it), fixed
  24 px rows.

**Acceptance.**

- [ ] H1. `buildLevelOutline` with query "coin" keeps only matching objects and their layer rows.
- [ ] H2. `rangeRefs` returns the rows between two refs inclusive, in row order, across one layer.
- [ ] H3. Hiding an object removes it from `drawPlan` calls and from `hitPlan` results; locking removes it from hit
  tests but not from drawing.
- [ ] H4. Hide and lock persist per `gameId/scene` and never change `edit.level` (`dirty` stays false).
- [ ] H5. Clicking a row in the outliner selects the object and the inspector shows it; Shift-click selects a range.
- [ ] H6. Arrow keys move focus between rows (`document.activeElement` changes) and Enter selects.
- [ ] H7. Dragging the handle (synthetic pointer events on `ResizeHandle`) below `min` collapses the aside to the strip.

**Done when** H1–H7 pass.

### I — Context menus (S)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-context-menu.ts` | net-new: `levelContextMenu` (pure: returns `FrameMenuEntry[]`) |
| `packages/features/media-game/renderer/level/level-context-menu.test.ts` | net-new |
| `packages/features/media-game/renderer/level/level-editor.tsx`, `level-canvas.tsx`, `3d/level-3d-view.tsx`, `level-outliner.tsx` | edit: `onContextMenu` → open the menu |

**Contract.**

```ts
export type LevelMenuTarget = { kind: 'object'; ref: ObjectRef } | { kind: 'empty'; at: PlanPoint } | { kind: 'layer'; layerId: number };
export type LevelMenuActions = { cut(): void; copy(): void; paste(at?: PlanPoint): void; duplicate(): void; remove(): void; frame(): void;
  hide(): void; lock(): void; selectAllOfType(type: string): void; align(axis: AlignAxis, edge: AlignEdge): void; addLayer(kind: 'tile' | 'object'): void };
export function levelContextMenu(state: EditState, target: LevelMenuTarget, ctx: { canPaste: boolean; readOnly: boolean }, actions: LevelMenuActions): FrameMenuEntry[];
```

- Opening: `useFrameChrome().useDialogs().openMenu?.(point, items)` (`packages/frame/src/chrome/types.ts`
  `FrameDialogs.openMenu`); when the host provides no `openMenu`, render `KitContextMenu`
  (`packages/frame/src/kit/context-menu.tsx`) at the point. Right-clicking an unselected object first selects it
  (every engine does this).
- Object menu: Cut ⌘X · Copy ⌘C · Paste ⌘V · Duplicate ⌘D · separator · Frame F · Hide · Lock · Select all
  “type” · separator · Align ▸ (a `FrameSubmenuItem` with the six aligns, shown at 2+ selected) · separator · Delete
  (`danger`). Empty menu: Paste here · Select all · Add object layer. Layer menu: Add tile layer · Add object layer ·
  Select all in layer. Read-only levels show only Copy / Frame / Select all.
- Glyphs from `react-icons/lu` (`LuScissors`, `LuCopy`, `LuClipboardPaste`, `LuCopyPlus`, `LuFocus`, `LuEyeOff`,
  `LuLock`, `LuTrash2`).

**Acceptance.**

- [ ] I1. For an object target with 1 selected, the entries are exactly the documented order, without Align.
- [ ] I2. With 3 selected, Align is present as a submenu with 6 items.
- [ ] I3. `canPaste: false` disables Paste with `disabledReason` "Nothing to paste".
- [ ] I4. `readOnly: true` leaves only Copy, Frame and Select all.
- [ ] I5. Right-clicking an unselected object in `level-editor.test.tsx` selects it before the menu opens.

**Done when** I1–I5 pass.

### J — Shortcut cheat-sheet (S)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-shortcuts.ts` | net-new: the table + a `matchShortcut` dispatcher |
| `packages/features/media-game/renderer/level/level-shortcuts.test.ts` | net-new |
| `packages/features/media-game/renderer/level/level-shortcut-help.tsx` | net-new: the modal |
| `packages/features/media-game/renderer/level/level-editor.tsx`, `3d/level-3d-view.tsx` | edit: `onKeyDown` dispatches through `matchShortcut` |

**Contract.**

```ts
export type LevelShortcutGroup = 'Tools' | 'Selection' | 'Edit' | 'View';
export type LevelShortcut = { id: LevelCommandId; chord: string; label: string; group: LevelShortcutGroup; views: ReadonlyArray<'plan' | '3d'>; dimension?: '2d' | '3d' };
export type LevelCommandId = 'tool.select' | 'tool.entity' | 'tool.paint' | 'tool.erase' | 'tool.rect' | 'tool.pick' | 'tool.volume' | 'tool.path' | 'tool.rotate'
  | 'edit.undo' | 'edit.redo' | 'edit.cut' | 'edit.copy' | 'edit.paste' | 'edit.duplicate' | 'edit.delete'
  | 'select.all' | 'select.none' | 'select.nudge' | 'view.frame' | 'gizmo.translate' | 'gizmo.rotate' | 'gizmo.scale'
  | 'gizmo.pivot' | 'gizmo.space' | 'help.shortcuts';
export const LEVEL_SHORTCUTS: readonly LevelShortcut[];
export function matchShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, ctx: { view: 'plan' | '3d'; dimension: '2d' | '3d'; mac: boolean }): LevelCommandId | null;
```

- Chord grammar matches the model editor's `shortcuts.ts` (`Mod+Shift+Z`, `formatChord`); `Mod` is Cmd on macOS.
- The cheat-sheet opens on `?` (Shift+/) with the canvas focused and from a toolbar `IconButton` `LuKeyboard`
  "Keyboard shortcuts". It is a `FrameModal` (`@midnite/studio-frame`) titled "Level editor shortcuts", four columns
  by group, only the rows valid for the current view and dimension, each chord in a
  `<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">` chip (the
  `ChordsPage` style, `packages/frame/src/settings/chords-page.tsx`). Escape closes and returns focus to the canvas.
- The modal is counted with `useOccludeWhile(open)` (`chrome.tsx`) so a running game's native view never paints
  over it.

**Acceptance.**

- [ ] J1. Every key the handler acted on before this phase has a `LEVEL_SHORTCUTS` row (a test lists the pre-phase
  keys: B E R I O V P Y, Mod+Z, Mod+Shift+Z, Delete, Backspace, Enter, Escape, W E R F in 3D).
- [ ] J2. No two rows with overlapping `views` and `dimension` share a chord (test).
- [ ] J3. `matchShortcut` maps Cmd+D (mac) and Ctrl+D (non-mac) to `edit.duplicate`.
- [ ] J4. `?` opens the modal; it lists Mod+D as "⌘D" on mac; Escape closes it and focus returns to the canvas.

**Done when** J1–J4 pass.

## MCP

No new tool in this phase. Agents reach its capabilities through Phase 138:

| Capability | Agent path (Phase 138) |
|---|---|
| Multi-select, highlight | `game_level_select { game, scene, ids: number[] }` sets `selected` to all ids (primary = last) once Theme A has landed |
| Duplicate / paste | `game_entity_batch` with `add` ops copying the source objects' fields |
| Group move, align, distribute | `game_entity_batch` with `update` ops (one undoable change set) |
| Hide / lock | not exposed: editor-only view state, deliberately not agent-writable |

The `midnite-media-game-build` skill needs no change for this phase.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/features/media-game/renderer/level/level-edit-model.ts` | A | edit |
| `packages/features/media-game/renderer/level/level-selection.ts` | A | net-new |
| `packages/features/media-game/renderer/level/level-clipboard.ts` | B | net-new |
| `packages/features/media-game/renderer/level/level-canvas.tsx` | C I | edit |
| `packages/features/media-game/renderer/level/level-plan-draw.ts` | C H | edit |
| `packages/features/media-game/renderer/level/level-plan.ts` | F | edit |
| `packages/features/media-game/renderer/level/level-editor.tsx` | B C E F G H I J | edit |
| `packages/features/media-game/renderer/level/3d/level-world.ts` | D | edit |
| `packages/features/media-game/renderer/level/3d/level-scene.tsx` | D G H | edit |
| `packages/features/media-game/renderer/level/3d/level-3d-view.tsx` | D F G I J | edit |
| `packages/features/media-game/renderer/level/3d/level-marquee.ts`, `3d/level-ground.ts` | D G | net-new |
| `packages/features/media-game/renderer/level/3d/level-view-store.ts` | D F | edit (merge-sanitised fields, no version bump) |
| `packages/features/media-game/renderer/level/level-align.ts`, `level-align-bar.tsx` | E | net-new |
| `packages/features/media-game/renderer/level/level-snap.ts`, `level-snap-popover.tsx` | F | net-new |
| `packages/features/media-game/renderer/level/level-outliner.tsx`, `level-outline.ts`, `level-outliner-store.ts` | H | net-new |
| `packages/features/media-game/renderer/level/level-context-menu.ts` | I | net-new |
| `packages/features/media-game/renderer/level/level-shortcuts.ts`, `level-shortcut-help.tsx` | J | net-new |
| `packages/app/e2e/level-multiselect.spec.ts` | C | net-new (e2e budget +1) |
| `packages/shared/src/feature-toggles.ts` (the Media toggle's `data.storeKeys`, L303) | H | edit: add `midnite-studio.level-outliner` beside `midnite-studio.level-view` |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` for `packages/features/media-game`, eslint on changed files, vitest on
  `renderer/level`, `scripts/layer-boundaries.test.mjs`, `node scripts/tracker-check.mjs`, `node
  scripts/e2e-budget.mjs`.
- [ ] `packages/app/src/components/icons/icon-names.test.ts` green (every new `Lu*` name resolves).
- [ ] **Gate — the built app, a throwaway `--user-data-dir`, no mocks**, on a new third-person game and a new
  platformer in a temp folder: marquee + Shift + Mod selection in both views; Mod+C / Mod+V / Mod+D; group move,
  rotate about Centre and Pivot, scale; align left and distribute; snap at ½ tile and 45°; surface snap a crate onto a
  crate; Volume, Path and Rotate in 3D; outliner search, hide, lock and range select; each context menu; the `?`
  cheat-sheet; one Save is one commit. Shots under `/tmp/midnite-shots-p137/`.

## Not in this phase

- **Nesting or grouping objects into a hierarchy.** Tiled object layers are flat; prefabs (Phase 139) are the
  grouping unit.
- **Copying tiles.** Phase 143's stamp brush.
- **A global chord** for any level command. Keys stay local to the focused canvas (Phase 132 decision).
- **Agent-visible hide / lock.** Editor view state, not level data.
- **Snap to vertex or edge.** Surface snap covers placement; vertex snapping needs mesh data the editor does not load.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Selection = primary + set.** `selection` stays the primary ref and `selected` holds all; Unity's
   `Selection.activeObject` + `Selection.objects` and Godot's editor selection both separate the active object from
   the set. Keeping `selection` avoids touching every inspector call site.
2. **Marquee takes only fully enclosed objects** (Unity, Godot): partially crossing a large floor volume must not
   select it.
3. **Undo and redo keep the selection**, filtered to objects that still exist (Unity, Godot). Clearing it, as Phase
   132 did, loses the user's place after every undo.
4. **Duplicate in place, paste at the pointer.** Unity's Ctrl+D and Godot's Ctrl+D duplicate in place and select the
   copy; Tiled and LDtk paste at the cursor. A fallback paste offset of one tile keeps a paste from hiding under the
   original.
5. **The clipboard is versioned JSON on the system clipboard**, with an in-memory fallback, so copying between two
   games works and a stale or foreign clipboard parses to `null`, never throws.
6. **Pivot vs Centre and Local vs World on Z and X** — Unity's toggles and keys. Godot's equivalent is per-tool; one
   pair of radios is simpler and matches the existing W/E/R from Unity.
7. **Align against the selection bounds**, no key-object mode (Figma, Unreal's default). One rule, no state.
8. **Alt inverts snapping.** The plan already reads Alt as "free"; 3D adopts the same rule so one modifier means the
   same thing in both views. Shift stays the frame's fine step.
9. **Surface snap uses box tops only**, on release. Mesh raycasts need loaded models (Phase 136 loads them lazily);
   terrain arrives in Phase 141.
10. **Hide and lock are editor-only and persisted per scene in the renderer** (`midnite-studio.level-outliner`), as
    Unity keeps Scene Visibility out of the scene file. The existing layer eye stays a saved Tiled flag because Phase
    132 shipped it that way; the tooltips say which is which.
11. **The shortcut table is the dispatcher.** One `LEVEL_SHORTCUTS` array feeds both `matchShortcut` and the
    cheat-sheet, so the sheet cannot drift from the keys (the model editor's `SHORTCUTS` precedent).
12. **3D marquee needs Shift.** A plain drag on empty ground is an orbit (Phase 136); stealing it would break
    navigation, and a screen-space Shift-marquee is how Unreal's viewport box-select (Ctrl+Alt drag) avoids the same
    conflict.
13. **One new e2e spec** (marquee + group drag needs real pointer drag on a canvas); everything else is vitest.
