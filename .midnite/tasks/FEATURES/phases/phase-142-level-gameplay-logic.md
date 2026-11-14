# Phase 142 — Level gameplay logic and validation

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

A level's objects are typed by a hard-coded list (`GAME_LEVEL_ENTITY_TYPES_2D` / `_3D` in
`packages/shared/src/game-level.ts`), and their properties are whatever the user types into the inspector's free
key/value rows. Nothing says that an `enemy` has a `patrol` path and a `speed`, that a `door` opens from a
`switch`, or that the exit can actually be reached. Every serious level tool closes that gap the same way — LDtk's
entity definitions with typed fields and entity references, Tiled's custom types and `object` properties, Unity's
serialized fields and object references, Godot's exported properties and `NodePath`s, Unreal's Details panel and
actor references — and this phase does too:

- **Entity types in the manifest**, each with a typed field schema (number with range, bool, enum, colour, asset,
  object link, string), defaulted from built-in schemas for today's types.
- **A schema-driven inspector**: the right control for each field, validation inline.
- **Links between objects** (switch → door, trigger → spawner, patrol → path), stored as Tiled `object` properties,
  drawn as arrows, edited with a link tool, read by the kit.
- **A Problems panel**: Phase 138's validator grown with gameplay rules (missing required field, dangling link,
  unreachable exit), never blocking save.

Agents get `game_entity_types` and link ops, and `game_level_validate` reports the new rules.

> **Builds on.**
> - **The level format** — `packages/shared/src/game-level.ts` (`GAME_LEVEL_ENTITY_TYPES_2D` / `_3D` L21–22,
>   `GAME_LEVEL_PROPS`, `levelProperties`, Tiled property `type`s).
> - **The manifest** — `packages/shared/src/media-game.ts` (`GameManifestSchema`), read and written by
>   `games.manifest.get` / `games.manifest.set` (one commit).
> - **The editor** — `level-editor.tsx` (palette, inspector), `level-edit-model.ts` (`setProperty`), `level-plan-draw.ts`,
>   `3d/level-scene.tsx`.
> - **Phase 138** — `LevelOpSchema` / `applyLevelOps` (A), the validator core `LEVEL_RULES` / `validateLevel` (B), the
>   tool recipe, `game_level_validate` (D).
> - **Phase 137** — selection (A), context menu (I), shortcuts table (J).
> - **The kit** — `templates/media-game/kit/core/level.js`, `kit/core/tiled-objects.js` (`collisionGrid`, used by the
>   reachability rule), `kit/phaser/level.js`, `kit/three/level.js`.
>
> **Depends on:** Phase 138 (A, B, D), Phase 137 (A, I, J). **Unlocks:** Phase 145's visual diff shows link changes;
> Phase 143's stamp brush carries typed objects.
>
> **Scope guardrails.** Unknown types and fields stay legal: a schema describes, it never deletes data. Save is never
> blocked. A kit change is a kit bump. No visual scripting (Not in this phase).

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — Entity type schemas.** ◻ `GameEntityTypeSchema` (fields, icon, colour, dimension) in the manifest's
optional `entityTypes`, merged over `GAME_ENTITY_DEFAULT_SCHEMAS`; `entitySchemaFor(manifest, type)`.

**Theme B — The schema-driven inspector.** ◻ Each field gets its control (number with range and step, `SwitchRow`,
`Choice`, colour, asset picker, link picker, text); out-of-range values show inline; unknown properties stay in an
"Other" section.

