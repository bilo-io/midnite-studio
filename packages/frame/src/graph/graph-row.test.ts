import { describe, expect, it } from 'vitest';

import {
  commitRecencyTier,
  conventionalPrefix,
  formatDate,
  RECENCY_TIER_FRACTIONS,
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

  const MIN = 60_000;

  it('returns "fresh" for commits under 12 minutes old', () => {
    expect(commitRecencyTier(at(30_000), now)).toBe('fresh');
    expect(formatDate(at(30_000), now)).toBe('just now');
    expect(commitRecencyTier(at(12 * MIN - 1_000), now)).toBe('fresh');
  });

  it('returns "recent" from 12 up to 20 minutes old', () => {
    expect(commitRecencyTier(at(12 * MIN + 1_000), now)).toBe('recent');
    expect(formatDate(at(12 * MIN + 1_000), now)).toBe('12m ago');
    expect(commitRecencyTier(at(20 * MIN - 1_000), now)).toBe('recent');
  });

  it('returns "fading" from 20 up to 40 minutes old', () => {
    expect(commitRecencyTier(at(20 * MIN + 1_000), now)).toBe('fading');
    expect(formatDate(at(20 * MIN + 1_000), now)).toBe('20m ago');
    expect(commitRecencyTier(at(40 * MIN - 1_000), now)).toBe('fading');
  });

  it('returns "muted" from 40 up to 60 minutes old', () => {
    expect(commitRecencyTier(at(40 * MIN + 1_000), now)).toBe('muted');
    expect(formatDate(at(40 * MIN + 1_000), now)).toBe('40m ago');
    expect(commitRecencyTier(at(60 * MIN - 1_000), now)).toBe('muted');
  });

  it('returns "normal" at 60 minutes and older', () => {
    expect(commitRecencyTier(at(RECENCY_WINDOW_MS), now)).toBe('normal');
    expect(commitRecencyTier(at(2 * RECENCY_WINDOW_MS), now)).toBe('normal');
  });

  it('keeps the original proportions of the window (1/5, 1/3, 2/3, 1)', () => {
    expect(RECENCY_WINDOW_MS).toBe(60 * MIN);
    expect(RECENCY_TIER_FRACTIONS.fresh).toBeCloseTo(0.2);
    expect(RECENCY_TIER_FRACTIONS.recent).toBeCloseTo(1 / 3);
    expect(RECENCY_TIER_FRACTIONS.fading).toBeCloseTo(2 / 3);
    expect(RECENCY_TIER_FRACTIONS.muted).toBe(1);
    // The old 6/10/20/30 minute boundaries over a 30 minute window, ratio for ratio.
    const old = [6, 10, 20, 30].map((m) => m / 30);
    const now_ = Object.values(RECENCY_TIER_FRACTIONS);
    now_.forEach((f, i) => expect(f).toBeCloseTo(old[i]!));
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

    it('flips fresh -> recent at exactly 12 minutes', () => {
      expect(commitRecencyTier(committedAtEpoch, 12 * MIN - 1)).toBe('fresh');
      expect(commitRecencyTier(committedAtEpoch, 12 * MIN)).toBe('recent');
      expect(commitRecencyTier(committedAtEpoch, 12 * MIN + 1)).toBe('recent');
    });

    it('flips recent -> fading at exactly 20 minutes', () => {
      expect(commitRecencyTier(committedAtEpoch, 20 * MIN - 1)).toBe('recent');
      expect(commitRecencyTier(committedAtEpoch, 20 * MIN)).toBe('fading');
      expect(commitRecencyTier(committedAtEpoch, 20 * MIN + 1)).toBe('fading');
    });

    it('flips fading -> muted at exactly 40 minutes', () => {
      expect(commitRecencyTier(committedAtEpoch, 40 * MIN - 1)).toBe('fading');
      expect(commitRecencyTier(committedAtEpoch, 40 * MIN)).toBe('muted');
      expect(commitRecencyTier(committedAtEpoch, 40 * MIN + 1)).toBe('muted');
    });

    it('flips muted -> normal at exactly 60 minutes', () => {
      expect(commitRecencyTier(committedAtEpoch, 60 * MIN - 1)).toBe('muted');
      expect(commitRecencyTier(committedAtEpoch, 60 * MIN)).toBe('normal');
      expect(commitRecencyTier(committedAtEpoch, 60 * MIN + 1)).toBe('normal');
    });
  });
});
