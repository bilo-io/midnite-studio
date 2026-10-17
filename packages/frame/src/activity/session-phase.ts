import type { TerminalSession } from '@midnite/studio-shared';

/*
  Pure session predicates (Phase 113 Theme O) — moved verbatim out of Studio's
  `features/terminal/terminal-store.ts`, which re-exports them, because the
  Tasks feature reads them too (a card's live session, its phase, the agent it
  is drawn as) and a feature may not import an app. Pure functions over the
  store's two maps, so a test can call them without mounting anything.
*/

/** A terminal's runtime connection — kept beside the session rows, never on them. */
export type ConnectionState = 'idle' | 'starting' | 'open' | 'exited' | 'unavailable';

/**
 * Derived honest lifecycle phase of a terminal session across process and sleep states.
 *
 * - `live`: process is running or starting up (`open`, `starting`, `idle`) — including a
 *   `legacy` broker session with a bound pty (Phase 51 Theme G): it is a real, running
 *   process on a reachable socket, not dormant. `legacy` is provenance ("from a previous
 *   run"), not a lifecycle state, and is rendered as such — see `terminal-session-list.tsx`'s
 *   own moon glyph, which reads `session.legacy` directly rather than this phase.
 * - `asleep`: deliberately put to sleep (process killed, transcript kept).
 * - `ended`: process has exited, backend unavailable, or restored without live process.
 */
export type SessionPhase = 'live' | 'asleep' | 'ended';

/**
 * Derive the honest session phase for a session given its persisted flags and runtime connection state.
 */
export function sessionPhase(
  session: Pick<TerminalSession, 'asleep'>,
  state: ConnectionState | undefined,
): SessionPhase {
  if (session.asleep === true) return 'asleep';
  if (state === 'open' || state === 'starting' || state === 'idle') return 'live';
  return 'ended';
}

/**
 * The live `'kanban'` session already bound to a card, if any (Phase 41 Theme
 * D) — what a card's Start button checks before launching, so a card already
 * running shows Stop rather than a second, orphaned session. `sessions` and
 * `states` are the store's own two maps, kept apart from the store itself so
 * this stays a pure function a test can call without mounting anything.
 */
export function findCardSession(
  sessions: Pick<TerminalSession, 'id' | 'surface' | 'taskRef' | 'asleep' | 'agentId'>[],
  states: Record<string, ConnectionState>,
  taskRef: { projectId: string; itemId: string },
): (typeof sessions)[number] | undefined {
  return sessions.find(
    (s) =>
      s.surface === 'kanban' &&
      !s.asleep &&
      s.taskRef?.projectId === taskRef.projectId &&
      s.taskRef?.itemId === taskRef.itemId &&
      states[s.id] !== 'exited' &&
      states[s.id] !== 'unavailable',
  );
}

/**
 * Any `'kanban'` session ever bound to a card, live or not (Phase 41 Theme
 * F) — what the glow reads to tell "no agent has ever run here" (no ring)
 * apart from "one did, and its transcript is one click away" (a static ring
 * once the pane is reopened), a distinction `findCardSession`'s live-only
 * filter above cannot make since it exists for a different question (does
 * Start need to become Stop right now).
 */
export function findAnyCardSession(
  sessions: Pick<TerminalSession, 'id' | 'surface' | 'taskRef' | 'agentId' | 'asleep'>[],
  taskRef: { projectId: string; itemId: string },
): (typeof sessions)[number] | undefined {
  return sessions.find(
    (s) =>
      s.surface === 'kanban' &&
      s.taskRef?.projectId === taskRef.projectId &&
      s.taskRef?.itemId === taskRef.itemId,
  );
}

/**
 * Which agent a session should be *drawn* as, reading the tri-state
 * `liveAgentId` (absent: never probed; `null`: probed, no agent; a string: the
 * agent the `ps` probe found running).
 *
 * Icons only, deliberately. `sessionLabel` already resolves four ways
 * (`name` → `autoName` → `agentLabel` → `'Terminal'`) and a fifth input into
 * that ordering wants its own design pass — so a plain shell running Codex gets
 * Codex's mark and keeps whatever it was called.
 *
 * Returns `undefined` for "no agent", which is the shape both `SessionIcon` and
 * the header already take for a bare terminal.
 */
export function resolveSessionAgentId(
  session: Pick<TerminalSession, 'id' | 'agentId'>,
  liveAgentId: Record<string, string | null>,
): string | undefined {
  // Absent means never probed — not "probed and found nothing".
  if (!(session.id in liveAgentId)) return session.agentId;
  return liveAgentId[session.id] ?? undefined;
}
