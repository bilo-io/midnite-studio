import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentDefinition, SessionActivity, WorkflowNode } from '@midnite/studio-shared';

import { applySettingsSync, resetSettingsMirrorForTests } from '../../settings-mirror';
import type { ExecutorContext, NodeOutcome } from '../executor-registry';
import { createAgentExecutor } from './agent';
import type { AgentNodeOutput } from './agent';
import type { NodePtyDeps } from './node-pty-deps';
import { createScriptExecutor } from './script';
import type { ScriptNodeOutput } from './script';

/**
 * Lifecycle tests for the `agent`/`script` node executors (Phase 95 Theme J)
 * against a FAKE pty layer — never a real shell or a real agent CLI. Each
 * fixture records the `onPty` callbacks main would normally wire to a real
 * broker/inproc pty, so a test can fire `data`/`exit` on demand and assert
 * on the outcome without a socket or a process in sight.
 */

beforeEach(() => {
  vi.useFakeTimers();
  resetSettingsMirrorForTests();
});
afterEach(() => {
  vi.useRealTimers();
});

function fakePty(): {
  deps: NodePtyDeps;
  emitData: (text: string) => void;
  emitExit: (exitCode: number) => void;
  activity: { current: SessionActivity | null };
  killed: string[];
} {
  let onData: ((bytes: Uint8Array) => void) | null = null;
  let onExit: ((exitCode: number) => void) | null = null;
  const killed: string[] = [];
  const activity: { current: SessionActivity | null } = { current: 'idle' };

  const deps: NodePtyDeps = {
    listAgents: async (): Promise<AgentDefinition[]> => [
      { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#000000' },
    ],
    startSession: async (params) => ({
      ok: true,
      ptyId: 'pty-1',
      session: {
        id: 'session-1',
        kind: params.kind,
        ...(params.agentId === undefined ? {} : { agentId: params.agentId }),
        title: 'Workflow',
        name: params.nodeLabel,
        cwd: params.cwd,
        repoId: 'workflow',
        createdAt: 0,
        workflowRunRef: { workflowId: params.workflowId, runId: params.runId, nodeId: params.nodeId },
      },
    }),
    onPty: (_ptyId, onDataCb, onExitCb) => {
      onData = onDataCb;
      onExit = onExitCb;
    },
    offPty: () => {},
    killPty: (ptyId) => killed.push(ptyId),
    activityFor: () => activity.current,
    now: () => 0,
  };

  return {
    deps,
    emitData: (text: string) => onData?.(new TextEncoder().encode(text)),
    emitExit: (exitCode: number) => onExit?.(exitCode),
    activity,
    killed,
  };
}

function context(reported: string[], over: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    upstream: {},
    signal: { cancelled: () => false },
    timeoutMs: 5_000,
    workflowId: 'w1',
    runId: 'r1',
    reportSessionId: async (id) => {
      reported.push(id);
    },
    reportWaiting: async () => {},
    ...over,
  };
}

function scriptNode(command: string): WorkflowNode {
  return { id: 'n1', label: 'Run it', x: 0, y: 0, kind: 'script', config: { command, env: {} } };
}

function agentNode(agentId: string, prompt: string): WorkflowNode {
  return { id: 'n1', label: 'Ask it', x: 0, y: 0, kind: 'agent', config: { agentId, prompt } };
}

