import type { ActivityStatus } from '@midnite/studio-shared';

/**
 * `var(--activity-<status>)` — the one property every status, solid or
 * gradient, always resolves to (`resolve-activity-tokens.ts`'s "a
 * single-colour fallback for any consumer that only wants one value").
 *
 * The seam three of the phase doc's six hardcoded status maps route through
 * (Theme A): `run-node-detail.tsx`'s `STATUS_TONE`, `loop-history.tsx`'s
 * `STATUS_COLOR` and `notification-bell.tsx`'s `STATUS_COLORS` each keep
 * their own domain status → {@link ActivityStatus} table (their statuses
 * were never the same vocabulary as this one) and hand the mapped value to
 * this function instead of a literal Tailwind colour class, so a status
 * pill's colour and a live glow's ring are always driven by the same token.
 */
export function activityStatusVar(status: ActivityStatus): string {
  return `var(--activity-${status})`;
}
