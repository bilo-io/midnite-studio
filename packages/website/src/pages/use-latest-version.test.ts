import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLatestVersion } from './use-latest-version';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLatestVersion', () => {
  it('reports unreleased and makes no network call while access is gated', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useLatestVersion());
    expect(result.current).toEqual({ status: 'unreleased' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
