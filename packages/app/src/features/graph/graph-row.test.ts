import { describe, expect, it } from 'vitest';

import {
  commitRecencyTier,
  conventionalPrefix,
  formatDate,
  RECENCY_WINDOW_MS,
} from './graph-row';

describe('conventionalPrefix', () => {
  it('captures type(scope): up to and including the colon', () => {
    expect(conventionalPrefix('feat(graph): dim unselected subjects')).toBe('feat(graph):');
  });

  it('captures a bare type: with no scope', () => {
    expect(conventionalPrefix('fix: handle empty subject')).toBe('fix:');
  });

  it('splits on the first colon only', () => {
    expect(conventionalPrefix('docs: see https://example.com: details')).toBe('docs:');
  });

  it('returns null when there is no colon', () => {
    expect(conventionalPrefix('Bump version to 1.2.3')).toBeNull();
  });

  it('returns null when the colon is the first character', () => {
    expect(conventionalPrefix(':thinking: emoji subject')).toBeNull();
  });
});

describe('commitRecencyTier', () => {
  const now = 1_700_000_000_000; // ms

  const at = (msAgo: number) => Math.floor((now - msAgo) / 1000);

  it('returns "fresh" for commits under 6 minutes old', () => {
    expect(commitRecencyTier(at(30_000), now)).toBe('fresh');
    expect(formatDate(at(30_000), now)).toBe('just now');
    expect(commitRecencyTier(at(359_000), now)).toBe('fresh');
  });

  it('returns "recent" from 6 up to 10 minutes old', () => {
    expect(commitRecencyTier(at(361_000), now)).toBe('recent');
    expect(formatDate(at(361_000), now)).toBe('6m ago');
    expect(commitRecencyTier(at(599_000), now)).toBe('recent');
  });

  it('returns "fading" from 10 up to 20 minutes old', () => {
    expect(commitRecencyTier(at(601_000), now)).toBe('fading');
    expect(formatDate(at(601_000), now)).toBe('10m ago');
    expect(commitRecencyTier(at(1_199_000), now)).toBe('fading');
  });

  it('returns "muted" from 20 up to 30 minutes old', () => {
    expect(commitRecencyTier(at(1_201_000), now)).toBe('muted');
    expect(formatDate(at(1_201_000), now)).toBe('20m ago');
    expect(commitRecencyTier(at(1_799_000), now)).toBe('muted');
  });

  it('returns "normal" at 30 minutes and older', () => {
    expect(commitRecencyTier(at(RECENCY_WINDOW_MS), now)).toBe('normal');
    expect(commitRecencyTier(at(3_600_000), now)).toBe('normal');
    expect(formatDate(at(RECENCY_WINDOW_MS), now)).toBe('30m ago');
  });

  /*
    The tests above resolve `committerDateSeconds` from `msAgo` at second
    precision (git commit dates are whole seconds), so they cannot pin a
    boundary any tighter than a full second either side. These bypass that by
    holding the commit's own timestamp fixed at the epoch and sliding `nowMs`
    instead, which is where the millisecond precision the boundary actually
    lives.
  */
  describe('at the exact millisecond boundary', () => {
    const committedAtEpoch = 0;

    it('flips fresh -> recent at exactly 6 minutes', () => {
      expect(commitRecencyTier(committedAtEpoch, 359_999)).toBe('fresh');
      expect(commitRecencyTier(committedAtEpoch, 360_000)).toBe('recent');
      expect(commitRecencyTier(committedAtEpoch, 360_001)).toBe('recent');
    });

    it('flips recent -> fading at exactly 10 minutes', () => {
      expect(commitRecencyTier(committedAtEpoch, 599_999)).toBe('recent');
      expect(commitRecencyTier(committedAtEpoch, 600_000)).toBe('fading');
      expect(commitRecencyTier(committedAtEpoch, 600_001)).toBe('fading');
    });

    it('flips fading -> muted at exactly 20 minutes', () => {
      expect(commitRecencyTier(committedAtEpoch, 1_199_999)).toBe('fading');
      expect(commitRecencyTier(committedAtEpoch, 1_200_000)).toBe('muted');
      expect(commitRecencyTier(committedAtEpoch, 1_200_001)).toBe('muted');
    });

    it('flips muted -> normal at exactly 30 minutes', () => {
      expect(commitRecencyTier(committedAtEpoch, 1_799_999)).toBe('muted');
      expect(commitRecencyTier(committedAtEpoch, 1_800_000)).toBe('normal');
      expect(commitRecencyTier(committedAtEpoch, 1_800_001)).toBe('normal');
    });
  });
});
