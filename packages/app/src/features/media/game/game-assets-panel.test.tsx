import type { GameSummary } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { GameAssetsBadge, GameAssetsPanel } from './game-assets-panel';

/**
 * The asset bridge UI (Phase 107 Theme N) through the mock bridge. Plain jsdom:
 * tabs, buttons, lists. The real copy-and-commit is `asset-bridge.test.ts`.
 */

const GAME: GameSummary = {
  gameId: 'g000000000001',
  name: 'Moon Rover',
  path: '/Midnite Games/moon-rover',
  engine: 'phaser',
  dimension: '2d',
  starter: 'top-down',
  dirty: false,
  valid: true,
  issue: null,
};

const withGames = (games: NonNullable<typeof fixtures.games>) => ({ ...fixtures, games: { ...fixtures.games, ...games } });
type MockGames = { calls: Array<Record<string, unknown>> };
const calls = (): Array<Record<string, unknown>> => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames.calls;

const SYNC = [
  { name: 'hero', kind: 'sprite', state: 'current' as const, importedAt: '2026-10-07T10:00:00.000Z' },
  { name: 'logo', kind: 'image', state: 'changed' as const, importedAt: '2026-10-07T10:00:00.000Z' },
  { name: 'dunes', kind: 'terrain', state: 'missing' as const, importedAt: '2026-10-07T10:00:00.000Z' },
];

afterEach(cleanup);

describe('GameAssetsPanel', () => {
  it('lists imported assets with their sync state and offers a re-import when a source changed', async () => {
    renderView(<GameAssetsPanel game={GAME} />, { fixtures: withGames({ assetSync: SYNC }) });
    expect(await screen.findByText('hero')).toBeTruthy();
    expect(screen.getByText('Source changed')).toBeTruthy();
    expect(screen.getByText('Source missing')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('1 asset changed');

    fireEvent.click(screen.getByRole('button', { name: 'Re-import' }));
    await waitFor(() => expect(calls().some((c) => c.call === 'assetResync' && c.check !== true)).toBe(true));
  });

  it('says so when nothing is imported and shows no re-import', async () => {
    renderView(<GameAssetsPanel game={GAME} />, { fixtures: withGames({ assetSync: [] }) });
    expect(await screen.findByText(/Nothing imported yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Re-import' })).toBeNull();
  });

  it('imports from the picker: tabs by source, one click per item', async () => {
    renderView(<GameAssetsPanel game={GAME} />, {
      fixtures: withGames({
        assetSync: [],
        assetSources: {
          sprite: [{ repoPath: '/work/demo', name: 'demo', items: [{ path: 'characters/hero-1', label: 'hero-1', kind: 'sprite', bytes: 0 }] }],
          image: [{ repoPath: '/work/demo', name: 'demo', items: [{ path: 'a/x.png', label: 'a/x.png', kind: 'image', bytes: 2048 }] }],
        },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Import asset' }));
    expect(await screen.findByRole('button', { name: 'Import hero-1' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Images' }));
    expect(await screen.findByText('2 KB')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose a pack folder…' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Audio' }));
    expect(await screen.findByText('No audio in your repos.')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Sprites' }));
    expect(screen.getByRole('button', { name: 'Choose a pack folder…' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Import hero-1' }));
    await waitFor(() =>
      expect(calls()).toContainEqual(
        expect.objectContaining({ call: 'assetImport', gameId: GAME.gameId, source: { tab: 'sprite', repoPath: '/work/demo', path: 'characters/hero-1' } }),
      ),
    );
    // The picker closes after a successful import.
    await waitFor(() => expect(screen.queryByTestId('game-asset-picker')).toBeNull());
  });
});

describe('GameAssetsBadge', () => {
  it('shows "N assets changed" only when a source moved on', async () => {
    const view = renderView(<GameAssetsBadge game={GAME} />, { fixtures: withGames({ assetSync: SYNC }) });
    expect((await screen.findByTestId('game-assets-badge')).textContent).toBe('1 asset changed');
    view.unmount();
    renderView(<GameAssetsBadge game={GAME} />, { fixtures: withGames({ assetSync: [SYNC[0]!] }) });
    await waitFor(() => expect(calls().filter((c) => c.call === "assetResync").length).toBeGreaterThan(0));
    expect(screen.queryByTestId('game-assets-badge')).toBeNull();
  });
});
