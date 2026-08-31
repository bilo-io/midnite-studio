import type { RepoDescriptor, TerminalSession, Worktree } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { activeAgentWorktreePaths } from './use-agent-worktrees';

const worktree = (repoId: string, path: string, isMain = false): Worktree => ({
  id: `${repoId}:${path}`,
  repoId,
  path,
  branch: 'main',
  headSha: 'a'.repeat(40),
  locked: false,
  isMain,
  prunable: false,
});

const repo = (id: string, name: string, path: string, extra: string[] = []): RepoDescriptor => ({
  id,
  name,
  path,
  headRef: 'main',
  worktrees: [worktree(id, path, true), ...extra.map((p) => worktree(id, p))],
});

const repos: RepoDescriptor[] = [
  repo('r1', 'midnite-studio', '/Users/x/Dev/midnite-studio', [
    '/Users/x/Dev/midnite-studio/.worktrees/agent-wt',
    '/Users/x/Dev/midnite-studio/.worktrees/other-wt',
  ]),
];

const createSession = (
  id: string,
  kind: 'agent' | 'shell',
  agentId: string | undefined,
  cwd: string,
): TerminalSession => ({
  id,
  kind,
  agentId,
  title: 'term',
  cwd,
  repoId: 'r1',
  createdAt: Date.now(),
});

describe('activeAgentWorktreePaths', () => {
  it('returns empty set if no sessions or no agents', () => {
    const sessions = [createSession('s1', 'shell', undefined, '/Users/x/Dev/midnite-studio')];
    const states = { s1: 'open' as const };
    const liveAgentId = {};
    const liveCwd = {};

    const active = activeAgentWorktreePaths(sessions, states, liveAgentId, liveCwd, repos);
    expect(active.size).toBe(0);
  });

  it('detects live agent session in a worktree', () => {
    const sessions = [
      createSession('s1', 'agent', 'claude', '/Users/x/Dev/midnite-studio/.worktrees/agent-wt'),
    ];
    const states = { s1: 'open' as const };
    const liveAgentId = {};
    const liveCwd = {};

    const active = activeAgentWorktreePaths(sessions, states, liveAgentId, liveCwd, repos);
    expect(active.has('/Users/x/Dev/midnite-studio/.worktrees/agent-wt')).toBe(true);
    expect(active.has('/Users/x/Dev/midnite-studio')).toBe(false);
  });

  it('detects live agent session via liveCwd update', () => {
    const sessions = [
      createSession('s1', 'agent', 'claude', '/Users/x/Dev/midnite-studio'),
    ];
    const states = { s1: 'open' as const };
    const liveAgentId = {};
    const liveCwd = { s1: '/Users/x/Dev/midnite-studio/.worktrees/agent-wt/packages/app' };

    const active = activeAgentWorktreePaths(sessions, states, liveAgentId, liveCwd, repos);
    expect(active.has('/Users/x/Dev/midnite-studio/.worktrees/agent-wt')).toBe(true);
  });

  it('detects shell session running an agent probed via liveAgentId', () => {
    const sessions = [
      createSession('s1', 'shell', undefined, '/Users/x/Dev/midnite-studio/.worktrees/agent-wt'),
    ];
    const states = { s1: 'open' as const };
    const liveAgentId = { s1: 'codex' };
    const liveCwd = {};

    const active = activeAgentWorktreePaths(sessions, states, liveAgentId, liveCwd, repos);
    expect(active.has('/Users/x/Dev/midnite-studio/.worktrees/agent-wt')).toBe(true);
  });

  it('ignores exited or asleep agent sessions', () => {
    const sessions = [
      createSession('s1', 'agent', 'claude', '/Users/x/Dev/midnite-studio/.worktrees/agent-wt'),
      createSession('s2', 'agent', 'claude', '/Users/x/Dev/midnite-studio/.worktrees/other-wt'),
    ];
    sessions[1] = { ...sessions[1]!, asleep: true };
    const states = { s1: 'exited' as const, s2: 'open' as const };
    const liveAgentId = {};
    const liveCwd = {};

    const active = activeAgentWorktreePaths(sessions, states, liveAgentId, liveCwd, repos);
    expect(active.size).toBe(0);
  });
});
