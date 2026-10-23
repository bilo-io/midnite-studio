import { describe, expect, it } from 'vitest';

import { agentFingerprintEnv, agentKeyEnv } from './pty-env';

describe('agentFingerprintEnv', () => {
  it('is empty for a shell session', () => {
    expect(agentFingerprintEnv('shell', 'session-1', undefined)).toEqual({});
  });

  it('is empty for an agent kind missing an agentId (should not happen, but no fingerprint without one)', () => {
    expect(agentFingerprintEnv('agent', 'session-1', undefined)).toEqual({});
  });

  it('is empty for an undefined kind', () => {
    expect(agentFingerprintEnv(undefined, 'session-1', 'claude')).toEqual({});
  });

  it('stamps both vars for an agent session', () => {
    expect(agentFingerprintEnv('agent', 'session-1', 'claude')).toEqual({
      MSTUDIO_SESSION_ID: 'session-1',
      MSTUDIO_AGENT_ID: 'claude',
    });
  });
});

describe('agentKeyEnv (Phase 121 Theme I)', () => {
  const stored: Record<string, string> = {
    'agent.claude.apiKey': 'sk-ant',
    'agent.codex.apiKey': 'sk-oai',
    'ollama.apiKey': 'ollama-cloud',
  };
  const reads: string[] = [];
  const read = async (key: string): Promise<string | null> => {
    reads.push(key);
    return stored[key] ?? null;
  };

  it('gives an agent pty its engine key as the one documented variable, and the fingerprint carries only ids', async () => {
    reads.length = 0;
    expect(await agentKeyEnv('agent', 'claude', undefined, read as never)).toEqual({ ANTHROPIC_API_KEY: 'sk-ant' });
    expect(reads).toEqual(['agent.claude.apiKey']);
    const fingerprint = agentFingerprintEnv('agent', 'session-1', 'claude');
    expect(Object.keys(fingerprint).every((k) => k.startsWith('MSTUDIO_'))).toBe(true);
    expect(Object.values(fingerprint)).toEqual(['session-1', 'claude']);
  });

  it('two engines get two environments, not one holding both keys', async () => {
    const claude = await agentKeyEnv('agent', 'claude', undefined, read as never);
    const codex = await agentKeyEnv('agent', 'codex', undefined, read as never);
    expect(claude).toEqual({ ANTHROPIC_API_KEY: 'sk-ant' });
    expect(codex).toEqual({ OPENAI_API_KEY: 'sk-oai' });
  });

  it('gives a shell session, an Ollama-routed launch and an unknown agent nothing', async () => {
    reads.length = 0;
    expect(await agentKeyEnv('shell', 'claude', undefined, read as never)).toEqual({});
    expect(await agentKeyEnv('agent', 'claude', true, read as never)).toEqual({});
    expect(await agentKeyEnv('agent', 'not-an-agent', undefined, read as never)).toEqual({});
    expect(await agentKeyEnv('agent', undefined, undefined, read as never)).toEqual({});
    expect(reads).toEqual([]);
  });
});
