import { MODELS_OFF_MESSAGE, type McpToolInput, type McpToolOutput } from '@midnite/studio-shared';

import type { ModelTools } from '../media/model/model-mcp';
import type { Sf3dMcpTools } from '../media/model/sf3d/sf3d-mcp';
import { McpToolError } from './errors';
import { getMcpAllowModels } from './ui-gate';

/**
 * The `model_*` tools as the app's global MCP server answers them (Phase 99
 * Theme G): the same implementations an in-app iterative run uses
 * (`media/model/model-mcp.ts`), wrapped in the consent model every other
 * state-changing tool has. The tools that change a model or the window refuse
 * with a named reason while `Settings ▸ MCP ▸ Let agents edit 3D models` is
 * off; the read tools and the preview render answer whenever the server is on.
 *
 * The implementations are bound at startup (`setModelTools`, from
 * `ipc/media-model-handlers.ts`, where the media store lives); until then a
 * call is answered, not thrown, with a plain error.
 */

let bound: ModelTools | null = null;

export function setModelTools(tools: ModelTools | null): void {
  bound = tools;
}

function tools(): ModelTools {
  if (!bound) throw new McpToolError('error', 'Media ▸ Models is not ready yet.');
  return bound;
}

function allowed(): void {
  if (!getMcpAllowModels()) throw new McpToolError('refused', MODELS_OFF_MESSAGE);
}

export const modelList = async (input: McpToolInput<'model_list'>): Promise<McpToolOutput<'model_list'>> => tools().model_list(input);
export const modelGetSpec = async (input: McpToolInput<'model_get_spec'>): Promise<McpToolOutput<'model_get_spec'>> => tools().model_get_spec(input);
export const modelRenderPreview = async (input: McpToolInput<'model_render_preview'>): Promise<McpToolOutput<'model_render_preview'>> =>
  tools().model_render_preview(input);
export const modelGetReferenceImage = async (
  input: McpToolInput<'model_get_reference_image'>,
): Promise<McpToolOutput<'model_get_reference_image'>> => tools().model_get_reference_image(input);

export const modelGetRig = async (input: McpToolInput<'model_get_rig'>): Promise<McpToolOutput<'model_get_rig'>> => tools().model_get_rig(input);

