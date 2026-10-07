import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * Phase 106 Themes H and I through the mock bridge (vitest/jsdom — DOM roles and text; the pictures
 * themselves are the Playwright shots). The Environment form builds a tileset spec with terrains and
 * transitions, a background with scroll factors, a prop sheet from lines, and renders a terrain; an
 * asset shows its preview, and the parallax camera moves each layer by its scroll factor.
 */
const tileset = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    kind: 'tileset',
    name: 'Meadow',
    style: 'pixel',
    tileSize: 32,
    scheme: 'blob47',
    terrains: [
      { id: 'grass', label: 'Grass', prompt: 'grass', collision: 'walkable' },
      { id: 'water', label: 'Water', prompt: 'water', collision: 'water' },
    ],
    transitions: [{ a: 'grass', b: 'water' }],
    lastReport: { frames: 49, failing: 0, at: '2026-10-07T10:00:00.000Z' },
    ...extra,
  });
const layer = (name: string, scrollFactor: number) => ({ name, prompt: '', scrollFactor });

const seeded: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:tilesets': { 'meadow-20261007-120000/sprite.json': tileset(), 'isle-20261007-120000/sprite.json': tileset({ name: 'Isle', fromTerrain: { project: 'terrains', terrain: 'isle-1', metresPerTile: 4 } }) },
      'sprite:backgrounds': {
        'dusk-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'background',
          name: 'Dusk',
          style: 'flat',
          size: [1920, 1080],
          layers: [layer('sky', 0), layer('far', 0.2), layer('mid', 0.5), layer('near', 0.8)],
          lastReport: { frames: 4, failing: 0, at: '2026-10-07T10:00:00.000Z' },
        }),
      },
      'sprite:objects': {
        'camp-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'prop-sheet',
          name: 'Camp',
          style: 'flat',
          cell: [32, 32],
          props: [{ name: 'crate', prompt: '' }, { name: 'barrel', prompt: '' }],
          lastReport: { frames: 2, failing: 0, at: '2026-10-07T10:00:00.000Z' },
        }),
      },
      'terrain:terrains': { 'isle-1/terrain.json': JSON.stringify({ version: 1, name: 'Isle' }) },
    },
  },
};

const open = () => renderView(<MediaView />, { fixtures: seeded, uiState: { selectedRepoId: 'repo-1' } });
const explorer = () => document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'sprite', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media', mediaExportDir: '/tmp/out' });
});
afterEach(cleanup);

async function environmentPanel() {
  const panel = await screen.findByTestId('sprite-create-panel');
  fireEvent.click(within(panel).getByRole('radio', { name: 'Environment' }));
  return panel;
}

