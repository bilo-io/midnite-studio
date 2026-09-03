import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Every `<rect>` that is a mark rather than a hover target.
 *
 * The hit layer lays one transparent rect per bucket over the drawing, so a
 * bare `querySelectorAll('rect')` now counts each bucket twice.
 */
const marks = (container: HTMLElement) =>
  container.querySelectorAll('rect:not([data-testid="activity-hit"])');

/**
 * A pointer move at a known viewport position.
 *
 * jsdom ships no `PointerEvent`, so RTL's `fireEvent.pointerMove` falls back to
 * a plain `Event` and silently drops `clientX`/`clientY` — which the tooltip
 * positions from. A `MouseEvent` named `pointermove` carries both and is what
 * React's `onPointerMove` is listening for anyway.
 */
const hover = (target: Element, x = 100, y = 100) =>
  fireEvent(target, new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));

import type { CommitActivity } from './activity-buckets';
import { CommitActivityTimeline } from './commit-activity-timeline';

const NOW = new Date(2026, 8, 3, 14, 30).getTime();

const commits: CommitActivity[] = [
  {
    sha: 'a',
    timestamp: Math.floor(new Date(2026, 8, 3, 10).getTime() / 1000),
    additions: 10,
    deletions: 4,
  },
  {
    sha: 'b',
    timestamp: Math.floor(new Date(2026, 8, 1, 10).getTime() / 1000),
    additions: 0,
    deletions: 9,
  },
];

/** The tooltip portals to `<body>`, which RTL does not clear between renders. */
afterEach(() => {
  document.body.querySelectorAll('[data-testid="activity-tooltip"]').forEach((el) => el.remove());
});

describe('CommitActivityTimeline', () => {
  it('draws churn bars split into additions and deletions', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" variant="bars" now={NOW} />,
    );
    expect(container.querySelectorAll('rect.text-emerald-500')).toHaveLength(1);
    expect(container.querySelectorAll('rect.text-rose-500')).toHaveLength(2);
  });

  it('falls back to count bars when no bucket carries line stats', () => {
    const flat = commits.map((c) => ({ ...c, additions: 0, deletions: 0 }));
    const { container } = render(
      <CommitActivityTimeline commits={flat} timeframe="week" variant="bars" now={NOW} />,
    );
    expect(marks(container)).toHaveLength(2);
    expect(container.querySelector('g.text-muted-foreground')).not.toBeNull();
  });

  it('draws one heatmap cell per bucket, empty ones included', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="month" variant="heatmap" now={NOW} />,
    );
    expect(marks(container)).toHaveLength(30);
  });

  it('draws the sparkline as an area plus a non-scaling line', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" variant="sparkline" now={NOW} />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[1]?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('swaps the viewBox axes with the orientation', () => {
    const horizontal = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    const vertical = render(
      <CommitActivityTimeline
        commits={commits}
        timeframe="week"
        orientation="vertical"
        now={NOW}
      />,
    );
    expect(horizontal.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 100 32');
    expect(vertical.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 32 100');
  });

  it('announces the window and the commit count', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Commit activity, last 7 days: 2 commits',
    );
  });
});

describe('CommitActivityTimeline gridlines', () => {
  it('draws nothing extra while off', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    expect(container.querySelector('[data-testid="activity-gridlines"]')).toBeNull();
  });

  it('rules every day boundary of a week, plus the diverging baseline', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" gridlines now={NOW} />,
    );
    const lines = container.querySelectorAll('[data-testid="activity-gridlines"] line');
    // Six day boundaries + the centre baseline the churn bars grow off.
    expect(lines).toHaveLength(7);
    // The baseline is the solid one; the axis rules are dashed.
    expect([...lines].filter((l) => l.getAttribute('stroke-dasharray') === null)).toHaveLength(1);
  });

  it('drops the baseline when the bars do not diverge off one', () => {
    const grouped = render(
      <CommitActivityTimeline
        commits={commits}
        timeframe="week"
        gridlines
        barLayout="grouped"
        now={NOW}
      />,
    );
    expect(
      grouped.container.querySelectorAll('[data-testid="activity-gridlines"] line'),
    ).toHaveLength(6);
  });

  it('rules a month every seven buckets rather than every one', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="month" gridlines now={NOW} />,
    );
    expect(
      container.querySelectorAll('[data-testid="activity-gridlines"] line'),
    ).toHaveLength(4 + 1);
  });
});

