import { AgentAvatar } from '../../components/agent-avatar';
import { Tooltip } from '../../components/tooltip';
import { revealSession } from '../terminal/reveal-session';
import { useAgents } from '../terminal/use-agents';
import type { ActivityGlowBadge } from './use-activity-glow';

/** Past this many live sessions on one target, the rest collapse into a `+N` chip. */
const MAX_VISIBLE_BADGES = 3;

/**
 * The identity badge Phase 95 Theme C hangs on every element that wears a
 * glow: the agent's own mark (`resolveAgentIcon`, tracking the *resolved*
 * agent — `ActivityGlowBadge.agentId` already carries `liveAgentId ??
 * agentId`, so typing `claude` into a plain shell flips this too) or
 * `LuSquareTerminal` for a plain shell. Several sessions on one target stack
 * overlapping, capped at {@link MAX_VISIBLE_BADGES} with a `+N` chip for the
 * rest — today's callers only ever hand this 0 or 1 badge; the cap is here
 * for Theme J's future workflow-node groups.
 *
 * A pure, glow-agnostic overlay: it renders nothing when handed no badges,
 * so every call site can mount it unconditionally rather than guarding on
 * "is anything live" itself.
 */
export function ActivityBadgeStack({
  badges,
  className = '',
}: {
  badges: readonly ActivityGlowBadge[];
  /** Positions the stack — callers own placement (a card's corner, a row's leading slot). */
  className?: string;
}) {
  if (badges.length === 0) return null;

  const visible = badges.slice(0, MAX_VISIBLE_BADGES);
  const overflow = badges.length - visible.length;

  return (
    <div className={`flex items-center -space-x-1 ${className}`} data-testid="activity-badge-stack">
      {visible.map((badge) => (
        <ActivityBadgeIcon key={badge.sessionId} badge={badge} />
      ))}
      {overflow > 0 ? (
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-background bg-muted text-[9px] font-medium text-muted-foreground"
          aria-label={`${overflow} more session${overflow === 1 ? '' : 's'}`}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function ActivityBadgeIcon({ badge }: { badge: ActivityGlowBadge }) {
  // The terminal list's own avatar, not a look-alike: the same component, the
  // same roster lookup for the brand colour (`AgentDefinition.accent`), so a
  // card, a graph node and a list row show exactly what the session's row in
  // the terminal list shows. An id the roster does not know keeps its mark
  // and falls back to the default agent colour, as the terminal list does.
  const { agents } = useAgents();
  const agent =
    badge.kind === 'shell'
      ? undefined
      : (agents.find((a) => a.id === badge.agentId) ?? { id: badge.agentId ?? 'claude' });

  return (
    <Tooltip label={badge.label}>
      <button
        type="button"
        data-testid="activity-badge"
        data-badge-kind={badge.kind}
        aria-label={badge.label}
        // A card/node's own click already opens its detail pane; the badge
        // is a smaller, more specific target sitting on top of it, so its
        // click must never bubble into that.
        onClick={(event) => {
          event.stopPropagation();
          revealSession(badge.sessionId);
        }}
        className="flex shrink-0 items-center justify-center rounded-full bg-background outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <AgentAvatar agent={agent} live activityStatus={badge.status} />
      </button>
    </Tooltip>
  );
}
