import {
  BASE_SCENARIO_ID,
  MAX_SCENARIOS,
  milestoneCycle,
  type StartupRequest,
  type StartupResult,
  type StartupSnapshot,
  type StartupWorkspace,
} from '@midnite/studio-shared';

import { projectRunway } from './runway';
import type { Mutation, WorkspaceStore } from './workspace-store';

const fail = (kind: Extract<Mutation, { ok: false }>['kind'], message: string): Mutation => ({ ok: false, kind, message });
const done = (workspace: StartupWorkspace): Mutation => ({ ok: true, workspace });

function upsert<T extends { id: string }>(items: readonly T[], item: T): T[] {
  return items.some((x) => x.id === item.id) ? items.map((x) => (x.id === item.id ? item : x)) : [...items, item];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The ops whose behaviour lands in a later theme answer this until then. */
const NOT_YET = 'This is not available in this build yet.';

/**
 * One request against the store. Referential integrity is main's job: removing a milestone, vendor or customer
 * that something still points at answers `in-use` naming the count, never a cascade. Every refusal is a value;
 * nothing here throws across the boundary.
 */
export async function handleStartupRequest(store: WorkspaceStore, request: StartupRequest): Promise<StartupResult<StartupSnapshot | unknown>> {
  switch (request.op) {
    case 'get':
      return { ok: true, value: store.snapshot() };

    case 'updateCompany':
      return store.mutate((ws) => {
        const locked = ws.invoices.some((i) => i.status !== 'draft');
        if (locked && ws.company !== null && ws.company.currency !== request.company.currency) {
          return fail('locked', 'The currency is fixed once the first invoice is issued.');
        }
        return done({ ...ws, company: request.company });
      });

    case 'upsertMilestone':
      return store.mutate((ws) => {
        const { milestone } = request;
        const known = new Set(ws.milestones.map((m) => m.id));
        const missing = milestone.dependsOn.filter((id) => id !== milestone.id && !known.has(id));
        if (missing.length > 0) return fail('not-found', `${plural(missing.length, 'dependency does', 'dependencies do')} not exist.`);
        const loop = milestoneCycle(ws.milestones, milestone.id, milestone.dependsOn);
        if (loop !== null) return fail('cycle', `That would make a loop: ${loop.join(' → ')}.`);
        return done({ ...ws, milestones: upsert(ws.milestones, milestone) });
      });
    case 'removeMilestone':
      return store.mutate((ws) => {
        if (!ws.milestones.some((m) => m.id === request.id)) return fail('not-found', 'That milestone no longer exists.');
        const dependents = ws.milestones.filter((m) => m.dependsOn.includes(request.id));
        if (dependents.length > 0) return fail('in-use', `${plural(dependents.length, 'milestone depends', 'milestones depend')} on it.`);
        return done({ ...ws, milestones: ws.milestones.filter((m) => m.id !== request.id) });
      });

    case 'upsertLine':
      return store.mutate((ws) => done({ ...ws, lines: upsert(ws.lines, request.line) }));
    case 'removeLine':
      return store.mutate((ws) =>
        ws.lines.some((l) => l.id === request.id)
          ? done({ ...ws, lines: ws.lines.filter((l) => l.id !== request.id) })
          : fail('not-found', 'That line no longer exists.'),
      );

    case 'upsertScenario':
      return store.mutate((ws) => {
        const isNew = !ws.scenarios.some((s) => s.id === request.scenario.id);
        if (isNew && ws.scenarios.length >= MAX_SCENARIOS) return fail('invalid', `A company has at most ${MAX_SCENARIOS} scenarios.`);
        return done({ ...ws, scenarios: upsert(ws.scenarios, request.scenario) });
      });
    case 'removeScenario':
      return store.mutate((ws) => {
        if (request.id === BASE_SCENARIO_ID) return fail('invalid', 'The Base scenario cannot be removed.');
        return ws.scenarios.some((s) => s.id === request.id)
          ? done({ ...ws, scenarios: ws.scenarios.filter((s) => s.id !== request.id) })
          : fail('not-found', 'That scenario no longer exists.');
      });

    case 'upsertVendor':
      return store.mutate((ws) => done({ ...ws, vendors: upsert(ws.vendors, request.vendor) }));
    case 'removeVendor':
      return store.mutate((ws) => {
        if (!ws.vendors.some((v) => v.id === request.id)) return fail('not-found', 'That vendor no longer exists.');
        const contracts = ws.contracts.filter((c) => c.counterparty.kind === 'vendor' && c.counterparty.id === request.id);
        if (contracts.length > 0) return fail('in-use', `${plural(contracts.length, 'contract uses', 'contracts use')} this vendor.`);
        return done({ ...ws, vendors: ws.vendors.filter((v) => v.id !== request.id) });
      });

    case 'upsertContract':
      return store.mutate((ws) => {
        const { counterparty } = request.contract;
        const exists = (counterparty.kind === 'vendor' ? ws.vendors : ws.customers).some((x) => x.id === counterparty.id);
        if (!exists) return fail('not-found', `That ${counterparty.kind} no longer exists.`);
        return done({ ...ws, contracts: upsert(ws.contracts, request.contract) });
      });
    case 'removeContract':
      return store.mutate((ws) =>
        ws.contracts.some((c) => c.id === request.id)
          ? done({ ...ws, contracts: ws.contracts.filter((c) => c.id !== request.id) })
          : fail('not-found', 'That contract no longer exists.'),
      );

    case 'upsertCustomer':
      return store.mutate((ws) => done({ ...ws, customers: upsert(ws.customers, request.customer) }));
    case 'removeCustomer':
      return store.mutate((ws) => {
        if (!ws.customers.some((c) => c.id === request.id)) return fail('not-found', 'That customer no longer exists.');
        const invoices = ws.invoices.filter((i) => i.customerId === request.id);
        if (invoices.length > 0) return fail('in-use', `${plural(invoices.length, 'invoice uses', 'invoices use')} this customer.`);
        const contracts = ws.contracts.filter((c) => c.counterparty.kind === 'customer' && c.counterparty.id === request.id);
        if (contracts.length > 0) return fail('in-use', `${plural(contracts.length, 'contract uses', 'contracts use')} this customer.`);
        return done({ ...ws, customers: ws.customers.filter((c) => c.id !== request.id) });
      });

    case 'upsertInvoice':
      return store.mutate((ws) => {
        const { invoice } = request;
        const existing = ws.invoices.find((i) => i.id === invoice.id);
        if (existing !== undefined && existing.status !== 'draft') return fail('invalid', 'Issued invoices are read-only.');
        if (invoice.status !== 'draft') return fail('invalid', 'Only a draft can be saved; issuing posts it to the books.');
        if (!ws.customers.some((c) => c.id === invoice.customerId)) return fail('not-found', 'That customer no longer exists.');
        return done({ ...ws, invoices: upsert(ws.invoices, invoice) });
      });

    // Theme F: invoices post into a linked book.
    case 'issueInvoice':
    case 'markPaid':
    case 'voidInvoice':
    case 'exportInvoicePdf':
    case 'linkBook':
    case 'ledgerSummary':
      return { ok: false, kind: 'no-book', message: 'Link a book in Settings ▸ Company to use the ledger.' };

    case 'projection': {
      const ws = store.snapshot().workspace;
      if (ws.company === null) return { ok: false, kind: 'invalid', message: 'Set up your company first.' };
      const stored = ws.scenarios.find((s) => s.id === request.scenarioId);
      const scenario =
        stored ?? (request.scenarioId === BASE_SCENARIO_ID ? { id: BASE_SCENARIO_ID, name: 'Base', costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] } : null);
      if (scenario === null) return { ok: false, kind: 'not-found', message: 'That scenario no longer exists.' };
      const startMonth = new Date().toISOString().slice(0, 7);
      return {
        ok: true,
        value: projectRunway({ openingCashMinor: ws.company.openingCash.minor, startMonth, lines: ws.lines, scenario, months: request.months }),
      };
    }

    // Theme E (contract files).
    case 'attachContractFile':
    case 'openContractFile':
      return { ok: false, kind: 'invalid', message: NOT_YET };
  }
}
