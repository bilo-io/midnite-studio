import { z } from 'zod';

import {
  ChecksVerdictSchema,
  FileDiffSchema,
  ForgePullsResultSchema,
  ForgeRunsResultSchema,
  GraphRowSchema,
  RefSchema,
  RepoDescriptorSchema,
  SETTINGS_PAGE_IDS,
  StatusResultSchema,
  VIEW_IDS,
  WindowRoleSchema,
} from './domain';
import { isCommandId } from './keybindings';
import {
  GameCreateInputSchema,
  GameCreateOutputSchema,
  GameGetManifestOutputSchema,
  GameInputInputSchema,
  GameInputOutputSchema,
  GameListOutputSchema,
  GameLogsInputSchema,
  GameLogsOutputSchema,
  GameOkOutputSchema,
  GameOpenOutputSchema,
  GameRunOutputSchema,
  GameScreenshotInputSchema,
  GameSetManifestInputSchema,
  GameStateOutputSchema,
  GameToolTargetSchema,
} from './media-game-mcp';
import {
  ModelAutoRigInputSchema,
  ModelEditResultSchema,
  ModelGetRigResultSchema,
  ModelListInputSchema,
  ModelPatchAnimationsInputSchema,
  ModelPatchPartsInputSchema,
  ModelPatchRigInputSchema,
  ModelRenderPreviewInputSchema,
  ModelRetargetInputSchema,
  ModelConvertToMeshInputSchema,
  ModelSetSpecInputSchema,
  ModelToolTargetSchema,
  ModelGenerateSf3dInputSchema,
  ModelGenerateSf3dResultSchema,
  ModelSf3dStatusInputSchema,
  ModelSf3dStatusResultSchema,
} from './media-model-mcp';
import {
  TerrainMcpBuildResultSchema,
  TerrainEditResultSchema,
  TerrainExportInputSchema,
  TerrainExportOutputSchema,
  TerrainGetSpecResultSchema,
  TerrainGetStatsResultSchema,
  TerrainListInputSchema,
  TerrainListResultSchema,
  TerrainOpenResultSchema,
  TerrainRenderPreviewInputSchema,
  TerrainSetInputInputSchema,
  TerrainMcpSetInputResultSchema,
  TerrainSetSpecInputSchema,
  TerrainToolTargetSchema,
} from './media-terrain-mcp';
import { WorkflowGateDecisionSchema } from './workflow';

/**
 * Midnite Studio speaks MCP (Phase 57).
 *
 * `MCP_TOOLS` is the single source of truth for every tool this app's MCP
 * server answers — id, the one-line description a model reads to decide
 * whether to call it, and its zod input/output schemas — in the house style
 * of `COMMANDS` (`keybindings.ts`): `McpToolId` and `MCP_TOOL_IDS` are derived
 * from it, never hand-maintained separately.
 *
 * **Inputs are new schemas keyed by filesystem path, not reused `RepoId`
 * extensions.** Nearly every request schema in `ipc/schemas.ts` extends
 * `RepoId` (`StatusGetRequest = RepoId.extend({ worktreePath: z.string().optional() })`),
 * and a repo *id* is the one thing an agent in a shell cannot know — it knows
 * its own `cwd`. `McpRepoTarget` is the one new input primitive every tool
 * builds on.
 *
 * **Outputs are reused, verbatim.** Every tool's `output` is an existing
 * export from `domain/` — `StatusResultSchema`, `GraphRowSchema`, `RefSchema`,
 * `FileDiffSchema`, the forge result schemas — never a re-typed copy. Where a
 * tool needs a shape those don't already have on their own (`repo.resolve`'s
 * paired branch name, `forge.checks`'s verdict), the existing schema is
 * extended with a plain field rather than rebuilt.
 */

/**
 * Every tool call is scoped to a repository the caller names by path — an
 * agent knows its `cwd`, never Midnite Studio's internal `repoId`. Every
 * tool's dispatcher resolves this to a registered repository via
 * `resolveRepoRoot` + the repo registry before touching git (Phase 57 Theme D)
 * rather than trusting it outright.
 */
export const McpRepoTarget = z.object({ repoPath: z.string().min(1) });

