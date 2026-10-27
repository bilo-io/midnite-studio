import { agentEnvViolations, DEFAULT_MSTUDIO_ENV_KEYS } from '@midnite/studio-runtime';
import { AGENT_SECRET_IDS, agentSecretKey } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { agentFingerprintEnv } from './pty-env';

/**
 * Phase 121 Theme D, "The agent's environment". What an agent pty is stamped with must stay inside the bound:
 * `MSTUDIO_*` carries ids, and no vault value (an `agent.<id>.apiKey`, a forge token, a canary) rides in the
 * environment except the one variable an engine needs, which Theme I documents and hands over at spawn.
 * Written as a bound, not an exact set, so it holds both before and after that lands: today zero vault values,
 * afterwards at most one documented variable per engine.
 */
const vaultValues = [
  ...AGENT_SECRET_IDS.map((id, i) => ({ name: `secrets:${agentSecretKey(id)}`, value: `vault-value-for-${id}-${String(i).padStart(4, '0')}-xyz` })),
  { name: 'forge-accounts:github:github.com:me', value: 'ghp_forgetokenvalue00000000000000000003' },
  { name: 'canaries:github-pat', value: `ghp_${'c'.repeat(36)}` },
];

describe("the agent pty's environment", () => {
  it.each(AGENT_SECRET_IDS)('stamps %s with ids only and no vault value', (agentId) => {
    const env = agentFingerprintEnv('agent', 'session-1', agentId);
    expect(Object.keys(env).sort()).toEqual([...DEFAULT_MSTUDIO_ENV_KEYS].sort());
    expect(env).toEqual({ MSTUDIO_SESSION_ID: 'session-1', MSTUDIO_AGENT_ID: agentId });
    expect(agentEnvViolations(env, { vaultValues })).toEqual([]);
  });

  it('a plain shell is stamped with nothing', () => {
    expect(agentFingerprintEnv('shell', 'session-1', undefined)).toEqual({});
  });

  it('fails when a key is added to the pty env', () => {
    const env = { ...agentFingerprintEnv('agent', 'session-1', 'claude'), ANTHROPIC_API_KEY: vaultValues[0]!.value };
    expect(agentEnvViolations(env, { vaultValues })).toEqual([`ANTHROPIC_API_KEY carries the vault value ${vaultValues[0]!.name}`]);
  });

  it('fails when an undocumented MSTUDIO_ variable appears, or one stops being an id', () => {
    expect(agentEnvViolations({ MSTUDIO_API_KEY: 'x' }, { vaultValues })).toHaveLength(1);
    expect(agentEnvViolations({ MSTUDIO_AGENT_ID: `claude ${vaultValues[0]!.value}` }, { vaultValues }).length).toBeGreaterThan(0);
  });
});