**Theme C — Links and the link tool.** ◻ A `link` field is a Tiled `object` property (the target's id); tool `L`
drags from one object to another to link; the inspector's link picker does the same by list.

**Theme D — Link visualisation.** ◻ Curved arrows between linked objects in both views (selected: bold and
labelled with the field; others: faint; a "Show links" toggle).

**Theme E — The kit reads links.** ◻ `levelLinks(level)` and `resolveLink(obj, field)` in the kit; the starters' door
/ switch and enemy / path pairs use them; kit bump.

**Theme F — Gameplay rules.** ◻ `level/required-field`, `level/field-type`, `level/dangling-link`,
`level/link-target-type`, `level/unreachable-exit` (2D flood fill over the collision grid), appended to
`LEVEL_RULES`.

**Theme G — The Problems panel.** ◻ A `BottomPanel` listing issues by severity with click-to-select, a badge on its
header button, live as you edit (debounced), never blocking Save.

**Theme H — MCP.** ◻ `game_entity_types` (read) and `game_entity_types_set` (write), `link` / `unlink` level ops; the
skill's `## Levels` learns typed fields and links.

## Build order

**A** → **B** → **C** → **D** → **F** → **G** → **E** (kit, independent after C) → **H**.

## Deliverables

### A — Entity type schemas (M)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-entity-types.ts` | net-new |
| `packages/shared/src/game-entity-types.test.ts` | net-new |
| `packages/shared/src/media-game.ts` | edit: `entityTypes: z.array(GameEntityTypeSchema).max(64).optional()` on `GameManifestSchema` |
| `packages/shared/src/index.ts` | edit |
| `packages/shared/src/game-level-ops.ts` (138 A) | edit: `levelEntityTypes` → `entityTypeNames(manifest, level)` |

```ts
export const GameEntityFieldSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), name: FieldName, label: z.string().max(40).optional(), min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional(), integer: z.boolean().default(false), default: z.number().optional(), required: z.boolean().default(false) }),
  z.object({ kind: z.literal('bool'), name: FieldName, label: …, default: z.boolean().optional() }),
  z.object({ kind: z.literal('enum'), name: FieldName, label: …, options: z.array(z.string().min(1).max(40)).min(1).max(32), default: z.string().optional(), required: … }),
  z.object({ kind: z.literal('string'), name: FieldName, label: …, maxLength: z.number().int().max(4000).default(200), default: z.string().optional(), required: … }),
  z.object({ kind: z.literal('color'), name: FieldName, label: …, default: z.string().regex(/^#[0-9a-f]{6}$/i).optional() }),
  z.object({ kind: z.literal('asset'), name: FieldName, label: …, assetKind: z.enum(GAME_ASSET_KINDS), required: … }),
  z.object({ kind: z.literal('link'), name: FieldName, label: …, targetTypes: z.array(z.string()).max(16).optional(), required: … }),
]);
const FieldName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/).refine((n) => !n.startsWith('midnite'), 'midnite.* names are reserved');
export const GameEntityTypeSchema = z.object({
  type: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), label: z.string().max(40).optional(),
  dimension: z.enum(['2d', '3d', 'both']).default('both'),
  icon: z.string().max(40).optional(),           // a react-icons/lu export name, checked against the icon set in the renderer only
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  fields: z.array(GameEntityFieldSchema).max(32).default([]),
});
export type GameEntityType = z.infer<typeof GameEntityTypeSchema>;
export const GAME_ENTITY_DEFAULT_SCHEMAS: readonly GameEntityType[];   // today's 2D and 3D types with the fields the starters already read
export function entityTypesFor(manifest: GameManifest | null, dimension: '2d' | '3d'): readonly GameEntityType[]; // defaults, then manifest entries override by `type`
export function entitySchemaFor(manifest: GameManifest | null, dimension: '2d' | '3d', type: string): GameEntityType | null;
export function fieldTiledType(field: GameEntityField): 'int' | 'float' | 'bool' | 'string' | 'color' | 'object' | 'file';
```

- `GAME_ENTITY_DEFAULT_SCHEMAS` is derived from what the starters read (grep of the genre kits): e.g. `enemy` →
  `speed` (number 0–20), `patrol` (link → `path`), `hp` (int 1–999); `prop` → `model` (asset model), `scale`
  (number 0.05–20); `light` → `color`, `intensity`, `range`; `exit` → `to` (enum of scene names is dynamic, so
  `string`); `trigger` → `target` (link). The test asserts every field name in the defaults is read somewhere in
  `templates/media-game` (no invented fields).
- `GAME_LEVEL_ENTITY_TYPES_2D` / `_3D` stay (other code imports them) and equal the defaults' type lists (a test
  pins it).

**Acceptance.**

- [ ] A1. A manifest without `entityTypes` parses unchanged (every existing fixture).
- [ ] A2. A manifest entry for `enemy` overrides the default's fields; a new `door` type appears in
  `entityTypesFor`.
- [ ] A3. `FieldName` rejects `midnite.foo` and `9lives`.
- [ ] A4. Every default field name occurs in the kit or a starter (test greps the template tree).
- [ ] A5. `fieldTiledType` maps `link` → `object`, `asset` → `string`, `color` → `color`.

**Done when** A1–A5 pass.

