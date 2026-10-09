import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';
import { riggedModels } from './sprite-rig';

/**
 * Phase 106 Theme E's form through the mock bridge (vitest/jsdom: no WebGL needed — the render itself
 * runs in `SpriteRenderHost`, covered by `render-relay.test.ts` and `rendered.test.ts` in main). The
 * picker lists only rigged, animated Models assets; choosing one shows the clip mapping; the camera
 * follows the perspective; Generate saves the model reference and the render settings.
 */
const manifest = (name: string, extra: Record<string, unknown>) =>
  JSON.stringify({
    version: 1,
    name,
    agent: { provider: 'mcp' },
    author: { name: 'test' },
    prompt: '',
    details: { triangles: 1, vertices: 3, parts: 1, size: [1, 2, 1], materials: [] },
    files: { design: `${name.toLowerCase()}.json` },
    createdAt: '2026-10-07T10:00:00.000Z',
    ...extra,
  });

const seeded: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'model:characters': {
        'knight/model.json': manifest('Knight', {
          rig: { bones: 18, facing: '+z', bound: 3 },
          animations: [
            { name: 'Walk', kind: 'walk', duration: 1.2, loop: true },
            { name: 'Idle', kind: 'idle', duration: 2.4, loop: true },
            { name: 'Wave', kind: 'custom', duration: 1, loop: false },
          ],
        }),
        'knight/knight.json': '{}',
        'crate/model.json': manifest('Crate', {}),
        'crate/crate.json': '{}',
      },
    },
  },
};

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'sprite', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
});
afterEach(cleanup);

describe('riggedModels', () => {
  it('keeps only models with a rig and animations, pointing at the design file', () => {
    const tree = [
      {
        kind: 'model' as const,
        name: 'knight',
        path: 'characters/heroes/knight',
        manifest: JSON.parse(manifest('Knight', { rig: { bones: 2 }, animations: [{ name: 'Walk', kind: 'walk', duration: 1.2 }, { name: 'Bad', kind: 'nope' }] })),
        files: [],
        legacy: false,
        mtimeMs: 1,
      },
      { kind: 'model' as const, name: 'crate', path: 'characters/crate', manifest: JSON.parse(manifest('Crate', {})), files: [], legacy: false, mtimeMs: 1 },
    ];
    expect(riggedModels(tree)).toEqual([{ project: 'characters', path: 'heroes/knight/knight.json', label: 'Knight', clips: [{ name: 'Walk', kind: 'walk', duration: 1.2 }] }]);
  });
});

describe('Rendered from 3D form', () => {
  it('picks a rigged model, shows the clip mapping, and creates the sheet with its render settings', async () => {
    renderView(<MediaView />, { fixtures: seeded, uiState: { selectedRepoId: 'repo-1' } });
    const panel = await screen.findByTestId('sprite-create-panel');
    fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'Knight' } });
    fireEvent.click(within(panel).getByRole('radio', { name: /Rendered from 3D/ }));
    const picker = (await within(panel).findByTestId('sprite-rig-picker')) as HTMLSelectElement;
    await waitFor(() => expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toContain('Knight — 3 clips'));
    expect(within(picker).queryByText(/Crate/)).toBeNull();
    fireEvent.change(picker, { target: { value: 'characters/knight/knight.json' } });

    const mapping = within(panel).getByTestId('clip-mapping');
    expect(within(mapping).getByText("walk: 12 frames at 10 fps from the model's 1.2 s clip")).toBeTruthy();
    expect(within(mapping).getByText(/No matching animation: .*jump/)).toBeTruthy();
    fireEvent.click(within(mapping).getByRole('button', { name: 'wave' }));
    expect(within(panel).getByLabelText('Clip 9 name')).toHaveProperty('value', 'wave');

    // The camera follows the perspective until it is chosen.
    fireEvent.change(within(panel).getByLabelText('Perspective'), { target: { value: 'isometric' } });
    expect((within(panel).getByLabelText('Camera') as HTMLSelectElement).value).toBe('isometric');
    fireEvent.change(within(panel).getByLabelText('Shading'), { target: { value: 'toon' } });

    fireEvent.click(within(panel).getByRole('button', { name: 'Generate' }));
    const api = window.midniteStudio!.media.sprite;
    let spec: unknown = null;
    await waitFor(async () => {
      const got = await api.get({ repoId: 'repo-1', group: 'characters', asset: 'knight-20261004-120000' });
      expect(got.ok).toBe(true);
      spec = got.ok ? got.value.spec : null;
    });
    expect(spec).toMatchObject({
      method: 'rendered',
      reference: { kind: 'model', project: 'characters', path: 'knight/knight.json' },
      render: { camera: 'isometric', shading: 'toon', supersample: 4, outline: false },
    });
  }, 30_000);
});
