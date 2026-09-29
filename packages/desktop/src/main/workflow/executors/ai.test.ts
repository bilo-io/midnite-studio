import { describe, expect, it } from 'vitest';

import type { AgentDefinition, WorkflowNode } from '@midnite/studio-shared';

import type { SpawnFn, SpawnedProcess } from '../../process-runner';
import type { ExecutorContext } from '../executor-registry';
import { createAiExtractExecutor, createAiPromptExecutor, parseJsonReply, type AiExecutorDeps } from './ai';

/**
 * `ai-prompt` / `ai-extract` run a roster CLI headlessly through
 * `runProcess` — never a real binary here: a scripted `SpawnFn` answers with
 * fixed stdout, the same discipline `verify.test.ts` uses for its headless
 * checks, and a stub `/api/chat` stands in for Ollama.
 */

type Call = { command: string; args: string[]; cwd: string };

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

const ROSTER: AgentDefinition[] = [
  { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#000000' },
];

function deps(spawn: SpawnFn, over: Partial<AiExecutorDeps> = {}): AiExecutorDeps {
  return { agents: async () => ROSTER, spawn, home: () => '/home/test', ...over };
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

function promptNode(config: Partial<Extract<WorkflowNode, { kind: 'ai-prompt' }>['config']> = {}): WorkflowNode {
  return { id: 'ask', label: 'Ask', x: 0, y: 0, kind: 'ai-prompt', config: { agentId: '', prompt: 'hi', format: 'text', ...config } };
}

function extractNode(config: Partial<Extract<WorkflowNode, { kind: 'ai-extract' }>['config']> = {}): WorkflowNode {
  return {
    id: 'ex',
    label: 'Extract',
    x: 0,
    y: 0,
    kind: 'ai-extract',
    config: { agentId: '', source: 'Ada, 36', fields: [{ key: 'name', description: '' }, { key: 'age', description: 'years' }], ...config },
  };
}

describe('the ai-prompt executor', () => {
  it('interpolates the prompt and runs the CLI headlessly in print mode', async () => {
    const calls: Call[] = [];
    const run = createAiPromptExecutor(deps(scriptedSpawn({ stdout: '  Bonjour  \n' }, calls)));
    const outcome = await run(promptNode({ prompt: 'Translate {{a.word}}' }), context({ a: { word: 'hello' } }));
    expect(outcome).toEqual({ ok: true, output: { text: 'Bonjour', via: 'claude' } });
    expect(calls).toEqual([{ command: 'claude', args: ['-p', 'Translate hello'], cwd: '/home/test' }]);
  });

  it('passes a model flag through', async () => {
    const calls: Call[] = [];
    await createAiPromptExecutor(deps(scriptedSpawn({ stdout: 'ok' }, calls)))(promptNode({ model: 'haiku' }), context());
    expect(calls[0]?.args).toEqual(['-p', '--model', 'haiku', 'hi']);
  });

  it('parses a JSON reply, fence and all', async () => {
    const run = createAiPromptExecutor(deps(scriptedSpawn({ stdout: 'Sure:\n```json\n{"a": 1}\n```\n' })));
    const outcome = await run(promptNode({ format: 'json' }), context());
    expect(outcome.ok && outcome.output).toMatchObject({ json: { a: 1 } });
  });

  it('fails on a JSON reply that does not parse', async () => {
    const outcome = await createAiPromptExecutor(deps(scriptedSpawn({ stdout: 'no json here' })))(
      promptNode({ format: 'json' }),
      context(),
    );
    expect(outcome).toEqual({ ok: false, error: 'The reply was not valid JSON.' });
  });

  it('fails on an empty reply, a non-zero exit, and an unknown preferred agent', async () => {
    expect(await createAiPromptExecutor(deps(scriptedSpawn({ stdout: '  ' })))(promptNode(), context())).toEqual({
      ok: false,
      error: 'Claude answered with nothing.',
    });
    expect(
      await createAiPromptExecutor(deps(scriptedSpawn({ stderr: 'auth\nnot logged in', code: 1 })))(promptNode(), context()),
    ).toEqual({ ok: false, error: 'Claude exited with code 1: not logged in' });
    expect(
      await createAiPromptExecutor(deps(scriptedSpawn({ stdout: 'x' })))(promptNode({ agentId: 'nope' }), context()),
    ).toEqual({ ok: false, error: '"nope" is not on the roster, or has no headless mode.' });
  });

  it('fails when nothing on the roster has a headless mode', async () => {
    const run = createAiPromptExecutor(deps(scriptedSpawn({ stdout: 'x' }), { agents: async () => [] }));
    expect(await run(promptNode(), context())).toEqual({
      ok: false,
      error: 'No agent CLI with a headless mode is installed.',
    });
  });

  it('routes to Ollama when an ollamaModel is set', async () => {
    const run = createAiPromptExecutor(
      deps(scriptedSpawn({ stdout: 'unused' }), {
        ollama: { chat: async () => 'from llama', baseUrl: async () => 'http://127.0.0.1:11434' },
      }),
    );
    expect(await run(promptNode({ ollamaModel: 'llama3.2' }), context())).toEqual({
      ok: true,
      output: { text: 'from llama', via: 'llama3.2' },
    });
  });

  it('surfaces an unresolved {{...}} reference instead of sending it', async () => {
    const outcome = await createAiPromptExecutor(deps(scriptedSpawn({ stdout: 'x' })))(
      promptNode({ prompt: '{{missing.x}}' }),
      context(),
    );
    expect(outcome.ok).toBe(false);
  });
});

describe('the ai-extract executor', () => {
  it('returns every declared key, null for ones the model left out', async () => {
    const calls: Call[] = [];
    const run = createAiExtractExecutor(deps(scriptedSpawn({ stdout: '{"name":"Ada","extra":true}' }, calls)));
    expect(await run(extractNode(), context())).toEqual({ ok: true, output: { name: 'Ada', age: null } });
    const prompt = calls[0]?.args.at(-1) ?? '';
    expect(prompt).toContain('keys are exactly: name, age');
    expect(prompt).toContain('- age: years');
    expect(prompt).toContain('Ada, 36');
  });

  it('fails when the reply is not a JSON object', async () => {
    const run = createAiExtractExecutor(deps(scriptedSpawn({ stdout: '[1,2]' })));
    expect(await run(extractNode(), context())).toEqual({ ok: false, error: 'The reply was not a JSON object.' });
  });
});

describe('parseJsonReply', () => {
  it('reads bare JSON, a fenced block, or the outermost object span', () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonReply('```\n[1]\n```')).toEqual([1]);
    expect(parseJsonReply('Here you go: {"b":2} — done')).toEqual({ b: 2 });
    expect(parseJsonReply('nothing')).toBeUndefined();
  });
});