describe('Environment form', () => {
  it('creates a tileset with its terrains, a transition and the chosen autotiling, then generates it', async () => {
    open();
    const panel = await environmentPanel();
    const api = window.midniteStudio!.media.sprite;
    const create = vi.spyOn(api, 'library');
    const generate = vi.spyOn(api, 'generate');
    fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'Meadow' } });
    fireEvent.change(within(panel).getByLabelText('Tile size'), { target: { value: '16' } });
    fireEvent.change(within(panel).getByLabelText('Autotiling'), { target: { value: 'corner16' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add terrain' }));
    expect(within(panel).getByLabelText('Terrain 3 name')).toHaveProperty('value', 'Sand');
    fireEvent.click(within(panel).getByRole('button', { name: 'Add transition' }));
    fireEvent.change(within(panel).getByLabelText('Transition 2 over'), { target: { value: 'sand' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(generate).toHaveBeenCalled());
    const spec = (create.mock.calls[0]![0] as { spec: Record<string, unknown> }).spec;
    expect(spec).toMatchObject({ kind: 'tileset', tileSize: 16, scheme: 'corner16', projection: 'orthogonal' });
    expect(spec.transitions).toEqual([{ a: 'grass', b: 'dirt' }, { a: 'grass', b: 'sand' }]);
    expect((spec.terrains as Array<{ id: string }>).map((t) => t.id)).toEqual(['grass', 'dirt', 'sand']);
  }, 30_000);

  it('tells how many tiles the set will have, and blocks a transition whose terrain was removed', async () => {
    open();
    const panel = await environmentPanel();
    const transitions = within(panel).getByTestId('tileset-transitions');
    expect(transitions.textContent).toContain('49 tiles in all');
    fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove Dirt' }));
    // two terrains is the least, so the button is disabled and nothing was removed
    expect(within(panel).getByLabelText('Terrain 2 name')).toHaveProperty('value', 'Dirt');
    fireEvent.change(within(panel).getByLabelText('Kind'), { target: { value: 'isometric' } });
    expect(within(panel).getByTestId('tileset-transitions').textContent).toContain('diamond floors and a block per terrain');
    expect(within(panel).getByTestId('tileset-transitions').textContent).toContain('51 tiles in all');
  }, 30_000);

  it('offers a Terrain to render instead of drawing tiles, and says isometric maps are flat', async () => {
    open();
    const panel = await environmentPanel();
    fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'Isle' } });
    fireEvent.change(within(panel).getByLabelText('Kind'), { target: { value: 'isometric' } });
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Render a terrain' }));
    expect(within(panel).queryByTestId('tileset-terrains')).toBeNull();
    const source = within(panel).getByTestId('tileset-terrain-source');
    expect(source.textContent).toContain('Isometric maps from terrain are flat; height is not drawn.');
    expect(within(panel).getByRole('button', { name: 'Generate' })).toHaveProperty('disabled', true);
    await within(source).findByRole('option', { name: 'terrains' });
    fireEvent.change(within(source).getByLabelText('Terrain group'), { target: { value: 'terrains' } });
    await within(source).findByRole('option', { name: 'isle-1' });
    fireEvent.change(within(source).getByRole('combobox', { name: 'Terrain' }), { target: { value: 'isle-1' } });
    fireEvent.change(within(source).getByLabelText('Metres per tile'), { target: { value: '8' } });
    expect(within(panel).getByRole('button', { name: 'Generate' })).toHaveProperty('disabled', false);
  }, 30_000);

  it('a background lists its layers back to front with their scroll factors', async () => {
    open();
    const panel = await environmentPanel();
    fireEvent.change(within(panel).getByLabelText('Kind'), { target: { value: 'background' } });
    const layers = within(panel).getByTestId('background-layers');
    expect(within(layers).getByLabelText('Layer 1 name')).toHaveProperty('value', 'sky');
    expect(within(layers).getByLabelText('Layer 4 scroll factor')).toHaveProperty('value', '0.8');
    expect(within(layers).getByRole('button', { name: 'Remove sky' })).toBeTruthy();
    fireEvent.click(within(layers).getByRole('button', { name: 'Add layer' }));
    expect(within(layers).getByLabelText('Layer 5 name')).toHaveProperty('value', 'layer-5');
    expect(within(layers).getByRole('button', { name: 'Add layer' })).toHaveProperty('disabled', true);
  }, 30_000);

  it('a prop sheet counts the props typed', async () => {
    open();
    const panel = await environmentPanel();
    fireEvent.change(within(panel).getByLabelText('Kind'), { target: { value: 'prop-sheet' } });
    expect(panel.textContent).toContain('3 props');
    fireEvent.change(within(panel).getByLabelText('Props'), { target: { value: 'crate: a crate' } });
    expect(panel.textContent).toContain('1 prop,');
  }, 30_000);
});

describe('Environment assets', () => {
  it('a tileset shows its sheet, its base tiles and what it holds', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'meadow' }));
    const preview = await screen.findByTestId('sprite-environment-preview');
    expect(within(preview).getByAltText('Tileset').getAttribute('src')).toContain('/tilesets/meadow-20261007-120000/tileset.png');
    expect(within(preview).getByRole('list', { name: 'Base tiles' }).querySelectorAll('li')).toHaveLength(2);
    const overview = screen.getByTestId('sprite-overview');
    expect(within(overview).getByText('49')).toBeTruthy();
    expect(overview.textContent).toContain('47-tile blob');
    expect(overview.textContent).toContain('grass → water');
    expect(within(overview).getByRole('button', { name: 'Generate' })).toBeTruthy();
  }, 30_000);

  it('a terrain-sourced tileset names its terrain and has no base tiles', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'isle' }));
    const preview = await screen.findByTestId('sprite-environment-preview');
    expect(preview.textContent).toContain('Cut from isle-1 at 4 m per tile');
    expect(within(preview).queryByRole('list', { name: 'Base tiles' })).toBeNull();
  }, 30_000);

  it('the parallax camera moves each layer by its scroll factor', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'dusk' }));
    const stage = await screen.findByTestId('parallax-stage');
    fireEvent.change(screen.getByLabelText('Camera'), { target: { value: '100' } });
    const offset = (name: string) => within(stage).getByTestId(`parallax-layer-${name}`).style.backgroundPosition;
    expect(offset('sky')).toBe('0px 0px');
    expect(offset('far')).toBe('-20px 0px');
    expect(offset('near')).toBe('-80px 0px');
    expect(screen.getByRole('list', { name: 'Scroll factors' }).textContent).toContain('mid 0.5');
  }, 30_000);

  it('a prop sheet shows each prop', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'camp' }));
    const list = await screen.findByRole('list', { name: 'Props' });
    expect(within(list).getByAltText('crate').getAttribute('src')).toContain('/props/crate/000.png');
    expect(list.querySelectorAll('li')).toHaveLength(2);
  }, 30_000);

  it('exports through the shared export bar', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'meadow' }));
    const preview = await screen.findByTestId('sprite-environment-preview');
    const api = window.midniteStudio!.media.sprite;
    const exportSpy = vi.spyOn(api, 'export');
    fireEvent.click(within(preview).getByRole('button', { name: 'Export Sprite pack (folder)' }));
    await waitFor(() => expect(exportSpy).toHaveBeenCalledWith(expect.objectContaining({ group: 'tilesets', dest: '/tmp/out' })));
  }, 30_000);
});
