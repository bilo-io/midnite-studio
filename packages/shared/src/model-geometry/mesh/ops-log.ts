import { z } from 'zod';

/**
 * The operation log beside a sculpt mesh — `<stem>.ops.jsonl` (Phase 104 Theme A).
 *
 * The binary holds the mesh as it is now; the log says how it got there: one compact JSON line per
 * SDF edit, brush stroke, remesh, subdivide or conversion. It gives undo across reloads and a history
 * the agent can read back ("what have I already done to this head?"). It is a record, never the source
 * of truth — replaying it was rejected as slow to load and fragile across kernel changes.
 *
 * It is capped: once a file would pass {@link MODEL_OPS_LOG_CAP} lines it is rotated to
 * `<stem>.ops.1.jsonl` (replacing the previous rotation) and a fresh file starts, so the pair never
 * holds more than twice the cap.
 */

export const MODEL_OPS_LOG_CAP = 2000;
/** One line's ceiling; a stroke with thousands of points is summarised by its caller, not logged raw. */
export const MODEL_OPS_LINE_MAX = 16 * 1024;

export const MODEL_OP_KINDS = ['convert', 'sdf', 'stroke', 'mask', 'remesh', 'subdivide', 'decimate', 'retopo', 'unwrap', 'bake', 'material', 'paint', 'save'] as const;
export type ModelOpKind = (typeof MODEL_OP_KINDS)[number];

export const ModelOpEntrySchema = z.object({
  kind: z.enum(MODEL_OP_KINDS),
  /** ISO time the op was applied. */
  at: z.string().min(1).max(40),
  /** Who applied it: a person in the editor or an agent over MCP. */
  by: z.enum(['user', 'agent']).optional(),
  /** Content hash of the mesh file after this op, when the op ended in a save. */
  hash: z.string().regex(/^[0-9a-f]{8,64}$/).optional(),
  /** Op parameters — brush, radius, strength, target, SDF tree, resolution… Shape is per kind. */
  data: z.record(z.unknown()).optional(),
});
export type ModelOpEntry = z.infer<typeof ModelOpEntrySchema>;

/** `head.mesh.bin` → `head.ops.jsonl`; the rotated generation is `head.ops.1.jsonl`. */
export const opsLogPathFor = (meshSrc: string): string => meshSrc.replace(/\.mesh\.bin$/i, '') + '.ops.jsonl';
export const rotatedOpsLogPath = (opsPath: string): string => opsPath.replace(/\.ops\.jsonl$/i, '.ops.1.jsonl');

/** One entry as a line (no trailing newline). Throws when the entry is invalid or too large to log. */
export function serializeOp(entry: ModelOpEntry): string {
  const parsed = ModelOpEntrySchema.parse(entry);
  const line = JSON.stringify(parsed);
  if (line.length > MODEL_OPS_LINE_MAX) throw new Error(`An op-log entry may be at most ${MODEL_OPS_LINE_MAX} characters; summarise the ${entry.kind} first.`);
  return line;
}

/** Every valid line of a log, oldest first; lines that do not parse are counted, not fatal. */
export function parseOpsLog(text: string): { entries: ModelOpEntry[]; skipped: number } {
  const entries: ModelOpEntry[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed = ModelOpEntrySchema.safeParse(JSON.parse(line));
      if (parsed.success) entries.push(parsed.data);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { entries, skipped };
}

/**
 * Appends `entries` to a log whose current text is `current`. When the result would pass `cap` lines,
 * the existing text is handed back as `rotated` (to move to the `.1` file) and the new text holds only
 * the new entries.
 */
export function appendOps(current: string, entries: readonly ModelOpEntry[], cap = MODEL_OPS_LOG_CAP): { text: string; rotated: string | null } {
  const lines = entries.map(serializeOp);
  const existing = current.split('\n').filter((line) => line.trim() !== '');
  if (existing.length + lines.length > cap && existing.length > 0) {
    return { text: lines.slice(-cap).join('\n') + '\n', rotated: existing.join('\n') + '\n' };
  }
  const all = [...existing, ...lines].slice(-cap);
  return { text: all.length > 0 ? all.join('\n') + '\n' : '', rotated: null };
}
