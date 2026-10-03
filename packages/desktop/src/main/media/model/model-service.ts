import {
  failure,
  modelFileExtension,
  modelSidecarPath,
  ok,
  parseModelSidecar,
  type GitOpResult,
  type ModelEngine,
  type ModelExportFormat,
  type ModelGenerateProgressEvent,
  type ModelGenerateRequest,
  type ModelGenerateResult,
  type ModelGenerateStage,
  type ModelImageAttachment,
  type ModelSidecar,
  type ModelSpec,
} from '@midnite/studio-shared';

import { writeFbxBinary } from './fbx-writer';
import { buildScene } from './mesh';
import { writeMtl, writeObj } from './obj-writer';
import { buildRepairPrompt, buildSpecPrompt, DESCRIBE_IMAGE_PROMPT } from './prompts';
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
  engine.kind === 'ollama' ? `ollama:${engine.model}` : `agent:${engine.agentId}${engine.model ? `:${engine.model}` : ''}`;

/** Bytes of one export format for a spec. */
export function renderModel(spec: ModelSpec, format: ModelExportFormat, stem: string): Buffer {
  const parts = buildScene(spec);
  return format === 'obj' ? Buffer.from(writeObj(parts, `${stem}.mtl`, spec.name), 'utf8') : writeFbxBinary(parts);
}

export function createModelService(deps: ModelServiceDeps) {
  const running = new Map<string, AbortController>();
  const now = deps.now ?? (() => new Date());

  async function generate(req: ModelGenerateRequest): Promise<GitOpResult<ModelGenerateResult>> {
    if (running.has(req.generationId)) return failure('This generation is already running.');
    const controller = new AbortController();
    running.set(req.generationId, controller);
    const { signal } = controller;
    const files: string[] = [];
    const progress = (status: ModelGenerateProgressEvent['status'], stage?: ModelGenerateStage, error?: string) =>
      deps.emit({
        generationId: req.generationId,
        repoId: req.repoId,
        project: req.project,
        status,
        ...(stage ? { stage } : {}),
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
      const stem = `${modelSlug(spec.name === 'model' ? req.prompt || 'model' : spec.name)}-${modelTimeStamp(createdAt)}`;
      const scope: Scope = { repoId: req.repoId, tab: 'model', project: req.project };
      const obj = renderModel(spec, 'obj', stem);
      const mtl = Buffer.from(writeMtl(buildScene(spec)), 'utf8');
      const fbx = renderModel(spec, 'fbx', stem);
      const sidecar: ModelSidecar = {
        version: 1,
        name: stem,
        prompt: req.prompt,
        ...(imageDescription ? { imageDescription } : {}),
        engine: engineLabel(req.engine),
        spec,
        createdAt: createdAt.toISOString(),
      };

      progress('running', 'writing');
      // The sidecar goes first: it is what Save-as rebuilds from, so a half-written run still exports.
      const outputs: [string, Buffer][] = [
        [`${stem}.json`, Buffer.from(JSON.stringify(sidecar, null, 2) + '\n', 'utf8')],
        [`${stem}.mtl`, mtl],
        [`${stem}.obj`, obj],
        [`${stem}.fbx`, fbx],
      ];
      for (const [path, data] of outputs) {
        const wrote = await deps.writeBytes({ ...scope, path, data });
        if (!wrote.ok) return fail(wrote.kind === 'error' ? wrote.message : `Could not write ${path}.`);
        files.push(path);
      }
      progress('succeeded');
      return ok({ files, primary: `${stem}.obj` });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    } finally {
      running.delete(req.generationId);
    }
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
  }): Promise<GitOpResult<{ data: Buffer; fileName: string; extras: { fileName: string; data: Buffer }[] }>> {
    const scope: Scope = { repoId: req.repoId, tab: 'model', project: req.project };
    const stem = (req.path.split('/').pop() ?? 'model').replace(/\.[^.]+$/, '');
    const sidecar = await deps.readBytes({ ...scope, path: modelSidecarPath(req.path) });
    const parsed = sidecar.ok ? parseModelSidecar(sidecar.value.toString('utf8')) : null;
    if (parsed) {
      // An .obj names its .mtl, so the materials travel with it.
      const extras = req.format === 'obj' ? [{ fileName: `${stem}.mtl`, data: Buffer.from(writeMtl(buildScene(parsed.spec)), 'utf8') }] : [];
      return ok({ data: renderModel(parsed.spec, req.format, stem), fileName: `${stem}.${req.format}`, extras });
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

  return { generate, cancel, exportBytes };
}

export type ModelService = ReturnType<typeof createModelService>;
