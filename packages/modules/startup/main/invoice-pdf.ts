import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StartupPdfExport, StartupResult } from '@midnite/studio-shared';

import { renderInvoiceHtml } from './invoice-html';
import type { WorkspaceStore } from './workspace-store';

/** The host's two pieces: a script-less hidden window that prints a page, and the native save dialog. */
export type InvoicePdfPort = {
  printToPdf: (htmlFile: string) => Promise<Buffer>;
  /** The chosen path, or `null` when the dialog was cancelled. */
  savePdf: (defaultName: string) => Promise<string | null>;
};

/**
 * Renders the invoice to a temp HTML file, has the host print it, and writes the PDF where the person chose.
 * Cancelling the dialog is a normal outcome (`saved: false`), not an error. The temp folder is removed either way.
 */
export async function exportInvoicePdf(store: WorkspaceStore, id: string, port: InvoicePdfPort | undefined, tmpRoot: string): Promise<StartupResult<StartupPdfExport>> {
  const ws = store.snapshot().workspace;
  const invoice = ws.invoices.find((i) => i.id === id);
  if (invoice === undefined) return { ok: false, kind: 'not-found', message: 'That invoice no longer exists.' };
  const customer = ws.customers.find((c) => c.id === invoice.customerId);
  if (customer === undefined) return { ok: false, kind: 'not-found', message: 'That customer no longer exists.' };
  if (ws.company === null) return { ok: false, kind: 'invalid', message: 'Set up your company first.' };
  if (port === undefined) return { ok: false, kind: 'invalid', message: 'Exporting a PDF is not available in this build.' };
  const html = renderInvoiceHtml(invoice, ws.company, customer);
  let dir: string | null = null;
  try {
    const target = await port.savePdf(`${invoice.number ?? 'Invoice-draft'}.pdf`);
    if (target === null) return { ok: true, value: { saved: false } };
    dir = await mkdtemp(join(tmpRoot, 'invoice-'));
    const file = join(dir, 'invoice.html');
    await writeFile(file, html);
    await writeFile(target, await port.printToPdf(file));
    return { ok: true, value: { saved: true } };
  } catch (error) {
    return { ok: false, kind: 'io', message: `Could not export the PDF: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    if (dir !== null) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
