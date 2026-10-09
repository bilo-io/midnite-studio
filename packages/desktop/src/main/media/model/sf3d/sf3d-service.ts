import {
  consentIsCurrent,
  failure,
  ok,
  SF3D_DEFAULT_TEXTURE_SIZE,
  SF3D_PROVIDER,
  SF3D_REPO,
  SF3D_REVISION,
  type GitOpResult,
  type Sf3dRequest,
  type Sf3dGenerateRequest,
  type Sf3dGenerateResult,
  type Sf3dGenerateStage,
  type Sf3dProgressEvent,
  type Sf3dStatus,
} from '@midnite/studio-shared';

import { modelSlug, modelTimeStamp } from '../model-service';
import type { Sf3dInstaller } from './installer';
import { SF3D_DEFAULTS } from './pipeline';
import { prepareSf3dInput, type RgbaImage } from './prepare-image';
import type { Sf3dRunRequest, Sf3dRunResult } from './sf3d-broker';

/**
 * SF3D in Media ▸ Models (Phase 103 Theme J): the install ops over `installer.ts`, and a generation
 * that turns a picture into a folder in the #704 library layout, through the same asset import every
 * imported mesh takes (`ModelService.importAsset`) —
 *
 *   `<project>/<stem>/<stem>.asset.glb`  the textured mesh SF3D made, untouched
 *   `<project>/<stem>/<stem>.json`       a design with one `asset` part drawing it — what the editor
 *                                        and every `model_*` tool (auto-rig included) work on
 *   `<project>/<stem>/<stem>.obj|.fbx|.glb` the design's exports (the `.glb` keeps the texture)
 *   `<project>/<stem>/<stem>.ref.<ext>`  the picture it came from
 *   `<project>/<stem>/model.json`        `agent.provider: 'sf3d'`, counts, bounds, the SF3D revision
 *
 * Electron stays out: the worker is reached through `run` (the broker), the picture is decoded
 * through `decodeImage` (`nativeImage` in main), and files land through the media store's jail.
 * Every op answers a `GitOpResult`; `handle` is the one dispatcher the IPC channel and the MCP tools
 * share.
 */
export type Sf3dServiceDeps = {
  installer: Sf3dInstaller;
  run: (req: Sf3dRunRequest, opts: { signal: AbortSignal; onStage: (stage: Sf3dGenerateStage, fraction?: number) => void }) => Promise<Sf3dRunResult>;
  /** Picture bytes → RGBA, or null when they are not an image. */
  decodeImage: (data: Buffer, mime: string) => RgbaImage | null;
  /** `ModelService.importAsset`: writes the mesh, the picture, the design, its exports and `model.json`. */
  importAsset: (req: {
    repoId: string;
    project: string;
    stem: string;
    name: string;
    prompt: string;
    engine: string;
    glb: Buffer;
    reference?: { file: string; data: Buffer };
    extra?: Record<string, unknown>;
    createdAt?: Date;
  }) => Promise<GitOpResult<{ files: string[]; primary: string }>>;
  emit: (event: Sf3dProgressEvent) => void;
  /** Ends the worker — on uninstall, so no session holds a deleted file. */
  disposeEngine: () => void;
  now?: () => Date;
  /** `onnxruntime-node` is loadable in this build (checked lazily by main). */
  runtimeAvailable?: () => boolean;
};

const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** What `model.json` records about the SF3D run beside the usual fields (under `sf3d`). */
export function sf3dManifestExtra(result: Pick<Sf3dRunResult, 'textureSize'>): { sf3d: Record<string, unknown> } {
  return { sf3d: { repo: SF3D_REPO, revision: SF3D_REVISION, textureSize: result.textureSize, isosurfaceThreshold: SF3D_DEFAULTS.threshold } };
}

