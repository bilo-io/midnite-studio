// Pure projection maths for the fleet (Phase 150). Money is integer cents; results stay unrounded floats —
// only `formatZar` rounds. No Date, no randomness, no mutation of the input.
import {
  HOURS_PER_MONTH,
  apiTierById,
  hardwareById,
  type FleetProjection,
} from '@midnite/studio-shared';

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
  capexCents: number;
  energyMonthlyCents: number;
  apiMonthlyCents: number;
  opexMonthlyCents: number;
  revenueMonthlyCents: number;
  netMarginMonthlyCents: number; // month 0
  marginPct: number | null;
  paybackMonths: number | null;
  series: FleetMonth[]; // length === horizonMonths
  perNode: Record<string, FleetNodeFigures>; // every node id; disabled -> all 0
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function computeFleetProjection(p: FleetProjection): FleetProjectionResult {
  const { globals, nodes } = p;
  const g = globals.demandGrowthPct / 100;
  const perNode: Record<string, FleetNodeFigures> = {};
  const enabled: { q: number; capex: number; energy: number; api: number; price: number; util: number }[] = [];

  for (const n of nodes) {
    if (!n.enabled) {
      perNode[n.id] = { capex: 0, opex: 0, revenue: 0, net: 0 };
      continue;
    }
    const q = (n.quantity * globals.scalePct) / 100;
    const h = hardwareById(n.hardwareId);
    const t = apiTierById(n.apiTierId);
    const capex = h.priceCents * q;
    const energy = ((h.watts * HOURS_PER_MONTH) / 1000) * globals.electricityRateCents * q;
    const api = t.monthlyCents * q;
    enabled.push({ q, capex, energy, api, price: n.pricePerHourCents, util: n.utilisationPct });
    const revenue0 = (n.pricePerHourCents * HOURS_PER_MONTH * clamp(n.utilisationPct, 0, 100)) / 100 * q;
    perNode[n.id] = { capex, opex: energy + api, revenue: revenue0, net: revenue0 - energy - api };
  }

  let capexCents = 0;
  let energyMonthlyCents = 0;
  let apiMonthlyCents = 0;
  for (const e of enabled) {
    capexCents += e.capex;
    energyMonthlyCents += e.energy;
    apiMonthlyCents += e.api;
  }
  const opexMonthlyCents = energyMonthlyCents + apiMonthlyCents;

  const series: FleetMonth[] = [];
  let cumulative = enabled.length > 0 ? -capexCents : 0;
  let paybackMonths: number | null = null;
  for (let m = 0; m < globals.horizonMonths; m++) {
    let revenue = 0;
    for (const e of enabled) {
      const uPct = clamp(e.util * (1 + g) ** m, 0, 100);
      revenue += (e.price * HOURS_PER_MONTH * uPct) / 100 * e.q;
    }
    const net = revenue - opexMonthlyCents;
    cumulative += net;
    series.push({ month: m, energy: energyMonthlyCents, api: apiMonthlyCents, revenue, net, cumulative });
    if (paybackMonths === null && enabled.length > 0 && cumulative >= 0) paybackMonths = m + 1;
  }

  const revenueMonthlyCents = series[0]?.revenue ?? 0;
  const netMarginMonthlyCents = revenueMonthlyCents - opexMonthlyCents;
  return {
    capexCents,
    energyMonthlyCents,
    apiMonthlyCents,
    opexMonthlyCents,
    revenueMonthlyCents,
    netMarginMonthlyCents,
    marginPct: revenueMonthlyCents > 0 ? (netMarginMonthlyCents / revenueMonthlyCents) * 100 : null,
    paybackMonths,
    series,
    perNode,
  };
}
