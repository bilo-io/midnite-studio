/**
 * Media ▸ Models — the library layout and `model.json`.
 *
 * Every generation owns a **folder** under `.midnite/media/model/<group>/<model>/`:
 * the exports (`.obj`, `.mtl`, `.fbx`, `.glb`), the design sidecar (`<stem>.json`, the editable
 * `ModelSpec` — what the editor and the MCP tools read) and **`model.json`**, the manifest below.
 * A *group* is just a folder that holds other folders; it has no file of its own.
 *
 * `model.json` is deliberately open at the end: it is `passthrough`, and `anatomy`, `rig` and
 * `animations` are reserved optional slots, so a later rigging pass adds to it without a version bump
 * and an older build rewriting the file keeps what it does not understand.
 *
 * Legacy outputs (`<group>/<stem>.obj` beside `<stem>.json`, no folder) are still read — the tree
 * lists them as `legacy` models — and `migrate` moves them into folders without ever deleting.
 */
import { z } from 'zod';

import { type ModelSidecar, type ModelSpec } from './media-model';
import { SF3D_PROVIDER, SF3D_UPSTREAM_MODEL } from './media-model-sf3d';
import { type ModelAnatomy, type ModelClipKind, type ModelFacing, clipTiming } from './media-model-rig';
import { buildScene, sceneBounds, sceneStats } from './model-geometry';

export const MODEL_MANIFEST_FILE = 'model.json';
/** The most a folder name may be; matches `MediaProjectNameSchema`. */
export const MODEL_LIBRARY_NAME_MAX = 120;

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const ModelAgentSchema = z.object({
  /** `ollama`, an agent id (`claude`, `codex`…), `mcp` (an outside session built it) or `unknown`. */
  provider: z.string().min(1),
  /** The specific model — `qwen2.5-coder:7b`, `sonnet-5`; absent when the provider has no choice to name. */
  model: z.string().min(1).optional(),
  /** An agent iterated through the MCP tools rather than writing the design once. */
  iterative: z.boolean().optional(),
});
export type ModelAgent = z.infer<typeof ModelAgentSchema>;

export const ModelAuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1).optional(),
});
export type ModelAuthor = z.infer<typeof ModelAuthorSchema>;

export const ModelMaterialSummarySchema = z.object({
  color: z.string(),
  metalness: z.number(),
  roughness: z.number(),
  emissive: z.string(),
  opacity: z.number(),
  /** How many built parts use it. */
  parts: z.number().int().nonnegative(),
});
export type ModelMaterialSummary = z.infer<typeof ModelMaterialSummarySchema>;

export const ModelDetailsSchema = z.object({
  vertices: z.number().int().nonnegative(),
  /** Triangles — the mesh's polygon count as the exports carry it. */
  polygons: z.number().int().nonnegative(),
  parts: z.number().int().nonnegative(),
  bounds: z.object({ min: Vec3, max: Vec3, size: Vec3 }),
  materials: z.array(ModelMaterialSummarySchema),
});
export type ModelDetails = z.infer<typeof ModelDetailsSchema>;

export const ModelAttachmentSchema = z.object({
  /** The reference picture kept in the folder (`<stem>.ref.<ext>`). */
  file: z.string().min(1),
  /** What the vision model said about it. */
  description: z.string().optional(),
});
export type ModelAttachment = z.infer<typeof ModelAttachmentSchema>;

export const ModelManifestSchema = z
  .object({
    version: z.literal(1),
    /** The label the explorer shows; the folder name can differ after a rename. */
    name: z.string().min(1).max(MODEL_LIBRARY_NAME_MAX),
    agent: ModelAgentSchema,
    author: ModelAuthorSchema,
    prompt: z.string(),
    attachment: ModelAttachmentSchema.optional(),
    details: ModelDetailsSchema,
    /** Files of this model, relative to its folder. */
    files: z.object({
      design: z.string().optional(),
      obj: z.string().optional(),
      fbx: z.string().optional(),
      glb: z.string().optional(),
      /** The imported mesh an `asset` part draws (an SF3D result's `<stem>.asset.glb`). */
      asset: z.string().optional(),
    }),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1).optional(),
    // Rigging and animation, summarised from the design (`modelRigSummary`). Read loosely: an older
    // manifest may hold anything here, and the design file stays the source of truth.
    anatomy: z.unknown().optional(),
    rig: z.unknown().optional(),
    animations: z.unknown().optional(),
  })
  .passthrough();
