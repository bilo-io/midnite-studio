import {
  BUILTIN_AGENTS,
  COMPANION_ASK_FALLBACK,
  emptyCompanionSnapshot,
  type AgentDefinition,
} from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from '../process-runner';
import {
  askCompanion,
  buildAskPrompt,
  resolveHeadlessAgent,
  COMPANION_ASK_RAW_CAP,
  type CompanionAskDeps,
} from './ask';

/**
 * A fake `spawn` that answers with fixed output — Phase 79 Theme E.
 *
 * Modelled on nothing in particular because `process-runner.ts` was written
 * with exactly this seam in mind (`SpawnFn` is injected for it). What the fake
 * has to get right is the *timing*: `runProcess` attaches its handlers after
 * `spawn` returns, so a fake that fires them synchronously fires them into
 * nothing. Hence the `queueMicrotask`.
 */
function fakeSpawn(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  /** Never closes — for the timeout path. */
  hang?: boolean;
  /** Fails to spawn at all, as a missing binary does. */
  enoent?: boolean;
  onArgs?: (command: string, args: readonly string[], cwd: string) => void;
}): SpawnFn {
  return (command, args, cwd) => {
    options.onArgs?.(command, args, cwd);
    const handlers: {
      stdout?: (chunk: string) => void;
      stderr?: (chunk: string) => void;
      error?: (error: NodeJS.ErrnoException) => void;
      close?: (code: number | null) => void;
    } = {};
    const child: SpawnedProcess = {
      onStdout: (handler) => {
        handlers.stdout = handler;
      },
      onStderr: (handler) => {
        handlers.stderr = handler;
      },
      onError: (handler) => {
        handlers.error = handler;
      },
      onClose: (handler) => {
        handlers.close = handler;
      },
      /*
        Deferred, like a real `SIGKILL`: `runProcess`'s deadline calls `kill()`
        and *then* settles as `timed-out`, so a fake that closes synchronously
        settles the promise as a SUCCESS from inside the timer and the timeout
        arm is never reached. That is not a hypothetical — it is what this test
        did before the microtask.
      */
      kill: () => queueMicrotask(() => handlers.close?.(null)),
    };
    queueMicrotask(() => {
      if (options.enoent) {
        const error: NodeJS.ErrnoException = new Error('spawn claude ENOENT');
        error.code = 'ENOENT';
        handlers.error?.(error);
        return;
      }
      if (options.hang) return;
      if (options.stdout !== undefined) handlers.stdout?.(options.stdout);
      if (options.stderr !== undefined) handlers.stderr?.(options.stderr);
      handlers.close?.(options.exitCode ?? 0);
    });
    return child;
  };
}

const claude = BUILTIN_AGENTS.find((agent) => agent.id === 'claude') as AgentDefinition;
const cursor = BUILTIN_AGENTS.find((agent) => agent.id === 'cursor') as AgentDefinition;

const deps = (over: Partial<CompanionAskDeps> = {}): CompanionAskDeps => ({
  agents: async () => [claude],
  home: () => '/home/tester',
  ...over,
});

describe('resolveHeadlessAgent', () => {
  it('prefers the id the renderer asked for', () => {
    const resolved = resolveHeadlessAgent([cursor, claude], 'claude');
    expect(resolved?.agent.id).toBe('claude');
    expect(resolved?.args).toEqual(['-p']);
  });

  it('falls through to anything with a print mode when the preferred agent has none', () => {
    // Cursor is on the roster and is the user's primary, but has no known
    // print mode: refusing to think at all would be worse than quietly using
    // the Claude CLI sitting right beside it.
    expect(resolveHeadlessAgent([cursor, claude], 'cursor')?.agent.id).toBe('claude');
  });

  it('returns null when nothing on the roster can run headlessly', () => {
    expect(resolveHeadlessAgent([cursor], 'cursor')).toBeNull();
    expect(resolveHeadlessAgent([], undefined)).toBeNull();
  });
});

