// Phase 152 D: a fleet projection as Runway plan lines. Pure; ids and the clock are passed in so a test pins them.
import { computeFleetProjection } from './startup-fleet-model';
import type { FleetCatalog, FleetProjection } from './startup-fleet';
import type { PlanLine } from './startup';

const ordinal = (ym: string): number => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
};
/** `YYYY-MM` shifted by `by` months. */
export function addYearMonths(ym: string, by: number): string {
  const o = ordinal(ym) + by;
  return `${Math.floor(o / 12)}-${String((o % 12) + 1).padStart(2, '0')}`;
}

const clampBp = (bp: number): number => Math.max(-10000, Math.min(10000, Math.round(bp)));

/**
 * The first month at which every enabled, non-idle node has reached 100 % utilisation, or `null` when demand does
 * not grow or the cap is not reached inside the horizon. Runway's growth compounds without a ceiling, so a
 * projection that caps becomes two lines: growing until this month, flat after it.
 */
function capMonth(p: FleetProjection): number | null {
  const g = p.globals.demandGrowthPct / 100;
  if (g <= 0) return null;
  const live = p.nodes.filter((n) => n.enabled && n.utilisationPct > 0);
  if (live.length === 0) return null;
  let c = 0;
  for (const n of live) {
    let m = 0;
    while (n.utilisationPct * (1 + g) ** m < 100 && m <= p.globals.horizonMonths) m++;
    c = Math.max(c, m);
  }
  return c < p.globals.horizonMonths ? c : null;
}

export function fleetToRunwayLines(
  p: FleetProjection,
  catalog: FleetCatalog,
  start: string,
  now: string,
  ids: () => string,
): PlanLine[] {
  const r = computeFleetProjection(p, catalog);
  const src = (part: NonNullable<PlanLine['source']>['part']) => ({ kind: 'fleetProjection' as const, projectionId: p.id, part, syncedAt: now });
  const line = (
    part: NonNullable<PlanLine['source']>['part'],
    kind: PlanLine['kind'],
    name: string,
    category: PlanLine['category'],
    cadence: PlanLine['cadence'],
    minor: number,
    from: string,
    extra: { end?: string; growthBpPerMonth?: number } = {},
  ): PlanLine => ({
    id: ids(),
    kind,
    name,
    category,
    minor: Math.max(0, Math.round(minor)),
    cadence,
    start: from,
    ...(extra.end !== undefined ? { end: extra.end } : {}),
    growthBpPerMonth: extra.growthBpPerMonth ?? 0,
    source: src(part),
  });

  const out: PlanLine[] = [];
  const name = p.name.slice(0, 80 - ' — running costs (at capacity)'.length);
  out.push(line('capex', 'cost', `${name} — hardware`, 'hardware', 'one-off', r.capexMinor, start));

  const c = capMonth(p);
  const opex = (m: number): number => (r.series[m]?.energy ?? 0) + (r.series[m]?.api ?? 0);
  const rev = (m: number): number => r.series[m]?.revenue ?? 0;
  const g = p.globals.demandGrowthPct * 100;
  /** The growth that carries month 0 to month `last` of a segment, compounding monthly. */
  const fitted = (f: (m: number) => number, last: number): number =>
    last < 1 || f(0) <= 0 ? 0 : clampBp(((f(last) / f(0)) ** (1 / last) - 1) * 10000);

  // OpEx only moves when energy follows utilisation; otherwise it is flat.
  const opexGrows = p.globals.energyScalesWithUtilisation && g !== 0;
  if (Math.round(opex(0)) > 0) {
    if (opexGrows && c !== null) {
      out.push(line('opex', 'cost', `${name} — running costs`, 'other', 'monthly', opex(0), start, { end: addYearMonths(start, c - 1), growthBpPerMonth: fitted(opex, c - 1) }));
      if (Math.round(opex(c)) > 0) out.push(line('opex', 'cost', `${name} — running costs (at capacity)`, 'other', 'monthly', opex(c), addYearMonths(start, c)));
    } else {
      out.push(line('opex', 'cost', `${name} — running costs`, 'other', 'monthly', opex(0), start, { growthBpPerMonth: opexGrows ? fitted(opex, r.series.length - 1) : 0 }));
    }
  }

  if (Math.round(rev(0)) > 0) {
    if (c !== null) {
      out.push(line('revenue', 'revenue', `${name} — revenue`, 'revenue', 'monthly', rev(0), start, { end: addYearMonths(start, c - 1), growthBpPerMonth: g }));
      if (Math.round(rev(c)) > 0) out.push(line('revenue-capped', 'revenue', `${name} — revenue (at capacity)`, 'revenue', 'monthly', rev(c), addYearMonths(start, c)));
    } else {
      out.push(line('revenue', 'revenue', `${name} — revenue`, 'revenue', 'monthly', rev(0), start, { growthBpPerMonth: g }));
    }
  }
  return out;
}
