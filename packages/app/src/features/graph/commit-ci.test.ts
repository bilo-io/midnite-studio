import { ForgeRunSchema, type ForgeCommitRunsResult, type ForgeRun } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { LuBan, LuCheck, LuClock, LuLoaderCircle, LuMinus, LuSkipForward, LuX } from 'react-icons/lu';

import { runStatus } from '../forge/forge-status';
import {
  CI_OVERSCAN,
  CI_PAGE_SIZE,
  CI_POLL_MS,
  ciPollInterval,
  commitCiBySha,
  pageIsActive,
  visibleCiPages,
} from './commit-ci';

const shaFor = (index: number) => index.toString(16).padStart(40, '0');
const shaAt = (index: number) => shaFor(index);

const run = (headSha: string, over: Partial<ForgeRun> = {}): ForgeRun =>
  ForgeRunSchema.parse({
    id: '1',
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    headSha,
    createdAt: '2026-09-01T10:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
    ...over,
  });

const result = (runs: Record<string, ForgeRun[]>): ForgeCommitRunsResult => ({
  cli: { reason: 'ready', binPath: null, hint: '' },
  runs,
  error: null,
});

describe('visibleCiPages', () => {
  it('asks for nothing before the viewport is known', () => {
    expect(visibleCiPages(shaAt, 50_000, null)).toEqual([]);
    expect(visibleCiPages(shaAt, 0, { startIndex: 0, endIndex: 10 })).toEqual([]);
  });

  it('covers only the visible rows plus overscan in a 50k-commit history', () => {
    const pages = visibleCiPages(shaAt, 50_000, { startIndex: 30_010, endIndex: 30_040 });
    const all = pages.flat();
    // Two aligned pages — never 50 000 lookups, never a page per scrolled row.
    expect(pages).toHaveLength(2);
    expect(all.length).toBe(2 * CI_PAGE_SIZE);
    expect(all).toContain(shaFor(30_010 - CI_OVERSCAN));
    expect(all).toContain(shaFor(30_040 + CI_OVERSCAN));
    expect(pages.every((page) => page.length <= 50)).toBe(true);
  });

  it('keeps the same page keys across a scroll of a few rows', () => {
    const before = visibleCiPages(shaAt, 1_000, { startIndex: 100, endIndex: 120 });
    const after = visibleCiPages(shaAt, 1_000, { startIndex: 103, endIndex: 123 });
    expect(after).toEqual(before);
  });

  it('clamps overscan at both ends of the history', () => {
    const top = visibleCiPages(shaAt, 12, { startIndex: 0, endIndex: 11 });
    expect(top).toEqual([Array.from({ length: 12 }, (_, i) => shaFor(i))]);
  });
});

describe('ciPollInterval', () => {
  const active = result({ [shaFor(1)]: [run(shaFor(1), { status: 'in_progress', conclusion: null })] });
  const queued = result({ [shaFor(1)]: [run(shaFor(1), { status: 'queued', conclusion: null })] });
  const settled = result({ [shaFor(1)]: [run(shaFor(1))], [shaFor(2)]: [] });

  it('polls a page only while something on it is queued or running', () => {
    expect(ciPollInterval(active, true)).toBe(CI_POLL_MS);
    expect(ciPollInterval(queued, true)).toBe(CI_POLL_MS);
    expect(ciPollInterval(settled, true)).toBe(false);
    expect(ciPollInterval(undefined, true)).toBe(false);
  });

  it('never polls through a closed gate — blurred, hidden or off-screen', () => {
    expect(ciPollInterval(active, false)).toBe(false);
  });

  it('reads activity off the runs, not the page', () => {
    expect(pageIsActive(active)).toBe(true);
    expect(pageIsActive(settled)).toBe(false);
  });
});

describe('commitCiBySha', () => {
  it('aggregates each commit and leaves commits with no CI out', () => {
    const map = commitCiBySha([
      result({
        [shaFor(1)]: [run(shaFor(1), { name: 'a', conclusion: 'failure' }), run(shaFor(1), { id: '2', name: 'b' })],
        [shaFor(2)]: [],
      }),
      undefined,
    ]);
    expect(map.get(shaFor(1))?.representative.conclusion).toBe('failure');
    expect(map.has(shaFor(2))).toBe(false);
  });
});

describe('the column uses the Actions page glyphs', () => {
  // The seven states the column draws, through the one shared mapping.
  const cases: Array<[Partial<ForgeRun>, unknown, string]> = [
    [{ status: 'queued', conclusion: null }, LuClock, 'Queued'],
    [{ status: 'in_progress', conclusion: null }, LuLoaderCircle, 'Running'],
    [{ conclusion: 'success' }, LuCheck, 'Passed'],
    [{ conclusion: 'failure' }, LuX, 'Failed'],
    [{ conclusion: 'cancelled' }, LuBan, 'Cancelled'],
    [{ conclusion: 'skipped' }, LuSkipForward, 'Skipped'],
    [{ conclusion: 'neutral' }, LuMinus, 'Neutral'],
  ];
  it.each(cases)('%o → the same icon and word as the run list', (over, icon, label) => {
    const ci = commitCiBySha([result({ [shaFor(1)]: [run(shaFor(1), over)] })]).get(shaFor(1));
    expect(ci).toBeDefined();
    const status = runStatus(ci!.representative);
    expect(status.icon).toBe(icon);
    expect(status.label).toBe(label);
  });
});
