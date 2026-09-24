import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from '../process-runner';
import { buildImproveFieldPrompt, improveField, type AiImproveFieldDeps } from './improve-field';

/**
 * The same fake `spawn` `companion/ask.test.ts` uses — `runProcess` attaches
 * its handlers after `spawn` returns, so firing them synchronously fires them
 * into nothing; `queueMicrotask` is what makes the fake behave like a real
 * child process for that ordering.
 */
function fakeSpawn(options: {
  stdout?: string;
  exitCode?: number | null;
  hang?: boolean;
  enoent?: boolean;
  onArgs?: (command: string, args: readonly string[], cwd: string) => void;
}): SpawnFn {
  return (command, args, cwd) => {
    options.onArgs?.(command, args, cwd);
    const handlers: {
      stdout?: (chunk: string) => void;
      error?: (error: NodeJS.ErrnoException) => void;
      close?: (code: number | null) => void;
    } = {};
    const child: SpawnedProcess = {
      onStdout: (handler) => {
        handlers.stdout = handler;
      },
      onStderr: () => {},
      onError: (handler) => {
        handlers.error = handler;
      },
      onClose: (handler) => {
        handlers.close = handler;
      },
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
      handlers.close?.(options.exitCode ?? 0);
    });
    return child;
  };
}

const claude = BUILTIN_AGENTS.find((agent) => agent.id === 'claude') as AgentDefinition;
const codex = BUILTIN_AGENTS.find((agent) => agent.id === 'codex') as AgentDefinition;
const customNoHeadless: AgentDefinition = {
  id: 'custom-no-headless',
  label: 'Custom',
  command: 'custom',
  args: [],
  accent: '#000',
};

const deps = (over: Partial<AiImproveFieldDeps> = {}): AiImproveFieldDeps => ({
  agents: async () => [claude],
  home: () => '/home/tester',
  ...over,
});

describe('buildImproveFieldPrompt', () => {
  it('asks for the rewritten text alone, nothing else', () => {
    const prompt = buildImproveFieldPrompt({
      repoName: 'bilo-io/midnite-studio',
      fieldName: 'body',
      fieldValue: 'fix the thing',
    });
    expect(prompt).toContain('ONLY the rewritten field text and nothing else');
    expect(prompt).toContain('"body"');
    expect(prompt).toContain('bilo-io/midnite-studio');
    expect(prompt).toContain('fix the thing');
  });

  it('names an unnamed repository honestly rather than an empty string', () => {
    expect(buildImproveFieldPrompt({ repoName: '', fieldName: 'title', fieldValue: 'x' })).toContain(
      'this repository',
    );
  });

  it('includes non-empty other fields as context, and skips empty ones', () => {
    const prompt = buildImproveFieldPrompt({
      repoName: 'r',
      fieldName: 'body',
      fieldValue: 'x',
      otherFields: { title: 'Fix the parser', milestone: '', assignees: '  ' },
    });
    expect(prompt).toContain('Other fields, for context only');
    expect(prompt).toContain('title: Fix the parser');
    expect(prompt).not.toContain('milestone:');
    expect(prompt).not.toContain('assignees:');
  });

  it('caps a huge field value by keeping its tail', () => {
    const text = `${'a'.repeat(20_000)}THE-END`;
    const prompt = buildImproveFieldPrompt({ repoName: 'r', fieldName: 'body', fieldValue: text });
    expect(prompt).toContain('THE-END');
    expect(prompt.length).toBeLessThan(10_000);
  });
});

