import { MODEL_MAX_PARTS, ModelSpecSchema } from '@midnite/studio-shared';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * The format reference an agent reads — `model_get_spec`'s `schema` and
 * `reference`, and the schema section of every prompt — **derived from
 * `ModelSpecSchema`**, never hand-listed. A new part kind, op or material
 * field added to the shared schema shows up here (and so in the prompts and
 * the tools) by being added there.
 *
 * What stays hand-written is only *meaning* the schema cannot carry: the
 * `SHAPE_HINTS` below say how a shape is placed, keyed by its name, and a
 * shape with no hint is simply described by its fields.
 */

type JsonSchema = {
  type?: string;
  const?: unknown;
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  default?: unknown;
  enum?: unknown[];
};

/** Placement semantics the schema cannot express. */
const SHAPE_HINTS: Record<string, string> = {
  box: 'centred on its position',
  sphere: 'centred on its position',
  cylinder: 'centred on its position, axis along Y',
  cone: 'centred on its position, apex up',
  torus: 'ring lies in the XZ plane, centred on its position',
  lathe: 'profile is [radius, y] pairs revolved around Y, listed bottom to top; drawn upward from its position',
  extrude: 'outline is a simple polygon of [x, z] points, extruded up from its position by height',
  capsule: 'centred, axis along Y; height is the straight middle, each hemispherical end adds radius',
  roundedBox: 'a box with rounded edges and corners, centred; radius is capped at half the smallest side',
  wedge: 'a ramp, centred: tall at -Z, ground level at +Z, extruded along X',
  prism: 'regular polygon with `sides` corners and circumradius `radius`, centred, axis along Y',
  ellipsoid: 'a sphere stretched to radii [x, y, z], centred',
  tube: 'a round pipe along a smooth spline through path points (spline:false = straight segments); radius tapers to radiusEnd; closed:true makes a loop (a ring, a handle)',
  sweep: 'profile is a 2-D polygon [x, y] swept along path; scaleEnd tapers, twist turns it',
  loft: 'sections each have y and an [x, z] outline; outlines blend point to point, so keep corners in the same order (hulls, fuselages, bottles)',
  mesh: 'hand-written triangles/quads: vertices [[x,y,z]...] and faces of 3-4 vertex indices, counter-clockwise seen from outside',
  group: 'draws nothing; other parts name it (id or name) as their "parent" to move, rotate and scale together',
  asset: 'an imported mesh (an SF3D result or a dropped-in .glb) drawn from the file named by src — never write one yourself; move, rotate, scale, recolour (tints the texture), hide, bind and rig it like any other part',
  instance: 'draws a copy of the part or group named by source, at this part\'s own transform and parent — repeat legs, wheels, windows',
};

/** Meaning of the fields every part shares, where the schema's own description cannot say it. */
const FIELD_HINTS: Record<string, string> = {
  scale: 'a negative component mirrors the part across that axis',
  parent: 'id (or unique name) of a part whose transform this one inherits; position/rotation/scale are then relative to it',
  pivot: 'point in the part\'s own space that position places and rotation/scale pivot about',
  material: 'PBR surface: { metalness 0-1, roughness 0-1, emissive "#rrggbb", emissiveIntensity 0-10, opacity 0-1 }; colour is the base colour',
  modifiers: 'a stack applied in order to the part\'s own geometry (see Modifiers below)',
  op: 'boolean: this part is NOT drawn; it is "subtract"ed from / "union"ed with / "intersect"ed with its target (the result keeps the target\'s colour). Use for holes, slots, windows, scoops',
  target: 'id (or unique name) of the solid part a boolean op applies to; default the nearest earlier solid part',
  segments: 'round-shape detail (3-96, default 32): lower for low-poly or cheaper booleans, higher for smooth hero shapes',
  smoothAngle: 'degrees: edges sharper than this stay hard, softer ones shade smooth (0 = faceted)',
  hidden: 'left out of every file and preview',
  locked: 'editor only: cannot be picked',
};

const MODIFIER_HINTS: Record<string, string> = {
  bevel: 'chamfers hard edges (one segment); follow with subdivide for a rounded edge',
  subdivide: 'smooths and rounds the surface; each level is 4x the triangles',
  mirror: 'adds a reflected copy across the plane axis = offset in the part\'s own space',
  array: 'count copies in total, each shifted by offset from the last',
  radialArray: 'count copies spun round the axis; radius first moves the shape out from the axis',
  twist: 'rotates about the axis by up to angle degrees along its length',
  taper: 'scales the far end across the axis to amount x (0 = a point)',
  bend: 'curves the shape through angle degrees along the axis',
};

/** The design's JSON Schema, with every definition inlined. */
export function modelSpecJsonSchema(): JsonSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zod 3.25's dual type identities; see mcp-shim/index.ts
  return zodToJsonSchema(ModelSpecSchema as any, { target: 'jsonSchema7', $refStrategy: 'none' }) as JsonSchema;
}

