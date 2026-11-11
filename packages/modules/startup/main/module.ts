import { join } from 'node:path';

import { defineFeatureMain, type IpcContextElectron } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, schemas, type StartupResult } from '@midnite/studio-shared';

import { handleStartupRequest } from './service';
import { openWorkspaceStore } from './workspace-store';

/** The electron pieces Startup's main needs, injected so registration is testable under bare vitest. */
export type StartupElectron = IpcContextElectron & {
  /** Startup's own userData: the workspace lives under `<userData>/startup`. */
  userData: string;
  /** Where a warning goes; dropped when absent. */
  warn?: (message: string) => void;
};

/** What the host hands the Startup module. */
export type StartupMainServices = { electron: StartupElectron; now?: () => number };

const invalid = (message: string): StartupResult<never> => ({ ok: false, kind: 'invalid', message });

/**
 * The Startup module's main half, on the feature seam so a host mounts it through `mountModuleMains`: the one
 * `startup` channel over a versioned, atomically written workspace file. The renderer's payload is zod-parsed
 * before a handler sees it; the store opens on the first call, so registration stays synchronous.
 */
export const startupModuleMain = defineFeatureMain<StartupMainServices>({
  feature: 'startup',
  channels: [CHANNELS.startup],
  register(ctx, { electron, now }) {
    const store = openWorkspaceStore({
      dir: join(electron.userData, 'startup'),
      ...(now ? { now } : {}),
      ...(electron.warn ? { warn: electron.warn } : {}),
      onChanged: (revision) => ctx.emit(EVENT_CHANNELS.startupChanged, { revision }),
    });
    ctx.ipc.handle(
      CHANNELS.startup,
      schemas.StartupRequest,
      async (request) => handleStartupRequest(await store, request),
      (issue) => invalid(issue),
    );
  },
});
