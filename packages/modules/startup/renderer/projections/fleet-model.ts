// Pure projection maths for the fleet (Phase 150). Money is integer minor units; results stay unrounded floats —
// only `formatMoney` rounds. No Date, no randomness, no mutation of the input.
import { HOURS_PER_MONTH, type FleetCatalog, type FleetProjection } from '@midnite/studio-shared';

export type FleetMonth = {
  month: number;
  energy: number;
  api: number;
  revenue: number;
  net: number;
  cumulative: number;
};
export type FleetNodeFigures = { capex: number; opex: number; revenue: number; net: number }; // month 0
export type FleetProjectionResult = {
  capexMinor: number;
  energyMonthlyMinor: number;
  apiMonthlyMinor: number;
  opexMonthlyMinor: number;
  revenueMonthlyMinor: number;
  netMarginMonthlyMinor: number; // month 0
  marginPct: number | null;
  paybackMonths: number | null;
  series: FleetMonth[]; // length === horizonMonths
  perNode: Record<string, FleetNodeFigures>; // every node id; disabled -> all 0
  missing: string[]; // node ids whose hardware or API tier is not in the catalog (priced at 0)
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function computeFleetProjection(p: FleetProjection, catalog: FleetCatalog): FleetProjectionResult {
  const { globals, nodes } = p;
  const g = globals.demandGrowthPct / 100;
  const perNode: Record<string, FleetNodeFigures> = {};
  const missing: string[] = [];
  const scaleEnergy = globals.energyScalesWithUtilisation;
  // Energy at full draw per node-month; with the switch on it follows utilisation (70 % busy draws 0.7 of it).
  const enabled: { q: number; capex: number; energyFull: number; api: number; price: number; util: number }[] = [];

  for (const n of nodes) {
    if (!n.enabled) {
      perNode[n.id] = { capex: 0, opex: 0, revenue: 0, net: 0 };
      continue;
    }
    const q = (n.quantity * globals.scalePct) / 100;
    const h = catalog.hardware.find((x) => x.id === n.hardwareId);
    const t = catalog.apiTiers.find((x) => x.id === n.apiTierId);
    if (h === undefined || t === undefined) missing.push(n.id);
    const capex = (h?.priceMinor ?? 0) * q;
    const energyFull = (((h?.watts ?? 0) * HOURS_PER_MONTH) / 1000) * globals.electricityRateMinor * q;
    const api = (t?.monthlyMinor ?? 0) * q;
    enabled.push({ q, capex, energyFull, api, price: n.pricePerHourMinor, util: n.utilisationPct });
    const energy = scaleEnergy ? (energyFull * clamp(n.utilisationPct, 0, 100)) / 100 : energyFull;
    const revenue0 = (n.pricePerHourMinor * HOURS_PER_MONTH * clamp(n.utilisationPct, 0, 100)) / 100 * q;
    perNode[n.id] = { capex, opex: energy + api, revenue: revenue0, net: revenue0 - energy - api };
  }

  const grown = (util: number, m: number) => clamp(util * (1 + g) ** m, 0, 100);
  let capexMinor = 0;
  let apiMonthlyMinor = 0;
  for (const e of enabled) {
    capexMinor += e.capex;
    apiMonthlyMinor += e.api;
  }

  const series: FleetMonth[] = [];
  let cumulative = enabled.length > 0 ? -capexMinor : 0;
  let paybackMonths: number | null = null;
  for (let m = 0; m < globals.horizonMonths; m++) {
    let revenue = 0;
    let energy = 0;
    for (const e of enabled) {
      const uPct = grown(e.util, m);
      revenue += (e.price * HOURS_PER_MONTH * uPct) / 100 * e.q;
      energy += scaleEnergy ? (e.energyFull * uPct) / 100 : e.energyFull;
    }
    const net = revenue - energy - apiMonthlyMinor;
    cumulative += net;
    series.push({ month: m, energy, api: apiMonthlyMinor, revenue, net, cumulative });
    if (paybackMonths === null && enabled.length > 0 && cumulative >= 0) paybackMonths = m + 1;
  }

  // Month 0 figures: the headline tiles describe today, not the end of the horizon.
  const revenueMonthlyMinor = series[0]?.revenue ?? 0;
  const energyMonthlyMinor = series[0]?.energy ?? 0;
  const opexMonthlyMinor = energyMonthlyMinor + apiMonthlyMinor;
  const netMarginMonthlyMinor = revenueMonthlyMinor - opexMonthlyMinor;
  return {
    capexMinor,
    energyMonthlyMinor,
    apiMonthlyMinor,
    opexMonthlyMinor,
    revenueMonthlyMinor,
    netMarginMonthlyMinor,
    marginPct: revenueMonthlyMinor > 0 ? (netMarginMonthlyMinor / revenueMonthlyMinor) * 100 : null,
    paybackMonths,
    series,
    perNode,
    missing,
  };
}
