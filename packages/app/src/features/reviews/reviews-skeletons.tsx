import { LoadingRegion, Skeleton } from '../../components/skeleton';

/**
 * What each pane of the Reviews view looks like before its fetch lands.
 *
 * One module rather than a skeleton beside each component, because the thing
 * that makes these work is that they are the *same geometry* as the panes they
 * stand in for — same padding, same row heights, same two-line rows — and that
 * only stays true if they are written and read together. A skeleton kept next
 * to its component drifts from it one padding change at a time, and a skeleton
 * a few pixels off its real layout is worse than none: the content lands and
 * everything jumps.
 *
 * **Every width here is a constant, never random.** Varied widths are what stop
 * a stack of bars reading as a table, but they have to be varied the same way
 * on every render — a random width is a diff in every screenshot test and a
 * flicker on every re-render while the fetch is still in flight.
 *
 * See `components/skeleton.tsx` for when a skeleton is the right mark at all.
 */

/** Deterministic, and deliberately unequal — see the note above. */
const TITLE_WIDTHS = ['72%', '54%', '83%', '61%', '77%', '48%', '68%'];
const PROSE_WIDTHS = ['96%', '88%', '92%', '61%'];
/** Code lines are ragged in a way prose is not — hence a third table. */
const CODE_WIDTHS = ['44%', '68%', '31%', '57%', '22%', '49%'];

/**
 * The PR list, mid-fetch.
 *
 * Seven rows: enough to fill the shortest pane anyone reasonably leaves this
 * view at, and few enough that a repository with two pull requests does not
 * spend a second implying it has seven. The row mirrors `PullRow` — a status
 * pill, a title, a `#number` hard right, and a dimmer branch/author line under
 * it — at the same `px-2 py-1.5`.
 */
