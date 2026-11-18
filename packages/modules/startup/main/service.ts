import { tmpdir } from 'node:os';

import {
  BASE_SCENARIO_ID,
  MAX_FLEET_PROJECTIONS,
  MAX_INVESTOR_UPDATES,
  MAX_SCENARIOS,
  milestoneCycle,
  moneyCurrency,
  seedFleetCatalog,
  type Contract,
  type PlanLine,
  type StartupAiAgent,
  type StartupAiSettings,
  type StartupAiTest,
  type StartupInvestorDraft,
  type StartupRequest,
  type StartupResult,
  type StartupSnapshot,
  type StartupWorkspace,
} from '@midnite/studio-shared';

import { agentConsentOp, type AgentConsentStore } from './agent-consent';
import { aiSettingsOp, type AiSettingsStore } from './ai-settings';
import { buildInvestorUpdatePrompt, cleanInvestorUpdate, gatherUpdateFacts } from './investor-update';
import { emailInvestorUpdate, exportInvestorUpdateMd, exportInvestorUpdatePdf, type MailPorts, type SaveMarkdownPort } from './investor-update-export';
import { fleetToRunwayLines } from './fleet-runway';
import { ledgerSummary, linkBook } from './books';
import { attachContractFile, confinedAttachmentPath, type ContractFilePort } from './contract-files';
import { exportFleetProjectionCsv, exportFleetProjectionPdf, exportRunwayCsv, type CsvPort } from './fleet-export-ops';
import { exportInvoicePdf, type InvoicePdfPort } from './invoice-pdf';
import { issueInvoice, markPaid, voidInvoice } from './invoices';
import type { StartupLedgerPort } from './ledger-port';
import { projectRunway, type RunwayProjection } from './runway';
import type { Mutation, WorkspaceStore } from './workspace-store';

const fail = (kind: Extract<Mutation, { ok: false }>['kind'], message: string): Mutation => ({ ok: false, kind, message });
const done = (workspace: StartupWorkspace): Mutation => ({ ok: true, workspace });

