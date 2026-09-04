import { LoadingRegion, Skeleton } from '../../components/skeleton';

/**
 * What the Issues view's list and detail panes look like before their fetch
 * lands — mirrors `features/reviews/reviews-skeletons.tsx`'s own reasoning:
 * one module, constant (never random) widths, and the exact geometry of the
 * real row/pane so nothing jumps when the content arrives.
 */

const TITLE_WIDTHS = ['68%', '52%', '79%', '45%', '71%', '58%'];
const PROSE_WIDTHS = ['96%', '88%', '92%', '61%'];

/**
 * The issue list, mid-fetch.
 *
 * Six rows, mirroring `IssueRow`: a status glyph, a title, `#number` hard
 * right, and a dimmer label/author line under it.
 */
export function IssueListSkeleton() {
  return (
    <LoadingRegion label="Loading issues…" className="min-h-0 flex-1 overflow-hidden py-1">
      <ul className="flex flex-col">
        {TITLE_WIDTHS.map((width, index) => (
          <li key={width} className="flex flex-col gap-1 border-l-2 border-transparent px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
              <Skeleton className="h-3 flex-1" style={{ maxWidth: width }} />
              <Skeleton className="ml-auto h-2.5 w-6" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-2.5 rounded-full" style={{ width: index % 2 === 0 ? '18%' : '26%' }} />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}

/**
 * The whole detail pane, before there is an issue selected or its body has
 * arrived — one pane, matching the real thing: a header-shaped block, then
 * prose bars standing in for the body and the first couple of comments in
 * the same continuous scroll.
 */
export function IssueDetailSkeleton() {
  return (
    <LoadingRegion label="Loading the issue…" className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: '70%' }} />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-2.5 w-16 rounded-full" />
          <Skeleton className="h-2.5 w-20 rounded-full" />
          <Skeleton className="h-2.5 w-14" />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        {PROSE_WIDTHS.map((width) => (
          <Skeleton key={width} className="h-2.5" style={{ width }} />
        ))}
      </div>
      <div className="border-t border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2.5 w-16" />
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {PROSE_WIDTHS.slice(0, 2).map((width) => (
            <Skeleton key={width} className="h-2.5" style={{ width }} />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
