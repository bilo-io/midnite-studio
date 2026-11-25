import { describe, expect, it, vi } from 'vitest';

import type { AgentProfile } from '@midnite/studio-shared';

import { createWorkflowProfileLaunch } from './workflow-profile-launch';

const profile = { id: 'profile-a', name: 'Reviewer', baseAgentId: 'codex' } as AgentProfile;

describe('createWorkflowProfileLaunch (#1699)', () => {
  it("prepares the agent's line with the node's task as its first prompt", async () => {
    const prepare = vi.fn(async () => ({ launchId: 'l1', line: 'codex …' }));
    const run = createWorkflowProfileLaunch({ profile: async () => profile, launch: { prepare } });
    await expect(run('profile-a', '/home', 'run /review')).resolves.toEqual({
      kind: 'ready',
      launchId: 'l1',
      line: 'codex …',
      name: 'Reviewer',
      baseAgentId: 'codex',
    });
    // Codex reads skills as `$name`, as every other launch path types them.
    expect(prepare).toHaveBeenCalledWith(profile, { cwd: '/home', resume: false, prompt: 'run $review' });
  });

  it('answers missing for a deleted agent, without preparing anything', async () => {
    const prepare = vi.fn();
    const run = createWorkflowProfileLaunch({ profile: async () => null, launch: { prepare } });
    await expect(run('profile-gone', '/home', 'x')).resolves.toEqual({ kind: 'missing' });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('turns a refusal into an error naming the agent', async () => {
    const run = createWorkflowProfileLaunch({
      profile: async () => profile,
      launch: { prepare: async () => Promise.reject(new Error('The base CLI codex is not in the roster.')) },
    });
    await expect(run('profile-a', '/home', 'x')).resolves.toEqual({
      kind: 'error',
      message: 'Reviewer could not start: The base CLI codex is not in the roster.',
    });
  });
});
