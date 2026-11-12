/**
 * United Kingdom (England, Wales and Northern Ireland) tax rates and thresholds, one row per tax year.
 *
 * THE ONE PLACE THE FIGURES LIVE. A human checks this table against GOV.UK; nothing else in the repo
 * restates a rate. Money is in pence (minor units of GBP), rates in basis points (100 bp = 1 %).
 * Scotland's income-tax bands differ and are not modelled.
 *
 * Sources:
 *  - Income tax:         https://www.gov.uk/income-tax-rates
 *  - Class 4 NIC:        https://www.gov.uk/self-employed-national-insurance-rates
 *  - Corporation tax:    https://www.gov.uk/corporation-tax-rates  (and /guidance/corporation-tax-marginal-relief)
 *  - Payments on account: https://www.gov.uk/understand-self-assessment-bill/payments-on-account
 *
 * 2026-27 was read from those pages on 2026-11-12. 2025-26 carries the same figures, as listed in the
 * Phase 129 spec; GOV.UK's live pages now show only the current year, so it was not re-read there and its
 * `checkedOn` names the spec instead of a date.
 * Corporation tax is by financial year: the `2025-26` row is the financial year starting 1 April 2025.
 */
export type UkRates = {
  /** First day of the individual's tax year is 6 April of this year; the company financial year is 1 April. */
  startYear: number;
  personalAllowance: number;
  /** Adjusted net income above this reduces the allowance by 1 for every 2 over. */
  allowanceTaperThreshold: number;
  /** Width of the basic-rate band, taxed after the allowance. */
  basicBandWidth: number;
  /** Taxable income (after the allowance) above which the additional rate applies. */
  additionalThreshold: number;
  basicRateBp: number;
  higherRateBp: number;
  additionalRateBp: number;
  class4LowerLimit: number;
  class4UpperLimit: number;
  class4MainRateBp: number;
  class4AdditionalRateBp: number;
  /** Payments on account are due when the Self Assessment liability exceeds this. */
  paymentsOnAccountThreshold: number;
  corpSmallProfitsRateBp: number;
  corpMainRateBp: number;
  corpLowerLimit: number;
  corpUpperLimit: number;
  /** Marginal relief fraction 3/200 as basis points of the profit below the upper limit (1.5 %). */
  corpMarginalReliefBp: number;
  source: { url: string; checkedOn: string };
};

const COMMON = {
  personalAllowance: 1_257_000,
  allowanceTaperThreshold: 10_000_000,
  basicBandWidth: 3_770_000,
  additionalThreshold: 12_514_000,
  basicRateBp: 2000,
  higherRateBp: 4000,
  additionalRateBp: 4500,
  class4LowerLimit: 1_257_000,
  class4UpperLimit: 5_027_000,
  class4MainRateBp: 600,
  class4AdditionalRateBp: 200,
  paymentsOnAccountThreshold: 100_000,
  corpSmallProfitsRateBp: 1900,
  corpMainRateBp: 2500,
  corpLowerLimit: 5_000_000,
  corpUpperLimit: 25_000_000,
  corpMarginalReliefBp: 150,
} as const;

export const UK_RATES: Readonly<Record<string, UkRates>> = {
  '2026-27': { ...COMMON, startYear: 2026, source: { url: 'https://www.gov.uk/income-tax-rates', checkedOn: '2026-11-12' } },
  '2025-26': { ...COMMON, startYear: 2025, source: { url: 'https://www.gov.uk/income-tax-rates', checkedOn: 'the Phase 129 spec' } },
};
