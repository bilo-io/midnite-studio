import { type MetricsService, type UsageSession } from '@midnite/studio-feature-monitor/main';
import { createIpcContext, type IpcContextElectron, type LogSink } from '@midnite/studio-runtime';

import { monitorModuleMain, type TerminalList } from './module';

/** The electron pieces Monitor's main needs, injected so registration is testable under bare vitest. */
export type MonitorElectron = IpcContextElectron & {
  /** Handed the sampler so main can pause it as the window blurs or hides. */
  onMetricsService(service: MetricsService): void;
  /** Monitor's crash log — the runtime's file sink, the same one Studio's main writes through. */
  log: LogSink;
  /**
   * The live terminal sessions, read-only. Monitor owns no pty broker: main composes this over the
   * runtime host's broker as a guest (`shared-sessions.ts`); absent it, Monitor lists none.
   */
  listSessions?: () => Promise<TerminalList>;
  /**
   * The runtime-injected home directory agent transcripts are read under, and the live agent
   * sessions to read them for. Absent both, token spend is an honest empty list.
   */
  homeDir?: string;
  agentSessions?: () => Promise<readonly UsageSession[]>;
  /** `shell.openExternal`, for a `midnite://open` hand-off only (`registerHandoffOpener` checks). */
  openExternal?: (url: string) => Promise<void>;
};

/**
 * Registers every channel Monitor's renderer can call: the monitor feature's (metrics, system
 * health), the terminal list and the hand-off. The crash-log reads and Report an Issue are the
 * report feature's (`report.ts`) — registered once, there, over the same log sink.
 */
export function registerMonitorHandlers(el: MonitorElectron): void {
  monitorModuleMain.register(createIpcContext(el), {
    onMetricsService: el.onMetricsService,
    ...(el.homeDir ? { homeDir: el.homeDir } : {}),
    ...(el.agentSessions ? { agentSessions: el.agentSessions } : {}),
    warn: (issue) => el.log.write('warn', issue),
    ...(el.listSessions ? { listSessions: el.listSessions } : {}),
    ...(el.openExternal ? { openExternal: el.openExternal } : {}),
  });
}
