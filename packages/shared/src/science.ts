/**
 * Science notebooks (Phase 126) — prose, computed cells, plots and molecules, saved one JSON file per notebook.
 *
 * One IPC channel carries every op (`ScienceRequestSchema`, the `mediaAnimation` shape), each answering the
 * `GitOpResult` envelope. The notebook id is the file name, so its regex is the path jail.
 *
 * Imports `zod` and nothing else: this is the wire contract.
 */
import { z } from 'zod';

export const ScienceNotebookIdSchema = z.string().regex(/^nb-[a-z0-9]{12}$/);
export type ScienceNotebookId = z.infer<typeof ScienceNotebookIdSchema>;

export const SCIENCE_DISCIPLINES = ['maths', 'physics', 'chemistry', 'biology', 'general'] as const;
export const ScienceDisciplineSchema = z.enum(SCIENCE_DISCIPLINES);
export type ScienceDiscipline = z.infer<typeof ScienceDisciplineSchema>;

const CellIdSchema = z.string().regex(/^c-[a-z0-9]{8}$/);

/** Longest molecule file a notebook embeds. */
export const SCIENCE_MOLECULE_MAX_BYTES = 10 * 1024 * 1024;
export const SCIENCE_MAX_CELLS = 500;

export const ScienceCellSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('markdown'), id: CellIdSchema, source: z.string().max(100_000) }),
  z.object({ kind: z.literal('compute'), id: CellIdSchema, source: z.string().max(20_000) }),
  z.object({
    kind: z.literal('plot'),
    id: CellIdSchema,
    series: z
      .array(z.object({ expr: z.string().min(1).max(500), label: z.string().max(80).optional() }))
      .min(1)
      .max(4),
    x: z.object({ min: z.number().finite(), max: z.number().finite() }).refine((r) => r.max > r.min),
    y: z.union([z.literal('auto'), z.object({ min: z.number().finite(), max: z.number().finite() })]),
  }),
  z.object({
    kind: z.literal('molecule'),
    id: CellIdSchema,
    name: z.string().max(200),
    format: z.enum(['xyz', 'pdb', 'mol']),
    text: z.string().max(SCIENCE_MOLECULE_MAX_BYTES),
  }),
]);
export type ScienceCell = z.infer<typeof ScienceCellSchema>;

export const ScienceNotebookSchema = z.object({
  version: z.literal(1),
  id: ScienceNotebookIdSchema,
  title: z.string().min(1).max(200),
  discipline: ScienceDisciplineSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  cells: z.array(ScienceCellSchema).max(SCIENCE_MAX_CELLS),
});
export type ScienceNotebook = z.infer<typeof ScienceNotebookSchema>;

export const ScienceNotebookSummarySchema = z.object({
  id: ScienceNotebookIdSchema,
  title: z.string(),
  discipline: ScienceDisciplineSchema,
  updatedAt: z.string(),
  cellCount: z.number().int().nonnegative(),
});
export type ScienceNotebookSummary = z.infer<typeof ScienceNotebookSummarySchema>;

/**
 * Reads a stored notebook of any known version up to the current one. `version: 1` parses as-is; anything
 * else is `null`, and the store quarantines the file. A v2 adds an arm here, not a new seam.
 */
export function migrateScienceNotebook(raw: unknown): ScienceNotebook | null {
  const parsed = ScienceNotebookSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const ScienceRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('list') }),
  z.object({ op: z.literal('read'), id: ScienceNotebookIdSchema }),
  z.object({
    op: z.literal('create'),
    title: z.string().min(1).max(200),
    discipline: ScienceDisciplineSchema,
    cells: z.array(ScienceCellSchema).max(SCIENCE_MAX_CELLS),
  }),
  z.object({ op: z.literal('write'), notebook: ScienceNotebookSchema }),
  z.object({ op: z.literal('rename'), id: ScienceNotebookIdSchema, title: z.string().min(1).max(200) }),
  z.object({ op: z.literal('remove'), id: ScienceNotebookIdSchema }),
  /** Opens the native picker for a molecule file (Theme F). */
  z.object({ op: z.literal('importStructure') }),
]);
export type ScienceRequest = z.infer<typeof ScienceRequestSchema>;
