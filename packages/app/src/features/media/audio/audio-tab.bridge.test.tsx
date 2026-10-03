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
 * variants read from project.json + sidecars, Create rendering a session through
 * the local engine, the model-download and Ollama-enhance states, Import landing a session, and the bottom player surviving a tab switch but
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

  it('Create renders variants into a new session; Import still lands one too', async () => {
    open();
    await screen.findByRole('region', { name: 'Night drive' });
    fireEvent.change(screen.getByPlaceholderText('Night drive'), { target: { value: 'Morning' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' }).getAttribute('aria-disabled')).toBeNull());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    });
    expect(await screen.findByRole('region', { name: 'Morning' })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Night drive'), { target: { value: 'Evening' } });
    // Import lives behind the lyrics composer's "+" drop-up.
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Import audio…' }));
    });
    expect(await screen.findByRole('region', { name: 'Evening' })).toBeTruthy();
  });

  it('offers Import exactly once (the + menu) beside the MusicGen provider picker', async () => {
    open();
    await screen.findByRole('region', { name: 'Night drive' });
    expect(screen.getByTestId('audio-picker')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }));
    expect(screen.getAllByText(/Import/i).filter((el) => el.closest('[role="menuitem"]'))).toHaveLength(1);
  });

  it('blocks Create until the local model is downloaded, and offers the download', async () => {
    open({
      ...withAudio,
      media: {
        ...withAudio.media,
        audioEngine: {
          musicgen: { state: 'missing', downloadBytes: 660_000_000 },
          ollama: { running: false, models: [], model: null, recommended: 'llama3.2:3b' },
        },
      },
    });
    const card = await screen.findByTestId('audio-engine');
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Download model' })).toBeTruthy());
    expect(within(card).getByText(/660 MB/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('shows the engine failure reason when the native runtime is unavailable', async () => {
    open({
      ...withAudio,
      media: {
        ...withAudio.media,
        audioEngine: {
          musicgen: { state: 'unavailable', downloadBytes: 0, reason: "Cannot find module 'onnxruntime-node'" },
          ollama: { running: true, models: [], model: null, recommended: 'llama3.2:3b' },
        },
      },
    });
    expect((await screen.findByRole('alert')).textContent).toMatch(/onnxruntime-node/);
  });

  it('Enhance fills the caption and section arc from Ollama, and Clear drops the arc', async () => {
    open();
    await screen.findByRole('region', { name: 'Night drive' });
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'lofi,' } });
    const enhance = await screen.findByRole('button', { name: /Enhance with Ollama/ });
    await waitFor(() => expect((enhance as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(enhance);
    });
    await waitFor(() => expect((screen.getByLabelText('Caption sent to MusicGen') as HTMLTextAreaElement).value).toBe('lofi, warm analog synths, 90 bpm'));
    expect(screen.getByText(/2 section captions/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect((screen.getByLabelText('Caption sent to MusicGen') as HTMLTextAreaElement).value).toBe('');
  });

  it('disables Enhance with the reason when Ollama is not running', async () => {
    open({
      ...withAudio,
      media: {
        ...withAudio.media,
        audioEngine: {
          musicgen: { state: 'ready', downloadBytes: 0 },
          ollama: { running: false, models: [], model: null, recommended: 'llama3.2:3b' },
        },
      },
    });
    fireEvent.change(await screen.findByPlaceholderText('Night drive'), { target: { value: 'Rain' } });
    const enhance = await screen.findByRole('button', { name: /Enhance with Ollama/ });
    await waitFor(() => expect((enhance as HTMLButtonElement).disabled).toBe(true));
    expect(enhance.getAttribute('title')).toMatch(/not running/);
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
