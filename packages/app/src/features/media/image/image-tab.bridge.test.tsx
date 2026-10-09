import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * Phase 99 Theme C — the Images tab through the mock bridge: the "+" tile
 * reopening the create panel, lightbox keyboard stepping with wrap-around,
 * the provider picker's chosen value, and a Generate landing a new tile.
 */
const withImages: MockFixtures = {
  ...fixtures,
  media: { files: { 'image:launch': { 'a.png': 'png', 'b.png': 'png', 'a.json': '{}' } } },
};

const open = (data: MockFixtures = withImages) =>
  renderView(<MediaView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'image', mediaPaneCollapsed: {}, collapsedAccordionSections: [] });
});
afterEach(cleanup);

describe('Images tab', () => {
  it('lists only image files, and the "+" tile reopens a collapsed create panel', async () => {
    useUiStore.setState({ mediaPaneCollapsed: { image: { detail: true } } });
    open();
    expect(await screen.findByRole('button', { name: 'Open a.png' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open a.json' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate image' }));
    });
    expect(useUiStore.getState().mediaPaneCollapsed.image?.detail).toBe(false);
  });

  it('steps the lightbox with ←/→, wrapping, and closes on Escape', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Open a.png' }));
    const position = () => screen.getByTestId('lightbox-position').textContent;
    const first = position();
    expect(first).toMatch(/^[12]\/2$/);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const second = position();
    expect(second).not.toBe(first);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(position()).toBe(first);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(position()).toBe(second);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the picker in the composer on the recommended model and generates into the project', async () => {
    open({
      ...withImages,
      media: {
        ...withImages.media,
        imageProviders: [
          { id: 'gemini', available: true, missingKey: false, models: [] },
          { id: 'agy', available: true, missingKey: false, models: [] },
        ],
      },
    });
    await screen.findByRole('button', { name: 'Open a.png' });
    expect(screen.getByRole('button', { name: 'Provider: Antigravity CLI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Model: Gemini 2.5 Flash Image' })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/lighthouse/), { target: { value: 'a fox' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate$/ }));
    });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Open img-/ })).toHaveLength(1));
  });

  it('an empty gallery offers a Generate image CTA that opens the create panel', async () => {
    useUiStore.setState({ mediaPaneCollapsed: { image: { detail: true } } });
    open(fixtures);
    expect(await screen.findByText('No images yet')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate image' }));
    });
    expect(useUiStore.getState().mediaPaneCollapsed.image?.detail).toBe(false);
  });
});