/** Every entry's shape. `input`/`output` stay `z.ZodTypeAny` so each tool keeps its own literal schema type under `satisfies` rather than being widened. */
type McpToolEntry = {
  id:
    | 'repo.list'
    | 'repo.resolve'
    | 'status.get'
    | 'graph.log'
    | 'diff.file'
    | 'branch.list'
    | 'forge.pulls'
    | 'forge.checks'
    | 'ui.state'
    | 'ui.navigate'
    | 'ui.command'
    | 'workflow_gates_list'
    | 'workflow_gate_decide'
    | 'model_list'
    | 'model_open'
    | 'model_get_spec'
    | 'model_set_spec'
    | 'model_patch_parts'
    | 'model_render_preview'
    | 'model_get_reference_image'
    | 'model_get_rig'
    | 'model_auto_rig'
    | 'model_patch_rig'
    | 'model_patch_animations'
    | 'model_retarget'
    | 'model_convert_to_mesh'
    | 'model_save'
    | 'model_sf3d_status'
    | 'model_generate_sf3d'
    | 'game_list'
    | 'game_create'
    | 'game_open'
    | 'game_get_manifest'
    | 'game_set_manifest'
    | 'game_run'
    | 'game_stop'
    | 'game_reload'
    | 'game_screenshot'
    | 'game_logs'
    | 'game_input'
    | 'game_state'
    | 'terrain_list'
    | 'terrain_open'
    | 'terrain_get_spec'
    | 'terrain_set_spec'
    | 'terrain_set_input'
    | 'terrain_build'
    | 'terrain_render_preview'
    | 'terrain_get_stats'
    | 'terrain_export';
  title: string;
  /**
   * The text a model actually reads to decide whether to call this tool.
   * Rule, not aspiration: at most 220 characters, one sentence, starting with
   * a verb, naming the shell command it replaces — asserted in `mcp.test.ts`.
   */
  description: string;
  input: z.ZodTypeAny;
  output: z.ZodTypeAny;
  /**
   * `false` marks a tool that changes what the app shows. No tool changes a
   * repository — that is still Phase 57 Decision 5's deferred follow-up.
   * The eight repo-reading tools above are all `true`; Phase 81 Theme F's
   * `ui.navigate`/`ui.command` are the first two to say `false`.
   */
  readOnly: boolean;
};

