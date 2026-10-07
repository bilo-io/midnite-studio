import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * Media ▸ Sprites through the mock bridge (vitest/jsdom is enough: no layout, no canvas). The tab is
 * labelled Sprites, the explorer always shows its five groups with the seeded asset under
 * Characters, and the create panel swaps between its Sheet and Environment forms.
 */
const sheet = JSON.stringify({ version: 1, kind: 'sheet', name: 'hero', method: 'hand-drawn', clips: [{ name: 'idle', frames: 4, fps: 6, loop: 'loop' }] });

const seeded: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:characters': {
        'hero-20261004-120000/sprite.json': sheet,
        // Frames are in the media listing too; the explorer must not show them.
        'hero-20261004-120000/frames/idle/e/000.png': 'x',
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

describe('Sprites tab', () => {
  it('is labelled Sprites', () => {
    open();
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toContain('Sprites');
    expect(screen.getByTestId('media-tab-label').textContent).toBe('Sprites');
  }, 30_000);

  it('shows all five groups and hero under Characters', async () => {
    open();
    const row = await within(explorer()).findByRole('button', { name: 'hero' });
    expect(row).toBeTruthy();
    for (const title of ['Characters', 'Objects', 'Tilesets', 'Backgrounds', 'Maps']) {
      expect(within(explorer()).getByText(title)).toBeTruthy();
    }
    expect(within(explorer()).queryByText(/000\.png/)).toBeNull();
  });

  it('selecting an asset shows its clips and a Generate button', async () => {
    open();
    fireEvent.click(await within(explorer()).findByRole('button', { name: 'hero' }));
    const overview = await screen.findByTestId('sprite-overview');
    expect(within(overview).getByRole('table', { name: 'Clips' })).toBeTruthy();
    // Hand-drawn draws frames only once a reference is approved (Theme D).
    expect(within(overview).getByRole('button', { name: 'Generate frames' })).toBeTruthy();
  });

  it('swaps the create form between Sheet and Environment', async () => {
    open();
    const panel = await screen.findByTestId('sprite-create-panel');
    expect(within(panel).getByRole('radio', { name: 'Sheet' }).getAttribute('aria-checked')).toBe('true');
    expect(within(panel).getByText('Method')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('radio', { name: 'Environment' }));
    expect(within(panel).getByLabelText('Kind')).toBeTruthy();
    expect(within(panel).queryByText('Method')).toBeNull();
  });

  it('creating an environment asset puts it in its group and selects it', async () => {
    open();
    const panel = await screen.findByTestId('sprite-create-panel');
    fireEvent.click(within(panel).getByRole('radio', { name: 'Environment' }));
    fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'meadow' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(within(explorer()).getByRole('button', { name: 'meadow' })).toBeTruthy());
    expect(await screen.findByTestId('sprite-overview')).toBeTruthy();
  });
});
