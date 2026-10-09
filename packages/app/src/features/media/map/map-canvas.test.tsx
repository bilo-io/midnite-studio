import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Fake = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const instances: Fake[] = [];

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('maplibre-gl', () => {
  class Map {
    remove = vi.fn();
    loseContext = vi.fn();
    setStyle = vi.fn();
    setTerrain = vi.fn();
    easeTo = vi.fn();
    panBy = vi.fn();
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    getSource = vi.fn();
    getLayer = vi.fn();
    isStyleLoaded = vi.fn(() => true);
    queryTerrainElevation = vi.fn();
    dragPan = { enable: vi.fn(), disable: vi.fn() };
    doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
    flyTo = vi.fn();
    getStyle = vi.fn(() => ({}));
    queryRenderedFeatures = vi.fn(() => []);
    getCenter = vi.fn(() => ({ lng: 10, lat: 20 }));
    getZoom = vi.fn(() => 5);
    getBearing = vi.fn(() => 0);
    getPitch = vi.fn(() => 0);
    constructor() {
      instances.push(this as unknown as Fake);
    }
    addControl() {}
    on() {}
    off() {}
    resize() {}
    areTilesLoaded() {
      return true;
    }
    getCanvas() {
      return { style: {}, getContext: () => ({ getExtension: () => ({ loseContext: this.loseContext }) }) };
    }
  }
  class Control {}
  return { default: { Map, AttributionControl: Control, NavigationControl: Control } };
});

import MapCanvas, { type MapCanvasHandle } from './map-canvas';

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

  it('turns 3D on with setTerrain over the DEM and eases pitch to 60, and back to 0 when off', () => {
    const { rerender } = render(<MapCanvas {...props} terrain3d={{ on: false, exaggeration: 1.5 }} />);
    const map = instances[0]!;
    expect(map.setTerrain).toHaveBeenLastCalledWith(null);
    rerender(<MapCanvas {...props} terrain3d={{ on: true, exaggeration: 2.1 }} />);
    expect(map.setTerrain).toHaveBeenLastCalledWith({ source: 'dem', exaggeration: 2.1 });
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 60 });
    rerender(<MapCanvas {...props} terrain3d={{ on: false, exaggeration: 2.1 }} />);
    expect(map.setTerrain).toHaveBeenLastCalledWith(null);
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 0 });
  });
});

describe('MapCanvas keys (Phase 108 Theme C)', () => {
  it('pans, zooms and toggles the frame and 3D from the focused container', () => {
    const onToggleFrame = vi.fn();
    const onToggle3d = vi.fn();
    render(<MapCanvas {...props} onToggleFrame={onToggleFrame} onToggle3d={onToggle3d} />);
    const map = instances[0]!;
    const root = screen.getByRole('application', { name: 'Map' });
    fireEvent.keyDown(root, { key: 'ArrowLeft' });
    expect(map.panBy).toHaveBeenLastCalledWith([-100, 0]);
    fireEvent.keyDown(root, { key: 'ArrowDown', shiftKey: true });
    expect(map.panBy).toHaveBeenLastCalledWith([0, 400]);
    fireEvent.keyDown(root, { key: '+' });
    fireEvent.keyDown(root, { key: '-' });
    expect(map.zoomIn).toHaveBeenCalledTimes(1);
    expect(map.zoomOut).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(root, { key: 'f' });
    fireEvent.keyDown(root, { key: 'T' });
    expect(onToggleFrame).toHaveBeenCalledWith({ center: [10, 20], zoom: 5, bearing: 0, pitch: 0 });
    expect(onToggle3d).toHaveBeenCalledTimes(1);
  });

  it('exposes getView, getCenter, resetNorth, and flyTo on handleRef', () => {
    const handleRef = { current: null as MapCanvasHandle | null };
    render(<MapCanvas {...props} handleRef={handleRef} />);
    expect(handleRef.current?.getView()).toEqual({ center: [10, 20], zoom: 5, bearing: 0, pitch: 0 });
    expect(handleRef.current?.getCenter()).toEqual([10, 20]);
    handleRef.current?.resetNorth();
    expect(instances[0]!.easeTo).toHaveBeenCalledWith({ bearing: 0 });
    handleRef.current?.flyTo([1, 2], 10);
    expect(instances[0]!.flyTo).toHaveBeenCalledWith({ center: [1, 2], zoom: 10 });
  });

  it('ignores keys typed in a text field inside the canvas', () => {
    const onToggle3d = vi.fn();
    render(
      <MapCanvas {...props} onToggle3d={onToggle3d}>
        <input aria-label="Search" />
      </MapCanvas>,
    );
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 't' });
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'ArrowLeft' });
    expect(onToggle3d).not.toHaveBeenCalled();
    expect(instances[0]!.panBy).not.toHaveBeenCalled();
  });
});

describe('MapCanvas tools (Phase 108 Theme G)', () => {
  it('maps D/C/A/P to tools, Esc/Enter/Backspace to the draft, and leaves F/T alone', () => {
    const onSelectTool = vi.fn();
    const onCancelDraft = vi.fn();
    const onFinishDraft = vi.fn();
    const onUndoPoint = vi.fn();
    const onToggleFrame = vi.fn();
    render(<MapCanvas {...props} onSelectTool={onSelectTool} onCancelDraft={onCancelDraft} onFinishDraft={onFinishDraft} onUndoPoint={onUndoPoint} onToggleFrame={onToggleFrame} />);
    const root = screen.getByRole('application', { name: 'Map' });
    for (const key of ['d', 'C', 'a', 'p']) fireEvent.keyDown(root, { key });
    expect(onSelectTool.mock.calls.map((c) => c[0])).toEqual(['distance', 'circle', 'area', 'pin']);
    fireEvent.keyDown(root, { key: 'Escape' });
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.keyDown(root, { key: 'Backspace' });
    fireEvent.keyDown(root, { key: 'f' });
    expect(onCancelDraft).toHaveBeenCalledTimes(1);
    expect(onFinishDraft).toHaveBeenCalledTimes(1);
    expect(onUndoPoint).toHaveBeenCalledTimes(1);
    expect(onToggleFrame).toHaveBeenCalledTimes(1);
    expect(onSelectTool).toHaveBeenCalledTimes(4);
  });

  it('a drawing tool owns double-click and shows a crosshair; pan gives them back', () => {
    const { rerender } = render(<MapCanvas {...props} tool="distance" />);
    const map = instances[0]!;
    expect(map.doubleClickZoom.disable).toHaveBeenCalled();
    rerender(<MapCanvas {...props} tool="pan" />);
    expect(map.doubleClickZoom.enable).toHaveBeenCalled();
  });
});
