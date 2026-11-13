// vitest/jsdom: the Play button leads the run controls, wears the gradient ring and names itself by run state.
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameRunStore } from './game-run-store';
import { GameRunnerToolbar } from './game-runner-toolbar';

const runMock = vi.fn(async () => ({ ok: true, value: { runId: 'r9' } }));

beforeEach(() => {
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { games: { run: runMock } };
  useGameRunStore.setState({ runs: {}, logs: {}, clearedAt: {}, popped: null });
  runMock.mockClear();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

function view(onPlay?: () => void) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <GameRunnerToolbar gameId="g1" resolution="fit" onResolution={() => undefined} onPlay={onPlay} />
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

describe('GameRunnerToolbar Play button', () => {
  it('is the first control, with the gradient ring classes, named Run when idle', () => {
    view();
    const first = screen.getByRole('toolbar', { name: 'Game controls' }).firstElementChild as HTMLElement;
    expect(first.getAttribute('aria-label')).toBe('Run');
    expect(first.className).toContain('gradient-border');
    expect(first.className).toContain('gradient-border--hover');
    expect(first.className).toContain('motion-safe:transition-shadow');
  });

  it('is named Show the running game while live, and only calls onPlay', () => {
    useGameRunStore.setState({ runs: { g1: { runId: 'r1', state: 'running' } } });
    const onPlay = vi.fn();
    view(onPlay);
    fireEvent.click(screen.getByRole('button', { name: 'Show the running game' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('runs the game and calls onPlay when idle', async () => {
    const onPlay = vi.fn();
    view(onPlay);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(runMock).toHaveBeenCalledWith({ gameId: 'g1' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
