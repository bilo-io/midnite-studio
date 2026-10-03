/**
 * Media ▸ Models — the wire contract for LLM-authored 3D models.
 *
 * An LLM does not emit meshes well, but it emits *structured descriptions*
 * reliably. So generation is two steps: the model writes a `ModelSpec` (a flat
 * list of coloured, transformed primitives — see `MODEL_SHAPES`), main
 * validates it with these schemas and builds the geometry itself, then writes
 * `<name>.obj` (+ `.mtl`), `<name>.fbx` and a `<name>.json` sidecar holding the
 * spec into `.midnite/media/model/<project>/`.
 *
 * Coordinates are metres-ish, right-handed, **Y up**; rotations are Euler
 * degrees applied X → Y → Z; a part is built at the origin, then scaled,
 * rotated and translated (in that order).
 */
import { z } from 'zod';

import { LoopModelSchema } from './loops';
import { MediaProjectNameSchema } from './media';

// --- the spec an LLM writes ----------------------------------------------------

/**
 * The one part cap — schema, prompts and MCP tools all read it. 256 rather than the original 64/128:
 * groups, instanced copies and the operand parts of a boolean all count, and an agent building
 * iteratively adds detail pass by pass.
 */
export const MODEL_MAX_PARTS = 256;
export const MODEL_NAME_MAX = 60;
export const MODEL_MAX_DIMENSION = 1000;
export const MODEL_PROMPT_MAX = 4000;
/** Raw image bytes the attachment may carry (before base64). */
export const MODEL_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Most modifiers one part may stack. */
export const MODEL_MAX_MODIFIERS = 12;
/** Custom `mesh` parts: vertices and faces an LLM (or a person) may write by hand. */
export const MODEL_MESH_MAX_VERTICES = 2000;
export const MODEL_MESH_MAX_FACES = 4000;
/** Radial detail bounds for round primitives (`segments`). */
export const MODEL_SEGMENTS_MIN = 3;
export const MODEL_SEGMENTS_MAX = 96;
/** Most triangles one built part, and a whole built design, may reach — the guard that keeps a modifier stack bounded. */
export const MODEL_MAX_PART_TRIANGLES = 60_000;
export const MODEL_MAX_SCENE_TRIANGLES = 400_000;

const dimension = z.number().finite().positive().max(MODEL_MAX_DIMENSION);
const coord = z.number().finite().min(-MODEL_MAX_DIMENSION).max(MODEL_MAX_DIMENSION);
const Vec3Schema = z.tuple([coord, coord, coord]);
/** A scale component: any non-zero finite number — a negative one mirrors the part across that axis. */
const scalar = z
  .number()
  .finite()
  .min(-MODEL_MAX_DIMENSION)
  .max(MODEL_MAX_DIMENSION)
  .refine((n) => n !== 0, 'must not be 0');
/** A reference to another part: its `id`, or its `name` when that is unique. */
const partRef = z.string().trim().min(1).max(MODEL_NAME_MAX);

/** `#rgb` or `#rrggbb`. */
export const ModelColorSchema = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'must be a #rrggbb hex colour');

/** PBR surface: metalness/roughness as glTF defines them, an emissive glow, and opacity. */
export const ModelMaterialSchema = z.object({
  metalness: z.number().finite().min(0).max(1).optional(),
  roughness: z.number().finite().min(0).max(1).optional(),
  emissive: ModelColorSchema.optional(),
  emissiveIntensity: z.number().finite().min(0).max(10).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
});
export type ModelMaterial = z.infer<typeof ModelMaterialSchema>;

const axis = z.enum(['x', 'y', 'z']);
const modifierBase = { enabled: z.boolean().optional() };

/**
 * A mesh operation applied to a part's own geometry, in order, before its transform. Deformers
 * (`twist`, `taper`, `bend`) refine the mesh first so a box bends smoothly.
 */
