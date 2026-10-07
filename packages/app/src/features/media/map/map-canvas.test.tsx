import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const instances: Array<{ remove: ReturnType<typeof vi.fn>; loseContext: ReturnType<typeof vi.fn>; setStyle: ReturnType<typeof vi.fn> }> = [];

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('maplibre-gl', () => {
  class Map {
    remove = vi.fn();
    loseContext = vi.fn();
    setStyle = vi.fn();
    constructor() {
      instances.push(this);
    }
    addControl() {}
    on() {}
    resize() {}
    areTilesLoaded() {
      return true;
    }
    getCanvas() {
      return { getContext: () => ({ getExtension: () => ({ loseContext: this.loseContext }) }) };
    }
  }
  class Control {}
  return { default: { Map, AttributionControl: Control, NavigationControl: Control } };
});

import MapCanvas from './map-canvas';

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver);

const props = {
  style: { version: 8 as const, sources: {}, layers: [] },
  view: { center: [0, 0] as [number, number], zoom: 3, bearing: 0, pitch: 0 },
  onViewChange: () => undefined,
  attribution: ['x'],
};

afterEach(() => {
  cleanup();
  instances.length = 0;
});

describe('MapCanvas', () => {
  it('creates one map per mount and removes it and its WebGL context on unmount', () => {
    const { unmount } = render(<MapCanvas {...props} />);
    expect(instances).toHaveLength(1);
    unmount();
    expect(instances[0]!.remove).toHaveBeenCalledTimes(1);
    expect(instances[0]!.loseContext).toHaveBeenCalledTimes(1);
  });

  it('re-applies a changed style on the same map instead of re-creating it', () => {
    const { rerender } = render(<MapCanvas {...props} />);
    rerender(<MapCanvas {...props} style={{ version: 8, sources: {}, layers: [{ id: 'a' }] }} />);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.setStyle).toHaveBeenCalledTimes(1);
  });
});
