import { describe, expect, it } from 'vitest';

import { collapseFor, densityFor } from './density';

describe('densityFor', () => {
  const widths = { available: 200, fullWidth: 200, compactWidth: 120 };

  it('stays full while everything fits', () => {
    expect(densityFor(widths, 'full')).toBe('full');
  });

  it('drops to compact the instant full content no longer fits — no hysteresis on the way down', () => {
    expect(densityFor({ ...widths, available: widths.fullWidth - 1 }, 'full')).toBe('compact');
  });

  it('a 1px narrower window from full does not bounce back to full next tick', () => {
    // Simulates the next measurement being called with the density this
    // function itself just returned.
    const next = densityFor({ ...widths, available: widths.fullWidth - 1 }, 'full');
    expect(densityFor({ ...widths, available: widths.fullWidth - 1 }, next)).toBe('compact');
  });

  it('does not restore to full at exactly fullWidth once already compact', () => {
    expect(densityFor({ ...widths, available: widths.fullWidth }, 'compact')).toBe('compact');
  });

  it('restores to full only once available >= fullWidth + 24', () => {
    expect(densityFor({ ...widths, available: widths.fullWidth + 24 }, 'compact')).toBe('full');
  });

  it('collapses the instant compact content no longer fits — no hysteresis on the way down', () => {
    expect(densityFor({ ...widths, available: widths.compactWidth - 1 }, 'compact')).toBe(
      'collapsed',
    );
  });

  it('does not restore to compact at exactly compactWidth once already collapsed', () => {
    expect(densityFor({ ...widths, available: widths.compactWidth }, 'collapsed')).toBe(
      'collapsed',
    );
  });

  it('restores from collapsed to compact only once available >= compactWidth + 24', () => {
    expect(densityFor({ ...widths, available: widths.compactWidth + 24 }, 'collapsed')).toBe(
      'compact',
    );
  });

  it('jumps straight from full to collapsed in one measurement when the window shrinks a lot', () => {
    expect(densityFor({ ...widths, available: widths.compactWidth - 1 }, 'full')).toBe(
      'collapsed',
    );
  });

  it('jumps straight from collapsed to full in one measurement when the window grows a lot', () => {
    expect(densityFor({ ...widths, available: widths.fullWidth + 24 }, 'collapsed')).toBe('full');
  });

  it('is stable under a one-pixel oscillation at the compact/collapsed boundary', () => {
    let density = densityFor({ ...widths, available: widths.compactWidth }, 'compact');
    density = densityFor({ ...widths, available: widths.compactWidth - 1 }, density);
    expect(density).toBe('collapsed');
    density = densityFor({ ...widths, available: widths.compactWidth }, density);
    // +1px is not +24px: still collapsed.
    expect(density).toBe('collapsed');
  });
});

describe('collapseFor', () => {
  const segments = [
    { id: 'a', priority: 20 },
    { id: 'b', priority: 5 },
    { id: 'c', priority: 10 },
  ];

  it('collapses nothing at full or compact density', () => {
    expect(collapseFor(segments, 'full')).toEqual({ visible: segments, collapsed: [] });
    expect(collapseFor(segments, 'compact')).toEqual({ visible: segments, collapsed: [] });
  });

  it('moves every segment to the popover at collapsed density, ordered priority-ascending', () => {
    const { visible, collapsed } = collapseFor(segments, 'collapsed');
    expect(visible).toEqual([]);
    expect(collapsed.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const copy = [...segments];
    collapseFor(segments, 'collapsed');
    expect(segments).toEqual(copy);
  });
});
