import { useMemo, useState } from 'react';
import { LuChartArea, LuSend } from 'react-icons/lu';

import type { FleetProjection, PlanLine } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';
import { fleetToRunwayLines } from './fleet-runway';
import { formatMoney } from './format-money';
import { useMoney } from './money-context';
import { ALERT } from './styles';
import { isStale, linkedLines, nextMonth, oldestSync } from './runway-link';

const FIELD = 'h-8 rounded-md border border-border bg-background px-2 text-sm';

const CADENCE: Record<PlanLine['cadence'], string> = { monthly: '/mo', quarterly: '/qtr', yearly: '/yr', 'one-off': ' once' };

/** The plan lines a send would write, previewed with the same pure function main writes with. */
function Preview({ projection, start }: { projection: FleetProjection; start: string }) {
  const { currency, catalog } = useMoney();
  const lines = useMemo(() => {
    let n = 0;
    return fleetToRunwayLines(projection, catalog, start, projection.updatedAt, () => String(n++));
  }, [projection, catalog, start]);
  return (
    <ul aria-label="Lines to write" className="flex flex-col gap-1 text-sm">
      {lines.map((l) => (
        <li key={l.id} className="flex items-baseline justify-between gap-3">
          <span>{l.name}</span>
          <span className={`tabular-nums ${l.kind === 'revenue' ? 'text-success' : ''}`}>
            {l.kind === 'revenue' ? '+' : '-'}
            {formatMoney(l.minor, currency)}
            {CADENCE[l.cadence]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The results header's Runway control: Send / Update button, the link status and the Stale pill, and the dialog
 * that picks the start month. Self-contained so the header's other buttons never touch it.
 */
export function SendToRunway({ projection, lines, hasCompany, readOnly }: { projection: FleetProjection; lines: readonly PlanLine[]; hasCompany: boolean; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(nextMonth);
  const [problem, setProblem] = useState<string | null>(null);
  const send = useStartupWrite((bridge, args: { projectionId: string; start: string }) => bridge.sendFleetProjectionToRunway(args));
  const linked = linkedLines(lines, projection.id);
  const synced = oldestSync(linked);
  const stale = isStale(projection, linked);
  const reason = readOnly ? 'This workspace is read-only.' : !hasCompany ? 'Set up your company first' : undefined;

  function confirm(): void {
    setProblem(null);
    send.mutate({ projectionId: projection.id, start }, { onSuccess: () => setOpen(false), onError: (e) => setProblem(e.message) });
  }

  return (
    <div className="ml-auto flex items-center gap-2 text-xs">
      {linked.length > 0 ? (
        stale ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-500">Stale</span>
        ) : (
          <span className="text-muted-foreground">Linked to Runway · synced {synced?.slice(0, 10)}</span>
        )
      ) : null}
      <button
        type="button"
        disabled={reason !== undefined}
        title={reason}
        onClick={() => {
          setStart(linked[0]?.start ?? nextMonth());
          setProblem(null);
          setOpen(true);
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50"
      >
        <LuSend aria-hidden /> {linked.length > 0 ? 'Update Runway' : 'Send to Runway'}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div role="dialog" aria-modal="true" aria-label="Send to Runway" className="flex w-[28rem] max-w-[90vw] flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-xl">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <LuChartArea aria-hidden /> {linked.length > 0 ? 'Update Runway' : 'Send to Runway'}
            </h2>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Start month
              <input className={FIELD} type="month" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <Preview projection={projection} start={start} />
            {linked.length > 0 ? <p className="text-xs text-muted-foreground">This replaces the {linked.length} {linked.length === 1 ? 'line' : 'lines'} already linked to this projection.</p> : null}
            {problem !== null ? (
              <p role="alert" className={ALERT}>
                {problem}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-md border border-border px-3 text-sm">
                Cancel
              </button>
              <button type="button" disabled={send.isPending || !/^\d{4}-\d{2}$/.test(start)} onClick={confirm} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
                {linked.length > 0 ? 'Update lines' : 'Send lines'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
