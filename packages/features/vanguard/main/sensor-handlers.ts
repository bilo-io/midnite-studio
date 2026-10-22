import { mkdir } from 'node:fs/promises';

import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

import type { VanguardService } from './vanguard-service';

export interface SensorHandlersServices {
  service: () => VanguardService;
  /** Reveal a directory in the OS file manager (`shell.openPath`); injected, since this half has no electron. */
  openPath?: (path: string) => Promise<void>;
  warn?: (issue: string) => void;
}

export function registerSensorHandlers(ctx: FeatureMainContext, services: SensorHandlersServices): void {
  const { ipc } = ctx;
  const warn = (issue: string): void => services.warn?.(issue);

  ipc.handleBare(CHANNELS.vanguardSensors, () => services.service().host.status());

  ipc.handle(
    CHANNELS.vanguardSensorRun,
    schemas.VanguardSensorRunRequest,
    async ({ id }) => {
      const ran = await services.service().host.runNow(id);
      return ran ? { ok: true as const } : { ok: false as const, kind: 'error' as const, message: `Sensor '${id}' is not running` };
    },
    (issue) => ({ ok: false as const, kind: 'error' as const, message: issue }),
  );

  ipc.handleBare(CHANNELS.vanguardSettingsGet, () => services.service().settings.get());

  ipc.handle(
    CHANNELS.vanguardSettingsSet,
    schemas.VanguardSettingsSetRequest,
    async (patch) => {
      const service = services.service();
      const next = await service.settings.update(patch);
      await service.host.applySettings();
      return next;
    },
    (issue) => {
      warn(issue);
      return services.service().settings.get();
    },
  );

  // The view was opened: in Studio, the first time lets the enabled sensors start, and persists that.
  ipc.handleBare(CHANNELS.vanguardViewOpened, async () => {
    const service = services.service();
    if (await service.host.viewOpened()) await service.settings.update({ viewOpened: true });
    return service.host.status();
  });

  ipc.handleBare(CHANNELS.vanguardOpenQuarantine, async () => {
    const service = services.service();
    if (!services.openPath) return { ok: false as const, kind: 'error' as const, message: 'This build cannot open folders.' };
    try {
      await mkdir(service.quarantineDir, { recursive: true, mode: 0o700 });
      await services.openPath(service.quarantineDir);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, kind: 'error' as const, message: error instanceof Error ? error.message : String(error) };
    }
  });
}
