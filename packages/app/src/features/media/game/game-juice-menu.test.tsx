import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { useGameJuiceStore } from './game-juice-store';
import { GameJuiceMenu, useApplyStoredJuice } from './game-juice-menu';

/**
 * The runner toolbar's Juice popover through the mock bridge. Plain jsdom: switches, two
 * range inputs and a store. The kit's own hook is covered by kit-juice.test.ts in desktop.
 */

const GAME_ID = 'g000000000001';
type MockGames = { calls: Array<Record<string, unknown>> };
const calls = (): Array<Record<string, unknown>> => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames.calls;
const juiceCalls = () => calls().filter((c) => c.call === 'juice');

beforeEach(() => useGameJuiceStore.setState({ byGame: {} }));
afterEach(cleanup);

const open = async (live = true) => {
  renderView(<GameJuiceMenu gameId={GAME_ID} live={live} />, { fixtures });
  fireEvent.click(screen.getByRole('button', { name: 'Juice' }));
  await screen.findByRole('switch', { name: 'Particles' });
};

function Apply({ running }: { running: boolean }) {
  useApplyStoredJuice(GAME_ID, 'run-1', running);
  return null;
}

describe('useApplyStoredJuice', () => {
  it('re-applies the saved patch once the run is running, and does nothing with no saved patch', async () => {
    renderView(<Apply running />, { fixtures });
    await new Promise((r) => setTimeout(r, 50));
    expect(juiceCalls()).toHaveLength(0);
    cleanup();
    useGameJuiceStore.getState().setPatch(GAME_ID, { intensity: 0.5 });
    renderView(<Apply running />, { fixtures });
    await waitFor(() => expect(juiceCalls()).toContainEqual({ call: 'juice', gameId: GAME_ID, action: 'set', patch: { intensity: 0.5 } }));
  });
});

describe('GameJuiceMenu', () => {
  it('reads the running game settings when it opens', async () => {
    renderView(<GameJuiceMenu gameId={GAME_ID} live />, { fixtures: { ...fixtures, games: { ...fixtures.games, juice: { enabled: true, intensity: 1.5, shake: false, flash: true, particles: true, postfx: true, volume: 0.4 } } } });
    fireEvent.click(screen.getByRole('button', { name: 'Juice' }));
    await waitFor(() => expect((screen.getByRole('switch', { name: 'Camera shake' }) as HTMLInputElement).checked).toBe(false));
    expect((screen.getByRole('slider', { name: 'Intensity' }) as HTMLInputElement).value).toBe('1.5');
    expect((screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement).value).toBe('0.4');
  });

  it('sends a patch to the game and remembers it per game', async () => {
    await open();
    fireEvent.click(screen.getByRole('switch', { name: 'Particles' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.3' } });
    await waitFor(() => expect(juiceCalls()).toContainEqual({ call: 'juice', gameId: GAME_ID, action: 'set', patch: { volume: 0.3 } }));
    expect(juiceCalls()).toContainEqual({ call: 'juice', gameId: GAME_ID, action: 'set', patch: { particles: false } });
    expect(useGameJuiceStore.getState().byGame[GAME_ID]).toEqual({ particles: false, volume: 0.3 });
  });

  it('master off disables the individual controls', async () => {
    await open();
    fireEvent.click(screen.getByRole('switch', { name: 'Juice' }));
    await waitFor(() => expect((screen.getByRole('switch', { name: 'Particles' }) as HTMLInputElement).disabled).toBe(true));
    expect((screen.getByRole('slider', { name: 'Intensity' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('Reset clears the stored overrides and resets the game', async () => {
    useGameJuiceStore.getState().setPatch(GAME_ID, { shake: false });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(juiceCalls()).toContainEqual({ call: 'juice', gameId: GAME_ID, action: 'reset' }));
    expect(useGameJuiceStore.getState().byGame[GAME_ID]).toBeUndefined();
  });

  it('keeps the choice for the next run when the game is not running', async () => {
    await open(false);
    expect(screen.getByText(/not running/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Post-processing' }));
    expect(useGameJuiceStore.getState().byGame[GAME_ID]).toEqual({ postfx: false });
    expect(juiceCalls()).toHaveLength(0);
  });
});
