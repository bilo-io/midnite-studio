import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, LedgerRequestSchema, type LedgerRequest, type LedgerResult, type SuiteAppId } from '@midnite/studio-shared';

import { ledgerManifest } from '../manifest';
import type { LedgerService } from './ledger-service';

export { ledgerManifest, type LedgerManifest } from '../manifest';
export { createLedgerService, type CreateBookInput, type JournalQuery, type LedgerService, type LedgerServiceOptions } from './ledger-service';
export { CHART_TEMPLATES } from './chart-templates';

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
async function dispatch(req: LedgerRequest, services: LedgerMainServices): Promise<LedgerResult<unknown>> {
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
    default:
      return invalid(`"${req.op}" is not available yet.`);
  }
}

export const ledgerMain = defineFeatureMain<LedgerMainServices>({
  feature: ledgerManifest.feature,
  channels: ledgerManifest.ipc,
  register(ctx, services) {
    ctx.ipc.handle(
      CHANNELS.ledger,
      LedgerRequestSchema,
      async (req): Promise<LedgerResult<unknown>> => {
        try {
          return await dispatch(req, services);
        } catch (err) {
          return { ok: false, kind: 'io', message: err instanceof Error ? err.message : 'ledger request failed' };
        }
      },
      (issue) => invalid(issue),
    );
  },
});
