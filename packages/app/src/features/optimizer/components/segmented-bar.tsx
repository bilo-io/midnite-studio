import type { ScanCategory } from '@midnite/studio-shared';

import { formatBytes } from '../../monitor/format-bytes';
import { CATEGORY_LABELS, categoryColor } from '../category-palette';

/**
 * A byte-domain storage bar (Phase 59 Theme B) — the Storage tab's own
 * component, not a `MetricChart` variant. `MetricChart`'s domain is fixed at
 * 0–100 by contract; this one takes `total` explicitly because bytes have no
 * such fixed ceiling.
 *
 * Clamped in both directions: a `total` of zero renders an empty track rather
 * than dividing by it, and segments summing above `total` (a scan racing a
 * delete can produce exactly this) are scaled down proportionally so the bar
 * never overflows its own end.
 */
export function SegmentedBar({
  segments,
  total,
  label,
}: {
  segments: readonly { id: ScanCategory; bytes: number }[];
  total: number;
  label: string;
}) {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const sum = segments.reduce((acc, segment) => acc + Math.max(0, segment.bytes), 0);
  const scale = safeTotal > 0 && sum > safeTotal ? safeTotal / sum : 1;

  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
    >
      {safeTotal > 0
        ? segments.map((segment) => {
            const bytes = Math.max(0, segment.bytes) * scale;
            const percent = (bytes / safeTotal) * 100;
            if (percent <= 0) return null;
            return (
              <div
                key={segment.id}
                title={`${CATEGORY_LABELS[segment.id]}: ${formatBytes(segment.bytes)}`}
                style={{ width: `${percent}%`, backgroundColor: categoryColor(segment.id) }}
              />
            );
          })
        : null}
    </div>
  );
}
