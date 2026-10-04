import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * The parameter panel and the viewport's props (Phase 105 Theme D). vitest/jsdom is enough: the R3F
 * canvas is replaced by a stub that exposes the props it was given, as `model-tab.bridge.test.tsx` does.
 */
vi.mock('./terrain-viewer-lazy', () => ({
  LazyTerrainViewer: (props: { shading: string; timeOfDay: number }) => (
    <div data-testid="viewer-stub" data-shading={props.shading} data-time={props.timeOfDay} />
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

  it('enables land cover once a satellite image is attached', async () => {
    await open(spec({ inputs: { heightmap: input, satellite: { ...input, file: 'inputs/satellite.png' } } }));
    fireEvent.click(await screen.findByRole('button', { name: /Shading: Shaded/ }));
    expect((await screen.findByRole('option', { name: /Land cover/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('the time-of-day slider drives the viewer', async () => {
    await open();
    fireEvent.change(await screen.findByRole('slider', { name: 'Time of day' }), { target: { value: '18' } });
    expect(screen.getByTestId('viewer-stub').getAttribute('data-time')).toBe('18');
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
