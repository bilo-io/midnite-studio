import { useEffect, useState } from 'react';
import { LuGlobe, LuPlus, LuTrash2 } from 'react-icons/lu';

import { useTitlebarStatusStore } from '../titlebar-status-store';
import type { ClockMode, WorldClockZone } from '../titlebar-status-types';
import { AnalogClockFace } from './analog-clock-face';

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function timeIn(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}

function offsetFromUtcMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

function offsetLabel(date: Date, tz: string): string {
  try {
    const rel = offsetFromUtcMinutes(date, tz) + date.getTimezoneOffset();
    if (rel === 0) return 'Same';
    const sign = rel > 0 ? '+' : '−';
    const abs = Math.abs(rel);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m === 0 ? `${sign}${h}h` : `${sign}${h}:${String(m).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export function WorldClocksSection() {
  const [now, setNow] = useState(() => new Date());
  const worldClocksMode = useTitlebarStatusStore((s) => s.worldClocksMode);
  const worldClockZones = useTitlebarStatusStore((s) => s.worldClockZones);
  const setWorldClocksMode = useTitlebarStatusStore((s) => s.setWorldClocksMode);
  const addWorldClockZone = useTitlebarStatusStore((s) => s.addWorldClockZone);
  const removeWorldClockZone = useTitlebarStatusStore((s) => s.removeWorldClockZone);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [tz, setTz] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const valid = label.trim() !== '' && isValidTz(tz.trim());

  const handleAdd = () => {
    if (!valid) return;
    addWorldClockZone({ label: label.trim(), tz: tz.trim() });
    setLabel('');
    setTz('');
    setAdding(false);
  };

  return (
    <div className="flex flex-col rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <LuGlobe className="h-3.5 w-3.5 text-primary" />
          <span>World Clocks</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border border-border/60 p-0.5 text-[10px]">
            {(['digital', 'analogue'] as const).map((m: ClockMode) => (
              <button
                key={m}
                type="button"
                onClick={() => setWorldClocksMode(m)}
                className={`rounded px-1.5 py-0.5 capitalize transition-colors ${
                  worldClocksMode === m
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAdding(!adding)}
            title={adding ? 'Cancel' : 'Add city / timezone'}
            className={`rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
              adding ? 'bg-accent text-accent-foreground' : ''
            }`}
          >
            <LuPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {adding && (
        <div className="mb-3 flex flex-col gap-2 rounded-md border border-border/60 bg-background/50 p-2.5">
          <span className="text-[11px] font-medium text-foreground">Add Timezone</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Paris)"
            className="rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <input
            type="text"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Timezone (e.g. Europe/Paris)"
            className="rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!valid}
              className="rounded bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Add Zone
            </button>
          </div>
        </div>
      )}

      {worldClockZones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-center text-xs text-muted-foreground">
          <p>No world clocks configured.</p>
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto divide-y divide-border/20">
          {worldClockZones.map((zone: WorldClockZone, i: number) => {
            const relOffset = offsetLabel(now, zone.tz);
            return (
              <div
                key={`${zone.tz}-${i}`}
                className="group flex items-center justify-between py-1.5 text-xs transition-colors hover:bg-accent/30 rounded px-1"
              >
                <div className="flex items-center gap-2">
                  {worldClocksMode === 'analogue' ? (
                    <div className="h-6 w-6 shrink-0">
                      <AnalogClockFace date={now} />
                    </div>
                  ) : null}
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{zone.label}</span>
                    <span className="text-[10px] text-muted-foreground">{zone.tz}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {timeIn(now, zone.tz)}
                  </span>
                  {relOffset && (
                    <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {relOffset}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeWorldClockZone(i)}
                    aria-label={`Remove ${zone.label}`}
                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive transition-opacity"
                  >
                    <LuTrash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
