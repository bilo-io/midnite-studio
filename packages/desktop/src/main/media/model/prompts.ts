import { MODEL_MAX_PARTS } from '@midnite/studio-shared';

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

Schema:
{ "name": string, "parts": [ part, ... ] }   // 1 to ${MODEL_MAX_PARTS} parts, usually 6 to 30

Every part has: "name" (string), "shape", "position" [x,y,z], optional "rotation" [x,y,z] in degrees, optional "scale" [x,y,z], "color" as "#rrggbb".
Shapes and their size fields (all numbers positive, in metres):
- "box": "size" [width(x), height(y), depth(z)]
- "sphere": "radius"
- "cylinder": "radiusTop", "radiusBottom", "height"
- "cone": "radius", "height"
- "torus": "radius" (ring), "tube" (thickness)
- "lathe": "profile" [[radius, y], ...] revolved around the Y axis, 2 to 32 points, listed bottom to top — for vases, bottles, chess pieces, lamps
- "extrude": "outline" [[x, z], ...] (3 to 64 points, a simple polygon), "height" — extruded up from y=0, for walls, signs, L-shapes

Rules:
- Y is up. Rest the model on the ground: its lowest point at y=0, centred on x=0, z=0.
- Every part is centred on its own "position" (an extrude starts at its position and rises by "height"; a lathe is drawn from its position upward by its profile's y values).
- Build with many small parts, give each distinct pieces its own colour, and keep proportions realistic.
- Use only the shapes above; numbers must be plain numbers.`;

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
