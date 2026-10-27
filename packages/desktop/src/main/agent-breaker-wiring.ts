import { homedir } from 'node:os';

import { buildAgentUsage } from '@midnite/studio-feature-monitor/main';
import { INTERRUPT } from '@midnite/studio-feature-vanguard/main';
import { sendToLiveWindow } from '@midnite/studio-runtime';
import { EVENT_CHANNELS, type AgentLimitResolveRequest } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { agentAuditTrail, recordAudit } from './agent-audit';
import { agentLimitsSettingsReader, startAgentBreaker, type RunningAgentBreaker } from './agent-breaker';
import { defaultLogger } from './log';
import { getFindingsLedger } from './ipc/vanguard-handlers';
import { killPty, livePtyFor, onSessionExit, writePty } from './pty-service';
import { agentSessionDetail } from './terminal-service';

/**
 * Studio's one agent breaker (Phase 121 Theme F), started at boot once `userData` and the findings ledger
 * exist. The seams are the real ones: the trail's reader, the audit writer, the ledger, the live pty.
 */
let running: RunningAgentBreaker | null = null;

export function startStudioAgentBreaker(options: { userData: string; getWindow: () => BrowserWindow | null }): void {
  running?.dispose();
  running = startAgentBreaker({
    reader: () => agentAuditTrail(),
    record: recordAudit,
    raiseFinding: (finding) => getFindingsLedger().record(finding),
    emitTrip: (trip) => sendToLiveWindow(options.getWindow, EVENT_CHANNELS.agentLimitTripped, trip),
    // The same Ctrl+C write Vanguard's `pause-session` performs (vanguard-handlers.ts) — Phase 120 G reuses it.
    interrupt: async (sessionId) => {
      const live = livePtyFor(sessionId);
      if (!live) return false;
      writePty(live.ptyId, INTERRUPT);
      return true;
    },
    stop: async (sessionId) => {
      const live = livePtyFor(sessionId);
      if (!live) return false;
      killPty(live.ptyId);
      return true;
    },
    session: agentSessionDetail,
    settings: agentLimitsSettingsReader(options.userData),
    usage: async (session) => {
      const usage = await buildAgentUsage(homedir(), [session]);
      return usage.sessions[0]?.totals ?? null;
    },
    onSessionExit: (hook) => onSessionExit((sessionId) => hook(sessionId)),
    onError: (error) => defaultLogger.warn(`agent breaker: ${String(error)}`),
  });
}

export function stopStudioAgentBreaker(): void {
  running?.dispose();
  running = null;
}

/** The notification's answer. `false` when the breaker is not running or the trip was already answered. */
export async function resolveAgentLimit(request: AgentLimitResolveRequest): Promise<boolean> {
  return (await running?.breaker.resolve(request.tripId, request.action)) ?? false;
}
