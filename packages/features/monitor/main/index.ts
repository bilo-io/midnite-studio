import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, schemas, type SystemHealth } from '@midnite/studio-shared';

import { monitorManifest } from '../manifest';
import { createMetricsService, type MetricsService } from './metrics/metrics-service';
import { readSystemHealth, startSshAgent, type OllamaPort } from './system-health';

export { monitorManifest, type MonitorManifest } from '../manifest';
export { createGpuProbe, type GpuProbe } from './metrics/gpu';
export { probeDetailedMemory } from './metrics/memory';
export { createMetricsService, type MetricsService } from './metrics/metrics-service';
export {
  fetchOllamaPort,
  parseSshVersion,
  probeBinary,
  readSystemHealth,
  startSshAgent,
  type OllamaPort,
} from './system-health';

/**
 * The monitor feature's main half (Phase 113 Theme I).
 *
 * The sampler and its probes (`metrics/`) and the system-health probes moved
 * here from `packages/desktop` — none of them imports `electron`. The window
 * lifecycle stays the composer's: it is handed the {@link MetricsService} and
 * calls `pause()`/`resume()`/`stop()` as its window blurs, hides and closes
 * (desktop's `bindMetricsToWindow`, an app's own main).
 */
export type MonitorMainServices = {
  /** Handed the sampler once registered, so the composer can bind it to its window. */
  onMetricsService?: (service: MetricsService) => void;
  /** Defaults to the real probes over `fetch`; desktop passes its Ollama client. */
  ollama?: OllamaPort;
  /** Where a malformed one-way payload is reported (desktop's logger); dropped when absent. */
  warn?: (issue: string) => void;
};

export const monitorMain = defineFeatureMain<MonitorMainServices>({
  feature: monitorManifest.feature,
  channels: monitorManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const service = createMetricsService({
      emit: (sample) => ctx.emit(EVENT_CHANNELS.metricsSample, sample),
    });
    // One-way, like `pty.input`: the renderer re-sends `start` with a new
    // interval whenever the flyout opens or closes, and the service treats that
    // as a re-arm rather than a second sampler.
    const warn = (issue: string): void => services.warn?.(issue);
    ipc.send(
      CHANNELS.metricsStart,
      schemas.MetricsStartRequest,
      ({ intervalMs, freshDisk }) => service.start(intervalMs, { freshDisk: freshDisk ?? false }),
      warn,
    );
    ipc.send(CHANNELS.metricsStop, schemas.SendVoidSchema, () => service.stop(), warn);
    ipc.handleBare(CHANNELS.systemHealth, (): Promise<SystemHealth> => readSystemHealth(services.ollama));
    ipc.handleBare(CHANNELS.systemHealthStartSshAgent, () => startSshAgent());
    services.onMetricsService?.(service);
  },
});