export const ModelModifierSchema = z.discriminatedUnion('type', [
  /** Chamfers every hard edge by `amount` (a distance in the part's own units). */
  z.object({ ...modifierBase, type: z.literal('bevel'), amount: dimension }),
  /** Loop subdivision: each level quadruples the triangles and rounds the surface. */
  z.object({ ...modifierBase, type: z.literal('subdivide'), levels: z.number().int().min(1).max(3).default(1) }),
  /** Adds a reflected copy across the plane `axis = offset` (in the part's own space). */
  z.object({
    ...modifierBase,
    type: z.literal('mirror'),
    axis,
    offset: z.number().finite().min(-MODEL_MAX_DIMENSION).max(MODEL_MAX_DIMENSION).default(0),
  }),
  /** `count` copies in total, each shifted by `offset` from the last. */
  z.object({ ...modifierBase, type: z.literal('array'), count: z.number().int().min(2).max(64), offset: Vec3Schema }),
  /** `count` copies spun evenly round `axis` through the origin; `radius` first moves the shape out from the axis. */
  z.object({
    ...modifierBase,
    type: z.literal('radialArray'),
    count: z.number().int().min(2).max(64),
    axis: axis.default('y'),
    radius: z.number().finite().min(0).max(MODEL_MAX_DIMENSION).default(0),
  }),
  /** Rotates the shape about `axis` by up to `angle` degrees, in proportion to the distance along it. */
  z.object({ ...modifierBase, type: z.literal('twist'), angle: z.number().finite().min(-3600).max(3600), axis: axis.default('y') }),
  /** Scales the far end across `axis` to `amount` × (1 = unchanged, 0 = a point), linearly. */
  z.object({ ...modifierBase, type: z.literal('taper'), amount: z.number().finite().min(0).max(8), axis: axis.default('y') }),
  /** Bends the shape along `axis` through `angle` degrees. */
  z.object({ ...modifierBase, type: z.literal('bend'), angle: z.number().finite().min(-340).max(340), axis: axis.default('y') }),
]);
export type ModelModifier = z.infer<typeof ModelModifierSchema>;
export const MODEL_MODIFIER_TYPES = ModelModifierSchema.options.map((o) => o.shape.type.value) as ModelModifier['type'][];

/** How a part combines with its `target`: it is consumed (not drawn on its own) and carves/adds/clips the target. */
export const MODEL_BOOLEAN_OPS = ['union', 'subtract', 'intersect'] as const;
export type ModelBooleanOp = (typeof MODEL_BOOLEAN_OPS)[number];

const point3 = Vec3Schema;
const point2 = z.tuple([coord, coord]);

const partBase = {
  /** Stable handle for `model_patch_parts`/`parent`/`target`; assigned by main when absent, so a one-shot design needs none. */
  id: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(MODEL_NAME_MAX).default('part'),
  /** The part's origin in its parent's space (the world, when it has no parent). */
  position: Vec3Schema.default([0, 0, 0]),
  /** Euler degrees, applied X → Y → Z. */
  rotation: Vec3Schema.default([0, 0, 0]),
  scale: z.tuple([scalar, scalar, scalar]).default([1, 1, 1]),
  color: ModelColorSchema.default('#b0b0b0'),
  /** Another part (a `group`) whose transform this one inherits. */
  parent: partRef.optional(),
  /** A point in the part's own space that rotation and scale pivot about (and that `position` places). */
  pivot: Vec3Schema.optional(),
  material: ModelMaterialSchema.optional(),
  modifiers: z.array(ModelModifierSchema).max(MODEL_MAX_MODIFIERS).optional(),
  /** Boolean: this part is consumed by `target` instead of being drawn. */
  op: z.enum(MODEL_BOOLEAN_OPS).optional(),
  /** The part a boolean `op` applies to; default: the nearest earlier solid part. */
  target: partRef.optional(),
  /** Radial detail of a round shape (default 32). */
  segments: z.number().int().min(MODEL_SEGMENTS_MIN).max(MODEL_SEGMENTS_MAX).optional(),
  /** Edges sharper than this many degrees stay hard; softer ones are shaded smooth. */
  smoothAngle: z.number().finite().min(0).max(180).optional(),
  /** Left out of every file, preview and render (editor: hidden). */
  hidden: z.boolean().optional(),
  /** Editor only: cannot be picked or moved. */
  locked: z.boolean().optional(),
};

