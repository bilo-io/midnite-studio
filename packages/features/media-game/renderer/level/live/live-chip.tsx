import { StateDot } from '@midnite/studio-frame';

/** The "Live · 23 entities" chip beside the toolbar's Live toggle (Phase 140 Theme E): a pulsing dot while ghosts flow. */
export function LiveChip({ count, truncated }: { count: number | null; truncated?: boolean }) {
  const text = count === null ? 'Live · waiting' : `Live · ${count}${truncated ? '+' : ''} ${count === 1 && !truncated ? 'entity' : 'entities'}`;
  return (
    <span role="status" data-testid="level-live-chip" className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
      <StateDot state={count === null ? 'starting' : 'open'} />
      {text}
    </span>
  );
}