export type ModelManifest = z.infer<typeof ModelManifestSchema>;

export function parseModelManifest(text: string): ModelManifest | null {
  try {
    const parsed = ModelManifestSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** `ollama:qwen2.5-coder:7b` / `agent:claude:sonnet-5 (iterative)` / `sf3d` / `mcp` → structured. */
export function agentFromEngine(engine: string): ModelAgent {
  const iterative = / \(iterative\)$/.test(engine);
  const label = engine.replace(/ \(iterative\)$/, '');
  if (label === SF3D_PROVIDER) return { provider: SF3D_PROVIDER, model: SF3D_UPSTREAM_MODEL };
  if (label.startsWith('ollama:')) return { provider: 'ollama', model: label.slice('ollama:'.length) };
  if (label.startsWith('agent:')) {
    const [agentId, ...rest] = label.slice('agent:'.length).split(':');
    const model = rest.join(':');
    return { provider: agentId || 'unknown', ...(model ? { model } : {}), ...(iterative ? { iterative } : {}) };
  }
  return { provider: label || 'unknown' };
}

/** Counts, bounds and materials of a design as built — what the details panel and tooltips read. */
export function computeModelDetails(spec: ModelSpec): ModelDetails {
  const parts = buildScene(spec);
  const stats = sceneStats(parts);
  const box = parts.length > 0 ? sceneBounds(parts) : { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };
  const size: [number, number, number] = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  const materials = new Map<string, ModelMaterialSummary>();
  for (const part of parts) {
    const m = part.material;
    const key = [part.color, m.metalness, m.roughness, m.emissive, m.opacity].join('|');
    const seen = materials.get(key);
    if (seen) seen.parts += 1;
    else materials.set(key, { color: part.color, metalness: m.metalness, roughness: m.roughness, emissive: m.emissive, opacity: m.opacity, parts: 1 });
  }
  return {
    vertices: stats.vertices,
    polygons: stats.triangles,
    parts: stats.parts,
    bounds: {
      min: box.min.map(round) as [number, number, number],
      max: box.max.map(round) as [number, number, number],
      size: size.map(round) as [number, number, number],
    },
    materials: [...materials.values()],
  };
}

/** What `model.json` says about a design's rig: enough for a listing, never enough to rebuild it. */
export type ModelRigSummary = {
  anatomy?: ModelAnatomy;
  rig?: { bones: number; facing: ModelFacing; bound: number };
  animations?: { name: string; kind: ModelClipKind; duration: number; loop: boolean }[];
};

export function modelRigSummary(spec: ModelSpec): ModelRigSummary {
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return {
    ...(spec.anatomy && spec.anatomy !== 'static' ? { anatomy: spec.anatomy } : {}),
    ...(spec.rig && spec.rig.bones.length > 0
      ? { rig: { bones: spec.rig.bones.length, facing: spec.rig.facing ?? '+z', bound: Object.keys(spec.rig.bind ?? {}).length } }
      : {}),
    ...(spec.animations && spec.animations.length > 0
      ? {
          animations: spec.animations.map((clip) => {
            const timing = clipTiming(clip);
            return { name: clip.name, kind: clip.kind, duration: round(timing.duration), loop: timing.loop };
          }),
        }
      : {}),
  };
}

/**
 * The manifest for a sidecar. `previous` keeps what an earlier manifest knew and this build does not
 * (author, creation time, a renamed label, future `rig`/`anatomy`/`animations`), so a re-save never drops it.
 */
export function buildModelManifest(input: {
  sidecar: ModelSidecar;
  /** The stem the exports share, e.g. `fox-20261003-101500`. */
  stem: string;
  author: ModelAuthor;
  now: Date;
  /** Files that exist in the folder, by name; omitted = assume the standard set. */
  present?: readonly string[];
  previous?: ModelManifest | null;
}): ModelManifest {
  const { sidecar, stem, previous } = input;
  const file = (ext: string): string | undefined => {
    const name = `${stem}.${ext}`;
    return input.present === undefined || input.present.includes(name) ? name : undefined;
  };
  const design = file('json');
  const obj = file('obj');
  const fbx = file('fbx');
  const glb = file('glb');
  const asset = sidecar.spec.parts.find((part) => part.shape === 'asset');
  const label = sidecar.spec.name !== 'model' ? sidecar.spec.name : sidecar.prompt.slice(0, 60).trim() || sidecar.spec.name;
  // The rig slots always follow the design, so a removed rig does not linger from `previous`.
  const kept: Record<string, unknown> = { ...(previous ?? {}) };
  delete kept.anatomy;
  delete kept.rig;
  delete kept.animations;
  return {
    ...kept,
    ...modelRigSummary(sidecar.spec),
    version: 1,
    name: previous?.name ?? label,
    agent: previous?.agent ?? agentFromEngine(sidecar.engine),
    author: previous?.author ?? input.author,
    prompt: sidecar.prompt,
    ...(sidecar.reference
      ? { attachment: { file: sidecar.reference, ...(sidecar.imageDescription ? { description: sidecar.imageDescription } : {}) } }
      : {}),
    details: computeModelDetails(sidecar.spec),
    files: { ...(design ? { design } : {}), ...(obj ? { obj } : {}), ...(fbx ? { fbx } : {}), ...(glb ? { glb } : {}), ...(asset?.shape === 'asset' ? { asset: asset.src } : {}) },
    createdAt: previous?.createdAt ?? sidecar.createdAt,
    updatedAt: input.now.toISOString(),
  };
}

// --- the library tree -----------------------------------------------------------------------------

export const ModelLibraryFileSchema = z.object({ name: z.string(), size: z.number().nonnegative(), mtimeMs: z.number().nonnegative() });
export type ModelLibraryFile = z.infer<typeof ModelLibraryFileSchema>;

export type ModelLibraryModel = {
  kind: 'model';
  /** The folder's name (a legacy model: its stem). */
  name: string;
  /** Relative to the model root: `<group>/<folder>`. A legacy model's is `<group>/<stem>`, which is no directory. */
  path: string;
  /** `null` when there is no valid `model.json` (hand-added folder, or a legacy output). */
  manifest: ModelManifest | null;
  files: ModelLibraryFile[];
  /** True for `<group>/<stem>.obj` with no folder of its own. */
  legacy: boolean;
  mtimeMs: number;
};
export type ModelLibraryGroup = {
  kind: 'group';
  name: string;
  path: string;
  children: ModelLibraryNode[];
  mtimeMs: number;
};
export type ModelLibraryNode = ModelLibraryModel | ModelLibraryGroup;

export const ModelLibraryNodeSchema: z.ZodType<ModelLibraryNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('model'),
      name: z.string(),
      path: z.string(),
      manifest: ModelManifestSchema.nullable(),
      files: z.array(ModelLibraryFileSchema),
      legacy: z.boolean(),
      mtimeMs: z.number(),
    }),
    z.object({ kind: z.literal('group'), name: z.string(), path: z.string(), children: z.array(ModelLibraryNodeSchema), mtimeMs: z.number() }),
  ]),
) as z.ZodType<ModelLibraryNode>;

