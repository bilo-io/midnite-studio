import type { Invoice } from '@midnite/studio-shared';

export type InvoiceFilter = 'all' | 'draft' | 'issued' | 'overdue' | 'paid' | 'void';
export const INVOICE_FILTERS: readonly InvoiceFilter[] = ['all', 'draft', 'issued', 'overdue', 'paid', 'void'];

/** What the list shows: an issued invoice past its due date reads Overdue. Derived, never stored. */
export function displayStatus(invoice: Pick<Invoice, 'status' | 'dueDate'>, today: string): Exclude<InvoiceFilter, 'all'> {
  return invoice.status === 'issued' && invoice.dueDate !== null && invoice.dueDate < today ? 'overdue' : invoice.status;
}

export const matchesFilter = (invoice: Pick<Invoice, 'status' | 'dueDate'>, filter: InvoiceFilter, today: string): boolean =>
  filter === 'all' || displayStatus(invoice, today) === filter;
