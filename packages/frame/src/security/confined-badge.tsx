import { CONFINED_SESSION_LABEL } from '@midnite/studio-shared';
import { LuLock } from 'react-icons/lu';

/**
 * The lock on a confined session (Phase 121 Theme E) — drawn in the sessions list, the Sessions page and the
 * terminal header, so one glyph and one sentence mean the same thing everywhere. Quiet by design: it is a
 * fact about the session, not a warning.
 */
export function ConfinedBadge({ className = '' }: { className?: string }) {
  return (
    <LuLock
      role="img"
      aria-label="Confined session"
      title={CONFINED_SESSION_LABEL}
      data-testid="confined-badge"
      className={`size-3 shrink-0 text-emerald-600 dark:text-emerald-400 ${className}`}
    />
  );
}
