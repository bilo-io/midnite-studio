import { BUILTIN_AGENTS, createBlankAgentProfile, type AgentProfile } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createHeadlessRunRegistry } from './headless-run-profiles';
import { companionRunId, councilSeatRunId, createProfileHeadlessRun } from './profile-headless';

/** Phase 154 Theme H — the companion's headless ask through a custom agent. */

const profile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  ...createBlankAgentProfile(),
  id: 'profile-rev',
  name: 'Reviewer',
  ...overrides,
});
const launch = { command: '/app/Midnite', args: ['shim.js', '--socket', '/runs/x.sock'], env: { ELECTRON_RUN_AS_NODE: '1' } };

function setup(
  opts: { saved?: AgentProfile | null; prompt?: boolean; fail?: boolean; roster?: typeof BUILTIN_AGENTS; council?: boolean } = {},
) {
  const prepare = vi.fn(async () => {
    if (opts.fail) throw new Error('socket path too long');
    return { launchId: 'abc123', mcpArgs: [], launch, otherMcpServers: ['github'] };
  });
  const bind = vi.fn(() => true);
  const close = vi.fn(async () => undefined);
  const runs = createHeadlessRunRegistry();
  const run = createProfileHeadlessRun({
    sockets: { prepare, bind, close },
    runs,
    profile: async () => (opts.saved === undefined ? profile() : opts.saved),
    agents: async () => [...(opts.roster ?? BUILTIN_AGENTS)],
    promptPath: (id) => `/data/agent-profiles/${id}.md`,
    exists: async () => opts.prompt ?? true,
    readPrompt: async () => '  You review code.\n',
    ...(opts.council ? { runId: councilSeatRunId, pickHint: 'Pick another agent for this seat.', voice: 'neutral' as const } : {}),
  });
  return { run, prepare, bind, close, runs };
}

describe('createProfileHeadlessRun', () => {
  it('prepares Claude: binds the socket to the run at once and builds an unquoted argv', async () => {
    const { run, prepare, bind, close, runs } = setup({ saved: profile({ model: 'opus', mcpTools: ['git_status'] }) });
    const result = await run('profile-rev', '/repo');
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ id: 'profile-rev' }), '/repo');
    expect(bind).toHaveBeenCalledWith('abc123', companionRunId('abc123'));
    if (result.kind !== 'ready') throw new Error(result.kind);
    expect(result.agent.id).toBe('claude');
    expect(result.args[0]).toBe('-p');
    expect(result.args).toContain('--strict-mcp-config');
    expect(result.args.slice(-2)).toEqual(['--append-system-prompt-file', '/data/agent-profiles/profile-rev.md']);
    expect(result.promptPrefix).toBeNull();
    // #1697: the breaker can name the run's custom agent until it settles.
    expect(runs.lookup(companionRunId('abc123'))).toEqual({ profileId: 'profile-rev', agentId: 'claude', cwd: '/repo', title: 'Reviewer' });
    await result.release();
    expect(close).toHaveBeenCalledWith('abc123');
    expect(runs.lookup(companionRunId('abc123'))).toBeNull();
  });

  it('#1713: the runner attaches its child, and the breaker\'s abort kills it by run id', async () => {
    const { run, runs } = setup();
    const result = await run('profile-rev', '/repo');
    if (result.kind !== 'ready') throw new Error(result.kind);
    const kill = vi.fn();
    result.attach?.({ kill });
    expect(runs.abort(companionRunId('abc123'))).toBe(true);
    expect(kill).toHaveBeenCalledTimes(1);
    await result.release();
    expect(runs.abort(companionRunId('abc123'))).toBe(false);
  });

  it('Codex: the prompt file text goes ahead of the question instead of a flag', async () => {
    const { run } = setup({ saved: profile({ baseAgentId: 'codex' }) });
    const result = await run('profile-rev', '/repo');
    if (result.kind !== 'ready') throw new Error(result.kind);
    expect(result.args[0]).toBe('exec');
    expect(result.promptPrefix).toBe('You review code.');
    expect(result.args).not.toContain('--append-system-prompt-file');
    // #1697: a restricted Codex agent turns the user's other servers off by name.
    expect(result.args).not.toContain('mcp_servers.github.enabled=false');
    const restricted = await setup({ saved: profile({ baseAgentId: 'codex', mcpTools: ['repo.list'] }) }).run('profile-rev', '/repo');
    if (restricted.kind !== 'ready') throw new Error(restricted.kind);
    expect(restricted.args).toContain('mcp_servers.github.enabled=false');
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

  it('a council seat (#1699) binds under its own run id and points at the seat, not the title bar', async () => {
    const { run, bind, runs } = setup({ council: true });
    const ready = await run('profile-rev', '/home');
    expect(bind).toHaveBeenCalledWith('abc123', councilSeatRunId('abc123'));
    if (ready.kind !== 'ready') throw new Error(ready.kind);
    // The breaker finds the seat's agent under the seat's own run id, until the seat releases it.
    expect(runs.lookup(councilSeatRunId('abc123'))).toMatchObject({ profileId: 'profile-rev' });
    await ready.release();
    expect(runs.lookup(councilSeatRunId('abc123'))).toBeNull();

    const missingBase = setup({ council: true, roster: BUILTIN_AGENTS.filter((agent) => agent.id !== 'claude') });
    const refused = await missingBase.run('profile-rev', '/home');
    expect(refused).toEqual({ kind: 'error', message: expect.stringContaining('Pick another agent for this seat.') });
  });

  it('a council seat (#1713) speaks in a neutral voice, never the companion\'s first person', async () => {
    const broken = setup({ council: true, fail: true });
    expect(await broken.run('profile-rev', '/home')).toEqual({
      kind: 'error',
      message: "Could not start Reviewer's tools: socket path too long",
    });
  });
});

describe('createHeadlessRunRegistry (#1713)', () => {
  const run = { profileId: 'p', agentId: 'claude', cwd: '/repo', title: 'Reviewer' };

  it('kills a child that attaches after the run was aborted', () => {
    const runs = createHeadlessRunRegistry();
    runs.register('companion-1', run);
    expect(runs.abort('companion-1')).toBe(true);
    const kill = vi.fn();
    runs.attach('companion-1', { kill });
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('answers false for an unknown run and ignores an attach to one', () => {
    const runs = createHeadlessRunRegistry();
    const kill = vi.fn();
    runs.attach('nope', { kill });
    expect(runs.abort('nope')).toBe(false);
    expect(kill).not.toHaveBeenCalled();
  });

  it('a kill that throws (child already gone) still counts as stopped', () => {
    const runs = createHeadlessRunRegistry();
    runs.register('chat-1', run);
    runs.attach('chat-1', {
      kill: () => {
        throw new Error('ESRCH');
      },
    });
    expect(runs.abort('chat-1')).toBe(true);
  });
});