function upsert<T extends { id: string }>(items: readonly T[], item: T): T[] {
  return items.some((x) => x.id === item.id) ? items.map((x) => (x.id === item.id ? item : x)) : [...items, item];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** One prompt to the chosen model; `model` names who answered. The host builds it over the runtime's headless text. */
export type InvestorUpdateRunner = (request: {
  prompt: string;
  agentId?: string | undefined;
  ollamaModel?: string | undefined;
}) => Promise<{ ok: true; text: string; model: string } | { ok: false; message: string }>;

/** What drafting and exporting investor updates need from the host; absent in a bare test, where those ops answer a refusal. */
export type InvestorUpdatePorts = {
  run: InvestorUpdateRunner;
  /** The headless-capable agent CLIs installed here. */
  agents: () => Promise<StartupAiAgent[]>;
  /** The save dialog for the Markdown export. */
  saveMarkdown?: SaveMarkdownPort;
  /** Opens the mail client on a `mailto:` link and copies text, for Email draft; absent in a bare test. */
  mail?: MailPorts;
};

/** The ops whose behaviour lands in a later theme answer this until then. */
const NOT_YET = 'This is not available in this build yet.';

/**
 * One request against the store. Referential integrity is main's job: removing a milestone, vendor or customer
 * that something still points at answers `in-use` naming the count, never a cascade. Every refusal is a value;
 * nothing here throws across the boundary.
 */
export type StartupServiceDeps = {
  /** The host's picker and opener for contract files; absent in a bare test, where attaching answers a refusal. */
  files?: ContractFilePort;
  /** Where attachments are copied: `<userData>/startup/contracts`. */
  contractsDir?: string;
  /** The books, from the host; `null` or absent until a host provides them, and every ledger op then answers `no-book`. */
  ledger?: StartupLedgerPort | null;
  /** Prints and saves an invoice PDF; absent in a bare test. */
  pdf?: InvoicePdfPort;
  /** The save dialog for CSV exports; absent in a bare test. */
  csv?: CsvPort;
  /** Where a PDF's temp page is written; the OS temp folder by default. */
  tmpDir?: string;
  now?: () => Date;
  /** Startup's agent-access switches (app settings, not the workspace); absent in a bare test. */
  agentConsent?: AgentConsentStore;
  /** Which model drafts (app settings, not the workspace); absent in a bare test. */
  aiSettings?: AiSettingsStore;
  /** The model runner, agent roster and save dialog for investor updates (Phase 153 Theme D). */
  investor?: InvestorUpdatePorts;
};

/** The one cost (vendor) or revenue (customer) line a priced contract keeps in the plan, or `null` when it has no price. */
function contractLine(ws: StartupWorkspace, contract: Contract, existing: PlanLine | undefined): PlanLine | null {
  if (contract.value === undefined) return null;
  const vendor = contract.counterparty.kind === 'vendor' ? ws.vendors.find((v) => v.id === contract.counterparty.id) : undefined;
  return {
    id: existing?.id ?? crypto.randomUUID(),
    kind: contract.counterparty.kind === 'vendor' ? 'cost' : 'revenue',
    name: contract.title.slice(0, 80),
    category: vendor?.category ?? 'revenue',
    minor: contract.value.minor,
    cadence: contract.value.cadence,
    start: contract.start.slice(0, 7),
    ...(contract.end !== undefined ? { end: contract.end.slice(0, 7) } : {}),
    growthBpPerMonth: existing?.growthBpPerMonth ?? 0,
    contractId: contract.id,
  };
}

export async function handleStartupRequest(
  store: WorkspaceStore,
  request: StartupRequest,
  deps: StartupServiceDeps = {},
): Promise<StartupResult<StartupSnapshot | unknown>> {
  switch (request.op) {
    case 'get': {
      if (store.snapshot().workspace.fleetCatalog !== null) return { ok: true, value: store.snapshot() };
      // Seed the catalog once, in the money currency, so every later read has one. A read-only (newer) workspace
      // refuses the write and is served as it is.
      const seeded = await store.mutate((ws) =>
        ws.fleetCatalog === null ? done({ ...ws, fleetCatalog: seedFleetCatalog(moneyCurrency(ws.company)) }) : done(ws),
      );
      return seeded.ok ? seeded : { ok: true, value: store.snapshot() };
    }

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

    case 'upsertFleetProjection':
      return store.mutate((ws) => {
        const existing = ws.fleetProjections.find((p) => p.id === request.projection.id);
        if (!existing && ws.fleetProjections.length >= MAX_FLEET_PROJECTIONS) {
          return fail('invalid', `A company has at most ${MAX_FLEET_PROJECTIONS} projections.`);
        }
        const projection = {
          ...request.projection,
          createdAt: existing ? existing.createdAt : request.projection.createdAt,
          updatedAt: (deps.now?.() ?? new Date()).toISOString(),
        };
        return done({ ...ws, fleetProjections: upsert(ws.fleetProjections, projection) });
      });
    case 'removeFleetProjection':
      return store.mutate((ws) =>
        ws.fleetProjections.some((p) => p.id === request.id)
          ? done({ ...ws, fleetProjections: ws.fleetProjections.filter((p) => p.id !== request.id) })
          : fail('not-found', 'That projection no longer exists.'),
      );
    case 'duplicateFleetProjection':
      return store.mutate((ws) => {
        const index = ws.fleetProjections.findIndex((p) => p.id === request.id);
        if (index < 0) return fail('not-found', 'That projection no longer exists.');
        if (ws.fleetProjections.length >= MAX_FLEET_PROJECTIONS) {
          return fail('invalid', `A company has at most ${MAX_FLEET_PROJECTIONS} projections.`);
        }
        const source = ws.fleetProjections[index]!;
        const now = (deps.now?.() ?? new Date()).toISOString();
        const copy = {
          ...source,
          id: crypto.randomUUID(),
          name: request.name,
          createdAt: now,
          updatedAt: now,
          nodes: source.nodes.map((n) => ({ ...n, id: crypto.randomUUID() })),
        };
        return done({ ...ws, fleetProjections: [...ws.fleetProjections.slice(0, index + 1), copy, ...ws.fleetProjections.slice(index + 1)] });
      });

    case 'upsertFleetCatalog':
      return store.mutate((ws) => {
        const { catalog } = request;
        const dupe = (ids: readonly string[]): string | undefined => ids.find((id, i) => ids.indexOf(id) !== i);
        const twice = dupe(catalog.hardware.map((h) => h.id)) ?? dupe(catalog.apiTiers.map((t) => t.id));
        if (twice !== undefined) return fail('invalid', `The id "${twice}" appears more than once in the catalog.`);
        // A removed id that a projection's node or template still uses cannot go: hide it instead.
        const keptHw = new Set(catalog.hardware.map((h) => h.id));
        const keptTier = new Set(catalog.apiTiers.map((t) => t.id));
        const users = (pick: (c: { hardwareId: string; apiTierId: string }) => string, gone: (id: string) => boolean) => {
          const counts = new Map<string, number>();
          for (const p of ws.fleetProjections) {
            for (const c of [...p.nodes, p.template]) {
              const id = pick(c);
              if (gone(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
            }
          }
          return counts;
        };
        const blocked = [
          ...users((c) => c.hardwareId, (id) => !keptHw.has(id)),
          ...users((c) => c.apiTierId, (id) => !keptTier.has(id)),
        ];
        if (blocked.length > 0) {
          const [id, n] = blocked[0]!;
          return fail('in-use', `"${id}" is in use by ${plural(n, 'node', 'nodes')} — hide it instead.`);
        }
        return done({ ...ws, fleetCatalog: catalog });
      });

    // Phase 152: declared in Theme A, implemented by Themes D (bridge) and E (export).
    case 'sendFleetProjectionToRunway':
      return store.mutate((ws) => {
        const projection = ws.fleetProjections.find((p) => p.id === request.projectionId);
        if (projection === undefined) return fail('not-found', 'That projection no longer exists.');
        if (ws.company === null) return fail('invalid', 'Set up your company first — Runway needs it.');
        const catalog = ws.fleetCatalog ?? seedFleetCatalog(moneyCurrency(ws.company));
        const lines = fleetToRunwayLines(projection, catalog, request.start, (deps.now?.() ?? new Date()).toISOString(), () => crypto.randomUUID());
        // Send and update are one op: drop what this projection wrote before, then write it afresh, in the base plan.
        const kept = ws.lines.filter((l) => l.source?.projectionId !== projection.id);
        return done({ ...ws, lines: [...kept, ...lines] });
      });
    case 'unlinkFleetProjectionLines':
      return store.mutate((ws) => {
        const linked = (l: PlanLine): boolean => l.source?.projectionId === request.projectionId;
        const lines = request.removeLines
          ? ws.lines.filter((l) => !linked(l))
          : ws.lines.map((l) => {
              if (!linked(l)) return l;
              const { source: _source, ...rest } = l;
              return rest;
            });
        return done({ ...ws, lines });
      });
    case 'exportFleetProjectionCsv':
      return exportFleetProjectionCsv(store, request.projectionId, deps.csv);
    case 'exportRunwayCsv': {
      const run = await runwayFor(store, deps, request.scenarioId, request.months);
      return run.ok ? exportRunwayCsv(run.value, moneyCurrency(store.snapshot().workspace.company), deps.csv) : run;
    }
    case 'exportFleetProjectionPdf':
      return exportFleetProjectionPdf(store, request.projectionId, deps.pdf, deps.tmpDir ?? tmpdir(), deps.now?.() ?? new Date());

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
        const previous = ws.lines.find((l) => l.contractId === request.contract.id);
        const line = contractLine(ws, request.contract, previous);
        const lines = ws.lines.filter((l) => l.contractId !== request.contract.id);
        return done({ ...ws, contracts: upsert(ws.contracts, request.contract), lines: line === null ? lines : [...lines, line] });
      });
    case 'removeContract':
      return store.mutate((ws) =>
        ws.contracts.some((c) => c.id === request.id)
          ? done({ ...ws, contracts: ws.contracts.filter((c) => c.id !== request.id), lines: ws.lines.filter((l) => l.contractId !== request.id) })
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
        // A draft carries no number, dates or entries: those are assigned by issuing, never by the caller.
        const draft = { ...invoice, number: null, issueDate: null, dueDate: null, entries: {}, paidDate: undefined, voidReason: undefined };
        return done({ ...ws, invoices: upsert(ws.invoices, draft) });
      });

    case 'issueInvoice':
      return issueInvoice(store, request.id, request.issueDate, { ledger: deps.ledger ?? null, ...(deps.now ? { now: deps.now } : {}) });
    case 'markPaid':
      return markPaid(store, request.id, request.paidDate, { ledger: deps.ledger ?? null });
    case 'voidInvoice':
      return voidInvoice(store, request.id, request.reason, { ledger: deps.ledger ?? null, ...(deps.now ? { now: deps.now } : {}) });
    case 'exportInvoicePdf':
      return exportInvoicePdf(store, request.id, deps.pdf, deps.tmpDir ?? tmpdir());
    case 'linkBook':
      return linkBook(store, request.bookId, deps.ledger ?? null);
    case 'ledgerSummary':
      return ledgerSummary(store, deps.ledger ?? null, deps.now?.() ?? new Date());

    case 'projection':
      return runwayFor(store, deps, request.scenarioId, request.months);

    case 'attachContractFile': {
      const { files, contractsDir } = deps;
      if (!store.snapshot().workspace.contracts.some((c) => c.id === request.contractId)) return { ok: false, kind: 'not-found', message: 'That contract no longer exists.' };
      if (files === undefined || contractsDir === undefined) return { ok: false, kind: 'invalid', message: NOT_YET };
      const outcome = await attachContractFile(files, contractsDir).catch((error: unknown) => ({ ok: false as const, message: `Could not attach the file: ${String(error)}` }));
      if (outcome.ok === 'cancelled') return { ok: true, value: store.snapshot() };
      if (outcome.ok === false) return { ok: false, kind: 'invalid', message: outcome.message };
      return store.mutate((ws) =>
        ws.contracts.some((c) => c.id === request.contractId)
          ? done({ ...ws, contracts: ws.contracts.map((c) => (c.id === request.contractId ? { ...c, file: outcome.file } : c)) })
          : fail('not-found', 'That contract no longer exists.'),
      );
    }
    case 'openContractFile': {
      const { files, contractsDir } = deps;
      const file = store.snapshot().workspace.contracts.find((c) => c.id === request.contractId)?.file;
      if (file === undefined) return { ok: false, kind: 'not-found', message: 'That contract has no file attached.' };
      if (files === undefined || contractsDir === undefined) return { ok: false, kind: 'invalid', message: NOT_YET };
      const path = confinedAttachmentPath(contractsDir, file);
      if (path === null) return { ok: false, kind: 'invalid', message: 'That file is outside the contracts folder.' };
      const problem = await files.openPath(path);
      return problem === '' ? { ok: true, value: null } : { ok: false, kind: 'io', message: problem };
    }

    case 'upsertInvestorUpdate':
      return store.mutate((ws) => {
        const { update } = request;
        const existing = ws.investorUpdates.find((u) => u.id === update.id);
        if (ws.investorUpdates.some((u) => u.id !== update.id && u.period === update.period)) {
          return fail('invalid', `There is already an update for ${update.period}.`);
        }
        if (!existing && ws.investorUpdates.length >= MAX_INVESTOR_UPDATES) return fail('invalid', `A company has at most ${MAX_INVESTOR_UPDATES} updates.`);
        const now = (deps.now?.() ?? new Date()).toISOString();
        const next = { ...update, createdAt: existing ? existing.createdAt : update.createdAt, updatedAt: now };
        return done({ ...ws, investorUpdates: upsert(ws.investorUpdates, next) });
      });
    case 'removeInvestorUpdate':
      return store.mutate((ws) =>
        ws.investorUpdates.some((u) => u.id === request.id)
          ? done({ ...ws, investorUpdates: ws.investorUpdates.filter((u) => u.id !== request.id) })
          : fail('not-found', 'That update no longer exists.'),
      );
    case 'draftInvestorUpdate':
      return draftInvestorUpdate(store, request, deps);
    case 'exportInvestorUpdateMd':
      return exportInvestorUpdateMd(store, request.id, deps.investor?.saveMarkdown);
    case 'emailInvestorUpdate':
      return emailInvestorUpdate(store, request.id, deps.investor?.mail);
    case 'exportInvestorUpdatePdf':
      return exportInvestorUpdatePdf(store, request.id, deps.pdf, deps.tmpDir ?? tmpdir());

    case 'getAiSettings':
    case 'setAiSettings':
      return aiSettingsOp(deps.aiSettings, request);
    case 'listAiAgents': {
      if (deps.investor === undefined) return { ok: true, value: [] };
      return { ok: true, value: await deps.investor.agents().catch((): StartupAiAgent[] => []) };
    }
    case 'testAiModel':
      return testAiModel(request, deps);

    case 'getAgentConsent':
    case 'setAgentConsent':
      return agentConsentOp(deps.agentConsent, request);
  }
}