export function createSf3dService(deps: Sf3dServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const running = new Map<string, AbortController>();
  const emitInstall = (progress: Extract<Sf3dProgressEvent, { kind: 'install' }>['progress']) => deps.emit({ kind: 'install', progress });

  async function status(): Promise<Sf3dStatus> {
    const s = await deps.installer.status();
    if (deps.runtimeAvailable && !deps.runtimeAvailable()) {
      return { ...s, state: 'unavailable', reason: 'This build has no ONNX runtime, so SF3D cannot run here.' };
    }
    return s;
  }

  async function generate(req: Sf3dGenerateRequest): Promise<GitOpResult<Sf3dGenerateResult>> {
    const current = await status();
    if (current.state === 'unavailable') return failure(current.reason ?? 'SF3D cannot run in this build.');
    if (!consentIsCurrent(current.consent)) return failure('Accept the Stability AI Community License (Media ▸ Models ▸ SF3D) before generating.');
    if (current.state !== 'installed') return failure('SF3D is not installed. Install it from Media ▸ Models ▸ SF3D first.');
    if (running.has(req.generationId)) return failure('This generation is already running.');

    const controller = new AbortController();
    running.set(req.generationId, controller);
    const files: string[] = [];
    const base = { kind: 'generate' as const, generationId: req.generationId, repoId: req.repoId, project: req.project };
    const progress = (status: 'running' | 'succeeded' | 'failed' | 'cancelled', extra: { stage?: Sf3dGenerateStage; fraction?: number; error?: string; primary?: string } = {}) =>
      deps.emit({ ...base, status, ...extra });
    const fail = (message: string): GitOpResult<Sf3dGenerateResult> => {
      if (controller.signal.aborted || message === 'cancelled') {
        progress('cancelled');
        return failure('cancelled');
      }
      progress('failed', { error: message });
      return failure(message);
    };

    try {
      progress('running', { stage: 'preparing' });
      const bytes = Buffer.from(req.image.data, 'base64');
      const image = deps.decodeImage(bytes, req.image.mime);
      if (!image) return fail('The picture could not be read.');
      const rgb = prepareSf3dInput(image);
      const label = req.name ?? req.image.name.replace(/\.[^.]+$/, '');
      const createdAt = now();
      const stem = `${modelSlug(label)}-${modelTimeStamp(createdAt)}`;

      const result = await deps.run(
        { assetsDir: deps.installer.assetPath(''), rgb, textureSize: req.textureSize ?? SF3D_DEFAULT_TEXTURE_SIZE, name: label },
        { signal: controller.signal, onStage: (stage, fraction) => progress('running', { stage, ...(fraction !== undefined ? { fraction } : {}) }) },
      );
      if (controller.signal.aborted) return fail('cancelled');

      progress('running', { stage: 'writing' });
      const imported = await deps.importAsset({
        repoId: req.repoId,
        project: req.project,
        stem,
        name: label,
        prompt: `Image to 3D: ${req.image.name}`,
        engine: SF3D_PROVIDER,
        glb: Buffer.from(result.glb),
        reference: { file: `${stem}.ref.${IMAGE_EXT[req.image.mime] ?? 'png'}`, data: bytes },
        extra: sf3dManifestExtra(result),
        createdAt,
      });
      if (!imported.ok) return fail(imported.kind === 'error' ? imported.message : 'Could not write the model.');
      files.push(...imported.value.files);
      const { primary } = imported.value;
      progress('succeeded', { primary });
      return ok({ files, primary, vertices: result.vertices, triangles: result.triangles });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    } finally {
      running.delete(req.generationId);
    }
  }

  function cancelGenerate(generationId: string): GitOpResult {
    const controller = running.get(generationId);
    if (!controller) return failure('Nothing to cancel.');
    controller.abort();
    return ok();
  }

  async function uninstall(): Promise<GitOpResult<Sf3dStatus>> {
    for (const controller of running.values()) controller.abort();
    deps.disposeEngine();
    return deps.installer.uninstall();
  }

  /** The one dispatcher behind `mediaModelSf3d` (and the MCP tools). Never throws. */
  async function handle(req: Sf3dRequest): Promise<GitOpResult<unknown> | GitOpResult> {
    try {
      switch (req.op) {
        case 'status':
          return ok(await status());
        case 'consent':
          return await deps.installer.consent(req);
        case 'revokeConsent':
          return await deps.installer.revokeConsent();
        case 'install': {
          if ((await status()).state === 'unavailable') return failure('This build has no ONNX runtime, so SF3D cannot run here.');
          return await deps.installer.install(emitInstall);
        }
        case 'cancelInstall':
          return deps.installer.cancel();
        case 'uninstall':
          return await uninstall();
        case 'generate': {
          const { op: _op, ...rest } = req;
          return await generate(rest);
        }
        case 'cancelGenerate':
          return cancelGenerate(req.generationId);
      }
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  return { status, generate, cancelGenerate, uninstall, handle };
}

export type Sf3dService = ReturnType<typeof createSf3dService>;
