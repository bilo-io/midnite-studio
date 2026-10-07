import { isMcpToolId, MCP_TOOLS, type McpToolId } from '@midnite/studio-shared';
import { z } from 'zod';

import {
  branchList,
  diffFile,
  forgeChecks,
  forgePulls,
  graphLog,
  repoList,
  repoResolve,
  statusGet,
  uiCommand,
  uiNavigate,
  uiState,
  workflowGateDecide,
  workflowGatesList,
} from './tools';
import { McpToolError } from './errors';
import {
  gameCreate,
  gameGetManifest,
  gameInput,
  gameList,
  gameLogs,
  gameOpen,
  gameReload,
  gameRun,
  gameScreenshot,
  gameSetManifest,
  gameState,
  gameImportAsset,
  gameReplayRecord,
  gameReplayPlay,
  gameAssertState,
  gameAssertFrame,
  gamePlaytest,
  gameStop,
} from './game-tools';
import {
  modelAutoRig,
  modelGetReferenceImage,
  modelGetRig,
  modelGetSpec,
  modelList,
  modelOpen,
  modelPatchAnimations,
  modelPatchParts,
  modelPatchRig,
  modelRenderPreview,
  modelConvertToMesh,
  modelSdfBake,
  modelSdfPatch,
  modelSdfSet,
  modelRetarget,
  modelSf3dStatus,
  modelGenerateSf3d,
  modelSave,
  modelSetSpec,
} from './model-tools';
import {
  terrainBuild,
  terrainExport,
  terrainGetSpec,
  terrainGetStats,
  terrainList,
  terrainOpen,
  terrainRenderPreview,
  terrainSetInput,
  terrainSetSpec,
} from './terrain-tools';

/**
 * `MCP_HANDLERS` — a mapped type over the registry, so a tool added to
 * `MCP_TOOLS` without a matching handler here is a typecheck failure, never a
 * runtime "unknown tool" a caller discovers by asking.
 */
export const MCP_HANDLERS: {
  [K in McpToolId]: (input: z.output<(typeof MCP_TOOLS)[K]['input']>) => Promise<unknown>;
} = {
  'repo.list': repoList,
  'repo.resolve': repoResolve,
  'status.get': statusGet,
  'graph.log': graphLog,
  'diff.file': diffFile,
  'branch.list': branchList,
  'forge.pulls': forgePulls,
  'forge.checks': forgeChecks,
  'ui.state': uiState,
  'ui.navigate': uiNavigate,
  'ui.command': uiCommand,
  workflow_gates_list: workflowGatesList,
  workflow_gate_decide: workflowGateDecide,
  model_list: modelList,
  model_open: modelOpen,
  model_get_spec: modelGetSpec,
  model_set_spec: modelSetSpec,
  model_patch_parts: modelPatchParts,
  model_render_preview: modelRenderPreview,
  model_get_reference_image: modelGetReferenceImage,
  model_get_rig: modelGetRig,
  model_auto_rig: modelAutoRig,
  model_patch_rig: modelPatchRig,
  model_patch_animations: modelPatchAnimations,
  model_retarget: modelRetarget,
  model_convert_to_mesh: modelConvertToMesh,
  model_sdf_set: modelSdfSet,
  model_sdf_patch: modelSdfPatch,
  model_sdf_bake: modelSdfBake,
  model_save: modelSave,
  model_sf3d_status: modelSf3dStatus,
  model_generate_sf3d: modelGenerateSf3d,
  game_list: gameList,
  game_create: gameCreate,
  game_open: gameOpen,
  game_get_manifest: gameGetManifest,
  game_set_manifest: gameSetManifest,
  game_run: gameRun,
  game_stop: gameStop,
  game_reload: gameReload,
  game_screenshot: gameScreenshot,
  game_logs: gameLogs,
  game_input: gameInput,
  game_state: gameState,
  game_import_asset: gameImportAsset,
  game_replay_record: gameReplayRecord,
  game_replay_play: gameReplayPlay,
  game_assert_state: gameAssertState,
  game_assert_frame: gameAssertFrame,
  game_playtest: gamePlaytest,
  terrain_list: terrainList,
  terrain_open: terrainOpen,
  terrain_get_spec: terrainGetSpec,
  terrain_set_spec: terrainSetSpec,
  terrain_set_input: terrainSetInput,
  terrain_build: terrainBuild,
  terrain_render_preview: terrainRenderPreview,
  terrain_get_stats: terrainGetStats,
  terrain_export: terrainExport,
};

export type McpDispatchResult =
  | { ok: true; value: unknown }
  | { ok: false; kind: 'error' | 'not-found' | 'refused'; message: string };

/**
 * Validate → call → never throw. Every handler's input is parsed with
 * `MCP_TOOLS[id].input.safeParse` before it touches the filesystem — the same
 * validate-at-the-boundary discipline `ipc/handle.ts` applies, for a boundary
 * that is *less* trusted than the renderer, not more — and every handler
 * runs inside a try/catch so a tool call can never crash the app or hang the
 * socket on an unhandled rejection.
 */
export async function dispatchMcpCall(tool: string, rawInput: unknown): Promise<McpDispatchResult> {
  if (!isMcpToolId(tool)) {
    return { ok: false, kind: 'error', message: `Unknown tool: "${tool}"` };
  }

  const parsed = MCP_TOOLS[tool].input.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'error',
      message: `Invalid input for "${tool}": ${parsed.error.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message)).join('; ')}`,
    };
  }

  try {
    const handler = MCP_HANDLERS[tool] as (input: unknown) => Promise<unknown>;
    const value = await handler(parsed.data);
    return { ok: true, value };
  } catch (err) {
    if (err instanceof McpToolError) {
      return { ok: false, kind: err.kind, message: err.message };
    }
    return { ok: false, kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
