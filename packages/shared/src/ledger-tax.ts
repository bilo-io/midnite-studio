/**
 * Tax estimates (Phase 129 Theme G): the `TaxJurisdiction` interface, the registry, and `buildTaxEstimate`.
 *
 * Pure, like `ledger-reports.ts`, so main's `taxEstimate` op and the in-memory ledger the renderer's tests
 * and shots use run the same code. Every figure is an integer number of minor units; rates are basis
 * points and every product goes through `percentOfMinor`'s BigInt multiply. Adding a jurisdiction is one
 * rule file here plus one value in `TaxJurisdictionIdSchema`.
 *
 * Imports `./ledger`, `./ledger-reports`, `./ledger-tax-uk` and `./money-amount`: this is the wire contract.
 */
import {
  taxDisclaimer,
  type JournalEntry,
  type LedgerBook,
  type LedgerErrorKind,
  type LedgerResult,
  type LedgerTaxEstimate,
  type TaxEstimate,
  type TaxInput,
  type TaxJurisdictionId,
} from './ledger';
import { ReportRangeError, profitAndLoss } from './ledger-reports';
import { UK_EW_NI } from './ledger-tax-uk';

export type TaxEntity = TaxInput['entity'];

/** The interface every rule set implements. */
export type TaxJurisdiction = {
  id: TaxJurisdictionId;
  label: string;
  currency: string;
  entities: readonly TaxEntity[];
  /** Newest first, e.g. `['2026-27', '2025-26']`. */
  taxYears: readonly string[];
  /** The inclusive date range the year's profit is measured over (a company's year starts 1 April, an individual's 6 April). */
  yearRange(taxYear: string, entity: TaxEntity): { from: string; to: string };
  estimate(input: TaxInput): TaxEstimate;
};

export const TAX_JURISDICTIONS: Readonly<Record<TaxJurisdictionId, TaxJurisdiction>> = { 'uk-ew-ni': UK_EW_NI };

/** The label of the year that starts in `startYear`: `2026` is `2026-27`. */
export const taxYearLabel = (startYear: number): string => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

/** The start year a label names: `2026-27` is `2026`. */
export const taxYearStart = (label: string): number => Number(label.slice(0, 4));

const refuse = (kind: LedgerErrorKind, message: string): LedgerResult<never> => ({ ok: false, kind, message });

/**
 * Estimates one tax year for a book. Refuses with `invalid` when the book has no jurisdiction, is a personal
 * book, is not in the jurisdiction's currency, or the year is not one the rule set carries.
 */
export function buildTaxEstimate(book: LedgerBook, entries: readonly JournalEntry[], startYear: number): LedgerResult<LedgerTaxEstimate> {
  if (book.jurisdiction === null) return refuse('invalid', 'Choose a tax jurisdiction in the book settings first.');
  const jurisdiction = TAX_JURISDICTIONS[book.jurisdiction];
  if (book.entity === 'personal') return refuse('invalid', 'Tax estimates are not available for a personal book.');
  if (book.currency !== jurisdiction.currency) return refuse('invalid', `${jurisdiction.label} estimates need a ${jurisdiction.currency} book.`);
  const taxYear = taxYearLabel(startYear);
  if (!jurisdiction.taxYears.includes(taxYear)) return refuse('invalid', `${taxYear} is not a tax year this estimate carries.`);

  const range = jurisdiction.yearRange(taxYear, book.entity);
  try {
    const pnl = profitAndLoss(book, entries, range.from, range.to);
    const disallowed = new Set(book.accounts.filter((a) => a.type === 'expense' && a.taxTreatment === 'disallowable').map((a) => a.id));
    let disallowableMinor = 0n;
    for (const row of [...pnl.costOfSales, ...pnl.expenses]) if (row.accountId !== null && disallowed.has(row.accountId)) disallowableMinor += BigInt(row.minor);
    const disallowable = Number(disallowableMinor);
    if (!Number.isSafeInteger(disallowable)) return refuse('invalid', 'A total is too large to estimate exactly.');
    const taxable = pnl.netProfit + disallowable;
    const estimate = jurisdiction.estimate({ taxYear, entity: book.entity, profitMinor: pnl.netProfit, disallowableMinor: disallowable });
    return {
      ok: true,
      value: {
        jurisdictionId: jurisdiction.id,
        jurisdictionLabel: jurisdiction.label,
        taxYear,
        entity: book.entity,
        currency: book.currency,
        from: range.from,
        to: range.to,
        profitMinor: pnl.netProfit,
        disallowableMinor: disallowable,
        taxableProfitMinor: taxable,
        estimate,
        disclaimer: taxDisclaimer(jurisdiction.label, taxYear, estimate.source.checkedOn),
      },
    };
  } catch (err) {
    if (err instanceof ReportRangeError) return refuse('invalid', err.message);
    throw err;
  }
}
