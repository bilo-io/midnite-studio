import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';
import { usePlayer } from './player-store';

/**
 * Phase 99 Theme E — the Audio tab through the mock bridge: sessions and
 * variants read from project.json + sidecars, Create's "later phase" state,
 * Import landing a session, and the bottom player surviving a tab switch but
 * pausing when the Media view is left.
 */
const history = {
  version: 1,
  sessions: [
    {
      id: 's1',
      kind: 'import',
      provider: 'import',
      prompt: { title: 'Night drive', style: ['synthwave'], lyrics: '', instrumental: true, durationS: 120, count: 2 },
      variants: ['a.mp3', 'b.mp3'],
      createdAt: '2026-09-30T10:00:00.000Z',
    },
  ],
};
const sidecar = (file: string, title: string) =>
  JSON.stringify({ version: 1, file, sessionId: 's1', provider: 'import', title, peaks: [0.2, 1, 0.5], durationS: 65, createdAt: 'x' });

const withAudio: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'audio:album': {
        'project.json': JSON.stringify(history),
        'a.mp3': 'mp3',
        'a.json': sidecar('a.mp3', 'Take A'),
        'b.mp3': 'mp3',
        'b.json': sidecar('b.mp3', 'Take B'),
        'stray.wav': 'wav',
      },
    },
  },
};

const open = (data: MockFixtures = withAudio) =>
  renderView(<MediaView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  });
  usePlayer.getState().stop();
  useUiStore.setState({ mediaTab: 'audio', mediaPaneCollapsed: {}, collapsedAccordionSections: [], activeView: 'media' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Audio tab', () => {
  it('shows the session with its variants, cached waveforms, and unsorted files', async () => {
    open();
    const session = await screen.findByRole('region', { name: 'Night drive' });
    expect(within(session).getByText('Take A')).toBeTruthy();
    expect(within(session).queryByText('synthwave')).toBeNull();
    fireEvent.click(within(session).getAllByRole('button', { name: /Show details for/ })[0]!);
    expect(within(session).getByText('synthwave')).toBeTruthy();
    expect(within(session).getAllByTestId('waveform')).toHaveLength(2);
    expect(within(session).getAllByText('1:05')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Unsorted' })).toBeTruthy();
  });

  it('Create answers the later-phase state; Import lands a new session', async () => {
    open();
    await screen.findByRole('region', { name: 'Night drive' });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('status').textContent).toMatch(/later phase/);
    fireEvent.change(screen.getByPlaceholderText('Night drive'), { target: { value: 'Morning' } });
    // Import lives behind the lyrics composer's "+" drop-up.
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Import audio…' }));
    });
    expect(await screen.findByRole('region', { name: 'Morning' })).toBeTruthy();
  });

  it('plays into the docked player, survives a tab switch, and pauses on leaving Media', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Play Take A' }));
    const player = await screen.findByRole('region', { name: 'Audio player' });
    expect(within(player).getByText('Take A')).toBeTruthy();
    expect(usePlayer.getState().playing).toBe(true);

    fireEvent.click(within(player).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(player).getByText('Take B')).toBeTruthy());

    act(() => useUiStore.setState({ mediaTab: 'image' }));
    expect(usePlayer.getState().playing).toBe(true);

    act(() => useUiStore.setState({ activeView: 'graph' }));
    expect(usePlayer.getState().playing).toBe(false);
  });

  it('Space toggles playback outside text fields only', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Play Take A' }));
    await screen.findByRole('region', { name: 'Audio player' });
    fireEvent.keyDown(screen.getByPlaceholderText('Night drive'), { key: ' ' });
    expect(usePlayer.getState().playing).toBe(true);
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(usePlayer.getState().playing).toBe(false);
  });

  it('an empty audio tab offers a CTA that reopens the prompt panel', async () => {
    useUiStore.setState({ mediaPaneCollapsed: { audio: { detail: true } } });
    open(fixtures);
    expect(await screen.findByText('No audio yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Write a prompt' }));
    expect(useUiStore.getState().mediaPaneCollapsed.audio?.detail).toBe(false);
  });
});
