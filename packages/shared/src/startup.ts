import { z } from 'zod';

/**
 * Midnite Startup's wire contract (Phase 130 Theme B): the company, its roadmap, its plan lines and runway
 * scenarios, its customers and invoices, its vendors and contracts, and the one `startup` channel whose
 * `op` union reads and writes them. zod only.
 *
 * **Money is an integer in minor units** (pence, cents) in the company's one currency. Phase 129's shared
 * `MoneyAmount` is not on main yet; until it lands every amount here is a plain `minor: z.int()`, which is
 * what that type reduces to for a one-currency company, so adopting it later changes no stored value.
 */

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const YearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
export const StartupCurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO-4217 code');

export const CompanyProfileSchema = z.object({
  name: z.string().min(1).max(120),
  legalName: z.string().max(120).optional(),
  currency: StartupCurrencySchema,
  address: z.string().max(400).default(''),
  taxId: z.string().max(40).optional(),
  invoicePrefix: z.string().regex(/^[A-Z0-9-]{0,8}$/).default('INV-'),
  paymentTermsDays: z.int().min(0).max(365).default(30),
  openingCash: z.object({ minor: z.int(), asOf: IsoDateSchema }),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

// --- roadmap (Theme C) ------------------------------------------------------------

export const MILESTONE_STATUSES = ['planned', 'in-progress', 'done', 'dropped'] as const;
export const MilestoneSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  status: z.enum(MILESTONE_STATUSES),
  start: IsoDateSchema.optional(),
  due: IsoDateSchema,
  dependsOn: z.array(z.uuid()).max(20),
  owner: z.string().max(80).optional(),
  tags: z.array(z.string().max(24)).max(8).default([]),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

/**
 * The titles of a dependency loop that giving `id` the dependencies `dependsOn` would close, or `null` when
 * it would not. A self-dependency is a loop of one. Pure, so the renderer greys out the choices main would
 * refuse and main re-checks on every upsert.
 */
export function milestoneCycle(milestones: readonly Milestone[], id: string, dependsOn: readonly string[]): string[] | null {
  const deps = new Map<string, readonly string[]>(milestones.map((m) => [m.id, m.dependsOn]));
  deps.set(id, dependsOn);
  const title = (key: string): string => milestones.find((m) => m.id === key)?.title ?? key;
  const walk = (node: string, path: readonly string[]): string[] | null => {
    for (const next of deps.get(node) ?? []) {
      if (next === id) return [...path, next].map(title);
      if (path.includes(next)) continue;
      const found = walk(next, [...path, next]);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(id, [id]);
}

// --- plan lines and runway (Theme D) ----------------------------------------------

export const PLAN_CATEGORIES = ['people', 'software', 'premises', 'marketing', 'professional', 'hardware', 'revenue', 'other'] as const;
export const PLAN_CADENCES = ['monthly', 'quarterly', 'yearly', 'one-off'] as const;
export const PlanLineSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['cost', 'revenue']),
  name: z.string().min(1).max(80),
  category: z.enum(PLAN_CATEGORIES),
  minor: z.int().nonnegative(),
  cadence: z.enum(PLAN_CADENCES),
  start: YearMonthSchema,
  end: YearMonthSchema.optional(),
  growthBpPerMonth: z.int().min(-10000).max(10000).default(0),
  contractId: z.uuid().optional(),
});
export type PlanLine = z.infer<typeof PlanLineSchema>;

export const MAX_SCENARIOS = 3;
export const BASE_SCENARIO_ID = '00000000-0000-4000-8000-000000000001';
export const RunwayScenarioSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(40),
  costMultiplierBp: z.int().min(0).max(100000).default(10000),
  revenueMultiplierBp: z.int().min(0).max(100000).default(10000),
  extraLines: z.array(PlanLineSchema).default([]),
});
export type RunwayScenario = z.infer<typeof RunwayScenarioSchema>;

// --- vendors and contracts (Theme E) ----------------------------------------------

export const VendorSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  category: z.enum(PLAN_CATEGORIES),
  website: z.url().optional(),
  contact: z.string().max(200).optional(),
  notes: z.string().max(2000).default(''),
});
export type Vendor = z.infer<typeof VendorSchema>;

export const ContractSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  counterparty: z.object({ kind: z.enum(['vendor', 'customer']), id: z.uuid() }),
  start: IsoDateSchema,
  end: IsoDateSchema.optional(),
  autoRenews: z.boolean().default(false),
  renewalTermMonths: z.int().min(1).max(60).optional(),
  noticeDays: z.int().min(0).max(365).default(0),
  value: z.object({ minor: z.int().nonnegative(), cadence: z.enum(PLAN_CADENCES) }).optional(),
  file: z
    .object({
      name: z.string().max(260),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      ext: z.enum(['pdf', 'docx', 'png', 'jpg']),
    })
    .optional(),
});
export type Contract = z.infer<typeof ContractSchema>;

// --- customers and invoices (Theme F) ---------------------------------------------

