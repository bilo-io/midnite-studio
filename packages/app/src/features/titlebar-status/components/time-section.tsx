import { LuClock } from 'react-icons/lu';

import { useNow } from '../../../lib/use-now';
import { useTitlebarStatusStore } from '../titlebar-status-store';
import type { ClockMode } from '../titlebar-status-types';
import { AnalogClockFace } from './analog-clock-face';

export function TimeSection() {
  const now = useNow();
  const clockMode = useTitlebarStatusStore((s) => s.clockMode);
  const showSeconds = useTitlebarStatusStore((s) => s.showSeconds);
  const setClockMode = useTitlebarStatusStore((s) => s.setClockMode);
  const setShowSeconds = useTitlebarStatusStore((s) => s.setShowSeconds);

  const timeStr = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  });

  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="flex flex-col rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <LuClock className="h-3.5 w-3.5 text-primary" />
          <span>Current Time</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border border-border/60 p-0.5 text-[10px]">
            {(['digital', 'analogue'] as const).map((m: ClockMode) => (
              <button
                key={m}
                type="button"
                onClick={() => setClockMode(m)}
                className={`rounded px-1.5 py-0.5 capitalize transition-colors ${
                  clockMode === m
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {clockMode === 'digital' && (
            <button
              type="button"
              onClick={() => setShowSeconds(!showSeconds)}
              title="Toggle seconds display"
              className={`rounded border border-border/60 px-1.5 py-0.5 text-[10px] transition-colors ${
                showSeconds
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              :ss
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-2">
        {clockMode === 'analogue' ? (
          <div className="h-28 w-28 py-1">
            <AnalogClockFace date={now} />
          </div>
        ) : (
          <span className="font-mono text-3xl font-bold tracking-tight text-foreground tabular-nums">
            {timeStr}
          </span>
        )}
        <span className="mt-1 text-[11px] text-muted-foreground">{tzName} (Local)</span>
      </div>
    </div>
  );
}
