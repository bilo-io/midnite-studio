import type { ScopedDispatch } from '@midnite/studio-runtime';
import {
  BASE_SCENARIO_ID,
  computeFleetProjection,
  isStartupMcpToolId,
  MCP_TOOLS,
  minorExponent,
  moneyCurrency,
  STARTUP_AGENTS_OFF_MESSAGE,
  STARTUP_MCP_WRITE_TOOL_IDS,
  type FleetCatalog,
  type FleetProjection,
  type StartupAgentConsent,
  type StartupMcpToolId,
  type StartupMoney,
  type StartupRequest,
  type StartupResult,
  type StartupSnapshot,
  seedFleetCatalog,
} from '@midnite/studio-shared';

import type { RunwayProjection } from './runway';
import { handleStartupRequest, type StartupServiceDeps } from './service';
import type { WorkspaceStore } from './workspace-store';

/**
 * Startup's `startup_*` MCP tools over the module's own ops (Phase 153 Theme C). Every tool is a thin mapping onto
 * `handleStartupRequest`, so an agent's read and write run the code the UI runs — the same integrity checks, the
 * same one-at-a-time write queue (`store.mutate`) — and a write shows in an open window through the store's
 * `onChanged` event. Consent is read per call (`consent()`), so a switch takes effect without a restart; a hidden
 * tool is refused, not just unlisted.
 */

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', ZAR: 'R ', JPY: '¥' };
const group = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Minor units, the currency and a printed form: an agent never has to guess the exponent. */
export function mcpMoney(minor: number, currency: string): StartupMoney {
  const rounded = Math.round(minor);
  const unit = 10 ** minorExponent(currency);
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / unit);
  const frac = unit > 1 ? `.${String(abs % unit).padStart(String(unit).length - 1, '0')}` : '';
  const sign = rounded < 0 ? '-' : '';
  return { minor: rounded, currency, formatted: `${sign}${SYMBOLS[currency] ?? `${currency} `}${group(whole)}${frac}` };
}

type DispatchResult = Awaited<ReturnType<ScopedDispatch>>;
const fail = (kind: 'error' | 'not-found' | 'refused', message: string): DispatchResult => ({ ok: false, kind, message });

/** How a refusal from the ops reads to an agent: a locked or newer-version workspace is a refusal, a missing record is not-found. */
function fromRefusal(r: Extract<StartupResult<unknown>, { ok: false }>): DispatchResult {
  if (r.kind === 'not-found') return fail('not-found', r.message);
  if (r.kind === 'newer-version' || r.kind === 'locked') return fail('refused', r.message);
  return fail('error', r.message);
}

const snapshotOf = (r: StartupResult<unknown>): StartupSnapshot => (r as { ok: true; value: StartupSnapshot }).value;

function month0(projection: FleetProjection, catalog: FleetCatalog, currency: string) {
  const result = computeFleetProjection(projection, catalog);
  return {
    result,
    figures: {
      capex: mcpMoney(result.capexMinor, currency),
      opexMonthly: mcpMoney(result.opexMonthlyMinor, currency),
      revenueMonthly: mcpMoney(result.revenueMonthlyMinor, currency),
      netMarginMonthly: mcpMoney(result.netMarginMonthlyMinor, currency),
      paybackMonths: result.paybackMonths,
    },
  };
}

