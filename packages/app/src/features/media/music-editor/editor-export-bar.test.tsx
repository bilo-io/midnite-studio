import { MUSIC_PPQ, SongSchema } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { EditorExportBar } from './editor-export-bar';
import { publishEditorSong, publishLoopRegion } from './editor-session';

/** Phase 101 Themes J/K — the Editor's export controls, in jsdom (the .mid path needs no render). */
const song = SongSchema.parse({
  name: 'Tune',
  tracks: [{ id: 'p', notes: [{ pitch: 60, startTick: 0, durationTicks: MUSIC_PPQ, velocity: 90 }] }],
});

afterEach(() => {
  cleanup();
  act(() => {
    publishEditorSong(null);
    publishLoopRegion(null);
  });
});

const open = () =>
  renderView(<EditorExportBar repoId="repo-1" project="album" defaultBitrate={192} onSent={vi.fn()} />, {
    fixtures,
    uiState: { selectedRepoId: 'repo-1' },
  });

describe('EditorExportBar', () => {
  it('is disabled until the editor holds a song with notes', () => {
    open();
    expect((screen.getByRole('button', { name: /send to generator/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Export MIDI' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => publishEditorSong(song));
    expect((screen.getByRole('button', { name: /send to generator/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Export MIDI' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers the loop region only once one is set, and lists .mid, WAV and MP3', async () => {
    open();
    act(() => publishEditorSong(song));
    expect((screen.getByRole('option', { name: 'Loop region' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => publishLoopRegion({ startTick: 0, endTick: MUSIC_PPQ }));
    expect((screen.getByRole('option', { name: 'Loop region' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Export format' }));
    for (const label of ['MIDI', 'WAV', 'MP3']) expect(await screen.findByText(label, { selector: '[role^="menuitem"] *, [role^="menuitem"]' })).toBeTruthy();
  });

  it('exports the .mid through the bridge', async () => {
    open();
    act(() => publishEditorSong(song));
    const spy = vi.spyOn(window.midniteStudio!.media.music, 'export');
    fireEvent.click(screen.getByRole('button', { name: 'Export MIDI' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toMatchObject({ repoId: 'repo-1', project: 'album', name: 'Tune', format: 'mid' });
  });
});
