// vitest/jsdom: the pause policy (Decision 10) — leaving Play pauses only a run this window's Play button started.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameRunStore } from './game-run-store';
import { useGameMode } from './use-game-mode';

const toolbar = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { games: { toolbar } };
  useGameRunStore.setState({ runs: {}, logs: {}, clearedAt: {}, popped: null });
  toolbar.mockClear();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const run = (state: 'starting' | 'running' | 'paused' | 'stopped', runId = 'r1') =>
  act(() => useGameRunStore.getState().applyRunState({ gameId: 'g1', runId, state }));

/** The Play button started `runId`: Run clicked, tab shown, run id resolved. */
async function playFromButton(result: { current: ReturnType<typeof useGameMode> }, runId = 'r1') {
  await act(async () => {
    result.current.onPlay('g1', Promise.resolve(runId));
    await Promise.resolve();
  });
  run('running', runId);
}

describe('useGameMode', () => {
  it('starts every game on the editor tab and Play switches to play', async () => {
    const { result } = renderHook(() => useGameMode(true));
    expect(result.current.modeOf('g1')).toBe('editor');
    await playFromButton(result);
    expect(result.current.modeOf('g1')).toBe('play');
  });

  it('pauses once when leaving Play for a run the Play button started, and resumes it on return', async () => {
    const { result } = renderHook(() => useGameMode(true));
    await playFromButton(result);
    act(() => result.current.setMode('g1', 'editor'));
    expect(toolbar).toHaveBeenCalledTimes(1);
    expect(toolbar).toHaveBeenCalledWith({ gameId: 'g1', action: 'pause' });
    run('paused');
    act(() => result.current.setMode('g1', 'play'));
    expect(toolbar).toHaveBeenLastCalledWith({ gameId: 'g1', action: 'resume' });
  });

  it('does not pause a run started elsewhere', () => {
    const { result } = renderHook(() => useGameMode(true));
    run('running', 'agent-run');
    act(() => result.current.setMode('g1', 'play'));
    act(() => result.current.setMode('g1', 'editor'));
    expect(toolbar).not.toHaveBeenCalled();
  });

  it('leaves a run the user paused by hand paused on return', async () => {
    const { result } = renderHook(() => useGameMode(true));
    await playFromButton(result);
    run('paused');
    act(() => result.current.setMode('g1', 'editor'));
    act(() => result.current.setMode('g1', 'play'));
    expect(toolbar).not.toHaveBeenCalled();
  });

  it('sends nothing when pauseWhenEditing is off', async () => {
    const { result } = renderHook(() => useGameMode(false));
    await playFromButton(result);
    act(() => result.current.setMode('g1', 'editor'));
    expect(toolbar).not.toHaveBeenCalled();
  });

  it('does not pause a popped-out run', async () => {
    const { result } = renderHook(() => useGameMode(true));
    await playFromButton(result);
    act(() => useGameRunStore.getState().setPopped('g1'));
    act(() => result.current.setMode('g1', 'editor'));
    expect(toolbar).not.toHaveBeenCalled();
  });
});
