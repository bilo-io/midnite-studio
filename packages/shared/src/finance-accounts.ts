import { z } from 'zod';

/**
 * Read-only brokerage and exchange accounts (Phase 113 Theme P slice 2) — the
 * wire vocabulary, and nothing that can carry a credential.
 *
 * **No schema here has a credential field.** An account is described by its
 * connector, a label and an id; what authenticates it lives in the vault under
 * {@link accountSecretName} and is read only by main. The one place a credential
 * crosses toward main is `FinanceAccountAddRequest.fields`, a write-only bag
 * keyed by the connector's declared field names; nothing ever answers with it.
 *
 * **No order, withdrawal or transfer exists in this vocabulary.** The three
 * methods a connector has are balances, positions and history.
 */

export const ACCOUNT_CONNECTOR_IDS = ['alpaca', 'kraken'] as const;
export const AccountConnectorIdSchema = z.enum(ACCOUNT_CONNECTOR_IDS);
export type AccountConnectorId = z.infer<typeof AccountConnectorIdSchema>;

/** Where an account's `fields` map is validated: lowercase letters, digits, `-` and `_`, up to 40. */
export const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const AccountIdSchema = z.string().regex(ACCOUNT_ID_PATTERN);

/** Alpaca has a paper and a live host; every other connector ignores the setting. */
export const AccountEnvironmentSchema = z.enum(['paper', 'live']);
export type AccountEnvironment = z.infer<typeof AccountEnvironmentSchema>;

/** The vault entry name for one credential field: `finance.account.<connector>.<accountId>.<field>`. */
export function accountSecretName(connector: string, accountId: string, field: string): string {
  return `finance.account.${connector}.${accountId}.${field}`;
}

/** A connector's public face: what to call it and which credential fields the add form must ask for. */
export const AccountConnectorInfoSchema = z.object({
  id: AccountConnectorIdSchema,
  label: z.string(),
  /** `stocks` or `crypto` — what the account holds, for the picker's hint. */
  assetClass: z.enum(['stocks', 'crypto']),
  /** The form's inputs: names + labels only. The values are typed once into a write-only input. */
  inputs: z.array(z.object({ name: z.string(), label: z.string() })),
  supportsEnvironment: z.boolean(),
  /** Shown above the form: what kind of key to create at the provider. */
  readOnlyHint: z.string(),
});
export type AccountConnectorInfo = z.infer<typeof AccountConnectorInfoSchema>;

/** Non-secret account metadata — what the finance store persists. */
export const BrokerAccountSchema = z.object({
  id: AccountIdSchema,
  connector: AccountConnectorIdSchema,
  label: z.string().min(1).max(60),
  environment: AccountEnvironmentSchema,
  createdAt: z.number(),
});
export type BrokerAccount = z.infer<typeof BrokerAccountSchema>;

const MoneyAmount = z.number().finite();

/** One cash or currency line, in its own currency. `usd` is the USD value when the connector could price it. */
export const BalanceSchema = z.object({
  currency: z.string(),
  total: MoneyAmount,
  available: MoneyAmount,
  usd: MoneyAmount.nullable(),
});
export type Balance = z.infer<typeof BalanceSchema>;

export const PositionSchema = z.object({
  symbol: z.string(),
  quantity: MoneyAmount,
  /** Market value in USD, or null when it could not be priced. */
  marketValueUsd: MoneyAmount.nullable(),
  costBasisUsd: MoneyAmount.nullable(),
  unrealizedPnlUsd: MoneyAmount.nullable(),
});
export type Position = z.infer<typeof PositionSchema>;

/** One point of the account's equity curve. `t` is epoch ms. */
export const PerformancePointSchema = z.object({ t: z.number(), equityUsd: MoneyAmount });
export type PerformancePoint = z.infer<typeof PerformancePointSchema>;

export const AllocationSliceSchema = z.object({
  label: z.string(),
  valueUsd: MoneyAmount,
  /** 0..1 share of the whole. */
  weight: z.number().min(0).max(1),
});
export type AllocationSlice = z.infer<typeof AllocationSliceSchema>;

export const PerformanceSummarySchema = z.object({
  startUsd: MoneyAmount,
  endUsd: MoneyAmount,
  changeUsd: MoneyAmount,
  /** Fractional return (0.05 = +5%); null when the start was zero. */
  changePct: z.number().nullable(),
});
export type PerformanceSummary = z.infer<typeof PerformanceSummarySchema>;

/** Everything the UI shows for one account; `error` set means the rest is empty, never that others failed. */
export const AccountSnapshotSchema = z.object({
  account: BrokerAccountSchema,
  balances: z.array(BalanceSchema),
  positions: z.array(PositionSchema),
  history: z.array(PerformancePointSchema),
  allocation: z.array(AllocationSliceSchema),
  performance: PerformanceSummarySchema.nullable(),
  totalUsd: MoneyAmount,
  fetchedAt: z.number(),
  error: z.string().nullable(),
});
export type AccountSnapshot = z.infer<typeof AccountSnapshotSchema>;
