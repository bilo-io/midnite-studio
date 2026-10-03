import { EVENT_CHANNELS } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { createAgentProbeService, type AgentProbeService } from './agent-probe-service';
import { defaultLogger } from './log';
import { listAgents } from './terminal-service';
import { broadcastToAllWindows } from './window-manager';

/**
 * The process-wide install probe, wired to the real roster and every window.
 * The pure logic lives in `agent-probe-service.ts`; this file is only the
 * electron-facing seam, so that logic stays testable under bare vitest.
 */
let service: AgentProbeService | null = null;

export function agentProbe(): AgentProbeService {
  service ??= createAgentProbeService({
    getRoster: listAgents,
    emit: (snapshot) => broadcastToAllWindows(EVENT_CHANNELS.agentStatus, snapshot),
    log: defaultLogger,
  });
  return service;
}

/**
 * Start the first probe, fire and forget. Called right after `app.whenReady()`
 * and deliberately not awaited: a login shell must never sit on the path to the
 * first window.
 */
export function startAgentProbeAtBoot(): void {
  void agentProbe().start();
}

/**
 * Force a fresh probe whenever this window's renderer finishes loading — a
 * Mod+R / Mod+Shift+R reload wipes the renderer's store, and an installed CLI
 * may have changed meanwhile. Bypasses the TTL; a probe already running is
 * joined rather than duplicated.
 */
export function bindAgentProbeToWindow(win: BrowserWindow): void {
  win.webContents.on('did-finish-load', () => {
    void agentProbe().start({ force: true });
  });
}
