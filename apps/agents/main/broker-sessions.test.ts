// @vitest-environment node
import type { StartNodeSessionParams } from '@midnite/studio-feature-workflows/main';
import type { BrokerClient, SharedBroker } from '@midnite/studio-runtime';
import { BUILTIN_AGENTS, WORKFLOW_SESSION_REPO_ID } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createBrokerNodeSessions } from './broker-sessions';
import { AGENT_NODE_NEEDS_TERMINAL } from './node-session';
import type { ShellRunner } from './shell-runner';

/**
 * Agents' workflow node sessions over a guest client (`createSharedBroker`). The broker is a fake here —
 * what the real server allows a guest is proven in `desktop/src/main/broker-guest.test.ts` and
 * `desktop/src/broker/guest-rules.test.ts`; this holds Agents to what it asks: an agent node is created
 * on the host's broker, its output feeds the activity detector, and only its own sessions are killed.
 */

function fakeClient() {
  let onData: ((ptyId: string, bytes: Uint8Array) => void) | null = null;
  let onExit: ((ptyId: string, code: number) => void) | null = null;
  let seq = 0;
  const client = {
    onData: (l: typeof onData) => ((onData = l), () => undefined),
    onExit: (l: typeof onExit) => ((onExit = l), () => undefined),
    createPty: vi.fn(async () => ({ ok: true as const, ptyId: `pty-${++seq}`, pid: 99 })),
    killPty: vi.fn(async (ptyId: string) => (onExit?.(ptyId, 137), true)),
  } as unknown as BrokerClient & { createPty: ReturnType<typeof vi.fn>; killPty: ReturnType<typeof vi.fn> };
  return { client, emit: (ptyId: string, text: string) => onData?.(ptyId, new TextEncoder().encode(text)) };
}

const brokerOf = (client: BrokerClient | null): SharedBroker => ({
  client: async () => client,
  listSessions: async () => ({ sessions: [], status: { mode: 'broker' } }),
  dispose: vi.fn(async () => undefined),
});

const shell = (): ShellRunner => ({
  createPty: vi.fn(async () => ({ ok: true as const, ptyId: 'shell-1' })),
  killPty: vi.fn(),
  onPty: vi.fn(),
  offPty: vi.fn(),
  killAll: vi.fn(),
});

const params = (kind: 'agent' | 'shell'): StartNodeSessionParams => ({
  workflowId: 'w1',
  runId: 'r1',
  nodeId: 'n1',
  kind,
  ...(kind === 'agent' ? { agentId: 'claude' } : {}),
  nodeLabel: 'Ask',
  cwd: '/tmp',
  initialInput: 'claude "hi"\r',
  env: { NODE_ONLY: '1' },
});

describe('Agents’ node sessions on the shared broker', () => {
  it('fails an agent node plainly when no host broker is running — it never hangs', async () => {
    const sessions = createBrokerNodeSessions({ broker: brokerOf(null), shell: shell(), agents: () => BUILTIN_AGENTS });
    expect(await sessions.ports.startNodeSession(params('agent'))).toEqual({ ok: false, message: AGENT_NODE_NEEDS_TERMINAL });
  });

  it('creates an agent node on the host’s broker and reads its activity; a script node stays a piped shell', async () => {
    const { client, emit } = fakeClient();
    const runner = shell();
    const sessions = createBrokerNodeSessions({ broker: brokerOf(client), shell: runner, agents: () => BUILTIN_AGENTS, baseEnv: () => ({ PATH: '/bin' }) });
    const started = await sessions.ports.startNodeSession(params('agent'));
    expect(started).toMatchObject({ ok: true, ptyId: 'pty-1', session: { kind: 'agent', agentId: 'claude', repoId: WORKFLOW_SESSION_REPO_ID, workflowRunRef: { workflowId: 'w1', runId: 'r1', nodeId: 'n1' } } });
    expect(client.createPty).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/tmp', initialInput: 'claude "hi"\r', env: { PATH: '/bin', TERM_PROGRAM: 'midnite-agents', NODE_ONLY: '1' } }),
    );

    // Output before the executor listens is held, then delivered; the detector reads every chunk.
    // Two frames of Claude's own footer: one drawn mid-turn, the next at rest.
    emit('pty-1', 'working… esc to interrupt\n? for shortcuts\n');
    const seen: string[] = [];
    sessions.ports.onPty('pty-1', (bytes) => seen.push(new TextDecoder().decode(bytes)), () => undefined);
    expect(seen.join('')).toContain('esc to interrupt');
    expect(sessions.ports.activityFor('pty-1')).toBe('thinking');
    emit('pty-1', 'done\n? for shortcuts\n');
    expect(sessions.ports.activityFor('pty-1')).toBe('idle');

    expect(await sessions.ports.startNodeSession(params('shell'))).toMatchObject({ ok: true, ptyId: 'shell-1' });
    expect(client.createPty).toHaveBeenCalledTimes(1);
    expect(runner.createPty).toHaveBeenCalledTimes(1);
  });

  it('kills only what it created: its own pty on cancel, every one still running on quit, never a shell’s through the broker', async () => {
    const { client } = fakeClient();
    const runner = shell();
    const sessions = createBrokerNodeSessions({ broker: brokerOf(client), shell: runner, agents: () => BUILTIN_AGENTS, baseEnv: () => ({}) });
    await sessions.ports.startNodeSession(params('agent'));
    await sessions.ports.startNodeSession(params('agent'));
    const exits: number[] = [];
    sessions.ports.onPty('pty-1', () => undefined, (code) => exits.push(code));

    sessions.ports.killPty('pty-1');
    expect(client.killPty).toHaveBeenCalledWith('pty-1');
    expect(exits).toEqual([137]);
    sessions.ports.killPty('shell-9');
    expect(runner.killPty).toHaveBeenCalledWith('shell-9');
    sessions.ports.killPty('someone-elses-pty');
    expect(client.killPty).not.toHaveBeenCalledWith('someone-elses-pty');

    await sessions.dispose();
    expect(client.killPty.mock.calls.map(([id]) => id)).toEqual(['pty-1', 'pty-2']);
  });
});
