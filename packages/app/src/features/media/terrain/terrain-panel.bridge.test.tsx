import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { useMapFocus } from '../map/map-focus';
import { MediaView } from '../media-view';

/**
 * The parameter panel and the viewport's props (Phase 105 Theme D). vitest/jsdom is enough: the R3F
 * canvas is replaced by a stub that exposes the props it was given, as `model-tab.bridge.test.tsx` does.
 */
vi.mock('./terrain-viewer-lazy', () => ({
  LazyTerrainViewer: (props: { shading: string; timeOfDay: number; align?: boolean; brushActive?: boolean }) => (
    <div
      data-testid="viewer-stub"
      data-shading={props.shading}
      data-time={props.timeOfDay}
      data-align={props.align ? 'true' : 'false'}
      data-brush={props.brushActive ? 'true' : 'false'}
    />
  ),
}));

const stats = {
  resolution: 513,
  worldSize: 1024,
  vertexCount: 263_169,
  triangleCount: 524_288,
  chunkCount: 64,
  lodCount: 4,
  buildMs: 420,
  minHeight: 3.5,
  maxHeight: 188.25,
  histogram: new Array<number>(16).fill(1),
  warnings: ['8-bit heightmap: expect visible terracing. Pre-smooth is on.'],
};
const input = { file: 'inputs/heightmap.png', sourceName: 'dunes.png', width: 512, height: 512, bitDepth: 16 };
const spec = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    name: 'dunes',
    inputs: { heightmap: input },
    resolution: 513,
    worldSize: 1024,
    heightRange: [0, 200],
    lastBuild: { at: '2026-10-04T12:00:00.000Z', buildMs: 420, stats },
    ...extra,
  });
const seeded = (text = spec()): MockFixtures => ({
  ...fixtures,
  media: {
    files: {
      'terrain:terrains': { 'dunes-20261004-120000/terrain.json': text, 'dunes-20261004-120000/build/heights.f32': 'x' },
    },
  },
});

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'terrain', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function open(text = spec()) {
  renderView(<MediaView />, { fixtures: seeded(text), uiState: { selectedRepoId: 'repo-1' } });
  const explorer = document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;
  fireEvent.click(await within(explorer).findByRole('button', { name: 'dunes' }));
  return screen.findByTestId('terrain-panel');
}

