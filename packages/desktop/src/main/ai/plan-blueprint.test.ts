import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from '../process-runner';
import {
  buildPlanBlueprintPrompt,
  planBlueprint,
  type AiPlanBlueprintDeps,
} from './plan-blueprint';

/** `improve-field.test.ts`'s own fake spawn, verbatim — `runProcess` attaches
 *  its handlers after `spawn` returns, so a synchronous fire lands on
 *  nothing without the `queueMicrotask` hop. Supports a queue of replies so a
 *  test can answer the retry differently from the first attempt. */
function fakeSpawn(options: {
  stdouts?: string[];
  exitCode?: number | null;
  hang?: boolean;
  enoent?: boolean;
  onArgs?: (command: string, args: readonly string[], cwd: string) => void;
}): SpawnFn {
  let callIndex = 0;
  return (command, args, cwd) => {
    options.onArgs?.(command, args, cwd);
    const index = callIndex++;
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
      const stdout = options.stdouts?.[index] ?? options.stdouts?.[options.stdouts.length - 1] ?? '';
      handlers.stdout?.(stdout);
      handlers.close?.(options.exitCode ?? 0);
    });
    return child;
  };
}

const claude = BUILTIN_AGENTS.find((agent) => agent.id === 'claude') as AgentDefinition;
const customNoHeadless: AgentDefinition = {
  id: 'custom-no-headless',
  label: 'Custom',
  command: 'custom',
  args: [],
  accent: '#000',
};

const deps = (over: Partial<AiPlanBlueprintDeps> = {}): AiPlanBlueprintDeps => ({
  agents: async () => [claude],
  home: () => '/home/tester',
  ...over,
});

const VALID_JSON = JSON.stringify({
  project: { title: 'Ship the thing', description: 'A short plan.' },
  tasks: [
    { key: 'api', title: 'Build the API', body: '', labels: [] },
    { key: 'ui', title: 'Wire up the UI', body: '', labels: ['frontend'] },
  ],
  edges: [{ from: 'ui', to: 'api', kind: 'blockedBy' }],
});

describe('buildPlanBlueprintPrompt', () => {
  it('asks for the exact JSON shape and includes the free-text request', () => {
    const prompt = buildPlanBlueprintPrompt({ repoName: 'bilo-io/studio', prompt: 'Build a login flow' });
    expect(prompt).toContain('"project"');
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain('"blockedBy"');
    expect(prompt).toContain('bilo-io/studio');
    expect(prompt).toContain('Build a login flow');
  });

  it('names an unnamed repository honestly', () => {
    expect(buildPlanBlueprintPrompt({ repoName: '', prompt: 'x' })).toContain('this repository');
  });

  it('frames the request around the origin issue when planning sub-issues', () => {
    const prompt = buildPlanBlueprintPrompt({
      repoName: 'r',
      prompt: 'Break this down',
      originIssue: { number: 42, title: 'Ship auth' },
    });
    expect(prompt).toContain('#42');
    expect(prompt).toContain('Ship auth');
    expect(prompt).toContain('sub-issues');
  });

  it('sends the current edited draft back as context for a re-plan', () => {
    const existing = {
      project: { title: 'X', description: '' },
      tasks: [{ key: 'a', title: 'A', body: '', labels: [] }],
      edges: [],
    };
    const prompt = buildPlanBlueprintPrompt({ repoName: 'r', prompt: 'Add a testing task', existing });
    expect(prompt).toContain('already edited by a person');
    expect(prompt).toContain('"key":"a"');
  });
});