export const MCP_TOOLS = {
  'repo.list': {
    id: 'repo.list',
    title: 'List open repositories',
    description:
      'Lists every repository Midnite Studio has open — use instead of `find ~ -name .git -type d` to discover checkouts; each entry carries its path, name and current branch.',
    input: z.object({}),
    output: z.array(RepoDescriptorSchema),
    readOnly: true,
  },
  'repo.resolve': {
    id: 'repo.resolve',
    title: 'Resolve a path to its repository',
    description:
      'Resolves a filesystem path to its registered repository and current branch — use instead of `git rev-parse --show-toplevel` plus `git branch --show-current`.',
    input: McpRepoTarget,
    output: z.object({
      repo: RepoDescriptorSchema,
      /** The branch checked out at `repoPath` specifically — may differ from `repo.headRef` when `repoPath` is a linked worktree. */
      branch: z.string().nullable(),
    }),
    readOnly: true,
  },
  'status.get': {
    id: 'status.get',
    title: 'Get working tree status',
    description:
      'Returns the parsed working tree (staged, unstaged, untracked, conflicted) for a repository — use instead of `git status --porcelain`; conflict states are already classified.',
    input: McpRepoTarget,
    output: StatusResultSchema,
    readOnly: true,
  },
  'graph.log': {
    id: 'graph.log',
    title: 'Get the laid-out commit graph',
    description:
      'Returns laid-out commit graph rows, lanes and edges included, for a repository — use instead of `git log --graph`; lane layout is not something a shell can reproduce cheaply.',
    input: McpRepoTarget.extend({
      /** Default 50, hard maximum 200 — clamped server-side, never trusted from the caller (Decision 3). */
      limit: z.number().int().min(1).max(200).optional(),
    }),
    output: z.array(GraphRowSchema),
    readOnly: true,
  },
  'diff.file': {
    id: 'diff.file',
    title: 'Get one file’s diff',
    description:
      'Returns a parsed unified diff for one file in a repository — use instead of `git diff -- <path>`; a binary or over-cap diff is refused rather than truncated.',
    input: McpRepoTarget.extend({
      path: z.string().min(1),
      staged: z.boolean().optional(),
      context: z.number().int().min(0).max(1000).optional(),
    }),
    output: FileDiffSchema,
    readOnly: true,
  },
  'branch.list': {
    id: 'branch.list',
    title: 'List branches',
    description:
      'Lists local and remote branches with ahead/behind counts — use instead of `git for-each-ref refs/heads refs/remotes`; tracking info is already resolved.',
    input: McpRepoTarget,
    output: z.array(RefSchema),
    readOnly: true,
  },
  'forge.pulls': {
    id: 'forge.pulls',
    title: 'List pull requests',
    description:
      'Lists a repository’s pull requests through the user’s own `gh` CLI — use instead of `gh pr list`; review decision and checks rollup are already parsed.',
    input: McpRepoTarget.extend({
      limit: z.number().int().min(1).max(100).optional(),
      state: z.enum(['open', 'closed', 'merged', 'all']).optional(),
    }),
    output: ForgePullsResultSchema,
    readOnly: true,
  },
  'forge.checks': {
    id: 'forge.checks',
    title: 'Get CI runs and their verdict',
    description:
      'Lists recent CI runs and a pass/fail verdict for a branch — use instead of `gh run list` plus eyeballing conclusions; the verdict is computed from the same runs.',
    input: McpRepoTarget.extend({
      limit: z.number().int().min(1).max(100).optional(),
      /** Defaults to the branch checked out at `repoPath`. */
      branch: z.string().optional(),
    }),
    output: ForgeRunsResultSchema.extend({
      /** `null` when there is nothing to say — see `checksVerdict` in `domain/checks-verdict.ts`. */
      verdict: ChecksVerdictSchema.nullable(),
    }),
    readOnly: true,
  },
  /*
   * Phase 81 Theme F — the other half of "deepen the connection". These
   * three are the only tools an agent session gets for steering the window
   * itself, gated by their own `Settings ▸ MCP ▸ Let agents steer the UI`
   * switch (`allowUi` on `McpSettings`) — always listed by `tools/list` so
   * an agent can plan around them, refused with a named reason while the
   * switch is off (Decision 11).
   */
  'ui.state': {
    id: 'ui.state',
    title: 'Read the window state',
    description:
      'Reads which view Midnite Studio is showing, which panels are detached and whether the screen is locked — use before `ui.navigate` instead of guessing what the user can see.',
    input: z.object({}),
    output: z.object({
      activeView: z.enum(VIEW_IDS),
      settingsPage: z.enum(SETTINGS_PAGE_IDS).nullable(),
      detached: z.array(WindowRoleSchema),
      /** The selected repository's worktree root, or `null` when none is open. */
      repoPath: z.string().nullable(),
      locked: z.boolean(),
      /** Whether `ui.navigate`/`ui.command` will actually run — the reason to check this before calling either. */
      uiToolsEnabled: z.boolean(),
    }),
    readOnly: true,
  },
  'ui.navigate': {
    id: 'ui.navigate',
    title: 'Open a view or settings page',
    description:
      'Opens a view or settings page, or focuses its window if already detached — call `ui.state` first to see what the user can already see.',
    input: z.object({
      view: z.enum(VIEW_IDS),
      page: z.enum(SETTINGS_PAGE_IDS).optional(),
      issue: z.number().int().positive().optional(),
    }),
    output: z.object({ did: z.enum(['navigated', 'focused-window']), view: z.enum(VIEW_IDS) }),
    readOnly: false,
  },
  'ui.command': {
    id: 'ui.command',
    title: 'Run a direct-tier palette command',
    description:
      'Runs one direct-tier palette command by id — refusing a `confirm`- or `never`-tier id, which needs the user or the palette itself.',
    input: z.object({
      /** `z.enum` cannot take `COMMAND_IDS` — it is a mapped array, not a tuple (`keybindings.ts`). */
      id: z.string().refine(isCommandId, 'not a known command id'),
    }),
    output: z.object({ did: z.literal('ran'), label: z.string() }),
    readOnly: false,
  },
  /*
   * Phase 97 Theme D — a workflow's own human gate, over MCP. `workflow_gate_decide`
   * is this app's FIRST non-read-only MCP tool that touches app state rather
   * than the window chrome (`ui.navigate`/`ui.command` steer the UI; this
   * decides a real paused run) — gated by its own `Settings ▸ MCP ▸ Let
   * agents decide workflow gates` switch (`allowGateDecide` on
   * `McpSettings`), off by default and never implied by `enabled` or
   * `allowUi`, the identical posture Theme F already established for those
   * two. Workflows are global (no `repoPath` — see `workflow.ts`'s own doc
   * comment), so neither tool extends `McpRepoTarget`.
   */
  workflow_gates_list: {
    id: 'workflow_gates_list',
    title: 'List gates waiting for approval',
    description:
      'Lists every workflow run currently paused on a human gate — call before `workflow_gate_decide` to find a runId/nodeId to decide.',
    input: z.object({}),
    output: z.array(
      z.object({
        runId: z.string(),
        workflowId: z.string(),
        workflowName: z.string(),
        nodeId: z.string(),
        label: z.string(),
        title: z.string(),
        instructions: z.string(),
        /** Epoch ms this node started waiting. */
        startedAt: z.number().int().nonnegative().optional(),
      }),
    ),
    readOnly: true,
  },
  workflow_gate_decide: {
    id: 'workflow_gate_decide',
    title: 'Decide a waiting workflow gate',
    description:
      'Approves or rejects one gate a workflow run is paused on — call `workflow_gates_list` first to find its runId/nodeId, refused unless its own Settings switch is on.',
    input: z.object({
      runId: z.string().min(1),
      nodeId: z.string().min(1),
      decision: WorkflowGateDecisionSchema,
      note: z.string().optional(),
    }),
    output: z.object({ decided: z.literal(true) }),
    readOnly: false,
  },
  /*
   * Media ▸ Models (Phase 99 Theme G) — build a 3D model iteratively. The three
   * read tools and the preview render always work once the server is on; the
   * tools that change a model or the window are gated by `Settings ▸ MCP ▸ Let
   * agents edit 3D models` (`allowModels` on `McpSettings`), off by default.
   * Every call names the model by `repoPath` + `project` + `model`, and an
   * edit shows up live in the open Models tab. Full flow: `media-model-mcp.ts`.
   */
  model_list: {
    id: 'model_list',
    title: 'List 3D models',
    description:
      'Lists the Models projects and the 3D models in them with their part counts — use instead of `ls .midnite/media/model`; the `model` path it returns is what every other model tool takes.',
    input: ModelListInputSchema,
    output: z.object({
      projects: z.array(
        z.object({
          name: z.string(),
          models: z.array(z.object({ model: z.string(), name: z.string(), parts: z.number().nullable(), mtimeMs: z.number() })),
        }),
      ),
    }),
    readOnly: true,
  },
  model_open: {
    id: 'model_open',
    title: 'Show a model in the Models tab',
    description:
      'Opens one model in the Models tab so the user watches edits land live — use after `model_list`; refused unless its own Settings switch is on.',
    input: ModelToolTargetSchema,
    output: z.object({ opened: z.literal(true), model: z.string() }),
    readOnly: false,
  },
  model_get_spec: {
    id: 'model_get_spec',
    title: 'Read a model’s design and the schema',
    description:
      'Returns a model’s design JSON with part ids, plus the schema, limits and primitive reference — use instead of reading the `.json` sidecar; call it first to learn the format.',
    input: ModelToolTargetSchema,
    output: z.object({
      spec: z.unknown(),
      revision: z.number().int(),
      schema: z.unknown(),
      reference: z.string(),
      limits: z.object({ maxParts: z.number() }),
    }),
    readOnly: true,
  },
  model_set_spec: {
    id: 'model_set_spec',
    title: 'Replace a model’s whole design',
    description:
      'Replaces a model’s whole design, or starts a new model when `model` is a bare name — validated, with per-field errors; refused unless its own Settings switch is on.',
    input: ModelSetSpecInputSchema,
    output: ModelEditResultSchema,
    readOnly: false,
  },
  model_patch_parts: {
    id: 'model_patch_parts',
    title: 'Add, update or remove parts by id',
    description:
      'Patches a model’s parts by id with add, update and remove ops, all or nothing — use instead of resending the whole design to `model_set_spec`; refused unless its own Settings switch is on.',
    input: ModelPatchPartsInputSchema,
    output: ModelEditResultSchema,
    readOnly: false,
  },
  model_render_preview: {
    id: 'model_render_preview',
    title: 'Render the model from several angles',
    description:
      'Renders a model to PNG images from front, side, top and iso cameras, posed mid-clip if asked — use instead of judging the `model_get_spec` JSON; returns image content, at most 768 px each.',
    input: ModelRenderPreviewInputSchema,
    output: z.object({ _content: z.array(z.unknown()) }),
    readOnly: true,
  },
  model_get_reference_image: {
    id: 'model_get_reference_image',
    title: 'Get the user’s reference picture',
    description:
      'Returns the picture the user attached to a model as image content — use instead of a text description of it; answers not-found when there is none, see `model_list`.',
    input: ModelToolTargetSchema,
    output: z.object({ _content: z.array(z.unknown()) }),
    readOnly: true,
  },
  model_get_rig: {
    id: 'model_get_rig',
    title: 'Read a model’s rig and clips',
    description:
      'Returns a model’s anatomy, bones, part bindings, clips, the anatomy’s bone table and any rig problems — use instead of reading `rig` out of `model_get_spec` by hand.',
    input: ModelToolTargetSchema,
    output: ModelGetRigResultSchema,
    readOnly: true,
  },
  model_auto_rig: {
    id: 'model_auto_rig',
    title: 'Set the anatomy and place a rig',
    description:
      'Sets a model’s anatomy (biped, quadruped, vehicle or static) and places a fresh rig from its parts — use instead of writing bones into `model_set_spec`; refused unless its own Settings switch is on.',
    input: ModelAutoRigInputSchema,
    output: ModelEditResultSchema,
    readOnly: false,
  },
  model_patch_rig: {
    id: 'model_patch_rig',
    title: 'Move, add or remove bones and bindings',
    description:
      'Patches a model’s bones, part bindings, facing and skin falloff, validated all or nothing — use after `model_auto_rig` to correct it; refused unless its own Settings switch is on.',
    input: ModelPatchRigInputSchema,
    output: ModelEditResultSchema,
    readOnly: false,
  },
  model_patch_animations: {
    id: 'model_patch_animations',
    title: 'Add, change or remove animation clips',
    description:
      'Adds, updates, removes and keys a rigged model’s animation clips by name, all or nothing — use instead of resending `animations` to `model_set_spec`; refused unless its own Settings switch is on.',
    input: ModelPatchAnimationsInputSchema,
    output: ModelEditResultSchema,
    readOnly: false,
  },
  model_retarget: {
    id: 'model_retarget',
    title: 'Copy clips from another model',
    description:
      'Copies another rigged model’s clips onto this one by canonical bone name — use instead of re-adding them with `model_patch_animations`; refused unless its own Settings switch is on.',
    input: ModelRetargetInputSchema,
    output: ModelEditResultSchema,
    readOnly: false,
  },
  model_convert_to_mesh: {
    id: 'model_convert_to_mesh',
    title: 'Convert primitives to a sculpt mesh',
    description:
      'Converts a design’s primitives (or the named `parts`) into one watertight sculpt mesh, keeping the primitives hidden; refused unless its own Settings switch is on.',
    input: ModelConvertToMeshInputSchema,
    output: ModelEditResultSchema,
    readOnly: false,
  },
  model_save: {
    id: 'model_save',
    title: 'Write the model’s files',
    description:
      'Saves a model by writing its `.json`, `.obj`, `.mtl` and `.fbx` files — call it when the design is finished; refused unless its own Settings switch is on.',
    input: ModelToolTargetSchema,
    output: z.object({ saved: z.literal(true), files: z.array(z.string()) }),
    readOnly: false,
  },
  model_sf3d_status: {
    id: 'model_sf3d_status',
    title: 'SF3D install and run status',
    description:
      'Reports whether the local SF3D image-to-3D engine is installed and how a `model_generate_sf3d` run is going — call it before generating and to poll a run until it has a `.glb`.',
    input: ModelSf3dStatusInputSchema,
    output: ModelSf3dStatusResultSchema,
    readOnly: true,
  },
  model_generate_sf3d: {
    id: 'model_generate_sf3d',
    title: 'Image to textured 3D model (SF3D)',
    description:
      'Starts a local SF3D run that turns a picture of one object into a textured `.glb` in Media ▸ Models; poll `model_sf3d_status`; refused unless SF3D is installed and its own Settings switch is on.',
    input: ModelGenerateSf3dInputSchema,
    output: ModelGenerateSf3dResultSchema,
    readOnly: false,
  },
  /*
   * Media ▸ Games (Phase 107 Theme D) — play-test a game the agent is writing.
   * The read tools work whenever the server is on; everything that creates a
   * game, runs its code or sends it input is gated by `Settings ▸ MCP ▸ Let
   * agents run and edit games` (`allowGames`), off by default. A game is
   * addressed by `gameId` or its absolute path. File edits are not tools: the
   * agent edits the repo with its own tools. Schemas: `media-game-mcp.ts`.
   */
  game_list: {
    id: 'game_list',
    title: 'List games',
    description:
      'Lists the game repos Midnite Studio knows with their engine and starter — use instead of `find ~ -name midnite-game.json`; the `gameId` it returns is what every other game tool takes.',
    input: z.object({}),
    output: GameListOutputSchema,
    readOnly: true,
  },
  game_create: {
    id: 'game_create',
    title: 'Create a game from a starter',
    description:
      'Creates a game repo from a starter, with its own git history — use instead of `git init` plus copying a template; refused unless its own Settings switch is on.',
    input: GameCreateInputSchema,
    output: GameCreateOutputSchema,
    readOnly: false,
  },
  game_open: {
    id: 'game_open',
    title: 'Show a game in the Games tab',
    description:
      'Opens one game in the Games tab so the user watches it run — use after `game_list`; refused unless its own Settings switch is on.',
    input: GameToolTargetSchema,
    output: GameOpenOutputSchema,
    readOnly: false,
  },
  game_get_manifest: {
    id: 'game_get_manifest',
    title: 'Read a game’s manifest',
    description:
      'Reads a game’s `midnite-game.json` as validated JSON with any issues — use instead of `cat midnite-game.json`.',
    input: GameToolTargetSchema,
    output: GameGetManifestOutputSchema,
    readOnly: true,
  },
  game_set_manifest: {
    id: 'game_set_manifest',
    title: 'Patch a game’s manifest',
    description:
      'Merges a patch into `midnite-game.json` after validating it, never touching `vendored` or `kitVersion` — use instead of editing the file by hand; refused unless its own Settings switch is on.',
    input: GameSetManifestInputSchema,
    output: GameOkOutputSchema,
    readOnly: false,
  },
  game_run: {
    id: 'game_run',
    title: 'Run a game in the sandbox',
    description:
      'Runs a game in the isolated runner and waits until it starts — use instead of `npx serve` plus a browser; refused unless its own Settings switch is on.',
    input: GameToolTargetSchema,
    output: GameRunOutputSchema,
    readOnly: false,
  },
  game_stop: {
    id: 'game_stop',
    title: 'Stop a running game',
    description: 'Stops a running game and frees its renderer — use instead of `kill` on a dev server; refused unless its own Settings switch is on.',
    input: GameToolTargetSchema,
    output: GameOkOutputSchema,
    readOnly: false,
  },
  game_reload: {
    id: 'game_reload',
    title: 'Reload a running game',
    description: 'Reloads a running game from disk after an edit — use instead of a browser `F5`; refused unless its own Settings switch is on.',
    input: GameToolTargetSchema,
    output: GameOkOutputSchema,
    readOnly: false,
  },
  game_screenshot: {
    id: 'game_screenshot',
    title: 'Screenshot a running game',
    description:
      'Captures one frame or a burst of frames of a running game as images — use instead of `screencapture` on the window; returns image content.',
    input: GameScreenshotInputSchema,
    output: z.object({ _content: z.array(z.unknown()) }),
    readOnly: true,
  },
  game_logs: {
    id: 'game_logs',
    title: 'Read a game’s console',
    description:
      'Reads a running game’s console output and errors since a cursor — use instead of `tail -f` on a dev server log; pass the returned `next` as `since`.',
    input: GameLogsInputSchema,
    output: GameLogsOutputSchema,
    readOnly: true,
  },
  game_input: {
    id: 'game_input',
    title: 'Send input to a game',
    description:
      'Sends timed key, pointer and gamepad events to a running game — use instead of `osascript` keystrokes; refused unless its own Settings switch is on.',
    input: GameInputInputSchema,
    output: GameInputOutputSchema,
    readOnly: false,
  },
  game_state: {
    id: 'game_state',
    title: 'Read a game’s state',
    description:
      'Reads the state a running game reports through `window.__midnite.getState()` as size-capped JSON — use instead of guessing from a screenshot.',
    input: GameToolTargetSchema,
    output: GameStateOutputSchema,
    readOnly: true,
  },
  /*
   * Media ▸ Terrain (Phase 105 Theme J) — shape a terrain iteratively: pick a height source, build,
   * look at the pictures, adjust, export. The read tools and the preview render work whenever the
   * server is on; everything that changes a terrain, runs a build or writes an export is gated by
   * `Settings ▸ MCP ▸ Let agents edit terrains` (`allowTerrains`), off by default. A terrain is
   * addressed by `repoPath` + `project` + `terrain` (`terrain_list` returns them). Schemas:
   * `media-terrain-mcp.ts`.
   */
  terrain_list: {
    id: 'terrain_list',
    title: 'List terrains',
    description:
      'Lists the Terrain projects and the terrains in them with whether each is built — use instead of `ls .midnite/media/terrain`; the `terrain` name it returns is what every other terrain tool takes.',
    input: TerrainListInputSchema,
    output: TerrainListResultSchema,
    readOnly: true,
  },
  terrain_open: {
    id: 'terrain_open',
    title: 'Show a terrain in the Terrain tab',
    description:
      'Opens one terrain in the Terrain tab so the user watches builds land live — use after `terrain_list`; refused unless its own Settings switch is on.',
    input: TerrainToolTargetSchema,
    output: TerrainOpenResultSchema,
    readOnly: false,
  },
  terrain_get_spec: {
    id: 'terrain_get_spec',
    title: 'Read a terrain’s spec and the schema',
    description:
      'Returns a terrain’s spec with its JSON schema and limits — use instead of reading `terrain.json`; call it first to learn the fields and which of the three inputs are attached.',
    input: TerrainToolTargetSchema,
    output: TerrainGetSpecResultSchema,
    readOnly: true,
  },
  terrain_set_spec: {
    id: 'terrain_set_spec',
    title: 'Change a terrain’s spec',
    description:
      'Merges a partial spec (resolution, worldSize, heightRange, noise, foliage, roads, …) over the stored one — use instead of editing `terrain.json`; invalid fields come back as errors, nothing changes.',
    input: TerrainSetSpecInputSchema,
    output: TerrainEditResultSchema,
    readOnly: false,
  },
  terrain_set_input: {
    id: 'terrain_set_input',
    title: 'Attach or remove a terrain input image',
    description:
      'Attaches a heightmap, satellite or roads image from a repo path, or paints the heightmap from a prompt — use instead of copying a file into the terrain’s `inputs` folder; paths outside the repo are refused.',
    input: TerrainSetInputInputSchema,
    output: TerrainMcpSetInputResultSchema,
    readOnly: false,
  },
  terrain_build: {
    id: 'terrain_build',
    title: 'Build a terrain',
    description:
      'Builds the heightfield, satellite maps, roads, foliage and buildings from the spec — use instead of a `node` generator script; with no heightmap and no noise it asks you to choose, never guessing.',
    input: TerrainToolTargetSchema,
    output: TerrainMcpBuildResultSchema,
    readOnly: false,
  },
  terrain_render_preview: {
    id: 'terrain_render_preview',
    title: 'Render the terrain from named views',
    description:
      'Renders a built terrain to PNG images from top, oblique, horizon, landcover and roads views — use instead of judging `terrain_get_stats` numbers; returns image content, at most 768 px each.',
    input: TerrainRenderPreviewInputSchema,
    output: z.object({ _content: z.array(z.unknown()) }),
    readOnly: true,
  },
  terrain_get_stats: {
    id: 'terrain_get_stats',
    title: 'Read a terrain’s build statistics',
    description:
      'Returns the last build’s heights, land-cover percentages, road count and length and building count — use instead of parsing `terrain.json`; answers built false when there is no build.',
    input: TerrainToolTargetSchema,
    output: TerrainGetStatsResultSchema,
    readOnly: true,
  },
  terrain_export: {
    id: 'terrain_export',
    title: 'Export a terrain',
    description:
      'Writes the terrain pack folder (manifest, heightfield, chunk glbs, maps) or one glb inside the repo — use instead of copying files out of `build`; an existing pack is never overwritten.',
    input: TerrainExportInputSchema,
    output: TerrainExportOutputSchema,
    readOnly: false,
  },
} satisfies Record<string, McpToolEntry>;

