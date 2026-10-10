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
import { companionSettingsGet, companionSettingsSet, companionVoicesList } from './companion-tools';
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
  modelGetLandmarks,
  modelSculptStroke,
  modelMask,
  modelSubdivide,
  modelRemesh,
  modelSculptUndo,
  modelDecimate,
  modelRetopo,
  modelUnwrap,
  modelBake,
  modelExport,
  modelLayerList,
  modelSetReferenceViews,
  modelCompareReference,
  modelMaterialSet,
  modelLayerAdd,
  modelLayerUpdate,
  modelLayerRemove,
  modelPaintStroke,
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
import {
  backgroundGenerate,
  mapGenerate,
  mapGet,
  mapPatch,
  spriteCancel,
  spriteExport,
  spriteGenerate,
  spriteGetReport,
  spriteGetSpec,
  spriteJobStatus,
  spriteList,
  spriteOpen,
  spritePatchFrames,
  spriteRecommendMethod,
  spriteRegenerateFrames,
  spriteRenderPreview,
  spriteSetSpec,
  tilesetGenerate,
} from './sprite-tools';
import { mapCaptureTerrain, mapGoto, mapList, mapMeasure } from './map-tools';
import { musicAddCc, musicAddNotes, musicAddPitchbends, musicAddTrack, musicGetInfo, musicGetNotes, musicGetTrack, musicGetTracks, musicList, musicOpen, musicRemoveNotes, musicRenderPreview, musicSave, musicSetTempo } from './music-tools';

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
  model_get_landmarks: modelGetLandmarks,
  model_sculpt_stroke: modelSculptStroke,
  model_mask: modelMask,
  model_subdivide: modelSubdivide,
  model_remesh: modelRemesh,
  model_sculpt_undo: modelSculptUndo,
  model_decimate: modelDecimate,
  model_retopo: modelRetopo,
  model_unwrap: modelUnwrap,
  model_bake: modelBake,
  model_export: modelExport,
  model_layer_list: modelLayerList,
  model_set_reference_views: modelSetReferenceViews,
  model_compare_reference: modelCompareReference,
  model_material_set: modelMaterialSet,
  model_layer_add: modelLayerAdd,
  model_layer_update: modelLayerUpdate,
  model_layer_remove: modelLayerRemove,
  model_paint_stroke: modelPaintStroke,
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
  sprite_list: spriteList,
  sprite_open: spriteOpen,
  sprite_get_spec: spriteGetSpec,
  sprite_set_spec: spriteSetSpec,
  sprite_recommend_method: spriteRecommendMethod,
  sprite_generate: spriteGenerate,
  sprite_regenerate_frames: spriteRegenerateFrames,
  sprite_patch_frames: spritePatchFrames,
  sprite_render_preview: spriteRenderPreview,
  sprite_get_report: spriteGetReport,
  sprite_job_status: spriteJobStatus,
  sprite_cancel: spriteCancel,
  tileset_generate: tilesetGenerate,
  background_generate: backgroundGenerate,
  map_generate: mapGenerate,
  map_get: mapGet,
  map_patch: mapPatch,
  sprite_export: spriteExport,
  map_list: mapList,
  map_measure: mapMeasure,
  map_goto: mapGoto,
  map_capture_terrain: mapCaptureTerrain,
  music_list: musicList,
  music_open: musicOpen,
  music_get_info: musicGetInfo,
  music_set_tempo: musicSetTempo,
  music_get_tracks: musicGetTracks,
  music_get_track: musicGetTrack,
  music_get_notes: musicGetNotes,
  music_add_notes: musicAddNotes,
  music_remove_notes: musicRemoveNotes,
  music_add_cc: musicAddCc,
  music_add_pitchbends: musicAddPitchbends,
  music_add_track: musicAddTrack,
  music_save: musicSave,
  music_render_preview: musicRenderPreview,
  companion_settings_get: companionSettingsGet,
  companion_settings_set: companionSettingsSet,
  companion_voices_list: companionVoicesList,
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
