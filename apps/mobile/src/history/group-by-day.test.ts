import type { Commit } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';
import { buildTimeline, dayLabel, formatDateTime, groupByDay, isMerge, relativeTime, shortSha } from './group-by-day';

// Local-time constructors so the tests hold in any timezone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0);
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const commit = (sha: string, date: Date, parents = ['p']): Commit => ({
  sha,
  parents,
  authorName: 'A',
  authorEmail: 'a@x',
  authorDate: unix(date),
  committerDate: unix(date),
  subject: `s ${sha}`,
  refs: [],
  coAuthors: [],
  sessionTrailers: [],
});

const now = at(2026, 11, 19, 15);

describe('dayLabel', () => {
  it('names today and yesterday, then weekday day month', () => {
    expect(dayLabel(at(2026, 11, 19, 1), now)).toBe('Today');
    expect(dayLabel(at(2026, 11, 18, 23), now)).toBe('Yesterday');
    expect(dayLabel(at(2026, 11, 11), now)).toBe('Wed 11 Nov');
  });
  it('handles a month boundary for yesterday', () => {
    expect(dayLabel(at(2026, 10, 31), at(2026, 11, 1, 9))).toBe('Yesterday');
  });
});

describe('groupByDay', () => {
  it('groups consecutive commits by local day, keeping order', () => {
    const sections = groupByDay(
      [commit('a', at(2026, 11, 19, 14)), commit('b', at(2026, 11, 19, 9)), commit('c', at(2026, 11, 18, 20)), commit('d', at(2026, 11, 3))],
      now,
    );
    expect(sections.map((s) => [s.label, s.commits.map((c) => c.sha)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['Tue 3 Nov', ['d']],
    ]);
  });
  it('is empty for no commits', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('buildTimeline', () => {
  it('marks the head and ends the rail only on the last page', () => {
    const commits = [commit('a', at(2026, 11, 19, 14)), commit('b', at(2026, 11, 18))];
    const flat = (hasMore: boolean) => buildTimeline(commits, now, hasMore).filter((e) => e.kind === 'commit');
    expect(flat(true).map((e) => e.kind === 'commit' && [e.isHead, e.isLast])).toEqual([[true, false], [false, false]]);
    expect(flat(false).map((e) => e.kind === 'commit' && [e.isHead, e.isLast])).toEqual([[true, false], [false, true]]);
    expect(buildTimeline(commits, now, false).map((e) => e.kind)).toEqual(['header', 'commit', 'header', 'commit']);
  });
});

describe('small helpers', () => {
  it('detects merges by parent count', () => {
    expect(isMerge({ parents: ['a', 'b'] })).toBe(true);
    expect(isMerge({ parents: ['a'] })).toBe(false);
    expect(isMerge({ parents: [] })).toBe(false);
  });
  it('formats a full local date', () => expect(formatDateTime(unix(at(2026, 11, 11, 14)))).toBe('Wed 11 Nov 2026, 14:00'));
  it('shortens shas to seven', () => expect(shortSha('0123456789abcdef')).toBe('0123456'));
  it('formats relative time', () => {
    const t = (secondsAgo: number) => relativeTime(unix(now) - secondsAgo, now);
    expect([t(5), t(300), t(7200), t(3 * 86400), t(14 * 86400), t(90 * 86400), t(800 * 86400)]).toEqual([
      'now', '5m', '2h', '3d', '2w', '3mo', '2y',
    ]);
  });
});