export const modelAutoRig = async (input: McpToolInput<'model_auto_rig'>): Promise<McpToolOutput<'model_auto_rig'>> => {
  allowed();
  return tools().model_auto_rig(input);
};
export const modelPatchRig = async (input: McpToolInput<'model_patch_rig'>): Promise<McpToolOutput<'model_patch_rig'>> => {
  allowed();
  return tools().model_patch_rig(input);
};
export const modelPatchAnimations = async (input: McpToolInput<'model_patch_animations'>): Promise<McpToolOutput<'model_patch_animations'>> => {
  allowed();
  return tools().model_patch_animations(input);
};
export const modelRetarget = async (input: McpToolInput<'model_retarget'>): Promise<McpToolOutput<'model_retarget'>> => {
  allowed();
  return tools().model_retarget(input);
};
export const modelConvertToMesh = async (input: McpToolInput<'model_convert_to_mesh'>): Promise<McpToolOutput<'model_convert_to_mesh'>> => {
  allowed();
  return tools().model_convert_to_mesh(input);
};
export const modelSdfSet = async (input: McpToolInput<'model_sdf_set'>): Promise<McpToolOutput<'model_sdf_set'>> => {
  allowed();
  return tools().model_sdf_set(input);
};
export const modelSdfPatch = async (input: McpToolInput<'model_sdf_patch'>): Promise<McpToolOutput<'model_sdf_patch'>> => {
  allowed();
  return tools().model_sdf_patch(input);
};
export const modelSdfBake = async (input: McpToolInput<'model_sdf_bake'>): Promise<McpToolOutput<'model_sdf_bake'>> => {
  allowed();
  return tools().model_sdf_bake(input);
};
export const modelGetLandmarks = async (input: McpToolInput<'model_get_landmarks'>): Promise<McpToolOutput<'model_get_landmarks'>> => tools().model_get_landmarks(input);
export const modelSculptStroke = async (input: McpToolInput<'model_sculpt_stroke'>): Promise<McpToolOutput<'model_sculpt_stroke'>> => {
  allowed();
  return tools().model_sculpt_stroke(input);
};
export const modelMask = async (input: McpToolInput<'model_mask'>): Promise<McpToolOutput<'model_mask'>> => {
  allowed();
  return tools().model_mask(input);
};
export const modelSubdivide = async (input: McpToolInput<'model_subdivide'>): Promise<McpToolOutput<'model_subdivide'>> => {
  allowed();
  return tools().model_subdivide(input);
};
export const modelRemesh = async (input: McpToolInput<'model_remesh'>): Promise<McpToolOutput<'model_remesh'>> => {
  allowed();
  return tools().model_remesh(input);
};
export const modelSculptUndo = async (input: McpToolInput<'model_sculpt_undo'>): Promise<McpToolOutput<'model_sculpt_undo'>> => {
  allowed();
  return tools().model_sculpt_undo(input);
};
export const modelDecimate = async (input: McpToolInput<'model_decimate'>): Promise<McpToolOutput<'model_decimate'>> => {
  allowed();
  return tools().model_decimate(input);
};
export const modelRetopo = async (input: McpToolInput<'model_retopo'>): Promise<McpToolOutput<'model_retopo'>> => {
  allowed();
  return tools().model_retopo(input);
};
export const modelUnwrap = async (input: McpToolInput<'model_unwrap'>): Promise<McpToolOutput<'model_unwrap'>> => {
  allowed();
  return tools().model_unwrap(input);
};
export const modelBake = async (input: McpToolInput<'model_bake'>): Promise<McpToolOutput<'model_bake'>> => {
  allowed();
  return tools().model_bake(input);
};
export const modelExport = async (input: McpToolInput<'model_export'>): Promise<McpToolOutput<'model_export'>> => {
  allowed();
  return tools().model_export(input);
};
export const modelOpen = async (input: McpToolInput<'model_open'>): Promise<McpToolOutput<'model_open'>> => {
  allowed();
  return tools().model_open(input);
};
export const modelSetSpec = async (input: McpToolInput<'model_set_spec'>): Promise<McpToolOutput<'model_set_spec'>> => {
  allowed();
  return tools().model_set_spec(input);
};
export const modelPatchParts = async (input: McpToolInput<'model_patch_parts'>): Promise<McpToolOutput<'model_patch_parts'>> => {
  allowed();
  return tools().model_patch_parts(input);
};
export const modelSave = async (input: McpToolInput<'model_save'>): Promise<McpToolOutput<'model_save'>> => {
  allowed();
  return tools().model_save(input);
};

/**
 * SF3D (Phase 103 Theme J): bound by `ipc/media-model-sf3d-handlers.ts`. The status answers whenever
 * the server is on; starting a generation writes files, so it sits behind the same switch as the
 * other write tools — and the service itself refuses until the user has consented and installed.
 */
let sf3d: Sf3dMcpTools | null = null;

export function setSf3dTools(tools: Sf3dMcpTools | null): void {
  sf3d = tools;
}

function sf3dTools(): Sf3dMcpTools {
  if (!sf3d) throw new McpToolError('error', 'SF3D is not ready yet.');
  return sf3d;
}

export const modelSf3dStatus = async (input: McpToolInput<'model_sf3d_status'>): Promise<McpToolOutput<'model_sf3d_status'>> =>
  sf3dTools().model_sf3d_status(input);
export const modelGenerateSf3d = async (input: McpToolInput<'model_generate_sf3d'>): Promise<McpToolOutput<'model_generate_sf3d'>> => {
  allowed();
  return sf3dTools().model_generate_sf3d(input);
};
