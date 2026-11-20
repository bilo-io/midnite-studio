import { describe, expect, it } from 'vitest';

import { CONTROLS_BOUNDS, LIST_BOUNDS, RESULTS_MIN_WIDTH } from './use-projections-ui';

describe('Projections pane widths', () => {
  it('fit the default 1100 px Startup window with both side panes at their initial widths', () => {
    // 120 px for the window's own chrome: the rail, the view's padding and the two resize handles.
    const available = 1100 - 120;
    expect(LIST_BOUNDS.initial + RESULTS_MIN_WIDTH + CONTROLS_BOUNDS.initial).toBeLessThanOrEqual(available);
  });
});
