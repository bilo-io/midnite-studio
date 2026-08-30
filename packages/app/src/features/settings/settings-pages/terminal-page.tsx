import type { AgentDefinition, SessionActivity, TerminalSession } from '@midnite/studio-shared';
import { Accordion } from '@bilo-io/ui';
import { useEffect, useState } from 'react';
import { LuActivity, LuBot, LuSquareTerminal } from 'react-icons/lu';

import {
  isAgentRow,
  resolveSessionAgentId,
  sessionLabel,
  sessionPhase,
  useTerminalStore,
  type ConnectionState,
} from '../../terminal/terminal-store';
import { useAgents } from '../../terminal/use-agents';
import { useUiStore, type TerminalSidebarSide } from '../../../store/ui-store';
import { Choice, Field } from './controls';

/** One row of the live readout below — a session, what it's doing, when last. */
export type ActivityRow = {
  sessionId: string;
  name: string;
  /**
   * `'no detector'` means the running agent has no marker set at all — a
   * fact about the AGENT, distinct from `'unknown'`, which means it has one
   * that simply has not spoken yet.
   */
  activity: SessionActivity | 'unknown' | 'no detector';
  /** `null` when nothing has ever been detected for this session. */
  lastSeenSecondsAgo: number | null;
};

/**
 * Every live agent session, its current guess, and how long ago that guess
 * last changed — pure, so the table around it is the only untested half.
 *
 * Ordered the same as the session list itself (session order, not
 * most-recently-active-first): the readout should not reorder itself while
 * someone is looking at it, and the session list is the mental model a user
 * already has for "which one is that".
 */
export function activityRows(
  sessions: readonly TerminalSession[],
  states: Record<string, ConnectionState | undefined>,
  activity: Record<string, SessionActivity>,
  activityAt: Record<string, number>,
  liveAgentId: Record<string, string | null>,
  agents: readonly AgentDefinition[],
  now: number,
): ActivityRow[] {
  const withDetector = new Set(
    agents.filter((a) => a.activity !== undefined).map((a) => a.id),
  );

  return sessions
    .filter((s) => isAgentRow(s, liveAgentId) && sessionPhase(s, states[s.id]) === 'live')
    .map((s) => {
      const agentId = resolveSessionAgentId(s, liveAgentId);
      const hasDetector = agentId !== undefined && withDetector.has(agentId);
      const at = activityAt[s.id];
      return {
        sessionId: s.id,
        name: sessionLabel(s, undefined, agents.find((a) => a.id === agentId)?.label),
        activity: hasDetector ? (activity[s.id] ?? 'unknown') : 'no detector',
        lastSeenSecondsAgo: at === undefined ? null : Math.max(0, Math.round((now - at) / 1000)),
      };
    });
}

/**
 * A one-second re-render tick, and nothing else — `activityRows` stays a pure
 * function of `(…, now)`, so this is the only thing on the page that owns a
 * timer. What the doc's own manual check asks for: "last seen Ns ago" that is
 * actually ticking, not frozen at the moment the panel was opened.
 */
function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Terminal preferences — the knobs that exist today, deliberately decoupled
 * from Phase 15's still-open themes: this page hosts whatever terminal
 * settings are real at build time and grows as that phase lands more.
 */
export function TerminalPage() {
  const side = useUiStore((s) => s.terminalSidebarSide);
  const setSide = useUiStore((s) => s.setTerminalSidebarSide);
  /*
    Through the shared hook, not a second `useQuery` on the same key. React
    Query keys by KEY, not by query function — two `['agents']` observers with
    differently-shaped `queryFn`s share whichever answer landed first, and the
    loser destructures a shape it was never written for.
  */
  const { agents } = useAgents();

  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const activity = useTerminalStore((s) => s.activity);
  const activityAt = useTerminalStore((s) => s.activityAt);
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  const now = useNowTick(1000);
  const rows = activityRows(sessions, states, activity, activityAt, liveAgentId, agents, now);
  const detectedAgentLabels = agents.filter((a) => a.activity !== undefined).map((a) => a.label);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="General" icon={<LuSquareTerminal className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Choice<TerminalSidebarSide>
            label="Session list"
            hint="Which edge of the terminal pane the session sidebar docks to."
            value={side}
            onChange={setSide}
            options={[
              ['left', 'Left'],
              ['right', 'Right'],
            ]}
          />

          <Field
            label="Keybinding"
            hint="The toggle chord is fixed — macOS reserves Cmd+` for window cycling."
          >
            <code className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl+`</code>
          </Field>
        </div>
      </Accordion>

      <Accordion
        title="Agents"
        icon={<LuBot className="h-4 w-4" />}
        count={agents.length}
        defaultOpen
      >
        <div className="p-3">
          <Field
            label="Agent roster"
            hint="Built-in agents merged with your agents.json override (userData). Edit the file, not this list — it reloads on next launch."
          >
            <ul className="flex flex-col gap-1">
              {agents.map((agent) => (
                <li
                  key={agent.id}
                  className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: agent.accent }}
                  />
                  <span className="font-medium">{agent.label}</span>
                  <code
                    className="ml-auto rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
                    data-selectable
                  >
                    {[agent.command, ...agent.args].join(' ')}
                  </code>
                </li>
              ))}
            </ul>
          </Field>
        </div>
      </Accordion>

      <Accordion
        title="Agent activity"
        icon={<LuActivity className="h-4 w-4" />}
        count={rows.length}
      >
        <div className="flex flex-col gap-2 p-3">
          <Field
            label="Live sessions"
            hint="The activity glyph in the terminal's session list, spelled out — a detector pinned to one CLI's chrome will break again; this is how it says so."
          >
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No live agent sessions.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows.map((row) => (
                  <li
                    key={row.sessionId}
                    className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      {row.activity}
                    </code>
                    <span className="w-24 shrink-0 text-right text-muted-foreground">
                      {row.lastSeenSecondsAgo === null
                        ? '—'
                        : `last seen ${row.lastSeenSecondsAgo}s ago`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <p className="text-xs text-muted-foreground">
            {detectedAgentLabels.length === 0
              ? 'No agent in the roster has an activity detector.'
              : `Has a detector: ${detectedAgentLabels.join(', ')}.`}
          </p>
        </div>
      </Accordion>
    </div>
  );
}
