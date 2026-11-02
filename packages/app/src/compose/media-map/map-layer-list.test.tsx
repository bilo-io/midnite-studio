import { useBottomPanelStore } from '@midnite/studio-frame';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { BAD_LAYER_TEXT, MapLayerList } from '@midnite/studio-feature-media-map/renderer';
import type { MapLayers } from '@midnite/studio-feature-media-map/renderer';

afterEach(cleanup);
beforeEach(() => useBottomPanelStore.setState({ panels: {} }));

const fc = { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, id: 'a', geometry: { type: 'Point' as const, coordinates: [1, 2] as [number, number] }, properties: { kind: 'pin' as const } }] };

function fakeLayers(over: Partial<MapLayers> = {}): MapLayers {
  return {
    layers: [
      { name: 'roads', fc, color: '#3b82f6', visible: true },
      { name: 'broken', fc: null, color: '#ef4444', visible: true },
    ],
    active: 'roads',
    setActive: vi.fn(),
    setStyle: vi.fn(),
    move: vi.fn(),
    reorder: vi.fn(),
    create: vi.fn(async () => 'Layer'),
    rename: vi.fn(async () => true),
    remove: vi.fn(async () => undefined),
    ...over,
  } as unknown as MapLayers;
}

describe('MapLayerList', () => {
  it('collapses to its header row, which keeps New and Import', () => {
    renderView(<MapLayerList layers={fakeLayers()} />, { fixtures });
    const toggle = screen.getByRole('button', { name: 'Layers' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('map-layers').style.height).toBe('208px');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Layer roads')).toBeNull();
    expect(screen.getByRole('button', { name: 'New layer' })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Layer roads')).toBeTruthy();
  });

  it('New layer does not toggle the panel', () => {
    const layers = fakeLayers();
    renderView(<MapLayerList layers={layers} />, { fixtures });
    fireEvent.click(screen.getByRole('button', { name: 'New layer' }));
    expect(layers.create).toHaveBeenCalledWith('Layer');
    expect(screen.getByRole('button', { name: 'Layers' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows an error row for an invalid file, and a count for a good one', () => {
    renderView(<MapLayerList layers={fakeLayers()} />, { fixtures });
    expect(screen.getByText(BAD_LAYER_TEXT)).toBeTruthy();
    expect(screen.getByLabelText('Layer roads').textContent).toContain('1');
  });

  it('toggles visibility and recolours through the style, not the file', () => {
    const layers = fakeLayers();
    renderView(<MapLayerList layers={layers} />, { fixtures });
    fireEvent.click(screen.getByRole('button', { name: 'Hide roads' }));
    expect(layers.setStyle).toHaveBeenCalledWith('roads', { visible: false });
    fireEvent.change(screen.getByLabelText('Colour of roads'), { target: { value: '#00ff00' } });
    expect(layers.setStyle).toHaveBeenCalledWith('roads', { color: '#00ff00' });
  });

  it('Alt+Up and Alt+Down on a focused row reorder it', () => {
    const layers = fakeLayers();
    renderView(<MapLayerList layers={layers} />, { fixtures });
    const row = screen.getByLabelText('Layer roads');
    fireEvent.keyDown(row, { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(row, { key: 'ArrowDown', altKey: true });
    expect(layers.move).toHaveBeenNthCalledWith(1, 'roads', -1);
    expect(layers.move).toHaveBeenNthCalledWith(2, 'roads', 1);
  });

  it('delete asks first, naming the layer and its feature count', () => {
    const layers = fakeLayers();
    renderView(<MapLayerList layers={layers} />, { fixtures });
    fireEvent.click(screen.getByRole('button', { name: 'Delete roads' }));
    expect(screen.getByText("Move layer 'roads' (1 features) to the Trash?")).toBeTruthy();
    expect(layers.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(layers.remove).toHaveBeenCalledWith('roads');
  });

  it('renames in place on Enter', () => {
    const layers = fakeLayers();
    renderView(<MapLayerList layers={layers} />, { fixtures });
    fireEvent.click(screen.getByRole('button', { name: 'Rename roads' }));
    const input = screen.getByLabelText('Layer name');
    fireEvent.change(input, { target: { value: 'trails' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(layers.rename).toHaveBeenCalledWith('roads', 'trails');
  });
});