export function PullListSkeleton() {
  return (
    <LoadingRegion label="Loading pull requests…" className="min-h-0 flex-1 overflow-hidden py-1">
      <ul className="flex flex-col">
        {TITLE_WIDTHS.map((width, index) => (
          <li key={width} className="flex flex-col gap-1 border-l-2 border-transparent px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              {/* The pill: `rounded-full`, matching `StatusPill`'s own shape. */}
              <Skeleton className="h-3 w-11 rounded-full" />
              <Skeleton className="h-3 flex-1" style={{ maxWidth: width }} />
              <Skeleton className="ml-auto h-2.5 w-6" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-2.5" style={{ width: index % 2 === 0 ? '38%' : '52%' }} />
              <Skeleton className="h-2.5 w-12" />
            </div>
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}

/**
 * The whole detail pane, before there is a pull request to put in it.
 *
 * Used from two places that mean slightly different things — the list has no
 * selection yet, or a selected PR's own detail is still in flight — because in
 * both the reader is looking at the same empty column waiting for the same
 * shape. The header, the action bar, the tab strip and the body all appear at
 * the heights they will really occupy, so nothing shifts when the answer lands.
 */
export function PrDetailSkeleton() {
  return (
    <LoadingRegion
      label="Loading the pull request…"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
    >
      {/* Header — two lines, as `PrHeader` is. */}
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-11 rounded-full" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="ml-auto h-4 w-4" />
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Skeleton className="h-2.5 w-56" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>

      {/* The review actions, which are chrome and always present. */}
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2">
        {['w-16', 'w-20', 'w-14', 'w-16'].map((width) => (
          <Skeleton key={width} className={`h-6 rounded ${width}`} />
        ))}
      </div>

      {/* The four tabs, at the strip's real height. */}
      <div className="flex shrink-0 gap-1 border-b border-border px-2">
        {['w-14', 'w-10', 'w-20', 'w-12'].map((width) => (
          <div key={width} className="px-2.5 py-1.5">
            <Skeleton className={`h-3 ${width}`} />
          </div>
        ))}
      </div>

      <ProseBars className="px-4 py-3" lines={5} />
    </LoadingRegion>
  );
}

/** The Overview tab: a description is prose, so the skeleton is prose-shaped. */
export function PrOverviewSkeleton() {
  return (
    <LoadingRegion label="Loading the description…">
      <ProseBars className="px-4 py-3" lines={6} />
    </LoadingRegion>
  );
}

/**
 * The Files tab: three file rows, the first two opened.
 *
 * Three because that is `DEFAULT_OPEN` — the number of diffs the tab really
 * does expand on arrival — so the skeleton is the shape of the answer rather
 * than a guess at it. The open rows show narrow gutter bars against wider code
 * bars, which is what makes this read as a diff and not as more paragraphs.
 */
export function PrFilesSkeleton() {
  return (
    <LoadingRegion label="Loading the diff…">
      {[0, 1, 2].map((file) => (
        <div key={file} className="border-b border-border/60 last:border-b-0">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3" style={{ width: TITLE_WIDTHS[file] }} />
            <Skeleton className="ml-auto h-2.5 w-10" />
          </div>

          {file < 2 ? (
            <div className="flex flex-col gap-1 px-3 pb-2">
              {CODE_WIDTHS.map((width, line) => (
                <div key={`${file}-${line}`} className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-7 shrink-0" />
                  <Skeleton className="h-2.5" style={{ width }} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </LoadingRegion>
  );
}

/**
 * The Conversation tab: three comments.
 *
 * Each is an author line — name, verdict pill, date — over a short paragraph,
 * divided exactly as `PrConversation` divides them, so the first real comment
 * lands on the border the skeleton already drew.
 */
export function PrConversationSkeleton() {
  return (
    <LoadingRegion label="Loading the conversation…">
      <ol className="divide-y divide-border/60">
        {[0, 1, 2].map((comment) => (
          <li key={comment} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              {comment === 1 ? <Skeleton className="h-3 w-16 rounded-full" /> : null}
              <Skeleton className="h-2.5 w-16" />
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {PROSE_WIDTHS.slice(0, comment === 2 ? 2 : 3).map((width) => (
                <Skeleton key={width} className="h-2.5" style={{ width }} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </LoadingRegion>
  );
}

/**
 * The Checks tab: the workflow strip, a job tree, and the log pane under it.
 *
 * The tree gets the same `max-h-[45%]` cap and bottom border `RunDetail` gives
 * it, because that border is the strongest line in the pane and having it move
 * when the runs land is the jump most worth avoiding here.
 */
export function PrChecksSkeleton() {
  return (
    <LoadingRegion label="Loading the checks…" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="ml-auto h-6 w-16 rounded" />
      </div>

      <div className="max-h-[45%] shrink-0 border-b border-border py-1">
        {['62%', '48%', '71%'].map((width) => (
          <div key={width} className="flex items-center gap-2 px-3 py-1.5">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3" style={{ width }} />
            <Skeleton className="ml-auto h-2.5 w-10" />
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 py-2">
        {CODE_WIDTHS.map((width) => (
          <Skeleton key={width} className="h-2.5" style={{ width }} />
        ))}
      </div>
    </LoadingRegion>
  );
}

/**
 * The header's second line, while the detail fetch that fills it is out.
 *
 * Not a `LoadingRegion`: this sits inside a header that is already showing real
 * text from the cached listing row, so the pane is not in a loading state and
 * announcing one would be wrong. It is two bars holding the space the file
 * count and the base branch are about to take — the alternative, which is what
 * this replaces, is those facts popping into an existing line and nudging
 * everything after them sideways.
 */
export function PrHeaderMetaSkeleton() {
  return (
    <span aria-hidden className="flex items-center gap-3">
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-2.5 w-20" />
    </span>
  );
}

/** Shared paragraph shape: full-width lines over a short last one. */
function ProseBars({ className = '', lines }: { className?: string; lines: number }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className="h-2.5"
          // The last line stops short, the way a paragraph does. Every line at
          // 96% reads as a block quote or a table, not as text.
          style={{ width: PROSE_WIDTHS[index % PROSE_WIDTHS.length] }}
        />
      ))}
    </div>
  );
}
