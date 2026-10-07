import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';
import { handOffBlocker } from './sprite-one-shot-panel';

/**
 * Phase 106 Theme F through the mock bridge (vitest/jsdom: the grid overlay is percentages, no layout
 * needed). The form shows the grid it would ask for and refuses one over 8 × 8; a one-shot sheet shows
 * the grid preview and the per-row verdict, and a failing row hands its clip to Hand-drawn.
 */
const oneShot = (extra: Record<string, unknown> = {}) => ({
  promptVersion: 1,
  grid: { columns: 3, rows: 2, cell: [64, 64], gutter: 8 },
  aspect: '16:9',
  rows: [
    { clip: 'idle', dir: 'e' },
    { clip: 'attack', dir: 'e' },
  ],
  image: { width: 1024, height: 576 },
  detected: { columns: [[40, 300], [380, 640], [720, 980]], rows: [[30, 270], [310, 550]] },
  ...extra,
});
const sheet = (name: string, extra: Record<string, unknown>) =>
  JSON.stringify({
    version: 1,
    kind: 'sheet',
    name,
    method: 'one-shot',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    clips: [
      { name: 'idle', frames: 3, fps: 6, loop: 'loop' },
      { name: 'attack', frames: 3, fps: 10, loop: 'once' },
    ],
    ...extra,
  });
const meta = (badges: string[]) => ({ anchorNudge: [0, 0], flipped: false, source: 'sliced', badges });

const seeded: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:characters': {
        'knight-20261007-120000/sprite.json': sheet('Knight', { oneShot: oneShot() }),
        'knight-20261007-120000/frames/frames.json': JSON.stringify({
          frames: {
            'idle/e/000': meta([]),
            'idle/e/001': meta([]),
            'idle/e/002': meta([]),
            'attack/e/000': meta([]),
            'attack/e/001': meta(['clipped']),
            'attack/e/002': meta(['clipped', 'grid']),
          },
        }),
        'rogue-20261007-120000/sprite.json': sheet('Rogue', { oneShot: oneShot({ mismatch: 'Expected 3 × 2 cells, found 2 × 2. Nothing was sliced.' }) }),
      },
    },
  },
};

const open = () => renderView(<MediaView />, { fixtures: seeded, uiState: { selectedRepoId: 'repo-1' } });
const explorer = () => document.querySelector<HTMLElement>('[data-media-pane="explorer"]')!;

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'sprite', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
});
afterEach(cleanup);

describe('One-shot sheet', () => {
  it('shows the grid it would ask for and refuses one over 8 × 8', async () => {
    open();
    const panel = await screen.findByTestId('sprite-create-panel');
    fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'Knight' } });
    fireEvent.change(within(panel).getByLabelText('Prompt'), { target: { value: 'a knight' } });
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Try generating the whole sheet in one image' }));
    const options = within(panel).getByTestId('one-shot-options');
    expect(options.textContent).toContain('One image: 8 columns × 8 rows of 64×64 cells, 8 px gutters');
    expect(within(panel).getByRole('button', { name: 'Generate' })).toHaveProperty('disabled', false);
    fireEvent.change(within(panel).getByLabelText('walk frames'), { target: { value: '9' } });
    expect(within(options).getByRole('alert').textContent).toBe('Too many frames for one image — use at most 8 frames and 8 rows, or switch to Hand-drawn.');
    expect(within(panel).getByRole('button', { name: 'Generate' })).toHaveProperty('disabled', true);
  }, 30_000);

  it('shows the grid preview and per-row verdict, and hands a failing row to Hand-drawn', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'knight' }));
    const panel = await screen.findByTestId('sprite-one-shot');
    expect(within(panel).getByTestId('one-shot-grid').querySelectorAll('div[aria-hidden]')).toHaveLength(6);
    const verdict = within(panel).getByRole('list', { name: 'Verdict' });
    expect(within(verdict).getByText('row 1, idle: 3 frames ok')).toBeTruthy();
    expect(within(verdict).getByText('row 2, attack: 2 of 3 frames clipped')).toBeTruthy();
    const buttons = within(verdict).getAllByRole('button', { name: 'Regenerate this clip with Hand-drawn' });
    expect(buttons).toHaveLength(1);

    const api = window.midniteStudio!.media.sprite;
    const setReference = vi.spyOn(api, 'setReference');
    const generate = vi.spyOn(api, 'generate');
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(setReference).toHaveBeenCalledWith(expect.objectContaining({ group: 'characters', asset: 'knight-20261007-120000', fromFrame: { clip: 'attack', dir: 'e', n: 0 } }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ clips: ['attack'], method: 'hand-drawn' }));
  }, 30_000);

  it('a grid mismatch is the verdict, and nothing is offered to slice', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'rogue' }));
    const panel = await screen.findByTestId('sprite-one-shot');
    expect(within(panel).getByRole('alert').textContent).toBe('Expected 3 × 2 cells, found 2 × 2. Nothing was sliced.');
    expect(within(panel).queryByRole('button', { name: 'Regenerate this clip with Hand-drawn' })).toBeNull();
  }, 30_000);

  it('the hand-off is disabled with D\'s reason on a provider that cannot take a reference', () => {
    expect(handOffBlocker({ provider: 'gemini', model: 'gemini-2.5-flash-image' })).toBeNull();
    expect(handOffBlocker({ provider: 'ollama', model: 'x' })).toMatch(/reference/i);
  });
});
