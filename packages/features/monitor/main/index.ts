import {
  createIpcContext,
  defineFeatureMain,
  registerHandoffOpener,
  type IpcContextElectron,
} from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, schemas, type SystemHealth } from '@midnite/studio-shared';

import { monitorManifest } from '../manifest';
import { buildAgentUsage, type UsageSession } from './agent-usage';
import { createMetricsService, type MetricsService } from './metrics/metrics-service';
import { readSystemHealth, startSshAgent, type OllamaPort } from './system-health';

export { monitorManifest, type MonitorManifest } from '../manifest';
export {
  addTotals,
  buildAgentUsage,
  locateTranscript,
  readTranscriptUsage,
  slugifyCwd,
  type UsageSession,
} from './agent-usage';
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
  /**
   * The live agent sessions and the home directory their transcripts sit under. Desktop passes its
   * terminal list; a standalone app has no sessions of its own, so the channel answers empty.
   */
  agentSessions?: () => Promise<readonly UsageSession[]>;
  homeDir?: string;
  /** Phase 115 F: `false` means Settings ▸ Privacy has Claude/Codex history reads off; nothing is read. Default on. */
  readAgentHistory?: () => boolean;
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
    ipc.handleBare(CHANNELS.monitorAgentUsage, async () => {
      if (services.readAgentHistory && !services.readAgentHistory()) return { sessions: [], agents: [], disabled: true };
      const sessions = (await services.agentSessions?.()) ?? [];
      return buildAgentUsage(services.homeDir ?? '', services.homeDir ? sessions : []);
    });
    services.onMetricsService?.(service);
  },
});

export type SuiteMonitorOptions = IpcContextElectron & {
  /** The home directory agent transcripts are read under; absent, token spend is an honest empty list. */
  homeDir?: string;
  /** Where a malformed one-way payload is reported. */
  warn: (issue: string) => void;
  /** `shell.openExternal`, for a `midnite://open` hand-off only (`registerHandoffOpener` checks). */
  openExternal: (url: string) => Promise<void>;
  /** Handed the sampler so the app's window can pause it (`bindMetricsToWindow`). */
  onMetricsService: (service: MetricsService) => void;
} & Pick<MonitorMainServices, 'agentSessions' | 'readAgentHistory'>;

/**
 * What every suite app's main registers for the status bar's monitor segment (Phase 123 Theme H): the
 * monitor feature's channels (the sampler, system health, token spend) and the `midnite://open` hand-off
 * the flyout's "Open Monitor" leaves through. The standalone app has no terminal sessions of its own,
 * so token spend answers empty unless the app passes `agentSessions`.
 *
 * The matching preload half is `createMonitorFeatureBridge` (`../bridge`).
 */
export function registerSuiteMonitor(options: SuiteMonitorOptions): void {
  const ctx = createIpcContext(options);
  registerHandoffOpener(ctx.ipc, { openExternal: options.openExternal });
  monitorMain.register(ctx, {
    onMetricsService: options.onMetricsService,
    warn: options.warn,
    ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }),
    ...(options.agentSessions === undefined ? {} : { agentSessions: options.agentSessions }),
    ...(options.readAgentHistory === undefined ? {} : { readAgentHistory: options.readAgentHistory }),
  });
}
