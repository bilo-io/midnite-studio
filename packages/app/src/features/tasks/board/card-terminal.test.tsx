import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import {
  DEFAULT_SESSION_DISPOSE_AFTER_MS,
  resetSessionViewHistoryForTests,
  useSessionViewHistory,
} from '../../terminal/session-mount-policy';
import { useTerminalStore } from '../../terminal/terminal-store';
import { CardTerminal } from './card-terminal';

const revealSession = vi.fn();
vi.mock('../../terminal/reveal-session', () => ({
  revealSession: (id: string) => revealSession(id),
}));

/*
  A stub rather than the real `LazyTerminalView`: xterm + its WebGL addon
  need a real browser, which is exactly what `e2e/kanban.spec.ts` exercises.
  This unit test's job is `CardTerminal`'s own wiring — which session it
  hands off, and whether it hands one off at all.
*/
vi.mock('../../terminal/lazy-terminal-view', () => ({
  LazyTerminalView: (props: { session: { id: string } }) => (
    <div data-testid="stub-terminal" data-session-id={props.session.id} />
  ),
}));

afterEach(cleanup);
beforeEach(() => {
  useTerminalStore.setState({ sessions: [], activeId: null, states: {}, pendingInput: {} });
  resetSessionViewHistoryForTests();
  useUiStore.setState({ terminalDisposeAfterMs: DEFAULT_SESSION_DISPOSE_AFTER_MS });
  revealSession.mockClear();
});

function openCardSession() {
  return useTerminalStore.getState().openSession({
    kind: 'agent',
    agentId: 'claude',
    title: 'card',
    cwd: '/repo',
    repoId: 'r1',
    surface: 'kanban',
  });
}

describe('CardTerminal', () => {
  it('renders nothing for a session id not in the store', () => {
    const { container } = render(<CardTerminal sessionId="missing" visible activity={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('mounts the xterm view whenever visible, with no cap', () => {
    const session = openCardSession();

    render(<CardTerminal sessionId={session.id} visible activity={undefined} />);

    expect(screen.getByTestId('stub-terminal').dataset['sessionId']).toBe(session.id);
  });

  it('shows the activity-line fallback, not the xterm, for a session never yet visible', () => {
    const session = openCardSession();

    render(<CardTerminal sessionId={session.id} visible={false} activity="thinking" />);

    expect(screen.queryByTestId('stub-terminal')).toBeNull();
    expect(screen.queryByText('Thinking…')).not.toBeNull();
  });

  it(
    'keeps the xterm mounted (invisible) for a beat after going off-screen — ' +
      "Phase 84 Theme E.5's grace period, same policy the docked panel's own sessions get",
    () => {
      const session = openCardSession();
      const { rerender } = render(<CardTerminal sessionId={session.id} visible activity={undefined} />);
      expect(screen.queryByTestId('stub-terminal')).not.toBeNull();

      rerender(<CardTerminal sessionId={session.id} visible={false} activity={undefined} />);

      // Still mounted, just invisible behind the activity-line fallback —
      // not torn down and rebuilt on the very next scroll back into view.
      expect(screen.queryByTestId('stub-terminal')).not.toBeNull();
      expect(screen.queryByText('Running')).not.toBeNull();
    },
  );

  it("drops the xterm once the shared policy says a hidden session has aged past Settings ▸ Terminal's threshold", () => {
    useUiStore.setState({ terminalDisposeAfterMs: 1000 });
    const session = openCardSession();
    // Seeded as hidden since the epoch — long past any real disposeAfterMs —
    // so the policy drops it deterministically without racing real or faked
    // wall-clock time against `useNow()`'s own once-a-second tick.
    useSessionViewHistory.setState((s) => ({
      recentOrder: [session.id, ...s.recentOrder],
      hiddenSince: { ...s.hiddenSince, [session.id]: 0 },
    }));

    render(<CardTerminal sessionId={session.id} visible={false} activity={undefined} />);

    expect(screen.queryByTestId('stub-terminal')).toBeNull();
  });

  it('the pop-out button reveals the session, and does not throw with no bridge mounted', () => {
    const session = openCardSession();
    render(<CardTerminal sessionId={session.id} visible activity={undefined} />);

    fireEvent.click(screen.getByLabelText('Pop out to Terminal view'));

    expect(revealSession).toHaveBeenCalledWith(session.id);
  });
});
