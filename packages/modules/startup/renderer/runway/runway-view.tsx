import { useState } from 'react';

import { BASE_SCENARIO_ID, MAX_SCENARIOS, type CompanyProfile, type PlanLine, type RunwayScenario } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';
import { LineSheet } from './line-sheet';
import { HORIZONS, chartPoints, formatMinor, runwayLabel, type Horizon, type RunwayProjectionView } from './runway-types';
import { useProjection } from './use-projection';
import { useLedgerSummary } from '../ledger/use-summary';

const CHART_W = 600;
const CHART_H = 160;

function Card({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-0.5 rounded-md border border-border p-3">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${tone ?? ''}`}>{value}</span>
      {hint !== undefined ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** One inline-SVG polyline of closing cash per month, the zero line marked; no chart dependency. */
function CashChart({ projection }: { projection: RunwayProjectionView }) {
  const cash = projection.months.map((m) => m.cashMinor);
  const min = Math.min(0, ...cash);
  const max = Math.max(0, ...cash);
  const zeroY = CHART_H - ((0 - min) / (max - min || 1)) * CHART_H;
  return (
    <svg role="img" aria-label="Cash by month" viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-40 w-full" preserveAspectRatio="none">
      <line x1="0" x2={CHART_W} y1={zeroY} y2={zeroY} strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" className="stroke-red-500/60" data-testid="zero-line" />
      <polyline points={chartPoints(cash, min, max, CHART_W, CHART_H)} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className="stroke-violet-500" />
    </svg>
  );
}

function ScenarioTools({ scenario }: { scenario: RunwayScenario }) {
  const save = useStartupWrite((bridge, next: RunwayScenario) => bridge.upsertScenario({ scenario: next }));
  const pct = (bp: number): string => String(bp / 100);
  const set = (field: 'costMultiplierBp' | 'revenueMultiplierBp', text: string): void => {
    const value = Number(text);
    if (Number.isFinite(value) && value >= 0 && value <= 1000) save.mutate({ ...scenario, [field]: Math.round(value * 100) });
  };
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-1">
        Costs (% of plan)
        <input aria-label="Costs percent" className="h-7 w-16 rounded border border-border bg-background px-1 text-foreground" defaultValue={pct(scenario.costMultiplierBp)} onBlur={(e) => set('costMultiplierBp', e.target.value)} />
      </label>
      <label className="flex items-center gap-1">
        Revenue (% of plan)
        <input aria-label="Revenue percent" className="h-7 w-16 rounded border border-border bg-background px-1 text-foreground" defaultValue={pct(scenario.revenueMultiplierBp)} onBlur={(e) => set('revenueMultiplierBp', e.target.value)} />
      </label>
    </div>
  );
}

/** Costs and runway: the lines table, scenario tabs (Base plus at most two), a horizon, headline cards and the cash chart. */
export function RunwayView({ company, lines, scenarios, linked = false }: { company: CompanyProfile; lines: readonly PlanLine[]; scenarios: readonly RunwayScenario[]; linked?: boolean }) {
  const [scenarioId, setScenarioId] = useState(BASE_SCENARIO_ID);
  const [horizon, setHorizon] = useState<Horizon>(36);
  const [sheet, setSheet] = useState<{ line: PlanLine | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const addScenario = useStartupWrite((bridge, next: RunwayScenario) => bridge.upsertScenario({ scenario: next }));
  const removeScenario = useStartupWrite((bridge, id: string) => bridge.removeScenario({ id }));
  const others = scenarios.filter((s) => s.id !== BASE_SCENARIO_ID);
  const active = others.find((s) => s.id === scenarioId) ?? null;
  const activeId = active?.id ?? BASE_SCENARIO_ID;
  const projection = useProjection(activeId, horizon);
  const money = (minor: number): string => formatMinor(minor, company.currency);
  const data = projection.data;
  const book = useLedgerSummary(linked).data ?? null;

  function newScenario(): void {
    const next: RunwayScenario = { id: crypto.randomUUID(), name: `Scenario ${others.length + 1}`, costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] };
    addScenario.mutate(next, { onSuccess: () => setScenarioId(next.id), onError: (e) => setProblem(e.message) });
  }

  return (
    <main className="flex h-full min-h-0" aria-label="Runway">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Runway</h1>
          <label className="ml-4 flex items-center gap-1 text-xs text-muted-foreground">
            Horizon
            <select aria-label="Horizon" className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground" value={horizon} onChange={(e) => setHorizon(Number(e.target.value) as Horizon)}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h} months
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setSheet({ line: null })} className="ml-auto h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Add line
          </button>
        </div>

        <div role="tablist" aria-label="Scenarios" className="flex items-center gap-1 text-sm">
          {[{ id: BASE_SCENARIO_ID, name: 'Base' }, ...others].map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={activeId === s.id} onClick={() => setScenarioId(s.id)} className={`rounded-md px-3 py-1 ${activeId === s.id ? 'bg-accent' : 'text-muted-foreground'}`}>
              {s.name}
            </button>
          ))}
          {others.length + 1 < MAX_SCENARIOS ? (
            <button type="button" onClick={newScenario} className="rounded-md px-2 py-1 text-muted-foreground">
              Add scenario
            </button>
          ) : null}
          {active !== null ? (
            <button type="button" onClick={() => removeScenario.mutate(active.id, { onSuccess: () => setScenarioId(BASE_SCENARIO_ID), onError: (e) => setProblem(e.message) })} className="ml-auto text-xs text-red-500">
              Remove scenario
            </button>
          ) : null}
        </div>
        {active !== null ? <ScenarioTools key={active.id} scenario={active} /> : null}
        {problem !== null ? (
          <p role="alert" className="text-xs text-red-500">
            {problem}
          </p>
        ) : null}

        {lines.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-8">
            <p className="text-sm font-medium">Add your first cost</p>
            <p className="text-xs text-muted-foreground">Costs and revenue with a cadence make up the projection.</p>
          </div>
        ) : null}

        {data !== undefined ? (
          <>
            <div className="flex flex-wrap gap-3">
              <Card label="Cash today" value={money(book?.cashMinor ?? company.openingCash.minor)} {...(book !== null ? { hint: `From ${book.bookName}` } : {})} />
              <Card label="Monthly burn" value={money(data.burnMinor)} tone={data.burnMinor < 0 ? 'text-red-500' : 'text-emerald-500'} />
              <Card label="Runway" value={runwayLabel(data.runwayMonths, horizon)} />
              <Card label="Zero cash" value={data.zeroCashMonth ?? 'Not in horizon'} />
              <Card label="Outlook" value={data.defaultAlive ? 'Default alive' : 'Default dead'} tone={data.defaultAlive ? 'text-emerald-500' : 'text-red-500'} />
              {book?.actualBurnMinor !== null && book !== null ? (
                <Card
                  label="Actual burn"
                  value={`${money(book.actualBurnMinor ?? 0)} / month`}
                  hint={`Modelled ${money(-data.burnMinor)}, ${(book.actualBurnMinor ?? 0) + data.burnMinor >= 0 ? '+' : '-'}${money(Math.abs((book.actualBurnMinor ?? 0) + data.burnMinor))} from plan`}
                />
              ) : null}
            </div>
            <CashChart projection={data} />
          </>
        ) : projection.isError ? (
          <p role="alert" className="text-xs text-red-500">
            {projection.error.message}
          </p>
        ) : null}
        {!linked ? <p className="text-xs text-muted-foreground">Link a book to use actuals.</p> : null}

        {lines.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Name</th>
                <th className="font-medium">Category</th>
                <th className="font-medium">Cadence</th>
                <th className="text-right font-medium">Amount</th>
                <th className="font-medium">From</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="cursor-pointer border-t border-border hover:bg-accent/40" onClick={() => setSheet({ line: l })}>
                  <td className="py-1.5">{l.name}</td>
                  <td>{l.category}</td>
                  <td>{l.cadence}</td>
                  <td className={`text-right ${l.kind === 'revenue' ? 'text-emerald-500' : ''}`}>
                    {l.kind === 'revenue' ? '+' : '-'}
                    {money(l.minor)}
                  </td>
                  <td>{l.start}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      {sheet !== null ? <LineSheet key={sheet.line?.id ?? 'new'} line={sheet.line} currency={company.currency} onClose={() => setSheet(null)} /> : null}
    </main>
  );
}
