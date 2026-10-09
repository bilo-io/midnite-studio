import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * Phase 106 Theme G through the mock bridge (vitest/jsdom: roles, text and the bridge calls; the
 * canvas itself needs no layout here). A sheet's centre shows the previewer, the direction compass
 * and the frame strip; Export writes the pack to the Media export folder.
 */
const sheet = (name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    kind: 'sheet',
    name,
    targetPerspective: 'top-down',
    directions: 4,
    method: 'rendered',
    clips: [
      { name: 'idle', frames: 3, fps: 6, loop: 'loop' },
      { name: 'walk', frames: 2, fps: 10, loop: 'loop' },
    ],
    ...extra,
  });
const frames = (keys: string[]) => JSON.stringify({ frames: Object.fromEntries(keys.map((k) => [k, { anchorNudge: [0, 0], flipped: false, source: 'rendered', badges: [] }])) });

const seeded: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:characters': {
        'scout-20261007-120000/sprite.json': sheet('Scout'),
        'scout-20261007-120000/frames/frames.json': frames(['idle/s/000', 'idle/s/001', 'idle/s/002', 'idle/s/007', 'idle/n/000', 'walk/s/000']),
        'blank-20261007-120000/sprite.json': sheet('Blank'),
      },
    },
  },
};

const open = () => renderView(<MediaView />, { fixtures: seeded, uiState: { selectedRepoId: 'repo-1' } });
const explorer = () => document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'sprite', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media', mediaExportDir: '/tmp/out' });
});
afterEach(cleanup);

describe('Sprite previewer and frame strip', () => {
  it('shows the clip, a compass with only the sheet’s directions, and the strip for the chosen direction', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'scout' }));
    const previewer = await screen.findByTestId('sprite-previewer');
    expect((within(previewer).getByLabelText('Clip') as HTMLSelectElement).value).toBe('idle');
    // The stale idle/s/007 (past the clip's 3 frames) is neither played nor listed.
    expect(within(previewer).getByTestId('sprite-previewer-frame').textContent).toBe('1 / 3');
    expect(screen.getAllByRole('option', { name: /^Frame / })).toHaveLength(3);
    const compass = within(previewer).getByRole('radiogroup', { name: 'Direction' });
    const enabled = within(compass)
      .getAllByRole('radio')
      .filter((b) => !(b as HTMLButtonElement).disabled)
      .map((b) => b.textContent);
    expect(enabled.sort()).toEqual(['e', 'n', 's', 'w']);
    fireEvent.click(within(compass).getByRole('radio', { name: 'N' }));
    await waitFor(() => expect(screen.getAllByRole('option', { name: /^Frame / })).toHaveLength(1));
    // `]` moves to the next clip while the previewer has focus.
    fireEvent.keyDown(previewer, { key: ']' });
    expect((within(previewer).getByLabelText('Clip') as HTMLSelectElement).value).toBe('walk');
  }, 30_000);

  it('Export writes the pack to the Media export folder', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'scout' }));
    await screen.findByTestId('sprite-previewer');
    const exportSpy = vi.spyOn(window.midniteStudio!.media.sprite, 'export');
    fireEvent.click(screen.getByRole('button', { name: 'Export Sprite pack (folder)' }));
    await waitFor(() => expect(exportSpy).toHaveBeenCalledWith(expect.objectContaining({ group: 'characters', asset: 'scout-20261007-120000', dest: '/tmp/out' })));
  }, 30_000);

  it('a sheet with no frames says how to get some', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'blank' }));
    const previewer = await screen.findByTestId('sprite-previewer');
    expect(within(previewer).getByText('No frames yet. Pick a method and Generate.')).toBeTruthy();
  }, 30_000);
});
