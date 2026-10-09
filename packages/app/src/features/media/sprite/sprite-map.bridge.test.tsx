import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * Phase 106 Theme J through the mock bridge (vitest/jsdom — DOM roles and text; the drawn map is the
 * Playwright shot). The map form needs a tileset, takes the Models engine and decorations, and
 * generates; a built map's preview lists its layers and the collision overlay; Import .tmj… lands a
 * map asset.
 */
const MAP_TMJ = {
  type: 'map',
  orientation: 'orthogonal',
  width: 2,
  height: 2,
  tilewidth: 16,
  tileheight: 16,
  layers: [
    { type: 'tilelayer', name: 'ground', visible: true, width: 2, height: 2, data: [1, 1, 2, 1] },
    { type: 'tilelayer', name: 'decoration', visible: true, width: 2, height: 2, data: [0, 0, 0, 0] },
    { type: 'tilelayer', name: 'collision', visible: false, width: 2, height: 2, data: [0, 0, 4, 0] },
    { type: 'objectgroup', name: 'objects', visible: true, objects: [{ name: 'player', type: 'spawn', x: 8, y: 8 }] },
  ],
  tilesets: [
    { firstgid: 1, name: 'meadow', image: 'tileset.png', tilewidth: 16, tileheight: 16, columns: 8, margin: 0, spacing: 0 },
    { firstgid: 3, name: 'collision', image: 'collision.png', tilewidth: 16, tileheight: 16, columns: 2, margin: 0, spacing: 0, tiles: [{ id: 0, properties: [{ name: 'collision', value: 'solid' }] }, { id: 1, properties: [{ name: 'collision', value: 'water' }] }] },
  ],
};

const seeded: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:tilesets': { 'meadow-20261007-120000/sprite.json': JSON.stringify({ version: 1, kind: 'tileset', name: 'Meadow', lastReport: { frames: 49, failing: 0, at: '2026-10-07T10:00:00.000Z' } }) },
      'sprite:objects': { 'camp-20261007-120000/sprite.json': JSON.stringify({ version: 1, kind: 'prop-sheet', name: 'Camp', props: [{ name: 'crate', prompt: '' }] }) },
      'sprite:maps': {
        'island-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'map',
          name: 'Island',
          tileset: { group: 'tilesets', asset: 'meadow-20261007-120000' },
          engine: { kind: 'ollama', model: 'qwen2.5:7b' },
          mapSpec: { width: 2, height: 2, orientation: 'orthogonal', base: 'grass', regions: [], objects: [{ type: 'spawn', name: 'player', x: 0, y: 0 }] },
          lastReport: { frames: 4, failing: 0, at: '2026-10-07T10:00:00.000Z' },
        }),
      },
    },
  },
};

const open = () => renderView(<MediaView />, { fixtures: seeded, uiState: { selectedRepoId: 'repo-1' } });
const explorer = () => document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'sprite', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media', mediaExportDir: '/tmp/out' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(MAP_TMJ), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mapForm() {
  const panel = await screen.findByTestId('sprite-create-panel');
  fireEvent.click(within(panel).getByRole('radio', { name: 'Environment' }));
  fireEvent.change(within(panel).getByLabelText('Kind'), { target: { value: 'map' } });
  return panel;
}

describe('Map form', () => {
  it('needs a tileset, then creates the map with its engine and decorations and generates it', async () => {
    open();
    const panel = await mapForm();
    const api = window.midniteStudio!.media.sprite;
    const create = vi.spyOn(api, 'library');
    const generate = vi.spyOn(api, 'generate');
    fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'Isle' } });
    expect(within(panel).getByRole('button', { name: 'Generate' }).getAttribute('aria-disabled')).toBe('true');
    const fields = within(panel).getByTestId('map-fields');
    await within(fields).findByRole('option', { name: 'meadow' });
    fireEvent.change(within(fields).getByLabelText('Tileset'), { target: { value: 'meadow-20261007-120000' } });
    fireEvent.change(within(fields).getByLabelText('Map width'), { target: { value: '400' } });
    await within(fields).findByRole('option', { name: 'camp' });
    fireEvent.change(within(fields).getByLabelText('Decorations'), { target: { value: 'camp-20261007-120000' } });
    expect(within(fields).getByTestId('map-engine').textContent).toContain('Layout by Ollama');
    fireEvent.click(within(panel).getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(generate).toHaveBeenCalled());
    const spec = (create.mock.calls[0]![0] as { spec: Record<string, unknown> }).spec;
    expect(spec).toMatchObject({ kind: 'map', tileset: 'meadow-20261007-120000', size: [256, 24], decorations: { props: 'camp-20261007-120000' }, engine: { kind: 'ollama' } });
  }, 30_000);

  it('imports a .tmj as a map asset', async () => {
    open();
    const panel = await mapForm();
    const api = window.midniteStudio!.media.sprite;
    const importMap = vi.spyOn(api, 'importMap');
    fireEvent.click(within(panel).getByRole('button', { name: 'Import .tmj…' }));
    await waitFor(() => expect(importMap).toHaveBeenCalledWith({ repoId: 'repo-1' }));
  }, 30_000);
});

describe('Map asset', () => {
  it('shows the map with a checkbox per layer, the collision overlay and its layout', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'island' }));
    const preview = await screen.findByTestId('sprite-map-preview');
    expect(within(preview).getByRole('img').getAttribute('aria-label')).toContain('2 × 2 tiles, orthogonal');
    for (const layer of ['ground', 'decoration', 'objects']) expect(within(preview).getByRole('checkbox', { name: `Layer ${layer}` })).toHaveProperty('checked', true);
    expect(within(preview).getByRole('checkbox', { name: 'Layer collision' })).toHaveProperty('checked', false);
    fireEvent.click(within(preview).getByRole('checkbox', { name: 'Collision overlay' }));
    expect(within(preview).getByRole('checkbox', { name: 'Collision overlay' })).toHaveProperty('checked', true);
    fireEvent.keyDown(within(preview).getByRole('img'), { key: '+' });
    const overview = screen.getByTestId('sprite-overview');
    expect(overview.textContent).toContain('0 regions, 0 rooms, 0 corridors, 0 paths, 1 objects');
    expect(overview.textContent).toContain('Ollama · qwen2.5:7b');
    expect(within(overview).getByRole('button', { name: 'Generate' })).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain('/maps/island-20261007-120000/map.tmj');
  }, 30_000);
});
