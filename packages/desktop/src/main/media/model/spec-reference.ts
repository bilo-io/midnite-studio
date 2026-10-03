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
};

/** The design's JSON Schema, with every definition inlined. */
export function modelSpecJsonSchema(): JsonSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zod 3.25's dual type identities; see mcp-shim/index.ts
  return zodToJsonSchema(ModelSpecSchema as any, { target: 'jsonSchema7', $refStrategy: 'none' }) as JsonSchema;
}

function typeOf(schema: JsonSchema): string {
  if (schema.pattern?.includes('0-9a-f')) return '"#rrggbb"';
  if (schema.type === 'number') {
    if (schema.exclusiveMinimum !== undefined) return 'number > 0';
    if (schema.minimum !== undefined && schema.minimum >= 0) return 'number ≥ 0';
    return 'number';
  }
  if (schema.type === 'array') {
    if (Array.isArray(schema.items)) return `[${schema.items.map(typeOf).join(', ')}]`;
    const inner = schema.items ? typeOf(schema.items) : 'any';
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
      key === 'shape'
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
  return lines.join('\n');
}
