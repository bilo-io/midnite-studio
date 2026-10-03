import { useMemo } from 'react';

import { DEFAULT_LOOPS, type AgentDefinition } from '@midnite/studio-shared';
import { LuTerminal } from 'react-icons/lu';

import { resolveAgentIcon } from '../../../components/icons';
import { StateDot, type DotState } from '../../../components/state-dot';
import { useSessionHistory } from '../../../services/queries';
import { useSessionsStore } from '../../../store/sessions-store';
import { useUiStore } from '../../../store/ui-store';
import { useLoopRuns } from '../../loops/use-loop-runs';
import { relativeAge } from '../../sessions/session-order';
import {
  agentLabelFor,
  resolveSessionAgentId,
  sessionLabel,
  sessionPhase,
  useTerminalStore,
} from '../../terminal/terminal-store';
import { useAgents } from '../../terminal/use-agents';
import { WidgetState } from '../widget-frame';
import { orderLoopRuns, recentlyClosed, SHELL_KEY, tallyAgentSessions } from '../agent-derive';

/**
 * The Agents dashboard's cards. Every one reads state the app already holds —
 * the agent roster query, the terminal store, the closed-session history and the
 * loop-run ledger — so none of them needs a bridge call of its own, and each
 * works on any dashboard it is added to (none depends on the selected repo).
 */

const ROW = 'flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs';
const CLICKABLE = `${ROW} hover:bg-accent`;

const useOpenSessions = () => {
  const setActiveView = useUiStore((s) => s.setActiveView);
  const selectLive = useSessionsStore((s) => s.selectLiveSession);
  const selectClosed = useSessionsStore((s) => s.selectClosedSession);
  return {
    live: (id: string) => {
      selectLive(id);
      setActiveView('sessions');
    },
    closed: (id: string) => {
      selectClosed(id);
      setActiveView('sessions');
    },
  };
};

const iconFor = (agents: readonly AgentDefinition[], agentId: string | undefined) => {
  const agent = agentId === undefined ? undefined : agents.find((a) => a.id === agentId);
  return agent ? resolveAgentIcon(agent) : LuTerminal;
};

/** Every agent in the roster, whether it is installed, and its live sessions. */
export function AgentRosterWidget() {
  const { agents, status } = useAgents();
  const sessions = useTerminalStore((s) => s.sessions);
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);

  const liveCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of sessions) {
      const id = resolveSessionAgentId(session, liveAgentId);
      if (id !== undefined && !session.asleep) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [sessions, liveAgentId]);

  return (
    <WidgetState loading={false} empty={agents.length === 0} emptyLabel="No agents configured.">
      <ul className="flex flex-col gap-0.5">
        {agents.map((agent) => {
          const Icon = resolveAgentIcon(agent);
          const probe = status.find((s) => s.id === agent.id);
          // An absent probe is "never asked", which must not read as "missing".
          const missing = probe !== undefined && !probe.installed;
          const live = liveCount.get(agent.id) ?? 0;
          return (
            <li key={agent.id} className={ROW}>
              <Icon aria-hidden className="size-4 shrink-0" style={{ color: agent.accent }} />
              <span className="min-w-0 flex-1 truncate">{agent.label}</span>
              {probe?.version ? (
                <span className="text-[10px] text-muted-foreground">{probe.version}</span>
              ) : null}
              <span
                className={`text-[10px] ${missing ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {missing ? 'not installed' : live > 0 ? `${live} running` : 'ready'}
              </span>
            </li>
          );
        })}
      </ul>
    </WidgetState>
  );
}

/** Running and asleep sessions, with the agent's own guess at what it is doing. */
export function LiveSessionsWidget() {
  const { agents } = useAgents();
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const activity = useTerminalStore((s) => s.activity);
  const autoNames = useTerminalStore((s) => s.autoNames);
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  const open = useOpenSessions();

  const rows = sessions.filter((s) => sessionPhase(s, states[s.id]) !== 'ended');

  return (
    <WidgetState loading={false} empty={rows.length === 0} emptyLabel="No sessions running.">
      <ul className="flex flex-col gap-0.5">
        {rows.map((session) => {
          const agentId = resolveSessionAgentId(session, liveAgentId);
          const Icon = iconFor(agents, agentId);
          const dot: DotState = session.asleep ? 'asleep' : (states[session.id] ?? 'idle');
          const doing = session.asleep ? 'asleep' : activity[session.id];
          return (
            <li key={session.id}>
              <button type="button" className={CLICKABLE} onClick={() => open.live(session.id)}>
                <StateDot state={dot} />
                <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {sessionLabel(session, autoNames[session.id], agentLabelFor(agentId, agents))}
                </span>
                {doing ? <span className="text-[10px] text-muted-foreground">{doing}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </WidgetState>
  );
}

/** The sessions closed most recently, and how each one ended. */
export function RecentSessionsWidget() {
  const { agents } = useAgents();
  const { data, isLoading } = useSessionHistory();
  const open = useOpenSessions();
  const rows = useMemo(() => recentlyClosed(data ?? [], 8), [data]);
  const now = Date.now();

  return (
    <WidgetState loading={isLoading} empty={rows.length === 0} emptyLabel="No closed sessions yet.">
      <ul className="flex flex-col gap-0.5">
        {rows.map((session) => {
          const Icon = iconFor(agents, session.agentId);
          return (
            <li key={session.id}>
              <button type="button" className={CLICKABLE} onClick={() => open.closed(session.id)}>
                <StateDot state="exited" />
                <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {session.name ??
                    agentLabelFor(session.agentId, agents) ??
                    (session.kind === 'agent' ? 'Agent Session' : 'Terminal')}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {session.reason} · {relativeAge(session.closedAt, now)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </WidgetState>
  );
}

/** Live and past sessions tallied per agent, as proportional bars. */
export function AgentActivityWidget() {
  const { agents } = useAgents();
  const sessions = useTerminalStore((s) => s.sessions);
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  const { data } = useSessionHistory();

  const rows = useMemo(
    () => tallyAgentSessions(sessions, data ?? [], liveAgentId),
    [sessions, data, liveAgentId],
  );
  const max = Math.max(1, ...rows.map((r) => r.live + r.closed));

  return (
    <WidgetState loading={false} empty={rows.length === 0} emptyLabel="No sessions to tally.">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const label =
            row.agentId === SHELL_KEY ? 'Terminal' : (agentLabelFor(row.agentId, agents) ?? row.agentId);
          const total = row.live + row.closed;
          return (
            <li key={row.agentId} className="text-xs">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="truncate">{label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {row.live} live · {total} total
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-muted">
                <div className="h-full rounded bg-primary" style={{ width: `${(total / max) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </WidgetState>
  );
}

/** Running loops first, then the latest runs from the ledger. */
export function LoopRunsWidget() {
  const { data } = useLoopRuns();
  const rows = useMemo(() => orderLoopRuns(data, 8), [data]);
  const now = Date.now();

  return (
    <WidgetState loading={false} empty={rows.length === 0} emptyLabel="No loop runs yet.">
      <ul className="flex flex-col gap-0.5">
        {rows.map((run) => (
          <li key={run.id} className={ROW}>
            <StateDot state={run.status === 'running' ? 'open' : 'exited'} />
            <span className="min-w-0 flex-1 truncate">
              {DEFAULT_LOOPS.find((l) => l.id === run.loopId)?.label ?? run.loopId}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {run.status} · {relativeAge(run.startedAt, now)}
            </span>
          </li>
        ))}
      </ul>
    </WidgetState>
  );
}
