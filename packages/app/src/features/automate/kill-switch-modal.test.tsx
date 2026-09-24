/**
 * jsdom is enough here — text/roles and store state, no real layout or
 * pointer capability needed (`docs/TESTING.md`'s own rule).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { KillSwitchModal } from './kill-switch-modal';

describe('KillSwitchModal (Phase 95 Theme H)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
    useUiStore.setState({
      killSwitchOpen: false,
      selectedRepoId: null,
      projectBoardByRepo: {},
      forgeAccounts: [],
      forgeActiveAccountId: null,
      automateEnabledByProject: {},
    });
  });

  it('renders nothing while closed', () => {
    render(<KillSwitchModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders all five scope options, labelled, once open', () => {
    useUiStore.setState({ killSwitchOpen: true });
    render(<KillSwitchModal />);

    expect(screen.getByRole('dialog', { name: 'Auto-mate kill switch' })).not.toBeNull();
    for (const label of ['Flow', 'Project', 'Repo', 'Forge user', 'Global']) {
      expect(screen.getByRole('button', { name: label })).not.toBeNull();
    }
  });

  it('disables a scope with nothing to key on, and defaults to the narrowest available one', () => {
    useUiStore.setState({ killSwitchOpen: true, selectedRepoId: 'repo-1' });
    render(<KillSwitchModal />);

    // No project board, no forge account, no workflow open — only Repo and
    // Global have anything to key on.
    expect((screen.getByRole('button', { name: 'Flow' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Project' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Repo' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Global' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Repo' }).getAttribute('aria-pressed')).toBe('true');
  });

  it("names the scope's own count and effect in one sentence", () => {
    useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'repo-1',
      surface: 'kanban',
      taskRef: { projectId: 'proj-1', itemId: 'item-1' },
      projectRef: { projectId: 'proj-1', forge: 'github' },
    });
    useTerminalStore.setState((s) => ({
      states: { ...s.states, [s.sessions[0]!.id]: 'open' },
    }));
    useUiStore.setState({
      killSwitchOpen: true,
      selectedRepoId: 'repo-1',
      projectBoardByRepo: { 'repo-1': 'proj-1' },
      automateEnabledByProject: { 'proj-1': true },
    });
    render(<KillSwitchModal />);

    expect(
      screen.getByText('Stops 1 session on this project board and turns off Auto-mate for this project board.'),
    ).not.toBeNull();
  });

  it('Confirm closes every matching session and turns off Auto-mate in scope', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'repo-1',
      surface: 'kanban',
      taskRef: { projectId: 'proj-1', itemId: 'item-1' },
      projectRef: { projectId: 'proj-1', forge: 'github' },
    });
    useTerminalStore.setState((s) => ({ states: { ...s.states, [session.id]: 'open' } }));
    useUiStore.setState({
      killSwitchOpen: true,
      selectedRepoId: 'repo-1',
      projectBoardByRepo: { 'repo-1': 'proj-1' },
      automateEnabledByProject: { 'proj-1': true },
    });
    render(<KillSwitchModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(useTerminalStore.getState().sessions).toHaveLength(0);
    expect(useUiStore.getState().automateEnabledByProject['proj-1']).toBe(false);
    expect(useUiStore.getState().killSwitchOpen).toBe(false);
  });

  it('Cancel closes the modal without touching any session', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'repo-1',
    });
    useTerminalStore.setState((s) => ({ states: { ...s.states, [session.id]: 'open' } }));
    useUiStore.setState({ killSwitchOpen: true, selectedRepoId: 'repo-1' });
    render(<KillSwitchModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useTerminalStore.getState().sessions).toHaveLength(1);
    expect(useUiStore.getState().killSwitchOpen).toBe(false);
  });

  it('focus returns to the trigger on close (Phase 68)', () => {
    function Trigger() {
      return (
        <>
          <button type="button" onClick={() => useUiStore.getState().openKillSwitch()}>
            Open
          </button>
          <KillSwitchModal />
        </>
      );
    }
    render(<Trigger />);

    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(document.activeElement).toBe(trigger);
  });
});
