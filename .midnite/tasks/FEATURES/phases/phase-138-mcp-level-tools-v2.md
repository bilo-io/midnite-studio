# Phase 138 — MCP level tools v2

**Refined: x1** · 2026-11-14 · file map, contracts, MCP, testing, UI/UX

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

**Model:** every theme is a spec'd build for sonnet; no theme needs `Model: opus`.

Agents edit a level today only through Phase 132 Theme G's `game_level_get` / `game_level_set`: read the whole Tiled
JSON, rewrite it, commit it. That is a blind, whole-file swap: it cannot query, it does not validate gameplay, it
lands as a commit the user did not see happen, and while the user has unsaved edits open, the editor silently ignores
it (`level-editor.tsx` re-opens a scene only when `!edit.dirty`). This phase gives agents **targeted, validated,
visible** level editing, live in the open editor:

- **`game_level_query`** — objects by type, layer, name, id or region, in pixels or metres.
- **`game_entity_add` / `_update` / `_delete` / `_batch`** — typed operations, validated all-or-nothing, applied as
  **one undoable change set** in the open editor (or one commit when it is closed).
- **`game_level_select` / `game_level_frame`** — the agent highlights and frames what it changed.
- **`game_level_view`** — a PNG of the level from a camera pose or the plan.
- **`game_level_validate`** — deterministic problems (no spawn, duplicate ids, unknown types, missing models).

The open editor shows each agent change set in a review banner (Show · Undo · Keep), pulses the changed objects, and
leaves Save to the user.

> **Builds on.**
> - **Phase 132 Theme G's level tools** — `packages/shared/src/media-game-mcp.ts` (`GAME_MCP_TOOL_IDS`,
>   `GAME_MCP_READ_TOOL_IDS`, `GameToolTargetSchema`, `GameLevelGetInputSchema`, `GAMES_OFF_MESSAGE`,
>   `GameContentOutputSchema`), `packages/shared/src/mcp.ts` (`McpToolId`, `MCP_TOOLS`),
>   `packages/features/media-game/main/games/game-mcp.ts` (`createGameMcpTools`, `GameMcpTools`),
>   `packages/desktop/src/main/mcp/game-tools.ts` (`allowed()` consent wrapper), `packages/desktop/src/main/mcp/dispatch.ts`.
> - **The level service** — `packages/features/media-game/main/games/game-levels.ts` (`createGameLevels`:
>   `levelGet`, `levelSet` through `writeQueue` + a pathspec commit, then `EVENT_CHANNELS.gamesChanged`), wired in
>   `game-service.ts` with `GameServiceDeps.send`.
> - **The level format** — `packages/shared/src/game-level.ts` (`parseGameLevel`, `levelProperties`,
>   `metresPerTile`, `levelEntityToWorld`, `GAME_LEVEL_ENTITY_TYPES_2D` / `_3D`, `GAME_LEVEL_PROPS`).
> - **The editor** — `level-edit-model.ts` (`EditState`, `commit()`, `addObject`, `setObjectField`, `setProperty`,
>   `deleteObject`, `undo`), `level-store.ts` (`useLevelStore`, `OpenLevel`), `level-editor.tsx`,
>   `3d/level-3d-view.tsx` (`Level3dHandle`), `3d/level-scene.tsx`, `level-plan-draw.ts` (`drawPlan`).
> - **The main → renderer request/reply precedent** — `packages/features/companion/main/ui-bridge.ts`
>   (`requestUiAction`: a pending map keyed by a uuid, a 5 s timeout, `failure()` on no window or timeout). This phase
>   copies the pattern into the games feature (a feature never imports another feature).
> - **The skill** — `midnite-media-game-build`, seven byte-identical copies (see Theme I), held by
>   `scripts/skill-copies.test.mjs` and `packages/features/media-game/main/games/skills.test.ts`.
>
> **Depends on:** Phase 132 (C, G) and Phase 136 — landed. **Independent of Phase 137**; where Theme G sets a
> selection it uses 137 Theme A's multi-selection when present (rule stated in G). **Unlocks:** every later level
> phase extends this phase's `LevelOp` union and validator instead of adding parallel write paths (139 instances and
> scatter, 141 terrain snap, 142 links and rules, 143 tiles, 144 map properties, 145 history).
>
> **Scope guardrails.** No eslint exception; nothing crosses a feature boundary. Every IPC answer is a `GitOpResult`
> envelope; no handler throws across the boundary. Writes go through the existing `levelSet` (write queue +
> pathspec commit). macOS only, `react-icons` only, every new test a vitest unless it names its browser capability.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — Level operations.** ◻ `packages/shared/src/game-level-ops.ts`: zod `LevelOpSchema` (`add`, `update`,
`delete`) and a pure, all-or-nothing `applyLevelOps(level, ops, ctx)` used by main (closed editor) and the renderer
(open editor) alike, with pixel or metre coordinates; plus `queryLevel`.

**Theme B — The validator core.** ◻ `packages/shared/src/game-level-validate.ts`: `validateLevel(level, ctx)` →
deterministically ordered `LevelIssue`s with stable rule ids (`level/no-spawn`, `level/duplicate-id`, …), the
registry Phase 142 extends.

**Theme C — The editor bridge.** ◻ A main → renderer request/reply over `mstudio:games:level-editor-request` (event)
and `mstudio:games:level-editor-reply` (one-way send), modelled on Companion's `ui-bridge.ts`: `snapshot`, `apply`,
`select`, `frame`, `view`. A request for a scene the editor does not show answers `{ handled: false }`.

**Theme D — Query and validate tools.** ◻ `game_level_query` and `game_level_validate`, reading the editor's unsaved
level when it is open (`source: 'editor'`) and the file otherwise.

**Theme E — Entity write tools.** ◻ `game_entity_add`, `game_entity_update`, `game_entity_delete` and
`game_entity_batch`: one validated change set, applied live in the open editor or committed as one file write when
it is closed; `save: true` also saves.

**Theme F — The agent change set in the editor.** ◻ The renderer applies an `apply` request as one undo step, records
an `AgentChangeSet`, shows a gradient-bordered review banner (Show · Undo · Keep) and pulses the changed objects in
both views (a static ring under reduced motion).

