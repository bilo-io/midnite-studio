import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { useGameRunStore } from './game-run-store';
import { GameTab } from './game-tab';

/**
 * Media ▸ Games assembled through the mock bridge (Phase 107 Themes A + B).
 * Plain jsdom: nothing here needs a real browser — the native view is main's,
 * and the runner's behaviour is covered by `game-runner.test.ts`.
 */

const TWO_GAMES: MockFixtures = {
  ...fixtures,
  games: {
    list: [
      { gameId: 'g000000000001', name: 'Moon Rover', path: '/Midnite Games/moon-rover', engine: 'phaser', dimension: '2d', dirty: true },
      { gameId: 'g000000000002', name: 'Sky Fort', path: '/Midnite Games/sky-fort', engine: 'three', dimension: '3d' },
    ],
  },
};

type MockGames = {
  calls: Array<Record<string, unknown>>;
  popState: (event: { gameId: string | null }) => void;
  runState: (event: unknown) => void;
  console: (event: unknown) => void;
};
const mockGames = (): MockGames => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames;

afterEach(() => {
  cleanup();
  useGameRunStore.setState({ runs: {}, logs: {}, clearedAt: {}, popped: null });
  useUiStore.setState({ selectedRepoId: null });
});

describe('Media ▸ Games, assembled through the real bridge', () => {
  it('lists the seeded games with no repo selected', async () => {
    useUiStore.setState({ selectedRepoId: null });
    renderView(<GameTab />, { fixtures: TWO_GAMES });

    expect(await screen.findByRole('button', { name: /Moon Rover/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sky Fort/ })).toBeTruthy();
    // Uncommitted work shows as a dot, with an accessible name.
    expect(screen.getByRole('img', { name: 'Uncommitted changes' })).toBeTruthy();
    expect(screen.getByText('Pick a game, or create one.', { selector: 'p' })).toBeTruthy();
  });

  it('shows the empty state and the create form when there are no games', async () => {
    renderView(<GameTab />, { fixtures });
    expect(await screen.findByText('No games yet. Create one from a starter.')).toBeTruthy();
    expect(screen.getByTestId('game-create-panel')).toBeTruthy();
  });

  it('flags an invalid manifest with its first issue as the tooltip', async () => {
    renderView(<GameTab />, {
      fixtures: {
        ...fixtures,
        games: { list: [{ gameId: 'g0000000000bad', name: 'broken', path: '/g/broken', engine: null, dimension: null, starter: null, valid: false, issue: 'engine: Invalid option' }] },
      },
    });
    const row = await screen.findByRole('button', { name: /broken/ });
    expect(row.getAttribute('title')).toBe('engine: Invalid option');
    expect(within(row).getByLabelText('Invalid manifest')).toBeTruthy();
  });

  it('creates a game and selects it', async () => {
    renderView(<GameTab />, { fixtures });
    const name = await screen.findByPlaceholderText('Moon Rover');
    fireEvent.change(name, { target: { value: 'Neon Drift' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create game' }));

    // Selected: the detail panel replaces the form and offers the way into Timeline.
    expect(await screen.findByRole('button', { name: 'Open in Timeline' })).toBeTruthy();
    expect(screen.getAllByText('Neon Drift').length).toBeGreaterThan(0);
  });

  it('runs a selected game and reports it starting then running', async () => {
    renderView(<GameTab />, { fixtures: TWO_GAMES });
    fireEvent.click(await screen.findByRole('button', { name: /Moon Rover/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }));

    await waitFor(() => expect(mockGames().calls.some((c) => c['call'] === 'run' && c['gameId'] === 'g000000000001')).toBe(true));
    await waitFor(() => expect(useGameRunStore.getState().runs['g000000000001']?.state).toBe('running'));
    // A live game has no Run button; Stop is enabled.
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows console output and filters it by level; Clear empties the view', async () => {
    renderView(<GameTab />, { fixtures: TWO_GAMES });
    fireEvent.click(await screen.findByRole('button', { name: /Moon Rover/ }));
    await screen.findByRole('button', { name: 'Run' });

    act(() => {
      mockGames().runState({ gameId: 'g000000000001', runId: 'r9', state: 'running' });
      mockGames().console({
        gameId: 'g000000000001',
        runId: 'r9',
        entries: [
          { seq: 1, at: 1, level: 'log', text: 'midnite-ready' },
          { seq: 2, at: 2, level: 'warn', text: 'slow frame' },
          { seq: 3, at: 3, level: 'exception', text: 'TypeError: x is undefined', source: 'mstudio-game://g000000000001/src/main.js', line: 7 },
        ],
      });
    });
    const log = await screen.findByRole('log', { name: 'Console output' });
    expect(within(log).getByText('midnite-ready')).toBeTruthy();
    expect(within(log).getByText(/TypeError: x is undefined/)).toBeTruthy();
    expect(log.textContent).toContain('src/main.js:7');

    fireEvent.click(screen.getByRole('button', { name: 'Errors' }));
    expect(within(log).queryByText('midnite-ready')).toBeNull();
    expect(within(log).queryByText('slow frame')).toBeNull();
    expect(within(log).getByText(/TypeError/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(within(log).getByText('Nothing logged yet.')).toBeTruthy();
    // Main's buffer is untouched: only the view is cleared.
    expect(useGameRunStore.getState().logs['g000000000001']).toHaveLength(3);
  });

  it('shows the crashed state with its reason and a Restart button', async () => {
    renderView(<GameTab />, { fixtures: TWO_GAMES });
    fireEvent.click(await screen.findByRole('button', { name: /Moon Rover/ }));
    await screen.findByRole('button', { name: 'Run' });

    act(() => mockGames().runState({ gameId: 'g000000000001', runId: 'r3', state: 'crashed', reason: 'oom' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The game crashed (oom). See the console.');
    expect(within(alert).getByRole('button', { name: 'Restart' })).toBeTruthy();
  });

  it('drives the toolbar through the bridge', async () => {
    renderView(<GameTab />, { fixtures: TWO_GAMES });
    fireEvent.click(await screen.findByRole('button', { name: /Moon Rover/ }));
    act(() => mockGames().runState({ gameId: 'g000000000001', runId: 'r1', state: 'running' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(mockGames().calls).toContainEqual(expect.objectContaining({ call: 'toolbar', action: 'pause', gameId: 'g000000000001' })),
    );
    fireEvent.click(screen.getByRole('button', { name: 'DevTools' }));
    await waitFor(() => expect(mockGames().calls).toContainEqual(expect.objectContaining({ call: 'toolbar', action: 'devtools' })));
  });

  it('pops a game out: the centre says where it went, and stops driving the native view', async () => {
    renderView(<GameTab />, { fixtures: TWO_GAMES });
    fireEvent.click(await screen.findByRole('button', { name: /Moon Rover/ }));
    act(() => mockGames().runState({ gameId: 'g000000000001', runId: 'r1', state: 'running' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Pop out' }));
    await waitFor(() => expect(mockGames().calls).toContainEqual({ call: 'popOut', gameId: 'g000000000001' }));
    expect(await screen.findByText('This game is playing in its own window.')).toBeTruthy();
    expect(screen.queryByTestId('game-stage')).toBeNull();
    // Pressing it again focuses the popout instead.
    expect(screen.getByRole('button', { name: 'Show game window' })).toBeTruthy();

    // Popped out, the main window must not hide or move the popout's view.
    const before = mockGames().calls.length;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(mockGames().calls.slice(before).filter((c) => c['call'] === 'setVisible' || c['call'] === 'setBounds')).toEqual([]);

    // Docked again (the popout closed): the stage comes back and re-shows the view.
    act(() => mockGames().popState({ gameId: null }));
    expect(await screen.findByTestId('game-stage')).toBeTruthy();
    await waitFor(() =>
      expect(mockGames().calls.slice(before)).toContainEqual({ call: 'setVisible', gameId: 'g000000000001', visible: true }),
    );
  });

  it('learns which game is popped out at mount', async () => {
    renderView(<GameTab />, { fixtures: { ...TWO_GAMES, games: { ...TWO_GAMES.games, popped: 'g000000000001' } } });
    await waitFor(() => expect(useGameRunStore.getState().popped).toBe('g000000000001'));
  });
});
