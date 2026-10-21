import { useMapFocus } from '@midnite/studio-feature-media-map/renderer';
import { afterEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { focusMapCapture } from './focus-map-capture';

afterEach(() => useMapFocus.getState().clear());

describe('focusMapCapture', () => {
  it('posts a numbered request and opens the Maps tab', () => {
    focusMapCapture({ project: 'maps', name: 'a', center: [1, 2], sideM: 1000 });
    expect(useMapFocus.getState().request).toMatchObject({ project: 'maps', n: 1 });
    expect(useUiStore.getState().mediaTab).toBe('map');
    focusMapCapture({ project: 'maps', name: 'a', center: [1, 2], sideM: 1000 });
    expect(useMapFocus.getState().request?.n).toBe(2);
  });
});
