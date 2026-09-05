import { describe, expect, it } from 'vitest';

import { commitRecencyTier, conventionalPrefix, formatDate } from './graph-row';

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

  it('returns "just-now" for commits under 60 seconds old', () => {
    const committerSec = Math.floor((now - 30_000) / 1000);
    expect(commitRecencyTier(committerSec, now)).toBe('just-now');
    expect(formatDate(committerSec, now)).toBe('just now');
  });

  it('returns "one-min" for commits between 60 and 120 seconds old', () => {
    const committerSec = Math.floor((now - 75_000) / 1000);
    expect(commitRecencyTier(committerSec, now)).toBe('one-min');
    expect(formatDate(committerSec, now)).toBe('1m ago');
  });

  it('returns "normal" for commits >= 120 seconds old', () => {
    const committerSec = Math.floor((now - 130_000) / 1000);
    expect(commitRecencyTier(committerSec, now)).toBe('normal');
    expect(formatDate(committerSec, now)).toBe('2m ago');
  });
});

