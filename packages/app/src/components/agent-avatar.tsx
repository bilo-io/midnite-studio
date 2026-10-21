import type { CSSProperties } from 'react';

import type { ActivityStatus, AgentDefinition } from '@midnite/studio-shared';
import { LuTerminal } from 'react-icons/lu';
import { SiOllama } from 'react-icons/si';

import { resolveAgentIcon } from './icons';

/**
 * The agent avatar: the agent's own mark in its brand colour, or a terminal
 * glyph for a plain shell, wrapped in the shared activity ring while live.
 *
 * Lifted out of the terminal session list (where it was `SessionIcon`) so the
 * Projects board, graph and list render the very same element rather than a
 * look-alike that drifts. The mark is resolved through `resolveAgentIcon`
 * (`AGENT_ICONS`), never hard-coded — this used to put Claude's face on any
 * agent id, which was invisible while the roster had one entry.
 *
 * **The brand colour is roster data**, `AgentDefinition.accent` (the built-in
 * roster in `shared/src/terminal.ts` is the per-agent map; a user-added agent
 * brings its own). It is inline because a user-added agent brings a colour
 * Tailwind has never seen, and it feeds `--agent-accent`, which is what
 * colours PR #571's rotating arc (`.terminal-agent-glow` in `styles.css`).
 * That CSS already pauses the arc while the window is blurred and stops it
 * under reduced motion, leaving a solid ring in the brand colour.
 *
 * `activityStatus === 'idle'` paints no ring at all, just the mark.
 */
export function AgentAvatar({
  agent,
  live,
  activityStatus,
  ollamaBacked,
}: {
  /**
   * `undefined` for a plain shell, which gets the terminal glyph. An agent
   * without an `accent` (an id the roster does not know) keeps its mark in
   * the ambient colour, and its ring falls back to `--activity-agent`.
   */
  agent: (Pick<AgentDefinition, 'id' | 'icon'> & { accent?: string | undefined }) | undefined;
  live: boolean;
  /** `useActivityGlow`'s own status (Phase 95 Theme C) — wraps this mark in the shared glow ring, `'idle'` painting none at all. */
  activityStatus: ActivityStatus;
  /** Session identity (Phase 96 Theme H) — `session.backend === 'ollama'`. */
  ollamaBacked?: boolean;
}) {
  const className = `size-3.5 shrink-0 ${live ? '' : 'opacity-50'}`;
  const Mark = agent ? resolveAgentIcon(agent) : LuTerminal;
  const icon = (
    <span className="relative inline-flex shrink-0" data-agent-avatar={agent?.id ?? 'shell'}>
      <Mark
        className={className}
        // `agent` is `undefined` for the plain-shell glyph, so this is too.
        style={agent?.accent ? { color: agent.accent } : undefined}
      />
      {ollamaBacked ? (
        <SiOllama
          aria-label="Running on Ollama"
          title="Running on Ollama"
          className="absolute -bottom-1 -right-1 size-2 rounded-full bg-background text-foreground"
        />
      ) : null}
    </span>
  );

  if (activityStatus === 'idle') return icon;
  const isAgent = Boolean(agent) || activityStatus === 'agent';
  return (
    <span
      data-activity-status={activityStatus}
      {...(isAgent ? { 'data-agent-icon': 'true' } : {})}
      data-testid="session-icon-glow"
      className={`activity-glow flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
        isAgent ? 'terminal-agent-glow' : ''
      }`}
      style={
        isAgent
          ? ({
              '--agent-accent': agent?.accent ?? 'var(--activity-agent)',
            } as CSSProperties)
          : undefined
      }
    >
      {icon}
    </span>
  );
}
