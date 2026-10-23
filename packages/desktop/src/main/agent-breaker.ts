import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AgentLimitsSettingsSchema,
  resolveAgentLimits,
  type AgentLimits,
  type AgentLimitsSettings,
  type AgentLimitTrip,
  type AgentTokenTotals,
  type NewAgentAuditRecord,
  type NewSecurityFinding,
} from '@midnite/studio-shared';
import { createAgentBreaker, type AgentBreaker, type AgentAuditReader } from '@midnite/studio-runtime';

/**
 * Wires the runtime's agent breaker to Studio's ptys, ledger and window (Phase 121 Theme F). Everything
 * Electron-shaped arrives as a seam, so this is tested under bare vitest and the file imports no `electron`.
 *
 * **The interrupt seam.** The breaker asks `interrupt(sessionId)` — in Studio that is the same Ctrl+C write
 * to the session's pty that Vanguard's `pause-session` response action performs (Phase 120 H). Phase 120 G's
 * rogue-agent pause can pass the same function (or call `breaker.resolve`); it is the one place a session is
 * paused, whoever decides to.
 */
export interface AgentBreakerSeams {
  /** The trail's read side (`agentAuditTrail()`), `null` until `userData` is known. */
  reader: () => AgentAuditReader | null;
  record: (record: NewAgentAuditRecord) => void;
  raiseFinding: (finding: NewSecurityFinding) => Promise<unknown>;
  /** Send the tripped-limit notification to the window. */
  emitTrip: (trip: AgentLimitTrip) => void;
  /** Write Ctrl+C to the session's pty; false when it is not live. */
  interrupt: (sessionId: string) => Promise<boolean>;
  /** End the session's pty. */
  stop: (sessionId: string) => Promise<boolean>;
  /** The session's identity (cwd for the per-repo override, agent + conversation for the spend reading). */
  session: (sessionId: string) => Promise<{ id: string; agentId: string; title: string; cwd: string; agentConversationId?: string } | null>;
  /** The saved limits; read at each check so an edit applies without a restart. */
  settings: () => Promise<AgentLimitsSettings | undefined>;
  /** The monitor feature's `buildAgentUsage` over one session; `null` totals when no transcript is found. */
  usage: (session: { id: string; agentId: string; title: string; cwd: string; agentConversationId?: string }) => Promise<AgentTokenTotals | null>;
  onSessionExit: (hook: (sessionId: string) => void) => () => void;
  onError?: (error: unknown) => void;
  pollMs?: number;
}

export interface RunningAgentBreaker {
  breaker: AgentBreaker;
  dispose: () => void;
}

/** Tokens that count as spend: new input, output and cache writes. Cache reads are the same context again. */
export function spendTokens(totals: AgentTokenTotals): number {
  return totals.input + totals.output + totals.cacheCreate;
}

export function startAgentBreaker(seams: AgentBreakerSeams): RunningAgentBreaker {
  // Resolved at most every few seconds per session: the check runs per audit record, and the settings are a file.
  const cache = new Map<string, { at: number; limits: AgentLimits }>();
  const limitsFor = async (sessionId: string): Promise<AgentLimits> => {
    const hit = cache.get(sessionId);
    if (hit && Date.now() - hit.at < 5_000) return hit.limits;
    const [settings, session] = await Promise.all([seams.settings(), seams.session(sessionId)]);
    const limits = resolveAgentLimits(settings, session?.cwd);
    cache.set(sessionId, { at: Date.now(), limits });
    return limits;
  };
  const lazyReader: Pick<AgentAuditReader, 'readSince'> = {
    readSince: async (cursor) => (await seams.reader()?.readSince(cursor)) ?? { records: [], cursor: null },
  };
  const breaker = createAgentBreaker({
    reader: lazyReader,
    limits: limitsFor,
    interrupt: seams.interrupt,
    stop: seams.stop,
    record: seams.record,
    raiseFinding: seams.raiseFinding,
    notify: seams.emitTrip,
    spend: async (sessionId) => {
      const session = await seams.session(sessionId);
      const totals = session ? await seams.usage(session) : null;
      return totals ? spendTokens(totals) : null;
    },
    ...(seams.onError ? { onError: seams.onError } : {}),
  });
  const stopPolling = breaker.start(seams.pollMs ?? 5_000);
  const offExit = seams.onSessionExit((sessionId) => {
    cache.delete(sessionId);
    breaker.forget(sessionId);
  });
  return {
    breaker,
    dispose: () => {
      stopPolling();
      offExit();
    },
  };
}

/** `<userData>/security/agent-limits.json`: `{ defaults?, repos? }`, hand-editable until the settings page lands. */
export function agentLimitsSettingsReader(userData: string): () => Promise<AgentLimitsSettings | undefined> {
  const path = join(userData, 'security', 'agent-limits.json');
  return async () => {
    try {
      const parsed = AgentLimitsSettingsSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  };
}
