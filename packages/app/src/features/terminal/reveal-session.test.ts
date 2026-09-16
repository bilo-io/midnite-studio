import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { revealFabSession, revealSession } from './reveal-session';
import { useTerminalStore } from './terminal-store';

function openKanbanSession() {
  return useTerminalStore.getState().openSession({
    kind: 'agent',
    agentId: 'claude',
    title: 'card',
    cwd: '/repo',
    repoId: 'r1',
    surface: 'kanban',
    taskRef: { projectId: 'proj1', itemId: 'item1' },
  });
}

describe('revealSession', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {} });
    useUiStore.setState({ terminalOpen: false, terminalListOpen: false });
  });

  afterEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {} });
  });

  it('opens the panel, selects the session and opens the list', () => {
    const session = openKanbanSession();

    expect(revealSession(session.id)).toBe(true);

    expect(useUiStore.getState().terminalOpen).toBe(true);
    expect(useUiStore.getState().terminalListOpen).toBe(true);
    expect(useTerminalStore.getState().activeId).toBe(session.id);
  });

  it('a Kanban session does not select itself on open — only this does', () => {
    const session = openKanbanSession();

    // The whole point of keeping `onMainSurface` narrow: launching from a card
    // leaves whatever the user had selected alone.
    expect(useTerminalStore.getState().activeId).toBeNull();

    revealSession(session.id);
    expect(useTerminalStore.getState().activeId).toBe(session.id);
  });

  it('leaves an already-open list open rather than toggling it shut', () => {
    useUiStore.setState({ terminalListOpen: true });
    const session = openKanbanSession();

    revealSession(session.id);

    expect(useUiStore.getState().terminalListOpen).toBe(true);
  });

  it('refuses an unknown id, and changes nothing', () => {
    expect(revealSession('nope')).toBe(false);
    expect(useUiStore.getState().terminalOpen).toBe(false);
    expect(useTerminalStore.getState().activeId).toBeNull();
  });

  it('refuses a FAB session — the panel cannot render one, so it would open blank', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'loop',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'fab',
    });

    expect(revealSession(session.id)).toBe(false);
    expect(useUiStore.getState().terminalOpen).toBe(false);
  });
});

describe('revealFabSession', () => {
  const focusRole = vi.fn();

  beforeEach(() => {
    useUiStore.setState({ fabPanelOpen: false, fabDetached: false, fabSessions: {}, activeFabTab: 'guard' });
    focusRole.mockReset();
    // `bridge()` reads `window.midniteStudio`, which is `undefined` under
    // jsdom by default (see `services/bridge.ts`) — only the detached branch
    // needs it, so it's set directly on `window` rather than mocking the
    // whole module, which would silently defang every other bridge call
    // `openSession`/etc. make in the `revealSession` tests above.
    // @ts-expect-error test bridge mock — only `window.focusRole` is exercised
    window.midniteStudio = { window: { focusRole } };
  });

  afterEach(() => {
    useUiStore.setState({ fabPanelOpen: false, fabDetached: false, fabSessions: {}, activeFabTab: 'guard' });
    window.midniteStudio = undefined;
  });

  it('refuses a session with no bound loop tab', () => {
    expect(revealFabSession('nope')).toBe(false);
    expect(useUiStore.getState().fabPanelOpen).toBe(false);
  });

  it('opens the docked Loops panel on the bound tab when not detached', () => {
    useUiStore.setState({ fabSessions: { innovate: 'fab-1' } });

    expect(revealFabSession('fab-1')).toBe(true);

    expect(useUiStore.getState().fabPanelOpen).toBe(true);
    expect(useUiStore.getState().activeFabTab).toBe('innovate');
    expect(focusRole).not.toHaveBeenCalled();
  });

  it('focuses the detached Loops window instead of docking a second copy', () => {
    useUiStore.setState({ fabSessions: { watchdog: 'fab-2' }, fabDetached: true });

    expect(revealFabSession('fab-2')).toBe(true);

    expect(useUiStore.getState().activeFabTab).toBe('watchdog');
    expect(useUiStore.getState().fabPanelOpen).toBe(false);
    expect(focusRole).toHaveBeenCalledWith({ role: 'fab' });
  });
});