function typeOf(schema: JsonSchema, depth = 0): string {
  if (schema.pattern?.includes('0-9a-f')) return '"#rrggbb"';
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (schema.type === 'object' && schema.properties && depth < 2) {
    const fields = Object.entries(schema.properties).map(([key, prop]) => `${key}${schema.required?.includes(key) ? '' : '?'}: ${typeOf(prop, depth + 1)}`);
    return `{ ${fields.join(', ')} }`;
  }
  if (schema.anyOf) return schema.anyOf.map((arm) => typeOf(arm, depth + 1)).join(' | ');
  if (schema.type === 'number') {
    if (schema.exclusiveMinimum !== undefined) return 'number > 0';
    if (schema.minimum !== undefined && schema.minimum >= 0) return 'number ≥ 0';
    return 'number';
  }
  if (schema.type === 'array') {
    if (Array.isArray(schema.items)) return `[${schema.items.map((item) => typeOf(item, depth + 1)).join(', ')}]`;
    const inner = schema.items ? typeOf(schema.items as JsonSchema, depth + 1) : 'any';
    const bounds = [schema.minItems !== undefined ? `min ${schema.minItems}` : '', schema.maxItems !== undefined ? `max ${schema.maxItems}` : '']
      .filter(Boolean)
      .join(', ');
    return `[${inner}, ...]${bounds ? ` (${bounds})` : ''}`;
  }
  return schema.type ?? 'any';
}

/** The union arms of `parts[]`, as `{ shape, properties, required }`. */
function partVariants(schema: JsonSchema): { shape: string; properties: Record<string, JsonSchema>; required: string[] }[] {
  const items = schema.properties?.parts?.items;
  const arms = !Array.isArray(items) ? (items?.anyOf ?? []) : [];
  return arms
    .map((arm) => ({ shape: String(arm.properties?.shape?.const ?? ''), properties: arm.properties ?? {}, required: arm.required ?? [] }))
    .filter((arm) => arm.shape !== '');
}

/** Human-readable format reference, regenerated from the schema on every call. */
export function modelSpecReference(): string {
  const schema = modelSpecJsonSchema();
  const variants = partVariants(schema);
  const common = variants[0] ? Object.keys(variants[0].properties).filter((key) => variants.every((v) => key in v.properties)) : [];
  const lines: string[] = [
    `Design: { "name": string, "description"?: string, "parts": [ part, ... ] }  // 1 to ${MODEL_MAX_PARTS} parts`,
    '',
    'Every part has these fields:',
  ];
  const first = variants[0];
  for (const key of common) {
    const prop = first!.properties[key]!;
    const required = first!.required.includes(key);
    const fallback = prop.default !== undefined ? `, default ${JSON.stringify(prop.default)}` : '';
    const note =
      FIELD_HINTS[key] && key !== 'position' && key !== 'rotation'
        ? ` ${FIELD_HINTS[key]}`
        : key === 'shape'
        ? ` one of ${variants.map((v) => `"${v.shape}"`).join(', ')}`
        : key === 'id'
          ? ' stable handle for model_patch_parts; assigned for you when absent'
          : key === 'rotation'
            ? ' Euler degrees, applied X then Y then Z'
            : key === 'position'
              ? " world position of the part's origin"
              : '';
    lines.push(`- "${key}": ${key === 'shape' ? 'string' : typeOf(prop)}${required ? '' : ' (optional'}${fallback}${required ? '' : ')'}${note ? `,${note}` : ''}`);
  }
  lines.push('', 'Shapes and their own fields:');
  for (const variant of variants) {
    const own = Object.entries(variant.properties)
      .filter(([key]) => !common.includes(key))
      .map(([key, prop]) => `"${key}": ${typeOf(prop)}`);
    const hint = SHAPE_HINTS[variant.shape];
    lines.push(`- "${variant.shape}": ${own.join(', ') || '(no extra fields)'}${hint ? ` — ${hint}` : ''}`);
  }
  const modifierArms = (first?.properties.modifiers?.items as JsonSchema | undefined)?.anyOf ?? [];
  if (modifierArms.length > 0) {
    lines.push('', 'Modifiers (part "modifiers": [ { "type": ..., ...fields, "enabled"?: false }, ... ], applied in order):');
    for (const arm of modifierArms) {
      const own = Object.entries(arm.properties ?? {})
        .filter(([key]) => key !== 'type' && key !== 'enabled')
        .map(([key, prop]) => `"${key}": ${typeOf(prop)}${prop.default !== undefined ? ` (default ${JSON.stringify(prop.default)})` : ''}`);
      lines.push(`- "${String(arm.properties?.type?.const ?? '')}": ${own.join(', ')}${MODIFIER_HINTS[String(arm.properties?.type?.const)] ? ` — ${MODIFIER_HINTS[String(arm.properties?.type?.const)]}` : ''}`);
    }
  }
  return lines.join('\n');
}
