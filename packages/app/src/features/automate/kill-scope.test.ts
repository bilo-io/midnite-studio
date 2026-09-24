/**
 * Pure logic — no browser capability needed (`docs/TESTING.md`'s own rule).
 */
import { describe, expect, it } from 'vitest';

import type { TerminalSession } from '@midnite/studio-shared';

import { EMPTY_KILL_SCOPE_CONTEXT, sessionMatchesScope, sessionsForScope, type KillScopeContext } from './kill-scope';

function session(overrides: Partial<TerminalSession> & Pick<TerminalSession, 'id'>): TerminalSession {
  return {
    kind: 'agent',
    agentId: 'claude',
    title: 'Session',
    cwd: '/repo',
    repoId: 'repo-1',
    createdAt: 0,
    ...overrides,
  };
}

describe('sessionMatchesScope', () => {
  it('flow matches only a session whose workflowRunRef names the same workflow', () => {
    const context: KillScopeContext = { ...EMPTY_KILL_SCOPE_CONTEXT, flow: { workflowId: 'wf-1' } };
    const matching = session({ id: 'a', workflowRunRef: { workflowId: 'wf-1', runId: 'r1', nodeId: 'n1' } });
    const other = session({ id: 'b', workflowRunRef: { workflowId: 'wf-2', runId: 'r1', nodeId: 'n1' } });
    const unset = session({ id: 'c' });

    expect(sessionMatchesScope(matching, 'flow', context)).toBe(true);
    expect(sessionMatchesScope(other, 'flow', context)).toBe(false);
    expect(sessionMatchesScope(unset, 'flow', context)).toBe(false);
  });

  it('flow matches nothing when no flow is open', () => {
    const matching = session({ id: 'a', workflowRunRef: { workflowId: 'wf-1', runId: 'r1', nodeId: 'n1' } });
    expect(sessionMatchesScope(matching, 'flow', EMPTY_KILL_SCOPE_CONTEXT)).toBe(false);
  });

  it('project matches only a session whose projectRef names the same project', () => {
    const context: KillScopeContext = { ...EMPTY_KILL_SCOPE_CONTEXT, project: { projectId: 'proj-1' } };
    const matching = session({ id: 'a', projectRef: { projectId: 'proj-1', forge: 'github' } });
    const other = session({ id: 'b', projectRef: { projectId: 'proj-2', forge: 'github' } });

    expect(sessionMatchesScope(matching, 'project', context)).toBe(true);
    expect(sessionMatchesScope(other, 'project', context)).toBe(false);
  });

  it('repo matches on the always-present repoId', () => {
    const context: KillScopeContext = { ...EMPTY_KILL_SCOPE_CONTEXT, repo: { repoId: 'repo-1' } };
    const matching = session({ id: 'a', repoId: 'repo-1' });
    const other = session({ id: 'b', repoId: 'repo-2' });

    expect(sessionMatchesScope(matching, 'repo', context)).toBe(true);
    expect(sessionMatchesScope(other, 'repo', context)).toBe(false);
  });

  it('forgeUser matches on the stamped forgeAccountKey', () => {
    const context: KillScopeContext = { ...EMPTY_KILL_SCOPE_CONTEXT, forgeUser: { forgeAccountKey: 'github:github.com:bilo' } };
    const matching = session({ id: 'a', forgeAccountKey: 'github:github.com:bilo' });
    const other = session({ id: 'b', forgeAccountKey: 'github:github.com:someone-else' });

    expect(sessionMatchesScope(matching, 'forgeUser', context)).toBe(true);
    expect(sessionMatchesScope(other, 'forgeUser', context)).toBe(false);
  });

  it('global matches every session regardless of context', () => {
    expect(sessionMatchesScope(session({ id: 'a' }), 'global', EMPTY_KILL_SCOPE_CONTEXT)).toBe(true);
  });
});

describe('sessionsForScope', () => {
  const states = { live1: 'open', live2: 'idle', ended: 'exited' } as const;

  it('excludes non-live sessions', () => {
    const sessions = [session({ id: 'live1' }), session({ id: 'ended' })];
    const result = sessionsForScope(sessions, states, 'global', EMPTY_KILL_SCOPE_CONTEXT);
    expect(result.map((s) => s.id)).toEqual(['live1']);
  });

  it('excludes a plain shell for every scope but global', () => {
    const context: KillScopeContext = { ...EMPTY_KILL_SCOPE_CONTEXT, repo: { repoId: 'repo-1' } };
    const sessions = [session({ id: 'live1', kind: 'shell', agentId: undefined })];

    expect(sessionsForScope(sessions, states, 'repo', context)).toHaveLength(0);
    expect(sessionsForScope(sessions, states, 'global', EMPTY_KILL_SCOPE_CONTEXT)).toHaveLength(1);
  });

  it('an asleep session never counts, even if otherwise live-looking', () => {
    const sessions = [session({ id: 'live1', asleep: true })];
    expect(sessionsForScope(sessions, states, 'global', EMPTY_KILL_SCOPE_CONTEXT)).toHaveLength(0);
  });
});
