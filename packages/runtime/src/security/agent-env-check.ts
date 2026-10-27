/**
 * The bound an agent's environment must stay inside — Phase 121 Theme D.
 *
 * An agent pty, a council member's pty and a headless child must not receive the vault's secrets through their
 * environment: not an `agent.<id>.apiKey` value, not a forge token, not a database password. The one exception
 * is the single variable an engine needs to authenticate (Theme I hands it over at spawn), and it must be named
 * here, per engine, so a new one is a deliberate edit and not an accident. `MSTUDIO_*` variables carry ids only.
 *
 * This is a pure check over an environment object, so a test can hold any spawn path to it.
 */

export interface AgentEnvBound {
  /** Every secret value the vault holds (name for the message, value to look for). */
  vaultValues: ReadonlyArray<{ name: string; value: string }>;
  /**
   * The variable that may carry a vault value, mapped to the vault entry it may carry: at most one per engine
   * (more than one carrying a value is a violation). Empty today: nothing hands an agent a vault value.
   */
  allowed?: Readonly<Record<string, string>>;
  /** The `MSTUDIO_*` names that may appear. */
  mstudioKeys?: readonly string[];
}

export const DEFAULT_MSTUDIO_ENV_KEYS = ['MSTUDIO_SESSION_ID', 'MSTUDIO_AGENT_ID'] as const;

/** A `MSTUDIO_*` value is an id: a short token with no whitespace, path separator or key-like run. */
const ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** What is wrong with `env`, one sentence per problem; empty when it is inside the bound. */
export function agentEnvViolations(env: Readonly<Record<string, string | undefined>>, bound: AgentEnvBound): string[] {
  const problems: string[] = [];
  const carriers = new Set<string>();
  const allowed = bound.allowed ?? {};
  const mstudio = new Set<string>(bound.mstudioKeys ?? DEFAULT_MSTUDIO_ENV_KEYS);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === '') continue;
    if (key.startsWith('MSTUDIO_')) {
      if (!mstudio.has(key)) problems.push(`${key} is not a documented MSTUDIO_* variable`);
      else if (!ID_SHAPE.test(value)) problems.push(`${key} carries more than an id`);
    }
    for (const secret of bound.vaultValues) {
      if (secret.value === '' || !value.includes(secret.value)) continue;
      if (allowed[key] !== secret.name) problems.push(`${key} carries the vault value ${secret.name}`);
      else carriers.add(key);
    }
  }
  if (carriers.size > 1) problems.push(`more than one variable carries a vault value (${[...carriers].join(', ')})`);
  return problems;
}