/** The runway for a scenario from today: opening cash is the linked book's cash when it answers, else the typed one. */
async function runwayFor(store: WorkspaceStore, deps: StartupServiceDeps, scenarioId: string, months: 12 | 24 | 36): Promise<StartupResult<RunwayProjection>> {
  const ws = store.snapshot().workspace;
  if (ws.company === null) return { ok: false, kind: 'invalid', message: 'Set up your company first.' };
  const stored = ws.scenarios.find((s) => s.id === scenarioId);
  const scenario =
    stored ?? (scenarioId === BASE_SCENARIO_ID ? { id: BASE_SCENARIO_ID, name: 'Base', costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] } : null);
  if (scenario === null) return { ok: false, kind: 'not-found', message: 'That scenario no longer exists.' };
  const startMonth = (deps.now?.() ?? new Date()).toISOString().slice(0, 7);
  // With a book linked its cash today replaces the typed opening cash; a book that will not answer falls back to it.
  let openingCashMinor = ws.company.openingCash.minor;
  if (deps.ledger && ws.ledger !== null) {
    const cash = await deps.ledger.cashBalance(ws.ledger.bookId, (deps.now?.() ?? new Date()).toISOString().slice(0, 10));
    if (cash.ok) openingCashMinor = cash.value.minor;
  }
  return { ok: true, value: projectRunway({ openingCashMinor, startMonth, lines: ws.lines, scenario, months }) };
}

