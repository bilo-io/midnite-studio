import { z } from 'zod';

export const GrepHitKindSchema = z.enum(['match', 'context']);
export type GrepHitKind = z.infer<typeof GrepHitKindSchema>;

export const GrepHitSchema = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  kind: GrepHitKindSchema,
  text: z.string(),
});
export type GrepHit = z.infer<typeof GrepHitSchema>;
