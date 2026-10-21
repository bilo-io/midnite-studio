import { describe, expect, it } from 'vitest';

import { absoluteTime, formatRelativeTime } from './relative-time';

const NOW = 1_700_000_000_000;
const ago = (s: number) => NOW / 1000 - s;

describe('formatRelativeTime', () => {
  it('is granular below a day', () => {
    expect(formatRelativeTime(ago(10), NOW)).toBe('just now');
    expect(formatRelativeTime(ago(12 * 60 + 5), NOW)).toBe('12m ago');
    expect(formatRelativeTime(ago(3 * 3600 + 60), NOW)).toBe('3h ago');
  });
  it('falls back to day/week/month/year widths', () => {
    expect(formatRelativeTime(ago(2 * 86400), NOW)).toBe('2d');
    expect(formatRelativeTime(ago(14 * 86400), NOW)).toBe('2w');
    expect(formatRelativeTime(ago(90 * 86400), NOW)).toBe('3mo');
    expect(formatRelativeTime(ago(800 * 86400), NOW)).toBe('2y');
  });
  it('clamps future times', () => {
    expect(formatRelativeTime(ago(-500), NOW)).toBe('just now');
  });
  it('formats an absolute time', () => {
    expect(absoluteTime(0)).toContain('19');
  });
});
