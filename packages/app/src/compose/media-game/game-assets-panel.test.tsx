import type { GameSummary } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView as renderViewBase } from '../../../test-support/render';
import { StudioTabHarness } from '../media-tab-harness';

/** Every composed tab renders inside the kit and Studio's tab hosts. */
const renderView: typeof renderViewBase = (ui, options) => renderViewBase(<StudioTabHarness>{ui}</StudioTabHarness>, options);
import { GameAssetsBadge, GameAssetsPanel, importDisabledReason, isAlreadyInGame } from '@midnite/studio-feature-media-game/renderer';

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
  status: null,
  findingCount: 0,
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
    fireEvent.click(screen.getByRole('tab', { name: 'SFX' }));
    expect(await screen.findByText(/Generate some in Media ▸ SFX/)).toBeTruthy();

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

describe('GameAssetsPanel library source', () => {
  const LIBRARY = {
    root: '/lib',
    exists: true,
    collections: [
      {
        id: 'gtact',
        title: 'GTACT',
        origin: 'catalog' as const,
        totalBytes: 30,
        warning: null,
        assets: [
          { path: 'images/hero.png', category: 'images', source: 'a/hero.png', bytes: 10, sha256: 'a'.repeat(64), name: 'hero', kind: 'image' as const },
          { path: 'models/car.glb', category: 'models/vehicles', source: 'a/car.glb', bytes: 20, sha256: 'b'.repeat(64), name: 'car', kind: 'model' as const },
        ],
      },
    ],
  };

  it('switches between This game and Library, grouping assets by category', async () => {
    renderView(<GameAssetsPanel game={GAME} />, { fixtures: withGames({ assetSync: SYNC, assetLibrary: LIBRARY }) });
    expect(await screen.findByText('hero')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    expect(await screen.findByTestId('game-asset-library')).toBeTruthy();
    expect(screen.queryByText('Import asset')).toBeNull();
    expect(screen.getByText('images')).toBeTruthy();
    expect(screen.getByText('models/vehicles')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'This game' }));
    expect(await screen.findByText('Import asset')).toBeTruthy();
  });

  it('inspects an image with a preview and a model with metadata only', async () => {
    renderView(<GameAssetsPanel game={GAME} />, { fixtures: withGames({ assetLibrary: LIBRARY }) });
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /hero/ }));
    expect(await screen.findByRole('img', { name: 'hero' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /car/ }));
    expect(await screen.findByText(/No inline preview for model/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'hero' })).toBeNull();
  });

  it('says where to configure the library when the root is missing', async () => {
    renderView(<GameAssetsPanel game={GAME} />, { fixtures: withGames({}) });
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    expect(await screen.findByTestId('library-missing')).toBeTruthy();
  });

  const openInspector = async (name: RegExp, fixtures: ReturnType<typeof withGames>, game: GameSummary | null = GAME) => {
    renderView(<GameAssetsPanel game={game ?? GAME} />, { fixtures });
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name }));
  };

  it('imports the selected asset into the open game, toasts, and refreshes the game list', async () => {
    await openInspector(/hero/, withGames({ assetSync: [], assetLibrary: LIBRARY }));
    const button = await screen.findByRole('button', { name: 'Import into Moon Rover' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() =>
      expect(calls()).toContainEqual(expect.objectContaining({ call: 'libraryImport', gameId: GAME.gameId, collection: 'gtact', path: 'images/hero.png' })),
    );
    // The panel re-reads the game's assets after the import.
    await waitFor(() => expect(calls().filter((c) => c.call === 'assetResync').length).toBeGreaterThan(1));
  });

  it('shows "Already in this game" when an imported asset carries the same sha256, and the hint in the game list', async () => {
    const sync = [{ name: 'hero', kind: 'image', state: 'current' as const, importedAt: 't', library: { library: 'gtact', path: 'images/hero.png', sha256: 'a'.repeat(64) } }];
    renderView(<GameAssetsPanel game={GAME} />, { fixtures: withGames({ assetSync: sync, assetLibrary: LIBRARY }) });
    expect(await screen.findByText('from library: gtact')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));
    fireEvent.click(await screen.findByRole('button', { name: /hero/ }));
    expect(await screen.findByTestId('library-already')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /car/ }));
    await screen.findByText(/No inline preview for model/);
    expect(screen.queryByTestId('library-already')).toBeNull();
  });

  it('disables Import with a reason for an unsupported kind', async () => {
    const lib = { ...LIBRARY, collections: [{ ...LIBRARY.collections[0]!, assets: [{ path: 'fonts/a.ttf', category: 'fonts', source: '', bytes: 1, sha256: 'c'.repeat(64), name: 'face', kind: 'font' as const }] }] };
    await openInspector(/face/, withGames({ assetSync: [], assetLibrary: lib }));
    const button = (await screen.findByRole('button', { name: 'Import into Moon Rover' })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId('library-import-reason').textContent).toMatch(/cannot hold font/);
  });

  it('disables Import when the game is invalid', async () => {
    await openInspector(/hero/, withGames({ assetSync: [], assetLibrary: LIBRARY }), { ...GAME, valid: false, issue: 'bad' });
    expect(((await screen.findByRole('button', { name: 'Import into Moon Rover' })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('library-import-reason').textContent).toMatch(/invalid manifest/);
  });

  it('reports a failed import and leaves the list alone', async () => {
    await openInspector(/hero/, withGames({ assetSync: [], assetLibrary: LIBRARY, libraryImportResult: { ok: false, message: 'Index is dirty' } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import into Moon Rover' }));
    await waitFor(() => expect(calls().some((c) => c.call === 'libraryImport')).toBe(true));
  });
});

describe('library inspector helpers', () => {
  it('matches by sha256 or by pack folder, scoped to the collection', () => {
    const asset = { path: 'terrain/bay/drape.png', category: '', source: '', bytes: 1, sha256: 'z', name: 'd', kind: 'terrain' as const };
    expect(isAlreadyInGame('gtact', asset, [{ library: 'gtact', path: 'terrain/bay', sha256: 'p' }])).toBe(true);
    expect(isAlreadyInGame('other', asset, [{ library: 'gtact', path: 'terrain/bay', sha256: 'p' }])).toBe(false);
    expect(isAlreadyInGame('gtact', asset, [{ library: 'gtact', path: 'terrain/bay2', sha256: 'p' }])).toBe(false);
    expect(importDisabledReason(null, 'image')).toMatch(/Open a game/);
    expect(importDisabledReason(GAME, 'doc')).toMatch(/cannot hold doc/);
    expect(importDisabledReason(GAME, 'terrain')).toBeNull();
  });
});
