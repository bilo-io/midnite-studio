import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { useGameRunStore } from './game-run-store';
import { GamePopoutPane } from './game-popout-pane';

/**
 * The `game` popout window's content (Phase 107 Theme B Pop out), through the
 * mock bridge. Plain jsdom: the native view itself is main's.
 */

const POPPED: MockFixtures = {
  ...fixtures,
  games: {
    list: [{ gameId: 'g000000000001', name: 'Moon Rover', path: '/Midnite Games/moon-rover', engine: 'phaser', dimension: '2d' }],
    popped: 'g000000000001',
  },
};

type MockGames = {
  calls: Array<Record<string, unknown>>;
  runState: (event: unknown) => void;
  popState: (event: { gameId: string | null }) => void;
};
const mockGames = (): MockGames => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames;

afterEach(() => {
  cleanup();
  useGameRunStore.setState({ runs: {}, logs: {}, clearedAt: {}, popped: null });
});

describe('GamePopoutPane', () => {
  it('hosts the popped-out game: its name, the toolbar without Pop out, and the stage', async () => {
    renderView(<GamePopoutPane />, { fixtures: POPPED });
    expect(await screen.findByText('Moon Rover')).toBeTruthy();
    act(() => mockGames().runState({ gameId: 'g000000000001', runId: 'r1', state: 'running' }));
    expect(await screen.findByTestId('game-stage')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pop out' })).toBeNull();
    expect(screen.queryByText('This game is playing in its own window.')).toBeNull();
    await waitFor(() =>
      expect(mockGames().calls).toContainEqual({ call: 'setVisible', gameId: 'g000000000001', visible: true }),
    );
  });

  it('says so when no game is popped out', async () => {
    renderView(<GamePopoutPane />, { fixtures: { ...fixtures, games: { list: [] } } });
    expect(await screen.findByText('No game is popped out.', { selector: 'p' })).toBeTruthy();
  });
});