describe('planBlueprint', () => {
  it('runs the CLI headless with the fast model flag and returns the parsed blueprint', async () => {
    const onArgs = vi.fn();
    const result = await planBlueprint(
      { repoName: 'r', prompt: 'Plan it' },
      deps({ spawn: fakeSpawn({ stdouts: [VALID_JSON], onArgs }) }),
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.blueprint.tasks).toHaveLength(2);
    expect(result.ok && result.value.blueprint.project.title).toBe('Ship the thing');
    expect(onArgs).toHaveBeenCalledWith(
      'claude',
      ['-p', '--model', 'haiku', expect.any(String)],
      '/home/tester',
    );
    // Exactly one call — the first reply parsed, so no retry was spent.
    expect(onArgs).toHaveBeenCalledTimes(1);
  });

  it('retries once on a reply that does not parse, and succeeds on the second', async () => {
    const onArgs = vi.fn();
    const result = await planBlueprint(
      { repoName: 'r', prompt: 'Plan it' },
      deps({ spawn: fakeSpawn({ stdouts: ['not json at all', VALID_JSON], onArgs }) }),
    );

    expect(result.ok).toBe(true);
    expect(onArgs).toHaveBeenCalledTimes(2);
    // The retry prompt carries the invalid reply forward for correction.
    expect(onArgs.mock.calls[1]?.[1]?.at(-1)).toContain('not json at all');
  });

  it('fails with a clear message when both attempts answer unparseable JSON', async () => {
    const result = await planBlueprint(
      { repoName: 'r', prompt: 'Plan it' },
      deps({ spawn: fakeSpawn({ stdouts: ['nope', 'still nope'] }) }),
    );
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'Claude could not answer with a plan in the shape this app expects.',
    });
  });

  it('fails when no agent CLI has a known headless mode', async () => {
    const result = await planBlueprint(
      { repoName: 'r', prompt: 'x' },
      deps({ agents: async () => [customNoHeadless] }),
    );
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'No agent CLI with a headless mode is installed, so there is nothing to plan with.',
    });
  });

  it('fails on a timeout rather than hanging the sheet forever', async () => {
    const result = await planBlueprint(
      { repoName: 'r', prompt: 'x' },
      deps({ spawn: fakeSpawn({ hang: true }), timeoutMs: 5 }),
    );
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'That took too long, so the plan was cancelled.',
    });
  });

  it('rejects a blueprint whose edges reference an unknown task key', async () => {
    const badEdges = JSON.stringify({
      project: { title: 'X', description: '' },
      tasks: [{ key: 'a', title: 'A', body: '', labels: [] }],
      edges: [{ from: 'a', to: 'ghost', kind: 'blockedBy' }],
    });
    const result = await planBlueprint(
      { repoName: 'r', prompt: 'x' },
      deps({ spawn: fakeSpawn({ stdouts: [badEdges, badEdges] }) }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('planBlueprint — on an Ollama model (Phase 96 Theme I)', () => {
  const baseUrl = async () => 'http://127.0.0.1:11434';

  it('calls /api/chat instead of spawning a CLI, and parses the reply', async () => {
    const spawn = vi.fn();
    const chat = vi.fn(async () => VALID_JSON);
    const result = await planBlueprint(
      { repoName: 'o/r', prompt: 'ship it', ollamaModel: 'qwen3:14b' },
      deps({ spawn: spawn as unknown as SpawnFn, agents: async () => [], ollama: { chat, baseUrl } }),
    );
    expect(result.ok).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'qwen3:14b' }),
      expect.objectContaining({ baseUrl: 'http://127.0.0.1:11434' }),
    );
  });

  it('retries once on bad JSON, then succeeds', async () => {
    const chat = vi.fn().mockResolvedValueOnce('nope').mockResolvedValueOnce(VALID_JSON);
    const result = await planBlueprint(
      { repoName: 'o/r', prompt: 'ship it', ollamaModel: 'qwen3:14b' },
      deps({ ollama: { chat, baseUrl } }),
    );
    expect(result.ok).toBe(true);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('a stopped daemon is an error envelope, not a throw', async () => {
    const chat = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const result = await planBlueprint(
      { repoName: 'o/r', prompt: 'ship it', ollamaModel: 'qwen3:14b' },
      deps({ ollama: { chat, baseUrl } }),
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain('Could not reach Ollama');
  });
});
