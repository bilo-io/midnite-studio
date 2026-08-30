import type { AgentDefinition, TerminalSession } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import type { ConnectionState } from '../../terminal/terminal-store';
import { activityRows } from './terminal-page';

const session = (overrides: Partial<TerminalSession> & { id: string }): TerminalSession => ({
  kind: 'shell',
  title: 'repo',
  cwd: '/repo',
  repoId: 'repo-1',
  createdAt: 0,
  ...overrides,
});

const agent = (overrides: Partial<AgentDefinition> & { id: string }): AgentDefinition => ({
  label: overrides.id,
  command: overrides.id,
  args: [],
  accent: '#000000',
  ...overrides,
});

describe('activityRows', () => {
  it('is empty with no sessions', () => {
    expect(activityRows([], {}, {}, {}, {}, [], 0)).toEqual([]);
  });

  it('excludes a plain shell and an exited agent session', () => {
    const sessions = [
      session({ id: 'a', kind: 'shell' }),
      session({ id: 'b', kind: 'agent', agentId: 'claude' }),
    ];
    const states: Record<string, ConnectionState> = { a: 'open', b: 'exited' };
    expect(activityRows(sessions, states, {}, {}, {}, [], 0)).toEqual([]);
  });

  it('includes a plain shell the probe found running an agent', () => {
    const sessions = [session({ id: 's1', kind: 'shell', title: 'repo' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'claude', label: 'Claude', activity: { thinking: 't', frameEnd: 'f' } })];

    const rows = activityRows(sessions, states, {}, {}, { s1: 'claude' }, agents, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Claude');
  });

  it('reports "no detector" for an agent with no marker set', () => {
    const sessions = [session({ id: 's1', kind: 'agent', agentId: 'codex' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'codex', label: 'Codex' })];

    const rows = activityRows(sessions, states, {}, {}, {}, agents, 0);
    expect(rows[0]?.activity).toBe('no detector');
    expect(rows[0]?.lastSeenSecondsAgo).toBeNull();
  });

  it('reports "unknown" for an agent with a detector that has not spoken', () => {
    const sessions = [session({ id: 's1', kind: 'agent', agentId: 'claude' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'claude', activity: { thinking: 't', frameEnd: 'f' } })];

    const rows = activityRows(sessions, states, {}, {}, {}, agents, 0);
    expect(rows[0]?.activity).toBe('unknown');
  });

  it('reports the real guess and how long ago it was set', () => {
    const sessions = [session({ id: 's1', kind: 'agent', agentId: 'claude' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'claude', activity: { thinking: 't', frameEnd: 'f' } })];

    const rows = activityRows(
      sessions,
      states,
      { s1: 'thinking' },
      { s1: 7_000 },
      {},
      agents,
      10_000,
    );
    expect(rows[0]?.activity).toBe('thinking');
    expect(rows[0]?.lastSeenSecondsAgo).toBe(3);
  });

  it('preserves session-list order rather than most-recently-active-first', () => {
    const sessions = [
      session({ id: 'a', kind: 'agent', agentId: 'claude' }),
      session({ id: 'b', kind: 'agent', agentId: 'claude' }),
    ];
    const states: Record<string, ConnectionState> = { a: 'open', b: 'open' };
    const agents = [agent({ id: 'claude', activity: { thinking: 't', frameEnd: 'f' } })];

    // b was seen more recently than a, but the order must not change for it.
    const rows = activityRows(
      sessions,
      states,
      { a: 'idle', b: 'thinking' },
      { a: 1, b: 9 },
      {},
      agents,
      10,
    );
    expect(rows.map((r) => r.sessionId)).toEqual(['a', 'b']);
  });
});
