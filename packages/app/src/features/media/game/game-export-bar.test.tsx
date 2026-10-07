import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useToastStore } from '../../../store/toast-store';
import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { GameExportBar } from './game-export-bar';

/**
 * The Games toolbar's export button (Phase 107 Theme P) through the mock bridge. Plain jsdom: a split
 * button, a format menu and a toast. The writers are `export.test.ts` in desktop.
 */

const GAME_ID = 'g000000000001';
type MockGames = { calls: Array<Record<string, unknown>> };
const calls = (): Array<Record<string, unknown>> => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames.calls;
const withGames = (games: NonNullable<typeof fixtures.games>, pickDirectoryResult?: string | null) => ({
  ...fixtures,
  games: { ...fixtures.games, ...games },
  ...(pickDirectoryResult !== undefined ? { pickDirectoryResult } : {}),
});

afterEach(cleanup);

describe('GameExportBar', () => {
  it('lists the three formats, single HTML file first', async () => {
    renderView(<GameExportBar gameId={GAME_ID} />, { fixtures: withGames({}) });
    expect(screen.getByRole('button', { name: 'Export Single HTML file' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export format' }));
    expect(await screen.findByText('Zip archive')).toBeTruthy();
    expect(screen.getByText('Static folder')).toBeTruthy();
  });

  it('is off with no game selected', () => {
    renderView(<GameExportBar gameId={null} />, { fixtures: withGames({}) });
    expect((screen.getByRole('button', { name: 'Export Single HTML file' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('exports the file formats with no destination (main asks) and toasts the path and any warning', async () => {
    renderView(<GameExportBar gameId={GAME_ID} />, { fixtures: withGames({ exportResult: { ok: true, warnings: ['This file is 63 MB; browsers may be slow to open it.'] } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Export Single HTML file' }));
    await waitFor(() => expect(calls()).toContainEqual({ call: 'export', gameId: GAME_ID, format: 'game-html' }));
    expect(await screen.findByText('Exported to /exports/game.html')).toBeTruthy();
    expect(await screen.findByText('This file is 63 MB; browsers may be slow to open it.')).toBeTruthy();
  });

  it('asks for a parent folder first for the folder format, and does nothing if none is picked', async () => {
    const picked = renderView(<GameExportBar gameId={GAME_ID} />, { fixtures: withGames({}, '/Users/you/exports') });
    fireEvent.click(screen.getByRole('button', { name: 'Export format' }));
    fireEvent.click(await screen.findByText('Static folder'));
    fireEvent.click(screen.getByRole('button', { name: 'Export Static folder' }));
    await waitFor(() => expect(calls()).toContainEqual({ call: 'export', gameId: GAME_ID, format: 'game-folder', dest: '/Users/you/exports' }));
    picked.unmount();
    cleanup();

    renderView(<GameExportBar gameId={GAME_ID} />, { fixtures: withGames({}, null) });
    const folderCalls = () => calls().filter((c) => c['format'] === 'game-folder').length;
    fireEvent.click(screen.getByRole('button', { name: 'Export format' }));
    fireEvent.click(await screen.findByText('Static folder'));
    fireEvent.click(screen.getByRole('button', { name: 'Export Static folder' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(folderCalls()).toBe(0); // a fresh mock, and nothing was picked
  });

  it('shows a refusal as an error notification, but a cancelled save dialog silently', async () => {
    renderView(<GameExportBar gameId={GAME_ID} />, { fixtures: withGames({ exportResult: { ok: false, message: 'moon-rover-web already exists in that folder.' } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Export Single HTML file' }));
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('moon-rover-web already exists in that folder.'));
    cleanup();
    useToastStore.setState({ toasts: [] });
    renderView(<GameExportBar gameId={GAME_ID} />, { fixtures: withGames({ exportResult: { ok: false, message: 'cancelled' } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Export Single HTML file' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