/**
 * The exact refusal `ui.navigate`/`ui.command` answer with while
 * `McpSettings.allowUi` is off — named so main (`ui-requests.ts`'s tool
 * handlers) and the Settings ▸ MCP page's own card quote the identical
 * sentence rather than two copies that can drift.
 */
export const UI_TOOLS_OFF_MESSAGE = 'UI tools are off — Settings ▸ MCP ▸ Let agents steer the UI';

/** The exact refusal `workflow_gate_decide` answers with while `McpSettings.allowGateDecide` is off. */
export const GATE_DECIDE_OFF_MESSAGE =
  'Gate decide is off — Settings ▸ MCP ▸ Let agents decide workflow gates';

/** Derived, never hand-maintained — exactly `COMMAND_IDS` from `COMMANDS` in `keybindings.ts`. */
export type McpToolId = keyof typeof MCP_TOOLS;
export const MCP_TOOL_IDS = Object.keys(MCP_TOOLS) as McpToolId[];

export const isMcpToolId = (value: string): value is McpToolId =>
  (MCP_TOOL_IDS as readonly string[]).includes(value);

/** The validated input shape for one tool, inferred from its own schema. */
export type McpToolInput<K extends McpToolId> = z.output<(typeof MCP_TOOLS)[K]['input']>;
/** The success-value shape for one tool, inferred from its own schema. */
export type McpToolOutput<K extends McpToolId> = z.output<(typeof MCP_TOOLS)[K]['output']>;

