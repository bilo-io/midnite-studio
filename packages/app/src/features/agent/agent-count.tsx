import type { TerminalSession } from '@midnite/studio-shared';
import { BsRobot } from 'react-icons/bs';

import { useUiStore } from '../../store/ui-store';
import {
  isAgentRow,
  sessionPhase,
  useTerminalStore,
  type ConnectionState,
} from '../terminal/terminal-store';

/**
 * How many agent sessions are live, given the session list and their
 * connection states. Pure so it is testable without the store.
 *
 * Gated on `isAgentRow` — what is **running** — rather than `session.kind`,
 * so a plain shell running an agent typed by hand counts too. Expressed via
 * `sessionPhase(session, state) === 'live'`, so an asleep or ended agent is
 * not counted.
 */
export function agentCount(
  sessions: readonly TerminalSession[],
  states: Record<string, ConnectionState | undefined>,
  liveAgentId: Record<string, string | null>,
): number {
  return sessions.filter(
    (session) =>
      isAgentRow(session, liveAgentId) && sessionPhase(session, states[session.id]) === 'live',
  ).length;
}

/**
 * Live agent sessions, from `terminal-store.ts` — a count only visible today
 * if the terminal panel is open.
 *
 * **Not** `use-agents.ts`'s `AgentRoster` — that is the installed-agent
 * roster, a constant list of what is on the machine, and has nothing to do
 * with how many are running.
 *
 * Was `AgentCountSegment`, a `STATUS_SEGMENTS` entry in the status bar's left
 * zone, until it moved into the title bar's right cluster beside the loop
 * launchers — see [`title-bar-agents.tsx`](../../components/title-bar-agents.tsx).
 * The name lost its `Segment` suffix with the registration: it is no longer
 * subject to the bar's density collapse or its overflow popover, and a name
 * claiming otherwise would send the next reader to `segments.ts` looking for a
 * row that is not there.
 */
export function LiveAgentCount() {
  const count = useTerminalStore((s) => agentCount(s.sessions, s.states, s.liveAgentId));

  if (count === 0) return null;

  return (
    <button
      type="button"
      data-testid="titlebar-agent-count"
      onClick={() => {
        useUiStore.getState().setTerminalOpen(true);
        const terminal = useTerminalStore.getState();
        const firstLive = terminal.sessions.find(
          (session) =>
            isAgentRow(session, terminal.liveAgentId) &&
            sessionPhase(session, terminal.states[session.id]) === 'live',
        );
        if (firstLive) terminal.setActive(firstLive.id);
        // Only if the list is shut — an already-open list is not closed.
        if (!useUiStore.getState().terminalListOpen) useUiStore.getState().toggleTerminalList();
      }}
      className="flex items-center gap-1.5 rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground"
    >
      <BsRobot aria-hidden className="h-3 w-3 shrink-0" />
      <span>
        {count} agent{count === 1 ? '' : 's'}
      </span>
    </button>
  );
}
