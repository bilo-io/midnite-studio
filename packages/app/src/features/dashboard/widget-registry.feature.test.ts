// vitest/node: the registry filter is pure.
import { describe, expect, it } from 'vitest';

import { availableWidgets, renderableWidgets } from './widget-registry';

describe('dashboard widgets follow feature toggles (Phase 135 Theme C)', () => {
  it("drops a switched-off feature's widgets from the board and the picker, and brings them back", () => {
    const layout = ['calendar', 'fin-chart', 'loop-runs', 'pulls'];
    expect(renderableWidgets(layout, true).map((w) => w.id)).toEqual(layout);
    expect(renderableWidgets(layout, true, ['finance', 'loops']).map((w) => w.id)).toEqual(['calendar', 'pulls']);
    expect(availableWidgets(true, ['forge']).some((w) => w.id === 'pulls')).toBe(false);
    expect(availableWidgets(true, []).some((w) => w.id === 'pulls')).toBe(true);
  });
});
