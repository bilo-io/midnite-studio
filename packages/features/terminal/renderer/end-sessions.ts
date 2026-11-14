import type { TerminalSession } from '@midnite/studio-shared';

import type { FrameDialogs } from '@midnite/studio-frame';
import { terminalPanelElement } from './terminal-panel-element';
import { inMainPanel, sessionLabel, sessionPhase, useTerminalStore } from './terminal-store';

/**
 * Sessions still running in a previous build's broker — a legacy or retired peer the current build adopted.
 *
 * They are real processes (an agent, a dev server) that the current build reattached to but did not start,
 * and until the user ends them their broker stays up holding them. Listed in panel order.
 */
export function previousBuildSessions(): TerminalSession[] {
  const { sessions, legacy, states } = useTerminalStore.getState();
  return sessions.filter((s) => legacy[s.id] && inMainPanel(s) && sessionPhase(s, states[s.id]) === 'live');
}

/** One line of the blast radius: the session's name, then what is running in it, so the kill is legible. */
export function describeSession(session: TerminalSession): string {
  const { foregroundCommand, autoNames, liveCwd } = useTerminalStore.getState();
  const name = sessionLabel(session, autoNames[session.id]);
  const command = foregroundCommand[session.id];
  const where = liveCwd[session.id] ?? session.cwd;
  return `${name} — ${command ?? 'shell'} (${where})`;
}

/**
 * End `sessions` after a confirm that lists every one of them and what it is running — the repo's
 * blast-radius rule for a destructive op. Ending kills the process and removes the row, exactly as the
 * row's own close does; once a previous-build broker's last session ends, the client shuts it down.
 */
export function endSessionsWithConfirm(
  dialogs: Pick<FrameDialogs, 'confirm'>,
  sessions: readonly TerminalSession[],
  options: { onEnded?: (ended: readonly TerminalSession[]) => void } = {},
): void {
  if (sessions.length === 0) return;
  const one = sessions.length === 1;
  dialogs.confirm({
    title: one ? 'End this session?' : `End ${sessions.length} previous-build sessions?`,
    body: one
      ? 'Its process is killed and the session is removed. Unsaved work in it is lost.'
      : 'Each process below is killed and its session removed. Unsaved work in them is lost.',
    // The sessions ARE the blast radius, listed as warnings; null says there is nothing left to count.
    blastRadius: null,
    warnings: sessions.map(describeSession),
    confirmLabel: one ? 'End session' : `End ${sessions.length} sessions`,
    danger: true,
    container: terminalPanelElement(),
    onConfirm: () => {
      const store = useTerminalStore.getState();
      for (const session of sessions) store.closeSession(session.id);
      options.onEnded?.(sessions);
    },
  });
}
