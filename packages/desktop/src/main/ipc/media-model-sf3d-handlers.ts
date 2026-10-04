import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { nativeImage, utilityProcess } from 'electron';

import { CHANNELS, EVENT_CHANNELS, failure, schemas, type GitOpResult, type Sf3dGenerateResult, type Sf3dRequest, type Sf3dProgressEvent } from '@midnite/studio-shared';

import { createSf3dInstaller } from '../media/model/sf3d/installer';
import type { RgbaImage } from '../media/model/sf3d/prepare-image';
import { createSf3dBroker, sf3dWorkerScriptPath, type Sf3dBroker, type Sf3dWorkerHandle } from '../media/model/sf3d/sf3d-broker';
import { createSf3dMcpTools } from '../media/model/sf3d/sf3d-mcp';
import { createSf3dService, type Sf3dService } from '../media/model/sf3d/sf3d-service';
import { setSf3dTools } from '../mcp/model-tools';
import { resolveRegisteredRepo } from '../mcp/tools';
import { broadcastToAllWindows } from '../window-manager';
import { handle } from './handle';
import { notifyMediaChanged } from './media-handlers';
import { importModelAsset, setSf3dEngine } from './media-model-handlers';
import { readSecret } from './secrets-handlers';

/**
 * Media ▸ Models ▸ SF3D (Phase 103 Theme J) — the opt-in local image-to-3D tier. Nothing here runs at
 * startup beyond building the service: no request is made and no worker is forked until the user
 * consents and installs (`installer.ts`), and inference only ever runs in `sf3d-worker`.
 */
let service: Sf3dService | null = null;
let broker: Sf3dBroker | null = null;
let runtime: boolean | null = null;
/** The latest event per generation, for `model_sf3d_status` — capped so a long session cannot grow it. */
const generations = new Map<string, Extract<Sf3dProgressEvent, { kind: 'generate' }>>();
const GENERATIONS_KEPT = 50;

/** Whether `onnxruntime-node` resolves through `@huggingface/transformers` — checked once, lazily, never loaded here. */
function runtimeAvailable(): boolean {
  if (runtime === null) {
    try {
      createRequire(require.resolve('@huggingface/transformers')).resolve('onnxruntime-node');
      runtime = true;
    } catch {
      runtime = false;
    }
  }
  return runtime;
}

/** Picture bytes → RGBA (≤ 1024 px a side; SF3D reads 512). `nativeImage.toBitmap()` is BGRA. */
function decodeImage(data: Buffer): RgbaImage | null {
  let image = nativeImage.createFromBuffer(data);
  if (image.isEmpty()) return null;
  const size = image.getSize();
  const scale = Math.min(1, 1024 / Math.max(size.width, size.height));
  if (scale < 1) image = image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale), quality: 'best' });
  const { width, height } = image.getSize();
  const bgra = image.toBitmap();
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = bgra[i + 2]!;
    rgba[i + 1] = bgra[i + 1]!;
    rgba[i + 2] = bgra[i]!;
    rgba[i + 3] = bgra[i + 3]!;
  }
  return { data: rgba, width, height };
}

export function configureSf3d(userData: string): void {
  broker = createSf3dBroker({
    spawn: () => utilityProcess.fork(sf3dWorkerScriptPath(), [], { serviceName: 'mstudio-sf3d', stdio: 'ignore' }) as Sf3dWorkerHandle,
  });
  const engine = broker;
  service = createSf3dService({
    installer: createSf3dInstaller({ directory: join(userData, 'sf3d'), readToken: () => readSecret('media.huggingFaceToken') }),
    run: (req, opts) => engine.run(req, opts),
    decodeImage: (data) => decodeImage(data),
    importAsset: (req) => importModelAsset(req),
    emit: (event: Sf3dProgressEvent) => {
      broadcastToAllWindows(EVENT_CHANNELS.mediaModelSf3dProgress, event);
      if (event.kind === 'generate') {
        generations.delete(event.generationId);
        generations.set(event.generationId, event);
        if (generations.size > GENERATIONS_KEPT) generations.delete(generations.keys().next().value!);
      }
      if (event.kind === 'generate' && event.status === 'succeeded') notifyMediaChanged(event.repoId, 'model');
    },
    disposeEngine: () => engine.dispose(),
    runtimeAvailable,
  });
  // SF3D behind the Models engine seam: `mediaModelGenerate` with `engine: { kind: 'sf3d' }` lands here.
  setSf3dEngine({
    generate: async (req) => (await handleSf3d({ op: 'generate', ...req })) as GitOpResult<Sf3dGenerateResult>,
    cancel: (generationId) => handleSf3d({ op: 'cancelGenerate', generationId }),
  });
  setSf3dTools(
    createSf3dMcpTools({
      handle: (req) => handleSf3d(req),
      resolveRepo: async (repoPath) => {
        const resolved = await resolveRegisteredRepo(repoPath);
        if (resolved.ok) return { ok: true, repoId: resolved.repo.descriptor.id };
        return { ok: false, kind: resolved.error.kind === 'not-found' ? 'not-found' : 'refused', message: resolved.error.message };
      },
      readFile: (path) => readFile(path),
      generation: (id) => generations.get(id),
    }),
  );
}

export function disposeSf3d(): void {
  setSf3dTools(null);
  setSf3dEngine(null);
  broker?.dispose();
}

/** The one dispatcher the IPC channel and the `model_*` MCP tools share. */
export function handleSf3d(req: Sf3dRequest) {
  if (!service) return Promise.resolve(failure('SF3D is still starting up; try again in a moment.'));
  return service.handle(req);
}

export function registerMediaModelSf3dHandlers(): void {
  handle(CHANNELS.mediaModelSf3d, schemas.MediaModelSf3dRequest, (req) => handleSf3d(req), (issue) => failure(issue));
}
