// vitest/jsdom: the native game view hides while another centre tab covers the stage.
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameRunStore } from './game-run-store';
import { GameRunnerHost } from './game-runner-host';

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const setVisible = vi.fn();
const setBounds = vi.fn();

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { games: { setVisible, setBounds } };
  useGameRunStore.setState({ runs: { g1: { runId: 'r1', state: 'running' } }, logs: {}, clearedAt: {}, popped: null });
  setVisible.mockClear();
  setBounds.mockClear();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  vi.unstubAllGlobals();
});

function view(active: boolean) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <GameRunnerHost gameId="g1" resolution="fit" active={active} />
    </QueryClientProvider>
  );
}

describe('GameRunnerHost active', () => {
  it('sends setVisible({ visible: false }) while inactive', () => {
    render(view(false));
    expect(setVisible).toHaveBeenCalledWith({ gameId: 'g1', visible: false });
    expect(setVisible).not.toHaveBeenCalledWith({ gameId: 'g1', visible: true });
  });

  it('shows the view again when it becomes active', () => {
    const { rerender } = render(view(false));
    setVisible.mockClear();
    rerender(view(true));
    expect(setVisible).toHaveBeenCalledWith({ gameId: 'g1', visible: true });
  });
});
