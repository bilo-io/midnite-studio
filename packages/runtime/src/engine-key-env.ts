import { agentSecretKey, type AgentDefinition, type SecretKey } from '@midnite/studio-shared';

/**
 * One key per engine, at spawn (Phase 121 Theme I).
 *
 * An agent CLI that needs an API key gets it as the one environment variable its own documentation
 * names (`apiKeyEnvVar` on the roster: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...), read from the vault
 * by main at the moment of the spawn. The value goes into that child's environment and nowhere else:
 * not into the renderer, not into the typed command line, not into a log, and never into the
 * environment of a *different* engine. A council of three engines is three spawns with three
 * environments, each built by one call to this function.
 *
 * It reads exactly one vault key, `agent.<id>.apiKey`, for the engine being started — never the whole
 * `agent.*` namespace, never `ollama.apiKey`, never another app's secrets. An engine with no vault slot
 * (Ollama is not an agent CLI; Copilot's `GITHUB_TOKEN` is a forge credential, not an agent key) gets
 * an empty environment, as does one with no stored key — the CLI then falls back to its own login,
 * exactly as before.
 */
export type EngineKeyReader = (key: SecretKey) => Promise<string | null> | string | null;

export async function engineKeyEnv(
  agent: Pick<AgentDefinition, 'id' | 'apiKeyEnvVar'> | undefined,
  read: EngineKeyReader,
): Promise<Record<string, string>> {
  if (!agent?.apiKeyEnvVar) return {};
  const slot = agentSecretKey(agent.id);
  if (!slot) return {};
  let value: string | null;
  try {
    value = await read(slot);
  } catch {
    // A locked or unreadable vault is "no key", never a failed spawn.
    return {};
  }
  return value ? { [agent.apiKeyEnvVar]: value } : {};
}