describe('CommitActivityTimeline bar layout', () => {
  it('stands the two churn bars side by side when grouped', () => {
    const { container } = render(
      <CommitActivityTimeline
        commits={commits}
        timeframe="week"
        variant="bars"
        barLayout="grouped"
        now={NOW}
      />,
    );
    expect(container.querySelector('[data-testid="activity-bars-grouped"]')).not.toBeNull();

    // The bucket carrying both an addition and a deletion draws them at
    // different x offsets and off the SAME edge — the diverging layout puts
    // them at one x and two different y's.
    const add = container.querySelector('rect.text-emerald-500')!;
    const del = [...container.querySelectorAll('rect.text-rose-500')].find(
      (rect) => rect.getAttribute('x') !== add.getAttribute('x'),
    );
    expect(del).toBeDefined();
    const bottom = (rect: Element) =>
      Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'));
    expect(bottom(add)).toBeCloseTo(bottom(del!), 5);
  });

  it('keeps diverging as the untouched default', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" variant="bars" now={NOW} />,
    );
    expect(container.querySelector('[data-testid="activity-bars-grouped"]')).toBeNull();

    // Diverging means one x per bucket and two y's: the bucket that carries
    // both sides has its addition and its deletion at the SAME offset along the
    // time axis, meeting at the centre baseline.
    const add = container.querySelector('rect.text-emerald-500')!;
    const del = [...container.querySelectorAll('rect.text-rose-500')].find(
      (rect) => rect.getAttribute('x') === add.getAttribute('x'),
    );
    expect(del).toBeDefined();
    const bottom = Number(add.getAttribute('y')) + Number(add.getAttribute('height'));
    expect(bottom).toBeCloseTo(Number(del!.getAttribute('y')), 5);
  });
});

describe('CommitActivityTimeline hover tooltip', () => {
  /** One hit rect per bucket, spanning the full slot — gaps included. */
  const hits = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-testid="activity-hit"]')];

  it('lays a hit target over every bucket, gap included', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    const rects = hits(container);
    expect(rects).toHaveLength(7);
    expect(Number(rects[0]!.getAttribute('width'))).toBeCloseTo(100 / 7, 1);
  });

  it('names the bucket, its commits and its churn on hover', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    // The last bucket is today, and holds the 10/4 commit.
    hover(hits(container).at(-1)!, 200, 200);

    const tip = screen.getByTestId('activity-tooltip').textContent ?? '';
    expect(tip).toContain('1 commit');
    expect(tip).toContain('+10');
    expect(tip).toContain('−4');
    expect(tip).toContain('50% of the last 7 days');
  });

  it('says an empty bucket is empty rather than showing a zero churn row', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    // Index 1 is five days back: no commits in the fixture.
    hover(hits(container)[1]!);

    const tip = screen.getByTestId('activity-tooltip').textContent ?? '';
    expect(tip).toContain('No commits');
    expect(tip).not.toContain('lines');
  });

  it('clears on leaving the chart', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    hover(hits(container).at(-1)!);
    expect(screen.queryByTestId('activity-tooltip')).not.toBeNull();

    fireEvent.pointerLeave(hits(container).at(-1)!.parentElement!);
    expect(screen.queryByTestId('activity-tooltip')).toBeNull();
  });

  it('highlights the hovered slot under the marks', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    expect(container.querySelector('rect.fill-foreground')).toBeNull();
    hover(hits(container)[3]!);
    expect(container.querySelector('rect.fill-foreground')).not.toBeNull();
  });
});
