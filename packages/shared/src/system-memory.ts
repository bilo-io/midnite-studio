/** `systemMemory` (Phase 98 Theme I) — this Mac's installed RAM, read once, for gating model downloads. */
import { z } from 'zod';

export const SystemMemoryResponse = z.object({ totalBytes: z.number().int().positive() });
export type SystemMemoryResponse = z.infer<typeof SystemMemoryResponse>;
