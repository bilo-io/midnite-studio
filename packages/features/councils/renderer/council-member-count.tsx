import { LuLock } from 'react-icons/lu';

import { COUNCIL_MIN_MEMBERS, COUNCIL_PRO_MEMBERS } from '@midnite/studio-shared';

const STEPS = Array.from({ length: COUNCIL_PRO_MEMBERS - COUNCIL_MIN_MEMBERS + 1 }, (_, i) => COUNCIL_MIN_MEMBERS + i);

/** Where a count sits along the track, as a percentage. */
const at = (count: number): number => ((count - COUNCIL_MIN_MEMBERS) / (COUNCIL_PRO_MEMBERS - COUNCIL_MIN_MEMBERS)) * 100;

/**
 * The member-count slider (Phase 134 Theme D): 2–6 always drawn, the counts
 * above `cap` shaded and locked. Pushing past the cap does not move the slider;
 * it calls `onLocked`, which opens the upgrade prompt. The range stays the full
 * 2–6 so the locked steps can still be reached — by drag, click or arrow key —
 * and say why they are locked.
 */
export function CouncilMemberCount({
  count,
  cap,
  onChange,
  onLocked,
}: {
  count: number;
  cap: number;
  onChange: (count: number) => void;
  onLocked: () => void;
}) {
  const locked = cap < COUNCIL_PRO_MEMBERS;
  return (
    <div data-testid="council-member-count">
      <div className="flex items-center justify-between">
        <label htmlFor="council-member-count" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Members
        </label>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="relative mt-1.5 h-5">
        {locked ? (
          <div
            aria-hidden
            data-testid="council-member-count-locked"
            className="pointer-events-none absolute inset-y-1.5 right-0 rounded-r-full bg-muted-foreground/15"
            style={{ left: `calc(${at(cap)}% + 6px)` }}
          />
        ) : null}
        <input
          id="council-member-count"
          type="range"
          min={COUNCIL_MIN_MEMBERS}
          max={COUNCIL_PRO_MEMBERS}
          step={1}
          value={count}
          aria-valuetext={`${count} members`}
          onChange={(event) => {
            const next = Number(event.target.value);
            // An existing council already over the cap may still shrink.
            if (next > cap && next > count) onLocked();
            else onChange(next);
          }}
          className="relative h-5 w-full cursor-pointer accent-primary"
        />
      </div>
      <div className="relative mt-0.5 h-4 text-[10px] text-muted-foreground">
        {STEPS.map((step) => (
          <span
            key={step}
            className="absolute flex -translate-x-1/2 items-center gap-0.5 tabular-nums"
            style={{ left: `${at(step)}%` }}
          >
            {step}
            {step > cap ? <LuLock aria-label="Pro" className="h-2.5 w-2.5" /> : null}
          </span>
        ))}
      </div>
      {count > cap ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          This council seats more members than the free tier's {cap}. It still runs; it cannot grow.
        </p>
      ) : null}
    </div>
  );
}
