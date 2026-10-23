import {
  AGENT_AUDIT_RING_TAIL,
  type AgentAuditRecord,
  type McpCallEntry,
  type NewAgentAuditRecord,
} from '@midnite/studio-shared';

/**
 * The MCP call log — a tail of the durable audit trail (Phase 121 Theme G).
 *
 * `recordMcpCall` writes an `mcp-call` record through the trail and `getMcpCallLog` reads the newest
 * {@link AGENT_AUDIT_RING_TAIL} back out of it, so the Tools view shows exactly what the file holds and
 * changes nothing. The trail does not exist until `userData` is known; until `configureMcpAudit` runs,
 * calls sit in a bounded in-memory ring (the old Theme E ring) and are moved into the trail, oldest
 * first, when it arrives. With no trail ever configured (a bare test) the ring is the whole log.
 *
 * No payload bodies and nothing beyond `repoPath` (the caller-supplied root every tool's input carries)
 * ever goes in here — the trail's schema strips anything else, and a diff hunk or a subpath in a
 * diagnostics list would be exactly the leak the phase doc's own guardrail calls out.
 */

/** The slice of the runtime trail this module needs. */
export type McpAuditTrail = {
  record(input: NewAgentAuditRecord): string;
  tail(options: { kind: 'mcp-call'; limit: number }): Promise<AgentAuditRecord[]>;
};

const CAPACITY = AGENT_AUDIT_RING_TAIL;

let ring: McpCallEntry[] = [];
let trail: McpAuditTrail | null = null;

const asRecord = (entry: McpCallEntry): NewAgentAuditRecord => ({
  kind: 'mcp-call',
  at: entry.at,
  tool: entry.tool,
  repoPath: entry.repoPath,
  ok: entry.ok,
  ms: entry.ms,
});

/** Point the log at the trail and move anything held in the ring into it. Pass `null` to detach. */
export function configureMcpAudit(next: McpAuditTrail | null): void {
  trail = next;
  if (!trail) return;
  for (const entry of ring) trail.record(asRecord(entry));
  ring = [];
}

export function recordMcpCall(entry: McpCallEntry): void {
  if (trail) {
    trail.record(asRecord(entry));
    return;
  }
  ring.push(entry);
  if (ring.length > CAPACITY) ring = ring.slice(ring.length - CAPACITY);
}

/** Newest first — the order the Settings page's diagnostics list wants. */
export async function getMcpCallLog(): Promise<McpCallEntry[]> {
  if (!trail) return [...ring].reverse();
  const records = await trail.tail({ kind: 'mcp-call', limit: CAPACITY });
  return records.flatMap((r) =>
    r.kind === 'mcp-call' ? [{ at: r.at, tool: r.tool as McpCallEntry['tool'], repoPath: r.repoPath, ok: r.ok, ms: r.ms }] : [],
  );
}

/** Test-only: the ring and the trail binding are module state, so a suite that asserts on them resets first. */
export function resetMcpCallLog(): void {
  ring = [];
  trail = null;
}
