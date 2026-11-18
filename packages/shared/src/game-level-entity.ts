import { z } from 'zod';

/** The fields of one level object an agent or a prefab names (Phase 138 Theme A); split from the op language so prefabs can share it without an import cycle. */
export const LevelPropertyValueSchema = z.union([z.string().max(4000), z.number().finite(), z.boolean()]);
export type LevelPropertyValue = z.infer<typeof LevelPropertyValueSchema>;

const finite = z.number().finite();

export const LevelEntityFieldsSchema = z.object({
  type: z.string().min(1).max(64),
  name: z.string().max(200).optional(),
  x: finite,
  y: finite,
  width: finite.nonnegative().optional(),
  height: finite.nonnegative().optional(),
  rotation: finite.optional(),
  point: z.boolean().optional(),
  polyline: z.array(z.object({ x: finite, y: finite })).max(1000).optional(),
  properties: z.record(z.string().min(1).max(64), LevelPropertyValueSchema).optional(),
});
export type LevelEntityFields = z.infer<typeof LevelEntityFieldsSchema>;

