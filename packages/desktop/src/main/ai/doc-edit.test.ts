import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from '../process-runner';
import { buildDocEditPrompt, runDocEdit, unwrapMarkdownFence } from './doc-edit';
import type { AiImproveFieldDeps } from './improve-field';

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

const deps = (over: Partial<AiImproveFieldDeps> = {}): AiImproveFieldDeps => ({
  agents: async () => [claude],
  home: () => '/home/tester',
  ...over,
});

describe('buildDocEditPrompt', () => {
  it('scopes to the selection when there is one, with the doc as context', () => {
    const prompt = buildDocEditPrompt({ docName: 'intro.md', markdown: '# Doc\n\nbody', selection: 'body', prompt: 'shorter' });
    expect(prompt).toContain('Rewrite ONLY the selected passage');
    expect(prompt).toContain('<<<SELECTION\nbody\nSELECTION>>>');
    expect(prompt).toContain('# Doc');
    expect(prompt).toContain('Instruction: shorter');
  });

  it('asks for the full document when nothing is selected', () => {
    const prompt = buildDocEditPrompt({ docName: 'intro.md', markdown: '# Doc', prompt: 'add a summary' });
    expect(prompt).toContain('reply with the full, updated document');
    expect(prompt).not.toContain('SELECTION');
  });

  it('treats a blank selection as the whole doc', () => {
    expect(buildDocEditPrompt({ docName: 'd', markdown: 'x', selection: '  ', prompt: 'p' })).not.toContain(
      'SELECTION',
    );
  });
});

describe('unwrapMarkdownFence', () => {
  it('unwraps one outer markdown fence', () => {
    expect(unwrapMarkdownFence('```markdown\n# Hi\n\n- a\n```')).toBe('# Hi\n\n- a');
    expect(unwrapMarkdownFence('```\nplain\n```\n')).toBe('plain');
  });

  it('keeps a fence that is part of the content', () => {
    const text = 'Intro\n\n```ts\nconst a = 1;\n```';
    expect(unwrapMarkdownFence(text)).toBe(text);
  });
});

describe('runDocEdit', () => {
  it('runs the preferred agent headless with the picked model, and unwraps the reply', async () => {
    const onArgs = vi.fn();
    const result = await runDocEdit(
      { docName: 'd.md', markdown: '# A', prompt: 'p', agentId: 'claude', model: 'sonnet-5', repoPath: '/repo' },
      deps({ spawn: fakeSpawn({ stdout: '```md\n# B\n```', onArgs }) }),
    );
    expect(result).toEqual({ ok: true, value: { replacement: '# B' } });
    expect(onArgs).toHaveBeenCalledWith('claude', ['-p', '--model', 'claude-sonnet-5', expect.any(String)], '/repo');
  });

  it('passes no model flag by default, and none to an agent without one', async () => {
    const onArgs = vi.fn();
    await runDocEdit(
      { docName: 'd', markdown: 'x', prompt: 'p', agentId: 'codex', model: 'opus-5' },
      deps({ agents: async () => [claude, codex], spawn: fakeSpawn({ stdout: 'y', onArgs }) }),
    );
    expect(onArgs.mock.calls[0]?.[1]).toEqual(['exec', expect.any(String)]);
  });

  it('fails on an empty reply rather than proposing a blank doc', async () => {
    const result = await runDocEdit({ docName: 'd', markdown: 'x', prompt: 'p' }, deps({ spawn: fakeSpawn({ stdout: '  ' }) }));
    expect(result.ok).toBe(false);
  });

  it('names Ask AI when no CLI is runnable', async () => {
    const result = await runDocEdit({ docName: 'd', markdown: 'x', prompt: 'p' }, deps({ agents: async () => [] }));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('Ask AI') });
  });
});
