import { LuLoader } from 'react-icons/lu';

import { useSearchStore } from '../search/search-store';


export function SearchProgressSegment() {
  const inFlight = useSearchStore((s) => s.inFlight);
  const totalResults = useSearchStore((s) => s.totalResults);

  if (!inFlight) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono"
      title={`Searching (${inFlight.mode})…`}
      aria-label={`Search in progress: ${totalResults} matches`}
    >
      <LuLoader className="h-3 w-3 animate-spin text-primary" />
      <span className="status-label capitalize">
        Searching {inFlight.mode} ({totalResults})
      </span>
    </div>
  );
}

