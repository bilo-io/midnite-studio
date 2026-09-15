import { useEffect, useState } from 'react';
import { LuEllipsis } from 'react-icons/lu';

import { Popover } from '../../components/popover';
import type { StatusSegment } from './segments';

/**
 * The single shared `…` for the whole bar — not one per zone. Whichever
 * zones shed segments at `collapsed` density, their lowest-priority ones
 * land in this one popover, in the priority-ascending order `collapseFor`
 * already produced.
 *
 * Renders each collapsed segment through its own `El`, restoring the CSS
 * `data-density` scope has nothing to say about a portal: `Popover` renders
 * its panel into `document.body`, outside the per-zone `<div data-density>`
 * element the `.status-label` rule matches against, so a segment's label
 * comes back automatically — no override needed.
 *
 * `anyCollapsed` rather than a single `Density` (Phase 87): each zone now
 * collapses independently, so there is no one density value to hand this
 * component — only whether *some* zone currently has segments to show here,
 * which `items.length > 0` already answers by construction (`collapseFor`
 * only ever produces `collapsed` entries at `collapsed` density). Kept as an
 * explicit boolean rather than re-deriving it from `items` a second time
 * inside the effect below.
 */
export function OverflowPopover({
  items,
  anyCollapsed,
}: {
  items: readonly StatusSegment[];
  anyCollapsed: boolean;
}) {
  const [open, setOpen] = useState(false);

  // If every zone widens back past collapsed while this is open, close it
  // rather than let it keep listing segments that are now rendered inline
  // again.
  useEffect(() => {
    if (!anyCollapsed && open) setOpen(false);
  }, [anyCollapsed, open]);

  if (items.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      label={`${items.length} more`}
      testId="status-overflow"
      panelClassName="min-w-[200px] py-1"
      trigger={<LuEllipsis aria-hidden className="h-3.5 w-3.5" />}
    >
      <div className="flex flex-col">
        {items.map((item) => (
          <div key={item.id} className="flex items-center px-2 py-1.5 first:pt-2 last:pb-2">
            <item.El />
          </div>
        ))}
      </div>
    </Popover>
  );
}
