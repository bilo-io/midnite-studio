import type { AgentDefinition, ClosedSession, CommitProvenance } from '@midnite/studio-shared';
import { resolveAgentIcon } from '../../components/icons';
import { Tooltip } from '../../components/tooltip';

/**
 * Compute the tooltip text for a commit's provenance (Phase 78 Theme C).
 *
 * Rules:
 * - human: returns null (human rows have no mark or provenance tooltip).
 * - co-author: "Co-authored by <Agent>"
 * - session-trailer: "Made during <session name> · <Agent>"
 * - author: "Made during <session name> · <Agent>" or "Authored by <Agent>"
 * - session-window: "Probably made during <session name>" (the word 'probably' is load-bearing!).
 */
export function getProvenanceTooltip({
  provenance,
  sessionName,
  agentName,
}: {
  provenance: CommitProvenance;
  sessionName?: string;
  agentName?: string;
}): string | null {
  if (provenance.kind === 'human') return null;

  const agent =
    agentName ||
    (provenance.agentIds[0]
      ? provenance.agentIds[0].charAt(0).toUpperCase() + provenance.agentIds[0].slice(1)
      : 'Agent');

  if (provenance.source === 'session-window') {
    const sName = sessionName || provenance.sessionId || 'session';
    return `Probably made during ${sName}`;
  }

  if (provenance.source === 'co-author') {
    return `Co-authored by ${agent}`;
  }

  if (provenance.source === 'session-trailer') {
    const sName = sessionName || provenance.sessionId || 'session';
    return `Made during ${sName} · ${agent}`;
  }

  if (provenance.source === 'author') {
    if (sessionName || provenance.sessionId) {
      const sName = sessionName || provenance.sessionId;
      return `Made during ${sName} · ${agent}`;
    }
    return `Authored by ${agent}`;
  }

  return `Made by ${agent}`;
}

/**
 * Resolve sessionName and agent definition from the environment.
 */
export function resolveProvenanceDetails(
  provenance: CommitProvenance,
  agents: readonly AgentDefinition[],
  sessions: readonly ClosedSession[],
): { sessionName?: string; agent?: AgentDefinition } {
  if (provenance.kind === 'human') return {};

  const agentId = provenance.agentIds[0];
  const agent = agentId ? agents.find((a) => a.id === agentId) : undefined;

  let sessionName: string | undefined;
  if (provenance.sessionId) {
    const session = sessions.find((s) => s.id === provenance.sessionId);
    if (session) {
      sessionName = session.name || session.title || session.id;
    } else {
      sessionName = provenance.sessionId;
    }
  }

  return { sessionName, agent };
}

export type ProvenanceMarkProps = {
  provenance?: CommitProvenance | null;
  sessionName?: string;
  agent?: AgentDefinition | null;
  size?: number;
  className?: string;
};

/**
 * The mark on the row (Phase 78 Theme C).
 *
 * Rendered beside the author cell in the graph and in commit detail:
 * - human: renders nothing (returns null, 0 extra DOM).
 * - agent / mixed: renders the agent glyph at badge size with the provenance tooltip.
 * - respects `data-motion="reduced"` (no animated entry).
 * - size follows the avatar size token (default 14px).
 */
export function ProvenanceMark({
  provenance,
  sessionName,
  agent,
  size = 14,
  className = '',
}: ProvenanceMarkProps) {
  if (!provenance || provenance.kind === 'human') {
    return null;
  }

  const agentName = agent?.label;
  const tooltip = getProvenanceTooltip({ provenance, sessionName, agentName });
  const agentId = provenance.agentIds[0] ?? 'claude';
  const Icon = resolveAgentIcon(agent ?? { id: agentId });
  const accent = agent?.accent;

  return (
    <Tooltip label={tooltip}>
      <span
        data-testid="provenance-mark"
        data-provenance-kind={provenance.kind}
        data-provenance-source={provenance.source}
        data-motion="reduced"
        aria-label={tooltip ?? 'Provenance mark'}
        className={`inline-flex shrink-0 items-center justify-center rounded-full transition-opacity motion-reduce:transition-none ${className}`}
        style={{
          width: size,
          height: size,
          color: accent ?? 'currentColor',
        }}
      >
        <Icon className="h-full w-full" aria-hidden />
      </span>
    </Tooltip>
  );
}
