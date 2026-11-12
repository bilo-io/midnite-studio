import type { LedgerAccountInput, LedgerEntity } from '@midnite/studio-shared';

type Row = [code: string, name: string, type: LedgerAccountInput['type'], subtype: LedgerAccountInput['subtype'], tax?: 'allowable' | 'disallowable'];

const toAccounts = (rows: Row[]): LedgerAccountInput[] =>
  rows.map(([code, name, type, subtype, tax]) => ({
    code,
    name,
    type,
    subtype,
    archived: false,
    // An expense defaults to allowable; everything else carries no tax treatment.
    taxTreatment: type === 'expense' ? (tax ?? 'allowable') : 'none',
  }));

const SOLE_TRADER: Row[] = [
  ['1000', 'Bank', 'asset', 'bank'],
  ['1010', 'Cash', 'asset', 'cash'],
  ['1100', 'Accounts receivable', 'asset', 'receivable'],
  ['1500', 'Equipment', 'asset', 'fixed-asset'],
  ['2000', 'Accounts payable', 'liability', 'payable'],
  ['2100', 'Sales tax payable', 'liability', 'tax-payable'],
  ['2200', 'Loans', 'liability', 'loan'],
  ['3000', "Owner's capital", 'equity', 'owner-equity'],
  ['3100', 'Drawings', 'equity', 'drawings'],
  ['3900', 'Retained earnings', 'equity', 'retained-earnings'],
  ['4000', 'Sales', 'income', 'sales'],
  ['4900', 'Other income', 'income', 'other-income'],
  ['5000', 'Cost of sales', 'expense', 'cost-of-sales'],
  ['6000', 'Software & subscriptions', 'expense', 'operating-expense'],
  ['6100', 'Travel', 'expense', 'operating-expense'],
  ['6200', 'Office & home', 'expense', 'operating-expense'],
  ['6300', 'Professional fees', 'expense', 'operating-expense'],
  ['6400', 'Bank fees', 'expense', 'operating-expense'],
  ['6500', 'Equipment (expensed)', 'expense', 'operating-expense'],
  ['6800', 'Entertainment', 'expense', 'operating-expense', 'disallowable'],
  ['6900', 'Other expenses', 'expense', 'other-expense'],
];

const COMPANY: Row[] = [
  ...SOLE_TRADER.filter(([code]) => code !== '3000' && code !== '3100').map((r): Row => r),
  ['3000', 'Share capital', 'equity', 'share-capital'],
  ['2300', 'Payroll liabilities', 'liability', 'current-liability'],
  ['2400', 'Corporation tax payable', 'liability', 'tax-payable'],
  ['6600', 'Salaries', 'expense', 'operating-expense'],
  ['6700', 'Rent', 'expense', 'operating-expense'],
].sort((a, b) => a[0].localeCompare(b[0])) as Row[];

const PERSONAL: Row[] = [
  ['1000', 'Bank', 'asset', 'bank'],
  ['1010', 'Cash', 'asset', 'cash'],
  ['2000', 'Credit card', 'liability', 'current-liability'],
  ['3000', 'Equity', 'equity', 'owner-equity'],
  ['4000', 'Salary', 'income', 'sales'],
  ['4900', 'Other income', 'income', 'other-income'],
  ['6000', 'Housing', 'expense', 'operating-expense'],
  ['6100', 'Food', 'expense', 'operating-expense'],
  ['6200', 'Transport', 'expense', 'operating-expense'],
  ['6300', 'Subscriptions', 'expense', 'operating-expense'],
  ['6900', 'Other expenses', 'expense', 'other-expense'],
];

/** The starting chart of accounts per entity (Phase 129 Theme C). A new book copies one and gives each account an id. */
export const CHART_TEMPLATES: Record<LedgerEntity, LedgerAccountInput[]> = {
  'sole-trader': toAccounts(SOLE_TRADER),
  company: toAccounts(COMPANY),
  personal: toAccounts(PERSONAL),
};
