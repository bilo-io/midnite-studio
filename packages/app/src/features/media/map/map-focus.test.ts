import { afterEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { focusMapCapture, useMapFocus, zoomForSide } from './map-focus';

afterEach(() => useMapFocus.getState().clear());

describe('map focus', () => {
  it('posts a numbered request and opens the Maps tab', () => {
    focusMapCapture({ project: 'maps', name: 'a', center: [1, 2], sideM: 1000 });
    expect(useMapFocus.getState().request).toMatchObject({ project: 'maps', n: 1 });
    expect(useUiStore.getState().mediaTab).toBe('map');
    focusMapCapture({ project: 'maps', name: 'a', center: [1, 2], sideM: 1000 });
    expect(useMapFocus.getState().request?.n).toBe(2);
  });

  it('zoomForSide fits a smaller square at a deeper zoom, and clamps', () => {
    expect(zoomForSide(0, 1000)).toBeGreaterThan(zoomForSide(0, 8000));
    // A degree of longitude is shorter at 60°, so the same side needs a shallower zoom to fill the view.
    expect(zoomForSide(60, 8000)).toBeLessThan(zoomForSide(0, 8000));
    expect(zoomForSide(0, 1)).toBe(22);
    expect(zoomForSide(0, 1e9)).toBe(0);
  });
});
