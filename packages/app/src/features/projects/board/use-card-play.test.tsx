import { act, cleanup, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { useCardPlay } from './use-card-play';
import { issueItem } from '../__fixtures__/project-item';

const TASK_REF = { projectId: 'proj-1', itemId: 'item-1' };
const TASK_KEY = `${TASK_REF.projectId}:${TASK_REF.itemId}`;

/** `useCardPlay` (Theme A/D) reaches `useDialogs()` unconditionally, so
 *  every render needs the host it expects in the real app tree. */
function wrapper({ children }: { children: ReactNode }) {
  return <DialogHost>{children}</DialogHost>;
}

function firePlay(onPlay: (event: { clientX: number; clientY: number; stopPropagation: () => void }) => void) {
  const stopPropagation = vi.fn();
  act(() => {
    onPlay({ clientX: 10, clientY: 10, stopPropagation });
  });
  return stopPropagation;
}

describe('useCardPlay (Phase 92 Theme A)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
    useUiStore.setState({ terminalOpen: false, terminalListOpen: false, cardSkillByTask: {} });
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
    const { result } = renderHook(
      () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: session.id }),
      { wrapper },
    );

    const stopPropagation = firePlay(result.current.onPlay);

    expect(stopPropagation).toHaveBeenCalled();
    expect(useTerminalStore.getState().activeId).toBe(session.id);
    expect(useUiStore.getState().terminalOpen).toBe(true);
    // No second session started for the reveal path.
    expect(useTerminalStore.getState().sessions).toHaveLength(1);
  });

  it('does nothing past stopPropagation when there is no item (a foreign graph node)', () => {
    const { result } = renderHook(
      () => useCardPlay({ item: undefined, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
      { wrapper },
    );

    firePlay(result.current.onPlay);

    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  describe('a skill already set for this card (Phase 92 Theme D)', () => {
    beforeEach(() => {
      useUiStore.setState({ cardSkillByTask: { [TASK_KEY]: 'execAdhoc' } });
    });

    it("launches directly with that skill's shrunk prompt, no menu", () => {
      const item = issueItem({
        id: TASK_REF.itemId,
        content: { type: 'issue', title: 'Fix it', url: 'https://github.com/acme/widgets/issues/1' } as never,
      });
      const { result } = renderHook(
        () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
        { wrapper },
      );

      firePlay(result.current.onPlay);

      expect(screen.queryByRole('menu')).toBeNull();
      const sessions = useTerminalStore.getState().sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.taskRef).toEqual(TASK_REF);
      const queued = useTerminalStore.getState().pendingInput[sessions[0]!.id]!;
      // The skill-launch prompt (Theme B) — a link, not the whole issue.
      expect(queued).toContain('/midnite-create-adhoc https://github.com/acme/widgets/issues/1');
      expect(queued.endsWith('\r')).toBe(true); // autoSend: true — sent, not just typed
    });

    it('picks the most-recently-created agent session on this repo as the agent to relaunch', () => {
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
      const { result } = renderHook(
        () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
        { wrapper },
      );

      firePlay(result.current.onPlay);

      const sessions = useTerminalStore.getState().sessions;
      const launched = sessions.find((s) => s.taskRef?.itemId === TASK_REF.itemId);
      expect(launched?.agentId).toBe('codex');
    });
  });

  describe('no skill set for this card — Play sends the picker\'s default', () => {
    const URL = 'https://github.com/acme/widgets/issues/1';
    const launchedInput = () => {
      const sessions = useTerminalStore.getState().sessions;
      expect(sessions).toHaveLength(1);
      return useTerminalStore.getState().pendingInput[sessions[0]!.id]!;
    };

    it('launches /midnite-create-adhoc for an ad hoc card — no menu, nothing persisted', () => {
      const item = issueItem({ id: TASK_REF.itemId, content: { type: 'issue', title: 'Fix it', url: URL } as never });
      const { result } = renderHook(
        () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
        { wrapper },
      );

      firePlay(result.current.onPlay);

      expect(screen.queryByRole('menu')).toBeNull();
      expect(launchedInput()).toContain(`'/midnite-create-adhoc ${URL}'`);
      expect(useUiStore.getState().cardSkillByTask[TASK_KEY]).toBeUndefined();
    });

    it('launches /midnite-create for a card whose title names a phase', () => {
      const item = issueItem({
        id: TASK_REF.itemId,
        content: { type: 'issue', title: 'Phase 98 Theme D', url: URL } as never,
      });
      const { result } = renderHook(
        () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
        { wrapper },
      );
      firePlay(result.current.onPlay);
      expect(launchedInput()).toContain(`'/midnite-create ${URL}'`);
    });

    it('uses the most recently used skill on any other card before either default', () => {
      useUiStore.setState({ cardSkillByTask: { 'proj-1:older': '/midnite-refine', 'proj-1:newer': '/midnite-verify 12' } });
      const item = issueItem({ id: TASK_REF.itemId, content: { type: 'issue', title: 'Fix it', url: URL } as never });
      const { result } = renderHook(
        () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
        { wrapper },
      );
      firePlay(result.current.onPlay);
      expect(launchedInput()).toContain(`'/midnite-verify 12 ${URL}'`);
    });
  });

  it("passes the card's free-text skill through verbatim, shell-quoted as one argument", () => {
    useUiStore.setState({ cardSkillByTask: { [TASK_KEY]: "midnite-create 98 D; echo $HOME 'x'" } });
    const item = issueItem({
      id: TASK_REF.itemId,
      content: { type: 'issue', title: 'Fix it', url: 'https://github.com/acme/widgets/issues/1' } as never,
    });
    const { result } = renderHook(
      () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
      { wrapper },
    );

    firePlay(result.current.onPlay);

    const session = useTerminalStore.getState().sessions[0]!;
    const queued = useTerminalStore.getState().pendingInput[session.id]!;
    // Single-quoted, the inner quotes closed-escaped-reopened — `;` and `$HOME`
    // reach the agent as text, never the shell.
    expect(queued).toContain(
      String.raw`'midnite-create 98 D; echo $HOME '\''x'\'' https://github.com/acme/widgets/issues/1'`,
    );
  });

  it('produces a byte-identical startAgent call regardless of which caller supplies the same inputs', () => {
    useUiStore.setState({ cardSkillByTask: { [TASK_KEY]: 'execAdhoc' } });
    const item = issueItem({ id: TASK_REF.itemId, content: { type: 'issue', title: 'Same everywhere' } as never });

    const { result: fromTaskCard } = renderHook(
      () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
      { wrapper },
    );
    firePlay(fromTaskCard.current.onPlay);
    const first = useTerminalStore.getState().sessions[0]!;

    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });

    const { result: fromGraphNode } = renderHook(
      () => useCardPlay({ item, repoId: 'r1', worktreePath: '/repo', taskRef: TASK_REF, sessionId: undefined }),
      { wrapper },
    );
    firePlay(fromGraphNode.current.onPlay);
    const second = useTerminalStore.getState().sessions[0]!;

    expect({ ...first, id: '', createdAt: 0 }).toEqual({ ...second, id: '', createdAt: 0 });
  });
});
