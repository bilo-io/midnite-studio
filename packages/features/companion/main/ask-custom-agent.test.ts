// @vitest-environment node
import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from '@midnite/studio-runtime';
import { askCompanion, buildAskPrompt, type CompanionAskDeps } from './ask';
import { CUSTOM_AGENTS_NEED_STUDIO, type CompanionProfileRun } from './services';

/** Phase 154 Theme H — a headless ask through a custom agent. */

function fakeSpawn(stdout: string, calls: { command: string; args: readonly string[] }[], exitCode = 0): SpawnFn {
  return (command, args) => {
    calls.push({ command, args });
    const h: { out?: (c: string) => void; close?: (code: number | null) => void } = {};
    const child: SpawnedProcess = {
      onStdout: (fn) => {
        h.out = fn;
      },
      onStderr: () => undefined,
      onError: () => undefined,
      onClose: (fn) => {
        h.close = fn;
      },
      kill: () => queueMicrotask(() => h.close?.(null)),
    };
    queueMicrotask(() => {
      h.out?.(stdout);
      h.close?.(exitCode);
    });
    return child;
  };
}

const claude = BUILTIN_AGENTS.find((a) => a.id === 'claude') as AgentDefinition;
const codex = BUILTIN_AGENTS.find((a) => a.id === 'codex') as AgentDefinition;

function setup(run: CompanionProfileRun | null, stdout = '{"say":"On it."}') {
  const calls: { command: string; args: readonly string[] }[] = [];
  const profileRun = vi.fn(async () => run as CompanionProfileRun);
  const deps: CompanionAskDeps = {
    agents: async () => [claude],
    home: () => '/home/tester',
    spawn: fakeSpawn(stdout, calls),
    ...(run ? { profileRun } : {}),
  };
  return { calls, deps, profileRun };
}

const input = { kind: 'route' as const, text: 'review my branch', repoPath: '/repo', agentId: 'claude', agentProfileId: 'profile-rev' };

describe('askCompanion with a custom agent', () => {
  it('runs the prepared argv with the ask as the last word, and releases the socket after', async () => {
    const release = vi.fn(async () => undefined);
    const { calls, deps, profileRun } = setup({
      kind: 'ready',
      name: 'Reviewer',
      agent: codex,
      args: ['exec', '-c', 'mcp_servers.midnite.command="node"'],
      promptPrefix: 'You review code.',
      release,
    });
    const result = await askCompanion(input, deps);
    expect(result).toEqual({ ok: true, value: { say: 'On it.' } });
    expect(profileRun).toHaveBeenCalledWith('profile-rev', '/repo');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe(codex.command);
    expect(calls[0]?.args.slice(0, 3)).toEqual(['exec', '-c', 'mcp_servers.midnite.command="node"']);
    const prompt = calls[0]?.args.at(-1) as string;
    expect(prompt.startsWith('You review code.\n\n---\n\n')).toBe(true);
    expect(prompt).toContain(buildAskPrompt(input).slice(0, 40));
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases the socket however the run ends', async () => {
    const release = vi.fn(async () => undefined);
    const calls: { command: string; args: readonly string[] }[] = [];
    const result = await askCompanion(input, {
      agents: async () => [claude],
      spawn: fakeSpawn('', calls, 1),
      profileRun: async () => ({ kind: 'ready', name: 'Reviewer', agent: claude, args: ['-p'], promptPrefix: null, release }),
    });
    expect(result.ok && result.value.agentProfileFallback).toBeFalsy();
    expect(release).toHaveBeenCalledOnce();
  });

  it('falls back to the built-in agent for a deleted custom agent and says so in the reply', async () => {
    const { calls, deps } = setup({ kind: 'missing' });
    const result = await askCompanion(input, deps);
    expect(result).toEqual({ ok: true, value: { say: 'On it.', agentProfileFallback: 'deleted' } });
    expect(calls[0]?.command).toBe(claude.command);
    expect(calls[0]?.args[0]).toBe('-p');
  });

  it('runs nothing when the custom agent cannot run as itself', async () => {
    const message = 'Reviewer runs on Codex, which is not installed here — pick another agent in the title bar.';
    const { calls, deps } = setup({ kind: 'error', message });
    expect(await askCompanion(input, deps)).toEqual({ ok: false, kind: 'error', message });
    expect(calls).toHaveLength(0);
  });

  it('refuses in an app without custom agents rather than running another agent', async () => {
    const { calls, deps } = setup(null);
    expect(await askCompanion(input, deps)).toEqual({ ok: false, kind: 'error', message: CUSTOM_AGENTS_NEED_STUDIO });
    expect(calls).toHaveLength(0);
  });

  it('lists custom agents in the route prompt by id and name only', () => {
    const prompt = buildAskPrompt({
      ...input,
      vocabulary: { views: [], settingsPages: [], commands: [], skills: [], repos: [], customAgents: [{ id: 'profile-rev', name: 'Reviewer' }] },
    });
    expect(prompt).toContain('profile-rev — Reviewer');
  });
});