export const ModelLibraryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MODEL_LIBRARY_NAME_MAX)
  .regex(/^[^/\\\0]+$/, 'must be one path segment')
  .refine((name) => !name.startsWith('.'), 'must not start with a dot');

const LibraryPath = z.string().min(1).max(512);

export const ModelLibraryRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('list'), repoId: z.string().min(1) }),
  z.object({ op: z.literal('migrate'), repoId: z.string().min(1) }),
  z.object({ op: z.literal('rename'), repoId: z.string().min(1), path: LibraryPath, to: ModelLibraryNameSchema }),
  /** `toGroup` is a group's path, or `''` for the root (groups only). */
  z.object({ op: z.literal('move'), repoId: z.string().min(1), path: LibraryPath, toGroup: z.string().max(512) }),
  z.object({ op: z.literal('delete'), repoId: z.string().min(1), path: LibraryPath }),
  z.object({ op: z.literal('duplicate'), repoId: z.string().min(1), path: LibraryPath }),
  z.object({ op: z.literal('newGroup'), repoId: z.string().min(1), parent: z.string().max(512), name: ModelLibraryNameSchema }),
]);
export type ModelLibraryRequest = z.infer<typeof ModelLibraryRequestSchema>;
export type ModelLibraryOp = ModelLibraryRequest['op'];
export type ModelLibraryMigrateResult = { migrated: number; skipped: number };

/** Whether `path` is `ancestor` or sits below it — what stops a folder moving into itself. */
export const isWithinLibraryPath = (ancestor: string, path: string): boolean => path === ancestor || path.startsWith(`${ancestor}/`);
export const libraryParent = (path: string): string => path.split('/').slice(0, -1).join('/');
export const libraryBase = (path: string): string => path.split('/').pop() ?? path;
