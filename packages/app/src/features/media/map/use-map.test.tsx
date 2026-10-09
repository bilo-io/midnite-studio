import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockBridgeJsdom } from '../../../../test-support/mock-bridge';
import { fixtures } from '../../../../test-support/fixtures';
import { SAVE_DEBOUNCE_MS, useSaveMapView } from './use-map';

beforeEach(() => {
  vi.useFakeTimers();
  installMockBridgeJsdom(fixtures);
});
afterEach(() => vi.useRealTimers());

describe('useSaveMapView', () => {
  it('writes once, 750 ms after the last move, with the merged patch', () => {
    const setView = vi.spyOn(window.midniteStudio!.media.map, 'setView');
    const { result } = renderHook(() => useSaveMapView('repo-1', 'maps'));
    const view = (zoom: number) => ({ center: [0, 0] as [number, number], zoom, bearing: 0, pitch: 0 });
    act(() => {
      result.current.save({ view: view(3) });
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
      result.current.save({ view: view(4) });
      result.current.save({ basemap: 'dark' });
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    });
    expect(setView).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(setView).toHaveBeenCalledTimes(1);
    expect(setView.mock.calls[0]![0]).toMatchObject({ repoId: 'repo-1', project: 'maps', patch: { view: view(4), basemap: 'dark' } });
  });

  it('flushes a pending save on unmount', () => {
    const setView = vi.spyOn(window.midniteStudio!.media.map, 'setView');
    const { result, unmount } = renderHook(() => useSaveMapView('repo-1', 'maps'));
    act(() => result.current.save({ basemap: 'terrain' }));
    unmount();
    expect(setView).toHaveBeenCalledTimes(1);
  });
});
