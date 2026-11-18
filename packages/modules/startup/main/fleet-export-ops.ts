// Phase 152 E: the three export ops. Each writes where the person chose; a cancelled dialog is `{ saved: false }`.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { computeFleetProjection, moneyCurrency, seedFleetCatalog, type StartupPdfExport, type StartupResult } from '@midnite/studio-shared';

import { fleetProjectionCsv, renderFleetProjectionHtml, runwayCsv, safeFileName } from './fleet-export';
import type { InvoicePdfPort } from './invoice-pdf';
import type { RunwayProjection } from './runway';
import type { WorkspaceStore } from './workspace-store';

export type CsvPort = { saveCsv: (defaultName: string) => Promise<string | null> };

const failIo = (what: string, error: unknown): StartupResult<StartupPdfExport> => ({
  ok: false,
  kind: 'io',
  message: `Could not export the ${what}: ${error instanceof Error ? error.message : String(error)}`,
});

async function saveCsvFile(port: CsvPort | undefined, defaultName: string, build: () => string): Promise<StartupResult<StartupPdfExport>> {
  if (port === undefined) return { ok: false, kind: 'invalid', message: 'Exporting a CSV is not available in this build.' };
  try {
    const target = await port.saveCsv(defaultName);
    if (target === null) return { ok: true, value: { saved: false } };
    await writeFile(target, build());
    return { ok: true, value: { saved: true } };
  } catch (error) {
    return failIo('CSV', error);
  }
}

export function exportFleetProjectionCsv(store: WorkspaceStore, projectionId: string, port: CsvPort | undefined): Promise<StartupResult<StartupPdfExport>> | StartupResult<StartupPdfExport> {
  const ws = store.snapshot().workspace;
  const projection = ws.fleetProjections.find((p) => p.id === projectionId);
  if (projection === undefined) return { ok: false, kind: 'not-found', message: 'That projection no longer exists.' };
  const currency = moneyCurrency(ws.company);
  const catalog = ws.fleetCatalog ?? seedFleetCatalog(currency);
  return saveCsvFile(port, `${safeFileName(projection.name, 'projection')}.csv`, () => fleetProjectionCsv(projection, computeFleetProjection(projection, catalog), catalog, currency));
}

/** The runway itself is computed by the caller (it needs the ledger's cash), so this only names and writes it. */
export function exportRunwayCsv(projection: RunwayProjection, currency: string, port: CsvPort | undefined): Promise<StartupResult<StartupPdfExport>> {
  const first = projection.months[0]?.month ?? 'export';
  return saveCsvFile(port, `runway-${first}.csv`, () => runwayCsv(projection, currency));
}

/** Mirrors `exportInvoicePdf`: ask where first, render to a temp HTML file, print it, and always remove the folder. */
export async function exportFleetProjectionPdf(
  store: WorkspaceStore,
  projectionId: string,
  port: InvoicePdfPort | undefined,
  tmpRoot: string,
  now: Date,
): Promise<StartupResult<StartupPdfExport>> {
  const ws = store.snapshot().workspace;
  const projection = ws.fleetProjections.find((p) => p.id === projectionId);
  if (projection === undefined) return { ok: false, kind: 'not-found', message: 'That projection no longer exists.' };
  if (port === undefined) return { ok: false, kind: 'invalid', message: 'Exporting a PDF is not available in this build.' };
  const currency = moneyCurrency(ws.company);
  const catalog = ws.fleetCatalog ?? seedFleetCatalog(currency);
  const html = renderFleetProjectionHtml(projection, computeFleetProjection(projection, catalog), catalog, currency, ws.company, now.toISOString().slice(0, 10));
  let dir: string | null = null;
  try {
    const target = await port.savePdf(`${safeFileName(projection.name, 'projection')}.pdf`);
    if (target === null) return { ok: true, value: { saved: false } };
    dir = await mkdtemp(join(tmpRoot, 'projection-'));
    const file = join(dir, 'projection.html');
    await writeFile(file, html);
    await writeFile(target, await port.printToPdf(file));
    return { ok: true, value: { saved: true } };
  } catch (error) {
    return failIo('PDF', error);
  } finally {
    if (dir !== null) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
