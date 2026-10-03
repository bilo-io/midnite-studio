import { MODEL_MAX_PARTS, MODEL_PATCH_MAX_OPS } from '@midnite/studio-shared';

import { modelSpecReference } from './spec-reference';

/**
 * The prompts behind Media ▸ Models. The design asks the LLM for *structure*,
 * not vertices: a flat JSON list of coloured primitives. Models of every size
 * are far better at that than at emitting raw OBJ numbers (see the PR body for
 * why LLaMA-Mesh-style raw meshes were not the default).
 */

const EXAMPLE = {
  name: 'side table',
  parts: [
    { name: 'top', shape: 'cylinder', radiusTop: 0.5, radiusBottom: 0.5, height: 0.06, position: [0, 0.72, 0], color: '#8b5a2b' },
    { name: 'leg', shape: 'box', size: [0.06, 0.7, 0.06], position: [0.3, 0.35, 0.3], color: '#5c3a1e' },
    { name: 'leg', shape: 'box', size: [0.06, 0.7, 0.06], position: [-0.3, 0.35, 0.3], color: '#5c3a1e' },
    { name: 'leg', shape: 'box', size: [0.06, 0.7, 0.06], position: [0.3, 0.35, -0.3], color: '#5c3a1e' },
    { name: 'leg', shape: 'box', size: [0.06, 0.7, 0.06], position: [-0.3, 0.35, -0.3], color: '#5c3a1e' },
    {
      name: 'vase',
      shape: 'lathe',
      profile: [[0, 0], [0.06, 0], [0.09, 0.08], [0.05, 0.18], [0.04, 0.24], [0.06, 0.28]],
      position: [0, 0.75, 0],
      color: '#3366cc',
    },
  ],
};

export const SPEC_RULES = `You design 3D models as JSON. Reply with ONE JSON object and nothing else — no prose, no markdown fence.

${modelSpecReference()}

All numbers are plain numbers in metres, colours are "#rrggbb".

Rules:
- Y is up. Rest the model on the ground: its lowest point at y=0, centred on x=0, z=0.
- Build with many small parts (usually 6 to 30), give each distinct piece its own colour, and keep proportions realistic.
- Use only the shapes and fields above.`;

export function buildSpecPrompt(input: { prompt: string; imageDescription?: string | undefined }): string {
  const brief = [
    input.prompt.trim() ? `Request: ${input.prompt.trim()}` : '',
    input.imageDescription ? `Reference image, as described by a vision model:\n${input.imageDescription.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return [
    SPEC_RULES,
    '',
    'Example — "a side table with a blue vase":',
    JSON.stringify(EXAMPLE),
    '',
    'Now design this model.',
    brief,
    '',
    'JSON:',
  ].join('\n');
}

export function buildRepairPrompt(input: { previousReply: string; error: string }): string {
  return [
    SPEC_RULES,
    '',
    'Your previous reply could not be used:',
    input.error,
    '',
    'Previous reply:',
    input.previousReply.slice(0, 6000),
    '',
    'Reply again with the corrected JSON object only.',
  ].join('\n');
}

export const DESCRIBE_IMAGE_PROMPT = `Describe the main object in this picture so a 3D modeller could rebuild it from simple shapes (boxes, spheres, cylinders, cones, tori, revolved profiles).
List: what it is; its overall proportions (width : height : depth); each distinct part with its shape, relative size, position and colour (use plain colour words). Ignore the background. Be concrete and brief — under 200 words, no preamble.`;

/**
 * The brief for an iterative (MCP) run: the agent holds the model_* tools and
 * loops build → render → compare → refine → save. The format itself is *not*
 * pasted here — `model_get_spec` returns the live, schema-derived reference —
 * so the prompt stays true when the schema grows.
 */
export function buildIterativePrompt(input: {
  prompt: string;
  hasReference: boolean;
  /** The target the tools must be called with. */
  target: { repoPath: string; project: string; model: string };
  maxIterations: number;
  /** A starting design already in the model, when it is not a blank placeholder. */
  editing?: boolean;
}): string {
  const target = JSON.stringify(input.target);
  return [
    'You are building a 3D model in Midnite Studio with the model_* tools. You have no other tools: do not look for files, do not write code, do not reply with JSON.',
    '',
    `Every tool call takes this target: ${target}`,
    '',
    input.prompt.trim() ? `Request: ${input.prompt.trim()}` : 'Request: reproduce the attached reference picture.',
    input.hasReference
      ? 'A reference picture is attached: call model_get_reference_image and study it — build what you SEE, its proportions and colours, not a generic version of the object.'
      : '',
    '',
    'Work in this loop:',
    '1. Call model_get_spec once to read the design format, the limits and the part ids. The model starts as a one-part placeholder: replace it.',
    `2. Build a first design with model_set_spec (the whole design) — a rough but complete silhouette in correct proportions, at most ${MODEL_MAX_PARTS} parts.`,
    `3. Call model_render_preview to SEE it (front, side, top and iso views). Compare with the request${input.hasReference ? ' and the reference picture' : ''}: proportions, missing pieces, floating or intersecting parts, colours.`,
    `4. Refine with model_patch_parts (up to ${MODEL_PATCH_MAX_OPS} add / update / remove ops by part id, applied all or nothing). Use model_set_spec only to start over.`,
    `5. Repeat 3 and 4. You have ${input.maxIterations} render passes in total; stop early once it looks right. A call that returns "ok": false changed nothing — read its errors and retry.`,
    '6. Finish by calling model_save. A model that was never saved is lost.',
    '',
    'Keep the model resting on the ground (lowest point at y=0) and centred on x=0, z=0. Add detail in the later passes: first the big shapes, then the small ones.',
    input.editing ? 'The model already has a design — start from it with model_get_spec rather than replacing it.' : '',
    '',
    'When it is saved, reply with one short sentence describing what you built.',
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n');
}
