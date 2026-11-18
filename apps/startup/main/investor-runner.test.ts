// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/studio-shared';
import type { HeadlessTextPorts } from '@midnite/studio-runtime';

import { createInvestorPorts, INVESTOR_UPDATE_TIMEOUT_MS } from './investor-runner';

const claude = BUILTIN_AGENTS.find((a) => a.id === 'claude') as AgentDefinition;
const codex = BUILTIN_AGENTS.find((a) => a.id === 'codex') as AgentDefinition;
const ports = (over: Partial<HeadlessTextPorts> = {}): HeadlessTextPorts => ({
  listAgents: async () => [claude, codex],
  runProcess: async () => ({ ok: true, stdout: ' ## Highlights\n' }),
  home: () => '/home/tester',
  ...over,
});

describe('createInvestorPorts', () => {
  it('lists the probed agents by id and label', async () => {
    expect(await createInvestorPorts({ ports: ports() }).agents()).toEqual([
      { id: 'claude', label: claude.label },
      { id: 'codex', label: codex.label },
    ]);
  });

  it('runs the chosen CLI with a 180 s timeout and no model flag, and names the model that answered', async () => {
    const runProcess = vi.fn<HeadlessTextPorts['runProcess']>(async () => ({ ok: true, stdout: 'hello' }));
    const out = await createInvestorPorts({ ports: ports({ runProcess }) }).run({ prompt: 'p', agentId: 'codex' });
    expect(out).toEqual({ ok: true, text: 'hello', model: 'codex' });
    const [command, args, opts] = runProcess.mock.calls[0]!;
    expect(command).toBe(codex.command);
    expect(args).not.toContain('--model');
    expect(opts.timeoutMs).toBe(INVESTOR_UPDATE_TIMEOUT_MS);
    expect(INVESTOR_UPDATE_TIMEOUT_MS).toBe(180_000);
  });

  it('falls back to a probed agent when the chosen one is not installed', async () => {
    const out = await createInvestorPorts({ ports: ports({ listAgents: async () => [codex] }) }).run({ prompt: 'p', agentId: 'claude' });
    expect(out).toMatchObject({ ok: true, model: 'codex' });
  });

  it('runs Ollama over its port and labels the model', async () => {
    const runOllama = vi.fn(async () => ({ ok: true as const, data: 'hi' }));
    const out = await createInvestorPorts({ ports: ports({ runOllama }) }).run({ prompt: 'p', ollamaModel: 'llama3' });
    expect(out).toEqual({ ok: true, text: 'hi', model: 'ollama:llama3' });
    expect(runOllama).toHaveBeenCalledWith('llama3', 'p', INVESTOR_UPDATE_TIMEOUT_MS);
  });

  it('turns a failure and an empty reply into a message, and waits for the PATH merge', async () => {
    const order: string[] = [];
    const ready = new Promise<void>((r) => setTimeout(() => (order.push('ready'), r()), 5));
    const none = createInvestorPorts({ ports: ports({ listAgents: async () => (order.push('probe'), []) }), ready });
    expect(await none.run({ prompt: 'p' })).toMatchObject({ ok: false });
    expect(order[0]).toBe('ready');
    const down = createInvestorPorts({ ports: ports({ runProcess: async () => ({ ok: false, message: 'boom' }) }) });
    expect(await down.run({ prompt: 'p' })).toMatchObject({ ok: false });
  });
});