/**
 * The frame protocol. Deliberately shaped like `GitOpResultOf`
 * (`domain/result.ts`) — success payload under `value`, failure carrying a
 * discriminating `kind` — and deliberately *not* `GitOpResult` itself, whose
 * `kind: 'conflict'` arm means nothing for a read-only tool.
 */
export type McpRequest = {
  id: string;
  tool: string;
  input: unknown;
};

export type McpResponse =
  | { id: string; ok: true; value: unknown }
  | {
      id: string;
      ok: false;
      kind: 'error' | 'not-found' | 'refused';
      message: string;
    };

/**
 * One row of Theme E's bounded audit ring — the last 50 MCP tool calls kept
 * in main's memory (`desktop/src/main/mcp/audit.ts`), gone on quit. No
 * payload bodies and no path deeper than what the caller passed as
 * `repoPath` — a diff hunk or a subpath in a log file would be a leak.
 */
export type McpCallEntry = {
  at: number;
  tool: McpToolId;
  repoPath: string;
  ok: boolean;
  ms: number;
};

export const MCP_PROTOCOL = 1;
/**
 * Sized for what a model should be handed in one call, not for pty output —
 * these deliberately undercut `broker/protocol.ts`'s `MAX_PAYLOAD_LENGTH`
 * (16 MB), which exists for terminal scrollback frames.
 */
export const MCP_MAX_REQUEST_BYTES = 256 * 1024;
export const MCP_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
