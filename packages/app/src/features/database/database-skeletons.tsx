import { LoadingRegion, Skeleton } from '../../components/skeleton';

/**
 * The connections list, mid-fetch — mirrors `issues-skeletons.tsx`'s own
 * reasoning: one module, constant (never random) widths, and the exact
 * geometry of a real connection row so nothing jumps when the list arrives.
 */

const NAME_WIDTHS = ['72%', '55%', '64%'];

export function ConnectionListSkeleton() {
  return (
    <LoadingRegion label="Loading database connections…" className="min-h-0 flex-1 overflow-hidden p-2">
      <ul className="flex flex-col gap-1">
        {NAME_WIDTHS.map((width, index) => (
          <li key={width} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Skeleton className="h-3" style={{ maxWidth: width }} />
              <Skeleton className="h-2.5" style={{ width: index % 2 === 0 ? '38%' : '48%' }} />
            </div>
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}
