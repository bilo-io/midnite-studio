import { LuHistory } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import { LoadingRegion, Skeleton } from '../../components/skeleton';

/**
 * What the Sessions list looks like before its fetch lands (Phase 67 Theme C).
 *
 * Follows `issues-skeletons.tsx`'s convention exactly: one module, constant
 * (never random) widths, and the real row's geometry — a dot, a label, an
 * agent glyph, then a duration/age pair hard right — so nothing jumps when
 * the content arrives. Unlike the live terminal roster (populated
 * synchronously from zustand), history is fetched, so this has real work to
 * do.
 */

const LABEL_WIDTHS = ['62%', '48%', '74%', '40%', '58%', '66%'];

export function SessionListSkeleton() {
  return (
    <LoadingRegion label="Loading closed sessions…" className="min-h-0 flex-1 overflow-hidden py-1">
      <ul className="flex flex-col">
        {LABEL_WIDTHS.map((width, index) => (
          <li
            key={width}
            className="flex items-center gap-2 border-l-2 border-transparent px-2 py-1.5"
          >
            <Skeleton className="h-1.5 w-1.5 shrink-0 rounded-full" />
            <Skeleton className="h-3 flex-1" style={{ maxWidth: width }} />
            <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
            <Skeleton className="ml-auto h-2.5 w-16 shrink-0" style={{ opacity: index % 2 === 0 ? 1 : 0.7 }} />
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}

/**
 * Copy for the merged manager's genuinely-empty state (Phase 86 Theme A) —
 * no live session and no closed one, anywhere. Kept apart from a repo-scoped
 * view's "no repo open" empty state on purpose: Sessions is `global: true`
 * (Phase 67 Theme E) and lists across every repo, so an empty list here
 * means no session has ever run anywhere in this app, not that no repo is
 * currently open — the two read very differently and share no copy.
 */
export const NO_SESSIONS_EMPTY: { icon: IconComponent; title: string; body: string } = {
  icon: LuHistory,
  title: 'Nothing running, nothing closed',
  body: 'Open a terminal or start an agent and it shows up here — running above, closed and kept below for as long as you like.',
};
