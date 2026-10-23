import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { runInShell } from '../login-shell';
import { agentEnvViolations } from './agent-env-check';

const VAULT = [
  { name: 'secrets:agent.claude.apiKey', value: 'sk-ant-api03-claude-secret-value-0001' },
  { name: 'secrets:agent.codex.apiKey', value: 'sk-codex-secret-value-0002-abcdef' },
  { name: 'forge-accounts:github:github.com:me', value: 'ghp_forgetokenvalue00000000000000000003' },
  { name: 'canaries:github-pat', value: `ghp_${'c'.repeat(36)}` },
];

describe('agentEnvViolations', () => {
  it('passes an environment with no vault value and only id-shaped MSTUDIO_ variables', () => {
    expect(agentEnvViolations({ PATH: '/usr/bin', MSTUDIO_SESSION_ID: 'sess-1', MSTUDIO_AGENT_ID: 'claude' }, { vaultValues: VAULT })).toEqual([]);
  });

  it('fails when a vault value is added to the environment, under any name and even embedded', () => {
    expect(agentEnvViolations({ FOO: VAULT[0]!.value }, { vaultValues: VAULT })).toEqual(['FOO carries the vault value secrets:agent.claude.apiKey']);
    expect(agentEnvViolations({ NETRC: `machine x password ${VAULT[2]!.value}` }, { vaultValues: VAULT })).toHaveLength(1);
  });

  it('fails on an undocumented MSTUDIO_ variable, or one that carries more than an id', () => {
    expect(agentEnvViolations({ MSTUDIO_TOKEN: 'abc' }, { vaultValues: VAULT })).toEqual(['MSTUDIO_TOKEN is not a documented MSTUDIO_* variable']);
    expect(agentEnvViolations({ MSTUDIO_AGENT_ID: 'claude --key ' + 'x'.repeat(40) }, { vaultValues: VAULT })).toEqual(['MSTUDIO_AGENT_ID carries more than an id']);
  });

  it('allows exactly the one documented variable for an engine, and no second', () => {
    const allowed = { ANTHROPIC_API_KEY: 'secrets:agent.claude.apiKey' };
    expect(agentEnvViolations({ ANTHROPIC_API_KEY: VAULT[0]!.value }, { vaultValues: VAULT, allowed })).toEqual([]);
    // The right value under the wrong name, or another engine's key beside it, is a violation.
    expect(agentEnvViolations({ OPENAI_API_KEY: VAULT[0]!.value }, { vaultValues: VAULT, allowed })).toHaveLength(1);
    expect(agentEnvViolations({ ANTHROPIC_API_KEY: VAULT[0]!.value, OPENAI_API_KEY: VAULT[1]!.value }, { vaultValues: VAULT, allowed })).toHaveLength(1);
  });
});

describe('login-shell.ts: the environment runInShell hands a child', () => {
  beforeEach(() => spawnMock.mockReset());

  function captureEnv(): Promise<Record<string, string | undefined>> {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => undefined;
      setTimeout(() => child.emit('close', 0), 0);
      return child;
    });
    return runInShell('true', 1000).then(() => (spawnMock.mock.calls[0]![2] as { env: Record<string, string | undefined> }).env);
  }

  it('is the process environment and nothing added: no vault value, no extra key', async () => {
    const env = await captureEnv();
    expect(env).toEqual({ ...process.env });
    expect(agentEnvViolations(env, { vaultValues: VAULT })).toEqual([]);
  });

  it('the check would fail it if a key were added', async () => {
    const env = { ...(await captureEnv()), ANTHROPIC_API_KEY: VAULT[0]!.value };
    expect(agentEnvViolations(env, { vaultValues: VAULT })).not.toEqual([]);
  });
});