describe('shading modes', () => {
  it('choosing slope updates the viewer prop', async () => {
    await open();
    const stub = await screen.findByTestId('viewer-stub');
    expect(stub.getAttribute('data-shading')).toBe('shaded');
    fireEvent.click(screen.getByRole('button', { name: /Shading: Shaded/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Slope' }));
    expect(screen.getByTestId('viewer-stub').getAttribute('data-shading')).toBe('slope');
  });

  it('land cover and splat are disabled without a satellite image, the road mask without a roads mask', async () => {
    await open();
    fireEvent.click(await screen.findByRole('button', { name: /Shading: Shaded/ }));
    const landcover = await screen.findByRole('option', { name: /Land cover/ });
    expect((landcover as HTMLButtonElement).disabled).toBe(true);
    expect(landcover.textContent).toContain('Needs a satellite image');
    expect((screen.getByRole('option', { name: /Splat/ }) as HTMLButtonElement).disabled).toBe(true);
    const roads = screen.getByRole('option', { name: /Road mask/ });
    expect((roads as HTMLButtonElement).disabled).toBe(true);
    expect(roads.textContent).toContain('Needs a roads mask');
  });

  it('enables land cover and splat once a satellite image is attached', async () => {
    await open(spec({ inputs: { heightmap: input, satellite: { ...input, file: 'inputs/satellite.png' } } }));
    fireEvent.click(await screen.findByRole('button', { name: /Shading: Shaded/ }));
    expect((await screen.findByRole('option', { name: /Land cover/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('option', { name: /Splat/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('align and brush toolbar buttons toggle viewer modes', async () => {
    await open(spec({ inputs: { heightmap: input, satellite: { ...input, file: 'inputs/satellite.png' } } }));
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.getAttribute('data-align')).toBe('false');
    expect(stub.getAttribute('data-brush')).toBe('false');

    const alignBtn = screen.getByRole('button', { name: /Align satellite image/ });
    fireEvent.click(alignBtn);
    expect(stub.getAttribute('data-align')).toBe('true');

    const brushBtn = screen.getByRole('button', { name: /Paint class/ });
    fireEvent.click(brushBtn);
    expect(stub.getAttribute('data-brush')).toBe('true');
  });

  it('the time-of-day slider drives the viewer', async () => {
    await open();
    fireEvent.change(await screen.findByRole('slider', { name: 'Time of day' }), { target: { value: '18' } });
    expect(screen.getByTestId('viewer-stub').getAttribute('data-time')).toBe('18');
  });
});

describe('alignment controls', () => {
  it('satellite alignment offset commits to spec', async () => {
    const panel = await open(spec({ inputs: { heightmap: input, satellite: { ...input, file: 'inputs/satellite.png' } } }));
    const setSpec = vi.spyOn(window.midniteStudio!.media.terrain, 'setSpec');
    const ox = within(panel).getByRole('spinbutton', { name: 'Offset X' });
    fireEvent.change(ox, { target: { value: '0.2' } });
    fireEvent.blur(ox);
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(1));
    expect(setSpec.mock.calls[0]![0]).toMatchObject({
      patch: {
        alignment: {
          satellite: {
            offset: [0.2, 0],
          },
        },
      },
    });
  });
});

describe('re-bake on parameter change', () => {
  it('committing Resolution 1025 saves the spec, then builds', async () => {
    const panel = await open();
    const api = window.midniteStudio!.media.terrain;
    const setSpec = vi.spyOn(api, 'setSpec');
    const build = vi.spyOn(api, 'build');
    fireEvent.click(within(panel).getByRole('button', { name: /Resolution/ }));
    fireEvent.click(await screen.findByRole('option', { name: /1025/ }));
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(1));
    expect(setSpec.mock.calls[0]![0]).toMatchObject({ patch: { resolution: 1025 } });
    await waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    expect(setSpec.mock.invocationCallOrder[0]!).toBeLessThan(build.mock.invocationCallOrder[0]!);
  });

  it('a number field commits on blur, not per keystroke', async () => {
    const panel = await open();
    const setSpec = vi.spyOn(window.midniteStudio!.media.terrain, 'setSpec');
    const world = within(panel).getByRole('spinbutton', { name: 'World size' });
    fireEvent.change(world, { target: { value: '2' } });
    fireEvent.change(world, { target: { value: '20' } });
    fireEvent.change(world, { target: { value: '2048' } });
    expect(setSpec).not.toHaveBeenCalled();
    fireEvent.blur(world);
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(1));
  });
});

describe('stats readout', () => {
  it('shows the last build, its warnings and a Frame row', async () => {
    await open();
    const readout = await screen.findByTestId('terrain-stats');
    expect(within(readout).getByText('263,169')).toBeTruthy();
    expect(within(readout).getByText('524,288')).toBeTruthy();
    expect(within(readout).getByText('64 · 4 LODs')).toBeTruthy();
    expect(within(readout).getByText('420 ms')).toBeTruthy();
    expect(within(readout).getByText('3.5 m')).toBeTruthy();
    expect(within(readout).getByText('188.3 m')).toBeTruthy();
    expect(within(readout).getByText('Frame')).toBeTruthy();
    expect(within(readout).getByText('8-bit heightmap: expect visible terracing. Pre-smooth is on.')).toBeTruthy();
  });

  it('with nothing built there is no viewport and no readout', async () => {
    await open(JSON.stringify({ version: 1, name: 'dunes', inputs: {} }));
    expect(screen.getByText('Nothing built yet. Attach images or choose noise, then Generate.')).toBeTruthy();
    expect(screen.queryByTestId('viewer-stub')).toBeNull();
    expect(screen.queryByTestId('terrain-stats')).toBeNull();
  });
});

describe('roads, foliage and buildings sections (Phase 105 G + H)', () => {
  const roadsInput = { ...input, file: 'inputs/roads.png' };
  const satelliteInput = { ...input, file: 'inputs/satellite.png' };

  it('the Roads section only appears with a roads mask, and shows the detected colour as Auto', async () => {
    let panel = await open();
    expect(within(panel).queryByTestId('terrain-roads-section')).toBeNull();
    cleanup();
    panel = await open(spec({ inputs: { heightmap: input, roads: roadsInput } }));
    const section = await within(panel).findByTestId('terrain-roads-section');
    expect(await within(section).findByText('Auto · #00ffff')).toBeTruthy();
    expect(within(section).getByRole('img', { name: 'Roads image' }).getAttribute('src')).toContain('inputs/roads.png');
  });

  it('the eyedropper samples the clicked point and commits the colour', async () => {
    const panel = await open(spec({ inputs: { heightmap: input, roads: roadsInput } }));
    const api = window.midniteStudio!.media.terrain;
    const roadKey = vi.spyOn(api, 'roadKey');
    const setSpec = vi.spyOn(api, 'setSpec');
    const section = await within(panel).findByTestId('terrain-roads-section');
    const pipette = within(section).getByRole('button', { name: 'Pick the road colour from the image' });
    fireEvent.click(pipette);
    expect(within(section).getByRole('button', { name: 'Cancel colour pick' }).getAttribute('aria-pressed')).toBe('true');
    const image = within(section).getByRole('img', { name: 'Roads image' });
    image.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(image, { clientX: 50, clientY: 75 });
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(1));
    expect(roadKey.mock.calls.map((c) => c[0].pick).filter(Boolean)).toEqual([[0.25, 0.75]]);
    expect(setSpec.mock.calls[0]![0]).toMatchObject({ patch: { roads: { colour: '#00fefe', tolerance: 0.25 } } });
  });

  it('dragging the tolerance previews through roadKey (debounced) and commits on release', async () => {
    const panel = await open(spec({ inputs: { heightmap: input, roads: roadsInput } }));
    const api = window.midniteStudio!.media.terrain;
    const section = await within(panel).findByTestId('terrain-roads-section');
    await within(section).findByRole('img', { name: 'Road mask preview' });
    const roadKey = vi.spyOn(api, 'roadKey');
    const setSpec = vi.spyOn(api, 'setSpec');
    const slider = within(section).getByRole('slider', { name: 'Road colour tolerance' });
    fireEvent.change(slider, { target: { value: '0.4' } });
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(setSpec).not.toHaveBeenCalled();
    await waitFor(() => expect(roadKey).toHaveBeenCalledTimes(1));
    expect(roadKey.mock.calls[0]![0]).toMatchObject({ tolerance: 0.5 });
    expect(within(section).getByRole('img', { name: 'Road mask preview' }).getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(1));
    expect(setSpec.mock.calls[0]![0]).toMatchObject({ patch: { roads: { tolerance: 0.5 } } });
  });

  it('foliage asset toggles and building heights commit to the spec', async () => {
    const panel = await open(spec({ inputs: { heightmap: input, satellite: satelliteInput } }));
    const setSpec = vi.spyOn(window.midniteStudio!.media.terrain, 'setSpec');
    const foliage = within(panel).getByTestId('terrain-foliage-section');
    const trees = within(foliage).getByRole('group', { name: 'Tree assets' });
    expect(within(trees).getByRole('button', { name: 'pine' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(trees).getByRole('button', { name: 'pine' }));
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(1));
    expect(setSpec.mock.calls[0]![0]).toMatchObject({ patch: { foliage: { assets: { tree: ['broadleaf', 'birch'], grass: ['grass-clump', 'bush'] } } } });

    const buildings = within(panel).getByTestId('terrain-buildings-section');
    const max = within(buildings).getByRole('spinbutton', { name: 'Building height maximum' });
    fireEvent.change(max, { target: { value: '30' } });
    fireEvent.blur(max);
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(2));
    expect(setSpec.mock.calls[1]![0]).toMatchObject({ patch: { buildings: { height: [4, 30] } } });
  });
});

describe('captured from Maps (Phase 108 Theme F)', () => {
  const geo = {
    center: [18.4, -33.9],
    bbox: [18.3, -34, 18.5, -33.8],
    sideM: 8000,
    capture: { project: 'maps', name: 'cape-20261007-100000' },
    attributions: ['Terrain Tiles: Mapzen, AWS Open Data'],
    capturedAt: '2026-10-07T10:00:00.000Z',
  };

  it('shows the row, attributions and a Show on map button for a capture-made terrain', async () => {
    await open(spec({ geo }));
    const row = await screen.findByTestId('terrain-geo');
    expect(row.textContent).toContain('Captured from Maps · dunes · 8.0 km');
    expect(row.textContent).toContain('Terrain Tiles: Mapzen, AWS Open Data');
    // The mounted Maps tab consumes the request at once, so record it as it is posted.
    const seen: unknown[] = [];
    const off = useMapFocus.subscribe((state) => state.request && seen.push(state.request));
    fireEvent.click(within(row).getByRole('button', { name: 'Show on map' }));
    off();
    expect(seen[0]).toMatchObject({ project: 'maps', name: 'cape-20261007-100000', center: [18.4, -33.9], sideM: 8000 });
    expect(useUiStore.getState().mediaTab).toBe('map');
  });

  it('shows no row for a terrain that was not captured', async () => {
    await open();
    expect(screen.queryByTestId('terrain-geo')).toBeNull();
  });
});