describe('buildAskPrompt', () => {
  it('asks the router for JSON and hands it the closed id list', () => {
    const prompt = buildAskPrompt({ kind: 'route', text: 'do the thing', repoPath: null });
    expect(prompt).toContain('ONE JSON object and nothing else');
    expect(prompt).toContain('execSwarm');
    expect(prompt).toContain('never guess an id that is not listed');
  });

  it('asks the summariser for speech, not markdown', () => {
    const prompt = buildAskPrompt({ kind: 'summarise', text: 'lots of output', repoPath: null });
    expect(prompt).toContain('2 to 4 plain sentences');
    expect(prompt).toContain('speech synthesiser');
  });

  it('inlines the snapshot it was given rather than rebuilding one', () => {
    const prompt = buildAskPrompt({
      kind: 'route',
      text: 'x',
      repoPath: '/repos/studio',
      snapshot: { ...emptyCompanionSnapshot(2), branch: 'feature/thing' },
    });
    expect(prompt).toContain('"branch":"feature/thing"');
  });

  it('says so plainly when there is no snapshot', () => {
    expect(buildAskPrompt({ kind: 'route', text: 'x', repoPath: null })).toContain(
      'No repository is open.',
    );
  });

  it('caps a huge input by keeping its tail — the conclusion is at the end', () => {
    const text = `${'a'.repeat(20_000)}THE-CONCLUSION`;
    const prompt = buildAskPrompt({ kind: 'summarise', text, repoPath: null });
    expect(prompt).toContain('THE-CONCLUSION');
    expect(prompt.length).toBeLessThan(10_000);
  });
});

describe('askCompanion', () => {
  it('runs the CLI in print mode with the prompt as one argument', async () => {
    const onArgs = vi.fn();
    const result = await askCompanion(
      { kind: 'route', text: 'start a swarm', repoPath: '/repos/studio' },
      deps({ spawn: fakeSpawn({ stdout: '{"say":"Running it."}', onArgs }) }),
    );

    expect(result.ok).toBe(true);
    expect(onArgs).toHaveBeenCalledWith('claude', ['-p', expect.any(String)], '/repos/studio');
    // One argument, not a shell string — the prompt contains quotes and braces.
    expect(onArgs.mock.calls[0]?.[1]).toHaveLength(2);
  });

  it('runs in the home directory when no repo is open', async () => {
    const onArgs = vi.fn();
    await askCompanion(
      { kind: 'route', text: 'hello', repoPath: null },
      deps({ spawn: fakeSpawn({ stdout: '{"say":"Hi."}', onArgs }) }),
    );
    expect(onArgs.mock.calls[0]?.[2]).toBe('/home/tester');
  });

  it('returns the parsed reply, intent and all', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'start a swarm on the parser', repoPath: null },
      deps({
        spawn: fakeSpawn({
          stdout:
            'Sure:\n```json\n{"say":"Starting a swarm.","intent":{"kind":"command","id":"execSwarm","body":"the parser"}}\n```',
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        say: 'Starting a swarm.',
        intent: { kind: 'command', id: 'execSwarm', body: 'the parser' },
      },
    });
  });

  it('treats garbage as a SUCCESS carrying the fallback line and the raw text', async () => {
    // Deliberately not a failure: the raw output is the only evidence of what
    // went wrong, and a failure envelope would throw it away.
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ spawn: fakeSpawn({ stdout: 'I am afraid I cannot do that, Dave.' }) }),
    );

    expect(result).toEqual({
      ok: true,
      value: { say: COMPANION_ASK_FALLBACK, raw: 'I am afraid I cannot do that, Dave.' },
    });
  });

  it('caps the raw text it puts in the thread', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ spawn: fakeSpawn({ stdout: 'z'.repeat(50_000) }) }),
    );
    expect(result.ok && result.value.raw).toHaveLength(COMPANION_ASK_RAW_CAP);
  });

  it('refuses an intent the CLI invented, rather than starting the wrong agent', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({
        spawn: fakeSpawn({
          stdout: '{"say":"Doing it.","intent":{"kind":"command","id":"releaseComplete"}}',
        }),
      }),
    );
    // The whole reply is rejected — `say` without a valid `intent` would be a
    // spoken confirmation of something that never ran.
    expect(result.ok && result.value.say).toBe(COMPANION_ASK_FALLBACK);
  });

  it('answers an envelope, not a rejection, when no CLI is installed', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ spawn: fakeSpawn({ enoent: true }) }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.kind).toBe('error');
    expect(result.ok === false && result.kind === 'error' && result.message).toContain('Claude');
  });

  it('answers an envelope when the roster has nothing headless at all', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ agents: async () => [cursor] }),
    );
    expect(result.ok === false && result.kind === 'error' && result.message).toContain(
      'No agent CLI with a headless mode is installed',
    );
  });

  it('gives up on a wedged CLI and says so', async () => {
    const result = await askCompanion(
      { kind: 'route', text: 'x', repoPath: null },
      deps({ spawn: fakeSpawn({ hang: true }), timeoutMs: 5 }),
    );
    expect(result.ok === false && result.kind === 'error' && result.message).toBe(
      'That took too long, so I stopped waiting.',
    );
  });

  it('never throws, whatever the CLI does', async () => {
    await expect(
      askCompanion(
        { kind: 'summarise', text: 'x', repoPath: null },
        deps({ spawn: fakeSpawn({ stdout: '', exitCode: 137 }) }),
      ),
    ).resolves.toMatchObject({ ok: true });
  });
});
