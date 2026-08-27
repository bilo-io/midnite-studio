import { beforeEach, describe, expect, it } from 'vitest';

import { sessionLabel, useTerminalStore } from './terminal-store';

/**
 * The store's own logic, with no bridge behind it.
 *
 * `bridge()` returns undefined under jsdom, so every `terminal.save` /
 * `pty.kill` call is a no-op here — which is the point: these tests are about
 * what the renderer believes, not about what main is told.
 */
const reset = () =>
  useTerminalStore.setState({
    sessions: [],
    activeId: null,
    hydrated: false,
    ptyIds: {},
    states: {},
    replay: {},
    errors: {},
  });

const open = (title: string) =>
  useTerminalStore.getState().openSession({
    kind: 'shell',
    title,
    cwd: `/repos/${title}`,
    repoId: `repo:${title}`,
  });

describe('useTerminalStore', () => {
  beforeEach(reset);

  it('makes a newly opened session the active one', () => {
    const first = open('alpha');
    expect(useTerminalStore.getState().activeId).toBe(first.id);

    const second = open('beta');
    expect(useTerminalStore.getState().activeId).toBe(second.id);
    expect(useTerminalStore.getState().sessions).toHaveLength(2);
  });

  it('records an agent session with its roster id', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'midnite',
      cwd: '/repos/midnite',
      repoId: 'repo:midnite',
    });

    expect(session.kind).toBe('agent');
    expect(session.agentId).toBe('claude');
  });

  /**
   * Closing the middle of three should leave you in a terminal, not on an empty
   * panel — the neighbour is what the user was next to.
   */
  it('falls back to the next session when the active one closes', () => {
    const a = open('a');
    const b = open('b');
    const c = open('c');

    useTerminalStore.getState().setActive(b.id);
    useTerminalStore.getState().closeSession(b.id);

    expect(useTerminalStore.getState().activeId).toBe(c.id);
    expect(useTerminalStore.getState().sessions.map((s) => s.id)).toEqual([a.id, c.id]);
  });

  it('falls back to the previous session when the last one closes', () => {
    const a = open('a');
    const b = open('b');

    useTerminalStore.getState().closeSession(b.id);
    expect(useTerminalStore.getState().activeId).toBe(a.id);
  });

  it('leaves nothing active once the last session closes', () => {
    const only = open('only');
    useTerminalStore.getState().closeSession(only.id);

    expect(useTerminalStore.getState().activeId).toBeNull();
    expect(useTerminalStore.getState().sessions).toEqual([]);
  });

  it('drops the closed session runtime state, so an id cannot be reused stale', () => {
    const a = open('a');
    useTerminalStore.getState().bindPty(a.id, 'pty-1');
    useTerminalStore.getState().setState(a.id, 'open');

    useTerminalStore.getState().closeSession(a.id);

    expect(useTerminalStore.getState().ptyIds[a.id]).toBeUndefined();
    expect(useTerminalStore.getState().states[a.id]).toBeUndefined();
  });

  it('applies a new order', () => {
    const a = open('a');
    const b = open('b');
    const c = open('c');

    useTerminalStore.getState().reorder([c.id, a.id, b.id]);

    expect(useTerminalStore.getState().sessions.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
  });

  /**
   * A replay survives being read, and retires when a shell takes over.
   *
   * It used to be consumed on the first read, on the grounds that a remount
   * would otherwise double it. But a remount builds a NEW xterm with an empty
   * screen, so replaying into it is right every time — and consuming it meant
   * the second mount found nothing, came up blank, and (reading "no replay" as
   * "brand new session") started a shell nobody had asked to revive. Under
   * StrictMode that is every mount.
   */
  it('hands out a replay buffer as often as a new terminal asks for it', () => {
    const a = open('a');
    const bytes = new TextEncoder().encode('restored output');
    useTerminalStore.setState({ replay: { [a.id]: bytes } });

    expect(useTerminalStore.getState().peekReplay(a.id)).toEqual(bytes);
    expect(useTerminalStore.getState().peekReplay(a.id)).toEqual(bytes);
  });

  it('retires the replay once a live shell owns the screen', () => {
    // Past this point the pty is writing the screen, so the transcript from the
    // last run is history a remount should not paint over it.
    const a = open('a');
    useTerminalStore.setState({ replay: { [a.id]: new TextEncoder().encode('old') } });

    useTerminalStore.getState().bindPty(a.id, 'pty-1');
    expect(useTerminalStore.getState().peekReplay(a.id)).toBeNull();
  });

  it('reports no replay for a session that never had one', () => {
    const a = open('a');
    expect(useTerminalStore.getState().peekReplay(a.id)).toBeNull();
  });

  it('records an error alongside the unavailable state', () => {
    const a = open('a');
    useTerminalStore.getState().setState(a.id, 'unavailable', 'node-pty missing');

    expect(useTerminalStore.getState().states[a.id]).toBe('unavailable');
    expect(useTerminalStore.getState().errors[a.id]).toBe('node-pty missing');
  });

  describe('renameSession', () => {
    it('sets a custom name that outranks the live guess', () => {
      const a = open('a');
      useTerminalStore.getState().setAutoName(a.id, 'git status');
      useTerminalStore.getState().renameSession(a.id, 'Rebase onto main');

      const session = useTerminalStore.getState().sessions.find((s) => s.id === a.id)!;
      expect(session.name).toBe('Rebase onto main');
      expect(sessionLabel(session, useTerminalStore.getState().autoNames[a.id])).toBe(
        'Rebase onto main',
      );
    });

    it('clears the custom name back to the live guess on an undefined rename', () => {
      const a = open('a');
      useTerminalStore.getState().setAutoName(a.id, 'git status');
      useTerminalStore.getState().renameSession(a.id, 'Rebase onto main');
      useTerminalStore.getState().renameSession(a.id, undefined);

      const session = useTerminalStore.getState().sessions.find((s) => s.id === a.id)!;
      expect(session.name).toBeUndefined();
      expect(sessionLabel(session, useTerminalStore.getState().autoNames[a.id])).toBe(
        'git status',
      );
    });
  });

  describe('setActivity', () => {
    it('records and clears a session activity guess', () => {
      const a = open('a');
      useTerminalStore.getState().setActivity(a.id, 'thinking');
      expect(useTerminalStore.getState().activity[a.id]).toBe('thinking');

      useTerminalStore.getState().setActivity(a.id, undefined);
      expect(useTerminalStore.getState().activity[a.id]).toBeUndefined();
    });
  });
});

describe('sessionLabel', () => {
  const base = {
    id: 's1',
    kind: 'shell' as const,
    title: 'midnite-git',
    cwd: '/repos/midnite-git',
    repoId: 'repo:midnite-git',
    createdAt: 0,
  };

  it('prefers the persisted name over everything else', () => {
    expect(sessionLabel({ ...base, name: 'Build' }, 'git log', 'Claude')).toBe('Build');
  });

  it('falls back to the live guess when there is no custom name', () => {
    expect(sessionLabel(base, 'git log', 'Claude')).toBe('git log');
  });

  it('falls back to the agent label when nothing else is known', () => {
    expect(sessionLabel(base, undefined, 'Claude')).toBe('Claude');
  });

  it('falls back to a plain "Terminal" for an unnamed shell', () => {
    expect(sessionLabel(base, undefined)).toBe('Terminal');
  });
});
