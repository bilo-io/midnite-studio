/**
 * Double-entry books (Phase 129 Theme B) — the domain schemas and the `ledger` channel's request union.
 *
 * One IPC channel carries every op (`LedgerRequestSchema`, the `mediaAnimation` shape), each answering the
 * `LedgerResult` envelope; ops never throw across the boundary. Amounts are integer minor units, one
 * positive number and a side — never a signed number — so a sign error cannot pass validation.
 *
 * Imports `zod`, `./money-amount` and `./suite-apps`: this is the wire contract.
 */
import { z } from 'zod';
import { CurrencyCodeSchema } from './money-amount';
import { SuiteAppIdSchema } from './suite-apps';

export const LedgerIdSchema = z.uuid();
export type LedgerId = z.infer<typeof LedgerIdSchema>;
/** `YYYY-MM-DD`. */
export const LedgerDateSchema = z.iso.date();

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export const AccountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const normalSide = (type: AccountType): 'debit' | 'credit' => (type === 'asset' || type === 'expense' ? 'debit' : 'credit');

export const ACCOUNT_SUBTYPES = [
  'cash',
  'bank',
  'receivable',
  'current-asset',
  'fixed-asset',
  'payable',
  'tax-payable',
  'loan',
  'current-liability',
  'owner-equity',
  'share-capital',
  'drawings',
  'retained-earnings',
  'sales',
  'other-income',
  'cost-of-sales',
  'operating-expense',
  'other-expense',
] as const;
export const AccountSubtypeSchema = z.enum(ACCOUNT_SUBTYPES);
export type AccountSubtype = z.infer<typeof AccountSubtypeSchema>;

/** Which subtypes each account type may carry. */
export const SUBTYPES_BY_TYPE: Readonly<Record<AccountType, readonly AccountSubtype[]>> = {
  asset: ['cash', 'bank', 'receivable', 'current-asset', 'fixed-asset'],
  liability: ['payable', 'tax-payable', 'loan', 'current-liability'],
  equity: ['owner-equity', 'share-capital', 'drawings', 'retained-earnings'],
  income: ['sales', 'other-income'],
  expense: ['cost-of-sales', 'operating-expense', 'other-expense'],
};

const AccountShape = {
  code: z.string().regex(/^[0-9]{3,6}$/),
  name: z.string().trim().min(1).max(80),
  type: AccountTypeSchema,
  subtype: AccountSubtypeSchema,
  archived: z.boolean().default(false),
  taxTreatment: z.enum(['allowable', 'disallowable', 'none']).default('none'),
};
const subtypeBelongsToType = (a: { type: AccountType; subtype: AccountSubtype }): boolean =>
  SUBTYPES_BY_TYPE[a.type].includes(a.subtype);
const SUBTYPE_MISMATCH = { message: 'subtype does not belong to the account type', path: ['subtype'] };

export const LedgerAccountSchema = z.object({ id: LedgerIdSchema, ...AccountShape }).refine(subtypeBelongsToType, SUBTYPE_MISMATCH);
export type LedgerAccount = z.infer<typeof LedgerAccountSchema>;
/** An account on upsert: the id is optional (absent creates). */
export const LedgerAccountInputSchema = z.object({ id: LedgerIdSchema.optional(), ...AccountShape }).refine(subtypeBelongsToType, SUBTYPE_MISMATCH);
export type LedgerAccountInput = z.infer<typeof LedgerAccountInputSchema>;

/** Jurisdictions with a tax rule set; adding one is a new rule file plus one value here. */
export const TaxJurisdictionIdSchema = z.enum(['uk-ew-ni']);
export type TaxJurisdictionId = z.infer<typeof TaxJurisdictionIdSchema>;

export const LEDGER_ENTITIES = ['personal', 'sole-trader', 'company'] as const;
export const LedgerEntitySchema = z.enum(LEDGER_ENTITIES);
export type LedgerEntity = z.infer<typeof LedgerEntitySchema>;

