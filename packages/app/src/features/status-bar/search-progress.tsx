import { LuX } from 'react-icons/lu';

import { Spinner } from '../../components/skeleton';
import { useUiStore } from '../../store/ui-store';
import { useSearchStore } from '../search/search-store';

/**
 * The in-flight-search readout (Phase 25 Theme C): a grep started from the
 * Search view and left running while the user switches elsewhere is visible
 * rather than invisible. Renders only while a search is in flight — this is
 * the phase's whole observability story, so there is nothing to show once
 * `finishSearch` clears `inFlight`, error or not.
 *
 * Clicking the label returns to the Search view, the way `ReattachedNote`
 * reveals its session; the trailing button cancels in place without
 * navigating, so a search that is clearly wrong does not require a trip
 * back to the view just to stop it.
 */
export function SearchProgressSegment() {
  const inFlight = useSearchStore((s) => s.inFlight);
  const totalResults = useSearchStore((s) => s.totalResults);
  const cancelSearch = useSearchStore((s) => s.cancelSearch);

  if (!inFlight) return null;

  return (
    <div
      data-testid="status-segment-search-progress"
      className="flex items-center gap-1 text-xs text-muted-foreground font-mono"
    >
      <button
        type="button"
        onClick={() => useUiStore.getState().setActiveView('search')}
        aria-label={`Searching ${inFlight.mode}, ${totalResults} matches — go to Search`}
        title={`Searching (${inFlight.mode})…`}
        className="flex items-center gap-1.5 rounded px-0.5 hover:bg-accent"
      >
        <Spinner size="xs" tone="inherit" className="text-primary" />
        <span className="status-label capitalize">
          Searching {inFlight.mode} ({totalResults})
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          cancelSearch();
        }}
        aria-label="Stop search"
        className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
      >
        <LuX className="h-3 w-3" />
      </button>
    </div>
  );
}

