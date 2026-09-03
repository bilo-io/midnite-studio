import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(container.querySelector('g.text-muted-foreground')).not.toBeNull();
  });

  it('draws one heatmap cell per bucket, empty ones included', () => {
    const { container } = render(
      <CommitActivityTimeline commits={commits} timeframe="month" variant="heatmap" now={NOW} />,
    );
    expect(container.querySelectorAll('rect')).toHaveLength(30);
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
