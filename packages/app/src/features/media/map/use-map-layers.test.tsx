import { emptyLayer, parseLayer, stringifyLayer, type MapLayerFeature } from '@midnite/studio-shared';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderHookWithProviders } from '../../../../test-support/render';
import { LAYER_WRITE_DEBOUNCE_MS, useMapLayers } from './use-map-layers';

const pin = (id: string): MapLayerFeature => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [18.4, -33.9] }, properties: { kind: 'pin', label: id } });
const seeded = { ...emptyLayer(), features: [pin('a')] };

const data = (files: Record<string, string>) => ({ ...fixtures, media: { files: { 'map:maps': files } } });
const setup = (files: Record<string, string>) => {
  const save = vi.fn();
  const view = renderHookWithProviders(() => useMapLayers({ repoId: 'repo-1', project: 'maps', map: undefined, save }), { fixtures: data(files) });
  return { ...view, save, write: vi.spyOn(window.midniteStudio!.media.file, 'write') };
};

describe('useMapLayers', () => {
  it('reads layers/*.geojson and ignores everything else', async () => {
    const { result } = setup({ 'map.json': '{}', 'layers/roads.geojson': stringifyLayer(seeded) });
    await waitFor(() => expect(result.current.layers[0]?.fc?.features).toHaveLength(1));
    expect(result.current.layers.map((l) => l.name)).toEqual(['roads']);
  });

  it('writes an added feature once, 500 ms after the last edit, with stable bytes', async () => {
    const { result, write } = setup({ 'layers/roads.geojson': stringifyLayer(seeded) });
    await waitFor(() => expect(result.current.layers).toHaveLength(1));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => result.current.setActive('roads'));
    act(() => void result.current.addFeature(pin('b')));
    act(() => void result.current.addFeature(pin('c')));
    expect(write).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(LAYER_WRITE_DEBOUNCE_MS);
    });
    vi.useRealTimers();
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const call = write.mock.calls[0]![0] as { path: string; content: string };
    expect(call.path).toBe('layers/roads.geojson');
    expect(parseLayer(call.content)!.features.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(stringifyLayer(parseLayer(call.content)!)).toBe(call.content);
  });

  it('creates the drawings layer on first use, and records its style in map.json', async () => {
    const { result, save, write } = setup({});
    act(() => void result.current.addFeature(pin('x')));
    expect(result.current.layers.map((l) => l.name)).toEqual(['drawings']);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ layerOrder: ['drawings'] }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('lists an unparsable layer as an error and never writes over it', async () => {
    const { result, write } = setup({ 'layers/bad.geojson': '{ nope' });
    await waitFor(() => expect(result.current.layers).toHaveLength(1));
    await waitFor(() => expect(result.current.layers[0]!.fc).toBeNull());
    act(() => result.current.setActive('bad'));
    let target: string | null = 'unset';
    act(() => {
      target = result.current.addFeature(pin('z'));
    });
    // The drawing goes to a fresh `drawings` layer instead.
    expect(target).toBe('drawings');
    await new Promise((r) => setTimeout(r, LAYER_WRITE_DEBOUNCE_MS + 100));
    expect(write.mock.calls.every(([req]) => (req as { path: string }).path !== 'layers/bad.geojson')).toBe(true);
  });

  it('toggling visibility touches map.json, not the GeoJSON', async () => {
    const { result, save, write } = setup({ 'layers/roads.geojson': stringifyLayer(seeded) });
    await waitFor(() => expect(result.current.layers).toHaveLength(1));
    act(() => result.current.setStyle('roads', { visible: false }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ layerStyle: { roads: expect.objectContaining({ visible: false }) } }));
    expect(result.current.layers[0]!.visible).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('renames through file.rename and moves the style with it; remove calls file.remove', async () => {
    const { result } = setup({ 'layers/roads.geojson': stringifyLayer(seeded) });
    await waitFor(() => expect(result.current.layers).toHaveLength(1));
    const rename = vi.spyOn(window.midniteStudio!.media.file, 'rename');
    const remove = vi.spyOn(window.midniteStudio!.media.file, 'remove');
    await act(async () => {
      expect(await result.current.rename('roads', 'trails')).toBe(true);
    });
    expect(rename).toHaveBeenCalledWith(expect.objectContaining({ path: 'layers/roads.geojson', to: 'layers/trails.geojson' }));
    await waitFor(() => expect(result.current.layers.map((l) => l.name)).toEqual(['trails']));
    await act(async () => result.current.remove('trails'));
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ path: 'layers/trails.geojson' }));
  });
});
