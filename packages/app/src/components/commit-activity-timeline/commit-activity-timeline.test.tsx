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

  it('draws the churn areas as two bands, each a fill plus a non-scaling line', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" variant="area" now={NOW} />,
    );
    const paths = [...container.querySelectorAll('path')];
    expect(paths).toHaveLength(4);
    expect(paths.filter((p) => p.getAttribute('vector-effect') === 'non-scaling-stroke')).toHaveLength(
      2,
    );
    expect(container.querySelector('g.text-emerald-500 path')).not.toBeNull();
    expect(container.querySelector('g.text-rose-500 path')).not.toBeNull();
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

/**
 * The churn areas' two layouts.
 *
 * Asserted off the stroked upper edge of each band rather than its fill: the
 * fill path is the edge plus a return leg, so the edge is the same numbers
 * with none of the closing noise. `AREA_PAD` puts the zero edge at 31 and the
 * far edge at 1, and `alongPoints` squares the ends off, so bucket `i` is
 * point `i + 1`.
 */
describe('CommitActivityTimeline area layout', () => {
  const edge = (container: HTMLElement, colour: 'emerald' | 'rose'): [number, number][] => {
    const d = container
      .querySelector(`g.text-${colour}-500 path[vector-effect="non-scaling-stroke"]`)!
      .getAttribute('d')!;
    return d
      .slice(1)
      .split(' L')
      .map((point) => point.split(',').map(Number) as [number, number]);
  };

  const area = (props: Partial<Parameters<typeof CommitActivityTimeline>[0]> = {}) =>
    render(
      <CommitActivityTimeline
        commits={commits}
        timeframe="week"
        variant="area"
        now={NOW}
        {...props}
      />,
    ).container;

  /**
   * Sep 1 — the bucket carrying deletions and no additions. A week window
   * opens on Aug 28, so that is bucket 4, and the leading shoulder shifts
   * every bucket one point along.
   */
  const SEP_1 = 4 + 1;

  it('squares the band off to both ends of the time axis', () => {
    const points = edge(area(), 'rose');
    // Seven buckets plus a shoulder at each end.
    expect(points).toHaveLength(9);
    expect(points[0]![0]).toBe(0);
    expect(points.at(-1)![0]).toBe(100);
    // A shoulder repeats its neighbour's value, so the end is flat.
    expect(points[0]![1]).toBe(points[1]![1]);
    expect(points.at(-1)![1]).toBe(points.at(-2)![1]);
  });

  it('overlays both bands off the same zero edge by default', () => {
    const container = area();
    expect(container.querySelector('[data-testid="activity-area-overlaid"]')).not.toBeNull();
    // No additions in this bucket, so the green edge is flat on the axis while
    // the red one rises off it.
    expect(edge(container, 'emerald')[SEP_1]![1]).toBeCloseTo(31, 5);
    expect(edge(container, 'rose')[SEP_1]![1]).toBeLessThan(31);
  });

  it('rests additions on top of deletions when stacked', () => {
    const container = area({ areaLayout: 'stacked' });
    expect(container.querySelector('[data-testid="activity-area-stacked"]')).not.toBeNull();
    // Same bucket: with nothing added, the green edge lands exactly on the red
    // one rather than on the axis.
    const green = edge(container, 'emerald')[SEP_1]![1];
    const red = edge(container, 'rose')[SEP_1]![1];
    expect(green).toBeCloseTo(red, 5);
    expect(green).toBeLessThan(31);
  });

  it('scales stacked bands against the largest total, not the largest single side', () => {
    // Sep 1's −9 is 9 of a 10-line largest side but only 9 of a 14-line
    // largest total, so stacking shortens it — a larger y is a shorter band.
    expect(edge(area({ areaLayout: 'stacked' }), 'rose')[SEP_1]![1]).toBeGreaterThan(
      edge(area(), 'rose')[SEP_1]![1],
    );
  });

  it('falls back to one neutral commit-count area when no bucket carries line stats', () => {
    const flat = commits.map((c) => ({ ...c, additions: 0, deletions: 0 }));
    const container = area({ commits: flat });
    expect(container.querySelector('g.text-emerald-500')).toBeNull();
    expect(container.querySelector('g.text-rose-500')).toBeNull();
    expect(container.querySelectorAll('g.text-muted-foreground path')).toHaveLength(2);
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

/**
 * The vertical orientation, which every test above leaves at its default.
 *
 * `place()` swaps x and y, so every assertion on `x`/`y`/`width`/`height`
 * above is horizontal-only — a broken swap would pass all of them. These pin
 * the swap for each of the new marks.
 */
describe('CommitActivityTimeline vertical orientation', () => {
  const vertical = (props: Partial<Parameters<typeof CommitActivityTimeline>[0]> = {}) =>
    render(
      <CommitActivityTimeline
        commits={commits}
        timeframe="week"
        orientation="vertical"
        now={NOW}
        {...props}
      />,
    ).container;

  it('turns the time-axis rules into full-width horizontal lines', () => {
    const container = vertical({ gridlines: true });
    const lines = [...container.querySelectorAll('[data-testid="activity-gridlines"] line')];
    const rules = lines.filter((l) => l.getAttribute('stroke-dasharray') !== null);

    expect(rules).toHaveLength(6);
    for (const rule of rules) {
      // Constant y (a moment in time), spanning the cross axis 0 → 32.
      expect(rule.getAttribute('y1')).toBe(rule.getAttribute('y2'));
      expect(rule.getAttribute('x1')).toBe('0');
      expect(rule.getAttribute('x2')).toBe('32');
    }
  });

  it('runs the diverging baseline down the middle instead of across it', () => {
    const container = vertical({ gridlines: true });
    const baseline = [...container.querySelectorAll('[data-testid="activity-gridlines"] line')].find(
      (l) => l.getAttribute('stroke-dasharray') === null,
    )!;
    // x fixed at the cross-axis centre, y spanning the whole time axis.
    expect(baseline.getAttribute('x1')).toBe('16');
    expect(baseline.getAttribute('x2')).toBe('16');
    expect(baseline.getAttribute('y1')).toBe('0');
    expect(baseline.getAttribute('y2')).toBe('100');
  });

  it('stands grouped bars side by side down the time axis, off one shared edge', () => {
    const container = vertical({ barLayout: 'grouped' });
    const add = container.querySelector('rect.text-emerald-500')!;
    const del = [...container.querySelectorAll('rect.text-rose-500')].find(
      (rect) => rect.getAttribute('y') !== add.getAttribute('y'),
    )!;

    // Two slots along y (time), both ending at the same cross-axis edge.
    expect(add.getAttribute('y')).not.toBe(del.getAttribute('y'));
    const right = (rect: Element) =>
      Number(rect.getAttribute('x')) + Number(rect.getAttribute('width'));
    expect(right(add)).toBeCloseTo(right(del), 5);
    expect(right(add)).toBeCloseTo(32, 5);
  });

  it('turns the churn bands sideways, measured off the left edge', () => {
    const container = vertical({ variant: 'area' });
    const points = [
      ...container
        .querySelector('g.text-rose-500 path[vector-effect="non-scaling-stroke"]')!
        .getAttribute('d')!
        .slice(1)
        .split(' L'),
    ].map((point) => point.split(',').map(Number) as [number, number]);

    // Vertically the pair is `across,along`: time runs down y from 0 to 100,
    // and depth is x measured off the `CROSS - AREA_PAD` edge.
    expect(points[0]![1]).toBe(0);
    expect(points.at(-1)![1]).toBe(100);
    expect(Math.max(...points.map(([x]) => x))).toBeCloseTo(31, 5);
  });

  it('lays the hit rects down the time axis, spanning the full cross axis', () => {
    const container = vertical();
    const hit = container.querySelector('[data-testid="activity-hit"]')!;
    expect(hit.getAttribute('width')).toBe('32');
    expect(Number(hit.getAttribute('height'))).toBeCloseTo(100 / 7, 1);
  });
});

describe('CommitActivityTimeline hover bookkeeping', () => {
  const hits = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-testid="activity-hit"]')];

  it('drops a highlight whose bucket the timeframe change took away', () => {
    const { container, rerender } = render(
      <CommitActivityTimeline commits={commits} timeframe="month" now={NOW} />,
    );
    // Bucket 23 exists in a 30-bucket month and not in a 7-bucket week.
    hover(hits(container)[23]!);
    expect(container.querySelector('rect.fill-foreground')).not.toBeNull();

    rerender(<CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />);
    // Neither the highlight nor the card may render off the end of the window.
    expect(container.querySelector('rect.fill-foreground')).toBeNull();
    expect(screen.queryByTestId('activity-tooltip')).toBeNull();
  });

  it('clamps the card inside the viewport rather than off its edges', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="week" now={NOW} />,
    );
    // jsdom reports a zero-sized card, so the assertion is about the FLOOR:
    // a pointer in the top-left corner must not place the card at a negative
    // offset, which is what a `min`-last clamp would do.
    hover(hits(container).at(-1)!, 0, 0);
    const card = screen.getByTestId('activity-tooltip');
    expect(Number.parseFloat(card.style.left)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(card.style.top)).toBeGreaterThanOrEqual(0);
  });
});
