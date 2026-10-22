import { mkdir } from 'node:fs/promises';

import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS, DEFAULT_VANGUARD_SETTINGS, schemas } from '@midnite/studio-shared';

import type { VanguardService } from './vanguard-service';

export interface SensorHandlersServices {
  /** Resolves once the service exists; a request that arrives while Studio is still starting waits for it. */
  service: () => VanguardService | Promise<VanguardService>;
  /** Reveal a directory in the OS file manager (`shell.openPath`); injected, since this half has no electron. */
  openPath?: (path: string) => Promise<void>;
  warn?: (issue: string) => void;
}

export function registerSensorHandlers(
  ctx: FeatureMainContext,
  services: SensorHandlersServices,
): void {
  const { ipc } = ctx;
  const warn = (issue: string): void => services.warn?.(issue);
  let lastService: VanguardService | null = null;
  const resolve = async (): Promise<VanguardService> => (lastService = await services.service());

  ipc.handleBare(CHANNELS.vanguardSensors, async () => (await resolve()).host.status());

  ipc.handle(
    CHANNELS.vanguardSensorRun,
    schemas.VanguardSensorRunRequest,
    async ({ id }) => {
      const ran = await (await resolve()).host.runNow(id);
      return ran
        ? { ok: true as const }
        : { ok: false as const, kind: 'error' as const, message: `Sensor '${id}' is not running` };
    },
    (issue) => ({ ok: false as const, kind: 'error' as const, message: issue }),
  );

  ipc.handleBare(CHANNELS.vanguardConnections, async () => (await resolve()).connections.get());

  ipc.handleBare(CHANNELS.vanguardSettingsGet, async () => (await resolve()).settings.get());

  ipc.handle(
    CHANNELS.vanguardSettingsSet,
    schemas.VanguardSettingsSetRequest,
    async (patch) => {
      const service = await resolve();
      const next = await service.settings.update(patch);
      await service.host.applySettings();
      return next;
    },
    (issue) => {
      warn(issue);
      // Sync by contract: the last settings a request saw, or the defaults before any request did.
      return lastService?.settings.get() ?? { ...DEFAULT_VANGUARD_SETTINGS, sensors: {} };
    },
  );

  // The view was opened: in Studio, the first time lets the enabled sensors start, and persists that.
  ipc.handleBare(CHANNELS.vanguardViewOpened, async () => {
    const service = await resolve();
    if (await service.host.viewOpened()) await service.settings.update({ viewOpened: true });
    return service.host.status();
  });

  ipc.handleBare(CHANNELS.vanguardOpenQuarantine, async () => {
    const service = await resolve();
    if (!services.openPath)
      return {
        ok: false as const,
        kind: 'error' as const,
        message: 'This build cannot open folders.',
      };
    try {
      await mkdir(service.quarantineDir, { recursive: true, mode: 0o700 });
      await services.openPath(service.quarantineDir);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        kind: 'error' as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
