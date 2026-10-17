import { LuSparkles, LuSquare } from 'react-icons/lu';

import { agentSessionStore, useAgentSession } from '../agent-session-store';

/** The strip above the page while an agent is driving (a placeholder — see `agent-session-store.ts`). */
export function AgentSessionBar() {
  const active = useAgentSession((s) => s.active);
  const goal = useAgentSession((s) => s.goal);
  const lastAction = useAgentSession((s) => s.lastAction);

  if (!active) return null;

  return (
    <div
      role="region"
      aria-label="Agent Driving Session"
      className="flex shrink-0 items-center justify-between border-b border-[var(--browser-accent)]/30 bg-[var(--browser-accent)]/10 px-3 py-1.5 text-xs"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="flex h-5 items-center gap-1.5 rounded bg-[var(--browser-accent)]/20 px-2 font-mono text-[11px] font-semibold text-[var(--browser-accent)]">
          <LuSparkles aria-hidden className="h-3 w-3" />
          <span>AGENT DRIVING</span>
        </span>
        <span className="truncate font-medium">Goal: {goal || 'Autonomous navigation'}</span>
        {lastAction ? <span className="truncate text-muted-foreground">· {lastAction}</span> : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => agentSessionStore.getState().step('Simulated next step executed')}
          className="rounded border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
        >
          Step
        </button>
        <button
          type="button"
          onClick={() => agentSessionStore.getState().stop()}
          className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
        >
          <LuSquare aria-hidden className="h-3 w-3" />
          <span>Take Over</span>
        </button>
      </div>
    </div>
  );
}
