import { describe, expect, it } from 'vitest';

import type { CompanyProfile, Customer, Invoice } from '@midnite/studio-shared';

import { renderInvoiceHtml } from './invoice-html';

const company: CompanyProfile = { name: 'Acme', currency: 'GBP', address: '1 High St', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 0, asOf: '2026-01-01' } };
const customer: Customer = { id: '00000000-0000-4000-8000-000000000001', name: '<script>alert(1)</script>', address: 'A & B' };
const invoice: Invoice = {
  id: '00000000-0000-4000-8000-000000000002',
  number: 'INV-0001',
  customerId: customer.id,
  issueDate: '2026-11-01',
  dueDate: '2026-12-01',
  lines: [{ description: '<b>Work</b>', quantityMilli: 1500, unitMinor: 8000, taxRateBp: 2000 }],
  notes: '',
  status: 'issued',
  entries: {},
};

describe('renderInvoiceHtml', () => {
  it('escapes every interpolated value', () => {
    const html = renderInvoiceHtml(invoice, company, customer);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Work&lt;/b&gt;');
    expect(html).toContain('A &amp; B');
  });
  it('prints the totals and no script', () => {
    const html = renderInvoiceHtml(invoice, company, customer);
    expect(html).toContain('£120.00');
    expect(html).toContain('£24.00');
    expect(html).toContain('£144.00');
    expect(html).toContain('Invoice INV-0001');
    expect(html).not.toContain('VOID');
  });
  it('stamps a void invoice and keeps its number', () => {
    const html = renderInvoiceHtml({ ...invoice, status: 'void', voidReason: 'Wrong customer' }, company, customer);
    expect(html).toContain('VOID');
    expect(html).toContain('INV-0001');
    expect(html).toContain('Wrong customer');
  });
});
