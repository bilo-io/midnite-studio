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

/** Phase 101 Theme F — mixer, effects chain and automation lanes. DOM roles only, so vitest/jsdom. */
describe('Music editor mixer, effects and automation', () => {
  const openLower = async (tab: string) => {
    await openEditor();
    fireEvent.click(await screen.findByRole('tab', { name: tab }));
  };

  it('shows a strip per track and a master, and a fader drag is one undo step', async () => {
    await openLower('Mixer');
    expect(await screen.findAllByTestId('mixer-strip')).toHaveLength(2);
    expect(screen.getByTestId('mixer-master')).toBeTruthy();
    const fader = screen.getByLabelText('Lead volume') as HTMLInputElement;
    expect(fader.value).toBe('0.8');
    fireEvent.change(fader, { target: { value: '1.2' } });
    fireEvent.change(fader, { target: { value: '1.4' } });
    await waitFor(() => expect((screen.getByLabelText('Lead volume') as HTMLInputElement).value).toBe('1.4'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect((screen.getByLabelText('Lead volume') as HTMLInputElement).value).toBe('0.8'));
  });

  it('mutes and solos a strip and changes the master', async () => {
    await openLower('Mixer');
    fireEvent.click(await screen.findByRole('button', { name: 'Mute Lead' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unmute Lead' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Solo Kit' }));
    fireEvent.change(screen.getByLabelText('Master volume'), { target: { value: '0.5' } });
    await waitFor(() => expect(screen.getByText('50%')).toBeTruthy());
  });

  it('adds, bypasses, reorders and removes effects on the active track', async () => {
    await openLower('Mixer');
    const add = await screen.findByLabelText('Add effect');
    fireEvent.change(add, { target: { value: 'reverb' } });
    fireEvent.change(await screen.findByLabelText('Add effect'), { target: { value: 'delay' } });
    await waitFor(() => expect(screen.getAllByTestId('effect-card')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Bypass Reverb' }));
    await waitFor(() => expect(screen.getAllByTestId('effect-card')[0]!.getAttribute('data-bypassed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Move Reverb later' }));
    await waitFor(() => expect(screen.getAllByTestId('effect-card')[1]!.textContent).toContain('Reverb'));
    fireEvent.change(screen.getByLabelText('Delay Feedback'), { target: { value: '0.6' } });
    await waitFor(() => expect((screen.getByLabelText('Delay Feedback') as HTMLInputElement).value).toBe('0.6'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Delay' }));
    await waitFor(() => expect(screen.getAllByTestId('effect-card')).toHaveLength(1));
  });

  it('adds an automation lane, draws a point and deletes it', async () => {
    await openLower('Automation');
    fireEvent.change(await screen.findByLabelText('Add automation lane'), { target: { value: 'volume' } });
    // jsdom has no PointerEvent, so clientX/clientY would be dropped from the synthetic event.
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent ??= MouseEvent;
    const lane = await screen.findByTestId('automation-lane');
    expect(lane.getAttribute('data-target')).toBe('volume');
    expect(screen.queryAllByTestId('automation-point')).toHaveLength(0);
    fireEvent.pointerDown(screen.getByLabelText('Volume automation'), { clientX: 0, clientY: 20 });
    const point = await screen.findByTestId('automation-point');
    fireEvent.doubleClick(point);
    await waitFor(() => expect(screen.queryAllByTestId('automation-point')).toHaveLength(0));
    fireEvent.change(screen.getByLabelText('Volume curve'), { target: { value: 'step' } });
    await waitFor(() => expect((screen.getByLabelText('Volume curve') as HTMLSelectElement).value).toBe('step'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Volume lane' }));
    await waitFor(() => expect(screen.queryByTestId('automation-lane')).toBeNull());
  });
});