/** A bank-import categorisation rule, stored on the book (Theme E). First match by ascending priority wins. */
export const ImportRuleSchema = z.object({
  id: LedgerIdSchema,
  match: z.object({ field: z.literal('description'), contains: z.string().trim().min(1).max(120) }),
  accountId: LedgerIdSchema,
  priority: z.int(),
});
export type ImportRule = z.infer<typeof ImportRuleSchema>;

export const FiscalYearStartSchema = z.object({ month: z.int().min(1).max(12), day: z.int().min(1).max(31) });

export const LedgerBookSchema = z.object({
  version: z.literal(1),
  id: LedgerIdSchema,
  name: z.string().trim().min(1).max(80),
  entity: LedgerEntitySchema,
  currency: CurrencyCodeSchema,
  fiscalYearStart: FiscalYearStartSchema,
  lockedThrough: LedgerDateSchema.nullable().default(null),
  jurisdiction: TaxJurisdictionIdSchema.nullable().default(null),
  accounts: z.array(LedgerAccountSchema),
  rules: z.array(ImportRuleSchema).default([]),
  createdAt: z.iso.datetime(),
});
export type LedgerBook = z.infer<typeof LedgerBookSchema>;

export const JOURNAL_SOURCE_KINDS = ['manual', 'import', 'invoice', 'payment', 'bill', 'reversal'] as const;
export const JournalSourceSchema = z.object({
  app: SuiteAppIdSchema,
  kind: z.enum(JOURNAL_SOURCE_KINDS),
  ref: z.string().min(1).max(120).optional(),
});
export type JournalSource = z.infer<typeof JournalSourceSchema>;

export const JournalLineSchema = z.object({
  accountId: LedgerIdSchema,
  side: z.enum(['debit', 'credit']),
  minor: z.int().positive(),
  memo: z.string().max(200).optional(),
});
export type JournalLine = z.infer<typeof JournalLineSchema>;

const sumSide = (lines: readonly JournalLine[], side: 'debit' | 'credit'): number =>
  lines.reduce((total, l) => (l.side === side ? total + l.minor : total), 0);

const balanced = (e: { lines: readonly JournalLine[] }): boolean => sumSide(e.lines, 'debit') === sumSide(e.lines, 'credit');
const UNBALANCED = { message: 'debits and credits must be equal', path: ['lines'] };

const JournalEntryShape = {
  id: LedgerIdSchema,
  date: LedgerDateSchema,
  description: z.string().trim().min(1).max(200),
  lines: z.array(JournalLineSchema).min(2).max(200),
  source: JournalSourceSchema,
  reverses: LedgerIdSchema.optional(),
  postedAt: z.iso.datetime(),
};
export const JournalEntrySchema = z.object(JournalEntryShape).refine(balanced, UNBALANCED);
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

const { id: _id, postedAt: _postedAt, ...PostInputShape } = JournalEntryShape;
/** An entry before main stamps `id` and `postedAt`. */
export const LedgerPostInputSchema = z.object(PostInputShape).refine(balanced, UNBALANCED);
export type LedgerPostInput = z.infer<typeof LedgerPostInputSchema>;

/** The shape Phase 130's `LedgerPort.post` takes. */
export const LedgerPostRequestSchema = z.object({ bookId: LedgerIdSchema, entry: LedgerPostInputSchema });
export type LedgerPostRequest = z.infer<typeof LedgerPostRequestSchema>;

/** The renderer may only post `manual` entries: `source.app` and the other kinds are provenance claims main stamps. */
const RendererPostInputSchema = z
  .object({ ...PostInputShape, source: JournalSourceSchema.extend({ kind: z.literal('manual') }) })
  .refine(balanced, UNBALANCED);

export const LEDGER_REPORT_KINDS = ['trial-balance', 'profit-and-loss', 'balance-sheet', 'cash-flow'] as const;
export const LedgerReportKindSchema = z.enum(LEDGER_REPORT_KINDS);
export type LedgerReportKind = z.infer<typeof LedgerReportKindSchema>;

