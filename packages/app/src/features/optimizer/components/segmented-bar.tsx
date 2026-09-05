import { formatBytes } from '../../monitor/format-bytes';

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
 *
 * Generic over `Id` (Phase 72 Theme D, Decision 12) so one component serves
 * both the category axis and the ecosystem axis. The component was never
 * actually id-agnostic — it called `categoryColor`/`CATEGORY_LABELS`
 * internally — so `color`/`name` move to props rather than forking a second
 * `EcosystemBar` that would duplicate the overflow-scaling maths this file's
 * own tests protect.
 */
export function SegmentedBar<Id extends string>({
  segments,
  total,
  label,
  color,
  name,
}: {
  segments: readonly { id: Id; bytes: number }[];
  total: number;
  label: string;
  color: (id: Id) => string;
  name: (id: Id) => string;
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
                title={`${name(segment.id)}: ${formatBytes(segment.bytes)}`}
                style={{ width: `${percent}%`, backgroundColor: color(segment.id) }}
              />
            );
          })
        : null}
    </div>
  );
}
