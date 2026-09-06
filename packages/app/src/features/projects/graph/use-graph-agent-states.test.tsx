import { act, render, renderHook } from '@testing-library/react';
import { memo } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTerminalStore } from '../../terminal/terminal-store';
import type { CardGlowState } from '../board/glow-state';
import { useGraphAgentStates } from './use-graph-agent-states';

const PROJECT_ID = 'proj1';

describe('useGraphAgentStates', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
  });

  it('empty map with no bound sessions', () => {
    const { result } = renderHook(() => useGraphAgentStates(PROJECT_ID));
    expect(result.current.size).toBe(0);
  });

  it('running once a kanban session is bound to an item on this project', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: { projectId: PROJECT_ID, itemId: 'item-1' },
    });
    useTerminalStore.getState().setState(session.id, 'open');

    const { result } = renderHook(() => useGraphAgentStates(PROJECT_ID));
    expect(result.current.get('item-1')).toBe('running');
  });

  it('waiting once the bound session has a question on screen', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: { projectId: PROJECT_ID, itemId: 'item-1' },
    });
    useTerminalStore.getState().setState(session.id, 'open');
    useTerminalStore.getState().setActivity(session.id, 'waiting');

    const { result } = renderHook(() => useGraphAgentStates(PROJECT_ID));
    expect(result.current.get('item-1')).toBe('waiting');
  });

  it('ignores a session bound to a different project — foreign boards never bleed through', () => {
    useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: { projectId: 'other-project', itemId: 'item-1' },
    });

    const { result } = renderHook(() => useGraphAgentStates(PROJECT_ID));
    expect(result.current.size).toBe(0);
  });

  it('ignores a non-kanban session, even one carrying a matching taskRef', () => {
    useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'main terminal',
      cwd: '/repo',
      repoId: 'r1',
    });

    const { result } = renderHook(() => useGraphAgentStates(PROJECT_ID));
    expect(result.current.size).toBe(0);
  });

  it('a card can only ever be idle when its one session has ended, mirroring findAnyCardSession', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
      taskRef: { projectId: PROJECT_ID, itemId: 'item-1' },
    });
    useTerminalStore.getState().setState(session.id, 'exited');

    const { result } = renderHook(() => useGraphAgentStates(PROJECT_ID));
    expect(result.current.get('item-1')).toBe('idle');
  });

  /**
   * `SpyNode`/`Harness` stand in for the future `ProjectGraphNode` (Theme D,
   * not built yet) — a pure, memoized consumer that receives its own
   * `CardGlowState` as a plain prop. What this locks in now is the property
   * Theme F actually promises: the hook returns the same string primitive
   * for every item whose derived state did not change, so a memoized real
   * node will bail out of re-rendering on those, the same way this stand-in
   * does.
   */
  it('one store update to one of 300 nodes re-renders only that node’s memoized consumer', () => {
    const renderSpy = vi.fn();
    const SpyNode = memo(function SpyNode({ glow }: { glow: CardGlowState }) {
      renderSpy();
      return <div>{glow}</div>;
    });

    function Harness({ itemIds }: { itemIds: string[] }) {
      const states = useGraphAgentStates(PROJECT_ID);
      return (
        <>
          {itemIds.map((id) => (
            <SpyNode key={id} glow={states.get(id) ?? 'idle'} />
          ))}
        </>
      );
    }

    const itemIds = Array.from({ length: 300 }, (_, i) => `item-${i}`);
    render(<Harness itemIds={itemIds} />);
    expect(renderSpy).toHaveBeenCalledTimes(300);
    renderSpy.mockClear();

    act(() => {
      const session = useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: PROJECT_ID, itemId: 'item-42' },
      });
      useTerminalStore.getState().setState(session.id, 'open');
    });

    // Only item-42 (now 'running') re-renders; the other 299 bail via
    // `React.memo` because their `glow` prop is the same 'idle' string
    // reference it always was.
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
