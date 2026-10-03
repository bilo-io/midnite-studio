import { MODELS_OFF_MESSAGE, type McpToolInput, type McpToolOutput } from '@midnite/studio-shared';

import type { ModelTools } from '../media/model/model-mcp';
import { McpToolError } from './errors';
import { getMcpAllowModels } from './ui-gate';

/**
 * The `model_*` tools as the app's global MCP server answers them (Phase 99
 * Theme G): the same implementations an in-app iterative run uses
 * (`media/model/model-mcp.ts`), wrapped in the consent model every other
 * state-changing tool has. The four that change a model or the window refuse
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
