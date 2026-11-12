import { formatAmount, type CompanyProfile, type Customer, type Invoice } from '@midnite/studio-shared';

import { lineNet, totals } from './invoice-math';

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Every value that reaches the page goes through here: names, addresses and notes are user text. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
const multiline = (value: string): string => escapeHtml(value).replace(/\r?\n/g, '<br>');

const percent = (bp: number): string => `${Number.isInteger(bp / 100) ? bp / 100 : (bp / 100).toFixed(2)}%`;
const quantity = (milli: number): string => (Number.isInteger(milli / 1000) ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, ''));

/**
 * The invoice as one standalone page: inline CSS, no script, no external request. The host prints it with a
 * script-less hidden window, so what the page cannot do is part of the safety, and escaping is the rest.
 */
export function renderInvoiceHtml(invoice: Invoice, company: CompanyProfile, customer: Customer): string {
  const money = (minor: number): string => escapeHtml(formatAmount({ minor, currency: company.currency }, 'en-GB'));
  const t = totals(invoice);
  const rows = invoice.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.description)}</td><td class="n">${quantity(l.quantityMilli)}</td><td class="n">${money(l.unitMinor)}</td><td class="n">${percent(l.taxRateBp)}</td><td class="n">${money(lineNet(l))}</td></tr>`,
    )
    .join('');
  const taxRows = [...t.taxByRate]
    .filter(([, minor]) => minor !== 0 || t.taxMinor === 0)
    .sort((a, b) => a[0] - b[0])
    .map(([bp, minor]) => `<tr><td colspan="4" class="n">Tax at ${percent(bp)}</td><td class="n">${money(minor)}</td></tr>`)
    .join('');
  const title = invoice.number === null ? 'Draft invoice' : `Invoice ${invoice.number}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font:13px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:40px;position:relative}
h1{font-size:22px;margin:0 0 4px}
.cols{display:flex;justify-content:space-between;gap:40px;margin:24px 0}
.muted{color:#666}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
.n{text-align:right;white-space:nowrap}
.total td{font-weight:700;border-bottom:2px solid #111}
.stamp{position:absolute;top:60px;right:40px;border:3px solid #b00020;color:#b00020;padding:4px 14px;font-size:26px;font-weight:700;transform:rotate(-8deg)}
</style></head><body>
${invoice.status === 'void' ? '<div class="stamp">VOID</div>' : ''}
<h1>${escapeHtml(title)}</h1>
<div class="muted">${invoice.issueDate === null ? 'Not issued' : `Issued ${escapeHtml(invoice.issueDate)}`}${invoice.dueDate === null ? '' : ` · Due ${escapeHtml(invoice.dueDate)}`}</div>
<div class="cols">
<div><strong>${escapeHtml(company.legalName ?? company.name)}</strong><br>${multiline(company.address)}${company.taxId === undefined ? '' : `<br>Tax id ${escapeHtml(company.taxId)}`}</div>
<div><strong>Bill to</strong><br>${escapeHtml(customer.name)}<br>${multiline(customer.address)}${customer.taxId === undefined ? '' : `<br>Tax id ${escapeHtml(customer.taxId)}`}</div>
</div>
<table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Tax</th><th class="n">Amount</th></tr></thead><tbody>
${rows}
<tr><td colspan="4" class="n">Subtotal</td><td class="n">${money(t.netMinor)}</td></tr>
${taxRows}
<tr class="total"><td colspan="4" class="n">Total ${escapeHtml(company.currency)}</td><td class="n">${money(t.totalMinor)}</td></tr>
</tbody></table>
${invoice.status === 'void' && invoice.voidReason !== undefined ? `<p class="muted">Void: ${escapeHtml(invoice.voidReason)}</p>` : ''}
${invoice.notes === '' ? '' : `<p>${multiline(invoice.notes)}</p>`}
</body></html>
`;
}
