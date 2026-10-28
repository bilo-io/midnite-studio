import { z } from 'zod';

/**
 * Confined sessions — Phase 121 Theme E.
 *
 * A session can run under a macOS Seatbelt profile (`sandbox-exec`, generated per session by the
 * runtime's `seatbelt-profile.ts`). The renderer needs only two facts: whether the machine can do
 * it at all, and whether new sessions are confined by default (the `confineNewSessions` setting,
 * mirrored into main with the other settings). Each session's own state is `confined` on
 * `PtyCreateResponse`.
 */
export const ConfinementStatusSchema = z.object({
  /** `sandbox-exec` exists here and accepted a profile when probed. */
  available: z.boolean(),
  /** One sentence for the settings row when it is not. */
  reason: z.string().optional(),
  /** New sessions are confined (the setting, and available). */
  enabled: z.boolean(),
});
export type ConfinementStatus = z.infer<typeof ConfinementStatusSchema>;

/** The badge's tooltip: what a lock on a session means. */
export const CONFINED_SESSION_LABEL = 'Confined: writes limited to this repo and scratch space; SSH keys, cloud credentials and other repos are unreadable.';
