import type { TerminalSession } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import type { ConnectionState } from '../terminal/terminal-store';
import { agentCount } from './agent-count';

const session = (overrides: Partial<TerminalSession> & { id: string }): TerminalSession => ({
  kind: 'shell',
  title: 'repo',
  cwd: '/repo',
  repoId: 'repo-1',
  createdAt: 0,
  ...overrides,
});

describe('agentCount', () => {
  it('is zero with no sessions', () => {
    expect(agentCount([], {}, {})).toBe(0);
  });

  it('is zero when every session is a shell, agents or not', () => {
    const sessions = [session({ id: 'a', kind: 'shell' })];
    expect(agentCount(sessions, { a: 'open' }, {})).toBe(0);
  });

  it('is zero when every agent session has exited', () => {
    const sessions = [session({ id: 'a', kind: 'agent', agentId: 'claude' })];
    const states: Record<string, ConnectionState> = { a: 'exited' };
    expect(agentCount(sessions, states, {})).toBe(0);
  });

  it('counts an agent session that is open or starting', () => {
    const sessions = [
      session({ id: 'a', kind: 'agent', agentId: 'claude' }),
      session({ id: 'b', kind: 'agent', agentId: 'codex' }),
      session({ id: 'c', kind: 'shell' }),
    ];
    const states: Record<string, ConnectionState> = { a: 'open', b: 'starting', c: 'open' };
    expect(agentCount(sessions, states, {})).toBe(2);
  });

  it('does not count a slept agent session', () => {
    const sessions = [
      session({ id: 'a', kind: 'agent', agentId: 'claude', asleep: true }),
      session({ id: 'b', kind: 'agent', agentId: 'codex' }),
    ];
    const states: Record<string, ConnectionState> = { a: 'open', b: 'open' };
    expect(agentCount(sessions, states, {})).toBe(1);
  });

  it('treats a missing state as not live', () => {
    const sessions = [session({ id: 'a', kind: 'agent', agentId: 'claude' })];
    expect(agentCount(sessions, {}, {})).toBe(0);
  });

  /** Phase 30 Theme F: the reported bug, as a unit case. */
  it('counts a plain shell the probe found running an agent', () => {
    const sessions = [session({ id: 's1', kind: 'shell' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    expect(agentCount(sessions, states, { s1: 'claude' })).toBe(1);
  });
});