const ModelSectionSchema = z.object({ y: coord, outline: z.array(point2).min(3).max(32) });
export type ModelSection = z.infer<typeof ModelSectionSchema>;

/** The shapes a part can be, in prompt order. */
export const ModelPartSchema = z.discriminatedUnion('shape', [
  z.object({ ...partBase, shape: z.literal('box'), size: z.tuple([dimension, dimension, dimension]) }),
  z.object({ ...partBase, shape: z.literal('sphere'), radius: dimension }),
  z.object({
    ...partBase,
    shape: z.literal('cylinder'),
    radiusTop: z.number().finite().min(0).max(MODEL_MAX_DIMENSION),
    radiusBottom: z.number().finite().min(0).max(MODEL_MAX_DIMENSION),
    height: dimension,
  }),
  z.object({ ...partBase, shape: z.literal('cone'), radius: dimension, height: dimension }),
  z.object({ ...partBase, shape: z.literal('torus'), radius: dimension, tube: dimension }),
  /** A `[radius, y]` profile revolved around the Y axis — vases, bottles, chess pieces. */
  z.object({
    ...partBase,
    shape: z.literal('lathe'),
    profile: z
      .array(z.tuple([z.number().finite().min(0).max(MODEL_MAX_DIMENSION), coord]))
      .min(2)
      .max(32),
  }),
  /** A `[x, z]` outline extruded up the Y axis from y=0 to `height` — walls, signs, cut-outs. */
  z.object({
    ...partBase,
    shape: z.literal('extrude'),
    outline: z.array(point2).min(3).max(64),
    height: dimension,
  }),
  /** A cylinder with hemispherical ends: `height` is the straight middle section, the ends add `radius` each. */
  z.object({ ...partBase, shape: z.literal('capsule'), radius: dimension, height: z.number().finite().min(0).max(MODEL_MAX_DIMENSION) }),
  /** A box with rounded edges and corners (`radius` is clamped to half the smallest side). */
  z.object({ ...partBase, shape: z.literal('roundedBox'), size: z.tuple([dimension, dimension, dimension]), radius: dimension }),
  /** A ramp: a right triangle (high at -Z, ground level at +Z) extruded along X. */
  z.object({ ...partBase, shape: z.literal('wedge'), size: z.tuple([dimension, dimension, dimension]) }),
  /** A regular `sides`-gon prism, axis along Y. */
  z.object({ ...partBase, shape: z.literal('prism'), radius: dimension, height: dimension, sides: z.number().int().min(3).max(64).default(6) }),
  /** A sphere stretched to `radii` on each axis. */
  z.object({ ...partBase, shape: z.literal('ellipsoid'), radii: z.tuple([dimension, dimension, dimension]) }),
  /** A round pipe along a spline through `path`; the radius runs linearly from `radius` to `radiusEnd`. */
  z.object({
    ...partBase,
    shape: z.literal('tube'),
    path: z.array(point3).min(2).max(64),
    radius: dimension,
    radiusEnd: dimension.optional(),
    closed: z.boolean().optional(),
    spline: z.boolean().default(true),
  }),
  /** A 2-D `[x, y]` profile swept along `path` (profile x/y span the plane across the path). */
  z.object({
    ...partBase,
    shape: z.literal('sweep'),
    profile: z.array(point2).min(3).max(32),
    path: z.array(point3).min(2).max(64),
    closed: z.boolean().optional(),
    spline: z.boolean().default(true),
    /** Scale of the profile at the end of the path (default 1). */
    scaleEnd: z.number().finite().min(0.01).max(20).optional(),
    /** Degrees the profile turns over the whole path. */
    twist: z.number().finite().min(-3600).max(3600).optional(),
  }),
  /** Skins through `sections`: each is an `[x, z]` outline at a height `y`; outlines are matched point to point. */
  z.object({ ...partBase, shape: z.literal('loft'), sections: z.array(ModelSectionSchema).min(2).max(16) }),
  /** A hand-written mesh: `vertices` and `faces` (3 or 4 vertex indices each, counter-clockwise seen from outside). */
  z.object({
    ...partBase,
    shape: z.literal('mesh'),
    vertices: z.array(point3).min(3).max(MODEL_MESH_MAX_VERTICES),
    faces: z
      .array(z.array(z.number().int().min(0)).min(3).max(4))
      .min(1)
      .max(MODEL_MESH_MAX_FACES),
  }),
  /** A transform-only node: other parts name it as their `parent`. */
  z.object({ ...partBase, shape: z.literal('group') }),
  /** A copy of another part (or a whole group) at this part's own transform — repeats geometry without repeating its fields. */
  z.object({ ...partBase, shape: z.literal('instance'), source: partRef }),
]);
export type ModelPart = z.infer<typeof ModelPartSchema>;

