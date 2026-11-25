// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentDefinition, SessionActivity, WorkflowNode } from '@midnite/studio-shared';

import { configureWorkflowsPorts } from '../../ports';
import { fakeWorkflowsPorts } from '../../testing';
import type { ExecutorContext, NodeOutcome } from '../executor-registry';
import { createAgentExecutor } from './agent';
import type { AgentNodeOutput } from './agent';
import type { NodePtyDeps } from './node-pty-deps';
import { createRouterExecutor } from './router';
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
  configureWorkflowsPorts(fakeWorkflowsPorts());
});
afterEach(() => {
  vi.useRealTimers();
  configureWorkflowsPorts(null);
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
    configureWorkflowsPorts(
      fakeWorkflowsPorts({ agentBinding: (id) => (id === 'claude' ? { backend: 'ollama', model: 'qwen3:14b' } : undefined) }),
    );

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

function profileAgentNode(profileId: string): WorkflowNode {
  return {
    id: 'n1',
    label: 'Ask it',
    x: 0,
    y: 0,
    kind: 'agent',
    config: { agentId: 'claude', agentProfileId: profileId, prompt: 'Do the thing' },
  };
}

describe('agent executor — a custom agent (#1699)', () => {
  it("types the custom agent's prepared line and binds its launch to the session", async () => {
    const prepareLaunch = vi.fn(async (_profileId: string, _cwd: string, _prompt: string) => ({
      kind: 'ready' as const,
      launchId: 'launch-1',
      line: "claude --append-system-prompt-file '/p' 'Do the thing'",
      name: 'Reviewer',
      baseAgentId: 'claude',
    }));
    configureWorkflowsPorts(fakeWorkflowsPorts({ agentProfiles: { prepareLaunch } }));
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const promise = createAgentExecutor({ ...fake.deps, startSession: started })(profileAgentNode('profile-a'), context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: ok\n');
    await vi.advanceTimersByTimeAsync(150);
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    expect(prepareLaunch.mock.calls[0]![0]).toBe('profile-a');
    expect(prepareLaunch.mock.calls[0]![2]).toContain('Do the thing');
    const params = started.mock.calls[0]![0];
    expect(params.initialInput).toBe("claude --append-system-prompt-file '/p' 'Do the thing'\r");
    expect(params).toMatchObject({ agentId: 'claude', profileId: 'profile-a', profileLaunchId: 'launch-1' });
    if (outcome.ok) expect((outcome.output as AgentNodeOutput).agentProfileFallback).toBeUndefined();
  });

  it('a deleted custom agent runs as its roster agent and says so', async () => {
    configureWorkflowsPorts(fakeWorkflowsPorts({ agentProfiles: { prepareLaunch: async () => ({ kind: 'missing' }) } }));
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const promise = createAgentExecutor({ ...fake.deps, startSession: started })(profileAgentNode('profile-gone'), context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: ok\n');
    await vi.advanceTimersByTimeAsync(150);
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    const params = started.mock.calls[0]![0];
    expect(params.initialInput.startsWith('claude ')).toBe(true);
    expect(params.profileId).toBeUndefined();
    if (outcome.ok) expect((outcome.output as AgentNodeOutput).agentProfileFallback).toBe('deleted');
  });

  it('a custom agent that cannot start fails the node and never runs the bare CLI', async () => {
    configureWorkflowsPorts(
      fakeWorkflowsPorts({ agentProfiles: { prepareLaunch: async () => ({ kind: 'error', message: 'Codex is not installed.' }) } }),
    );
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const outcome = await createAgentExecutor({ ...fake.deps, startSession: started })(profileAgentNode('profile-a'), context([]));

    expect(outcome).toEqual({ ok: false, error: 'Codex is not installed.' });
    expect(started).not.toHaveBeenCalled();
  });
});

function routerAgentLabelNode(cases: { id: string; label: string }[]): WorkflowNode {
  return {
    id: 'n1',
    label: 'Route',
    x: 0,
    y: 0,
    kind: 'router',
    config: { mode: 'agent-label', cases, agent: { agentId: 'claude', prompt: 'Classify this' } },
  };
}

describe('router executor — a custom agent (#1713)', () => {
  it('types the custom agent line and binds its launch', async () => {
    const prepareLaunch = vi.fn(async (_id: string, _cwd: string, _prompt: string) => ({
      kind: 'ready' as const,
      launchId: 'launch-r',
      line: "claude --append-system-prompt-file '/p' 'x'",
      name: 'Triager',
      baseAgentId: 'claude',
    }));
    configureWorkflowsPorts(fakeWorkflowsPorts({ agentProfiles: { prepareLaunch } }));
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const node = routerAgentLabelNode([{ id: 'urgent', label: 'Urgent' }]);
    if (node.kind === 'router' && node.config.agent) node.config.agent.agentProfileId = 'profile-tri';
    const promise = createRouterExecutor({ ...fake.deps, startSession: started })(node, context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: route=urgent\n');
    await vi.advanceTimersByTimeAsync(150);
    const outcome = await promise;

    expect(outcome.ok && outcome.port).toBe('urgent');
    expect(prepareLaunch.mock.calls[0]![0]).toBe('profile-tri');
    expect(started.mock.calls[0]![0]).toMatchObject({ profileId: 'profile-tri', profileLaunchId: 'launch-r' });
  });
});

describe('agent executor — an app with no custom-agents port (#1713)', () => {
  it('runs as the roster agent and says the custom agent was unavailable', async () => {
    configureWorkflowsPorts(fakeWorkflowsPorts());
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const promise = createAgentExecutor({ ...fake.deps, startSession: started })(profileAgentNode('profile-a'), context([]));

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: ok\n');
    await vi.advanceTimersByTimeAsync(150);
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    expect(started.mock.calls[0]![0].profileId).toBeUndefined();
    if (outcome.ok) expect((outcome.output as AgentNodeOutput).agentProfileFallback).toBe('unavailable');
  });
});

describe('router executor (Theme F, agent-label mode)', () => {
  it('settles on the out-port named by the marker when it is a known case id', async () => {
    const fake = fakePty();
    const executor = createRouterExecutor(fake.deps);
    const promise = executor(
      routerAgentLabelNode([
        { id: 'urgent', label: 'Urgent' },
        { id: 'spam', label: 'Spam' },
      ]),
      context([]),
    );

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: route=urgent\n');
    await vi.advanceTimersByTimeAsync(150);

    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('urgent');
    expect(outcome.ok && (outcome.output as { case: string }).case).toBe('urgent');
  });

  it('routes to default, never a guess, when the marker names no configured case', async () => {
    const fake = fakePty();
    const executor = createRouterExecutor(fake.deps);
    const promise = executor(
      routerAgentLabelNode([
        { id: 'urgent', label: 'Urgent' },
        { id: 'spam', label: 'Spam' },
      ]),
      context([]),
    );

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: route=something-else\n');
    await vi.advanceTimersByTimeAsync(150);

    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('default');
    expect(outcome.ok && (outcome.output as { reason: { label: string } }).reason.label).toBe('something-else');
  });

  it('refuses an agent-label router with no agent selected, with no pty started', async () => {
    const fake = fakePty();
    const started = vi.fn(fake.deps.startSession);
    const executor = createRouterExecutor({ ...fake.deps, startSession: started });
    const node: WorkflowNode = {
      id: 'n1',
      label: 'Route',
      x: 0,
      y: 0,
      kind: 'router',
      config: { mode: 'agent-label', cases: [{ id: 'a', label: 'A' }], agent: { agentId: '', prompt: 'x' } },
    };
    const outcome = await executor(node, context([]));
    expect(outcome.ok).toBe(false);
    expect(started).not.toHaveBeenCalled();
  });
});
