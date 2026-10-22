import type { FeatureMainContext, FindingsLedger } from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

export interface FindingsHandlersServices {
  ledger: () => FindingsLedger;
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
      const finding = await ledger.get(findingId);
      if (!finding) {
        return { ok: false, kind: 'error', message: `Finding '${findingId}' not found` };
      }
      if (action.id === 'mute') {
        const updated = await ledger.setStatus(findingId, 'muted');
        return { ok: true, value: { actionId: 'mute', finding: updated ?? finding } };
      }
      return {
        ok: false,
        kind: 'error',
        message: `Action '${action.id}' is not yet implemented (scheduled for Theme H)`,
      };
    },
    (issue) => {
      warn(issue);
      return { ok: false, kind: 'error', message: issue };
    },
  );
}