/** The shapes a part can be, in prompt order — derived from the union, so a new kind appears here by being added there. */
export const MODEL_SHAPES = ModelPartSchema.options.map((option) => option.shape.shape.value) as ModelPart['shape'][];
export type ModelPartInput = z.input<typeof ModelPartSchema>;

export const ModelSpecSchema = z.object({
  name: z.string().trim().min(1).max(MODEL_NAME_MAX).default('model'),
  description: z.string().max(500).optional(),
  parts: z.array(ModelPartSchema).min(1).max(MODEL_MAX_PARTS),
});
export type ModelSpec = z.infer<typeof ModelSpecSchema>;

// --- files ---------------------------------------------------------------------

/** What the Models tab lists in its explorer and can load into the viewer. */
export const MODEL_FILE_EXTENSIONS = ['obj', 'fbx', 'glb'] as const;
export type ModelFileExtension = (typeof MODEL_FILE_EXTENSIONS)[number];

export function modelFileExtension(path: string): ModelFileExtension | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return path.includes('.') && (MODEL_FILE_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as ModelFileExtension)
    : null;
}

export const isModelPath = (path: string): boolean => modelFileExtension(path) !== null;

/** `a/robot.obj` → `a/robot.json`: the sidecar holding the spec beside every generated model. */
export const modelSidecarPath = (modelPath: string): string => modelPath.replace(/\.[^./]+$/, '') + '.json';

/** Written beside each generated model as `<name>.json`. */
export const ModelSidecarSchema = z.object({
  version: z.literal(1),
  /** Base name shared by the `.obj`/`.mtl`/`.fbx` trio. */
  name: z.string().min(1),
  prompt: z.string(),
  /** What the vision model said about the attached image, when there was one. */
  imageDescription: z.string().optional(),
  engine: z.string().min(1),
  /** A reference picture kept beside the design (`<stem>.ref.<ext>`) — what `model_get_reference_image` serves. */
  reference: z.string().min(1).optional(),
  spec: ModelSpecSchema,
  createdAt: z.string().min(1),
});
export type ModelSidecar = z.infer<typeof ModelSidecarSchema>;

export function parseModelSidecar(text: string): ModelSidecar | null {
  try {
    const parsed = ModelSidecarSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// --- engines -------------------------------------------------------------------

/**
 * Who writes the spec: a local Ollama model (default, free, offline) or any
 * headless agent CLI on the roster — the same two routes Docs' Ask AI uses.
 */
export const ModelEngineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ollama'), model: z.string().min(1).max(200) }),
  z.object({ kind: z.literal('agent'), agentId: z.string().min(1), model: LoopModelSchema.optional() }),
]);
export type ModelEngine = z.infer<typeof ModelEngineSchema>;

