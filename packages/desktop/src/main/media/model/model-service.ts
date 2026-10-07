import {
  agentIteratesModel,
  buildModelManifest,
  buildScene,
  failure,
  MEDIA_EXPORT_FORMAT_INFO,
  MODEL_ITERATIONS_DEFAULT,
  modelFileExtension,
  MODEL_MANIFEST_FILE,
  modelSidecarPath,
  ok,
  parseModelManifest,
  parseModelSidecar,
  type GitOpResult,
  type ModelAuthor,
  type ModelEngine,
  type ModelExportFormat,
  type ModelGenerateProgressEvent,
  type ModelGenerateRequest,
  type ModelGenerateResult,
  type ModelGenerateStage,
  type ModelImageAttachment,
  type ModelSidecar,
  type ModelSpec,
  modelAssetBounds,
  modelAssetHash,
  parseGlbMesh,
  registerModelAsset,
  type Sf3dGenerateRequest,
  type Sf3dGenerateResult,
} from '@midnite/studio-shared';

import { asBytes, designDir, loadModelAssets } from './model-assets';

import { writeFbxAscii, writeFbxBinary } from './fbx-writer';
import { gltfRigging, writeGlb } from './gltf-writer';
import { runIterative, type IterativeHost } from './iterative';
import type { ModelTools } from './model-mcp';
import { writeMtl, writeObj } from './obj-writer';
import { buildIterativePrompt, buildRepairPrompt, buildSpecPrompt } from './prompts';
import { parseSpec } from './spec-parse';

/**
 * Orchestrates one 3D generation (Media ▸ Models): optional vision pass over
 * the attached picture → the engine writes a `ModelSpec` as JSON (one or two
 * repair rounds when it does not validate) → main builds the mesh → writes
 * `<name>.obj`, `<name>.mtl`, `<name>.fbx` and a `<name>.json` sidecar into
 * `.midnite/media/model/<project>/`. Never throws — every outcome is a
 * `GitOpResult`, and every LLM call is behind an injected function so the
 * whole flow is testable without a daemon.
 */

/** A first reply plus this many repair rounds. */
export const MODEL_MAX_REPAIRS = 2;

type Scope = { repoId: string; tab: 'model'; project: string };

export type LlmCall = (req: {
  engine: ModelEngine;
  /** Where an agent CLI runs (its working directory). */
  repoId: string;
  prompt: string;
  signal: AbortSignal;
  /** The first reply writes the spec; repairs reuse the same call. */
  json: boolean;
}) => Promise<GitOpResult<{ text: string }>>;

export type DescribeImageCall = (req: {
  image: ModelImageAttachment;
  visionModel: string | undefined;
  signal: AbortSignal;
}) => Promise<GitOpResult<{ text: string; model: string }>>;

export type ModelServiceDeps = {
  llm: LlmCall;
  describeImage: DescribeImageCall;
  writeBytes: (req: Scope & { path: string; data: Buffer }) => Promise<GitOpResult<unknown>>;
  readBytes: (req: Scope & { path: string }) => Promise<GitOpResult<Buffer>>;
  emit: (event: ModelGenerateProgressEvent) => void;
  now?: () => Date;
  /** Who `model.json` names as the author; absent in a test, which then gets `unknown`. */
  author?: () => Promise<ModelAuthor>;
  /**
   * The iterative (MCP) engine: absent in a build or a test that has none, in which case every agent
   * runs the one-shot JSON path. `tools` is a thunk because the tools are built from this service.
   */
  iterative?: {
    host: IterativeHost;
    tools: () => ModelTools;
    /** The repository's path — both where the CLI runs and the `repoPath` its tools are called with. */
    repoPath: (repoId: string) => Promise<string | null>;
    modelArgs: (engine: Extract<ModelEngine, { kind: 'agent' }>) => string[];
  };
  /**
   * The SF3D engine (Phase 103 Theme J) — the sf3d service's own consent-, install- and cancel-aware
   * generate, which writes its result back through `importAsset` below. Absent in a test or a build
   * without it, where an `sf3d` engine request is refused.
   */
  sf3d?: {
    generate: (req: Sf3dGenerateRequest) => Promise<GitOpResult<Sf3dGenerateResult>>;
    cancel: (generationId: string) => GitOpResult | Promise<GitOpResult>;
  };
};

