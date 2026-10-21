import { useEffect, useState } from 'react';

/**
 * The repository-independent utility cards — ported from midnite's Clock, Date
 * and Scratchpad widgets, minus their settings (the studio keeps these
 * config-free; midnite's digital/analogue toggle and timezone lists are not
 * ported).
 */

/** A `Date` that re-renders its owner once per `intervalMs`. */
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ClockWidget() {
  const now = useNow(1000);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <time
        dateTime={now.toISOString()}
        className="text-3xl font-semibold tabular-nums tracking-tight"
      >
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </time>
      <span className="text-[11px] text-muted-foreground">
        {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </span>
    </div>
  );
}

/** ISO-8601 week number. */
export const isoWeek = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
};

export function DateWidget() {
  const now = useNow(60_000);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-0.5 text-center">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {now.toLocaleDateString([], { weekday: 'long' })}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{now.getDate()}</span>
      <span className="text-xs text-muted-foreground">
        {now.toLocaleDateString([], { month: 'long', year: 'numeric' })} · week {isoWeek(now)}
      </span>
    </div>
  );
}

export function ScratchpadWidget({
  text,
  onChange,
}: {
  text: string;
  onChange: (next: string) => void;
}) {
  return (
    <textarea
      aria-label="Scratchpad"
      value={text}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Jot something down…"
      className="dashboard-no-drag h-full w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
    />
  );
}