export const CustomerSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  email: z.email().optional(),
  address: z.string().max(400).default(''),
  taxId: z.string().max(40).optional(),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const InvoiceLineSchema = z.object({
  description: z.string().min(1).max(200),
  quantityMilli: z.int().positive(),
  unitMinor: z.int().nonnegative(),
  taxRateBp: z.int().min(0).max(10000),
});
export const INVOICE_STATUSES = ['draft', 'issued', 'paid', 'void'] as const;
export const InvoiceSchema = z.object({
  id: z.uuid(),
  number: z.string().max(20).nullable().default(null),
  customerId: z.uuid(),
  issueDate: IsoDateSchema.nullable().default(null),
  dueDate: IsoDateSchema.nullable().default(null),
  lines: z.array(InvoiceLineSchema).min(1).max(100),
  notes: z.string().max(1000).default(''),
  status: z.enum(INVOICE_STATUSES),
  entries: z.object({ issued: z.uuid().optional(), paid: z.uuid().optional(), void: z.uuid().optional() }).default({}),
  paidDate: IsoDateSchema.optional(),
  voidReason: z.string().max(200).optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

// --- the workspace ----------------------------------------------------------------

export const STARTUP_WORKSPACE_VERSION = 1;

/** The ledger book an invoice posts into, and the four accounts it uses (Theme F; null until a book is linked). */
export const StartupLedgerLinkSchema = z.object({
  bookId: z.string().min(1).max(80),
  accounts: z.object({
    receivable: z.string().min(1).max(80),
    sales: z.string().min(1).max(80),
    taxPayable: z.string().min(1).max(80),
    bank: z.string().min(1).max(80),
  }),
});

export const StartupWorkspaceSchema = z.object({
  version: z.literal(STARTUP_WORKSPACE_VERSION),
  company: CompanyProfileSchema.nullable().default(null),
  milestones: z.array(MilestoneSchema).default([]),
  lines: z.array(PlanLineSchema).default([]),
  scenarios: z.array(RunwayScenarioSchema).default([]),
  customers: z.array(CustomerSchema).default([]),
  invoices: z.array(InvoiceSchema).default([]),
  vendors: z.array(VendorSchema).default([]),
  contracts: z.array(ContractSchema).default([]),
  invoiceCounter: z.int().min(0).default(0),
  ledger: StartupLedgerLinkSchema.nullable().default(null),
});
export type StartupWorkspace = z.infer<typeof StartupWorkspaceSchema>;

/** The linked book at a glance (`ledgerSummary`): what the runway view shows beside the modelled figures. */
export type StartupLedgerSummary = {
  bookName: string;
  /** Cash plus bank balance as of `asOf`, in minor units. */
  cashMinor: number;
  asOf: string;
  /** Mean monthly expense minus income over the last three full months (positive = spending more than earning); null when the book cannot say. */
  actualBurnMinor: number | null;
};

/** What `exportInvoicePdf` answers: whether a file was saved (false when the save dialog was cancelled). */
export type StartupPdfExport = { saved: boolean };

/** What every read and write answers: the workspace, its revision, and whether writes are refused. */
export const StartupSnapshotSchema = z.object({
  workspace: StartupWorkspaceSchema,
  revision: z.int().nonnegative(),
  readOnly: z.boolean(),
});
export type StartupSnapshot = z.infer<typeof StartupSnapshotSchema>;

// --- the channel ------------------------------------------------------------------

const id = z.uuid();
export const StartupRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('get') }),
  z.object({ op: z.literal('updateCompany'), company: CompanyProfileSchema }),
  z.object({ op: z.literal('upsertMilestone'), milestone: MilestoneSchema }),
  z.object({ op: z.literal('removeMilestone'), id }),
  z.object({ op: z.literal('upsertLine'), line: PlanLineSchema }),
  z.object({ op: z.literal('removeLine'), id }),
  z.object({ op: z.literal('upsertScenario'), scenario: RunwayScenarioSchema }),
  z.object({ op: z.literal('removeScenario'), id }),
  z.object({ op: z.literal('projection'), scenarioId: id, months: z.union([z.literal(12), z.literal(24), z.literal(36)]) }),
  z.object({ op: z.literal('upsertVendor'), vendor: VendorSchema }),
  z.object({ op: z.literal('removeVendor'), id }),
  z.object({ op: z.literal('upsertContract'), contract: ContractSchema }),
  z.object({ op: z.literal('removeContract'), id }),
  z.object({ op: z.literal('attachContractFile'), contractId: id }),
  z.object({ op: z.literal('openContractFile'), contractId: id }),
  z.object({ op: z.literal('upsertCustomer'), customer: CustomerSchema }),
  z.object({ op: z.literal('removeCustomer'), id }),
  z.object({ op: z.literal('upsertInvoice'), invoice: InvoiceSchema }),
  z.object({ op: z.literal('issueInvoice'), id, issueDate: IsoDateSchema }),
  z.object({ op: z.literal('markPaid'), id, paidDate: IsoDateSchema }),
  z.object({ op: z.literal('voidInvoice'), id, reason: z.string().min(1).max(200) }),
  z.object({ op: z.literal('exportInvoicePdf'), id }),
  z.object({ op: z.literal('linkBook'), bookId: z.string().min(1).max(80).nullable() }),
  z.object({ op: z.literal('ledgerSummary') }),
]);
export type StartupRequest = z.infer<typeof StartupRequestSchema>;
export type StartupOp = StartupRequest['op'];

export const STARTUP_RESULT_KINDS = ['invalid', 'not-found', 'in-use', 'cycle', 'locked', 'no-book', 'ledger', 'newer-version', 'io'] as const;
export type StartupResultKind = (typeof STARTUP_RESULT_KINDS)[number];

/** Ops never throw across the boundary: a refusal is a value the UI renders. */
export type StartupResult<T> = { ok: true; value: T } | { ok: false; kind: StartupResultKind; message: string };

export const StartupChangedEventSchema = z.object({ revision: z.int().nonnegative() });
export type StartupChangedEvent = z.infer<typeof StartupChangedEventSchema>;
