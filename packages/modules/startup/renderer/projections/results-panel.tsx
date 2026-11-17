import { Suspense, lazy } from 'react';

import { Skeleton } from '@midnite/studio-frame';
import type { FleetProjection } from '@midnite/studio-shared';

import type { FleetProjectionResult } from './fleet-model';
import { formatMoney } from './format-money';
import { useMoney } from './money-context';
import { NodeCard } from './node-card';
import { ALERT, GRADIENT_BORDER, LABEL, PANE } from './styles';

// Recharts is the heavy part of this view; it loads only once a projection is on screen.
const FleetChart = lazy(() => import('./fleet-chart'));

export type ResultsProps = {
  draft: FleetProjection;
  result: FleetProjectionResult;
  update: (fn: (p: FleetProjection) => FleetProjection) => void;
  pending: boolean;
  problem: string | null;
  readOnly: boolean;
};

function Tile({ label, value, tone, big }: { label: string; value: string; tone?: 'good' | 'bad'; big?: boolean }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-col gap-1 p-3 ${big ? `rounded-xl ${GRADIENT_BORDER}` : PANE}`}>
      <span className={LABEL}>{label}</span>
      <span className={`${big ? 'text-3xl' : 'text-2xl'} font-semibold tabular-nums ${tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-destructive' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

/** The centre pane: headline figures, the chart and one card per node. */
export function ResultsPanel({ draft, result, update, pending, problem, readOnly }: ResultsProps) {
  const { currency } = useMoney();
  const net = result.netMarginMonthlyMinor;
  const payback = result.paybackMonths === null ? `Not within ${draft.globals.horizonMonths} mo` : `${result.paybackMonths} mo`;
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">{draft.name}</h2>
        {pending ? <span className="text-xs text-muted-foreground">Saving…</span> : null}
      </header>
      {problem !== null ? (
        <p role="alert" className={ALERT}>
          {problem}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Tile label="CapEx" value={formatMoney(result.capexMinor, currency)} />
        <Tile label="OpEx /mo" value={formatMoney(result.opexMonthlyMinor, currency)} />
        <Tile label="Revenue /mo" value={formatMoney(result.revenueMonthlyMinor, currency)} />
        <Tile big label="Net margin /mo" value={formatMoney(net, currency)} tone={net >= 0 ? 'good' : 'bad'} />
        <Tile label="Margin %" value={result.marginPct === null ? '—' : `${result.marginPct.toFixed(1)} %`} />
        <Tile label="Payback" value={payback} />
      </div>
      <div className={`p-3 ${PANE}`}>
        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <FleetChart result={result} horizon={draft.globals.horizonMonths} />
        </Suspense>
      </div>
      {draft.nodes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No nodes yet. Use Spawn node to add one from the template.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {draft.nodes.map((n) => (
            <NodeCard key={n.id} node={n} template={draft.template} figures={result.perNode[n.id]} update={update} readOnly={readOnly} />
          ))}
        </div>
      )}
    </div>
  );
}
