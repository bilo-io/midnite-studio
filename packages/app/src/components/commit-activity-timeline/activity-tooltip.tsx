import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { bucketLabel, type ActivityBucket, type ActivityTimeframe } from './activity-buckets';

/** Where the pointer was when the bucket under it changed. Viewport coords. */
export interface PointerAt {
  x: number;
  y: number;
}

/**
 * The hover card for one time bucket.
 *
 * Deliberately NOT the app's `<Tooltip>`: that one is a per-element hover with
 * an open delay, cloned onto a single focusable trigger. A chart has one
 * trigger and thirty labels, the label has to change as the pointer travels
 * without ever re-delaying, and the content is a small table rather than a
 * string. What it *does* borrow is the portal and the clamp — the panel can sit
 * flush against the window edge in either orientation, so a card positioned
 * naively is a card half off-screen (see `tooltip.tsx` for the long version).
 */
export function ActivityTooltip({
  bucket,
  timeframe,
  windowCommits,
  hasChurn,
  at,
}: {
  bucket: ActivityBucket;
  timeframe: ActivityTimeframe;
  /** Commits across the whole window, for the share line. */
  windowCommits: number;
  /** Whether the window carries line counts at all — if not, churn is unmeasured. */
  hasChurn: boolean;
  at: PointerAt;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<PointerAt>({ x: at.x, y: at.y });

  /*
    Measure-then-place, before paint. The card's size depends on its text (the
    churn row comes and goes), so the clamp cannot be computed from a constant.
  */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { width, height } = card.getBoundingClientRect();
    const x = Math.min(Math.max(GUTTER, at.x + OFFSET), window.innerWidth - width - GUTTER);
    // Above the pointer by default, below it when there is no room above.
    const above = at.y - height - OFFSET;
    setPlaced({ x, y: above >= GUTTER ? above : at.y + OFFSET });
  }, [at.x, at.y, bucket.start]);

  const share = windowCommits > 0 ? Math.round((bucket.count / windowCommits) * 100) : 0;

  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      data-testid="activity-tooltip"
      className="pointer-events-none fixed z-50 min-w-36 rounded-md border border-border bg-popover px-2.5 py-2 text-[11px] leading-tight shadow-lg"
      style={{ left: placed.x, top: placed.y }}
    >
      <p className="font-medium text-foreground">{bucketLabel(bucket, timeframe)}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {bucket.count === 0 ? 'No commits' : `${bucket.count} commit${bucket.count === 1 ? '' : 's'}`}
      </p>
      {bucket.count > 0 && hasChurn ? (
        <p className="mt-1 flex items-center gap-2 tabular-nums">
          <span className="text-emerald-500">+{bucket.additions.toLocaleString()}</span>
          <span className="text-rose-500">−{bucket.deletions.toLocaleString()}</span>
          <span className="text-muted-foreground">lines</span>
        </p>
      ) : null}
      {bucket.count > 0 && windowCommits > 0 ? (
        <p className="mt-1.5 border-t border-border/60 pt-1.5 tabular-nums text-muted-foreground">
          {share}% of {WINDOW_LABEL[timeframe]}
        </p>
      ) : null}
    </div>,
    document.body,
  );
}

/** Distance from the pointer, and the minimum from the viewport edge. */
const OFFSET = 12;
const GUTTER = 8;

const WINDOW_LABEL: Record<ActivityTimeframe, string> = {
  day: 'the last 24 hours',
  week: 'the last 7 days',
  month: 'the last 30 days',
};
