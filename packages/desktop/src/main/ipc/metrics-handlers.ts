import { monitorMain, type MetricsService } from '@midnite/studio-feature-monitor/main';
import { sendToLiveWindow, type FeatureMainContext } from '@midnite/studio-runtime';
import { homedir } from 'node:os';

import type { BrowserWindow } from 'electron';

import { defaultLogger } from '../log';
import { agentHistoryReadsEnabled } from '../settings-mirror';
import { DESKTOP_OLLAMA } from '../system-health';
import { listTerminals } from '../terminal-service';
import { handle, handleBare, handleSend } from './handle';

/**
 * System-metrics IPC, system health included — the handlers themselves are the
 * monitor feature's main half (Phase 113 Theme I); this is Studio's
 * composition of it. The sampler stays electron-free: it takes its window
 * lifecycle as `pause()`/`resume()` calls from the runtime's `bindMetricsToWindow` (Phase 123 Theme K).
 */
export function registerMetricsHandlers(getWindow: () => BrowserWindow | null): MetricsService {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: (channel, payload) => sendToLiveWindow(getWindow, channel, payload),
    trashItem: () => Promise.reject(new Error('monitor never trashes')),
  };
  let service: MetricsService | undefined;
  monitorMain.register(ctx, {
    ollama: DESKTOP_OLLAMA,
    warn: (issue) => defaultLogger.warn(issue),
    // Live agent sessions only; Monitor reads each one's own transcript under the real home.
    homeDir: homedir(),
    readAgentHistory: agentHistoryReadsEnabled,
    agentSessions: async () =>
      (await listTerminals()).flatMap(({ session, live }) =>
        live !== null && session.kind === 'agent' && session.agentId
          ? [{ id: session.id, agentId: session.agentId, title: session.name ?? session.title, cwd: session.cwd, agentConversationId: session.agentConversationId }]
          : [],
      ),
    onMetricsService: (s) => {
      service = s;
    },
  });
  if (!service) throw new Error('monitor feature did not hand back its sampler');
  return service;
}
