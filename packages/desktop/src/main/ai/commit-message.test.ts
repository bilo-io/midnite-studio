import { BUILTIN_AGENTS, fastModelFor, type AgentDefinition } from '@midnite/studio-shared';
import type { ChangeText } from '@midnite/studio-git-engine';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from '../process-runner';
import type { AiImproveFieldDeps } from './improve-field';
import {
  buildCommitMessagePrompt,
  capPatch,
  cleanCommitMessage,
  COMMIT_DIFF_FILE_CAP,
  COMMIT_DIFF_TOTAL_CAP,
  generateCommitMessage,
} from './commit-message';

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

const fileChunk = (name: string, size: number) =>
  `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n${'+x'.repeat(size / 2)}\n`;

const change = (over: Partial<ChangeText> = {}): ChangeText => ({
  source: 'staged',
  stat: ' a.ts | 2 +-\n',
  patch: fileChunk('a.ts', 100),
  untracked: [],
  ...over,
});

describe('model selection', () => {
  it('uses the fastest alias of each provider', () => {
    expect(fastModelFor('claude')).toBe('haiku');
    expect(fastModelFor('codex')).toBe('gpt-5-mini');
    expect(fastModelFor('gemini')).toBe('gemini-2.5-flash');
    expect(fastModelFor('unknown-agent')).toBeNull();
  });
});

describe('buildCommitMessagePrompt', () => {
  it('asks for Conventional Commits, 72 columns, nothing else', () => {
    const prompt = buildCommitMessagePrompt(change());
    expect(prompt).toContain('Conventional Commits');
    expect(prompt).toContain('type(scope): subject');
    expect(prompt).toContain('72 characters');
    expect(prompt).toContain('blank line');
    expect(prompt).toContain('ONLY the commit message');
  });

  it('says which side was read', () => {
    expect(buildCommitMessagePrompt(change({ source: 'staged' }))).toContain('STAGED');
    expect(buildCommitMessagePrompt(change({ source: 'working' }))).toContain('Nothing is staged');
  });

  it('lists untracked files, bounded', () => {
    const untracked = Array.from({ length: 60 }, (_, i) => `new-${i}.ts`);
    const prompt = buildCommitMessagePrompt(change({ source: 'working', untracked }));
    expect(prompt).toContain('new-0.ts');
    expect(prompt).not.toContain('new-59.ts');
    expect(prompt).toContain('and 20 more');
  });
});

describe('capPatch', () => {
  it('cuts one huge file so it cannot starve the others', () => {
    const out = capPatch(fileChunk('big.ts', 50_000) + fileChunk('small.ts', 100));
    expect(out).toContain('small.ts');
    expect(out).toContain('file diff truncated');
    expect(out.length).toBeLessThan(COMMIT_DIFF_FILE_CAP + 600);
  });

  it('stays under the total cap and counts what it dropped', () => {
    const patch = Array.from({ length: 20 }, (_, i) => fileChunk(`f${i}.ts`, 2_000)).join('');
    const out = capPatch(patch);
    expect(out.length).toBeLessThan(COMMIT_DIFF_TOTAL_CAP + 800);
    expect(out).toMatch(/\d+ more file diff\(s\) omitted/);
  });

  it('passes a small patch through untouched', () => {
    const patch = fileChunk('a.ts', 100);
    expect(capPatch(patch)).toBe(patch);
  });
});

describe('cleanCommitMessage', () => {
  it('unwraps a code fence the model added anyway', () => {
    expect(cleanCommitMessage('```\nfeat: x\n\nbody\n```')).toBe('feat: x\n\nbody');
  });
});

describe('generateCommitMessage', () => {
  it('runs the fast model flag and returns the text with its source', async () => {
    const onArgs = vi.fn();
    const result = await generateCommitMessage(
      { cwd: '/repo' },
      deps({ spawn: fakeSpawn({ stdout: 'feat(ui): add sparkles\n', onArgs }) }),
      async () => change(),
    );
    expect(result).toEqual({ ok: true, value: { text: 'feat(ui): add sparkles', source: 'staged' } });
    expect(onArgs).toHaveBeenCalledWith('claude', ['-p', '--model', 'haiku', expect.any(String)], '/repo');
  });

  it('uses the requested provider\'s fast model', async () => {
    const onArgs = vi.fn();
    await generateCommitMessage(
      { cwd: '/repo', agentId: 'codex' },
      deps({ agents: async () => [claude, codex], spawn: fakeSpawn({ stdout: 'fix: y', onArgs }) }),
      async () => change(),
    );
    expect(onArgs).toHaveBeenCalledWith('codex', ['exec', '--model', 'gpt-5-mini', expect.any(String)], '/repo');
  });

  it('fails without spawning when there are no changes', async () => {
    const onArgs = vi.fn();
    const result = await generateCommitMessage(
      { cwd: '/repo' },
      deps({ spawn: fakeSpawn({ stdout: 'x', onArgs }) }),
      async () => null,
    );
    expect(result.ok).toBe(false);
    expect(onArgs).not.toHaveBeenCalled();
  });

  it('answers a failure envelope when the CLI is missing', async () => {
    const result = await generateCommitMessage(
      { cwd: '/repo' },
      deps({ spawn: fakeSpawn({ enoent: true }) }),
      async () => change(),
    );
    expect(result.ok).toBe(false);
  });

  it('answers a failure envelope on a timeout', async () => {
    const result = await generateCommitMessage(
      { cwd: '/repo' },
      deps({ spawn: fakeSpawn({ hang: true }), timeoutMs: 20 }),
      async () => change(),
    );
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });

  it('fails when no agent has a headless mode', async () => {
    const result = await generateCommitMessage({ cwd: '/repo' }, deps({ agents: async () => [] }), async () => change());
    expect(result.ok).toBe(false);
  });
});