describe('improveField', () => {
  it('runs the CLI headless, with the cheap model flag, in one argument', async () => {
    const onArgs = vi.fn();
    const result = await improveField(
      { repoName: 'r', fieldName: 'body', fieldValue: 'x' },
      deps({ spawn: fakeSpawn({ stdout: 'A rewritten body.', onArgs }) }),
    );

    expect(result).toEqual({ ok: true, value: { text: 'A rewritten body.' } });
    expect(onArgs).toHaveBeenCalledWith(
      'claude',
      ['-p', '--model', 'haiku', expect.any(String)],
      '/home/tester',
    );
    expect(onArgs.mock.calls[0]?.[1]).toHaveLength(4);
  });

  it('prefers the requested agent, and its own cheap model', async () => {
    const onArgs = vi.fn();
    const result = await improveField(
      { agentId: 'codex', repoName: 'r', fieldName: 'title', fieldValue: 'x' },
      deps({ agents: async () => [claude, codex], spawn: fakeSpawn({ stdout: 'Better title', onArgs }) }),
    );

    expect(result.ok).toBe(true);
    expect(onArgs).toHaveBeenCalledWith(
      'codex',
      ['exec', '--model', 'gpt-5-mini', expect.any(String)],
      '/home/tester',
    );
  });

  it('runs where the repo is checked out when a repoPath is given', async () => {
    const onArgs = vi.fn();
    await improveField(
      { repoName: 'r', repoPath: '/repos/studio', fieldName: 'body', fieldValue: 'x' },
      deps({ spawn: fakeSpawn({ stdout: 'x', onArgs }) }),
    );
    expect(onArgs.mock.calls[0]?.[2]).toBe('/repos/studio');
  });

  it('falls through to a roster agent with a known print mode', async () => {
    const onArgs = vi.fn();
    await improveField(
      { agentId: 'custom-no-headless', repoName: 'r', fieldName: 'body', fieldValue: 'x' },
      deps({ agents: async () => [customNoHeadless, claude], spawn: fakeSpawn({ stdout: 'x', onArgs }) }),
    );
    expect(onArgs.mock.calls[0]?.[0]).toBe('claude');
  });

  it('fails when no agent CLI has a known headless mode', async () => {
    const result = await improveField(
      { repoName: 'r', fieldName: 'body', fieldValue: 'x' },
      deps({ agents: async () => [customNoHeadless] }),
    );
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'No agent CLI with a headless mode is installed, so the wand has nothing to run.',
    });
  });

  it('fails on a timeout rather than hanging the dialog forever', async () => {
    const result = await improveField(
      { repoName: 'r', fieldName: 'body', fieldValue: 'x' },
      deps({ spawn: fakeSpawn({ hang: true }), timeoutMs: 5 }),
    );
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'That took too long, so the rewrite was cancelled.',
    });
  });

  it('fails when the CLI is missing, with a hint rather than a raw errno', async () => {
    const result = await improveField(
      { repoName: 'r', fieldName: 'body', fieldValue: 'x' },
      deps({ spawn: fakeSpawn({ enoent: true }) }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind === 'error' && result.message).toContain('Could not run');
  });

  it('fails on an empty reply — there is no fallback a text field can render', async () => {
    const result = await improveField(
      { repoName: 'r', fieldName: 'body', fieldValue: 'x' },
      deps({ spawn: fakeSpawn({ stdout: '   ' }) }),
    );
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'Claude answered with nothing.',
    });
  });

  it('trims the reply', async () => {
    const result = await improveField(
      { repoName: 'r', fieldName: 'body', fieldValue: 'x' },
      deps({ spawn: fakeSpawn({ stdout: '\n  A clean rewrite.  \n' }) }),
    );
    expect(result).toEqual({ ok: true, value: { text: 'A clean rewrite.' } });
  });
});

describe('improveField — on an Ollama model (Phase 96 Theme I)', () => {
  const baseUrl = async () => 'http://127.0.0.1:11434';
  const input = { repoName: 'o/r', fieldName: 'title', fieldValue: 'fix thing', ollamaModel: 'qwen3:14b' };

  it('rewrites through /api/chat with no CLI on the roster', async () => {
    const chat = vi.fn(async () => '  Fix the thing  ');
    const result = await improveField(input, deps({ agents: async () => [], ollama: { chat, baseUrl } }));
    expect(result).toEqual({ ok: true, value: { text: 'Fix the thing' } });
  });

  it('an empty reply is refused', async () => {
    const chat = vi.fn(async () => '   ');
    const result = await improveField(input, deps({ ollama: { chat, baseUrl } }));
    expect(result.ok).toBe(false);
  });

  it('a timeout reads as a cancellation', async () => {
    const chat = vi.fn(async () => {
      throw new Error('The operation was aborted.');
    });
    const result = await improveField(input, deps({ ollama: { chat, baseUrl } }));
    expect(result).toMatchObject({ ok: false });
    expect(result).toMatchObject({ message: expect.stringContaining('took too long') });
  });
});
