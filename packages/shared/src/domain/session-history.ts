import { z } from 'zod';

import {
  TerminalSessionKindSchema,
  TerminalSurfaceSchema,
  type TerminalSession,
} from '../terminal';

/**
 * A session that ended, and the transcript it left behind.
 *
 * Closing a terminal session used to *erase* it: `terminal:forget` dropped the
 * row from `terminals.json`, threw away the in-memory ring and unlinked
 * `scrollback/<id>.bin`. The three modelled states — `live`, `asleep`, `ended`
 * — all describe a session that still exists, so there was no record of a
 * fourth: *closed*. This is that record.
 *
 * The shape is the **durable half** of {@link TerminalSession} plus how it
 * ended. Two fields of the live row are deliberately absent:
 *
 * - `asleep`, which is a statement about a process that no longer exists.
 * - `taskRef`, which points at a ProjectV2 card. A closed session is not
 *   re-attachable to a board, and keeping the pointer would invite a later
 *   feature to try.
 *
 * Written as a fresh `z.object` rather than `TerminalSessionSchema.extend(…)`:
 * that schema closes with `.superRefine(agentIdMatchesKind)`, which returns a
 * `ZodEffects` with no `.extend`. The trap is documented in `terminal.ts`'s own
 * comment on `taskRef`, and this is the second place it would have bitten.
 */
export const ClosedSessionSchema = z.object({
  id: z.string().min(1),
  kind: TerminalSessionKindSchema,
  /** Set when `kind === 'agent'`; the roster entry that started it. */
  agentId: z.string().min(1).optional(),
  /** The repo name, by default — *not* the session's own label. See `name`. */
  title: z.string(),
  /** The session's own user-set name, when it had one. */
  name: z.string().min(1).optional(),
  cwd: z.string().min(1),
  repoId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  surface: TerminalSurfaceSchema.optional(),
  closedAt: z.number().int().nonnegative(),
  /** The process's own exit code when one was observed, else `null`. */
  exitCode: z.number().int().nullable(),
  /**
   * How it ended. A history that cannot tell "I closed it" from "it crashed"
   * is not worth keeping, so the three real endings are distinguished:
   *
   * - `closed` — the user pressed the `X` on a session still running.
   * - `exited` — the process ended on its own, before the close.
   * - `superseded` — the FAB collected a loop session a newer run replaced
   *   (`usePruneSupersededSessions`).
   *
   * `exited` is main's own reading, derived from the `onSessionExit` seam. The
   * renderer never sends it, because the renderer does not reliably know.
   */
  reason: z.enum(['closed', 'exited', 'superseded']),
  /** Size of the archived transcript, so a list can say so without reading it. */
  transcriptBytes: z.number().int().nonnegative(),
});
export type ClosedSession = z.infer<typeof ClosedSessionSchema>;

/**
 * How many closed sessions are kept, matching `councils-runs-store.ts`'s
 * `MAX_STORED_RUNS`.
 *
 * A constant rather than a setting: 200 records at ≤1 MB of transcript each is
 * a ceiling nobody will notice, and a setting would mean a migration, a
 * Settings arm and a truncate-on-lower path for a number no one has wanted to
 * change.
 */
export const MAX_CLOSED_SESSIONS = 200;

/** How a session ended — everything the live row cannot say for itself. */
export type SessionEnding = {
  closedAt: number;
  exitCode: number | null;
  reason: ClosedSession['reason'];
  transcriptBytes: number;
};

/**
 * Narrow a live session to its durable half.
 *
 * The **only** place the narrowing is written, so a field added to
 * `TerminalSession` has one place to be considered rather than three.
 */
export function closedFromSession(session: TerminalSession, ending: SessionEnding): ClosedSession {
  return {
    id: session.id,
    kind: session.kind,
    ...(session.agentId === undefined ? {} : { agentId: session.agentId }),
    title: session.title,
    ...(session.name === undefined ? {} : { name: session.name }),
    cwd: session.cwd,
    repoId: session.repoId,
    createdAt: session.createdAt,
    ...(session.surface === undefined ? {} : { surface: session.surface }),
    closedAt: ending.closedAt,
    exitCode: ending.exitCode,
    reason: ending.reason,
    transcriptBytes: ending.transcriptBytes,
  };
}
