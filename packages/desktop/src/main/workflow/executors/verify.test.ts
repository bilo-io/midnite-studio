import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentDefinition, SessionActivity, WorkflowNode, WorkflowVerifyEvidence } from '@midnite/studio-shared';

import type { ExecutorContext, NodeOutcome } from '../executor-registry';
import type { SpawnedProcess, SpawnFn } from '../../process-runner';
import type { NodePtyDeps } from './node-pty-deps';
import { createVerifyExecutor } from './verify';

/**
 * `check: 'exit-code'`/`'test-counts'` run headlessly through `runProcess`
 * (`process-runner.ts`), never a real shell — this fake `SpawnFn` gives each
 * test full control over stdout/stderr/close, exactly the discipline
 * `diagnostics/runner.test.ts`/`testing/runner.test.ts` already use for the
 * same engine. `check: 'agent'` reuses `executors/agent.ts`'s pty machinery,
 * faked the same way `node-pty-executors.test.ts` does.
 */
function fakeSpawn(): {
  spawn: SpawnFn;
  emitStdout: (chunk: string) => void;
  emitStderr: (chunk: string) => void;
  emitClose: (code: number | null) => void;
  emitError: (error: NodeJS.ErrnoException) => void;
  calls: { command: string; args: string[]; cwd: string }[];
  killed: boolean;
} {
  let onStdout: ((chunk: string) => void) | null = null;
  let onStderr: ((chunk: string) => void) | null = null;
  let onClose: ((code: number | null) => void) | null = null;
  let onError: ((error: NodeJS.ErrnoException) => void) | null = null;
  const calls: { command: string; args: string[]; cwd: string }[] = [];
  const state = { killed: false };

  const spawn: SpawnFn = (command, args, cwd) => {
    calls.push({ command, args: [...args], cwd });
    const proc: SpawnedProcess = {
      onStdout: (h) => {
        onStdout = h;
      },
      onStderr: (h) => {
        onStderr = h;
      },
      onError: (h) => {
        onError = h;
      },
      onClose: (h) => {
        onClose = h;
      },
      kill: () => {
        state.killed = true;
      },
    };
    return proc;
  };

  return {
    spawn,
    emitStdout: (chunk) => onStdout?.(chunk),
    emitStderr: (chunk) => onStderr?.(chunk),
    emitClose: (code) => onClose?.(code),
    emitError: (error) => onError?.(error),
    calls,
    get killed() {
      return state.killed;
    },
  };
}

function fakeAgentPty(): {
  deps: NodePtyDeps;
  emitData: (text: string) => void;
  emitExit: (exitCode: number) => void;
  activity: { current: SessionActivity | null };
} {
  let onData: ((bytes: Uint8Array) => void) | null = null;
  let onExit: ((exitCode: number) => void) | null = null;
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
    killPty: () => {},
    activityFor: () => activity.current,
    now: () => 0,
  };

  return {
    deps,
    emitData: (text: string) => onData?.(new TextEncoder().encode(text)),
    emitExit: (exitCode: number) => onExit?.(exitCode),
    activity,
  };
}

function context(over: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    upstream: {},
    signal: { cancelled: () => false },
    timeoutMs: 5_000,
    workflowId: 'w1',
    runId: 'r1',
    reportSessionId: async () => {},
    reportWaiting: async () => {},
    ...over,
  };
}

function verifyNode(config: {
  check: 'agent' | 'exit-code' | 'test-counts' | 'json-path';
  [key: string]: unknown;
}): WorkflowNode {
  return { id: 'v', label: 'Verify', x: 0, y: 0, kind: 'verify', config } as unknown as WorkflowNode;
}