**Theme G — Select and frame tools.** ◻ `game_level_select` and `game_level_frame`: the agent points at objects in the
open editor.

**Theme H — The view tool.** ◻ `game_level_view`: a PNG of the open level from a camera pose, a preset or the plan,
captured by the renderer through the bridge and returned as an MCP image block.

**Theme I — Skill and agent prompt.** ◻ `midnite-media-game-build`'s `## Levels` teaches query → batch → select →
view → validate → save; the game agent's system prompt and `ACTION_LABELS` name the new tools.

## Build order

1. **A** and **B** (pure, shared) in either order.
2. **C** (the bridge both halves need).
3. **D** (reads; proves the recipe and the `snapshot` round trip), then **E** and **F** together (main and renderer
   halves of `apply`), then **G** and **H**.
4. **I** last (the skill names only ids that exist — `skills.test.ts` enforces it).

## The tool recipe (every new `game_*` tool follows it)

Adding a `game_*` tool touches these places, in this order; each theme that adds a tool lists only its tool ids and
schemas and says "the tool recipe".

1. `packages/shared/src/media-game-mcp.ts` — the id in `GAME_MCP_TOOL_IDS`; a read tool also in
   `GAME_MCP_READ_TOOL_IDS`; its `…InputSchema` (extending `GameToolTargetSchema`) and `…OutputSchema`.
2. `packages/shared/src/mcp.ts` — the id in the `McpToolId` union and an `MCP_TOOLS` entry `{ id, title, description,
   input, output, readOnly }`. The description starts with a verb, is ≤ 220 characters (`mcp.test.ts` asserts both)
   and ends "refused unless its Settings switch is on" for a write.
3. `packages/features/media-game/main/games/game-mcp.ts` — the member in `GameMcpTools` and its implementation in
   `createGameMcpTools`; it throws nothing, returning or throwing only through the existing `McpToolError` paths the
   other tools use.
4. `packages/desktop/src/main/mcp/game-tools.ts` — the wrapper; a write (and a UI-steering tool) calls `allowed()`
   first, which answers `GAMES_OFF_MESSAGE` while Settings ▸ MCP ▸ "Let agents run and edit games"
   (`McpSettings.allowGames`) is off.
5. `packages/desktop/src/main/mcp/dispatch.ts` — the map entry.
6. `packages/features/media-game/main/games/game-agent.ts` — an `ACTION_LABELS` entry (past tense, ≤ 4 words).
7. Regenerate the pin: `UPDATE_MCP_PIN=1 pnpm --filter @midnite/studio-desktop exec vitest run
   src/main/mcp/tool-manifest-pin.test.ts`, commit `packages/desktop/src/main/mcp/tool-manifest.pin.json`.
8. Tests: the schema in `packages/shared/src/media-game-mcp.test.ts`, the registry in `packages/shared/src/mcp.test.ts`
   (runs as-is), the implementation in `packages/desktop/src/main/games/game-mcp.test.ts`, the consent wrapper's
   refusal in the same file.

Ownership needs no edit: `packages/features/media-game/manifest.ts` declares `mcpTools: [...GAME_MCP_TOOL_IDS]`, so
`mcp-tool-owners.ts` lists a new id under Gamer and Studio automatically, and the private game-agent server
(`createGameAgentDispatch`, `GAME_AGENT_TOOL_IDS`) gets it too.

## Deliverables

### A — Level operations (M)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level-ops.ts` | net-new |
| `packages/shared/src/game-level-ops.test.ts` | net-new |
| `packages/shared/src/index.ts` | edit: export the module |

**Contract.**

```ts
export const LEVEL_OPS_MAX = 500;
export const LevelPropertyValueSchema = z.union([z.string().max(4000), z.number().finite(), z.boolean()]);
export const LevelEntityFieldsSchema = z.object({
  type: z.string().min(1).max(64),
  name: z.string().max(200).optional(),
  x: z.number().finite(), y: z.number().finite(),
  width: z.number().finite().nonnegative().optional(), height: z.number().finite().nonnegative().optional(),
  rotation: z.number().finite().optional(),
  point: z.boolean().optional(),
  polyline: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).max(1000).optional(),
  properties: z.record(z.string().min(1).max(64), LevelPropertyValueSchema).optional(),
});
export const LevelOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), entity: LevelEntityFieldsSchema, layer: z.union([z.number().int(), z.string().min(1)]).optional(), ref: z.string().min(1).max(64).optional() }),
  z.object({ op: z.literal('update'), id: z.number().int().positive(), set: LevelEntityFieldsSchema.partial().default({}), unset: z.array(z.string()).max(64).optional() }),
  z.object({ op: z.literal('delete'), id: z.number().int().positive() }),
]);
export type LevelOp = z.infer<typeof LevelOpSchema>;
export type LevelOpsContext = { unit: 'px' | 'm'; entityTypes: readonly string[] };
export type LevelOpError = { index: number; op: LevelOp['op']; message: string };
export type LevelOpsResult =
  | { ok: true; level: Record<string, unknown>; added: number[]; updated: number[]; deleted: number[]; refs: Record<string, number> }
  | { ok: false; errors: LevelOpError[] };
export function applyLevelOps(level: unknown, ops: readonly LevelOp[], ctx: LevelOpsContext): LevelOpsResult;
export function levelEntityTypes(level: unknown): readonly string[]; // GAME_LEVEL_ENTITY_TYPES_3D for a 3D level, _2D otherwise

export const LevelQuerySchema = z.object({
  types: z.array(z.string()).max(32).optional(),
  layer: z.union([z.number().int(), z.string()]).optional(),
  ids: z.array(z.number().int()).max(1000).optional(),
  name: z.string().max(200).optional(),                  // case-insensitive substring
  region: z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }).optional(), // centre inside
  unit: z.enum(['px', 'm']).default('px'),
  limit: z.number().int().min(1).max(1000).default(200),
});
export type LevelObjectSummary = { id: number; layerId: number; layer: string; type: string; name: string; x: number; y: number;
  width?: number; height?: number; rotation?: number; point?: boolean; properties: Record<string, string | number | boolean>;
  world?: { x: number; y: number; z: number } };   // metres, 3D levels only (levelEntityToWorld)
export function queryLevel(level: unknown, query: z.infer<typeof LevelQuerySchema>): { total: number; truncated: boolean; objects: LevelObjectSummary[] };
```

