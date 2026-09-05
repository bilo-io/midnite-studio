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

  it('returns "fresh" for commits under 2 minutes old', () => {
    expect(commitRecencyTier(at(30_000), now)).toBe('fresh');
    expect(formatDate(at(30_000), now)).toBe('just now');
    expect(commitRecencyTier(at(119_000), now)).toBe('fresh');
  });

  it('returns "recent" from 2 up to 5 minutes old', () => {
    expect(commitRecencyTier(at(121_000), now)).toBe('recent');
    expect(formatDate(at(121_000), now)).toBe('2m ago');
    expect(commitRecencyTier(at(299_000), now)).toBe('recent');
  });

  it('returns "fading" from 5 up to 10 minutes old', () => {
    expect(commitRecencyTier(at(301_000), now)).toBe('fading');
    expect(formatDate(at(301_000), now)).toBe('5m ago');
    expect(commitRecencyTier(at(599_000), now)).toBe('fading');
  });

  it('returns "normal" at 10 minutes and older', () => {
    expect(commitRecencyTier(at(RECENCY_WINDOW_MS), now)).toBe('normal');
    expect(commitRecencyTier(at(3_600_000), now)).toBe('normal');
    expect(formatDate(at(RECENCY_WINDOW_MS), now)).toBe('10m ago');
  });
});
