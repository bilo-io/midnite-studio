import { DialogHost } from '../../components/dialog-host';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from './terminal-store';
import { TerminalPanel } from './terminal-panel';

vi.mock('../../services/queries', () => ({
  useRepos: () => ({ data: [] }),
}));

vi.mock('./lazy-terminal-view', () => ({
  LazyTerminalView: () => <div data-testid="mock-terminal-view" />,
}));

vi.mock('./use-agents', () => ({
  useAgents: () => ({ agents: [], status: [] }),
}));

describe('TerminalPanel with ReattachedNote', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      sessions: [],
      activeId: null,
      states: {},
      reattachedCount: 0,
      reattachedSessionIds: [],
      reattachedDismissed: false,
      hydrated: true,
    });
    useUiStore.setState({ terminalOpen: true, terminalListOpen: false });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render reattached note when count is 0', () => {
    render(
      <TerminalPanel
        cwd="/repo"
        repoId="r1"
        repoName="test-repo"
        fitSignal={0}
      />,
    );

    expect(screen.queryByTestId('reattached-note')).toBeNull();
  });

  it('renders reattached note at the bottom of the panel when sessions are reattached', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'shell' as const,
      title: 's-1',
      cwd: '/repo',
      repoId: 'r1',
    });
    useTerminalStore.setState({
      reattachedCount: 2,
      reattachedSessionIds: [session.id, 's-2'],
    });

    render(
      <TerminalPanel
        cwd="/repo"
        repoId="r1"
        repoName="test-repo"
        fitSignal={0}
      />,
    );

    const note = screen.getByTestId('reattached-note');
    expect(note).toBeDefined();
    expect(screen.getByText('Reattached 2 sessions')).toBeDefined();

    // Clicking dismiss hides the note
    fireEvent.click(screen.getByLabelText('Dismiss reattached note'));
    expect(screen.queryByTestId('reattached-note')).toBeNull();
  });

  it('keeps legacy hidden and the note at the panel bottom when the list is closed', () => {
    const a = useTerminalStore.getState().openSession({ kind: 'shell' as const, title: 'a', cwd: '/repo', repoId: 'r1' });
    const b = useTerminalStore.getState().openSession({ kind: 'shell' as const, title: 'b', cwd: '/repo', repoId: 'r1' });
    useTerminalStore.setState({
      legacy: { [a.id]: true },
      legacyBannerDismissed: false,
      reattachedCount: 2,
      reattachedSessionIds: [a.id, b.id],
    });
    const { container } = render(
      <TerminalPanel cwd="/repo" repoId="r1" repoName="test-repo" fitSignal={0} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    const note = screen.getByTestId('reattached-note');
    expect(container.querySelector('[data-session-list]')?.contains(note) ?? false).toBe(false);
  });

  it('renders the reattached note inside the session list when the list is open', () => {
    const a = useTerminalStore.getState().openSession({ kind: 'shell' as const, title: 'a', cwd: '/repo', repoId: 'r1' });
    const b = useTerminalStore.getState().openSession({ kind: 'shell' as const, title: 'b', cwd: '/repo', repoId: 'r1' });
    useTerminalStore.setState({ reattachedCount: 2, reattachedSessionIds: [a.id, b.id] });
    useUiStore.setState({ terminalListOpen: true });
    const { container } = render(
      <DialogHost>
        <TerminalPanel cwd="/repo" repoId="r1" repoName="test-repo" fitSignal={0} />
      </DialogHost>,
    );
    const list = container.querySelector('[data-session-list]');
    expect(list).not.toBeNull();
    expect(list?.contains(screen.getByTestId('reattached-note'))).toBe(true);
    expect(screen.getAllByTestId('reattached-note')).toHaveLength(1);
  });
});
