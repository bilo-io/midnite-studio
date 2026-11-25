import { agentHistoryReadsEnabled } from './settings-mirror';
import { getAgentProfile } from '@midnite/studio-feature-agent-profiles/main';
import { homedir } from 'node:os';

import { buildAgentUsage } from '@midnite/studio-feature-monitor/main';
import { INTERRUPT } from '@midnite/studio-feature-vanguard/main';
import { sendToLiveWindow } from '@midnite/studio-runtime';
import { EVENT_CHANNELS, type AgentLimitResolveRequest } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { agentAuditTrail, recordAudit } from './agent-audit';
import { agentLimitsSettingsReader, startAgentBreaker, withHeadlessRuns, type RunningAgentBreaker } from './agent-breaker';
import { limitStopReason, studioHeadlessRuns } from './agent-profiles/headless-run-profiles';
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
    // #1713: a headless run has no pty and no prompt to come back to, so interrupting it means stopping it.
    // #1718: the stopped run's surface names the limit instead of its usual failure text.
    interrupt: async (sessionId, trip) => {
      const live = livePtyFor(sessionId);
      if (!live) return studioHeadlessRuns().abort(sessionId, trip ? limitStopReason(trip) : undefined);
      writePty(live.ptyId, INTERRUPT);
      return true;
    },
    stop: async (sessionId, trip) => {
      const live = livePtyFor(sessionId);
      if (!live) return studioHeadlessRuns().abort(sessionId, trip ? limitStopReason(trip) : undefined);
      killPty(live.ptyId);
      return true;
    },
    // #1697: a headless run under a custom agent has no terminal row; its registration stands in for one.
    session: withHeadlessRuns(agentSessionDetail, (runId) => studioHeadlessRuns().lookup(runId)),
    // Phase 154 Theme G: a custom agent's limits apply within the 5 s cache above; a deleted one adds none.
    profile: getAgentProfile,
    settings: agentLimitsSettingsReader(options.userData),
    usage: async (session) => {
      if (!agentHistoryReadsEnabled()) return null; // Phase 115 F: the Privacy switch stops transcript reads
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
