import type { FeatureMainContext, FindingsLedger } from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

import { previewAction, runAction, type ResponseActions } from './actions';

export interface FindingsHandlersServices {
  ledger: () => FindingsLedger;
  /** Theme H's response actions; absent, only `mute` runs (a ledger-only reader such as a test). */
  response?: () => ResponseActions | Promise<ResponseActions>;
  warn?: (issue: string) => void;
}

export function registerFindingsHandlers(
  ctx: FeatureMainContext,
  services: FindingsHandlersServices,
): void {
  const { ipc } = ctx;
  const warn = (issue: string): void => services.warn?.(issue);

  ipc.handle(
    CHANNELS.securityFindingsList,
    schemas.SecurityFindingsListRequest,
    async (req) => {
      const ledger = services.ledger();
      const findings = await ledger.list(req);
      return { findings };
    },
    (issue) => {
      warn(issue);
      return { findings: [] };
    },
  );

  ipc.handle(
    CHANNELS.securityFindingsSetStatus,
    schemas.SecurityFindingsSetStatusRequest,
    async ({ id, status }) => {
      const ledger = services.ledger();
      const updated = await ledger.setStatus(id, status);
      if (!updated) {
        return { ok: false, kind: 'error', message: `Finding '${id}' not found` };
      }
      return { ok: true, value: updated };
    },
    (issue) => {
      warn(issue);
      return { ok: false, kind: 'error', message: issue };
    },
  );

  ipc.handle(
    CHANNELS.securityFindingsAct,
    schemas.SecurityFindingsActRequest,
    async ({ findingId, action }) => {
      const ledger = services.ledger();
      if (!services.response) {
        const finding = await ledger.get(findingId);
        if (!finding) return { ok: false, kind: 'error', message: `Finding '${findingId}' not found` };
        if (action.id !== 'mute') return { ok: false, kind: 'error', message: 'Response actions are not available in this app.' };
        const updated = await ledger.setStatus(findingId, 'muted');
        return { ok: true, value: { actionId: 'mute', finding: updated ?? finding } };
      }
      return runAction(ledger, await services.response(), findingId, action);
    },
    (issue) => {
      warn(issue);
      return { ok: false, kind: 'error', message: issue };
    },
  );

  // The blast radius the confirm shows: computed from the machine as it is now, and never an action.
  ipc.handle(
    CHANNELS.securityFindingsActPreview,
    schemas.SecurityFindingsActRequest,
    async ({ findingId, action }) => {
      if (!services.response) return { ok: false, kind: 'error', message: 'Response actions are not available in this app.' };
      return previewAction(services.ledger(), await services.response(), findingId, action);
    },
    (issue) => {
      warn(issue);
      return { ok: false, kind: 'error', message: issue };
    },
  );
}
