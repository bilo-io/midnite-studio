import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTerminalStore } from '../../terminal/terminal-store';
import { useCardStatus } from './use-card-status';

const TASK_REF = { projectId: 'p1', itemId: 'i1' };

describe('useCardStatus', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
  });

  it('idle when no session is bound to the card', () => {
    const { result } = renderHook(() => useCardStatus(TASK_REF));
    expect(result.current).toMatchObject({ running: false, waiting: false, sessionId: undefined });
  });

  it('running once a kanban session is opened for this card', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: TASK_REF,
    });
    useTerminalStore.getState().setState(session.id, 'open');

    const { result } = renderHook(() => useCardStatus(TASK_REF));
    expect(result.current.running).toBe(true);
    expect(result.current.agentId).toBe('claude');
    expect(result.current.sessionId).toBe(session.id);
  });

  it('waiting once the session has a question on screen', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: TASK_REF,
    });
    useTerminalStore.getState().setState(session.id, 'open');
    useTerminalStore.getState().setActivity(session.id, 'waiting');

    const { result } = renderHook(() => useCardStatus(TASK_REF));
    expect(result.current.waiting).toBe(true);
  });

  it('ignores a session bound to a different card', () => {
    useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: { projectId: 'p1', itemId: 'other' },
    });

    const { result } = renderHook(() => useCardStatus(TASK_REF));
    expect(result.current.running).toBe(false);
  });
});
