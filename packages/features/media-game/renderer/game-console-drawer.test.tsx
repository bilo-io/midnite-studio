// vitest/jsdom: the console docks in a frame BottomPanel — collapse hides the log, Clear and the filters keep working.
import { useBottomPanelStore } from '@midnite/studio-frame';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GameConsoleDrawer } from './game-console-drawer';
import { useGameRunStore } from './game-run-store';

beforeEach(() => {
  useBottomPanelStore.setState({ panels: {} });
  useGameRunStore.setState({ runs: {}, logs: {}, clearedAt: {}, popped: null });
  useGameRunStore.getState().applyRunState({ gameId: 'g1', runId: 'r1', state: 'running' });
  useGameRunStore.getState().appendLogs('g1', 'r1', [
    { seq: 1, level: 'log', text: 'hello world', at: 1 },
    { seq: 2, level: 'error', text: 'boom', at: 2 },
  ]);
});
afterEach(cleanup);

describe('GameConsoleDrawer panel', () => {
  it('is expanded at 176px by default and shows the log', () => {
    render(<GameConsoleDrawer gameId="g1" />);
    expect(screen.getByTestId('game-console').style.height).toBe('176px');
    expect(screen.getByRole('log', { name: 'Console output' }).textContent).toContain('hello world');
    expect(screen.getByRole('separator', { name: 'Resize game console' })).toBeTruthy();
  });

  it('collapses to its header row and expands again', () => {
    render(<GameConsoleDrawer gameId="g1" />);
    const toggle = screen.getByRole('button', { name: 'Console' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('log')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByRole('log', { name: 'Console output' }).textContent).toContain('hello world');
  });

  it('filters and clears without toggling the panel', () => {
    render(<GameConsoleDrawer gameId="g1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Errors' }));
    expect(screen.getByRole('log').textContent).not.toContain('hello world');
    expect(screen.getByRole('button', { name: 'Console' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('log').textContent).toContain('Nothing logged yet.');
    expect(screen.getByRole('button', { name: 'Console' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('remembers collapsed across a remount', () => {
    const first = render(<GameConsoleDrawer gameId="g1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Console' }));
    first.unmount();
    render(<GameConsoleDrawer gameId="g1" />);
    expect(screen.getByRole('button', { name: 'Console' }).getAttribute('aria-expanded')).toBe('false');
  });
});
