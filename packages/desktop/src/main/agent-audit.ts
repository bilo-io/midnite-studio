import { createAgentAudit, type AgentAudit } from '@midnite/studio-runtime';
import type { NewAgentAuditRecord } from '@midnite/studio-shared';

import { configureMcpAudit } from './mcp/audit';

/**
 * Studio's one agent audit trail (Phase 121 Theme G): `<userData>/security/audit/`, written by the
 * runtime's `createAgentAudit`. Configured once at boot, when `userData` is known; until then
 * `recordAudit` is a no-op (the MCP log holds its own early calls and moves them in — `mcp/audit.ts`).
 */
let trail: AgentAudit | null = null;

export function configureAgentAudit(options: { userData: string; homeDir: string; log: (message: string) => void }): AgentAudit {
  trail = createAgentAudit({
    userData: options.userData,
    homeDir: options.homeDir,
    // Phase 115 B's "Keep local history" setting does not exist yet; the runtime default (90 days) applies.
    onError: (error) => options.log(`agent audit write failed: ${String(error)}`),
  });
  configureMcpAudit(trail);
  void trail.prune();
  return trail;
}

export function agentAuditTrail(): AgentAudit | null {
  return trail;
}

/** Hand a record to the trail; total and silent before the trail exists. */
export function recordAudit(record: NewAgentAuditRecord): void {
  trail?.record(record);
}
