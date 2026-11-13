// The pure invoice arithmetic lives in `shared` so the renderer's live totals and main's posting agree to the minor unit.
export { lineNet, lineTax, totals, type InvoiceTotals } from '@midnite/studio-shared';
