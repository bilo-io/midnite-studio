import type { TerminalSession } from '@midnite/git-shared';

import { useUiStore } from '../../store/ui-store';
import { useTerminalStore, type ConnectionState } from '../terminal/terminal-store';

const isLive = (state: ConnectionState | undefined) => state === 'open' || state === 'starting';

/**
 * How many agent sessions are live, given the session list and their
 * connection states. Pure so it is testable without the store.
 *
 * The `live` predicate is copied from `terminal-session-list.tsx`, the only
 * other place it exists, rather than extracted there — the row needs the
 * boolean and this needs the count.
 */
export function agentCount(
  sessions: readonly TerminalSession[],
  states: Record<string, ConnectionState | undefined>,
): number {
  return sessions.filter((session) => session.kind === 'agent' && isLive(states[session.id]))
    .length;
}

/**
 * Live agent sessions, from `terminal-store.ts` — a count only visible today
 * if the terminal panel is open.
 *
 * **Not** `use-agents.ts`'s `AgentRoster` — that is the installed-agent
 * roster, a constant list of what is on the machine, and has nothing to do
 * with how many are running.
 */
export function AgentCountSegment() {
  const count = useTerminalStore((s) => agentCount(s.sessions, s.states));

  if (count === 0) return null;

  return (
    <button
      type="button"
      data-testid="status-segment-agent-count"
      onClick={() => {
        useUiStore.getState().setTerminalOpen(true);
        const terminal = useTerminalStore.getState();
        const firstLive = terminal.sessions.find(
          (session) => session.kind === 'agent' && isLive(terminal.states[session.id]),
        );
        if (firstLive) terminal.setActive(firstLive.id);
        // Only if the list is shut — an already-open list is not closed.
        if (!useUiStore.getState().terminalListOpen) useUiStore.getState().toggleTerminalList();
      }}
      className="rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground"
    >
      {count} agent{count === 1 ? '' : 's'}
    </button>
  );
}
