import type { GamePlaytestEntry } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { PlaytestsMenu } from './playtests-menu';

/**
 * The runner toolbar's Playtests menu (Phase 107 Theme O) through the mock
 * bridge. Plain jsdom: a popover, a list and buttons. The deterministic run
 * itself is `playtest.test.ts` in desktop.
 */

const GAME_ID = 'g000000000001';
type MockGames = { calls: Array<Record<string, unknown>> };
const calls = (): Array<Record<string, unknown>> => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames.calls;
const withPlaytests = (playtests: GamePlaytestEntry[], playtestRun?: NonNullable<typeof fixtures.games>['playtestRun']) => ({
  ...fixtures,
  games: { ...fixtures.games, playtests, ...(playtestRun ? { playtestRun } : {}) },
});

const FAILED: GamePlaytestEntry = {
  name: 'jump',
  file: 'playtests/jump.json',
  valid: true,
  issue: null,
  last: {
    name: 'jump',
    passed: false,
    ranAt: '2026-10-07T10:00:00.000Z',
    frames: 120,
    ms: 400,
    results: [
      { assertIndex: 0, frame: 60, kind: 'state', ok: true, status: 'pass', message: '$.scene = "level"' },
      {
        assertIndex: 1,
        frame: 120,
        kind: 'state',
        ok: false,
        status: 'fail',
        message: '$.player.position[1] is 400, expected < 300',
        screenshot: 'playtests/results/jump-1.png',
      },
    ],
  },
};
const SMOKE: GamePlaytestEntry = { name: 'smoke', file: 'playtests/smoke.json', valid: true, issue: null, last: null };
const BROKEN: GamePlaytestEntry = { name: 'broken', file: 'playtests/broken.json', valid: false, issue: 'asserts: Array must contain at least 1 element(s)', last: null };

afterEach(cleanup);

describe('PlaytestsMenu', () => {
  it('lists play-tests with their last result, failures and invalid files', async () => {
    renderView(<PlaytestsMenu gameId={GAME_ID} />, { fixtures: withPlaytests([BROKEN, FAILED, SMOKE]) });
    fireEvent.click(screen.getByRole('button', { name: 'Playtests' }));
    const list = await screen.findByRole('list', { name: 'Play-tests' });
    expect(within(list).getByText('1/2 · 120 frames')).toBeTruthy();
    expect(within(list).getByLabelText('Failed')).toBeTruthy();
    expect(within(list).getByLabelText('Not run yet')).toBeTruthy();
    expect(within(list).getByLabelText('Invalid')).toBeTruthy();
    expect(within(list).getByText(/expected < 300/)).toBeTruthy();
    expect(within(list).getByText('playtests/results/jump-1.png')).toBeTruthy();
    expect(within(list).getByText(/at least 1 element/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run broken' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('runs one play-test, or all, and shows the new result', async () => {
    renderView(<PlaytestsMenu gameId={GAME_ID} />, { fixtures: withPlaytests([SMOKE]) });
    fireEvent.click(screen.getByRole('button', { name: 'Playtests' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run smoke' }));
    await waitFor(() => expect(calls()).toContainEqual({ call: 'playtestRun', gameId: GAME_ID, names: ['smoke'] }));
    expect(await screen.findByLabelText('Passed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run all' }));
    await waitFor(() => expect(calls()).toContainEqual({ call: 'playtestRun', gameId: GAME_ID }));
  });

  it('explains the format when there are no play-tests, and Run all is off', async () => {
    renderView(<PlaytestsMenu gameId={GAME_ID} />, { fixtures: withPlaytests([]) });
    fireEvent.click(screen.getByRole('button', { name: 'Playtests' }));
    expect(await screen.findByText(/No play-tests yet/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run all' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
