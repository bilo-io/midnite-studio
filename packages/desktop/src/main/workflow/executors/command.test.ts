import { describe, expect, it } from 'vitest';

import type { WorkflowNode } from '@midnite/studio-shared';

import type { SpawnFn, SpawnedProcess } from '../../process-runner';
import type { ExecutorContext } from '../executor-registry';
import { createCommandExecutor } from './command';

type Call = { command: string; args: string[]; cwd: string };

/** A scripted `SpawnFn` — `runProcess` never starts a real shell here. */
function scriptedSpawn(reply: { stdout?: string; stderr?: string; code?: number | null }, calls: Call[] = []): SpawnFn {
  return (command, args, cwd) => {
    calls.push({ command, args: [...args], cwd });
    const handlers: {
      out?: (chunk: string) => void;
      err?: (chunk: string) => void;
      close?: (code: number | null) => void;
    } = {};
    setTimeout(() => {
      if (reply.stdout) handlers.out?.(reply.stdout);
      if (reply.stderr) handlers.err?.(reply.stderr);
      handlers.close?.(reply.code === undefined ? 0 : reply.code);
    }, 0);
    const proc: SpawnedProcess = {
      onStdout: (h) => void (handlers.out = h),
      onStderr: (h) => void (handlers.err = h),
      onError: () => {},
      onClose: (h) => void (handlers.close = h),
      kill: () => {},
    };
    return proc;
  };
}

function context(upstream: Record<string, unknown> = {}): ExecutorContext {
  return {
    upstream,
    signal: { cancelled: () => false },
    timeoutMs: 5_000,
    workflowId: 'w',
    runId: 'r',
    reportSessionId: async () => {},
    reportWaiting: async () => {},
  };
}

function commandNode(config: Partial<Extract<WorkflowNode, { kind: 'command' }>['config']>): WorkflowNode {
  return {
    id: 'cmd',
    label: 'Cmd',
    x: 0,
    y: 0,
    kind: 'command',
    config: { command: 'echo hi', env: {}, allowNonZeroExit: false, ...config },
  };
}

describe('the command executor', () => {
  it('runs /bin/sh -c headlessly with interpolated command and env, and hands clean output on', async () => {
    const calls: Call[] = [];
    const run = createCommandExecutor({ spawn: scriptedSpawn({ stdout: '{"n":1}\n', stderr: 'note\n' }, calls) });
    const outcome = await run(
      commandNode({ command: 'gh pr view {{t.number}} --json n', env: { TOKEN: '{{t.token}}' }, cwd: '/repo' }),
      context({ t: { number: 7, token: "a'b" } }),
    );
    expect(outcome).toEqual({
      ok: true,
      output: { exitCode: 0, stdout: '{"n":1}\n', stderr: 'note\n' },
      truncated: false,
    });
    expect(calls).toEqual([
      { command: '/bin/sh', args: ['-c', `TOKEN='a'\\''b' gh pr view 7 --json n`], cwd: '/repo' },
    ]);
  });

  it('fails on a non-zero exit, naming the last stderr line', async () => {
    const run = createCommandExecutor({ spawn: scriptedSpawn({ stderr: 'warming up\nno such file', code: 2 }) });
    expect(await run(commandNode({}), context())).toEqual({ ok: false, error: 'Exited with code 2: no such file' });
  });

  it('succeeds on a non-zero exit when allowNonZeroExit is set', async () => {
    const run = createCommandExecutor({ spawn: scriptedSpawn({ stdout: 'partial', code: 1 }) });
    const outcome = await run(commandNode({ allowNonZeroExit: true }), context());
    expect(outcome.ok && outcome.output).toEqual({ exitCode: 1, stdout: 'partial', stderr: '' });
  });

  it('refuses an empty command and an unresolved reference', async () => {
    const run = createCommandExecutor({ spawn: scriptedSpawn({}) });
    expect(await run(commandNode({ command: '  ' }), context())).toEqual({ ok: false, error: 'This node has no command.' });
    expect((await run(commandNode({ command: 'echo {{nope.x}}' }), context())).ok).toBe(false);
  });
});
