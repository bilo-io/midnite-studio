import { createRequire } from 'node:module';
import { join } from 'node:path';

import { utilityProcess } from 'electron';

import {
  createSfxBroker,
  createSfxInstaller,
  createSfxService,
  sfxWorkerScriptPath,
  type SfxBroker,
  type SfxService,
  type SfxWorkerHandle,
} from '@midnite/studio-feature-media-audio/main';
import { EVENT_CHANNELS, failure, type SfxProgressEvent, type SfxRequest } from '@midnite/studio-shared';

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
      if (event.kind === 'generate' && event.status === 'succeeded') notifyMediaChanged(event.repoId, 'sfx');
    },
    disposeEngine: () => engine.dispose(),
    runtimeAvailable,
  });
}

export function disposeSfx(): void {
  broker?.dispose();
}

/** The one dispatcher the `mediaSfx` channel shares. Registered before `configureSfx` runs, so it waits for it. */
export function handleSfx(req: SfxRequest) {
  if (!service) return Promise.resolve(failure('Sound effects are still starting up; try again in a moment.'));
  return service.handle(req);
}
