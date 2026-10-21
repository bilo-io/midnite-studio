/**
 * Media ▸ Models — sculpt mesh storage over IPC (Phase 104 Theme A).
 *
 * A `sculpt` part's geometry is a `<stem>.mesh.bin` beside the design, with its op log
 * `<stem>.ops.jsonl` next to it (`model-geometry/mesh/`). The renderer's sculpt worker owns the live
 * mesh; it reaches disk only through this one channel, an `op` union answered in main inside the media
 * store's jail. Every op answers a `GitOpResult` — a corrupt or outdated file comes back as a readable
 * failure, never a throw.
 */
import { z } from 'zod';

import { MediaProjectNameSchema } from './media';
import { ModelSculptSrcSchema } from './media-model';
import { ModelMapSrcSchema, PBR_SIZE_MAX } from './media-model-pbr';
import { ModelOpEntrySchema, type ModelOpEntry } from './model-geometry/mesh/ops-log';

/** Bytes are structured-cloned across IPC, so main sees an `ArrayBuffer` or a `Uint8Array` (a `Buffer` is one). */
const Bytes = z.custom<ArrayBuffer | Uint8Array>((value) => value instanceof ArrayBuffer || value instanceof Uint8Array, 'expected mesh bytes');

const scope = {
  repoId: z.string().min(1),
  /** The top-level group the model lives in. */
  project: MediaProjectNameSchema,
  /** The design's folder inside `project` (`fox`), `''` for a flat legacy model. */
  dir: z
    .string()
    .max(512)
    .refine((dir) => !dir.split('/').some((segment) => segment === '..' || segment === '.'), 'must stay inside the project'),
  /** The mesh file, relative to `dir` — the part's `src`. */
  src: ModelSculptSrcSchema,
};

/** Most op-log entries one call may append, and the most a read hands back. */
export const MODEL_MESH_OPS_BATCH_MAX = 500;

export const ModelMeshRequestSchema = z.discriminatedUnion('op', [
  /** The file's bytes, validated (header, size, checksum) before they are sent. */
  z.object({ op: z.literal('read'), ...scope }),
  /** Writes a `.mesh.bin` the renderer encoded; refused unless it decodes. Optional op-log entries ride along. */
  z.object({ op: z.literal('write'), ...scope, data: Bytes, ops: z.array(ModelOpEntrySchema).max(MODEL_MESH_OPS_BATCH_MAX).optional() }),
  z.object({ op: z.literal('appendOps'), ...scope, ops: z.array(ModelOpEntrySchema).min(1).max(MODEL_MESH_OPS_BATCH_MAX) }),
  /** The newest `limit` entries (default all of the current file), oldest first. */
  z.object({ op: z.literal('readOps'), ...scope, limit: z.number().int().min(1).max(MODEL_MESH_OPS_BATCH_MAX * 4).optional() }),
  /**
   * Writes a texture PNG beside the design (Phase 104 Theme G: a paint layer's channel, or the flattened set).
   * Refused unless the bytes are a PNG no larger than {@link PBR_SIZE_MAX} on a side. Reads go through
   * `mstudio-file://`, like every other file in the model folder.
   */
  z.object({ op: z.literal('writeTexture'), ...scope, src: ModelMapSrcSchema, data: Bytes }),
]);
export const MODEL_TEXTURE_MAX_EDGE = PBR_SIZE_MAX;
export type ModelMeshRequest = z.infer<typeof ModelMeshRequestSchema>;
export type ModelMeshOp = ModelMeshRequest['op'];

/** What a saved mesh is: the values a `sculpt` part records. */
export const ModelMeshInfoSchema = z.object({
  src: z.string(),
  hash: z.string(),
  vertices: z.number().int().nonnegative(),
  triangles: z.number().int().nonnegative(),
  multiresLevel: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});
export type ModelMeshInfo = z.infer<typeof ModelMeshInfoSchema>;

export const ModelMeshResultSchema = z.object({
  info: ModelMeshInfoSchema.optional(),
  /** `read` only: the file. */
  data: Bytes.optional(),
  /** `readOps`: entries oldest first; `skipped` counts lines that did not parse. */
  entries: z.array(ModelOpEntrySchema).optional(),
  skipped: z.number().int().nonnegative().optional(),
  /** `write`/`appendOps`: the log passed its cap and was rotated to `<stem>.ops.1.jsonl`. */
  rotated: z.boolean().optional(),
  /** `writeTexture`: what a part records for the file. */
  texture: z.object({ src: z.string(), hash: z.string(), width: z.number().int(), height: z.number().int() }).optional(),
});
export type ModelMeshResult = {
  info?: ModelMeshInfo;
  data?: Uint8Array;
  entries?: ModelOpEntry[];
  skipped?: number;
  rotated?: boolean;
  texture?: { src: string; hash: string; width: number; height: number };
};