/** Preview-and-refine passes an iterative run gets by default, and the most a request may ask for. */
export const MODEL_ITERATIONS_DEFAULT = 5;
export const MODEL_ITERATIONS_MAX = 12;

/**
 * Agent CLIs that can run the iterative (MCP) mode — the Midnite MCP server is attached per run
 * (`--mcp-config` for Claude Code, `-c mcp_servers.*` for Codex). Every other CLI, and Ollama,
 * keeps the one-shot JSON path.
 */
export const MODEL_ITERATIVE_AGENTS = ['claude', 'codex'] as const;
export const agentIteratesModel = (agentId: string): boolean => (MODEL_ITERATIVE_AGENTS as readonly string[]).includes(agentId);

export type ModelOllamaSuggestion = {
  id: string;
  /** Approximate download size. */
  downloadGb: number;
  /** Approximate RAM to run it comfortably. */
  ramGb: number;
  note: string;
};

/** Text models that write reliable JSON — the first is the default and the recommended pull. */
export const MODEL_SUGGESTED_TEXT: readonly ModelOllamaSuggestion[] = [
  { id: 'qwen2.5-coder:7b', downloadGb: 4.7, ramGb: 6, note: 'Default — strong at structured JSON' },
  { id: 'qwen2.5-coder:3b', downloadGb: 1.9, ramGb: 3, note: 'Lightweight, simpler shapes' },
  { id: 'qwen2.5-coder:14b', downloadGb: 9.0, ramGb: 12, note: 'Best detail on a 16 GB+ Mac' },
];

/** Vision models that read an attached picture. */
export const MODEL_SUGGESTED_VISION: readonly ModelOllamaSuggestion[] = [
  { id: 'qwen2.5vl:7b', downloadGb: 6.0, ramGb: 8, note: 'Default — best description quality' },
  { id: 'gemma3:4b', downloadGb: 3.3, ramGb: 5, note: 'Lightweight, vision-capable' },
  { id: 'llava:7b', downloadGb: 4.7, ramGb: 6, note: 'Older, widely installed' },
];

export const MODEL_DEFAULT_TEXT_MODEL = MODEL_SUGGESTED_TEXT[0]!.id;
export const MODEL_DEFAULT_VISION_MODEL = MODEL_SUGGESTED_VISION[0]!.id;

/** `ollama pull <id>` — the hint shown when the daemon is up but has no suitable model. */
export const modelPullHint = (id: string): string => `ollama pull ${id}`;

export const ModelOllamaModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** The daemon reported `vision` in the model's capabilities. */
  vision: z.boolean(),
  /** Embedding-only models cannot write a spec. */
  embedding: z.boolean().default(false),
});
export type ModelOllamaModel = z.infer<typeof ModelOllamaModelSchema>;

export const ModelProvidersSchema = z.object({
  ollama: z.object({
    available: z.boolean(),
    reason: z.string().optional(),
    models: z.array(ModelOllamaModelSchema),
  }),
});
export type ModelProviders = z.infer<typeof ModelProvidersSchema>;

// --- generation ----------------------------------------------------------------

export const MODEL_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const ModelImageAttachmentSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.enum(MODEL_IMAGE_MIMES),
  /** Base64, no `data:` prefix. */
  data: z
    .string()
    .min(1)
    .max(Math.ceil((MODEL_IMAGE_MAX_BYTES * 4) / 3) + 8),
});
export type ModelImageAttachment = z.infer<typeof ModelImageAttachmentSchema>;

