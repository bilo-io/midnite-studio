import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mapStatusStore, useMapStatus } from './use-map-status';

describe('useMapStatus', () => {
  it('counts errors, remembers the first, and resets', () => {
    const { result } = renderHook(() => useMapStatus());
    act(() => {
      mapStatusStore.recordTileError('openfreemap', '503');
      mapStatusStore.recordTileError('aws-terrarium', '404');
    });
    expect(result.current.failed).toBe(2);
    expect(result.current.firstError).toEqual({ source: 'openfreemap', status: '503' });
    act(() => mapStatusStore.reset());
    expect(result.current.failed).toBe(0);
    expect(result.current.firstError).toBeNull();
  });
});
