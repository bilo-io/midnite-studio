import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { useGameRunStore } from './game-run-store';
import { GameRunnerHost, letterbox } from './game-runner-host';

/**
 * The host the game's native view floats over. Plain jsdom: `getBoundingClientRect` is stubbed, and
 * the setup's `ResizeObserver` fires on a microtask, so only the bounds main is sent are asserted.
 */

const GAME_ID = 'g000000000001';
type MockGames = { calls: Array<Record<string, unknown>> };
const calls = (): Array<Record<string, unknown>> =>
  (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames.calls;

const rect = (width: number, height: number): DOMRect =>
  ({ x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'game-runner-host') return rect(800, 450);
    if (this.dataset.testid === 'game-stage') {
      const { width, height } = this.style;
      return rect(parseFloat(width) || 0, parseFloat(height) || 0);
    }
    return rect(0, 0);
  });
  useGameRunStore.setState({ runs: {}, popped: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GameRunnerHost', () => {
  it('sizes the view when a game is picked after the host mounted empty', async () => {
    const view = renderView(<GameRunnerHost gameId={null} resolution="fit" />, { fixtures });
    expect(screen.getByText('Pick a game, or create one.')).toBeTruthy();

    act(() => useGameRunStore.setState({ runs: { [GAME_ID]: { runId: 'r1', state: 'running' } } }));
    view.rerender(<GameRunnerHost gameId={GAME_ID} resolution="fit" />);

    await waitFor(() =>
      expect(calls()).toContainEqual({ call: 'setBounds', gameId: GAME_ID, bounds: { x: 0, y: 0, width: 800, height: 450 } }),
    );
    expect((screen.getByTestId('game-stage') as HTMLElement).style.width).toBe('800px');
  });

  it('letterboxes a fixed resolution inside the stage', () => {
    expect(letterbox({ width: 800, height: 600 }, '1280x720')).toEqual({ width: 800, height: 450 });
    expect(letterbox({ width: 800, height: 600 }, 'fit')).toEqual({ width: 800, height: 600 });
  });
});
