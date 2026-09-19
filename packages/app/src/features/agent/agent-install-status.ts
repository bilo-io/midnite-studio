import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';

/**
 * The single predicate every agent dropdown greys a row against — the
 * terminal's `+` picker (`features/terminal/new-session-menu.ts`) and the
 * title bar's primary-agent picker (`components/title-bar-primary-agent.tsx`)
 * both read it rather than each keeping their own copy of "is this agent
 * installed".
 *
 * `status` **may be shorter than the roster** — an agent the install probe
 * could not answer for is simply absent from it, and absent means "assume it
 * works". Only a probe that ran and answered `installed: false` may report an
 * agent unconfigured; a probe that failed outright must never disable a
 * working agent (see `AgentStatusSchema` in `@midnite/studio-shared`).
 */
export function isAgentUnconfigured(agent: AgentDefinition, status: AgentStatus[]): boolean {
  return status.find((s) => s.id === agent.id)?.installed === false;
}

/**
 * What an unconfigured agent's row says instead of nothing — the roster's own
 * install hint when it has one, a generic "not on your PATH" sentence
 * otherwise. A greyed row with an empty tooltip is the most frustrating thing
 * a menu can show.
 */
export function agentInstallHint(agent: AgentDefinition): string {
  return agent.install ?? `\`${agent.command}\` was not found on your PATH`;
}
