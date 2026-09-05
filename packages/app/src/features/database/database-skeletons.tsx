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

const TABLE_WIDTHS = ['46%', '58%', '38%'];

/**
 * A connection's schema tree (Theme F), mid-fetch — three placeholder table
 * rows, indented one rung under the connection heading (`TREE_INDENT[1]`, the
 * same rung `connection-tree.tsx` uses for a table row with no schema group).
 */
export function SchemaTreeSkeleton() {
  return (
    <LoadingRegion label="Loading schema…" className="pl-8">
      <ul className="flex flex-col gap-0.5 py-1">
        {TABLE_WIDTHS.map((width) => (
          <li key={width} className="flex h-6 items-center gap-1.5 pr-2">
            <Skeleton className="h-3 w-3 shrink-0" />
            <Skeleton className="h-3" style={{ width }} />
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}
