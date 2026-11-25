import { BUILTIN_AGENTS, createBlankAgentProfile, type AgentProfile } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createProfileLaunchService } from './profile-launch';

const profile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({ ...createBlankAgentProfile(), id: 'ap-1', ...overrides });

function service(opts: { prompt?: boolean; mcpArgs?: string[] } = {}) {
  const prepare = vi.fn(async () => ({ launchId: 'abc123', mcpArgs: opts.mcpArgs ?? ['--mcp-config', `'{}'`], launch: null }));
  const launch = createProfileLaunchService({
    sockets: { prepare },
    agents: async () => [...BUILTIN_AGENTS],
    promptPath: (id) => `/data/agent-profiles/${id}.md`,
    exists: async () => opts.prompt ?? true,
  });
  return { launch, prepare };
}

describe('createProfileLaunchService', () => {
  it('builds the Claude line with the prompt file flag and the socket words', async () => {
    const { launch, prepare } = service();
    const result = await launch.prepare(profile(), { cwd: '/w', resume: false });
    expect(result.launchId).toBe('abc123');
    expect(result.line).toContain(`--append-system-prompt-file '/data/agent-profiles/ap-1.md'`);
    expect(result.line).toContain(`--mcp-config '{}'`);
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ id: 'ap-1' }), '/w');
  });

  it('leaves the prompt out when the agent has no prompt file', async () => {
    const { launch } = service({ prompt: false });
    expect((await launch.prepare(profile(), { cwd: '/w', resume: false })).line).not.toContain('--append-system-prompt-file');
  });

  it('Codex: the prompt is the first message, and Resume does not resend it', async () => {
    const { launch } = service({ mcpArgs: [] });
    const fresh = await launch.prepare(profile({ baseAgentId: 'codex' }), { cwd: '/w', resume: false });
    const resumed = await launch.prepare(profile({ baseAgentId: 'codex' }), { cwd: '/w', resume: true });
    expect(fresh.line).toContain(`"$(cat '/data/agent-profiles/ap-1.md')"`);
    expect(resumed.line).not.toContain('$(cat');
  });

  it('throws when the base CLI is not in the roster', async () => {
    const { launch } = service();
    await expect(launch.prepare(profile({ baseAgentId: 'nope' }), { cwd: '/w', resume: false })).rejects.toThrow(
      'The base CLI nope is not in the roster.',
    );
  });
});
