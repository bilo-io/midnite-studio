import { createRequire } from 'node:module';
import { join } from 'node:path';

import { utilityProcess } from 'electron';

import {
  createSfxBroker,
  createSfxMcpTools,
  createSfxInstaller,
  createSfxService,
  sfxWorkerScriptPath,
  type SfxBroker,
  type SfxService,
  type SfxWorkerHandle,
} from '@midnite/studio-feature-media-audio/main';
import { EVENT_CHANNELS, failure, type SfxProgressEvent, type SfxRequest } from '@midnite/studio-shared';

import { setSfxTools } from '../mcp/sfx-tools';
import { resolveRegisteredRepo } from '../mcp/tools';
import { broadcastToAllWindows } from '../window-manager';
import { mediaStore, notifyMediaChanged } from './media-handlers';
import { readSecret } from './secrets-handlers';

/**
 * Media ▸ SFX — the opt-in local Stable Audio Open Small tier, SF3D's shape
 * (`media-model-sf3d-handlers.ts`). Nothing runs at startup beyond building the service: no request is made
 * and no worker is forked until the user consents and installs, and inference only ever runs in `sfx-worker`,
 * which the broker ends after five idle minutes so its ~3 GB goes back to the machine.
 */
let service: SfxService | null = null;
let broker: SfxBroker | null = null;
let runtime: boolean | null = null;
/** The latest event per generation, for `sfx_status` — capped so a long session cannot grow it. */
const generations = new Map<string, Extract<SfxProgressEvent, { kind: 'generate' }>>();
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

export function configureSfx(userData: string): void {
  broker = createSfxBroker({
    spawn: () => utilityProcess.fork(sfxWorkerScriptPath(), [], { serviceName: 'mstudio-sfx', stdio: 'ignore' }) as SfxWorkerHandle,
  });
  const engine = broker;
  service = createSfxService({
    installer: createSfxInstaller({ directory: join(userData, 'sfx'), readToken: () => readSecret('media.huggingFaceToken') }),
    run: (req, opts) => engine.run(req, opts),
    writeBytes: (req) => mediaStore.writeBytes(req),
    emit: (event: SfxProgressEvent) => {
      broadcastToAllWindows(EVENT_CHANNELS.mediaSfxProgress, event);
      if (event.kind === 'generate') {
        generations.delete(event.generationId);
        generations.set(event.generationId, event);
        // Over the cap there is always a first key: the oldest run, dropped.
        if (generations.size > GENERATIONS_KEPT) generations.delete(generations.keys().next().value!);
      }
      if (event.kind === 'generate' && event.status === 'succeeded') notifyMediaChanged(event.repoId, 'sfx');
    },
    disposeEngine: () => engine.dispose(),
    runtimeAvailable,
  });
  setSfxTools(
    createSfxMcpTools({
      handle: (req) => handleSfx(req),
      resolveRepo: async (repoPath) => {
        const resolved = await resolveRegisteredRepo(repoPath);
        if (resolved.ok) return { ok: true, repoId: resolved.repo.descriptor.id };
        return { ok: false, kind: resolved.error.kind === 'not-found' ? 'not-found' : 'refused', message: resolved.error.message };
      },
      generation: (id) => generations.get(id),
    }),
  );
}

export function disposeSfx(): void {
  setSfxTools(null);
  broker?.dispose();
}

/** The one dispatcher the `mediaSfx` channel shares. Registered before `configureSfx` runs, so it waits for it. */
export function handleSfx(req: SfxRequest) {
  if (!service) return Promise.resolve(failure('Sound effects are still starting up; try again in a moment.'));
  return service.handle(req);
}
