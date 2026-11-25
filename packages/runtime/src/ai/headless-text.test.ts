import { describe, expect, it, vi } from 'vitest';

import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/studio-shared';

import { runHeadlessText, type HeadlessTextInput, type HeadlessTextPorts } from './headless-text';

const claude = BUILTIN_AGENTS.find((agent) => agent.id === 'claude') as AgentDefinition;

const input = (over: Partial<HeadlessTextInput> = {}): HeadlessTextInput => ({
  prompt: 'say hi',
  agentId: 'claude',
  modelArgs: () => [],
  what: 'the test',
  ...over,
});

const ports = (over: Partial<HeadlessTextPorts> = {}): HeadlessTextPorts => ({
  listAgents: async () => [claude],
  runProcess: async () => ({ ok: true, stdout: '  hello\n' }),
  home: () => '/home/tester',
  ...over,
});

describe('runHeadlessText', () => {
  it('passes modelArgs(agentId) to the CLI and returns trimmed text', async () => {
    const runProcess = vi.fn<HeadlessTextPorts['runProcess']>(async () => ({ ok: true, stdout: '  hello\n' }));
    const modelArgs = vi.fn((id: string) => ['--model', `m-${id}`]);
    const result = await runHeadlessText(input({ modelArgs }), ports({ runProcess }), 1000);
    expect(result).toEqual({ ok: true, text: 'hello' });
    expect(modelArgs).toHaveBeenCalledWith('claude');
    const [command, args, opts] = runProcess.mock.calls[0]!;
    expect(command).toBe(claude.command);
    expect(args).toContain('--model');
    expect(args).toContain('m-claude');
    expect(opts).toEqual({ cwd: '/home/tester', timeoutMs: 1000 });
  });

  it('runs in repoPath when given', async () => {
    const runProcess = vi.fn<HeadlessTextPorts['runProcess']>(async () => ({ ok: true, stdout: 'x' }));
    await runHeadlessText(input({ repoPath: '/repo' }), ports({ runProcess }), 1000);
    expect(runProcess.mock.calls[0]![2].cwd).toBe('/repo');
  });

  it('treats an empty reply as a failure', async () => {
    const result = await runHeadlessText(
      input(),
      ports({ runProcess: async () => ({ ok: true, stdout: '  \n' }) }),
      1000,
    );
    expect(result).toEqual({ ok: false, message: `${claude.label} answered with nothing.` });
  });

  it('names the job when no CLI is installed', async () => {
    const result = await runHeadlessText(input({ what: 'the wand' }), ports({ listAgents: async () => [] }), 1000);
    expect(result).toEqual({
      ok: false,
      message: 'No agent CLI with a headless mode is installed, so the wand has nothing to run.',
    });
  });

  it('maps a timeout and a spawn failure to their own sentences', async () => {
    const timedOut = await runHeadlessText(
      input(),
      ports({ runProcess: async () => ({ ok: false, message: 'late', timedOut: true }) }),
      1000,
    );
    expect(timedOut).toEqual({ ok: false, message: 'That took too long, so the rewrite was cancelled.' });
    const failed = await runHeadlessText(
      input(),
      ports({ runProcess: async () => ({ ok: false, message: 'ENOENT' }) }),
      1000,
    );
    expect(failed).toEqual({ ok: false, message: `Could not run ${claude.label}: ENOENT` });
  });

  it('lets ports.timeoutMs override the default', async () => {
    const runProcess = vi.fn<HeadlessTextPorts['runProcess']>(async () => ({ ok: true, stdout: 'x' }));
    await runHeadlessText(input(), ports({ runProcess, timeoutMs: 5 }), 1000);
    expect(runProcess.mock.calls[0]![2].timeoutMs).toBe(5);
  });

  describe('Ollama', () => {
    it('routes an Ollama model to runOllama, skipping the CLI', async () => {
      const runOllama = vi.fn(async () => ({ ok: true as const, data: ' answer ' }));
      const runProcess = vi.fn<HeadlessTextPorts['runProcess']>();
      const result = await runHeadlessText(input({ ollamaModel: 'qwen3:14b' }), ports({ runOllama, runProcess }), 1000);
      expect(result).toEqual({ ok: true, text: 'answer' });
      expect(runOllama).toHaveBeenCalledWith('qwen3:14b', 'say hi', 1000);
      expect(runProcess).not.toHaveBeenCalled();
    });

    it('fails with a sentence when runOllama is absent', async () => {
      const result = await runHeadlessText(input({ ollamaModel: 'qwen3:14b' }), ports(), 1000);
      expect(result).toEqual({ ok: false, message: 'Ollama is not available in this app.' });
    });

    it('surfaces an Ollama failure and an empty answer', async () => {
      const bad = await runHeadlessText(
        input({ ollamaModel: 'm' }),
        ports({ runOllama: async () => ({ ok: false, message: 'down' }) }),
        1000,
      );
      expect(bad).toEqual({ ok: false, message: 'down' });
      const empty = await runHeadlessText(
        input({ ollamaModel: 'm' }),
        ports({ runOllama: async () => ({ ok: true, data: ' ' }) }),
        1000,
      );
      expect(empty).toEqual({ ok: false, message: 'm answered with nothing.' });
    });
  });
});