### B — The schema-driven inspector (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/inspector/entity-inspector.tsx` (+ test) | net-new: replaces the free rows for a typed object |
| `packages/features/media-game/renderer/level/inspector/field-controls.tsx` (+ test) | net-new: one control per field kind |
| `packages/features/media-game/renderer/level/inspector/field-values.ts` (+ test) | net-new: read/write a field from Tiled properties with the right Tiled `type`, `fieldIssue(field, value)` |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: render the new inspector; the palette lists `entityTypesFor` with icon and colour |
| `packages/features/media-game/renderer/level/use-entity-types.ts` | net-new: manifest → types, re-read on `gamesChanged` |

- Controls: number → a compact numeric input with `min`/`max`/`step` and, when both bounds exist, a `BrandSlider`
  (`packages/frame/src/kit/brand-slider.tsx`); bool → `SwitchRow` (`packages/frame/src/form/toggle-rows.tsx`);
  enum → `Choice` (`packages/frame/src/form/field.tsx`); colour → a swatch + `input type="color"`; asset → a select
  of the manifest's assets of that kind, with the 139 B thumbnail when present; link → a combobox of target objects
  ("#12 door — Door A") with a "pick in level" `IconButton` (`LuCrosshair`) that arms the link tool (C); string →
  text input.
- Inline issue: a red helper line under the control (`fieldIssue`), the same message the validator gives; values are
  kept even when invalid (never coerced).
- **Other properties**: anything not in the schema stays in a collapsible "Other" section with today's free rows, so
  nothing becomes unreachable. An object whose type has no schema shows only "Other" (today's inspector).
- Multi-selection (137 A) of one type edits shared fields together (mixed values show "—"); of mixed types shows
  only position and "Other".

**Acceptance.**

- [ ] B1. An `enemy` shows `speed` as a slider bounded 0–20, `patrol` as a link combobox.
- [ ] B2. Typing 25 into `speed` keeps 25 and shows "speed must be at most 20".
- [ ] B3. Writing a link sets a property `{ name: 'patrol', type: 'object', value: 12 }`.
- [ ] B4. Unknown properties render under "Other" and stay editable.
- [ ] B5. Two selected enemies with different speeds show "—"; setting it writes both in one undo step.

**Done when** B1–B5 pass.

### C — Links and the link tool (M)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level-links.ts` (+ test) | net-new: `levelLinks(level)`, `linksFrom(obj)`, `retargetLinksOnDelete` |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: tool `link`, key `L` (137 J table) in 2D and 3D |
| `packages/features/media-game/renderer/level/level-canvas.tsx`, `3d/level-3d-view.tsx` | edit: drag from source to target |
| `packages/features/media-game/renderer/level/level-edit-model.ts` (+ test) | edit: `setLink`, `clearLink`; `deleteObjects` (137 A) clears links to the deleted ids |

```ts
export type LevelLink = { from: number; field: string; to: number };
export function levelLinks(level: unknown): LevelLink[];            // every `object`-typed property with a non-zero value
```

- The link tool: press on a source object, drag (a rubber-band arrow follows), release on a target. If the source's
  schema has exactly one `link` field accepting the target's type, it is set; several → a small menu (via
  `openMenu` / `KitContextMenu`, 137 I) to pick the field; none → a notice "Door has no link field for a switch".
- **Delete keeps the level consistent**: deleting an object clears every link pointing to it in the same undo step
  (Unity nulls a missing reference; Tiled leaves a dangling id — dangling ids are what the validator then flags, so
  we prevent them at the source).
- Copy/paste (137 B) remaps links inside the pasted set to the new ids, and keeps links to outside objects.

**Acceptance.**

