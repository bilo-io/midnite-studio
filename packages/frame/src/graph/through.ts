import type { GraphRow } from '@midnite/studio-shared';

const NONE: number[] = [];

/**
 * A row's pass-through lanes (Phase 77 Theme B). Rows cross IPC unparsed, so a row from a fixture,
 * a cache or a mock written before `through` existed arrives without it; `GraphRowSchema` defaults
 * the field to `[]` for the same reason, and this is that default for the renderer's own reads.
 */
export const throughOf = (row: GraphRow): number[] =>
  (row as { through?: number[] }).through ?? NONE;
