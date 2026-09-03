import type { TerminalSession } from '@midnite/studio-shared';
import { BsRobot } from 'react-icons/bs';

import { useUiStore } from '../../store/ui-store';
import { revealSession } from '../terminal/reveal-session';
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
 * subject to the status bar's overflow popover, and a name claiming otherwise
 * would send the next reader to `segments.ts` looking for a row that is not
 * there.
 *
 * It is still subject to a **density**, though — the title bar publishes its
 * own `data-density` on the cluster around this button, so `.status-label`
 * drops the word "agents" when the bar is tight and `.status-collapsible`
 * drops the readout altogether when it is tighter still. Both classes are the
 * status bar's, unchanged, and that is the point: one vocabulary for "this text
 * is optional", wherever the element ends up.
 */
export function LiveAgentCount() {
  const count = useTerminalStore((s) => agentCount(s.sessions, s.states, s.liveAgentId));

  if (count === 0) return null;

  return (
    <button
      type="button"
      data-testid="titlebar-agent-count"
      onClick={() => {
        const terminal = useTerminalStore.getState();
        const firstLive = terminal.sessions.find(
          (session) =>
            isAgentRow(session, terminal.liveAgentId) &&
            sessionPhase(session, terminal.states[session.id]) === 'live',
        );
        // `revealSession` is this handler's own three steps, hoisted so the
        // Kanban card's `>_` button shares them. Opening the panel with no
        // row to select was the old fallback and is kept: the count is
        // non-zero, so there IS an agent — just one the panel cannot show.
        if (!firstLive || !revealSession(firstLive.id)) {
          useUiStore.getState().setTerminalOpen(true);
          if (!useUiStore.getState().terminalListOpen) useUiStore.getState().toggleTerminalList();
        }
      }}
      /*
        `.status-collapsible` on the button itself, so the whole readout drops
        at `collapsed` — the class is applied here rather than by the parent
        because the parent is the flex container, and hiding a flex child is
        what collapses its `gap-3` slot too.
      */
      className="status-collapsible flex items-center gap-1.5 rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground"
    >
      <BsRobot aria-hidden className="h-3 w-3 shrink-0" />
      {/*
        Two children with the container's `gap-1.5` between them, not one
        string: the word is what `compact` sheds, and flex `gap` only applies
        between VISIBLE items, so hiding it takes the space before it with no
        stray whitespace left behind. A single "{count} agent{s}" string could
        not be split by CSS at all.

        **The word carries a LEADING SPACE**, so the button's text stays
        "1 agent" rather than "1agent". The gap is what separates the two
        visually — a flex item's leading whitespace is collapsed away, so the
        space costs nothing on screen — but it is the only thing standing
        between a screen reader and "one-agent" as a single word. It leaves with
        the word at `compact`, where the announcement is just the number.
      */}
      <span className="tabular-nums">{count}</span>
      <span className="status-label">{` agent${count === 1 ? '' : 's'}`}</span>
    </button>
  );
}
