import { useEffect, useState } from 'react';

import { LockScreenWidgets } from './lock-screen-widgets';

/**
 * The lock screen's four corners — day and date top-left, the running clock
 * top-right, the finance and system-monitor widgets along the bottom.
 *
 * Extracted from `screensaver.tsx` for the landing page, which keeps exactly
 * this frame around a carousel while only the centre column changes. That is
 * the whole point of the page: the surroundings are constant, so they had to
 * stop being inline JSX belonging to one host.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function LockScreenChrome() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return (
    <>
      <div className="absolute left-8 top-8 z-10 text-left">
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          {DAYS[now.getDay()]}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          {now.getDate()} {MONTHS[now.getMonth()]} {now.getFullYear()}
        </div>
      </div>

      <div className="absolute right-8 top-8 z-10 text-right">
        <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {time}
        </div>
        <div className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Local Time
        </div>
      </div>

      <LockScreenWidgets />
    </>
  );
}
