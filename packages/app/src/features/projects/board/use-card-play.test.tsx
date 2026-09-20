import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { useCardPlay } from './use-card-play';
import { issueItem } from '../__fixtures__/project-item';

const TASK_REF = { projectId: 'proj-1', itemId: 'item-1' };

function fireEvent(onPlay: (event: { stopPropagation: () => void }) => void) {
  const stopPropagation = vi.fn();
  onPlay({ stopPropagation });
  return stopPropagation;
}

describe('useCardPlay (Phase 92 Theme A)', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
    useUiStore.setState({ terminalOpen: false, terminalListOpen: false });
  });

  it('reveals an already-bound session rather than starting a new one', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: TASK_REF,
    });

    const item = issueItem({ id: TASK_REF.itemId, content: { type: 'issue', title: 'Fix it' } as never });
    const { result } = renderHook(() =>
      useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: session.id }),
    );

    const stopPropagation = fireEvent(result.current.onPlay);

    expect(stopPropagation).toHaveBeenCalled();
    expect(useTerminalStore.getState().activeId).toBe(session.id);
    expect(useUiStore.getState().terminalOpen).toBe(true);
    // No second session started for the reveal path.
    expect(useTerminalStore.getState().sessions).toHaveLength(1);
  });

  it('starts a new agent session when no session is bound, and reveals it', () => {
    const item = issueItem({ id: TASK_REF.itemId, content: { type: 'issue', title: 'Fix it' } as never });
    const { result } = renderHook(() =>
      useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
    );

    fireEvent(result.current.onPlay);

    const sessions = useTerminalStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.surface).toBe('kanban');
    expect(sessions[0]?.taskRef).toEqual(TASK_REF);
    expect(sessions[0]?.agentId).toBe('claude');
    expect(useTerminalStore.getState().activeId).toBe(sessions[0]?.id);
    expect(useUiStore.getState().terminalOpen).toBe(true);
  });

  it('picks the most-recently-created agent session on this repo as the agent to relaunch', () => {
    // Neither prior session is bound to this card — the fallback is "most
    // recently used agent anywhere on this repo", not "most recent on this card".
    useTerminalStore.setState({
      sessions: [
        { id: 'older', kind: 'agent', agentId: 'claude', title: 'older', cwd: '/repo', repoId: 'r1', createdAt: 1 },
        { id: 'newer', kind: 'agent', agentId: 'codex', title: 'newer', cwd: '/repo', repoId: 'r1', createdAt: 2 },
      ],
      activeId: null,
      states: {},
      activity: {},
    });

    const item = issueItem({ id: TASK_REF.itemId, content: { type: 'issue', title: 'Fix it' } as never });
    const { result } = renderHook(() =>
      useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
    );

    fireEvent(result.current.onPlay);

    const sessions = useTerminalStore.getState().sessions;
    const launched = sessions.find((s) => s.taskRef?.itemId === TASK_REF.itemId);
    expect(launched?.agentId).toBe('codex');
  });

  it('does nothing past stopPropagation when there is no item (a foreign graph node)', () => {
    const { result } = renderHook(() =>
      useCardPlay({ item: undefined, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
    );

    fireEvent(result.current.onPlay);

    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it('produces a byte-identical startAgent call regardless of which caller supplies the same inputs', () => {
    const item = issueItem({ id: TASK_REF.itemId, content: { type: 'issue', title: 'Same everywhere' } as never });

    const { result: fromTaskCard } = renderHook(() =>
      useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
    );
    fireEvent(fromTaskCard.current.onPlay);
    const first = useTerminalStore.getState().sessions[0]!;

    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });

    const { result: fromGraphNode } = renderHook(() =>
      useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
    );
    fireEvent(fromGraphNode.current.onPlay);
    const second = useTerminalStore.getState().sessions[0]!;

    expect({ ...first, id: '', createdAt: 0 }).toEqual({ ...second, id: '', createdAt: 0 });
  });
});
