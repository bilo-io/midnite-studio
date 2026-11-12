import { percentOfMinor } from './money-amount';
import type { Invoice } from './startup';

type Line = Invoice['lines'][number];

/** `quantityMilli × unitMinor / 1000`, in BigInt and rounded half away from zero: 1.5 h × £80.00 is 12000 exactly. */
export function lineNet(line: Pick<Line, 'quantityMilli' | 'unitMinor'>): number {
  const product = BigInt(line.quantityMilli) * BigInt(line.unitMinor);
  return Number((product * 2n + 1000n) / 2000n);
}

export const lineTax = (line: Line): number => percentOfMinor(lineNet(line), line.taxRateBp);

export type InvoiceTotals = { netMinor: number; taxMinor: number; totalMinor: number; taxByRate: Map<number, number> };

/** Tax is rounded per line, then summed, so the printed lines add up to the printed totals. */
export function totals(invoice: Pick<Invoice, 'lines'>): InvoiceTotals {
  let netMinor = 0;
  let taxMinor = 0;
  const taxByRate = new Map<number, number>();
  for (const line of invoice.lines) {
    const net = lineNet(line);
    const tax = percentOfMinor(net, line.taxRateBp);
    netMinor += net;
    taxMinor += tax;
    taxByRate.set(line.taxRateBp, (taxByRate.get(line.taxRateBp) ?? 0) + tax);
  }
  return { netMinor, taxMinor, totalMinor: netMinor + taxMinor, taxByRate };
}
