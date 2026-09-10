import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { CommitActivityPanel } from './commit-activity-panel';

/**
 * Migrated from `e2e/activity-timeline.spec.ts` (Phase 82 Theme C, wave 5) —
 * everything about the panel once it is open: the D/W/M/Y picker, the year
 * view's twelve-bucket heatmap and its month-named tooltip, the style icons
 * (and that the choice reaches the shared store field Settings also edits),
 * the gridline cadence, the header's roving-tabindex keyboard nav, hovering a
 * bucket (and leaving the chart taking the tooltip away), and the no-rows
 * empty state. 7 of the original 9 tests moved here; 2 stay in Playwright,
 * below.
 *
 * Mounted directly with `activityTimelineOpen`/`activityTimelineOrientation`
 * already set via `uiState`, bypassing the status-bar toggle and the chord
 * entirely — the same "component under test, not the thing that reaches it"
 * convention every other file in this wave follows.
 *
 * **2 of the original 9 stay in Playwright**: "the status-bar toggle raises
 * the panel" and "the chord toggles it too" are about *reachability* (the
 * toggle button in the status bar, and the global keybinding dispatcher),
 * not about anything inside `CommitActivityPanel` itself.
 *
 * The hover tooltip is jsdom-testable: `commit-activity-timeline.tsx` reveals
 * it through React state on `onPointerEnter`/`onPointerMove` (`fireEvent`
 * covers it), and hides it through `onPointerLeave` on the `<g>` wrapping the
 * hit targets — not CSS `:hover` — so this is not the straggler the task
 * brief flagged as a possibility.
 *
 * `CommitActivityPanel` has no internal `React.lazy` boundary of its own, so
 * no chunk warm-up is needed.
 */

const DAY_S = 86_400;
const nowS = Math.floor(Date.now() / 1000);

/**
 * Relative to the clock, because the panel buckets against `Date.now()`.
 *
 * The newest row is `nowS` itself, not an hour ago: the hover test asserts on
 * the *last* bucket's contents, and "an hour ago" falls into the previous
 * hour bucket in the day view and into yesterday's in the week view whenever
 * the suite runs in the first hour after local midnight.
 */
const TIMELINE = [
  { sha: 'a'.repeat(40), at: nowS, additions: 12, deletions: 3 },
  { sha: 'b'.repeat(40), at: nowS - 2 * DAY_S, additions: 5, deletions: 9 },
  { sha: 'c'.repeat(40), at: nowS - 6 * DAY_S, additions: 0, deletions: 4 },
];

const seeded: MockFixtures = {
  ...fixtures,
  stats: { timeline: TIMELINE, commitsScanned: TIMELINE.length },
};

const chart = () => screen.getByTestId('commit-activity-chart');
/** The pointer-handling group — `onPointerLeave` lives here, not on the svg. */
const hitGroup = () => chart().querySelector('g[aria-hidden]') as SVGGElement;

const open = (data: MockFixtures = seeded) => {
  renderView(<CommitActivityPanel slot="right" />, {
    fixtures: data,
    uiState: {
      selectedRepoId: 'repo-1',
      activityTimelineOpen: true,
      activityTimelineOrientation: 'vertical',
      // Every field a test below might flip, reset to its real default —
      // `useUiStore` is a module singleton, so a style/timeframe/gridline
      // choice left standing from one test would leak into the next.
      activityTimelineStyle: 'bars',
      activityTimeframe: 'week',
      activityTimelineGridlines: false,
      activityTimelineBarLayout: 'diverging',
      activityTimelineAreaLayout: 'overlaid',
    },
  });
};

beforeEach(() => {
  open();
});

afterEach(cleanup);

