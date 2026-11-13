// vitest/jsdom: the centre tabs — roles, hidden panels, arrow keys and the live dot. The native view's hide is
// asserted in game-runner-host.test.tsx; none of this needs a real browser.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameCenter } from './game-center';
import { useGameRunStore } from './game-run-store';
import type { GameMode } from './use-game-mode';

vi.mock('./game-runner-host', () => ({ GameRunnerHost: () => <div data-testid="runner" /> }));
vi.mock('./game-console-drawer', () => ({ GameConsoleDrawer: () => <div data-testid="console" /> }));

beforeEach(() => useGameRunStore.setState({ runs: {}, logs: {}, clearedAt: {}, popped: null }));
afterEach(cleanup);

function Harness({ initial = 'editor' as GameMode }) {
  const [mode, setMode] = useState<GameMode>(initial);
  return <GameCenter game={{ gameId: 'g1' }} mode={mode} onMode={setMode} resolution="fit" sceneSlot={<span>scenes</span>} />;
}

describe('GameCenter', () => {
  it('renders two tabs with roles and aria-selected, and hides the inactive panel', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Game view' })).toBeTruthy();
    const editor = screen.getByRole('tab', { name: 'Level editor' });
    const play = screen.getByRole('tab', { name: 'Play mode' });
    expect(editor.getAttribute('aria-selected')).toBe('true');
    expect(play.getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('game-panel-play')?.hidden).toBe(true);
    expect(document.getElementById('game-panel-editor')?.hidden).toBe(false);
    // Both panels stay mounted.
    expect(screen.getByTestId('runner')).toBeTruthy();
    expect(screen.getByText('Level editing is not available for this game yet.')).toBeTruthy();
    expect(screen.getByText('scenes')).toBeTruthy();
  });

  it('switches on click and moves with the arrow keys', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Play mode' }));
    expect(document.getElementById('game-panel-play')?.hidden).toBe(false);
    expect(document.getElementById('game-panel-editor')?.hidden).toBe(true);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Play mode' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Level editor' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Level editor' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Play mode' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows a live dot on the Play tab while a run is live and the editor is showing', () => {
    render(<Harness />);
    expect(screen.queryByRole('img', { name: 'Running' })).toBeNull();
    act(() => useGameRunStore.getState().applyRunState({ gameId: 'g1', runId: 'r1', state: 'running' }));
    expect(screen.getByRole('img', { name: 'Running' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Play mode/ }));
    expect(screen.queryByRole('img', { name: 'Running' })).toBeNull();
  });
});
