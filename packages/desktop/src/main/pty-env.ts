/**
 * The write-side fingerprint (Phase 78 Theme E) — environment only, and only
 * on an agent-kind pty.
 *
 * Any agent, hook or script the user already runs can read
 * `MSTUDIO_SESSION_ID`/`MSTUDIO_AGENT_ID`; nothing changes if none does. A
 * plain shell session gets neither. The broker itself has no concept of
 * "agent" — `broker/server.ts`'s `create` handler takes a flat `env` map and
 * knows nothing about `kind`/`agentId` — so this is the one place upstream of
 * it, shared by both the broker-backed and inproc pty-creation paths
 * (`pty-service.ts`, `inproc-pty.ts`), that knows which kind of pty is being
 * asked for and can decide.
 *
 * Pulled out as its own pure function rather than inlined at each call site:
 * a spawned pty is not something a unit test can cheaply assert on, but the
 * env object handed to it is.
 */
export function agentFingerprintEnv(
  kind: string | undefined,
  sessionId: string,
  agentId: string | undefined,
): Record<string, string> {
  if (kind !== 'agent' || !agentId) return {};
  return { MSTUDIO_SESSION_ID: sessionId, MSTUDIO_AGENT_ID: agentId };
}
