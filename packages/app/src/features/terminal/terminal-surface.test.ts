import type { TerminalSession } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findCardSession, onMainSurface, useTerminalStore } from './terminal-store';

function session(overrides: Partial<TerminalSession>): TerminalSession {
  return {
    id: 's1',
    kind: 'shell',
    cwd: '/repo',
    repoId: 'r1',
    createdAt: 1,
    ...overrides,
  } as TerminalSession;
}

describe('onMainSurface', () => {
  it('keeps a session with no surface — every row written before the field existed', () => {
    expect(onMainSurface(session({}))).toBe(true);
  });

  it('keeps an explicitly main session', () => {
    expect(onMainSurface(session({ surface: 'main' }))).toBe(true);
  });

  it('excludes a FAB session — it renders in its loop tab and nowhere else', () => {
    expect(onMainSurface(session({ surface: 'fab' }))).toBe(false);
  });

  it('excludes a Kanban session — it renders in its card and nowhere else', () => {
    expect(onMainSurface(session({ surface: 'kanban' }))).toBe(false);
  });
});

describe('openSession with a surface', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {} });
  });

  it('stamps the surface onto the created session', () => {
    const created = useTerminalStore
      .getState()
      .openSession({ kind: 'agent', agentId: 'claude', title: 'repo', cwd: '/repo', repoId: 'r1', surface: 'fab' });
    expect(created.surface).toBe('fab');
  });

  it('omits the field entirely when no surface is asked for, so the row stays as it was', () => {
    const created = useTerminalStore
      .getState()
      .openSession({ kind: 'shell', title: 'repo', cwd: '/repo', repoId: 'r1' });
    expect('surface' in created).toBe(false);
  });

  it('a FAB session never steals the main panel selection', () => {
    const store = useTerminalStore.getState();
    const main = store.openSession({ kind: 'shell', title: 'repo', cwd: '/repo', repoId: 'r1' });
    expect(useTerminalStore.getState().activeId).toBe(main.id);

    store.openSession({ kind: 'agent', agentId: 'claude', title: 'repo', cwd: '/repo', repoId: 'r1', surface: 'fab' });
    expect(useTerminalStore.getState().activeId).toBe(main.id);
  });

  it('leaves activeId null when the only session opened is a FAB one', () => {
    useTerminalStore
      .getState()
      .openSession({ kind: 'agent', agentId: 'claude', title: 'repo', cwd: '/repo', repoId: 'r1', surface: 'fab' });
    expect(useTerminalStore.getState().activeId).toBeNull();
  });

  it('a Kanban session never steals the main panel selection either', () => {
    const store = useTerminalStore.getState();
    const main = store.openSession({ kind: 'shell', title: 'repo', cwd: '/repo', repoId: 'r1' });
    expect(useTerminalStore.getState().activeId).toBe(main.id);

    store.openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: { projectId: 'p1', itemId: 'i1' },
    });
    expect(useTerminalStore.getState().activeId).toBe(main.id);
  });

  it('stamps taskRef onto a Kanban session', () => {
    const created = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: { projectId: 'p1', itemId: 'i1' },
    });
    expect(created.taskRef).toEqual({ projectId: 'p1', itemId: 'i1' });
  });
});

describe('reorder', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {} });
  });

  it('keeps sessions the caller could not see', () => {
    const store = useTerminalStore.getState();
    const a = store.openSession({ kind: 'shell', title: 'a', cwd: '/repo', repoId: 'r1' });
    const fab = store.openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'loop',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'fab',
    });
    const b = store.openSession({ kind: 'shell', title: 'b', cwd: '/repo', repoId: 'r1' });

    /*
      The session list shows main rows only, so this is every id a drag can
      possibly name. Rebuilding the store from them alone used to delete the
      running loop out from under its FAB tab.
    */
    store.reorder([b.id, a.id]);

    const ids = useTerminalStore.getState().sessions.map((row) => row.id);
    expect(ids).toEqual([b.id, a.id, fab.id]);
  });
});

describe('findCardSession', () => {
  const TASK_REF = { projectId: 'p1', itemId: 'i1' };

  it('finds a live kanban session bound to the card', () => {
    const s = session({ id: 's1', surface: 'kanban', taskRef: TASK_REF });
    expect(findCardSession([s], { s1: 'open' }, TASK_REF)).toBe(s);
  });

  it('ignores a session bound to a different card', () => {
    const s = session({ id: 's1', surface: 'kanban', taskRef: { projectId: 'p1', itemId: 'other' } });
    expect(findCardSession([s], { s1: 'open' }, TASK_REF)).toBeUndefined();
  });

  it('ignores a main-surface session even with a matching taskRef', () => {
    const s = session({ id: 's1', taskRef: TASK_REF });
    expect(findCardSession([s], { s1: 'open' }, TASK_REF)).toBeUndefined();
  });

  it('ignores an exited session — the card should offer Start again', () => {
    const s = session({ id: 's1', surface: 'kanban', taskRef: TASK_REF });
    expect(findCardSession([s], { s1: 'exited' }, TASK_REF)).toBeUndefined();
  });

  it('ignores an asleep session — a card resumes with a fresh Start, not Stop', () => {
    const s = session({ id: 's1', surface: 'kanban', taskRef: TASK_REF, asleep: true });
    expect(findCardSession([s], { s1: 'open' }, TASK_REF)).toBeUndefined();
  });
});

describe('hydrate restores a Kanban session asleep, not ended', () => {
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('a restored Kanban session with no live pty comes back asleep', async () => {
    useTerminalStore.setState({ hydrated: false, sessions: [], activeId: null, states: {} });
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {
      terminal: {
        list: () =>
          Promise.resolve({
            sessions: [
              {
                session: {
                  id: 'card-1',
                  kind: 'agent',
                  agentId: 'claude',
                  title: 'card',
                  cwd: '/repo',
                  repoId: 'r1',
                  createdAt: 1,
                  surface: 'kanban',
                  taskRef: { projectId: 'p1', itemId: 'i1' },
                },
                scrollback: new Uint8Array(),
                live: null,
              },
            ],
          }),
      },
      pty: { create: () => undefined },
    };

    await useTerminalStore.getState().hydrate();

    const restored = useTerminalStore.getState().sessions.find((s) => s.id === 'card-1');
    expect(restored?.asleep).toBe(true);
  });
});

describe('closeSession', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {} });
  });

  it('never hands the selection to a FAB session', () => {
    const store = useTerminalStore.getState();
    const a = store.openSession({ kind: 'shell', title: 'a', cwd: '/repo', repoId: 'r1' });
    store.openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'loop',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'fab',
    });
    const b = store.openSession({ kind: 'shell', title: 'b', cwd: '/repo', repoId: 'r1' });

    useTerminalStore.getState().setActive(a.id);
    useTerminalStore.getState().closeSession(a.id);

    // The FAB row sits between them in the list; selecting it would leave the
    // panel blank with nothing highlighted.
    expect(useTerminalStore.getState().activeId).toBe(b.id);
  });

  it('clears the selection when only a FAB session is left', () => {
    const store = useTerminalStore.getState();
    const a = store.openSession({ kind: 'shell', title: 'a', cwd: '/repo', repoId: 'r1' });
    store.openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'loop',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'fab',
    });

    useTerminalStore.getState().closeSession(a.id);
    expect(useTerminalStore.getState().activeId).toBeNull();
  });
});
