import { monitorMain, type MonitorMainServices } from '@midnite/studio-feature-monitor/main';
import { defineFeatureMain, registerHandoffOpener } from '@midnite/studio-runtime';
import { CHANNELS, type schemas } from '@midnite/studio-shared';
import type { z } from 'zod';

export type TerminalList = z.infer<typeof schemas.TerminalListResponse>;

/** What the host hands the Monitor module on top of the feature's own services. */
export type MonitorModuleServices = MonitorMainServices & {
  /**
   * The live terminal sessions, read-only. Monitor owns no pty broker: the host composes this over
   * the runtime host's broker as a guest; absent it, Monitor lists none.
   */
  listSessions?: () => Promise<TerminalList>;
  /** `shell.openExternal`, for a `midnite://open` hand-off only (`registerHandoffOpener` checks). */
  openExternal?: (url: string) => Promise<void>;
};

const NO_BROKER: TerminalList = {
  sessions: [],
  broker: { mode: 'inproc', reason: 'Monitor has no terminal broker of its own' },
};

/**
 * The Monitor module's main half (Phase 124 Theme D): the monitor feature's channels (metrics,
 * system health), the read-only terminal list and the hand-off. The crash-log reads and Report an
 * Issue are the report feature's, registered once by the host over the same log sink.
 */
export const monitorModuleMain = defineFeatureMain<MonitorModuleServices>({
  feature: 'monitor',
  channels: [...monitorMain.channels, CHANNELS.terminalList, CHANNELS.handoffOpen],
  register(ctx, { listSessions, openExternal, ...feature }) {
    // A session lives in Studio: "Open in Studio" leaves through the launcher's router.
    registerHandoffOpener(ctx.ipc, { openExternal: openExternal ?? (async () => Promise.reject(new Error('no opener'))) });
    monitorMain.register(ctx, feature);
    ctx.ipc.handleBare(CHANNELS.terminalList, () => listSessions?.() ?? NO_BROKER);
  },
});
