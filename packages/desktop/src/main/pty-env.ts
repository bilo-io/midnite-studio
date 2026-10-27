import { engineKeyEnv, type EngineKeyReader } from '@midnite/studio-runtime';
import { BUILTIN_AGENTS } from '@midnite/studio-shared';

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

/**
 * The one API key an agent pty's engine needs (Phase 121 Theme I) — `{ ANTHROPIC_API_KEY: ... }` for
 * Claude, `{ OPENAI_API_KEY: ... }` for Codex, and so on, read from the vault here in main and merged
 * into that pty's environment alone. Empty for a shell session, for an Ollama-routed launch (its
 * `ANTHROPIC_AUTH_TOKEN` is resolved separately and Ollama gets no agent key) and for an engine with
 * no vault slot. The roster is the built-in one: only built-in ids have an `agent.<id>.apiKey` slot.
 */
export async function agentKeyEnv(
  kind: string | undefined,
  agentId: string | undefined,
  useOllamaKey: boolean | undefined,
  read: EngineKeyReader,
): Promise<Record<string, string>> {
  if (kind !== 'agent' || !agentId || useOllamaKey) return {};
  return engineKeyEnv(
    BUILTIN_AGENTS.find((agent) => agent.id === agentId),
    read,
  );
}