export function startupMcpDispatch(
  storeOrPromise: WorkspaceStore | Promise<WorkspaceStore>,
  deps: StartupServiceDeps,
  consent: () => StartupAgentConsent,
): ScopedDispatch {
  const ops = async (store: WorkspaceStore, request: StartupRequest) => handleStartupRequest(store, request, deps);

  async function runway(store: WorkspaceStore, scenarioId: string, months: 12 | 24 | 36): Promise<StartupResult<RunwayProjection>> {
    return (await ops(store, { op: 'projection', scenarioId, months })) as StartupResult<RunwayProjection>;
  }

  async function read(store: WorkspaceStore, tool: StartupMcpToolId, input: Record<string, unknown>): Promise<DispatchResult> {
    // `get` seeds the catalog once and answers the snapshot, so every read below sees a catalog.
    const got = await ops(store, { op: 'get' });
    if (!got.ok) return fromRefusal(got);
    const ws = snapshotOf(got).workspace;
    const currency = moneyCurrency(ws.company);
    const catalog = ws.fleetCatalog ?? seedFleetCatalog(currency);

    switch (tool) {
      case 'startup_summary': {
        const counts = {
          milestones: ws.milestones.length,
          projections: ws.fleetProjections.length,
          scenarios: ws.scenarios.length,
          customers: ws.customers.length,
          invoices: ws.invoices.length,
          vendors: ws.vendors.length,
          contracts: ws.contracts.length,
        };
        const base = { currency, counts, readOnly: snapshotOf(got).readOnly };
        if (ws.company === null) return { ok: true, value: { ...base, company: null, cash: null, burn: null, runwayMonths: null, defaultAlive: null } };
        const r = await runway(store, BASE_SCENARIO_ID, 12);
        if (!r.ok) return fromRefusal(r);
        const first = r.value.months[0];
        // Opening cash is the first month's closing cash less that month's net — the ledger's cash today when a book is linked.
        const cash = first ? mcpMoney(first.cashMinor - first.netMinor, currency) : mcpMoney(ws.company.openingCash.minor, currency);
        return {
          ok: true,
          value: { ...base, company: { name: ws.company.name }, cash, burn: mcpMoney(r.value.burnMinor, currency), runwayMonths: r.value.runwayMonths, defaultAlive: r.value.defaultAlive },
        };
      }
      case 'startup_runway': {
        const scenarioId = typeof input['scenarioId'] === 'string' ? input['scenarioId'] : BASE_SCENARIO_ID;
        const months = (input['months'] ?? 12) as 12 | 24 | 36;
        const r = await runway(store, scenarioId, months);
        if (!r.ok) return fromRefusal(r);
        const p = r.value;
        return {
          ok: true,
          value: {
            currency,
            scenarioId,
            months: p.months.map((m) => ({
              month: m.month,
              revenue: mcpMoney(m.revenueMinor, currency),
              cost: mcpMoney(m.costMinor, currency),
              net: mcpMoney(m.netMinor, currency),
              cash: mcpMoney(m.cashMinor, currency),
            })),
            burn: mcpMoney(p.burnMinor, currency),
            runwayMonths: p.runwayMonths,
            zeroCashMonth: p.zeroCashMonth,
            defaultAlive: p.defaultAlive,
          },
        };
      }
      case 'startup_milestones': {
        const status = input['status'];
        return { ok: true, value: { milestones: ws.milestones.filter((m) => status === undefined || m.status === status) } };
      }
      case 'startup_projections':
        return {
          ok: true,
          value: {
            currency,
            projections: ws.fleetProjections.map((p) => ({
              id: p.id,
              name: p.name,
              updatedAt: p.updatedAt,
              nodes: p.nodes.length,
              horizonMonths: p.globals.horizonMonths,
              month0: month0(p, catalog, currency).figures,
            })),
          },
        };
      case 'startup_projection': {
        const p = ws.fleetProjections.find((x) => x.id === input['id']);
        if (!p) return fail('not-found', 'That projection does not exist.');
        const { result, figures } = month0(p, catalog, currency);
        return {
          ok: true,
          value: {
            currency,
            projection: p,
            month0: figures,
            series: result.series.map((s) => ({
              month: s.month,
              revenueMinor: Math.round(s.revenue),
              costMinor: Math.round(s.energy + s.api),
              netMinor: Math.round(s.net),
              cumulativeMinor: Math.round(s.cumulative),
            })),
            missing: result.missing,
          },
        };
      }
      default:
        return fail('not-found', `Unknown tool: "${tool}"`);
    }
  }

  async function write(store: WorkspaceStore, tool: StartupMcpToolId, input: Record<string, unknown>): Promise<DispatchResult> {
    let request: StartupRequest;
    if (tool === 'startup_upsert_milestone') request = { op: 'upsertMilestone', milestone: input as never };
    else if (tool === 'startup_upsert_projection') request = { op: 'upsertFleetProjection', projection: input as never };
    else request = { op: 'sendFleetProjectionToRunway', projectionId: input['projectionId'] as string, start: input['start'] as string };
    const r = await ops(store, request);
    if (!r.ok) return fromRefusal(r);
    // The op's own answer rides along (the send op's, once it lands); the snapshots every upsert answers are not repeated.
    const detail = tool === 'startup_send_projection_to_runway' ? r.value : undefined;
    return { ok: true, value: { revision: store.snapshot().revision, ...(detail !== undefined ? { detail } : {}) } };
  }

  return async (tool, input) => {
    if (!isStartupMcpToolId(tool)) return fail('not-found', `Unknown tool: "${tool}"`);
    const { read: mayRead, write: mayWrite } = consent();
    const isWrite = STARTUP_MCP_WRITE_TOOL_IDS.includes(tool);
    if (!mayRead || (isWrite && !mayWrite)) return fail('refused', STARTUP_AGENTS_OFF_MESSAGE);
    const parsed = MCP_TOOLS[tool].input.safeParse(input ?? {});
    if (!parsed.success) return fail('error', parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
    const store = await storeOrPromise;
    const value = parsed.data as Record<string, unknown>;
    return isWrite ? write(store, tool, value) : read(store, tool, value);
  };
}
