import type { ForgeIssue } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { pickInitialIssue, relativeAge, sortByUpdated } from './issue-order';

function issue(overrides: Partial<ForgeIssue> = {}): ForgeIssue {
  return {
    id: '',
    number: 1,
    title: 'Something',
    state: 'open',
    author: '',
    labels: [],
    assignees: [],
    updatedAt: '2026-01-01T00:00:00Z',
    createdAt: null,
    url: '',
    milestone: null,
    ...overrides,
  };
}

describe('sortByUpdated', () => {
  it('orders most recently updated first', () => {
    const older = issue({ number: 1, updatedAt: '2026-01-01T00:00:00Z' });
    const newer = issue({ number: 2, updatedAt: '2026-01-03T00:00:00Z' });
    const middle = issue({ number: 3, updatedAt: '2026-01-02T00:00:00Z' });

    expect(sortByUpdated([older, newer, middle]).map((i) => i.number)).toEqual([2, 3, 1]);
  });

  it('does not mutate the input array', () => {
    const list = [issue({ number: 1 }), issue({ number: 2 })];
    const copy = [...list];
    sortByUpdated(list);
    expect(list).toEqual(copy);
  });
});

describe('pickInitialIssue', () => {
  it('picks the most recently updated issue’s number', () => {
    const older = issue({ number: 5, updatedAt: '2026-01-01T00:00:00Z' });
    const newer = issue({ number: 7, updatedAt: '2026-01-05T00:00:00Z' });
    expect(pickInitialIssue([older, newer])).toBe(7);
  });

  it('returns null for an empty list', () => {
    expect(pickInitialIssue([])).toBeNull();
  });
});

describe('relativeAge', () => {
  const now = Date.parse('2026-01-01T01:00:00Z');

  it('reads "just now" under a minute', () => {
    expect(relativeAge('2026-01-01T00:59:45Z', now)).toBe('just now');
  });

  it('reads minutes, then hours, then days', () => {
    expect(relativeAge('2026-01-01T00:30:00Z', now)).toBe('30m ago');
    expect(relativeAge('2025-12-31T23:00:00Z', now)).toBe('2h ago');
    expect(relativeAge('2025-12-29T01:00:00Z', now)).toBe('3d ago');
  });

  it('returns an empty string for an unparseable timestamp', () => {
    expect(relativeAge('not-a-date', now)).toBe('');
  });
});
