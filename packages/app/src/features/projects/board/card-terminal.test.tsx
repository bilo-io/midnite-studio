import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    const { container } = render(<CardTerminal sessionId="missing" visible />);
    expect(container.firstChild).toBeNull();
  });

  it('mounts the xterm view whenever visible, with no cap', () => {
    const session = openCardSession();

    render(<CardTerminal sessionId={session.id} visible />);

    expect(screen.getByTestId('stub-terminal').dataset['sessionId']).toBe(session.id);
  });

  it('renders nothing while not visible', () => {
    const session = openCardSession();

    render(<CardTerminal sessionId={session.id} visible={false} />);

    expect(screen.queryByTestId('stub-terminal')).toBeNull();
  });

  it('the pop-out button reveals the session, and does not throw with no bridge mounted', () => {
    const session = openCardSession();
    render(<CardTerminal sessionId={session.id} visible />);

    fireEvent.click(screen.getByLabelText('Pop out to Terminal view'));

    expect(revealSession).toHaveBeenCalledWith(session.id);
  });
});
