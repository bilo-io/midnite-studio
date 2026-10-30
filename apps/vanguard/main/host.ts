import { cleanerModuleMain } from '@midnite/studio-module-cleaner/main';
import {
  monitorModuleMain,
  terminalListFromShared,
  usageSessionsFrom,
  type MonitorModuleServices,
} from '@midnite/studio-module-monitor/main';
import { prepareVault, type VaultElectron } from '@midnite/studio-module-vault/main';
import { prepareVanguard, type VanguardElectron } from '@midnite/studio-module-vanguard/main';
import { createIpcContext, mountModuleMains, readRuntimeHostRecord, type ModuleMount } from '@midnite/studio-runtime';
import { readHostSessions } from '@midnite/studio-feature-sessions/main';
import { CHANNELS } from '@midnite/studio-shared';
import type { MetricsService } from '@midnite/studio-feature-monitor/main';

/** What Vanguard's host hands the modules it mounts, on top of its own module's electron pieces. */
export type VanguardHostElectron = VanguardElectron &
  Pick<VaultElectron, 'directory' | 'pairing' | 'clipboard'> & {
    /** The native directory picker (Cleaner). */
    pickDirectory(): Promise<string | null>;
    /** Handed the sampler so main can pause it as the window blurs or hides (Monitor). */
    onMetricsService(service: MetricsService): void;
    /** `shell.openExternal`, for Monitor's `midnite://open` hand-off. */
    openExternal(url: string): Promise<void>;
  };

/**
 * Mounts the Vanguard host's modules — Vanguard, Vault, Cleaner and Monitor (Phase 124 Theme E.3) — through
 * `mountModuleMains`, one registration path for all four. Monitor's `terminal.list` is Vanguard's sessions guest
 * already (same channel, same broker), so it is registered once, there (`shared`). Returns the pieces the
 * host's quit path needs.
 */
export async function registerVanguardHost(
  el: VanguardHostElectron,
): Promise<{ shutdown: () => Promise<void> }> {
  const vanguard = await prepareVanguard(el);
  const vault = prepareVault(el);
  const terminals = async () =>
    terminalListFromShared(await vanguard.broker.listSessions(), readHostSessions(readRuntimeHostRecord(el.runtimeDirectory)?.sessionsFile));
  const monitor: MonitorModuleServices = {
    onMetricsService: el.onMetricsService,
    homeDir: el.homeDir,
    agentSessions: async () => usageSessionsFrom(await terminals()),
    warn: (issue) => el.log.write('warn', issue),
    openExternal: el.openExternal,
  };
  const mounts: ModuleMount[] = [
    vanguard.mount,
    vault.mount,
    { module: cleanerModuleMain, services: { pickDirectory: el.pickDirectory } },
    { module: monitorModuleMain, services: monitor, shared: [CHANNELS.terminalList] },
  ];
  mountModuleMains(createIpcContext(el), mounts);
  await vanguard.service.host.start();
  return {
    shutdown: async () => {
      vault.close();
      await vanguard.shutdown();
    },
  };
}
