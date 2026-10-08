import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultMapProject, type MapFrame } from '@midnite/studio-shared';

import { useMapFraming } from './use-map-framing';

describe('useMapFraming', () => {
  it('creates a default frame on first toggle, hides it on second, and recenters on third', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useMapFraming({ map: defaultMapProject(), save, widthPx: 800 }));

    expect(result.current.frame).toBeNull();
    expect(result.current.visible).toBe(false);

    // 1. First toggle: frame appears centered on view 1
    act(() => {
      result.current.toggleFrame({ center: [10, 20], zoom: 6 });
    });

    expect(result.current.visible).toBe(true);
    expect(result.current.frame).not.toBeNull();
    expect(result.current.frame?.center).toEqual([10, 20]);
    const firstSideM = result.current.frame?.sideM;
    expect(save).toHaveBeenCalledWith({ frame: result.current.frame });

    // 2. Second toggle: frame hides, center unchanged
    act(() => {
      result.current.toggleFrame({ center: [50, 60], zoom: 6 });
    });

    expect(result.current.visible).toBe(false);
    expect(result.current.frame?.center).toEqual([10, 20]);

    // 3. Third toggle: frame becomes visible again and recenters to the new coordinates
    act(() => {
      result.current.toggleFrame({ center: [50, 60], zoom: 8 });
    });

    expect(result.current.visible).toBe(true);
    expect(result.current.frame?.center).toEqual([50, 60]);
    // Keeps existing sideM and dimensions
    expect(result.current.frame?.sideM).toBe(firstSideM);
    expect(save).toHaveBeenLastCalledWith({
      frame: expect.objectContaining({ center: [50, 60], sideM: firstSideM }),
    });
  });

  it('recenters an existing saved frame when toggled visible from hidden state', () => {
    const existingFrame: MapFrame = {
      center: [12.34, 56.78],
      sideM: 10_000,
      size: 1025,
    };
    const mapWithFrame = {
      ...defaultMapProject(),
      frame: existingFrame,
    };
    const save = vi.fn();
    const { result } = renderHook(() => useMapFraming({ map: mapWithFrame, save }));

    // Initially visible because map has a frame
    expect(result.current.visible).toBe(true);
    expect(result.current.frame?.center).toEqual([12.34, 56.78]);

    // Toggle once: hides the frame
    act(() => {
      result.current.toggleFrame({ center: [100, 40], zoom: 10 });
    });
    expect(result.current.visible).toBe(false);
    expect(result.current.frame?.center).toEqual([12.34, 56.78]);

    // Toggle again: becomes visible and recenters to the current view
    act(() => {
      result.current.toggleFrame({ center: [100, 40], zoom: 10 });
    });
    expect(result.current.visible).toBe(true);
    expect(result.current.frame?.center).toEqual([100, 40]);
    expect(result.current.frame?.sideM).toBe(10_000);
    expect(result.current.frame?.size).toBe(1025);
    expect(save).toHaveBeenCalledWith({
      frame: expect.objectContaining({ center: [100, 40], sideM: 10_000 }),
    });
  });

  it('moves frame and saves changes', () => {
    const existingFrame: MapFrame = {
      center: [0, 0],
      sideM: 5000,
      size: 1025,
    };
    const save = vi.fn();
    const { result } = renderHook(() => useMapFraming({ map: { ...defaultMapProject(), frame: existingFrame }, save }));

    act(() => {
      result.current.moveFrame({ center: [1, 2], sideM: 8000 });
    });
    expect(result.current.frame?.center).toEqual([1, 2]);
    expect(result.current.frame?.sideM).toBe(8000);
    expect(save).toHaveBeenCalledWith({
      frame: expect.objectContaining({ center: [1, 2], sideM: 8000 }),
    });
  });
});