**Rules.**

- **All or nothing.** Every op is validated against the level as it stands after the previous ops; the first failing
  ops are collected (up to 20 errors) and `ok: false` returns with the input level untouched. A transaction is a
  transaction: half a batch is never applied (Unity's and Godot's undo groups, a database transaction).
- `add` goes to the named layer (id or name), else the first `objectgroup`; a tile layer target is an error. A new id
  is `max(nextobjectid, max id + 1)`; `nextobjectid` advances. `ref` is a caller label: `refs[ref]` in the result
  gives the new id, so an agent can name what it made in its next call (ops inside one batch address existing
  objects by numeric id only).
- `type` must be in `ctx.entityTypes` (Phase 142 widens this list from the manifest), else an error naming the
  allowed types.
- `update.set.properties` merges by name; `unset` removes properties by name. A property keeps its declared Tiled
  `type` when it exists; a new one takes `bool` for a boolean, `int` for an integer, `float` for another number,
  `string` otherwise (Tiled's own inference).
- `unit: 'm'` converts `x`, `y`, `width`, `height` and polyline points from metres with `metresPerTile` and the tile
  size (the inverse of `levelEntityToWorld`'s plan mapping), so an agent can think in world metres in a 3D level.
- Positions outside the map by more than one map's size are an error ("x = 99999 is outside the level"); the
  validator (B) warns for anything outside the map at all.
- The input level is never mutated (structural sharing; the test deep-freezes it).

**Acceptance.**

- [ ] A1. `add` of a `coin` to a 2D platformer fixture returns a fresh id, `added: [id]`, and leaves the input deep-equal
  to before (frozen input does not throw).
- [ ] A2. A batch `[add ok, update id 9999]` returns `ok: false` with `errors[0].index === 1` and no level.
- [ ] A3. `update` merges `properties`, keeps an existing property's declared type, and `unset` removes one.
- [ ] A4. `delete` of an unknown id is an error; of a known id removes exactly that object.
- [ ] A5. `unit: 'm'` with `metresPerTile = 2` and 32 px tiles turns `x: 10` into `x: 160`.
- [ ] A6. An unknown `type` errors with a message listing `ctx.entityTypes`.
- [ ] A7. `queryLevel` filters by types, layer, name and region (centre inside), truncates at `limit`, reports `total`,
  and adds `world` only for a 3D level.
- [ ] A8. `LevelOpSchema.parse` rejects `NaN`, `Infinity`, a 65-character type and a 1,001-point polyline.

**Done when** A1–A8 pass under `pnpm -C packages/shared exec vitest run src/game-level-ops.test.ts`.

### B — The validator core (S)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level-validate.ts` | net-new |
| `packages/shared/src/game-level-validate.test.ts` | net-new |
| `packages/shared/src/index.ts` | edit: export |

**Contract.**

```ts
export type LevelIssueSeverity = 'error' | 'warning' | 'info';
export type LevelIssue = { rule: LevelRuleId; severity: LevelIssueSeverity; message: string; objectId?: number; layerId?: number };
export type LevelRuleId = 'level/parse' | 'level/no-spawn' | 'level/duplicate-id' | 'level/unknown-type' | 'level/out-of-bounds' | 'level/bad-size' | 'level/missing-model';
export type LevelValidateContext = { entityTypes: readonly string[]; modelAssets: readonly string[] | null }; // null = not checked
export type LevelRule = { id: LevelRuleId; run: (level: GameLevel, ctx: LevelValidateContext) => LevelIssue[] };
export const LEVEL_RULES: readonly LevelRule[];           // Phase 142 appends to this array (and widens LevelRuleId)
export function validateLevel(level: unknown, ctx: LevelValidateContext): LevelIssue[];
export const LEVEL_ISSUES_MAX = 500;
```

- `level/parse` wraps `parseGameLevel` issues (error) and stops further rules when the level does not parse.
- `level/no-spawn` (error): no object of type `spawn`. `level/duplicate-id` (error). `level/unknown-type` (warning).
  `level/out-of-bounds` (warning): the object's centre is outside `0..width*tilewidth` × `0..height*tileheight`.
  `level/bad-size` (error): negative or non-finite size. `level/missing-model` (error, 3D only, skipped when
  `modelAssets` is `null`): a `model` property naming no `model` asset.
- **Deterministic order:** severity (error, warning, info), then rule id, then `objectId` ascending, then message —
  the same level always yields the same list (a stable diff for an agent and a test).
- Messages are one plain sentence naming the object: "Object 12 (coin) is outside the level."

**Acceptance.**

- [ ] B1. A fixture with no spawn, two objects sharing id 4, and a `dragon` type yields exactly three issues in the
  documented order.
- [ ] B2. `validateLevel` on a shuffled copy of the same level returns an identical array.
- [ ] B3. `modelAssets: null` skips `level/missing-model`; `['crate']` flags a `model: 'barrel'` prop.
- [ ] B4. Output is capped at `LEVEL_ISSUES_MAX`.

**Done when** B1–B4 pass.

### C — The editor bridge (M)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/ipc/channels.ts` | edit: `CHANNELS.gamesLevelEditorReply = 'mstudio:games:level-editor-reply'`, `CHANNELS.gamesLevelEditorOpen = 'mstudio:games:level-editor-open'`, `EVENT_CHANNELS.gamesLevelEditorRequest = 'mstudio:games:level-editor-request'` |
| `packages/shared/src/ipc/schemas.ts` | edit: the request / reply schemas below |
| `packages/shared/src/ipc/bridge.ts` | edit: `games.levels.onEditorRequest(handler)`, `games.levels.editorReply(payload)`, `games.levels.editorOpen(scene \| null)` |
| `packages/desktop/src/preload/index.ts` | edit: implement both (the `games` block, ~L717) |
| `packages/features/media-game/manifest.ts` | edit: the reply and open channels in `ipc` |
| `packages/features/media-game/main/games/level-editor-bridge.ts` | net-new |
| `packages/features/media-game/main/games/level-editor-bridge.test.ts` | net-new |
| `packages/features/media-game/main/games/game-service.ts` | edit: `levelEditor: createLevelEditorBridge({ send: deps.send })` on the service |
| `packages/features/media-game/main/index.ts` | edit: `send(CHANNELS.gamesLevelEditorReply, schemas.GamesLevelEditorReply, (r) => service.levelEditor.resolve(r.id, r.result), warnInvalid)` |
| `packages/features/media-game/renderer/level/use-level-editor-bridge.ts` | net-new: the renderer half (`snapshot` here; `apply` in F, `select`/`frame` in G, `view` in H) |
| `packages/features/media-game/renderer/level/use-level-editor-bridge.test.ts` | net-new |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: mount `useLevelEditorBridge(gameId)` |
| `packages/app/test-support/mock-bridge.ts` | edit: the two new bridge members |

**Contract.**

```ts
// schemas.ts
export const LevelEditorRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('snapshot'), gameId: z.string(), scene: GameSceneNameSchema }),
  z.object({ kind: z.literal('apply'), gameId: z.string(), scene: GameSceneNameSchema, ops: z.array(LevelOpSchema).min(1).max(LEVEL_OPS_MAX), unit: z.enum(['px', 'm']), label: z.string().max(80), select: z.boolean() }),
  z.object({ kind: z.literal('select'), gameId: z.string(), scene: GameSceneNameSchema, ids: z.array(z.number().int()).max(1000), frame: z.boolean() }),
  z.object({ kind: z.literal('frame'), gameId: z.string(), scene: GameSceneNameSchema, ids: z.array(z.number().int()).max(1000).optional(), region: LevelQuerySchema.shape.region }),
  z.object({ kind: z.literal('view'), gameId: z.string(), scene: GameSceneNameSchema, view: z.enum(['plan', '3d', 'current']), camera: LevelViewCameraSchema.optional(), preset: z.enum(['top', 'iso', 'selection', 'current']), width: z.number().int(), height: z.number().int() }),
]);
export const GamesLevelEditorRequestPayload = z.object({ id: z.string().uuid(), request: LevelEditorRequestSchema });
export const LevelEditorResultSchema = z.discriminatedUnion('handled', [
  z.object({ handled: z.literal(false), reason: z.enum(['not-open', 'read-only', 'unreadable']) }),
  z.object({ handled: z.literal(true), value: z.unknown() }),   // per kind, parsed by the caller with its own schema
]);
export const GamesLevelEditorReply = z.object({ id: z.string().uuid(), result: z.union([LevelEditorResultSchema, GitOpFailureSchema]) });

// level-editor-bridge.ts (main)
export const LEVEL_EDITOR_TIMEOUT_MS = 5_000;          // `view` passes 15_000
export type LevelEditorBridge = {
  request(req: LevelEditorRequest, opts?: { timeoutMs?: number }): Promise<GitOpResult<LevelEditorResult>>; // never rejects
  resolve(id: string, result: LevelEditorResult | GitOpFailure): void;
};
export function createLevelEditorBridge(deps: { send: (channel: string, payload: unknown) => void }): LevelEditorBridge;
```

- Pending map keyed by `randomUUID()`, one timer per request; timeout resolves `failure('the level editor did not
  answer')`; a late reply for an unknown id is dropped. Exactly Companion's `ui-bridge.ts` behaviour, re-written in
  the games feature (no cross-feature import).
- The renderer answers in `useLevelEditorBridge(gameId)`, mounted by the one Level editor. It answers a request only
  when `useLevelStore().byGame[gameId]?.scene === request.scene`; otherwise `{ handled: false, reason: 'not-open' }`.
  **Presence, so a closed editor costs no timeout:** the hook also sends one-way
  `mstudio:games:level-editor-open` (`CHANNELS.gamesLevelEditorOpen`, payload `{ gameId, scene } | null`) on mount,
  on scene change and on unmount; the bridge keeps `open: { gameId; scene } | null` and answers a request for any
  other scene `{ handled: false, reason: 'not-open' }` at once, without a round trip. A timeout (renderer hung) is
  still treated like `not-open` by every caller.
- `snapshot` answers `{ level: serialise(edit), dirty: edit.dirty }`.
- Read-only (`OpenLevel.unreadable` or the editor's read-only banner state) answers `handled: false, reason:
  'read-only'` for `apply`, `handled: true` for every read kind.

**Acceptance.**

- [ ] C1. `request` resolves with the renderer's result when `resolve(id, …)` is called, and with
  `failure('the level editor did not answer')` after the timeout (fake timers).
- [ ] C2. A `resolve` for an unknown id is a no-op; a second `resolve` for the same id is a no-op.
- [ ] C7. With `open` set to another scene (or `null`), `request` answers `not-open` without calling `send`.
- [ ] C3. The renderer hook answers `snapshot` for the open scene with the serialised edit level and `dirty`, and
  `not-open` for another scene.
- [ ] C4. `apply` on a read-only level answers `handled: false, reason: 'read-only'`.
- [ ] C5. `GamesLevelEditorReply` rejects a non-uuid id; main's one-way handler logs and drops it (`warnInvalid`).
- [ ] C6. `packages/app/test-support/mock-bridge.ts` exposes `games.levels.onEditorRequest` and `editorReply`, and the
  existing app suites still build against it.

**Done when** C1–C6 pass and `scripts/layer-boundaries.test.mjs` is green (no import from `features/companion`).

### D — Query and validate tools (M)

**Tools** (the tool recipe): `game_level_query` (read), `game_level_validate` (read).

```ts
export const GameLevelQueryInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema }).merge(LevelQuerySchema);
export const GameLevelQueryOutputSchema = z.object({ source: z.enum(['editor', 'file']), dirty: z.boolean(), total: z.number().int(), truncated: z.boolean(), objects: z.array(LevelObjectSummarySchema) });
export const GameLevelValidateInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema });
export const GameLevelValidateOutputSchema = z.object({ source: z.enum(['editor', 'file']), counts: z.object({ error: z.number(), warning: z.number(), info: z.number() }), issues: z.array(LevelIssueSchema) });
```

**Files.** The recipe's eight places, plus `packages/features/media-game/main/games/game-level-source.ts` (net-new):

```ts
// The level an agent tool should see: the open editor's (unsaved edits included), else the committed file.
export async function readLevelForTool(deps: { levels: GameLevels; levelEditor: LevelEditorBridge }, gameId: string, scene: string): Promise<GitOpResult<{ level: unknown; source: 'editor' | 'file'; dirty: boolean }>>;
```

- `readLevelForTool` asks the bridge for `snapshot` (5 s); `handled: true` → editor; `handled: false`, a timeout or
  no window → `levels.get` (file). A failing file read returns its failure.
- `modelAssets` for validation = the manifest's `assets` of kind `model` by `name` (`readManifest` already in
  `GameLevelsDeps`); `entityTypes` = `levelEntityTypes(level)`.
- Descriptions (≤ 220 chars):
  - `game_level_query`: "Finds objects in a level by type, layer, name, id or region, in pixels or metres, including unsaved edits open in
    the editor — use instead of reading the whole level."
  - `game_level_validate`: "Checks a level for problems (no spawn, duplicate ids, unknown types, missing models), unsaved edits included —
    run after editing and before saving."

**Acceptance.**

- [ ] D1. With no editor open (presence `null`), `game_level_query` reads the file and reports `source: 'file'`.
- [ ] D2. With a mocked bridge answering `snapshot`, the query sees an unsaved object and reports `source: 'editor',
  dirty: true`.
- [ ] D3. `game_level_validate` returns `counts` equal to the per-severity tallies of `issues`.
- [ ] D4. Both tools answer while `allowGames` is off (they are reads).
- [ ] D5. The pin file lists both ids; `mcp.test.ts`'s description rules pass.

**Done when** D1–D5 pass in `packages/desktop/src/main/games/game-mcp.test.ts` and `packages/shared/src/media-game-mcp.test.ts`.

### E — Entity write tools (M)

**Tools** (the tool recipe, all writes, all behind `allowed()`): `game_entity_batch`, `game_entity_add`,
`game_entity_update`, `game_entity_delete`. The last three are sugar that build `LevelOp[]` and call the batch path.

```ts
const LevelWriteOptions = { unit: z.enum(['px', 'm']).default('px'), label: z.string().min(1).max(80).optional(), save: z.boolean().optional(), select: z.boolean().default(true) };
export const GameEntityBatchInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema, ops: z.array(LevelOpSchema).min(1).max(LEVEL_OPS_MAX), ...LevelWriteOptions });
export const GameEntityAddInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema, entities: z.array(LevelEntityFieldsSchema).min(1).max(200), layer: z.union([z.number().int(), z.string()]).optional(), ...LevelWriteOptions });
export const GameEntityUpdateInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema, updates: z.array(z.object({ id: z.number().int().positive(), set: LevelEntityFieldsSchema.partial().default({}), unset: z.array(z.string()).max(64).optional() })).min(1).max(LEVEL_OPS_MAX), ...LevelWriteOptions });
export const GameEntityDeleteInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema, ids: z.array(z.number().int().positive()).min(1).max(LEVEL_OPS_MAX), ...LevelWriteOptions });
export const GameEntityWriteOutputSchema = z.object({
  applied: z.enum(['editor', 'file']), changeSetId: z.string().nullable(),
  added: z.array(z.number()), updated: z.array(z.number()), deleted: z.array(z.number()), refs: z.record(z.string(), z.number()),
  saved: z.boolean(), sha: z.string().nullable(), issues: z.array(LevelIssueSchema).max(50),
});
```

**Files.** The recipe's places, plus `packages/features/media-game/main/games/level-agent-writes.ts` (net-new) and its
test `level-agent-writes.test.ts`:

```ts
export async function writeLevelOps(deps: { levels: GameLevels; levelEditor: LevelEditorBridge; readManifest: … }, req: { gameId: string; scene: string; ops: LevelOp[]; unit: 'px' | 'm'; label: string; save: boolean; select: boolean }): Promise<GitOpResult<GameEntityWriteOutput>>;
```

**Rules.**

1. Ask the bridge `apply` (5 s). `handled: true` → the renderer applied the change set as one undo step (Theme F) and
   answers `{ changeSetId, added, updated, deleted, refs }`; if `save`, main then asks `snapshot` and writes it with
   `levels.set` (one commit, message from `levelSet`), and the renderer marks it saved on the `gamesChanged` reload
   path (unchanged JSON → `markSaved`; see F5).
2. `handled: false, reason: 'read-only'` → `failure('The level is open read-only in the editor.')`.
3. Not open / timeout / no window → **file path**: `levels.get`, `applyLevelOps`, then `levels.set` — one commit
   whose message is `levelSet`'s `Edit level <scene>` (unchanged), `applied: 'file'`, `saved: true`, `changeSetId:
   null`. `save` is ignored (a file write is a save).
4. Errors from `applyLevelOps` → `failure` with the joined messages: "op 2 (update): no object with id 41; op 5 (add):
   type 'dragon' is not one of spawn, exit, …".
5. `issues` = `validateLevel` of the result, errors and warnings only, first 50.
6. Default `label`: "Add 3 objects", "Update 2 objects", "Delete 1 object", or "Edit 6 objects" for a mixed batch.
7. **The private game-agent server** (`createGameAgentDispatch`) defaults `save` to `true` (an agent run's passes are
   commits and its Undo is commit-based); the global server defaults `save` to `false` (the user reviews and saves).
   The default is applied in `createGameAgentDispatch`, not in the schema.

**Acceptance.**

- [ ] E1. Editor open (mock bridge answers `apply`): `applied: 'editor'`, no `levels.set` call, `saved: false`.
- [ ] E2. Editor open with `save: true`: one `levels.set` call with the snapshot level; `saved: true`, `sha` set.
- [ ] E3. Editor closed: one `levels.set` call, `applied: 'file'`, `saved: true`.
- [ ] E4. An invalid batch writes nothing anywhere and the failure lists each bad op's index.
- [ ] E5. `allowGames` off → each of the four tools answers `[refused] Game running and editing is off — …`.
- [ ] E6. Through `createGameAgentDispatch`, a batch with no `save` saves.
- [ ] E7. `game_entity_add` with 2 entities equals a batch of 2 `add` ops (same output shape).

**Done when** E1–E7 pass.

### F — The agent change set in the editor (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/level-edit-model.ts` | edit: `applyAgentOps(state, ops, unit, entityTypes)` — one `commit()` of `applyLevelOps`'s level |
| `packages/features/media-game/renderer/level/level-store.ts` | edit: `OpenLevel.agentChanges: AgentChangeSet[]` (newest first, max 10), `recordAgentChange`, `dismissAgentChange` |
| `packages/features/media-game/renderer/level/use-level-editor-bridge.ts` | edit: handle `apply` |
| `packages/features/media-game/renderer/level/agent-change-banner.tsx` | net-new |
| `packages/features/media-game/renderer/level/agent-change-banner.test.tsx` | net-new |
| `packages/features/media-game/renderer/level/level-plan-draw.ts`, `3d/level-scene.tsx` | edit: the pulse ring for `highlight` ids |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: render the banner under the toolbar; reload rule (F5) |

