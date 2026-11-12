/**
 * The reference jurisdiction: the United Kingdom without Scotland (England, Wales and Northern Ireland).
 * Rates and thresholds are data in `./ledger-tax-uk-rates`; this file is only the arithmetic.
 *
 * Sole trader: income tax on the trading profit (allowance tapered above 100 000) plus Class 4 NIC.
 * Company: corporation tax with marginal relief. Not modelled, and listed in each estimate's notes:
 * other income, dividends, losses, capital allowances, Scottish bands, associated companies, short periods.
 */
import type { TaxEstimate, TaxEstimateLine, TaxInput, TaxPayment } from './ledger';
import { UK_RATES, type UkRates } from './ledger-tax-uk-rates';
import type { TaxEntity, TaxJurisdiction } from './ledger-tax';
import { percentOfMinor } from './money-amount';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const ratesOf = (taxYear: string): UkRates => {
  const rates = UK_RATES[taxYear];
  if (!rates) throw new Error(`No UK rates for ${taxYear}`);
  return rates;
};

/** Tax over profit in basis points, rounded half up, computed in BigInt. */
const effectiveBp = (totalMinor: number, profitMinor: number): number =>
  profitMinor <= 0 ? 0 : Number((BigInt(totalMinor) * 10000n * 2n + BigInt(profitMinor)) / (BigInt(profitMinor) * 2n));

const line = (label: string, basisMinor: number, rateBp: number): TaxEstimateLine => ({ label, basisMinor, rateBp, taxMinor: percentOfMinor(basisMinor, rateBp) });

const SOLE_NOTES = [
  'Covers trading profit only: other income, dividends, savings, losses, capital allowances and the marriage allowance are not modelled.',
  'Scotland has its own income-tax bands and is not covered.',
  'Class 2 National Insurance is no longer a compulsory charge and is not included.',
];
const COMPANY_NOTES = [
  'Associated companies and accounting periods shorter than 12 months change the limits and are not modelled.',
  'Taxable profit here is the book profit plus disallowable expenses: capital allowances and losses are not modelled.',
  'Companies with profits of 1 500 000 or more pay by instalments; the date shown is the standard one.',
];

function soleTrader(input: TaxInput, r: UkRates): TaxEstimate {
  const taxable = Math.max(0, input.profitMinor + input.disallowableMinor);
  const taper = Math.floor(Math.max(0, taxable - r.allowanceTaperThreshold) / 2);
  const allowance = Math.max(0, r.personalAllowance - taper);
  const afterAllowance = Math.max(0, taxable - allowance);
  const basic = clamp(afterAllowance, 0, r.basicBandWidth);
  const higher = clamp(afterAllowance - r.basicBandWidth, 0, r.additionalThreshold - r.basicBandWidth);
  const additional = Math.max(0, afterAllowance - r.additionalThreshold);
  const class4Main = clamp(taxable - r.class4LowerLimit, 0, r.class4UpperLimit - r.class4LowerLimit);
  const class4Extra = Math.max(0, taxable - r.class4UpperLimit);

  const lines = [
    line('Income tax, basic rate', basic, r.basicRateBp),
    line('Income tax, higher rate', higher, r.higherRateBp),
    line('Income tax, additional rate', additional, r.additionalRateBp),
    line('Class 4 NIC, main rate', class4Main, r.class4MainRateBp),
    line('Class 4 NIC, additional rate', class4Extra, r.class4AdditionalRateBp),
  ].filter((l) => l.basisMinor !== 0);
  const total = lines.reduce((sum, l) => sum + l.taxMinor, 0);

  const notes = [`Personal allowance used: ${allowance === r.personalAllowance ? 'in full' : 'tapered'} (${(allowance / 100).toFixed(2)}).`, ...SOLE_NOTES];
  const payments: TaxPayment[] = [];
  if (total > r.paymentsOnAccountThreshold) {
    // Payments on account for the NEXT year fall due in the January after the year's return is due.
    const next = r.startYear + 2;
    const first = Math.floor(total / 2);
    payments.push(
      { due: `${next}-01-31`, minor: first, label: `First payment on account, ${next}-01-31` },
      { due: `${next}-07-31`, minor: total - first, label: `Second payment on account, ${next}-07-31` },
    );
    notes.push('Payments on account are half of this estimate each, due 31 January and 31 July; the first also settles any balance for the year.');
  }
  return { lines, totalMinor: total, effectiveRateBp: effectiveBp(total, taxable), payments, notes, source: r.source };
}

function company(input: TaxInput, r: UkRates): TaxEstimate {
  const taxable = Math.max(0, input.profitMinor + input.disallowableMinor);
  const lines: TaxEstimateLine[] = [];
  if (taxable > 0) {
    if (taxable <= r.corpLowerLimit) lines.push(line('Corporation tax, small profits rate', taxable, r.corpSmallProfitsRateBp));
    else {
      lines.push(line('Corporation tax, main rate', taxable, r.corpMainRateBp));
      if (taxable < r.corpUpperLimit) {
        const below = r.corpUpperLimit - taxable;
        const relief = line('Marginal relief', below, r.corpMarginalReliefBp);
        lines.push({ ...relief, taxMinor: -relief.taxMinor });
      }
    }
  }
  const total = lines.reduce((sum, l) => sum + l.taxMinor, 0);
  // 9 months and 1 day after the period ends on 31 March: 1 January.
  const payments: TaxPayment[] = total > 0 ? [{ due: `${r.startYear + 2}-01-01`, minor: total, label: 'Corporation tax, nine months and a day after the period ends' }] : [];
  return { lines, totalMinor: total, effectiveRateBp: effectiveBp(total, taxable), payments, notes: [...COMPANY_NOTES], source: r.source };
}

const yearsNewestFirst = Object.keys(UK_RATES).sort().reverse();

export const UK_EW_NI: TaxJurisdiction = {
  id: 'uk-ew-ni',
  label: 'United Kingdom (England, Wales and Northern Ireland)',
  currency: 'GBP',
  entities: ['sole-trader', 'company'] satisfies TaxEntity[],
  taxYears: yearsNewestFirst,
  yearRange(taxYear, entity) {
    const y = ratesOf(taxYear).startYear;
    // A company's financial year runs 1 April to 31 March; an individual's tax year 6 April to 5 April.
    return entity === 'company' ? { from: `${y}-04-01`, to: `${y + 1}-03-31` } : { from: `${y}-04-06`, to: `${y + 1}-04-05` };
  },
  estimate(input) {
    const r = ratesOf(input.taxYear);
    return input.entity === 'company' ? company(input, r) : soleTrader(input, r);
  },
};
