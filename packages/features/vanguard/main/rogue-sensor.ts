import type { AgentAuditCursor, AgentAuditRecord, SecurityFinding } from '@midnite/studio-shared';

import type { IntegrityLiveSession } from './integrity/attribution';
import type { AutoPause } from './rogue-pause';
import { correlateLiveChanges, evaluateRogueRules, type RogueFinding, type LiveSession } from './rogue-rules';
import type { SensorContext, SensorDefinition } from './sensor-host';

/**
 * The rogue-agent sensor (Phase 120 Theme G): follows the agent audit trail (Phase 121 G) read-only through
 * the runtime reader, feeds each new batch of records through the behaviour rules, correlates the persistence
 * and network sensors' new findings with the sessions that were live, records what comes out and hands each
 * finding to auto-pause.
 *
 * It starts at the **end** of the trail (a `null` cursor), so history from before the app started never raises
 * anything. A `limit-trip` is held for one pass before it is judged: Phase 121 F's breaker writes the record and
 * raises its own `medium` finding a moment later, and a trip must be one finding, not two.
 */

export const ROGUE_SENSOR_ID = 'rogue-agents';
const POLL_MS = 3_000;
/** How far back the correlation looks for a new persistence item or host, and how long a session counts as recently active. */
const CORRELATION_LOOKBACK_MS = 10 * 60_000;

export interface RogueSensorDeps {
  reader: { readSince(cursor: AgentAuditCursor | null): Promise<{ records: AgentAuditRecord[]; cursor: AgentAuditCursor | null }> };
  /** The pty sessions live now (the same seam the integrity sensor reads). */
  liveSessions: () => readonly IntegrityLiveSession[] | Promise<readonly IntegrityLiveSession[]>;
  /** Fingerprints of the findings open in the ledger, to leave the breaker's own row alone. */
  openFingerprints: () => Promise<ReadonlySet<string>>;
  /** Persistence and network findings first seen since `since`. */
  recentChanges: (since: number) => Promise<readonly SecurityFinding[]>;
  autoPause?: AutoPause;
}

export function createRogueAgentSensor(deps: RogueSensorDeps): SensorDefinition {
  let cursor: AgentAuditCursor | null = null;
  let held: AgentAuditRecord[] = [];
  const lastActivity = new Map<string, number>();
  const correlated = new Set<string>();

  const raise = async (ctx: SensorContext, finding: RogueFinding): Promise<void> => {
    const { rule: _rule, ...rest } = finding;
    const recorded = await ctx.record(rest);
    await deps.autoPause?.onFinding({
      sessionId: finding.sessionId,
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      findingId: recorded.id,
    });
  };

  return {
    id: ROGUE_SENSOR_ID,
    label: 'Rogue agent behaviour',
    description: 'Reads the agent audit trail for secret reads, writes outside scope, destructive git and keychain calls',
    schedule: { kind: 'interval', ms: POLL_MS },
    async start() {
      cursor = (await deps.reader.readSince(null)).cursor;
    },
    async run(ctx) {
      const sessions = await deps.liveSessions();
      const roots = new Map(sessions.map((s) => [s.sessionId, s.cwd ? [s.cwd] : []] as const));
      const read = await deps.reader.readSince(cursor);
      cursor = read.cursor;
      for (const record of read.records) if (record.sessionId) lastActivity.set(record.sessionId, record.at);

      // Trips from the previous pass are judged now; this pass's wait for the next.
      const trips = held;
      held = read.records.filter((r) => r.kind === 'limit-trip');
      const fresh = read.records.filter((r) => r.kind !== 'limit-trip');
      const homeDir = ctx.homeDir ?? '';
      const findings: RogueFinding[] = evaluateRogueRules([...fresh, ...trips], {
        homeDir,
        scopeRoots: (sessionId) => roots.get(sessionId) ?? [],
      });

      const live: LiveSession[] = sessions.map((s) => ({
        sessionId: s.sessionId,
        ...(s.title ? { title: s.title } : {}),
        lastActivityAt: lastActivity.get(s.sessionId) ?? null,
      }));
      if (live.some((s) => s.lastActivityAt !== null)) {
        const changes = (await deps.recentChanges(ctx.now() - CORRELATION_LOOKBACK_MS)).filter((c) => !correlated.has(c.id));
        for (const change of changes) correlated.add(change.id);
        findings.push(...correlateLiveChanges(changes, live));
      }

      const open = findings.some((f) => f.rule === 'limit-burst') ? await deps.openFingerprints() : new Set<string>();
      let raised = 0;
      for (const finding of findings) {
        if (finding.rule === 'limit-burst' && open.has(finding.fingerprint)) continue;
        await raise(ctx, finding);
        raised += 1;
      }
      return { findings: raised };
    },
  };
}