describe('script executor', () => {
  it('succeeds on a zero exit code and captures output', async () => {
    const fake = fakePty();
    const executor = createScriptExecutor(fake.deps);
    const reported: string[] = [];
    const promise = executor(scriptNode('echo hi'), context(reported));

    // `startSession` resolves on a microtask before the executor registers
    // its `onPty` callbacks — flush that one tick before emitting anything,
    // or `emitData`/`emitExit` below fire into a still-null callback.
    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('hi\n');
    fake.emitExit(0);

    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect(reported).toEqual(['session-1']);
    if (outcome.ok) {
      const output = outcome.output as ScriptNodeOutput;
      expect(output.exitCode).toBe(0);
      expect(output.output).toContain('hi');
    }
  });

  it('fails on a non-zero exit code', async () => {
    const fake = fakePty();
    const executor = createScriptExecutor(fake.deps);
    const promise = executor(scriptNode('false'), context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitExit(1);

    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain('1');
  });

  it('kills the pty and resolves cancelled when the signal fires', async () => {
    const fake = fakePty();
    const executor = createScriptExecutor(fake.deps);
    let cancelled = false;
    const promise = executor(scriptNode('sleep 100'), context([], { signal: { cancelled: () => cancelled } }));

    cancelled = true;
    await vi.advanceTimersByTimeAsync(200);

    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    expect(fake.killed).toEqual(['pty-1']);
  });

  it('refuses an empty command with no pty at all', async () => {
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const executor = createScriptExecutor({ ...fake.deps, startSession: started });
    const outcome = await executor(scriptNode(''), context([]));
    expect(outcome.ok).toBe(false);
    expect(started).not.toHaveBeenCalled();
  });
});

describe('agent executor', () => {
  it('settles once the done marker is seen AND activity is idle — not on the marker alone', async () => {
    const fake = fakePty();
    fake.activity.current = 'thinking';
    const executor = createAgentExecutor(fake.deps);
    const reported: string[] = [];
    const promise = executor(agentNode('claude', 'Do the thing'), context(reported));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('working...\n');
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: ok\n');
    // The marker alone, while still "thinking", must not settle the node —
    // advance past a poll tick and confirm nothing resolved yet.
    await vi.advanceTimersByTimeAsync(250);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    fake.activity.current = 'idle';
    await vi.advanceTimersByTimeAsync(150);

    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect(reported).toEqual(['session-1']);
    if (outcome.ok) {
      const output = outcome.output as AgentNodeOutput;
      expect(output.output).toContain('working');
    }
  });

  it('fails when the agent reports it could not finish', async () => {
    const fake = fakePty();
    const executor = createAgentExecutor(fake.deps);
    const promise = executor(agentNode('claude', 'Do the thing'), context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: fail\n');
    await vi.advanceTimersByTimeAsync(150);

    const outcome = await promise;
    expect(outcome.ok).toBe(false);
  });

  it('fails when the session ends before the marker ever appears', async () => {
    const fake = fakePty();
    const executor = createAgentExecutor(fake.deps);
    const promise = executor(agentNode('claude', 'Do the thing'), context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitExit(0);

    const outcome: NodeOutcome = await promise;
    expect(outcome.ok).toBe(false);
  });

  it('refuses an agent id not on the roster, with no pty started', async () => {
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const executor = createAgentExecutor({ ...fake.deps, startSession: started });
    const outcome = await executor(agentNode('not-installed', 'Do it'), context([]));
    expect(outcome.ok).toBe(false);
    expect(started).not.toHaveBeenCalled();
  });

  it('an Ollama-bound agent id (Phase 96 Theme H) composes the recipe and passes its env through', async () => {
    applySettingsSync({
      autoFetchEnabled: true,
      autoFetchIntervalMs: 60_000,
      agentBackends: { claude: { backend: 'ollama', model: 'qwen3:14b' } },
    });

    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const executor = createAgentExecutor({ ...fake.deps, startSession: started });
    const promise = executor(agentNode('claude', 'Do the thing'), context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: ok\n');
    await vi.advanceTimersByTimeAsync(150);
    await promise;

    expect(started).toHaveBeenCalledTimes(1);
    const params = started.mock.calls[0]![0];
    expect(params.initialInput).toContain('claude --model qwen3:14b');
    expect(params.env).toEqual({
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama',
      ANTHROPIC_API_KEY: '',
    });
    expect(params.backend).toBe('ollama');
    expect(params.ollamaModel).toBe('qwen3:14b');
  });

  it('a native (unbound) agent id passes no env and no backend fields', async () => {
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const executor = createAgentExecutor({ ...fake.deps, startSession: started });
    const promise = executor(agentNode('claude', 'Do the thing'), context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: ok\n');
    await vi.advanceTimersByTimeAsync(150);
    await promise;

    const params = started.mock.calls[0]![0];
    expect(params.env).toBeUndefined();
    expect(params.backend).toBeUndefined();
    expect(params.ollamaModel).toBeUndefined();
  });
});
