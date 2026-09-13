import type { ClosedSession, TerminalSession } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  groupSessionsByRepo,
  isClosedManagedSession,
  mergeManagedSessions,
  pickInitialClosedSession,
} from './session-order';

function closed(overrides: Partial<ClosedSession> & Pick<ClosedSession, 'id' | 'repoId' | 'title' | 'createdAt' | 'closedAt'>): ClosedSession {
  return {
    kind: 'shell',
    cwd: '/repo',
    exitCode: null,
    reason: 'closed',
    transcriptBytes: 0,
    ...overrides,
  };
}

function live(overrides: Partial<TerminalSession> & Pick<TerminalSession, 'id' | 'repoId' | 'title' | 'createdAt'>): TerminalSession {
  return {
    kind: 'shell',
    cwd: '/repo',
    ...overrides,
  };
}

describe('mergeManagedSessions', () => {
  it('puts every live row first, then every closed row, in each source order', () => {
    const merged = mergeManagedSessions(
      [live({ id: 'l1', repoId: 'r1', title: 'repo', createdAt: 1 }), live({ id: 'l2', repoId: 'r1', title: 'repo', createdAt: 2 })],
      [closed({ id: 'c1', repoId: 'r1', title: 'repo', createdAt: 1, closedAt: 2 })],
    );

    expect(merged.map((s) => s.id)).toEqual(['l1', 'l2', 'c1']);
  });

  it('derives liveness from TerminalSession.asleep rather than storing it twice', () => {
    const merged = mergeManagedSessions(
      [
        live({ id: 'running', repoId: 'r1', title: 'repo', createdAt: 1 }),
        live({ id: 'sleeping', repoId: 'r1', title: 'repo', createdAt: 1, asleep: true }),
      ],
      [],
    );

    expect(merged.find((s) => s.id === 'running')?.liveness).toBe('running');
    expect(merged.find((s) => s.id === 'sleeping')?.liveness).toBe('asleep');
  });

  it('tags every closed row liveness: closed', () => {
    const merged = mergeManagedSessions([], [closed({ id: 'c1', repoId: 'r1', title: 'repo', createdAt: 1, closedAt: 2 })]);
    expect(merged[0]?.liveness).toBe('closed');
  });

  it('produces a closed row still shaped like a plain ClosedSession', () => {
    const record = closed({ id: 'c1', repoId: 'r1', title: 'repo', createdAt: 1, closedAt: 2, reason: 'exited' });
    const [merged] = mergeManagedSessions([], [record]);
    expect(isClosedManagedSession(merged!)).toBe(true);
    if (isClosedManagedSession(merged!)) {
      // Assignable to ClosedSession everywhere one is expected (purge,
      // the transcript view) — the extra `liveness` tag is structurally inert.
      const asPlain: ClosedSession = merged;
      expect(asPlain.reason).toBe('exited');
    }
  });

  it('preserves agentConversationId on both live and closed rows', () => {
    const merged = mergeManagedSessions(
      [live({ id: 'l1', repoId: 'r1', title: 'repo', createdAt: 1, agentConversationId: 'live-uuid' })],
      [closed({ id: 'c1', repoId: 'r1', title: 'repo', createdAt: 1, closedAt: 2, agentConversationId: 'closed-uuid' })],
    );

    expect(merged.find((s) => s.id === 'l1')?.agentConversationId).toBe('live-uuid');
    expect(merged.find((s) => s.id === 'c1')?.agentConversationId).toBe('closed-uuid');
  });
});

describe('groupSessionsByRepo (merged)', () => {
  it('sorts live rows above closed rows within one repo group', () => {
    const rows = mergeManagedSessions(
      [live({ id: 'l1', repoId: 'r1', title: 'repo-one', createdAt: 1 })],
      [
        closed({ id: 'c1', repoId: 'r1', title: 'repo-one', createdAt: 1, closedAt: 999 }),
        closed({ id: 'c2', repoId: 'r1', title: 'repo-one', createdAt: 1, closedAt: 1 }),
      ],
    );

    const [group] = groupSessionsByRepo(rows);
    expect(group?.sessions.map((s) => s.id)).toEqual(['l1', 'c1', 'c2']);
  });

  it('preserves newest-first ordering among closed rows in a group', () => {
    const rows = mergeManagedSessions(
      [],
      [
        closed({ id: 'older', repoId: 'r1', title: 'repo-one', createdAt: 1, closedAt: 1000 }),
        closed({ id: 'newer', repoId: 'r1', title: 'repo-one', createdAt: 1, closedAt: 2000 }),
      ],
    );

    const [group] = groupSessionsByRepo(rows);
    expect(group?.sessions.map((s) => s.id)).toEqual(['newer', 'older']);
  });

  it('ranks a repo group with a live/asleep row above one that is entirely closed', () => {
    const rows = mergeManagedSessions(
      [live({ id: 'l1', repoId: 'r-live', title: 'live-repo', createdAt: 1 })],
      [closed({ id: 'c1', repoId: 'r-closed', title: 'closed-repo', createdAt: 1, closedAt: 999_999 })],
    );

    const groups = groupSessionsByRepo(rows);
    expect(groups.map((g) => g.repoId)).toEqual(['r-live', 'r-closed']);
  });

  it('falls back to newest-closed-member ordering when no group has a live row', () => {
    const rows = mergeManagedSessions(
      [],
      [
        closed({ id: 'a', repoId: 'r1', title: 'repo-one', createdAt: 1, closedAt: 1000 }),
        closed({ id: 'b', repoId: 'r2', title: 'repo-two', createdAt: 1, closedAt: 5000 }),
      ],
    );

    const groups = groupSessionsByRepo(rows);
    expect(groups.map((g) => g.repoId)).toEqual(['r2', 'r1']);
  });

  it('keeps a session that transitions from running to closed under the same id', () => {
    const record = closed({ id: 'sess-1', repoId: 'r1', title: 'repo-one', createdAt: 1, closedAt: 500 });

    const whileRunning = mergeManagedSessions([live({ id: 'sess-1', repoId: 'r1', title: 'repo-one', createdAt: 1 })], []);
    const afterClosing = mergeManagedSessions([], [record]);

    expect(whileRunning[0]?.id).toBe('sess-1');
    expect(whileRunning[0]?.liveness).not.toBe('closed');
    expect(afterClosing[0]?.id).toBe('sess-1');
    expect(afterClosing[0]?.liveness).toBe('closed');
  });
});

describe('pickInitialClosedSession (unchanged for the closed subset)', () => {
  it('still honours a stored id that is present in the closed rows', () => {
    const rows = [closed({ id: 'a', repoId: 'r1', title: 'repo', createdAt: 1, closedAt: 10 })];
    expect(pickInitialClosedSession(rows, 'a')).toBe('a');
  });

  it('falls back to the newest closed row when the stored id is gone', () => {
    const rows = [
      closed({ id: 'a', repoId: 'r1', title: 'repo', createdAt: 1, closedAt: 10 }),
      closed({ id: 'b', repoId: 'r1', title: 'repo', createdAt: 1, closedAt: 20 }),
    ];
    expect(pickInitialClosedSession(rows, 'gone')).toBe('b');
  });
});
