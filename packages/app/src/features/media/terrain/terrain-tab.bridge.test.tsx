import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useToastStore } from '../../../store/toast-store';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * Media ▸ Terrain through the mock bridge (vitest/jsdom is enough: no WebGL, no layout). The tab is
 * in the strip, the explorer lists one row per `terrain.json`, a selected terrain shows its three
 * optional inputs, and Generate with no height source reports it rather than guessing.
 */
vi.mock('./terrain-viewer-lazy', () => ({ LazyTerrainViewer: () => <div data-testid="viewer-stub" /> }));

const spec = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, name: 'dunes', inputs: {}, resolution: 513, worldSize: 1024, heightRange: [0, 200], ...extra });

const input = { file: 'inputs/heightmap.png', sourceName: 'dunes.png', width: 512, height: 512, bitDepth: 16 };

const seeded = (terrainSpec = spec()): MockFixtures => ({
  ...fixtures,
  media: {
    files: {
      'terrain:terrains': {
        'dunes-20261004-120000/terrain.json': terrainSpec,
        // Build output and inputs are in the media listing too; the explorer must not show them.
        'dunes-20261004-120000/build/heights.f32': 'x',
        'dunes-20261004-120000/inputs/heightmap.png': 'x',
      },
    },
  },
});

const open = (data: MockFixtures = seeded(), uiState: Record<string, unknown> = { selectedRepoId: 'repo-1' }) =>
  renderView(<MediaView />, { fixtures: data, uiState });

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'terrain', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const explorer = () => document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;

