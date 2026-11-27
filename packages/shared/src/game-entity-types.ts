import { z } from 'zod';
import type { GameManifest } from './media-game';

/**
 * Entity type schemas (Phase 142 Theme A): what a level object of a given `type` carries, as typed fields. A game may
 * declare its own in the manifest's optional `entityTypes`; they are merged over `GAME_ENTITY_DEFAULT_SCHEMAS` by `type`.
 * Pure and zod-only, so the editor, the validator and the MCP tools read one definition.
 */

/** What a game asset can be; the manifest's `assets` and an `asset` field both use it. */
export const GAME_ASSET_KINDS = ['terrain', 'sprite', 'tileset', 'map', 'background', 'model', 'image', 'audio', 'animation'] as const;

/** A field name is a Tiled property name the game reads: a letter first, then letters, digits and `_`; `midnite*` is reserved. */
export const FieldNameSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/)
  .refine((n) => !n.startsWith('midnite'), 'midnite.* names are reserved');

const label = z.string().max(40).optional();
const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

export const GameEntityFieldSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('number'),
    name: FieldNameSchema,
    label,
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    integer: z.boolean().default(false),
    default: z.number().optional(),
    required: z.boolean().default(false),
  }),
  z.object({ kind: z.literal('bool'), name: FieldNameSchema, label, default: z.boolean().optional() }),
  z.object({
    kind: z.literal('enum'),
    name: FieldNameSchema,
    label,
    options: z.array(z.string().min(1).max(40)).min(1).max(32),
    default: z.string().optional(),
    required: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('string'),
    name: FieldNameSchema,
    label,
    maxLength: z.number().int().max(4000).default(200),
    default: z.string().optional(),
    required: z.boolean().default(false),
  }),
  z.object({ kind: z.literal('color'), name: FieldNameSchema, label, default: HexColor.optional() }),
  z.object({ kind: z.literal('asset'), name: FieldNameSchema, label, assetKind: z.enum(GAME_ASSET_KINDS), required: z.boolean().default(false) }),
  z.object({ kind: z.literal('link'), name: FieldNameSchema, label, targetTypes: z.array(z.string()).max(16).optional(), required: z.boolean().default(false) }),
]);
export type GameEntityField = z.infer<typeof GameEntityFieldSchema>;

export const GameEntityTypeSchema = z.object({
  type: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  label: z.string().max(40).optional(),
  dimension: z.enum(['2d', '3d', 'both']).default('both'),
  /** A `react-icons/lu` export name; checked against the icon set in the renderer only. */
  icon: z.string().max(40).optional(),
  color: HexColor.optional(),
  fields: z.array(GameEntityFieldSchema).max(32).default([]),
});
export type GameEntityType = z.infer<typeof GameEntityTypeSchema>;

/**
 * The types the editor knows without a manifest entry, with only the fields the starters and the kit already read
 * (`game-entity-types.test.ts` greps `templates/media-game` for every name). `spawner` is the first typed entity:
 * its two fields are exactly what the environment popover and the Spawn zone tool write (`spawnerInfo`).
 */
export const GAME_ENTITY_DEFAULT_SCHEMAS: readonly GameEntityType[] = z.array(GameEntityTypeSchema).parse([
  { type: 'spawn' },
  { type: 'exit' },
  {
    type: 'enemy',
    fields: [
      { kind: 'number', name: 'speed', min: 0, max: 20 },
      { kind: 'number', name: 'hp', min: 1, max: 999, integer: true },
    ],
  },
  { type: 'pickup' },
  { type: 'hazard', dimension: '2d' },
  { type: 'checkpoint' },
  { type: 'trigger', fields: [{ kind: 'link', name: 'target' }] },
  { type: 'npc' },
  {
    type: 'spawner',
    label: 'Spawn zone',
    fields: [
      { kind: 'string', name: 'spawns', label: 'Spawns', default: 'traffic' },
      { kind: 'number', name: 'density', label: 'Density', min: 0, step: 0.25, default: 1 },
    ],
  },
  {
    type: 'prop',
    dimension: '3d',
    fields: [
      { kind: 'asset', name: 'model', assetKind: 'model' },
      { kind: 'number', name: 'scale', min: 0.05, max: 20 },
    ],
  },
  {
    type: 'light',
    dimension: '3d',
    fields: [
      { kind: 'color', name: 'color' },
      { kind: 'number', name: 'intensity', min: 0 },
      { kind: 'number', name: 'range', min: 0 },
    ],
  },
  { type: 'path', dimension: '3d' },
]);

const inDimension = (t: GameEntityType, dimension: '2d' | '3d'): boolean => t.dimension === 'both' || t.dimension === dimension;

/** The types for one dimension: the defaults, then the manifest's `entityTypes` overriding by `type` (new types are appended). */
export function entityTypesFor(manifest: Pick<GameManifest, 'entityTypes'> | null | undefined, dimension: '2d' | '3d'): readonly GameEntityType[] {
  const out = GAME_ENTITY_DEFAULT_SCHEMAS.filter((t) => inDimension(t, dimension));
  for (const t of manifest?.entityTypes ?? []) {
    if (!inDimension(t, dimension)) continue;
    const i = out.findIndex((d) => d.type === t.type);
    if (i >= 0) out[i] = t;
    else out.push(t);
  }
  return out;
}

/** One type's schema: the manifest's entry, else the default, else `null` (an undeclared type is allowed, just untyped). */
export function entitySchemaFor(manifest: Pick<GameManifest, 'entityTypes'> | null | undefined, type: string, dimension?: '2d' | '3d'): GameEntityType | null {
  const pick = (list: readonly GameEntityType[]): GameEntityType | undefined => list.find((t) => t.type === type && (!dimension || inDimension(t, dimension)));
  return pick(manifest?.entityTypes ?? []) ?? pick(GAME_ENTITY_DEFAULT_SCHEMAS) ?? null;
}

/** The Tiled property type a field is stored as. */
export function fieldTiledType(field: GameEntityField): 'int' | 'float' | 'bool' | 'string' | 'color' | 'object' | 'file' {
  switch (field.kind) {
    case 'number':
      return field.integer ? 'int' : 'float';
    case 'bool':
      return 'bool';
    case 'enum':
    case 'string':
    case 'asset':
      return 'string';
    case 'color':
      return 'color';
    case 'link':
      return 'object';
  }
}
