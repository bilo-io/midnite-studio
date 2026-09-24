/**
 * Auto-mate and the kill switch (Phase 95 Theme H) — the shared vocabulary
 * both `packages/app`'s engine and its UI read, kept here rather than
 * renderer-local because `KillScope` names a wire-adjacent concept
 * (`TerminalSession.projectRef`/`workflowRunRef`/`forgeAccountKey`, all
 * shared fields) even though nothing here crosses an IPC boundary today.
 */
import { z } from 'zod';

/** Concurrency cap bounds — 1 to 5, default 1 (the phase doc's own numbers). */
export const AUTOMATE_CONCURRENCY_MIN = 1;
export const AUTOMATE_CONCURRENCY_MAX = 5;
export const AUTOMATE_CONCURRENCY_DEFAULT = 1;

/** Clamp a user-entered cap into the supported range, rounding to a whole
 *  session count and falling back to the default for anything non-numeric —
 *  a settings `<input type="number">` can hand back `NaN` mid-edit. */
export function clampAutomateConcurrency(value: number): number {
  if (!Number.isFinite(value)) return AUTOMATE_CONCURRENCY_DEFAULT;
  return Math.min(AUTOMATE_CONCURRENCY_MAX, Math.max(AUTOMATE_CONCURRENCY_MIN, Math.round(value)));
}

/**
 * The kill switch's five scopes, narrowest to broadest — the same order the
 * modal renders its options in.
 */
export const KillScopeSchema = z.enum(['flow', 'project', 'repo', 'forgeUser', 'global']);
export type KillScope = z.infer<typeof KillScopeSchema>;

export const KILL_SCOPES: readonly KillScope[] = ['flow', 'project', 'repo', 'forgeUser', 'global'];

/** Label + one-sentence description shown above the scope's own count — the
 *  phase doc's own worked example ("Stops 3 sessions and turns off Auto-mate
 *  for Midnite Studio's project board."), generalised to every scope. */
export const KILL_SCOPE_LABEL: Readonly<Record<KillScope, string>> = {
  flow: 'Flow',
  project: 'Project',
  repo: 'Repo',
  forgeUser: 'Forge user',
  global: 'Global',
};