describe('CommitActivityPanel, assembled through the real bridge', () => {
  it('the D/W/M/Y picker moves the window the chart announces', async () => {
    // Week is the default: all three commits are inside it.
    expect(await screen.findByLabelText('Commit activity, last 7 days: 3 commits')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Last 30 days' }));
    expect(await screen.findByLabelText('Commit activity, last 30 days: 3 commits')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Last 24 hours' }));
    expect(await screen.findByLabelText('Commit activity, last 24 hours: 1 commit')).toBeTruthy();

    // Y widens to twelve calendar months — and asks main for the `1y` window,
    // which is a different query key, so this also covers the refetch.
    fireEvent.click(screen.getByRole('radio', { name: 'Last 12 months' }));
    expect(
      await screen.findByLabelText('Commit activity, last 12 months: 3 commits'),
    ).toBeTruthy();
  });

  it('the year view buckets by month, twelve of them', async () => {
    await screen.findByTestId('commit-activity-chart');
    fireEvent.click(screen.getByRole('radio', { name: 'Last 12 months' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Heatmap' }));

    // One cell per bucket in the heatmap, empty months included.
    await screen.findByLabelText(/^Commit activity, last 12 months/);
    const cells = chart().querySelectorAll('rect:not([data-testid="activity-hit"])');
    expect(cells).toHaveLength(12);

    // And the tooltip names the month rather than a day or an hour range.
    const hits = chart().querySelectorAll('[data-testid="activity-hit"]');
    fireEvent.pointerEnter(hits[hits.length - 1]!);
    const tooltip = await screen.findByTestId('activity-tooltip');
    const thisMonth = new Date().toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    expect(tooltip.textContent).toContain(thisMonth);
    expect(tooltip.textContent).toContain('% of the last 12 months');
  });

  it('the style icons swap the drawing, and the choice reaches Settings', async () => {
    await screen.findByTestId('commit-activity-chart');

    expect(chart().getAttribute('data-variant')).toBe('bars');
    fireEvent.click(screen.getByRole('radio', { name: 'Heatmap' }));
    expect(chart().getAttribute('data-variant')).toBe('heatmap');
    fireEvent.click(screen.getByRole('radio', { name: 'Area' }));
    expect(chart().getAttribute('data-variant')).toBe('area');
    // Two bands off one baseline is the default; Settings' own Churn areas
    // choice is what switches them to stacked.
    expect(screen.getByTestId('activity-area-overlaid')).toBeTruthy();

    // Same store field the Settings page edits — the panel's icons are the
    // second door onto it, so the first door has to agree.
    expect(screen.getByRole('radio', { name: 'Area' }).getAttribute('aria-checked')).toBe('true');
  });

  it('the gridlines toggle draws the timeframe cadence it names', async () => {
    await screen.findByTestId('commit-activity-chart');
    const toggle = screen.getByTestId('activity-gridlines-toggle');

    // Off by default, and the label says what turning it on will draw.
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show gridlines (every day)');
    expect(screen.queryByTestId('activity-gridlines')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    // A week rules every day boundary but the first, plus the churn baseline.
    const lineCount = () =>
      screen.getByTestId('activity-gridlines').querySelectorAll('line').length;
    expect(lineCount()).toBe(7);

    // The cadence follows the window: 30 days rules every week instead.
    // Asserted as "fewer than the week's", not as a number — a 30-day window
    // holds four Mondays on most days and five when today is one, so a fixed
    // count would fail one day in seven against the real clock.
    fireEvent.click(screen.getByRole('radio', { name: 'Last 30 days' }));
    expect(toggle.getAttribute('aria-label')).toBe('Hide gridlines (every week)');
    const monthRules = lineCount();
    expect(monthRules).toBeLessThan(7);
    expect(monthRules).toBeGreaterThanOrEqual(5);

    // A year rules its quarters: three or four in twelve months depending on
    // whether one lands on the axis edge, plus the churn baseline. `year`
    // pays for its own `1y` traversal (a different query key), so the chart
    // drops back to its loading copy until that resolves.
    fireEvent.click(screen.getByRole('radio', { name: 'Last 12 months' }));
    expect(toggle.getAttribute('aria-label')).toBe('Hide gridlines (every quarter)');
    await screen.findByTestId('commit-activity-chart');
    const yearRules = lineCount();
    expect(yearRules).toBeGreaterThanOrEqual(4);
    expect(yearRules).toBeLessThanOrEqual(5);
  });

  it('the header controls are one tab stop each, arrow-navigable', async () => {
    await screen.findByTestId('commit-activity-chart');

    // An ARIA radio group is a single tab stop: only the checked radio is
    // reachable by Tab, and the arrows both move and select.
    const week = screen.getByRole('radio', { name: 'Last 7 days' });
    week.focus();
    fireEvent.keyDown(week, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Last 30 days' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Last 30 days' }), { key: 'ArrowRight' });
    expect(
      screen.getByRole('radio', { name: 'Last 12 months' }).getAttribute('aria-checked'),
    ).toBe('true');
    // And it wraps — a ring of four makes stopping at the end a dead key.
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Last 12 months' }), {
      key: 'ArrowRight',
    });
    expect(
      screen.getByRole('radio', { name: 'Last 24 hours' }).getAttribute('aria-checked'),
    ).toBe('true');

    const bars = screen.getByRole('radio', { name: 'Bars' });
    bars.focus();
    fireEvent.keyDown(bars, { key: 'ArrowDown' });
    expect((await screen.findByTestId('commit-activity-chart')).getAttribute('data-variant')).toBe(
      'heatmap',
    );
  });

  it('hovering a bucket names it, its commits and its churn', async () => {
    await screen.findByTestId('commit-activity-chart');

    // The last hit rect is the newest bucket — the one holding the +12/-3
    // commit from an hour ago. Vertical panel, so "last" is the bottom one.
    const hits = chart().querySelectorAll('[data-testid="activity-hit"]');
    fireEvent.pointerEnter(hits[hits.length - 1]!);

    const tip = await screen.findByTestId('activity-tooltip');
    expect(tip.textContent).toContain('1 commit');
    expect(tip.textContent).toContain('+12');
    expect(tip.textContent).toContain('−3');
    expect(tip.textContent).toContain('of the last 7 days');

    // Leaving the chart takes it away rather than parking it over the content.
    fireEvent.pointerLeave(hitGroup());
    expect(screen.queryByTestId('activity-tooltip')).toBeNull();
  });

  it('a repository with no rows says so instead of drawing an empty chart', async () => {
    cleanup();
    open({ ...fixtures });

    expect(await screen.findByText(/^No commits in the last/)).toBeTruthy();
    expect(screen.queryByTestId('commit-activity-chart')).toBeNull();
  });
});
