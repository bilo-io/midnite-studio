import { beforeEach, describe, expect, it } from 'vitest';

import { useTerminalStore } from './terminal-store';

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
   * A replay is the largest thing the store holds and must land exactly once —
   * a second write would double the restored transcript on a remount.
   */
  it('hands out a replay buffer once and then forgets it', () => {
    const a = open('a');
    const bytes = new TextEncoder().encode('restored output');
    useTerminalStore.setState({ replay: { [a.id]: bytes } });

    expect(useTerminalStore.getState().takeReplay(a.id)).toEqual(bytes);
    expect(useTerminalStore.getState().takeReplay(a.id)).toBeNull();
  });

  it('reports no replay for a session that never had one', () => {
    const a = open('a');
    expect(useTerminalStore.getState().takeReplay(a.id)).toBeNull();
  });

  it('records an error alongside the unavailable state', () => {
    const a = open('a');
    useTerminalStore.getState().setState(a.id, 'unavailable', 'node-pty missing');

    expect(useTerminalStore.getState().states[a.id]).toBe('unavailable');
    expect(useTerminalStore.getState().errors[a.id]).toBe('node-pty missing');
  });
});
