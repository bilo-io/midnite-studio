import type { McpCallEntry } from '@midnite/studio-shared';

/**
 * Theme E's bounded audit ring: the last `CAPACITY` MCP tool calls, in
 * memory only. Deliberately not a log file — Decision 11 leaves that to
 * whatever phase eventually gives `main/log.ts` real levels and rotation;
 * this ring is gone on quit, on purpose.
 *
 * No payload bodies and nothing beyond `repoPath` (the caller-supplied
 * root every tool's input carries) ever goes in here — a diff hunk or a
 * subpath in a diagnostics list would be exactly the leak the phase doc's
 * own guardrail calls out.
 */

const CAPACITY = 50;

let ring: McpCallEntry[] = [];

export function recordMcpCall(entry: McpCallEntry): void {
  ring.push(entry);
  if (ring.length > CAPACITY) ring = ring.slice(ring.length - CAPACITY);
}

/** Newest first — the order the Settings page's diagnostics list wants. */
export function getMcpCallLog(): McpCallEntry[] {
  return [...ring].reverse();
}

/** Test-only: the ring is module state, so a suite that asserts on it resets first. */
export function resetMcpCallLog(): void {
  ring = [];
}
