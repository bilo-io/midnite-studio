import { BUILTIN_AGENTS, createBlankAgentProfile, type AgentProfile } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { companionRunId, createProfileHeadlessRun } from './profile-headless';

/** Phase 154 Theme H — the companion's headless ask through a custom agent. */

const profile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  ...createBlankAgentProfile(),
  id: 'profile-rev',
  name: 'Reviewer',
  ...overrides,
});
const launch = { command: '/app/Midnite', args: ['shim.js', '--socket', '/runs/x.sock'], env: { ELECTRON_RUN_AS_NODE: '1' } };

function setup(opts: { saved?: AgentProfile | null; prompt?: boolean; fail?: boolean; roster?: typeof BUILTIN_AGENTS } = {}) {
  const prepare = vi.fn(async () => {
    if (opts.fail) throw new Error('socket path too long');
    return { launchId: 'abc123', mcpArgs: [], launch };
  });
  const bind = vi.fn(() => true);
  const close = vi.fn(async () => undefined);
  const run = createProfileHeadlessRun({
    sockets: { prepare, bind, close },
    profile: async () => (opts.saved === undefined ? profile() : opts.saved),
    agents: async () => [...(opts.roster ?? BUILTIN_AGENTS)],
    promptPath: (id) => `/data/agent-profiles/${id}.md`,
    exists: async () => opts.prompt ?? true,
    readPrompt: async () => '  You review code.\n',
  });
  return { run, prepare, bind, close };
}

describe('createProfileHeadlessRun', () => {
  it('prepares Claude: binds the socket to the run at once and builds an unquoted argv', async () => {
    const { run, prepare, bind, close } = setup({ saved: profile({ model: 'opus', mcpTools: ['git_status'] }) });
    const result = await run('profile-rev', '/repo');
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ id: 'profile-rev' }), '/repo');
    expect(bind).toHaveBeenCalledWith('abc123', companionRunId('abc123'));
    if (result.kind !== 'ready') throw new Error(result.kind);
    expect(result.agent.id).toBe('claude');
    expect(result.args[0]).toBe('-p');
    expect(result.args).toContain('--strict-mcp-config');
    expect(result.args.slice(-2)).toEqual(['--append-system-prompt-file', '/data/agent-profiles/profile-rev.md']);
    expect(result.promptPrefix).toBeNull();
    await result.release();
    expect(close).toHaveBeenCalledWith('abc123');
  });

  it('Codex: the prompt file text goes ahead of the question instead of a flag', async () => {
    const { run } = setup({ saved: profile({ baseAgentId: 'codex' }) });
    const result = await run('profile-rev', '/repo');
    if (result.kind !== 'ready') throw new Error(result.kind);
    expect(result.args[0]).toBe('exec');
    expect(result.promptPrefix).toBe('You review code.');
    expect(result.args).not.toContain('--append-system-prompt-file');
  });

  it('answers missing for a deleted agent, starting nothing', async () => {
    const { run, prepare } = setup({ saved: null });
    expect(await run('profile-rev', '/repo')).toEqual({ kind: 'missing' });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('fails closed when the base CLI is not installed', async () => {
    const { run, prepare } = setup({ roster: BUILTIN_AGENTS.filter((a) => a.id !== 'claude') });
    expect(await run('profile-rev', '/repo')).toEqual({
      kind: 'error',
      message: 'Reviewer runs on Claude, which is not installed here. Pick another agent in the title bar.',
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('fails closed for a base with no print mode, and when the socket will not start', async () => {
    const custom = { id: 'mystery', label: 'Mystery', command: 'mystery', args: [], accent: '#000000' };
    const noPrint = setup({ saved: profile({ baseAgentId: 'mystery' }), roster: [...BUILTIN_AGENTS, custom] });
    expect((await noPrint.run('profile-rev', '/repo')).kind).toBe('error');
    expect(noPrint.prepare).not.toHaveBeenCalled();

    const broken = setup({ fail: true });
    expect(await broken.run('profile-rev', '/repo')).toEqual({
      kind: 'error',
      message: "I could not start Reviewer's tools: socket path too long",
    });
    expect(broken.bind).not.toHaveBeenCalled();
  });
});
