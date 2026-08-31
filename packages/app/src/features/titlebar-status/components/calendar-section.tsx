import { useEffect, useMemo, useState } from 'react';
import { LuCalendarDays, LuChevronLeft, LuChevronRight } from 'react-icons/lu';

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function CalendarSection() {
  const [today, setToday] = useState(() => new Date());
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const midnight = new Date(today);
    midnight.setHours(24, 0, 0, 0);
    const id = setTimeout(() => setToday(new Date()), midnight.getTime() - today.getTime());
    return () => clearTimeout(id);
  }, [today]);

  const view = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + offset, 1),
    [today, offset],
  );

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-start leading blanks
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    const out: Array<Date | null> = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(new Date(year, month, d));
    }
    return out;
  }, [view]);

  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }),
      ),
    [],
  );

  return (
    <div className="flex flex-col rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <LuCalendarDays className="h-3.5 w-3.5 text-primary" />
          <span>Calendar</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Previous month"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LuChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            aria-label="Next month"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LuChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="mb-2 text-center text-xs font-medium text-foreground">{monthLabel}</p>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
        {weekdays.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
        {cells.map((date, i) => {
          const isToday = date && sameDay(date, today);
          return (
            <span
              key={i}
              className={`flex h-6 items-center justify-center rounded-md text-[11px] tabular-nums transition-colors ${
                isToday
                  ? 'bg-primary font-bold text-primary-foreground shadow-sm'
                  : date
                    ? 'text-foreground hover:bg-accent/50'
                    : ''
              }`}
            >
              {date?.getDate() ?? ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
