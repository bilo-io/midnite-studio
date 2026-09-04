import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { noteText, ReattachedNote } from './reattached-note';

describe('noteText', () => {
  it('returns null for 0', () => {
    expect(noteText(0)).toBeNull();
  });

  it('returns null for negative counts', () => {
    expect(noteText(-1)).toBeNull();
  });

  it('formats single session correctly', () => {
    expect(noteText(1)).toBe('Reattached 1 session');
  });

  it('formats multiple sessions with plural suffix', () => {
    expect(noteText(3)).toBe('Reattached 3 sessions');
    expect(noteText(10)).toBe('Reattached 10 sessions');
  });
});

describe('ReattachedNote — actionable (Phase 51 Theme G)', () => {
  const session = (id: string) =>
    useTerminalStore.getState().openSession({
      kind: 'shell' as const,
      title: id,
      cwd: '/repo',
      repoId: 'r1',
    });

  afterEach(() => {
    cleanup();
    useTerminalStore.setState({
      sessions: [],
      activeId: null,
      states: {},
      reattachedCount: 0,
      reattachedSessionIds: [],
      reattachedDismissed: false,
    });
    useUiStore.setState({ terminalOpen: false, terminalListOpen: false });
  });

  it('renders nothing with no reattached sessions', () => {
    render(<ReattachedNote />);
    expect(screen.queryByTestId('reattached-note')).toBeNull();
  });

  it('clicking it reveals the first reattached session', () => {
    const s = session('s-1');
    useTerminalStore.setState({ reattachedCount: 1, reattachedSessionIds: [s.id] });

    render(<ReattachedNote />);
    fireEvent.click(screen.getByLabelText('Reattached 1 session — reveal'));

    expect(useUiStore.getState().terminalOpen).toBe(true);
    expect(useTerminalStore.getState().activeId).toBe(s.id);
  });

  it('dismissing does not reveal anything — the two buttons stay independent', () => {
    const s = session('s-1');
    useTerminalStore.setState({ reattachedCount: 1, reattachedSessionIds: [s.id] });

    render(<ReattachedNote />);
    fireEvent.click(screen.getByLabelText('Dismiss reattached note'));

    expect(useUiStore.getState().terminalOpen).toBe(false);
    expect(useTerminalStore.getState().reattachedDismissed).toBe(true);
  });
});
