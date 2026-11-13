import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, buildTaxEstimate, LedgerRequestSchema, type LedgerRequest, type LedgerResult, type SuiteAppId } from '@midnite/studio-shared';

import { ledgerManifest } from '../manifest';
import { createImportService, type ImportService } from './import/import-service';
import type { LedgerService } from './ledger-service';
import { exportReport, runReport } from './reports';

export { ledgerManifest, type LedgerManifest } from '../manifest';
export { createLedgerService, type CreateBookInput, type JournalQuery, type LedgerService, type LedgerServiceOptions } from './ledger-service';
export { CHART_TEMPLATES } from './chart-templates';
export { createImportService, type ImportService } from './import/import-service';

/**
 * What the composer hands the ledger feature. A host keeps the `service` it built (Phase 130's Startup host
 * reaches the same books through it); the two pickers are the host's native dialogs.
 */
export type LedgerMainServices = {
  service: LedgerService;
  /** The host app: main stamps it on every journal entry's `source.app`. */
  appId: SuiteAppId;
  /** Opens the native file picker for a statement; the path never reaches the renderer. */
  pickCsv: () => Promise<string | null>;
  /** Opens the native save dialog for a report export. */
  saveCsv: (defaultName: string) => Promise<string | null>;
};

const invalid = (message: string): LedgerResult<never> => ({ ok: false, kind: 'invalid', message });

/** Routes one request to the service. Main stamps `source.app`; the renderer's `post` is `manual` only. */
async function dispatch(req: LedgerRequest, services: LedgerMainServices, imports: ImportService): Promise<LedgerResult<unknown>> {
  const { service } = services;
  switch (req.op) {
    case 'listBooks':
      return service.listBooks();
    case 'getBook':
      return service.getBook(req.bookId);
    case 'createBook':
      return service.createBook(req);
    case 'updateBook':
      return service.updateBook(req.bookId, req.patch);
    case 'upsertAccount':
      return service.upsertAccount(req.bookId, req.account);
    case 'archiveAccount':
      return service.archiveAccount(req.bookId, req.accountId);
    case 'post':
      return service.post({ bookId: req.bookId, entry: req.entry }, { ...req.entry.source, app: services.appId });
    case 'reverse':
      return service.reverse(req.bookId, req.entryId, req.date, req.reason);
    case 'journal': {
      const { op: _op, ...query } = req;
      return service.journal(query);
    }
    case 'balances':
      return service.balances(req.bookId, req.asOf);
    case 'report':
      return runReport(service, req);
    case 'exportReport':
      return exportReport(service, req, services.saveCsv);
    case 'taxEstimate': {
      const snap = await service.snapshot(req.bookId);
      return snap.ok ? buildTaxEstimate(snap.value.book, snap.value.entries, req.taxYear) : snap;
    }
    case 'importPick':
      return imports.pick(req.bookId);
    case 'importPreview':
      return imports.preview(req.bookId, req.mapping);
    case 'importCommit':
      return imports.commit(req.bookId, req.mapping, req.rows);
  }
}

export const ledgerMain = defineFeatureMain<LedgerMainServices>({
  feature: ledgerManifest.feature,
  channels: ledgerManifest.ipc,
  register(ctx, services) {
    const imports = createImportService({ service: services.service, appId: services.appId, pickCsv: services.pickCsv });
    ctx.ipc.handle(
      CHANNELS.ledger,
      LedgerRequestSchema,
      async (req): Promise<LedgerResult<unknown>> => {
        try {
          return await dispatch(req, services, imports);
        } catch (err) {
          return { ok: false, kind: 'io', message: err instanceof Error ? err.message : 'ledger request failed' };
        }
      },
      (issue) => invalid(issue),
    );
  },
});