**Contract.**

```ts
export type AgentChangeSet = { id: string; label: string; added: number[]; updated: number[]; deleted: number[]; at: number; undoDepth: number /* past.length right after the commit */ };
export function applyAgentOps(state: EditState, ops: readonly LevelOp[], ctx: LevelOpsContext): { state: EditState; result: LevelOpsResult };
```

**Rules.**

- One `apply` = one `commit()` = one undo step; the selection becomes the added + updated objects when `select`
  (via 137 A's `addSelected` when present, else `select` of the last one).
- **The banner** (`role="status"`, `aria-live="polite"`) sits between the toolbar and the canvas, full width, `h-9`,
  class `gradient-border gradient-border--always rounded-md bg-background mx-2 mt-2 flex items-center gap-2 px-3
  text-xs` (the Games Run button's gradient border, `packages/features/media-game/renderer/game-runner-toolbar.tsx`).
  Content: `LuBot` icon, the label in `font-medium` with the `.pill-shimmer` class for its first 1.5 s
  (`packages/app/src/styles.css`; already paused when the window is blurred and already covered by the motion guards
  in `packages/app/src/styles-motion-guards.ts`, so no new keyframes), then "3 added · 2 changed · 1 removed", then
  three buttons: **Show** (`LuFocus`; selects and frames the change set's live ids), **Undo** (`LuUndo2`; enabled only
  while `edit.past.length === undoDepth`, i.e. nothing was done after it; label when disabled "Undo is past other
  edits — use Mod+Z"), **Keep** (`LuCheck`; dismisses). Several sets stack as "+2 more" on the right that opens a
  `Popover` (`chrome.tsx`) listing them.
- **Pulse**: the change set's ids get a highlight ring for 2.4 s — plan: an expanding, fading circle drawn per frame in
  `drawPlan` from `highlight: { ids: number[]; startedAt: number }`; 3D: an `Edges` outline in `hsl(var(--primary))`
  whose opacity eases. **Reduced motion** (`document.documentElement.dataset.motion === 'reduced'`, or
  `matchMedia('(prefers-reduced-motion: reduce)')` without `data-motion="full"` — the app's convention): a static
  2 px ring for the same 2.4 s, no animation frames requested.
- **Reload rule (fixes the silent-ignore):** on `gamesChanged { reason: 'level' }` for the open scene, if the file's
  JSON deep-equals `serialise(edit)` → `markSaved` (the agent saved what is on screen); if the editor is clean →
  reload as today; if dirty and different → a `useNotify` notice "The level changed on disk while you have unsaved
  edits — Save keeps yours, Reload takes the file" with a Reload action in the banner area.
- A failed `apply` (validation errors) changes nothing and shows nothing; the agent gets the errors.

**Acceptance.**

- [ ] F1. `applyAgentOps` with 3 ops grows `past` by exactly 1; `undo` reverts all three.
- [ ] F2. An `apply` request renders the banner with the label and the counts; Keep removes it.
- [ ] F3. Undo is enabled right after the change and disabled after a further user edit.
- [ ] F4. Under `data-motion="reduced"`, the plan draw for a highlight issues no `requestAnimationFrame` (spy) and
  strokes a static ring.
- [ ] F5. After a `gamesChanged` whose file equals the open level, `dirty` becomes false without a reload.
- [ ] F6. Dirty + different file → the notice appears and the edit state is unchanged.

**Done when** F1–F6 pass.

### G — Select and frame tools (S)

**Tools** (the tool recipe; UI-steering, so behind `allowed()`, `readOnly: true` in `MCP_TOOLS` because they change
no data): `game_level_select`, `game_level_frame`.

```ts
export const GameLevelSelectInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema, ids: z.array(z.number().int()).max(1000), frame: z.boolean().default(true) });
export const GameLevelSelectOutputSchema = z.object({ selected: z.array(z.number()), missing: z.array(z.number()) });
export const GameLevelFrameInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema, ids: z.array(z.number().int()).max(1000).optional(), region: LevelQuerySchema.shape.region });
export const GameLevelFrameOutputSchema = z.object({ framed: z.literal(true), view: z.enum(['plan', '3d']) });
```

- Renderer `select`: resolves ids in any object layer; with 137 A landed sets `selected` to all found (primary = last)
  via `addSelected` after `selectOnly(null)`; without it, `select`s the last found id. Answers `{ selected, missing }`.
  `frame: true` frames them (plan: fit their bounds with 10% margin at zoom ≤ 4; 3D: the existing F framing over their
  AABB).
- `frame` with neither ids nor region frames the whole level.
- Not open → `failure('Open <scene> in Media ▸ Games ▸ Level editor first.')`. No window/timeout → the same message.

**Acceptance.**

- [ ] G1. `select` of `[3, 999]` answers `selected: [3], missing: [999]` and the inspector shows object 3.
- [ ] G2. `frame` of a region changes the plan `View`'s centre to the region's centre (pure `frameView` helper test).
- [ ] G3. Both refuse with `GAMES_OFF_MESSAGE` while `allowGames` is off and fail with the "Open … first" message
  when the scene is not open.

**Done when** G1–G3 pass.

### H — The view tool (M)

**Tool** (the tool recipe; read, no `allowed()`): `game_level_view`.

```ts
export const LevelViewCameraSchema = z.object({ position: z.tuple([z.number(), z.number(), z.number()]), target: z.tuple([z.number(), z.number(), z.number()]), fov: z.number().min(20).max(90).default(50) }); // world metres
export const GameLevelViewInputSchema = GameToolTargetSchema.extend({
  scene: GameSceneNameSchema, view: z.enum(['plan', '3d', 'current']).default('current'),
  camera: LevelViewCameraSchema.optional(), preset: z.enum(['top', 'iso', 'selection', 'current']).default('current'),
  width: z.number().int().min(256).max(1600).default(960), height: z.number().int().min(256).max(1200).default(600),
});
// output: GameContentOutputSchema — [{ type: 'text', text: JSON.stringify({ view, camera, objects: visibleCount }) }, { type: 'image', data, mimeType: 'image/png' }]
```

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/3d/level-capture.ts` | net-new: `captureScene(gl, scene, camera, w, h): Promise<string>` (base64 PNG) |
| `packages/features/media-game/renderer/level/level-plan-capture.ts` | net-new: `capturePlan(level, overlay, region, w, h): Promise<string>` over an `OffscreenCanvas` and `drawPlan` |
| `packages/features/media-game/renderer/level/3d/level-3d-view.tsx` | edit: `Level3dHandle.capture(req)` |
| `packages/features/media-game/renderer/level/use-level-editor-bridge.ts` | edit: handle `view` |
| tests | `level-plan-capture.test.ts` (the region math and the canvas calls with a mocked 2D context) |

**Rules.**

- `view: 'plan'` (always for a 2D level) → `capturePlan` of the whole map, or of the selection's bounds for preset
  `selection`. `view: '3d'` on a 3D level whose editor shows Floorplan → switch the view to 3D (`setMode`), wait for
  the handle (≤ 3 s), capture, **stay in 3D** (the agent is showing the user something). `current` → whatever is on
  screen.
- 3D capture renders once into a `WebGLRenderTarget` with a temporary `PerspectiveCamera` (pose from `camera`, or the
  preset: `top` = straight down over the level bounds, `iso` = 45° yaw / 35° pitch fitting the bounds, `selection` =
  F-framing of the selection), reads the pixels, flips Y, encodes PNG via an `OffscreenCanvas` and
  `convertToBlob({ type: 'image/png' })`. The live camera is never moved. The Optimisation step's culling still
  applies (the image shows what the user would see).
- The main side passes `timeoutMs: 15_000` and caps the PNG at 3 MB (`GAME_SCREENSHOT_BYTES_MAX`, `game-mcp.ts`),
  halving width and height until it fits.
- Not open → `failure('Open <scene> in Media ▸ Games ▸ Level editor first.')`. A capture error → `failure` with its
  message; never an exception.

**Acceptance.**

- [ ] H1. `capturePlan` for preset `selection` computes the selection bounds + 10% margin as its source rectangle.
- [ ] H2. The tool returns a `_content` array of a text block then an `image/png` block (mock bridge returns a 1×1
  PNG).
- [ ] H3. A 3D request against a Floorplan editor calls `setMode(gameId, '3d')` before capturing (renderer test with a
  stub handle).
- [ ] H4. An over-cap PNG is retried at half size (main test with a stub bridge that returns 4 MB then 1 MB).

**Done when** H1–H4 pass and the Verification gate's `game_level_view` call returns a recognisable image.

### I — Skill and agent prompt (S)

**Files.**

| File | Change |
|---|---|
| `.claude/skills/midnite-media-game-build/SKILL.md` | edit `## Levels` |
| `.agents/skills/midnite-media-game-build/SKILL.md` | byte-identical copy |
| `.codex/skills/midnite-media-game-build/SKILL.md` | byte-identical copy |
| `templates/midnite/.claude/skills/midnite-media-game-build/SKILL.md` | byte-identical copy |
| `templates/midnite/.agents/skills/midnite-media-game-build/SKILL.md` | byte-identical copy |
| `templates/midnite/.codex/skills/midnite-media-game-build/SKILL.md` | byte-identical copy |
| `templates/media-game/skills/midnite-media-game-build/SKILL.md` | byte-identical copy (seeded into new games) |
| `packages/features/media-game/main/games/game-agent.ts` | edit: the system-prompt sentence (L265) |

- `## Levels` gains a subsection **"Editing a level with the user"**, ≤ 25 lines: (1) `game_level_query` for what is
  there (unit `m` in 3D); (2) `game_entity_batch` for every change — one batch per intent, a `label` the user will
  read in the banner; (3) `game_level_select` + `game_level_frame` to show it; (4) `game_level_view` to look; (5)
  `game_level_validate` and fix errors; (6) leave saving to the user unless asked (`save: true`). Prefer these to
  `game_level_set`, which replaces the whole file and is for creating a scene.
- `game-agent.ts`'s prompt sentence lists the new tools; `ACTION_LABELS` entries were added per theme by the recipe.

**Acceptance.**

- [ ] I1. All seven copies are byte-identical (`scripts/skill-copies.test.mjs`).
- [ ] I2. `skills.test.ts` "names only game_* tools that exist" passes with the new names.
- [ ] I3. `game-scaffold.test.ts` (seeded copy) passes.

**Done when** I1–I3 pass.

## MCP summary

| Tool | Kind | `allowGames` | Editor open | Editor closed |
|---|---|---|---|---|
| `game_level_query` | read | no | unsaved state | file |
| `game_level_validate` | read | no | unsaved state | file |
| `game_entity_add` / `_update` / `_delete` / `_batch` | write | yes | one undo step + banner; `save` optional | one commit |
| `game_level_select` | UI | yes | selects (+ frames) | error "Open … first" |
| `game_level_frame` | UI | yes | frames | error |
| `game_level_view` | read | no | PNG | error |

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/game-level-ops.ts` (+ test) | A | net-new |
| `packages/shared/src/game-level-validate.ts` (+ test) | B | net-new |
| `packages/shared/src/index.ts` | A B | edit |
| `packages/shared/src/ipc/channels.ts`, `ipc/schemas.ts`, `ipc/bridge.ts` | C | edit |
| `packages/desktop/src/preload/index.ts` | C | edit |
| `packages/features/media-game/manifest.ts` | C | edit (`ipc`) |
| `packages/features/media-game/main/games/level-editor-bridge.ts` (+ test) | C | net-new |
| `packages/features/media-game/main/games/game-service.ts`, `main/index.ts` | C | edit |
| `packages/features/media-game/main/games/game-level-source.ts` | D | net-new |
| `packages/features/media-game/main/games/level-agent-writes.ts` (+ test) | E | net-new |
| `packages/shared/src/media-game-mcp.ts`, `packages/shared/src/mcp.ts` | D E G H | edit (recipe 1–2) |
| `packages/features/media-game/main/games/game-mcp.ts` | D E G H | edit (recipe 3) |
| `packages/desktop/src/main/mcp/game-tools.ts`, `dispatch.ts`, `tool-manifest.pin.json` | D E G H | edit (recipe 4, 5, 7) |
| `packages/features/media-game/main/games/game-agent.ts` | D E G H I | edit (labels, prompt, `save` default) |
| `packages/desktop/src/main/games/game-mcp.test.ts`, `packages/shared/src/media-game-mcp.test.ts` | D E G H | edit |
| `packages/features/media-game/renderer/level/use-level-editor-bridge.ts` (+ test) | C F G H | net-new |
| `packages/features/media-game/renderer/level/level-edit-model.ts`, `level-store.ts`, `level-editor.tsx` | C F | edit |
| `packages/features/media-game/renderer/level/agent-change-banner.tsx` (+ test) | F | net-new |
| `packages/features/media-game/renderer/level/level-plan-draw.ts`, `3d/level-scene.tsx` | F | edit |
| `packages/features/media-game/renderer/level/3d/level-capture.ts`, `level-plan-capture.ts`, `3d/level-3d-view.tsx` | H | net-new / edit |
| `packages/app/test-support/mock-bridge.ts` | C | edit |
| the seven `midnite-media-game-build/SKILL.md` copies | I | edit |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` for `packages/shared`, `packages/features/media-game`, `packages/desktop`;
  eslint on changed files; vitest on the touched suites (shared, media-game renderer/level, desktop `main/mcp` and
  `main/games`); `scripts/skill-copies.test.mjs`; `scripts/layer-boundaries.test.mjs`; `tool-manifest-pin.test.ts`;
  `node scripts/tracker-check.mjs`.
- [ ] **Open, for a human:** gate on the built app, a throwaway `--user-data-dir`, no mocks**, Settings ▸ MCP ▸ "Let agents run and edit
  games" on, a third-person game open in the Level editor with an unsaved edit: from a terminal agent (`claude` with
  the `midnite` server) run `game_level_query` (sees the unsaved edit), a `game_entity_batch` of 5 adds (banner, pulse,
  one Mod+Z reverts), `game_level_select` + `game_level_frame`, `game_level_view` preset `iso` (image returned),
  `game_level_validate`; close the editor and repeat one batch (one commit, `git log -1` names the level). Shots under
  `/tmp/midnite-shots-p138/`.

## Not in this phase

- **Ops for tiles, map properties, prefabs, links or terrain snapping.** Phases 143, 144, 139, 142 and 141 add their
  own `LevelOp` variants to `LevelOpSchema` (each a new discriminated member, so this phase's callers are unchanged).
- **Streaming partial results** for big queries — `limit` + `total` + `truncated` is enough at 1,000.
- **An approval prompt per agent edit.** The consent switch gates writes; the banner's Undo is the review.
- **Opening the level editor from a tool.** `game_open` opens a game; opening a specific scene in the editor is
  left out (the select / frame / view tools say how to open it).
- **Editing `game_level_set`.** It keeps its whole-file semantics for creating a scene.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Resolved — Tool names keep the `game_` prefix.** (`game_level_query`, `game_entity_batch`, …) rather than the roadmap's bare
   `level_query`: ownership (`manifest.ts` `mcpTools: [...GAME_MCP_TOOL_IDS]`), the private agent server and
   `skills.test.ts` all key on `GAME_MCP_TOOL_IDS`, and every existing game tool is prefixed.
2. **Resolved — One op language for everyone.** `applyLevelOps` lives in `shared` (pure, zod-only) so main's file path and the
   renderer's live path apply byte-identical semantics; a second implementation would drift.
3. **Resolved — Batches are all-or-nothing.** A transaction, like Unity's undo groups and Godot's `UndoRedo` actions. A partial
   batch would leave a level no agent meant to make.
4. **Resolved — Live first, file second.** An open editor is where the user is looking, so an agent edit lands there as one undo
   step and stays unsaved for the user to review; a closed editor gets one commit (git is the review trail, as Phase
   132 Theme G set).
5. **Resolved — The renderer never auto-saves an agent change on the global server.** The private game-agent server does,
   because its runs are commit-based and its own Undo reverts the last agent commit (`game-agent-service.ts`).
6. **Resolved — The bridge copies Companion's `ui-bridge.ts` pattern.** (uuid pending map, timeout, `failure()` envelope) inside
   the games feature: features never import features, and the pattern is 60 lines.
7. **Resolved — Select, frame are gated by `allowGames`.** Though they change no data: they steer the user's screen, which is a
   consent matter (as `allowUi` gates `ui.reveal`). `game_level_view` is a read and is not gated; it may switch
   Floorplan → 3D, which is visible and harmless.
8. **Resolved — Metres are opt-in (`unit: 'm'`).** Pixels stay the default because the file is Tiled JSON and
   `game_level_get` returns pixels.
9. **Resolved — Validation is deterministic.** (sorted by severity, rule, object id): an agent can diff two runs, and a test can
   assert an exact array.
10. **Resolved — The silent-ignore bug is fixed here.** An external level change while the editor is dirty now asks instead of
    being dropped, and a change equal to the open level marks it saved.
11. **Resolved — 3D capture uses a render target and a temporary camera.** Never the live camera, so the user's view does not
    jump; `game_screenshot` (the running game) and `model_render_preview` (software raster) stay as they are.