/** An explicit choice in the request wins whole; otherwise the stored setting, an Ollama model before an agent. */
function chosenModel(
  request: { agentId?: string | undefined; ollamaModel?: string | undefined },
  settings: StartupAiSettings,
): { agentId: string | undefined; ollamaModel: string | undefined } {
  if (request.agentId !== undefined || request.ollamaModel !== undefined) {
    return { agentId: request.agentId, ollamaModel: request.ollamaModel === '' ? undefined : request.ollamaModel };
  }
  return settings.ollamaModel !== '' ? { agentId: undefined, ollamaModel: settings.ollamaModel } : { agentId: settings.agentId, ollamaModel: undefined };
}

const settingsOf = (deps: StartupServiceDeps): StartupAiSettings => deps.aiSettings?.get() ?? { agentId: 'claude', ollamaModel: '' };

/** The draft is returned for review and never saved: the window decides whether it becomes the update. */
async function draftInvestorUpdate(
  store: WorkspaceStore,
  request: Extract<StartupRequest, { op: 'draftInvestorUpdate' }>,
  deps: StartupServiceDeps,
): Promise<StartupResult<StartupInvestorDraft>> {
  const ws = store.snapshot().workspace;
  if (ws.company === null) return { ok: false, kind: 'invalid', message: 'Set up your company first.' };
  if (deps.investor === undefined) return { ok: false, kind: 'invalid', message: 'Drafting is not available in this build.' };
  const now = deps.now?.() ?? new Date();
  let book = null;
  if (deps.ledger && ws.ledger !== null) {
    const summary = await ledgerSummary(store, deps.ledger, now);
    if (summary.ok) book = summary.value;
  }
  const previous = [...ws.investorUpdates].filter((u) => u.period < request.period).sort((a, b) => b.period.localeCompare(a.period))[0];
  const prompt = buildInvestorUpdatePrompt(gatherUpdateFacts(ws, request.period, now, book), request.notes, previous?.markdown);
  const reply = await deps.investor.run({ prompt, ...chosenModel(request, settingsOf(deps)) });
  if (!reply.ok) return { ok: false, kind: 'io', message: reply.message };
  const markdown = cleanInvestorUpdate(reply.text).slice(0, 50_000);
  if (markdown === '') return { ok: false, kind: 'io', message: `${reply.model} answered with nothing.` };
  return { ok: true, value: { markdown, model: reply.model.slice(0, 80) } };
}

/** The Settings ▸ AI page's Test button: one short prompt, to show the model answers. */
async function testAiModel(
  request: Extract<StartupRequest, { op: 'testAiModel' }>,
  deps: StartupServiceDeps,
): Promise<StartupResult<StartupAiTest>> {
  if (deps.investor === undefined) return { ok: false, kind: 'invalid', message: 'Drafting is not available in this build.' };
  const reply = await deps.investor.run({ prompt: 'Reply with the single word: ready', ...chosenModel(request, settingsOf(deps)) });
  return reply.ok ? { ok: true, value: { model: reply.model, reply: reply.text.slice(0, 200) } } : { ok: false, kind: 'io', message: reply.message };
}
