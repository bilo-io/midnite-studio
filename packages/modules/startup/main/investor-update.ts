import {
  addYearMonths,
  BASE_SCENARIO_ID,
  computeFleetProjection,
  formatMoney,
  moneyCurrency,
  seedFleetCatalog,
  type RunwayScenario,
  type StartupLedgerSummary,
  type StartupWorkspace,
} from '@midnite/studio-shared';

import { projectRunway, runwayHeadline, type RunwayHeadline } from './runway';

/**
 * The monthly investor update's data and prompt (Phase 153 Theme D). Everything here is pure: the facts come
 * from the workspace (and, when a book is linked, its summary), every figure is pre-formatted with `formatMoney`
 * so the model copies text and never does arithmetic, and the prompt carries only those facts. The model call
 * itself lives in the service, behind a runner port.
 */

export type UpdateFacts = {
  company: string;
  period: string;
  /** "November 2026". */
  periodLabel: string;
  currency: string;
  /** Cash today and where the figure came from; a linked book wins over the typed opening cash. */
  cash: { amount: string; source: 'book' | 'modelled'; asOf: string };
  /** Modelled burn, the Runway view's "Monthly burn" card: "R 120,000 a month" or "none, net positive". */
  burn: string;
  /** The linked book's actual burn over the last three full months (the view's "Actual burn" card), or `null`. */
  actualBurn: string | null;
  /** The Runway view's runway card: "12 months (cash runs out in 2027-11)" or "cash does not run out within 36 months". */
  runway: string;
  revenue: { thisMonth: string; lastMonth: string };
  /** The base scenario's next three months. */
  next: { month: string; revenue: string; cost: string; net: string; cash: string }[];
  milestones: { done: string[]; inProgress: string[]; dueNext: string[] };
  /** Fleet projections linked to Runway, with the month-0 net each makes. */
  fleet: { name: string; netMonth0: string }[];
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (ym: string): string => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym.slice(5, 7)} ${ym.slice(0, 4)}`;

const BASE: RunwayScenario = { id: BASE_SCENARIO_ID, name: 'Base', costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] };

/**
 * The facts for `period` (`YYYY-MM`) as of `now`. `book` is the linked book's summary, or `null` when there is none
 * (then cash is the typed opening cash). Cash, burn and runway are `headline` — the service passes the one
 * `baseRunwayHeadline` the Runway view and `startup_summary` show; without it the same `runwayHeadline` is taken
 * from `now`'s month. Never throws on an empty workspace: absent parts read as empty lists.
 */
export function gatherUpdateFacts(
  ws: StartupWorkspace,
  period: string,
  now: Date,
  book: StartupLedgerSummary | null = null,
  headline?: RunwayHeadline,
): UpdateFacts {
  const currency = moneyCurrency(ws.company);
  const money = (minor: number): string => formatMoney(minor, currency);
  const scenario = ws.scenarios.find((s) => s.id === BASE_SCENARIO_ID) ?? BASE;
  const openingMinor = book?.cashMinor ?? ws.company?.openingCash.minor ?? 0;
  const next1 = addYearMonths(period, 1);

  // Cash, burn and runway: the headline every surface shows. Last and next months: one pass from the month before.
  const head = headline ?? runwayHeadline({ openingCashMinor: openingMinor, startMonth: now.toISOString().slice(0, 7), lines: ws.lines, scenario });
  const around = projectRunway({ openingCashMinor: head.cashMinor, startMonth: addYearMonths(period, -1), lines: ws.lines, scenario, months: 12 });
  const [last, current, ...ahead] = around.months;

  const burnText = (burn: number): string => (burn > 0 ? `${money(burn)} a month` : 'none, net positive');
  const actualBurnMinor = book?.actualBurnMinor ?? null;

  const titles = (pick: (m: StartupWorkspace['milestones'][number]) => boolean): string[] => ws.milestones.filter(pick).map((m) => m.title);
  const inMonth = (due: string, ym: string): boolean => due.slice(0, 7) === ym;

  const catalog = ws.fleetCatalog ?? seedFleetCatalog(currency);
  const linked = new Set(ws.lines.flatMap((l) => (l.source ? [l.source.projectionId] : [])));

  return {
    company: ws.company?.name ?? 'the company',
    period,
    periodLabel: monthLabel(period),
    currency,
    cash: { amount: money(head.cashMinor), source: book ? 'book' : 'modelled', asOf: book?.asOf ?? ws.company?.openingCash.asOf ?? period },
    burn: burnText(-head.burnMinor),
    actualBurn: actualBurnMinor === null ? null : burnText(actualBurnMinor),
    runway:
      head.runwayMonths === null
        ? `cash does not run out within ${head.horizonMonths} months`
        : `${head.runwayMonths} ${head.runwayMonths === 1 ? 'month' : 'months'} (cash runs out in ${head.zeroCashMonth})`,
    revenue: { thisMonth: money(current?.revenueMinor ?? 0), lastMonth: money(last?.revenueMinor ?? 0) },
    next: ahead.slice(0, 3).map((m) => ({ month: monthLabel(m.month), revenue: money(m.revenueMinor), cost: money(m.costMinor), net: money(m.netMinor), cash: money(m.cashMinor) })),
    milestones: {
      done: titles((m) => m.status === 'done' && inMonth(m.due, period)),
      inProgress: titles((m) => m.status === 'in-progress'),
      dueNext: titles((m) => (m.status === 'planned' || m.status === 'in-progress') && inMonth(m.due, next1)),
    },
    fleet: ws.fleetProjections
      .filter((p) => linked.has(p.id))
      .map((p) => ({ name: p.name, netMonth0: money(Math.round(computeFleetProjection(p, catalog).netMarginMonthlyMinor)) })),
  };
}

export const UPDATE_SECTIONS = ['## Highlights', '## Metrics', '## Milestones', '## Next month', '## Asks'] as const;

const list = (items: readonly string[]): string => (items.length === 0 ? 'none' : items.join('; '));

/** One fact per line; the prompt embeds exactly these lines. */
export function factLines(f: UpdateFacts): string[] {
  return [
    `Company: ${f.company}`,
    `Period: ${f.periodLabel}`,
    `Cash: ${f.cash.amount} (${f.cash.source === 'book' ? 'from the books' : 'modelled from the plan'}, as of ${f.cash.asOf})`,
    `Monthly burn: ${f.burn} (modelled, mean net of this month and the next two)`,
    ...(f.actualBurn === null ? [] : [`Actual burn: ${f.actualBurn} (from the books, mean of the last 3 full months)`]),
    `Runway: ${f.runway}`,
    `Revenue this month: ${f.revenue.thisMonth}`,
    `Revenue last month: ${f.revenue.lastMonth}`,
    ...f.next.map((n) => `Base scenario ${n.month}: revenue ${n.revenue}, costs ${n.cost}, net ${n.net}, closing cash ${n.cash}`),
    `Milestones done this month: ${list(f.milestones.done)}`,
    `Milestones in progress: ${list(f.milestones.inProgress)}`,
    `Milestones due next month: ${list(f.milestones.dueNext)}`,
    ...f.fleet.map((p) => `Fleet projection "${p.name}" (linked to Runway): month-0 net ${p.netMonth0} a month`),
  ];
}

/**
 * The model's instructions. The facts are the only numbers it may use; the sections and word cap are fixed;
 * the previous update (if any) is for tone, never for figures.
 */
export function buildInvestorUpdatePrompt(facts: UpdateFacts, notes: string, previous?: string): string {
  const trimmedNotes = notes.trim();
  return [
    `You are writing the monthly investor update for ${facts.company}, covering ${facts.periodLabel}.`,
    '',
    'Rules:',
    '- Use only the facts below. Do not invent, estimate or round any number, name or event.',
    '- Write Markdown only, no preamble, and keep it to 400 words or fewer.',
    `- Use exactly these sections, in this order: ${UPDATE_SECTIONS.join(', ')}.`,
    '- Under "## Asks", ask only for what the notes mention; if they mention nothing, say there are no asks this month.',
    '',
    'Facts:',
    ...factLines(facts).map((l) => `- ${l}`),
    ...(trimmedNotes === '' ? [] : ['', "The founder's notes (also fair to use):", trimmedNotes]),
    ...(previous !== undefined && previous.trim() !== ''
      ? ['', "Last month's update, for tone and structure only. Do not reuse its numbers:", '---', previous.trim(), '---']
      : []),
  ].join('\n');
}

/** Unwraps an outer ```markdown fence (as doc-edit does) and trims. */
export function cleanInvestorUpdate(raw: string): string {
  const text = raw.trim();
  const fenced = /^```(?:markdown|md)?[^\S\n]*\n([\s\S]*?)\n?```$/i.exec(text);
  return (fenced ? fenced[1]! : text).trim();
}