function evidence(outcome: NodeOutcome): WorkflowVerifyEvidence {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.output as WorkflowVerifyEvidence;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('verify executor > exit-code check', () => {
  it('settles `pass` on exit 0', async () => {
    const fake = fakeSpawn();
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const promise = executor(verifyNode({ check: 'exit-code', command: 'exit 0', env: {} }), context());

    fake.emitClose(0);
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('pass');
    expect(evidence(outcome)).toMatchObject({ check: 'exit-code', passed: 1, failed: 0 });
  });

  it('settles `fail` (not an executor failure) on a non-zero exit, with output in the evidence', async () => {
    const fake = fakeSpawn();
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const promise = executor(verifyNode({ check: 'exit-code', command: 'exit 1', env: {} }), context());

    fake.emitStdout('boom\n');
    fake.emitClose(1);
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('fail');
    const ev = evidence(outcome);
    expect(ev).toMatchObject({ check: 'exit-code', passed: 0, failed: 1 });
    expect(ev.failures[0]).toContain('boom');
  });

  it('prefixes env assignments onto the shell line', async () => {
    const fake = fakeSpawn();
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const promise = executor(
      verifyNode({ check: 'exit-code', command: 'echo $FOO', env: { FOO: 'bar' }, cwd: '/tmp' }),
      context(),
    );
    fake.emitClose(0);
    await promise;

    expect(fake.calls[0]).toEqual({ command: '/bin/sh', args: ['-c', "FOO='bar' echo $FOO"], cwd: '/tmp' });
  });

  it('is an infra failure (ok:false), not a verdict, when the node has no command', async () => {
    const fake = fakeSpawn();
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const outcome = await executor(verifyNode({ check: 'exit-code', command: '  ', env: {} }), context());
    expect(outcome.ok).toBe(false);
    expect(fake.calls).toEqual([]);
  });

  it('kills the process and resolves ok:false on cancellation', async () => {
    const fake = fakeSpawn();
    let cancelled = false;
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const promise = executor(
      verifyNode({ check: 'exit-code', command: 'sleep 100', env: {} }),
      context({ signal: { cancelled: () => cancelled } }),
    );

    cancelled = true;
    await vi.advanceTimersByTimeAsync(200);
    fake.emitClose(null);

    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    expect(fake.killed).toBe(true);
  });
});

describe('verify executor > test-counts check', () => {
  it('settles `pass` when the parser reports zero failures and enough passed', async () => {
    const fake = fakeSpawn();
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const promise = executor(
      verifyNode({ check: 'test-counts', command: 'vitest --reporter=json', env: {}, parser: 'vitest', minPassed: 2 }),
      context(),
    );
    fake.emitStdout(JSON.stringify({ numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, testResults: [] }));
    fake.emitClose(0);
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('pass');
    expect(evidence(outcome)).toMatchObject({ check: 'test-counts', passed: 2, failed: 0 });
  });

  it('settles `fail` when any test failed, with failure names in the evidence', async () => {
    const fake = fakeSpawn();
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const promise = executor(
      verifyNode({ check: 'test-counts', command: 'vitest --reporter=json', env: {}, parser: 'vitest', minPassed: 1 }),
      context(),
    );
    fake.emitStdout(
      JSON.stringify({
        testResults: [
          {
            name: 'a.test.ts',
            assertionResults: [{ status: 'failed', fullName: 'breaks', failureMessages: ['expected 1 to be 2'] }],
          },
        ],
      }),
    );
    fake.emitClose(1);
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('fail');
    const ev = evidence(outcome);
    expect(ev.failed).toBe(1);
    expect(ev.failures[0]).toContain('breaks');
  });

  it('is an infra failure when the parser cannot make sense of the output', async () => {
    const fake = fakeSpawn();
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const promise = executor(
      verifyNode({ check: 'test-counts', command: 'echo nope', env: {}, parser: 'vitest', minPassed: 1 }),
      context(),
    );
    fake.emitStdout('not json at all');
    fake.emitClose(0);
    const outcome = await promise;
    expect(outcome.ok).toBe(false);
  });

  it('fails when zero tests were collected — a suite that ran nothing is not a pass by default', async () => {
    const fake = fakeSpawn();
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps, spawn: fake.spawn });
    const promise = executor(
      verifyNode({ check: 'test-counts', command: 'vitest --reporter=json', env: {}, parser: 'vitest', minPassed: 1 }),
      context(),
    );
    fake.emitStdout(JSON.stringify({ testResults: [] }));
    fake.emitClose(0);
    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('fail');
  });
});

describe('verify executor > json-path check', () => {
  it('settles `pass`/`fail` on an interpolated comparison, reusing condition\'s own op semantics', async () => {
    const upstream = { fetch: { status: 200 } };
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps });

    const pass = await executor(
      verifyNode({ check: 'json-path', source: '{{fetch.status}}', op: 'eq', right: '200' }),
      context({ upstream }),
    );
    expect(pass.ok && pass.port).toBe('pass');

    const fail = await executor(
      verifyNode({ check: 'json-path', source: '{{fetch.status}}', op: 'eq', right: '404' }),
      context({ upstream }),
    );
    expect(fail.ok && fail.port).toBe('fail');
  });

  it('is an infra failure when a non-empty op has no right-hand value', async () => {
    const executor = createVerifyExecutor({ agent: fakeAgentPty().deps });
    const outcome = await executor(verifyNode({ check: 'json-path', source: '{{fetch.status}}', op: 'eq' }), context());
    expect(outcome.ok).toBe(false);
  });
});

describe('verify executor > agent check', () => {
  it('settles `pass` when the maker/checker done marker reports ok', async () => {
    const fake = fakeAgentPty();
    const executor = createVerifyExecutor({ agent: fake.deps });
    const promise = executor(
      verifyNode({ check: 'agent', agentId: 'claude', prompt: 'Grade this.' }),
      context(),
    );

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: ok\n');
    await vi.advanceTimersByTimeAsync(150);

    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('pass');
  });

  it('settles `fail` (not an executor failure) when the done marker reports fail', async () => {
    const fake = fakeAgentPty();
    const executor = createVerifyExecutor({ agent: fake.deps });
    const promise = executor(
      verifyNode({ check: 'agent', agentId: 'claude', prompt: 'Grade this.' }),
      context(),
    );

    await vi.advanceTimersByTimeAsync(0);
    fake.emitData('MIDNITE_WORKFLOW_NODE_DONE: fail\n');
    await vi.advanceTimersByTimeAsync(150);

    const outcome = await promise;
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.port).toBe('fail');
  });

  it('is an infra failure for an agent id not on the roster', async () => {
    const fake = fakeAgentPty();
    const executor = createVerifyExecutor({ agent: fake.deps });
    const outcome = await executor(
      verifyNode({ check: 'agent', agentId: 'not-installed', prompt: 'Grade this.' }),
      context(),
    );
    expect(outcome.ok).toBe(false);
  });
});
