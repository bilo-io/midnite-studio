import { LuSparkles, LuSquare } from 'react-icons/lu';
import { useBrowserHost, useAgentSession } from '../ports/browser-host';

export function AgentSessionBar() {
  const host = useBrowserHost();
  const agentSession = useAgentSession();

  if (!agentSession.active) return null;

  return (
    <div
      role="region"
      aria-label="Agent Driving Session"
      className="flex items-center justify-between border-b border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="flex h-5 items-center gap-1.5 rounded bg-amber-500/20 px-2 font-mono text-[11px] font-semibold text-amber-400">
          <LuSparkles className="h-3 w-3 animate-pulse" />
          <span>AGENT DRIVING</span>
        </span>
        <span className="truncate font-medium text-amber-100">
          Goal: {agentSession.goal || 'Autonomous navigation'}
        </span>
        {agentSession.lastAction && (
          <span className="flex items-center gap-1 text-amber-300/80">
            <span className="text-amber-500">•</span>
            <span className="truncate">{agentSession.lastAction}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => host.stepAgentSession('Simulated next step executed')}
          className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/30"
        >
          Step
        </button>
        <button
          type="button"
          onClick={() => host.stopAgentSession()}
          className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white"
        >
          <LuSquare className="h-3 w-3" />
          <span>Take Over</span>
        </button>
      </div>
    </div>
  );
}
