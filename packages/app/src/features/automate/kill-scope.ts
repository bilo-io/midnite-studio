import type { KillScope, TerminalSession } from '@midnite/studio-shared';

import { sessionPhase, type ConnectionState } from '../terminal/terminal-store';

/**
 * What each scope needs to know to match a session — whatever context is
 * unavailable (no workflow open, no board open, no active forge account)
 * stays `null`, and every session-matching helper below treats a `null`
 * context as "this scope matches nothing" rather than guessing.
 */
export type KillScopeContext = {
  flow: { workflowId: string } | null;
  project: { projectId: string } | null;
  repo: { repoId: string } | null;
  forgeUser: { forgeAccountKey: string } | null;
};

export const EMPTY_KILL_SCOPE_CONTEXT: KillScopeContext = {
  flow: null,
  project: null,
  repo: null,
  forgeUser: null,
};

/** A session (live or not) is *addressed by* a scope — the field-matching
 *  half, kept apart from liveness/kind so `sessionsForScope` below has one
 *  place that combines them, and a scope's own description can call this
 *  directly for a hypothetical "what if it were live" count if that is ever
 *  wanted. */
export function sessionMatchesScope(
  session: Pick<TerminalSession, 'repoId' | 'projectRef' | 'workflowRunRef' | 'forgeAccountKey'>,
  scope: KillScope,
  context: KillScopeContext,
): boolean {
  switch (scope) {
    case 'flow':
      return context.flow !== null && session.workflowRunRef?.workflowId === context.flow.workflowId;
    case 'project':
      return context.project !== null && session.projectRef?.projectId === context.project.projectId;
    case 'repo':
      return context.repo !== null && session.repoId === context.repo.repoId;
    case 'forgeUser':
      return context.forgeUser !== null && session.forgeAccountKey === context.forgeUser.forgeAccountKey;
    case 'global':
      return true;
  }
}

/**
 * The live sessions a scope would stop (Phase 95 Theme H) — the blast-radius
 * count the modal's own sentence names, and the exact list `pty.kill` is
 * called for on Confirm.
 *
 * Only `global` includes a plain shell — the doc's own recommendation
 * ("Global also kills plain shells, with the count shown before confirming").
 * Every narrower scope is agent-only: Auto-mate never drives a bare shell, so
 * a shell carrying a matching `repoId`/`forgeAccountKey` by coincidence is not
 * this scope's business to kill.
 */
export function sessionsForScope(
  sessions: readonly TerminalSession[],
  states: Readonly<Record<string, ConnectionState | undefined>>,
  scope: KillScope,
  context: KillScopeContext,
): TerminalSession[] {
  return sessions.filter((session) => {
    if (sessionPhase(session, states[session.id]) !== 'live') return false;
    if (session.kind === 'shell' && scope !== 'global') return false;
    return sessionMatchesScope(session, scope, context);
  });
}

/**
 * Which project boards Confirm should flip Auto-mate off for (Phase 95
 * Theme H) — deliberately narrower than "every session this scope kills",
 * because Auto-mate is a per-project-board toggle and the app tracks no
 * project↔repo reverse index beyond `projectBoardByRepo`'s single
 * "last board opened for this repo" memory:
 *
 * - `project` turns off the named board, if Auto-mate is even on for it.
 * - `repo` turns off only the board `projectBoardByRepo` remembers for this
 *   repo — the one project↔repo association the app persists. A board
 *   Auto-mate'd under a *different* repo selection keeps running; its own
 *   sessions still stop if they carry this `repoId`, which the session-level
 *   filter above handles regardless.
 * - `global` turns off every board that is currently on.
 * - `flow`/`forgeUser` turn off nothing — Auto-mate has no workflow- or
 *   forge-account-level toggle of its own, only a project-board one, so
 *   these two scopes only ever stop matching *sessions*.
 */
export function projectIdsToDisableForScope(
  scope: KillScope,
  context: KillScopeContext,
  automateEnabledByProject: Readonly<Record<string, boolean>>,
  repoBoardProjectId: string | null,
): string[] {
  switch (scope) {
    case 'project':
      return context.project && automateEnabledByProject[context.project.projectId]
        ? [context.project.projectId]
        : [];
    case 'repo':
      return repoBoardProjectId && automateEnabledByProject[repoBoardProjectId] ? [repoBoardProjectId] : [];
    case 'global':
      return Object.entries(automateEnabledByProject)
        .filter(([, enabled]) => enabled)
        .map(([projectId]) => projectId);
    case 'flow':
    case 'forgeUser':
      return [];
  }
}