export const ModelGenerateRequestSchema = z
  .object({
    /** Minted by the renderer so it can cancel before the invoke resolves. */
    generationId: z.string().min(1),
    repoId: z.string().min(1),
    project: MediaProjectNameSchema,
    prompt: z.string().trim().max(MODEL_PROMPT_MAX).default(''),
    engine: ModelEngineSchema,
    /** Ollama vision model that describes `image`; main falls back to a discovered one. */
    visionModel: z.string().min(1).max(200).optional(),
    image: ModelImageAttachmentSchema.optional(),
    /** Iterative (MCP) runs only: how many preview-and-refine passes the agent gets. */
    maxIterations: z.number().int().min(1).max(MODEL_ITERATIONS_MAX).optional(),
    /** `false` forces the one-shot JSON path even for an agent that could iterate. */
    iterative: z.boolean().optional(),
  })
  .refine((req) => req.prompt.length > 0 || req.image !== undefined, {
    message: 'Describe the model, attach an image, or both.',
    path: ['prompt'],
  });
export type ModelGenerateRequest = z.infer<typeof ModelGenerateRequestSchema>;
export type ModelGenerateInput = z.input<typeof ModelGenerateRequestSchema>;

export const MODEL_GENERATE_STAGES = ['describing', 'generating', 'repairing', 'building', 'writing', 'iterating'] as const;
export const ModelGenerateStageSchema = z.enum(MODEL_GENERATE_STAGES);
export type ModelGenerateStage = z.infer<typeof ModelGenerateStageSchema>;

export const MODEL_STAGE_LABELS: Record<ModelGenerateStage, string> = {
  describing: 'Reading the image…',
  generating: 'Designing the model…',
  repairing: 'Fixing the design…',
  building: 'Building the mesh…',
  writing: 'Writing .obj and .fbx…',
  iterating: 'Refining with the agent…',
};

/** Pushed on `mstudio:media:model-progress`. */
export const ModelGenerateProgressEventSchema = z.object({
  generationId: z.string().min(1),
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  stage: ModelGenerateStageSchema.optional(),
  /** Iterative runs: which preview-and-refine pass this is, out of the budget. */
  iteration: z.object({ n: z.number().int().min(0), max: z.number().int().min(1) }).optional(),
  /** Iterative runs: the latest tool the agent called, in words ("Added 3 parts"). */
  action: z.string().optional(),
  /** Iterative runs: the `.obj` the agent is editing, so the editor can follow it live. */
  primary: z.string().optional(),
  files: z.array(z.string()),
  error: z.string().optional(),
});
export type ModelGenerateProgressEvent = z.infer<typeof ModelGenerateProgressEventSchema>;

export const ModelGenerateResultSchema = z.object({
  /** Project-relative paths: `.obj`, `.mtl`, `.fbx`, sidecar `.json`. */
  files: z.array(z.string()),
  /** The `.obj` — what the explorer selects after a run. */
  primary: z.string(),
});
export type ModelGenerateResult = z.infer<typeof ModelGenerateResultSchema>;

/** Save-as of a generated model: glTF (PBR) first, then the Wavefront and Autodesk formats. */
export const MODEL_EXPORT_FORMATS = ['obj', 'fbx', 'glb', 'fbx-ascii'] as const;
export const ModelExportFormatSchema = z.enum(MODEL_EXPORT_FORMATS);
export type ModelExportFormat = z.infer<typeof ModelExportFormatSchema>;

export const ModelExportRequestSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  /** Any file of the trio (`.obj`, `.fbx` or the sidecar) — main resolves the spec beside it. */
  path: z.string().min(1).max(512),
  format: ModelExportFormatSchema,
  defaultDir: z.string().min(1).optional(),
  /** The edited design to export instead of the saved sidecar's — unsaved edits export too. */
  spec: ModelSpecSchema.optional(),
});
export type ModelExportRequest = z.infer<typeof ModelExportRequestSchema>;

/**
 * Persist an edited design: rewrites the sidecar's spec and re-renders the
 * `.obj`/`.mtl`/`.fbx` trio beside it under the same names.
 */
export const ModelSaveEditRequestSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  path: z.string().min(1).max(512),
  spec: ModelSpecSchema,
});
export type ModelSaveEditRequest = z.infer<typeof ModelSaveEditRequestSchema>;