export const ImportMappingSchema = z.object({
  token: z.string().min(1).max(100),
  bankAccountId: LedgerIdSchema,
  date: z.object({ column: z.int().min(0), format: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']) }),
  description: z.int().min(0),
  amount: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('single'), column: z.int().min(0), negativeIsOutflow: z.boolean() }),
    z.object({ kind: z.literal('split'), inColumn: z.int().min(0), outColumn: z.int().min(0) }),
  ]),
});
export type ImportMapping = z.infer<typeof ImportMappingSchema>;

/** A reviewed statement row going into `importCommit`: main re-derives nothing the renderer could forge but the account. */
export const ImportCommitRowSchema = z.object({ index: z.int().min(0), accountId: LedgerIdSchema });
export type ImportCommitRow = z.infer<typeof ImportCommitRowSchema>;

export const LEDGER_CHART_TEMPLATES = LEDGER_ENTITIES;

const bookId = { bookId: LedgerIdSchema };

export const LedgerRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('listBooks') }),
  z.object({ op: z.literal('getBook'), ...bookId }),
  z.object({
    op: z.literal('createBook'),
    name: z.string().trim().min(1).max(80),
    entity: LedgerEntitySchema,
    currency: CurrencyCodeSchema,
    fiscalYearStart: FiscalYearStartSchema,
    template: LedgerEntitySchema,
  }),
  z.object({
    op: z.literal('updateBook'),
    ...bookId,
    patch: z.object({
      name: z.string().trim().min(1).max(80).optional(),
      lockedThrough: LedgerDateSchema.nullable().optional(),
      jurisdiction: TaxJurisdictionIdSchema.nullable().optional(),
    }),
  }),
  z.object({ op: z.literal('upsertAccount'), ...bookId, account: LedgerAccountInputSchema }),
  z.object({ op: z.literal('archiveAccount'), ...bookId, accountId: LedgerIdSchema }),
  z.object({ op: z.literal('post'), ...bookId, entry: RendererPostInputSchema }),
  z.object({
    op: z.literal('reverse'),
    ...bookId,
    entryId: LedgerIdSchema,
    date: LedgerDateSchema,
    reason: z.string().trim().min(1).max(200),
  }),
  z.object({
    op: z.literal('journal'),
    ...bookId,
    from: LedgerDateSchema.optional(),
    to: LedgerDateSchema.optional(),
    accountId: LedgerIdSchema.optional(),
    query: z.string().max(200).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.int().min(1).max(500).default(100),
  }),
  z.object({ op: z.literal('balances'), ...bookId, asOf: LedgerDateSchema }),
  z.object({ op: z.literal('report'), ...bookId, kind: LedgerReportKindSchema, from: LedgerDateSchema, to: LedgerDateSchema }),
  z.object({ op: z.literal('exportReport'), ...bookId, kind: LedgerReportKindSchema, from: LedgerDateSchema, to: LedgerDateSchema }),
  z.object({ op: z.literal('importPick'), ...bookId }),
  z.object({ op: z.literal('importPreview'), ...bookId, mapping: ImportMappingSchema }),
  z.object({ op: z.literal('importCommit'), ...bookId, mapping: ImportMappingSchema, rows: z.array(ImportCommitRowSchema).max(20_000) }),
  z.object({ op: z.literal('taxEstimate'), ...bookId, taxYear: z.int().min(2000).max(2100) }),
]);
export type LedgerRequest = z.infer<typeof LedgerRequestSchema>;
export type LedgerOp = LedgerRequest['op'];

export const LEDGER_ERROR_KINDS = [
  'invalid',
  'unbalanced',
  'locked-period',
  'not-found',
  'read-only',
  'archived-account',
  'currency-mismatch',
  'corrupt',
  'io',
] as const;
export const LedgerErrorKindSchema = z.enum(LEDGER_ERROR_KINDS);
export type LedgerErrorKind = z.infer<typeof LedgerErrorKindSchema>;

export type LedgerResult<T> = { ok: true; value: T } | { ok: false; kind: LedgerErrorKind; message: string };

/** The `ledgerChanged` event payload: a book's revision moved. */
export const LedgerChangedPayloadSchema = z.object({ bookId: z.string(), revision: z.int().min(0) });
export type LedgerChangedPayload = z.infer<typeof LedgerChangedPayloadSchema>;
