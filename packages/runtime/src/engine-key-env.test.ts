import { BUILTIN_AGENTS, SECRET_KEYS, type SecretKey } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { engineKeyEnv } from './engine-key-env';

const vault = (): { read: (key: SecretKey) => Promise<string | null>; asked: SecretKey[] } => {
  const asked: SecretKey[] = [];
  const values: Partial<Record<SecretKey, string>> = {
    'agent.claude.apiKey': 'sk-ant-claude',
    'agent.codex.apiKey': 'sk-openai-codex',
    'agent.agy.apiKey': 'gem-agy',
    'ollama.apiKey': 'ollama-cloud',
    'finance.twelveData': 'twelve',
  };
  return {
    asked,
    read: async (key) => {
      asked.push(key);
      return values[key] ?? null;
    },
  };
};

const agent = (id: string) => BUILTIN_AGENTS.find((a) => a.id === id);

describe('engineKeyEnv', () => {
  it('hands an engine its one key under the variable its CLI documents', async () => {
    const v = vault();
    expect(await engineKeyEnv(agent('claude'), v.read)).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-claude' });
    expect(await engineKeyEnv(agent('codex'), v.read)).toEqual({ OPENAI_API_KEY: 'sk-openai-codex' });
    expect(await engineKeyEnv(agent('agy'), v.read)).toEqual({ GEMINI_API_KEY: 'gem-agy' });
  });

  it('reads only the vault key of the engine being started, never a neighbour or another namespace', async () => {
    const v = vault();
    await engineKeyEnv(agent('codex'), v.read);
    expect(v.asked).toEqual(['agent.codex.apiKey']);
  });

  it('a council of three engines gets three environments, each holding exactly its own key', async () => {
    const v = vault();
    const envs = await Promise.all(['claude', 'codex', 'agy'].map((id) => engineKeyEnv(agent(id), v.read)));
    expect(envs.map((env) => Object.keys(env))).toEqual([['ANTHROPIC_API_KEY'], ['OPENAI_API_KEY'], ['GEMINI_API_KEY']]);
    const all = envs.flatMap((env) => Object.values(env));
    for (const env of envs) expect(Object.values(env)).toHaveLength(1);
    expect(new Set(all).size).toBe(3);
  });

  it('gives Ollama and a forge-credential engine nothing, and never touches the vault for them', async () => {
    const v = vault();
    expect(await engineKeyEnv({ id: 'ollama', apiKeyEnvVar: 'OLLAMA_API_KEY' }, v.read)).toEqual({});
    expect(await engineKeyEnv(agent('copilot'), v.read)).toEqual({});
    expect(await engineKeyEnv(undefined, v.read)).toEqual({});
    expect(v.asked).toEqual([]);
  });

  it('is empty when no key is stored or the vault refuses, never a failed spawn', async () => {
    expect(await engineKeyEnv(agent('grok'), async () => null)).toEqual({});
    expect(await engineKeyEnv(agent('claude'), async () => '')).toEqual({});
    expect(
      await engineKeyEnv(agent('claude'), async () => {
        throw new Error('vault locked');
      }),
    ).toEqual({});
  });

  it('every engine with a vault slot names its documented variable', () => {
    const slots = SECRET_KEYS.filter((k) => k.startsWith('agent.'));
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const id = slot.split('.')[1];
      expect(agent(id as string)?.apiKeyEnvVar, slot).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
});
