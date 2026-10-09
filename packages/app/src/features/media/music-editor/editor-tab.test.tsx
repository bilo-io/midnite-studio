import { SongSchema } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

// Tone.js needs a real AudioContext; the engine has its own tests.
vi.mock('./engine/use-music-engine', () => ({ useMusicEngine: () => ({ engine: null, state: 'stopped' }) }));

/** Phase 101 Theme E — loading, arrangement controls and undo. DOM roles only, so vitest/jsdom. */
const demo = {
  name: 'Demo',
  tracks: [
    { id: 'lead', name: 'Lead', program: 40, notes: [{ pitch: 60, startTick: 0, durationTicks: 480, velocity: 90 }] },
    { id: 'kit', name: 'Kit', channel: 9 },
  ],
};
const data = () => ({
  ...fixtures,
  media: { files: { 'audio:album': { 'Demo.mid': 'mid', 'Demo.song.json': JSON.stringify(demo) } } },
});

const openEditor = async () => {
  useUiStore.setState({ mediaTab: 'audio', mediaPaneCollapsed: {}, activeView: 'media', audioTabByRepo: { 'repo-1': 'editor' } });
  renderView(<MediaView />, { fixtures: data(), uiState: { selectedRepoId: 'repo-1' } });
  await screen.findByTestId('arrangement');
};

beforeEach(() => useUiStore.setState({ audioTabByRepo: {} }));
afterEach(cleanup);

describe('Music editor', () => {
  it('loads the project song and shows each track with its instrument', async () => {
    await openEditor();
    const rows = await screen.findAllByTestId('track-row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('track-instrument').map((e) => e.textContent)).toEqual([
      expect.stringContaining('Violin'),
      'Drum kit',
    ]);
    expect((screen.getByLabelText('Song') as HTMLSelectElement).value).toBe('Demo');
  });

  it('mutes a track as one undoable step', async () => {
    await openEditor();
    const [mute] = await screen.findAllByRole('button', { name: 'Mute' });
    const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    fireEvent.click(mute!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Unmute' })).toHaveLength(1));
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Unmute' })).toBeNull());
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('adds and removes tracks', async () => {
    await openEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Add track' }));
    await waitFor(() => expect(screen.getAllByTestId('track-row')).toHaveLength(3));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove track' })[2]!);
    await waitFor(() => expect(screen.getAllByTestId('track-row')).toHaveLength(2));
  });

  it('chooses a track instrument with the GM picker', async () => {
    await openEditor();
    fireEvent.click(await screen.findByRole('button', { name: /Instrument for Lead/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Acoustic Grand Piano/ }));
    await waitFor(() => expect(screen.getAllByTestId('track-instrument')[0]!.textContent).toBe('Acoustic Grand Piano'));
  });

  it('offers a first song for an empty project', async () => {
    useUiStore.setState({ mediaTab: 'audio', mediaPaneCollapsed: {}, activeView: 'media', audioTabByRepo: { 'repo-1': 'editor' } });
    renderView(<MediaView />, { fixtures: { ...fixtures, media: { files: { 'audio:album': { 'x.wav': 'wav' } } } }, uiState: { selectedRepoId: 'repo-1' } });
    await screen.findByText('This project has no songs yet.');
    fireEvent.click(screen.getByText('New song', { selector: 'button' }));
    await waitFor(() => expect((screen.getByLabelText('Song') as HTMLSelectElement).value).toBe('Song 1'));
  });

  it('applies an agent edit as one undo step and ignores other songs', async () => {
    await openEditor();
    await screen.findAllByTestId('track-row');
    const emit = (globalThis as unknown as { __mockMusicEmit: { changed: (e: unknown) => void } }).__mockMusicEmit;
    const edited = SongSchema.parse({ ...demo, tracks: [...demo.tracks, { id: 'pad', name: 'Pad' }] });
    act(() => emit.changed({ repoId: 'repo-1', project: 'album', name: 'Other', song: edited, summary: 'x', saved: true }));
    expect(screen.getAllByTestId('track-row')).toHaveLength(2);
    act(() => emit.changed({ repoId: 'repo-1', project: 'album', name: 'Demo', song: edited, summary: 'x', saved: true }));
    await waitFor(() => expect(screen.getAllByTestId('track-row')).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getAllByTestId('track-row')).toHaveLength(2));
  });

  it('shows the song an agent opens', async () => {
    await openEditor();
    await screen.findAllByTestId('track-row');
    const emit = (globalThis as unknown as { __mockMusicEmit: { open: (e: unknown) => void } }).__mockMusicEmit;
    act(() => emit.open({ repoId: 'repo-1', project: 'album', name: 'Demo' }));
    expect(await screen.findAllByTestId('track-row')).toHaveLength(2);
  });
});
