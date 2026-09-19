import type { AgentDefinition, CommitProvenance } from '@midnite/studio-shared';

export type ProvenanceFilterValue = 'all' | 'humans' | 'agents' | string;

/**
 * Determine if a commit's provenance matches the active provenance filter.
 */
export function matchesProvenanceFilter(
  prov: CommitProvenance | undefined,
  filter: ProvenanceFilterValue,
): boolean {
  if (filter === 'all') return true;
  if (!prov || prov.kind === 'human') {
    return filter === 'humans';
  }
  if (filter === 'humans') return false;
  if (filter === 'agents') return true;
  if (filter.startsWith('agent:')) {
    const targetId = filter.slice(6);
    return prov.agentIds.includes(targetId);
  }
  return true;
}

/**
 * Filter chip in the graph toolbar: All · Humans · Agents (Phase 78 Theme C).
 * Plus a per-agent sub-filter when the loaded rows match more than one agent.
 */
export function ProvenanceFilter({
  selected = 'all',
  onChange,
  matchingAgents = [],
}: {
  selected?: ProvenanceFilterValue;
  onChange: (value: ProvenanceFilterValue) => void;
  matchingAgents?: readonly AgentDefinition[];
}) {
  const current = selected ?? 'all';
  const isAgentActive = current === 'agents' || current.startsWith('agent:');

  return (
    <div
      role="group"
      aria-label="Filter commits by provenance"
      className="inline-flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5 text-xs text-muted-foreground"
    >
      <button
        type="button"
        role="radio"
        aria-checked={current === 'all'}
        onClick={() => onChange('all')}
        className={`rounded px-2 py-0.5 font-medium transition-colors ${
          current === 'all'
            ? 'bg-background text-foreground shadow-sm'
            : 'hover:text-foreground'
        }`}
      >
        All
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={current === 'humans'}
        onClick={() => onChange('humans')}
        className={`rounded px-2 py-0.5 font-medium transition-colors ${
          current === 'humans'
            ? 'bg-background text-foreground shadow-sm'
            : 'hover:text-foreground'
        }`}
      >
        Humans
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isAgentActive}
        onClick={() => onChange('agents')}
        className={`rounded px-2 py-0.5 font-medium transition-colors ${
          isAgentActive
            ? 'bg-background text-foreground shadow-sm'
            : 'hover:text-foreground'
        }`}
      >
        Agents
      </button>

      {/* Per-agent sub-filter when roster has more than one matching agent */}
      {matchingAgents.length > 1 && isAgentActive ? (
        <div className="ml-1 flex items-center gap-1 border-l border-border/60 pl-1">
          <select
            aria-label="Filter by agent"
            value={current.startsWith('agent:') ? current.slice(6) : 'all-agents'}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val === 'all-agents' ? 'agents' : `agent:${val}`);
            }}
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all-agents">All agents</option>
            {matchingAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