describe('Terrain tab', () => {
  it('is the sixth tab, labelled Terrain', () => {
    open();
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toContain('Terrain');
    expect(screen.getByTestId('media-tab-label').textContent).toBe('Terrain');
  });

  it('lists one row per terrain, labelled by name and not by file', async () => {
    open();
    const row = await within(explorer()).findByRole('button', { name: 'dunes' });
    expect(row).toBeTruthy();
    expect(within(explorer()).queryByText(/heights\.f32|heightmap\.png/)).toBeNull();
    expect(within(explorer()).queryByText(/terrain\.json/)).toBeNull();
  });

  it('with no repo selected shows the open-a-repo state', () => {
    open(seeded(), { selectedRepoId: null });
    expect(screen.getByText('Open a repo')).toBeTruthy();
    expect(screen.getByText(/\.midnite\/media\/terrain\//)).toBeTruthy();
  });

  it('shows the empty-state copy when there are no terrains', async () => {
    open({ ...fixtures, media: { files: {} } });
    expect(await screen.findByText(/Create one, or ask an agent to with/)).toBeTruthy();
  });

  it('selecting a terrain shows three optional slots with their one-line explanations', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    const panel = await screen.findByTestId('terrain-panel');
    for (const label of ['Heightmap', 'Satellite', 'Roads mask']) {
      const slot = within(panel).getByRole('group', { name: label });
      expect(within(slot).getByText('(optional)')).toBeTruthy();
    }
    expect(within(panel).getByText('Greyscale image: brighter is higher. Optional.')).toBeTruthy();
    expect(within(panel).getByText('Top-down photo of the same area: textures the ground and places trees and buildings. Optional.')).toBeTruthy();
    expect(within(panel).getByText('Light roads on a dark background (cyan works best). Optional.')).toBeTruthy();
    expect(screen.getByText('Nothing built yet. Attach images or choose noise, then Generate.')).toBeTruthy();
  });

  it('refuses a file that is not PNG, JPEG or WebP without calling main', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    const panel = await screen.findByTestId('terrain-panel');
    const setInput = vi.spyOn(window.midniteStudio!.media.terrain, 'setInput');
    const picker = within(panel).getByTestId('terrain-file-heightmap');
    fireEvent.change(picker, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } });
    expect(await within(panel).findByText('Use a PNG, JPEG or WebP image.')).toBeTruthy();
    expect(setInput).not.toHaveBeenCalled();
  });

  it('attaches an image as bytes and shows its size and bit depth', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    const panel = await screen.findByTestId('terrain-panel');
    const setInput = vi.spyOn(window.midniteStudio!.media.terrain, 'setInput');
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'dunes.png', { type: 'image/png' });
    // jsdom's File has no arrayBuffer(); the real one does.
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([137, 80, 78, 71]).buffer });
    fireEvent.change(within(panel).getByTestId('terrain-file-heightmap'), { target: { files: [file] } });
    await waitFor(() => expect(setInput).toHaveBeenCalledTimes(1));
    expect(setInput.mock.calls[0]![0]).toMatchObject({ repoId: 'repo-1', project: 'terrains', terrain: 'dunes-20261004-120000', slot: 'heightmap', name: 'dunes.png' });
    expect(await within(panel).findByText('512 × 512 · 16-bit')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Remove heightmap' })).toBeTruthy();
  });

  it('removes an attached input', async () => {
    open(seeded(spec({ inputs: { heightmap: input } })));
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    const panel = await screen.findByTestId('terrain-panel');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Remove heightmap' }));
    await waitFor(() => expect(within(panel).queryByRole('button', { name: 'Remove heightmap' })).toBeNull());
  });

  it('Generate with no heightmap and no noise asks the question instead of building', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    const panel = await screen.findByTestId('terrain-panel');
    fireEvent.click(within(panel).getByRole('button', { name: 'Generate' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('Generate with a heightmap builds and the viewport and stats appear', async () => {
    open(seeded(spec({ inputs: { heightmap: input } })));
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    const panel = await screen.findByTestId('terrain-panel');
    const build = vi.spyOn(window.midniteStudio!.media.terrain, 'build');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    expect(build.mock.calls[0]![0]).toMatchObject({ terrain: 'dunes-20261004-120000', buildId: expect.any(String) });
    const readout = await screen.findByTestId('terrain-stats');
    expect(within(readout).getByText('263,169')).toBeTruthy();
    expect(await screen.findByTestId('viewer-stub')).toBeTruthy();
  });

  it('committing a resolution saves it to the spec', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    const panel = await screen.findByTestId('terrain-panel');
    const setSpec = vi.spyOn(window.midniteStudio!.media.terrain, 'setSpec');
    const world = within(panel).getByRole('spinbutton', { name: 'World size' });
    fireEvent.change(world, { target: { value: '2048' } });
    fireEvent.blur(world);
    await waitFor(() => expect(setSpec).toHaveBeenCalledTimes(1));
    expect(setSpec.mock.calls[0]![0]).toMatchObject({ patch: { worldSize: 2048 } });
  });

  it('exports the pack to a picked folder and toasts the path', async () => {
    open({ ...seeded(spec({ inputs: { heightmap: input } })), pickDirectoryResult: '/tmp/out' });
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    const panel = await screen.findByTestId('terrain-panel');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Generate' }));
    await screen.findByTestId('viewer-stub');
    const exportCall = vi.spyOn(window.midniteStudio!.media.terrain, 'export');
    fireEvent.click(screen.getByRole('button', { name: /Export Terrain pack/ }));
    await waitFor(() => expect(exportCall).toHaveBeenCalledTimes(1));
    expect(exportCall.mock.calls[0]![0]).toMatchObject({ format: 'terrain-pack', dest: '/tmp/out', lod: 1, texture: 'drape', foliage: true });
    await waitFor(() =>
      expect(useToastStore.getState().toasts).toContainEqual(
        expect.objectContaining({ message: 'Exported to /tmp/out/dunes-20261004-120000.terrain', status: 'success', action: expect.objectContaining({ label: 'Reveal' }) }),
      ),
    );
  });

  it('keeps Export disabled until the terrain is built', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dunes' }));
    await screen.findByTestId('terrain-panel');
    expect((screen.getByRole('button', { name: /Export Terrain pack/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
