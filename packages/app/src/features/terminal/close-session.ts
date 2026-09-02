import type { TerminalSession } from '@midnite/studio-shared';

import type { useDialogs } from '../../components/dialog-host';
import { sessionPhase, useTerminalStore } from './terminal-store';

/**
 * Close a session, confirming first if a foreground command is still running.
 *
 * The one behavior the session list's own close button and `terminal.close`
 * (Mod+w) must agree on — a keyboard-driven close that skipped the confirm a
 * click would have shown is a silent process kill.
 */
export function closeSessionWithConfirm(
  dialogs: ReturnType<typeof useDialogs>,
  session: TerminalSession,
): void {
  const { states, foregroundCommand } = useTerminalStore.getState();
  const phase = sessionPhase(session, states[session.id]);
  const command = foregroundCommand[session.id];
  if (phase === 'live' && command) {
    dialogs.confirm({
      title: 'Close this session?',
      body: `${command} is still running and will be killed.`,
      confirmLabel: 'Close session',
      danger: true,
      onConfirm: () => useTerminalStore.getState().closeSession(session.id),
    });
  } else {
    useTerminalStore.getState().closeSession(session.id);
  }
}