- [ ] C1. `levelLinks` returns every `object` property, ignoring value 0 (Tiled's "no object").
- [ ] C2. A link drag with one matching field sets it in one undo step.
- [ ] C3. Two matching fields open a menu; none notifies.
- [ ] C4. Deleting a target clears links to it in the same undo step.
- [ ] C5. Pasting a switch + door pair links the copies to each other.

**Done when** C1–C5 pass.

### D — Link visualisation (S)

**Files.** `packages/features/media-game/renderer/level/level-plan-draw.ts`, `3d/level-scene.tsx`,
`3d/level-view-store.ts` (`showLinks: 'all' | 'selected' | 'none'`, default `'selected'`; no version bump), the
View popover from Phase 140 F (or a toolbar `IconButton` `LuWorkflow` if 140 F has not landed).

- Arrows are quadratic curves bowed 15 % of their length, arrowhead at the target, coloured by the source type's
  colour; the selection's links are 2 px and labelled with the field name at the midpoint; others 1 px at 40 %.
  A dangling link draws a red dashed stub with a "?" at the source.
- 3D: a `Line` (drei) arc lifted 1 m above the higher endpoint.

**Acceptance.**

- [ ] D1. The plan draw list contains one curve per link for `'all'`, only the selection's for `'selected'`.
- [ ] D2. A dangling link draws the stub.

**Done when** D1–D2 pass.

### E — The kit reads links (S)

**Files.** `templates/media-game/kit/core/level.js` (`levelLinks`, `resolveLink(level, obj, field)`), the 2D
platformer and third-person starters' door/switch and enemy/patrol code under `templates/media-game/genres/`
(where they exist), `kit-level.test.ts`, the kit version constants and `kit-hash.json` (bump).

- `resolveLink` returns the target object or `null`; genre code switches from naming conventions to links where a
  convention exists today (e.g. a `target` string property naming another object's `name` keeps working as a
  fallback for old levels — read both, link first).

**Acceptance.**

- [ ] E1. `resolveLink` finds the target by id and returns `null` for 0 or a missing id.
- [ ] E2. A starter level whose switch links a door opens it in the kit test harness.
- [ ] E3. Kit hash test green after the bump.

**Done when** E1–E3 pass.

### F — Gameplay rules (M)

**Files.** `packages/shared/src/game-level-validate.ts` (138 B) and its test; `packages/shared/src/game-level-reach.ts`
(+ test, net-new).

| Rule | Severity | Fires when |
|---|---|---|
| `level/required-field` | error | a `required` field is absent or empty |
| `level/field-type` | warning | a field's value does not fit its schema (range, enum, regex) |
| `level/dangling-link` | error | a link points to no object |
| `level/link-target-type` | warning | a link's target type is not in `targetTypes` |
| `level/unreachable-exit` | warning | 2D: no walkable path from `spawn` to any `exit` |

- `LevelValidateContext` gains `entityTypes: readonly GameEntityType[]` (was names) — 138 B's callers pass
  `entityTypesFor(...)`.
- **Reachability (2D)**: a flood fill over the collision grid built by the same rules as the kit's `collisionGrid`
  (`kit/core/tiled-objects.js`), from `spawn`'s cell over empty cells with a platformer's movement model reduced to
  "can stand, can jump `jumpTiles` up and fall any distance" (`jumpTiles` from the map property `midnite.jumpTiles`,
  default 3). Top-down games (`orientation` with no gravity — the manifest's genre) use plain 4-connected fill. 3D
  reachability is out of scope (needs the nav-mesh; Phase 140 G exposes it; a later phase can use it).
- Budget: the fill is capped at 1,000,000 cells; beyond it the rule reports `info` "Level too large to check
  reachability".

**Acceptance.**

- [ ] F1. Each rule fires on its fixture and not on the starters.
- [ ] F2. A platformer fixture with a wall too high to jump flags the exit; lowering it clears the issue.
- [ ] F3. The rule list order stays deterministic (138 B2 still passes).

**Done when** F1–F3 pass.

### G — The Problems panel (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/problems/problems-panel.tsx` (+ test) | net-new |
| `packages/features/media-game/renderer/level/problems/use-level-problems.ts` (+ test) | net-new: `validateLevel` on the edit state, debounced 300 ms, in an idle callback |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: the panel and its toolbar button |

- A `BottomPanel` (`useBottomPanel('level.problems', …)`, `packages/frame/src/layout/bottom-panel/`) sharing the
  bottom slot with 139's Assets as tabs **Assets · Problems** (if 139 has not landed, Problems stands alone).
- Rows: severity icon (`LuCircleX`, `LuTriangleAlert`, `LuInfo`), message, rule id in muted mono; click selects and
  frames the object (138 G's frame helper); `Enter` on a focused row does the same. Filter chips per severity.
- The toolbar button shows counts ("2 ⨯ 5 ⚠" as icons + numbers) and turns the error count `text-destructive`.
- **Never blocks Save**: Save with errors shows a `useNotify` notice "Saved with 2 problems" and a "Show" action
  (Godot and Unity warn, never refuse; a level mid-edit is often invalid).
- `EmptyState` "No problems" with `LuCircleCheck` when clean.

**Acceptance.**

- [ ] G1. Issues update 300 ms after an edit (fake timers), not on every keystroke.
- [ ] G2. Clicking a row selects its object.
- [ ] G3. Save with errors saves and notifies.
- [ ] G4. Severity filter chips hide rows.

**Done when** G1–G4 pass.

### H — MCP (S)

**Tools** (Phase 138's tool recipe):

| Tool | Kind | `allowGames` | Input → output |
|---|---|---|---|
| `game_entity_types` | read | no | `{ game, dimension?: '2d' \| '3d' }` → `{ types: GameEntityType[], source: Record<string, 'default' \| 'manifest'> }` |
| `game_entity_types_set` | write | yes | `{ game, types: GameEntityType[] }` → `{ sha }` (merges by `type` into `manifest.entityTypes`; one commit via `games.manifest.set`) |

- **New ops** in `LevelOpSchema`: `{ op: 'link', from: number, field: string, to: number }` and `{ op: 'unlink',
  from: number, field: string }`. `applyLevelOps` validates field existence and target type against the schema.
- `game_level_validate` reports the new rules (no change to the tool; the validator grew).
- Skill `## Levels` (seven copies): "Read `game_entity_types` before adding objects; set every required field; link
  with `link` ops, never by name."

**Acceptance.**

- [ ] H1. `game_entity_types` lists defaults with `source: 'default'` and manifest overrides as `'manifest'`.
- [ ] H2. A batch `[add switch (ref s), add door, link]` — link addressed by the returned ids in a second call —
  produces a valid link.
- [ ] H3. `game_entity_types_set` refuses while `allowGames` is off; commits once when on.
- [ ] H4. Skill copies identical; pin regenerated.

**Done when** H1–H4 pass.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/game-entity-types.ts`, `game-level-links.ts`, `game-level-reach.ts` (+ tests) | A C F | net-new |
| `packages/shared/src/media-game.ts`, `game-level-ops.ts`, `game-level-validate.ts`, `index.ts` | A F H | edit |
| `packages/features/media-game/renderer/level/inspector/*`, `problems/*`, `use-entity-types.ts` | B G | net-new |
| `packages/features/media-game/renderer/level/level-editor.tsx`, `level-canvas.tsx`, `level-edit-model.ts`, `level-plan-draw.ts`, `3d/level-scene.tsx`, `3d/level-3d-view.tsx`, `3d/level-view-store.ts` | B C D G | edit |
| `templates/media-game/kit/core/level.js`, genre starters, kit versions, `kit-hash.json` | E | edit |
| MCP recipe files + seven skill copies | H | edit |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` (shared, media-game, desktop); eslint on changed files; vitest on the
  touched suites incl. `kit-level.test.ts` and `kit-hash.test.ts`; the pin test; `scripts/skill-copies.test.mjs`;
  `node scripts/tracker-check.mjs`.
- [ ] **Gate — the built app, throwaway `--user-data-dir`**: a platformer — add a `door` type in the manifest via an
  agent (`game_entity_types_set`), place a switch and a door, link them with `L`, play (Phase 140 if landed) and the
  switch opens the door; delete the door and the link clears; raise a wall and the Problems panel flags the exit
  within a second; Save still saves. Shots under `/tmp/midnite-shots-p142/`.

## Not in this phase

- **Visual scripting / event graphs** (Unreal Blueprints, Godot VisualScript's successor plugins). Links plus typed
  fields cover the common level-design wiring; logic stays in code.
- **3D reachability** — needs the kit's nav-mesh in the validator; Phase 140 G exposes it.
- **Per-level type overrides** — types live in the manifest only (LDtk keeps defs per project, not per level).
- **Arrays of links** (one switch opening three doors) — one `link` field per target for now; Tiled's `object`
  property is single-valued, and a list would need a custom class type.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Schemas live in the manifest** (`midnite-game.json`), like LDtk's entity defs in the project file and Tiled's
   custom types in the project — one place an agent and the user both read.
2. **Links are Tiled `object` properties** — Tiled's own reference type, so a level stays a valid Tiled map and Tiled
   itself shows the link.
3. **Never coerce, never delete** — a value outside its schema stays and is flagged (Godot keeps unknown props;
   Unity keeps serialized data it cannot show). Data loss is worse than a warning.
4. **Never block Save** — Unity and Godot warn; a half-built level is normal.
5. **Delete clears inbound links** in the same undo step, preventing the most common dangling reference at the
   source rather than only flagging it.
6. **2D reachability by flood fill** with a simple jump model, the cheap check LDtk users run as a plugin; it is a
   warning, not truth.
