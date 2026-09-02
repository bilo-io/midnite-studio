import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TerminalSession } from '@midnite/studio-shared';

import { closeSessionWithConfirm } from './close-session';
import { useTerminalStore } from './terminal-store';

const session: TerminalSession = {
  id: 's1',
  kind: 'shell',
  title: 'demo',
  cwd: '/repos/demo',
  repoId: 'repo-1',
  createdAt: 0,
};

/** A `DialogApi`-shaped fake, matching `closeSessionWithConfirm`'s own parameter type. */
const fakeDialogs = () => ({
  openMenu: vi.fn(),
  confirm: vi.fn(),
  notify: vi.fn(),
  setBlastRadius: vi.fn(),
  prompt: vi.fn(),
  close: vi.fn(),
});

beforeEach(() => {
  useTerminalStore.setState({
    sessions: [session],
    activeId: session.id,
    states: { [session.id]: 'open' },
    foregroundCommand: {},
  });
});

describe('closeSessionWithConfirm', () => {
  it('closes immediately when nothing is running in the foreground', () => {
    const dialogs = fakeDialogs();
    const closeSession = vi.spyOn(useTerminalStore.getState(), 'closeSession');

    closeSessionWithConfirm(dialogs, session);

    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(closeSession).toHaveBeenCalledWith(session.id);
  });

  it('confirms first when a foreground command is running on a live session, and closes on confirm', () => {
    useTerminalStore.setState({ foregroundCommand: { [session.id]: 'npm run build' } });
    const dialogs = fakeDialogs();
    const closeSession = vi.spyOn(useTerminalStore.getState(), 'closeSession');

    closeSessionWithConfirm(dialogs, session);

    expect(closeSession).not.toHaveBeenCalled();
    expect(dialogs.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Close this session?',
        body: 'npm run build is still running and will be killed.',
      }),
    );

    const request = dialogs.confirm.mock.calls[0]?.[0] as { onConfirm: () => void };
    request.onConfirm();
    expect(closeSession).toHaveBeenCalledWith(session.id);
  });

  it('skips the confirm for a session that is not live, even with a stale foreground command', () => {
    useTerminalStore.setState({
      states: { [session.id]: 'exited' },
      foregroundCommand: { [session.id]: 'npm run build' },
    });
    const dialogs = fakeDialogs();
    const closeSession = vi.spyOn(useTerminalStore.getState(), 'closeSession');

    closeSessionWithConfirm(dialogs, session);

    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(closeSession).toHaveBeenCalledWith(session.id);
  });
});