const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** What a new iterative model starts as: one small block the agent replaces on its first call. */
const PLACEHOLDER_SPEC: ModelSpec = {
  name: 'model',
  parts: [{ id: 'p1', name: 'placeholder', shape: 'box', size: [0.2, 0.2, 0.2], position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#b0b0b0' }],
};

/** `"A red fox, at dusk!"` → `a-red-fox-at-dusk`. */
export function modelSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'model';
}

export function modelTimeStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export const engineLabel = (engine: ModelEngine): string =>
  engine.kind === 'ollama' ? `ollama:${engine.model}` : engine.kind === 'sf3d' ? 'sf3d' : `agent:${engine.agentId}${engine.model ? `:${engine.model}` : ''}`;

/** The imported mesh an asset design draws, beside it in its folder: `<stem>.asset.glb`. */
export const assetFileName = (stem: string): string => `${stem}.asset.glb`;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Bytes of one export format for a spec. */
export function renderModel(spec: ModelSpec, format: ModelExportFormat, stem: string): Buffer {
  const parts = buildScene(spec);
  switch (format) {
    case 'obj':
      return Buffer.from(writeObj(parts, `${stem}.mtl`, spec.name), 'utf8');
    case 'glb':
      return writeGlb(parts, spec.name, gltfRigging(spec, parts));
    case 'fbx-ascii':
      return Buffer.from(writeFbxAscii(parts), 'utf8');
    case 'fbx':
      return writeFbxBinary(parts);
  }
}

/** The files a saved model keeps beside its sidecar: `.mtl`, `.obj`, `.fbx` (binary) and `.glb`. */
function renderTrio(spec: ModelSpec, stem: string, mtlName: string): [string, Buffer][] {
  const parts = buildScene(spec);
  return [
    [`${stem}.mtl`, Buffer.from(writeMtl(parts), 'utf8')],
    [`${stem}.obj`, Buffer.from(writeObj(parts, mtlName, spec.name), 'utf8')],
    [`${stem}.fbx`, writeFbxBinary(parts)],
    [`${stem}.glb`, writeGlb(parts, spec.name, gltfRigging(spec, parts))],
  ];
}

export function createModelService(deps: ModelServiceDeps) {
  const running = new Map<string, AbortController>();
  const now = deps.now ?? (() => new Date());

  type Progress = (
    status: ModelGenerateProgressEvent['status'],
    stage?: ModelGenerateStage,
    error?: string,
    extra?: Partial<Pick<ModelGenerateProgressEvent, 'iteration' | 'action' | 'primary' | 'score'>>,
  ) => void;

  /**
   * One iterative run. Either it ends the generation (`result`) or — when the agent never managed to
   * edit the model — it hands back the stem it created so the one-shot path can fill the same files.
   */
  async function iterate(
    req: ModelGenerateRequest,
    engine: Extract<ModelEngine, { kind: 'agent' }>,
    signal: AbortSignal,
    files: string[],
    progress: Progress,
  ): Promise<{ kind: 'result'; result: GitOpResult<ModelGenerateResult> } | { kind: 'fallback'; reuse: { stem: string; reference: string | undefined } | null }> {
    const iter = deps.iterative!;
    const repoPath = await iter.repoPath(req.repoId);
    if (!repoPath) return { kind: 'fallback', reuse: null };

    const createdAt = now();
    const stem = `${modelSlug(req.prompt || 'reference')}-${modelTimeStamp(createdAt)}`;
    const scope: Scope = { repoId: req.repoId, tab: 'model', project: req.project };
    let reference: string | undefined;
    if (req.image) {
      // Relative to the model's own folder, so the folder can be renamed or moved whole.
      reference = `${stem}.ref.${IMAGE_EXT[req.image.mime] ?? 'png'}`;
      const wrote = await deps.writeBytes({ ...scope, path: `${stem}/${reference}`, data: Buffer.from(req.image.data, 'base64') });
      if (!wrote.ok) return { kind: 'fallback', reuse: null };
    }
    const sidecar: ModelSidecar = {
      version: 1,
      name: stem,
      prompt: req.prompt,
      engine: `${engineLabel(engine)} (iterative)`,
      ...(reference ? { reference } : {}),
      spec: { ...PLACEHOLDER_SPEC, name: req.prompt.slice(0, 60).trim() || 'model' },
      createdAt: createdAt.toISOString(),
    };
    const created = await writeTrio(scope, stem, sidecar, files);
    if (!created.ok) return { kind: 'fallback', reuse: null };
    if (reference) files.push(`${stem}/${reference}`);

    const maxIterations = req.maxIterations ?? MODEL_ITERATIONS_DEFAULT;
    const primary = `${stem}/${stem}.obj`;
    const target = { repoPath, project: req.project, model: primary };
    progress('running', 'iterating', undefined, { iteration: { n: 0, max: maxIterations }, primary });

    const outcome = await runIterative({
      host: iter.host,
      tools: iter.tools(),
      agentId: engine.agentId,
      modelArgs: iter.modelArgs(engine),
      prompt: buildIterativePrompt({ prompt: req.prompt, hasReference: reference !== undefined, target, maxIterations }),
      target,
      cwd: repoPath,
      maxIterations,
      signal,
      onProgress: (p) => progress('running', 'iterating', undefined, { ...p, primary }),
    });

    if (outcome.kind === 'cancelled') {
      progress('cancelled', undefined, undefined, { primary });
      return { kind: 'result', result: failure('cancelled') };
    }
    if (outcome.kind === 'failed') {
      // Nothing was ever built: the files are still the placeholder, so let the one-shot path fill them.
      if (outcome.edits === 0) return { kind: 'fallback', reuse: { stem, reference } };
      progress('failed', undefined, outcome.message, { primary });
      return { kind: 'result', result: failure(outcome.message) };
    }
    progress('succeeded', undefined, undefined, { primary });
    return { kind: 'result', result: ok({ files: [...files], primary }) };
  }

  /**
   * One model's folder: the design sidecar first — it is what Save-as rebuilds from, so a half-written
   * run still exports — then the `.mtl`, `.obj`, `.fbx` and `.glb` rendered from its spec, then
   * `model.json`. Every path is `<stem>/<file>`; `written` collects each as it lands.
   */
  async function writeTrio(
    scope: Scope,
    stem: string,
    sidecar: ModelSidecar,
    written: string[] = [],
    extra: Record<string, unknown> = {},
  ): Promise<GitOpResult<{ files: string[] }>> {
    await loadModelAssets(deps.readBytes, scope, stem, sidecar.spec);
    const outputs: [string, Buffer][] = [
      [`${stem}.json`, Buffer.from(JSON.stringify(sidecar, null, 2) + '\n', 'utf8')],
      ...renderTrio(sidecar.spec, stem, `${stem}.mtl`),
    ];
    for (const [name, data] of outputs) {
      const path = `${stem}/${name}`;
      const wrote = await deps.writeBytes({ ...scope, path, data });
      if (!wrote.ok) return failure(wrote.kind === 'error' ? wrote.message : `Could not write ${path}.`);
      written.push(path);
    }
    const manifest = await writeManifest(scope, `${stem}/${stem}`, sidecar, null, extra);
    if (!manifest.ok) return failure(manifest.kind === 'error' ? manifest.message : 'Could not write model.json.');
    written.push(`${stem}/${MODEL_MANIFEST_FILE}`);
    return ok({ files: written });
  }

  /**
   * `model.json` for the model whose files are `<modelPath>.*` (no extension). A re-save passes the
   * previous manifest so its author, creation time, label and any future fields survive.
   */
  async function writeManifest(
    scope: Scope,
    modelPath: string,
    sidecar: ModelSidecar,
    previous: ReturnType<typeof parseModelManifest>,
    extra: Record<string, unknown> = {},
  ): Promise<GitOpResult<unknown>> {
    const dir = modelPath.split('/').slice(0, -1).join('/');
    const stem = modelPath.split('/').pop() ?? modelPath;
    const author = previous ? previous.author : await (deps.author?.() ?? Promise.resolve({ name: 'unknown' }));
    await loadModelAssets(deps.readBytes, scope, dir, sidecar.spec);
    const manifest = { ...extra, ...buildModelManifest({ sidecar, stem, author, now: now(), previous, present: [`${stem}.json`, `${stem}.obj`, `${stem}.fbx`, `${stem}.glb`] }) };
    return deps.writeBytes({ ...scope, path: `${dir}/${MODEL_MANIFEST_FILE}`, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8') });
  }

  async function generate(req: ModelGenerateRequest): Promise<GitOpResult<ModelGenerateResult>> {
    if (running.has(req.generationId)) return failure('This generation is already running.');
    const controller = new AbortController();
    running.set(req.generationId, controller);
    const { signal } = controller;
    const files: string[] = [];
    const progress = (
      status: ModelGenerateProgressEvent['status'],
      stage?: ModelGenerateStage,
      error?: string,
      extra: Partial<Pick<ModelGenerateProgressEvent, 'iteration' | 'action' | 'primary'>> = {},
    ) =>
      deps.emit({
        generationId: req.generationId,
        repoId: req.repoId,
        project: req.project,
        status,
        ...(stage ? { stage } : {}),
        ...extra,
        files: [...files],
        ...(error ? { error } : {}),
      });
    const fail = (message: string): GitOpResult<ModelGenerateResult> => {
      if (signal.aborted) {
        progress('cancelled');
        return failure('cancelled');
      }
      progress('failed', undefined, message);
      return failure(message);
    };

    try {
      if (req.engine.kind === 'sf3d') return await viaSf3d(req, req.engine, files, progress, fail);
      // An agent CLI that speaks MCP iterates: it builds, renders, looks and refines through the model_* tools.
      let reuse: { stem: string; reference: string | undefined } | null = null;
      if (req.engine.kind === 'agent' && req.iterative !== false && agentIteratesModel(req.engine.agentId) && deps.iterative) {
        const attempt = await iterate(req, req.engine, signal, files, progress);
        if (attempt.kind === 'result') return attempt.result;
        reuse = attempt.reuse;
      }

      let imageDescription: string | undefined;
      if (req.image) {
        progress('running', 'describing');
        const described = await deps.describeImage({ image: req.image, visionModel: req.visionModel, signal });
        if (!described.ok) return fail(described.kind === 'error' ? described.message : 'Could not read the image.');
        imageDescription = described.value.text;
        if (signal.aborted) return fail('cancelled');
      }

      progress('running', 'generating');
      let prompt = buildSpecPrompt({ prompt: req.prompt, imageDescription });
      let spec: ModelSpec | null = null;
      let lastError = '';
      for (let attempt = 0; attempt <= MODEL_MAX_REPAIRS && spec === null; attempt += 1) {
        const reply = await deps.llm({ engine: req.engine, repoId: req.repoId, prompt, signal, json: true });
        if (signal.aborted) return fail('cancelled');
        if (!reply.ok) return fail(reply.kind === 'error' ? reply.message : 'The model could not be reached.');
        const parsed = parseSpec(reply.value.text);
        if (parsed.ok) {
          spec = parsed.spec;
          break;
        }
        lastError = parsed.error;
        progress('running', 'repairing');
        prompt = buildRepairPrompt({ previousReply: reply.value.text, error: parsed.error });
      }
      if (spec === null) {
        return fail(`The model could not produce a valid design after ${MODEL_MAX_REPAIRS + 1} tries. Last problem:\n${lastError}`);
      }

      progress('running', 'building');
      const createdAt = now();
      const stem = reuse?.stem ?? `${modelSlug(spec.name === 'model' ? req.prompt || 'model' : spec.name)}-${modelTimeStamp(createdAt)}`;
      const scope: Scope = { repoId: req.repoId, tab: 'model', project: req.project };
      const sidecar: ModelSidecar = {
        version: 1,
        name: stem,
        prompt: req.prompt,
        ...(imageDescription ? { imageDescription } : {}),
        engine: engineLabel(req.engine),
        ...(reuse?.reference ? { reference: reuse.reference } : {}),
        spec,
        createdAt: createdAt.toISOString(),
      };

      progress('running', 'writing');
      const wrote = await writeTrio(scope, stem, sidecar, files);
      if (!wrote.ok) return fail(wrote.kind === 'error' ? wrote.message : 'Could not write the model.');
      progress('succeeded');
      return ok({ files, primary: `${stem}/${stem}.obj` });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    } finally {
      running.delete(req.generationId);
    }
  }

  /**
   * The SF3D engine behind the same request, progress and result as the LLM engines: the sf3d service
   * runs the picture through the network and hands the mesh to `importAsset`, so what lands is a design
   * with one `asset` part — opened by the editor, exported, rigged and animated like any other.
   */
  async function viaSf3d(
    req: ModelGenerateRequest,
    engine: Extract<ModelEngine, { kind: 'sf3d' }>,
    files: string[],
    progress: Progress,
    fail: (message: string) => GitOpResult<ModelGenerateResult>,
  ): Promise<GitOpResult<ModelGenerateResult>> {
    if (!deps.sf3d) return fail('SF3D is not available in this build.');
    if (!req.image) return fail('SF3D turns a picture into a model — attach one.');
    progress('running', 'building');
    const sf3d = deps.sf3d;
    const signal = running.get(req.generationId)?.signal;
    const onAbort = () => void sf3d.cancel(req.generationId);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await sf3d.generate({
        generationId: req.generationId,
        repoId: req.repoId,
        project: req.project,
        image: req.image,
        ...(req.prompt ? { name: req.prompt.slice(0, 80) } : {}),
        ...(engine.textureSize ? { textureSize: engine.textureSize } : {}),
      });
      if (!result.ok) return fail(result.kind === 'error' ? result.message : 'SF3D could not build the model.');
      files.push(...result.value.files);
      progress('succeeded', undefined, undefined, { primary: result.value.primary });
      return ok({ files: result.value.files, primary: result.value.primary });
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * A new model from an imported mesh (an SF3D result): the `.glb` lands as `<stem>/<stem>.asset.glb`, a
   * design with one `asset` part pointing at it — stood on the ground and centred, white so the texture
   * shows as baked — then the usual sidecar, exports and `model.json` (with `extra` merged in, e.g. SF3D's
   * revision and texture size). The returned `primary` is the `.obj`, as for every other engine.
   */
  async function importAsset(req: {
    repoId: string;
    project: string;
    stem: string;
    /** The label the design and the explorer show. */
    name: string;
    prompt: string;
    /** `engineLabel` of whoever made it (`sf3d`). */
    engine: string;
    glb: Buffer;
    /** The picture it came from, kept beside it as `<stem>.ref.<ext>`. */
    reference?: { file: string; data: Buffer };
    imageDescription?: string;
    extra?: Record<string, unknown>;
    createdAt?: Date;
  }): Promise<GitOpResult<{ files: string[]; primary: string; spec: ModelSpec; vertices: number; triangles: number }>> {
    const scope: Scope = { repoId: req.repoId, tab: 'model', project: req.project };
    const bytes = asBytes(req.glb);
    let mesh: ReturnType<typeof parseGlbMesh>;
    try {
      mesh = parseGlbMesh(bytes);
    } catch (error) {
      return failure(`The imported mesh could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    const hash = modelAssetHash(bytes);
    registerModelAsset(hash, mesh);
    const src = assetFileName(req.stem);
    const files: string[] = [];
    const writes: [string, Buffer][] = [[`${req.stem}/${src}`, req.glb]];
    if (req.reference) writes.push([`${req.stem}/${req.reference.file}`, req.reference.data]);
    for (const [path, data] of writes) {
      const wrote = await deps.writeBytes({ ...scope, path, data });
      if (!wrote.ok) return failure(wrote.kind === 'error' ? wrote.message : `Could not write ${path}.`);
      files.push(path);
    }
    const { min, max } = modelAssetBounds(mesh);
    const vertices = mesh.positions.length / 3;
    const triangles = mesh.indices.length / 3;
    const spec: ModelSpec = {
      name: req.name.slice(0, 60).trim() || 'model',
      parts: [
        {
          id: 'p1',
          name: 'mesh',
          shape: 'asset',
          src,
          hash,
          vertices,
          triangles,
          position: [round4(-(min[0] + max[0]) / 2), round4(-min[1]), round4(-(min[2] + max[2]) / 2)],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#ffffff',
          material: { metalness: mesh.material.metalness, roughness: mesh.material.roughness },
        },
      ],
    };
    const sidecar: ModelSidecar = {
      version: 1,
      name: req.stem,
      prompt: req.prompt,
      ...(req.imageDescription ? { imageDescription: req.imageDescription } : {}),
      engine: req.engine,
      ...(req.reference ? { reference: req.reference.file } : {}),
      spec,
      createdAt: (req.createdAt ?? now()).toISOString(),
    };
    const wrote = await writeTrio(scope, req.stem, sidecar, files, req.extra ?? {});
    if (!wrote.ok) return wrote;
    return ok({ files, primary: `${req.stem}/${req.stem}.obj`, spec, vertices, triangles });
  }

  function cancel(generationId: string): GitOpResult {
    const controller = running.get(generationId);
    if (!controller) return failure('Nothing to cancel.');
    controller.abort();
    return ok();
  }

  /**
   * The bytes and suggested file name of a Save-as. A generated model is
   * rebuilt from its sidecar spec in either format; a file with no sidecar
   * (dropped in by hand) can only be saved as its own format.
   */
  async function exportBytes(req: {
    repoId: string;
    project: string;
    path: string;
    format: ModelExportFormat;
    /** An edited design that overrides the saved sidecar's. */
    spec?: ModelSpec | undefined;
  }): Promise<GitOpResult<{ data: Buffer; fileName: string; extras: { fileName: string; data: Buffer }[] }>> {
    const scope: Scope = { repoId: req.repoId, tab: 'model', project: req.project };
    const stem = (req.path.split('/').pop() ?? 'model').replace(/\.[^.]+$/, '');
    const sidecar = req.spec ? null : await deps.readBytes({ ...scope, path: modelSidecarPath(req.path) });
    const parsed = req.spec ? { spec: req.spec } : sidecar?.ok ? parseModelSidecar(sidecar.value.toString('utf8')) : null;
    if (parsed) {
      await loadModelAssets(deps.readBytes, scope, designDir(req.path), parsed.spec);
      // An .obj names its .mtl, so the materials travel with it.
      const extras = req.format === 'obj' ? [{ fileName: `${stem}.mtl`, data: Buffer.from(writeMtl(buildScene(parsed.spec)), 'utf8') }] : [];
      return ok({ data: renderModel(parsed.spec, req.format, stem), fileName: `${stem}.${MEDIA_EXPORT_FORMAT_INFO[req.format].ext}`, extras });
    }
    if (modelFileExtension(req.path) === req.format) {
      const own = await deps.readBytes({ ...scope, path: req.path });
      if (!own.ok) return failure('File not found.');
      const mtl = req.format === 'obj' ? await deps.readBytes({ ...scope, path: req.path.replace(/\.[^.]+$/, '.mtl') }) : null;
      return ok({
        data: own.value,
        fileName: `${stem}.${req.format}`,
        extras: mtl?.ok ? [{ fileName: `${stem}.mtl`, data: mtl.value }] : [],
      });
    }
    return failure(`This model has no saved design to convert, so it can only be saved as .${modelFileExtension(req.path) ?? 'obj'}.`);
  }

  /**
   * Persist an edited design in place: the sidecar keeps its prompt and engine
   * and takes the new spec; the obj/mtl/fbx trio is rebuilt under the same
   * names so the explorer and any other tool see the edit.
   */
  async function saveEdit(req: {
    repoId: string;
    project: string;
    path: string;
    spec: ModelSpec;
  }): Promise<GitOpResult<{ files: string[] }>> {
    const scope: Scope = { repoId: req.repoId, tab: 'model', project: req.project };
    const stem = req.path.replace(/\.[^./]+$/, '');
    const base = stem.split('/').pop() ?? stem;
    const existing = await deps.readBytes({ ...scope, path: `${stem}.json` });
    const previous = existing.ok ? parseModelSidecar(existing.value.toString('utf8')) : null;
    if (!previous) return failure('This model has no saved design to edit.');
    await loadModelAssets(deps.readBytes, scope, designDir(req.path), req.spec);
    const sidecar: ModelSidecar = { ...previous, spec: req.spec };
    const outputs: [string, Buffer][] = [
      [`${stem}.json`, Buffer.from(JSON.stringify(sidecar, null, 2) + '\n', 'utf8')],
      ...renderTrio(req.spec, stem, `${base}.mtl`),
    ];
    const files: string[] = [];
    for (const [path, data] of outputs) {
      const wrote = await deps.writeBytes({ ...scope, path, data });
      if (!wrote.ok) return failure(wrote.kind === 'error' ? wrote.message : `Could not write ${path}.`);
      files.push(path);
    }
    // A model in a folder keeps its `model.json` current (counts, bounds, materials); a flat legacy one has none.
    if (stem.includes('/')) {
      const dir = stem.split('/').slice(0, -1).join('/');
      const priorText = await deps.readBytes({ ...scope, path: `${dir}/${MODEL_MANIFEST_FILE}` });
      const prior = priorText.ok ? parseModelManifest(priorText.value.toString('utf8')) : null;
      const manifest = await writeManifest(scope, stem, sidecar, prior);
      if (manifest.ok) files.push(`${dir}/${MODEL_MANIFEST_FILE}`);
    }
    return ok({ files });
  }

  /** Writes the chosen formats of a design beside its sidecar (Phase 104 Theme F's `model_export`). */
  async function exportModel(req: { repoId: string; project: string; path: string; spec: ModelSpec; formats: ('glb' | 'obj' | 'fbx')[] }): Promise<GitOpResult<{ files: string[] }>> {
    const scope: Scope = { repoId: req.repoId, tab: 'model', project: req.project };
    const stem = req.path.replace(/\.[^./]+$/, '');
    const base = stem.split('/').pop() ?? stem;
    await loadModelAssets(deps.readBytes, scope, designDir(req.path), req.spec);
    const parts = buildScene(req.spec);
    const outputs: [string, Buffer][] = [];
    if (req.formats.includes('obj')) outputs.push([`${stem}.mtl`, Buffer.from(writeMtl(parts), 'utf8')], [`${stem}.obj`, Buffer.from(writeObj(parts, `${base}.mtl`, req.spec.name), 'utf8')]);
    if (req.formats.includes('fbx')) outputs.push([`${stem}.fbx`, writeFbxBinary(parts)]);
    if (req.formats.includes('glb')) outputs.push([`${stem}.glb`, writeGlb(parts, req.spec.name, gltfRigging(req.spec, parts))]);
    const files: string[] = [];
    for (const [path, data] of outputs) {
      const wrote = await deps.writeBytes({ ...scope, path, data });
      if (!wrote.ok) return failure(wrote.kind === 'error' ? wrote.message : `Could not write ${path}.`);
      files.push(path);
    }
    return ok({ files });
  }

  /** A new model from a design: the sidecar plus the trio, so it appears in the explorer at once. */
  async function createModel(req: { repoId: string; project: string; stem: string; spec: ModelSpec; engine: string }): Promise<GitOpResult<{ primary: string }>> {
    const sidecar: ModelSidecar = { version: 1, name: req.stem, prompt: '', engine: req.engine, spec: req.spec, createdAt: now().toISOString() };
    const wrote = await writeTrio({ repoId: req.repoId, tab: 'model', project: req.project }, req.stem, sidecar);
    return wrote.ok ? ok({ primary: `${req.stem}/${req.stem}.obj` }) : wrote;
  }

  /** Rewrite only the sidecar — cheap enough for an agent's intermediate edits. */
  const writeSidecar = (req: { repoId: string; project: string; path: string; sidecar: ModelSidecar }): Promise<GitOpResult<unknown>> =>
    deps.writeBytes({ repoId: req.repoId, tab: 'model', project: req.project, path: req.path, data: Buffer.from(JSON.stringify(req.sidecar, null, 2) + '\n', 'utf8') });

  return { generate, cancel, exportBytes, exportModel, saveEdit, createModel, writeSidecar, importAsset };
}

export type ModelService = ReturnType<typeof createModelService>;
