// vitest/jsdom: the row menu's items and order, the disabled Remove under the games root, and the ⋯ button opening it from the keyboard.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GameSummary } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameExplorer } from './game-explorer';
import { GameHostProvider } from './host';
import { gameRowMenuItems, isUnderGamesRoot, REMOVE_UNDER_ROOT_REASON } from './game-row-menu';

const game = (over: Partial<GameSummary> = {}): GameSummary => ({
  gameId: 'g1',
  name: 'Alpha',
  path: '/games/alpha',
  engine: 'phaser',
  dimension: '2d',
  starter: 'blank',
  dirty: false,
  valid: true,
  issue: null,
  status: null,
  findingCount: 0,
  ...over,
});

const handlers = { onRename: vi.fn(), onReveal: vi.fn(), onCopyPath: vi.fn(), onForget: vi.fn(), onDelete: vi.fn() };
const labels = (items: ReturnType<typeof gameRowMenuItems>): string[] => items.map((i) => ('type' in i ? '---' : i.label));

describe('gameRowMenuItems', () => {
  it('lists the items in order, with Delete last and destructive', () => {
    const items = gameRowMenuItems({ game: game(), gamesRoot: '/elsewhere', removesRepo: false, handlers });
    expect(labels(items)).toEqual(['Rename…', 'Reveal in Finder', 'Copy path', '---', 'Remove from list', 'Delete game…']);
    const last = items[items.length - 1];
    expect(last && 'danger' in last && last.danger).toBe(true);
  });

  it('names the repos panel in Studio, and adds Run doctor only when given a handler', () => {
    const items = gameRowMenuItems({ game: game(), gamesRoot: null, removesRepo: true, handlers: { ...handlers, onRunDoctor: vi.fn() } });
    expect(labels(items)).toEqual(['Rename…', 'Reveal in Finder', 'Copy path', '---', 'Run doctor', '---', 'Remove from list (and repos panel)', 'Delete game…']);
  });

  it('disables Remove, with the tooltip, for a game directly under the games root', () => {
    const items = gameRowMenuItems({ game: game(), gamesRoot: '/games/', removesRepo: false, handlers });
    const remove = items.find((i) => 'label' in i && i.label === 'Remove from list');
    expect(remove).toMatchObject({ disabled: true, disabledReason: REMOVE_UNDER_ROOT_REASON });
    expect(REMOVE_UNDER_ROOT_REASON).toBe('Games in the games folder always list — move or delete it to remove it.');
  });

  it('only a direct child counts as under the root', () => {
    expect(isUnderGamesRoot(game({ path: '/games/alpha' }), '/games')).toBe(true);
    expect(isUnderGamesRoot(game({ path: '/games/sub/alpha' }), '/games')).toBe(false);
    expect(isUnderGamesRoot(game({ path: 'C:\\games\\alpha' }), 'C:\\games')).toBe(true);
    expect(isUnderGamesRoot(game(), undefined)).toBe(false);
  });
});

describe('GameExplorer row menu', () => {
  const list = vi.fn();
  const settingsGet = vi.fn();
  const reveal = vi.fn();
  const forget = vi.fn();
  beforeEach(() => {
    list.mockResolvedValue({ games: [game({ path: '/elsewhere/alpha' })] });
    settingsGet.mockResolvedValue({ settings: {}, resolvedRoot: '/games', rootProblem: null });
    reveal.mockResolvedValue({ ok: true });
    forget.mockResolvedValue({ ok: true });
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {
      games: { list, settings: { get: settingsGet }, reveal, forget, rename: vi.fn(), deleteInfo: vi.fn(), delete: vi.fn() },
    };
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    vi.clearAllMocks();
  });

  function renderExplorer(removesRepo = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <GameHostProvider host={{ removesRepo }}>
          <GameExplorer selectedId={null} onSelect={() => undefined} onNew={() => undefined} onOpen={() => undefined} />
        </GameHostProvider>
      </QueryClientProvider>,
    );
  }

  it('opens from the ⋯ button, and Reveal calls main with the game id', async () => {
    renderExplorer();
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Alpha' }));
    const menu = screen.getByTestId('kit-context-menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Rename…',
      'Reveal in Finder',
      'Copy path',
      'Remove from list',
      'Delete game…',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reveal in Finder' }));
    await waitFor(() => expect(reveal).toHaveBeenCalledWith({ gameId: 'g1' }));
  });

  it('opens on right-click, and Remove from list names the repos panel in Studio', async () => {
    renderExplorer(true);
    fireEvent.contextMenu(await screen.findByText('Alpha'));
    fireEvent.click(within(screen.getByTestId('kit-context-menu')).getByRole('menuitem', { name: 'Remove from list (and repos panel)' }));
    await waitFor(() => expect(forget).toHaveBeenCalledWith({ gameId: 'g1' }));
  });

  it('shows Remove as disabled for a game under the games root', async () => {
    list.mockResolvedValue({ games: [game({ path: '/games/alpha' })] });
    renderExplorer();
    await screen.findByText('Alpha');
    await waitFor(() => expect(settingsGet).toHaveBeenCalled());
    fireEvent.contextMenu(screen.getByText('Alpha'));
    const remove = within(screen.getByTestId('kit-context-menu')).getByRole('menuitem', { name: 'Remove from list' });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(remove.getAttribute('title')).toBe(REMOVE_UNDER_ROOT_REASON);
    fireEvent.click(remove);
    expect(forget).not.toHaveBeenCalled();
  });
});
