import { createAccountantServices, accountantModuleMain } from '@midnite/studio-module-accountant/main';
import {
  startupMcpDispatch,
  startupModuleMain,
  type InvoicePdfPort,
  type StartupElectron,
  type StartupMainServices,
} from '@midnite/studio-module-startup/main';
import { createIpcContext, mountModuleMains, type ScopedDispatch } from '@midnite/studio-runtime';
import { DEFAULT_STARTUP_AGENT_CONSENT, startupToolsForConsent, STARTUP_AGENTS_OFF_MESSAGE, type McpToolId } from '@midnite/studio-shared';

import { createStartupLedgerPort } from './ledger-port';

/** What Startup's host needs from Electron: the module's own port, the runtime data base the books live beside, and the native dialogs. */
export type StartupHostElectron = StartupElectron & {
  appDataBase: string;
  pickCsv: () => Promise<string | null>;
  saveCsv: (defaultName: string) => Promise<string | null>;
  /** The invoice PDF's hidden printer and save dialog. */
  pdf?: InvoicePdfPort;
};

/**
 * Mounts the Startup host's two modules, Startup and Accountant (Phase 130 Theme F). Accountant mounts through
 * `mountModuleMains` over the shared books (`Midnite Runtime/books`, the ones Money opens); Startup gets the
 * books as a `StartupLedgerPort` built over that same service, so an invoice posts into the book the Books
 * group shows. Startup holds no secret, so there is no vault connection and no pairing. Report an Issue stays the
 * app's own (`report.ts`). `dispose` releases the book locks.
 */
type StartupReady = Parameters<NonNullable<StartupMainServices['onReady']>>[0];

/** What Startup's own MCP server serves (Phase 153 Theme C): the dispatch over the window's store, and the consent-filtered list. */
export type StartupHostMcp = { dispatch: ScopedDispatch; listTools: () => readonly McpToolId[] };

export function registerStartupHost(el: StartupHostElectron): { dispose: () => Promise<void>; mcp: StartupHostMcp } {
  let ready: StartupReady | null = null;
  const accountant = createAccountantServices({
    appDataBase: el.appDataBase,
    appId: 'startup',
    pickCsv: el.pickCsv,
    saveCsv: el.saveCsv,
    send: el.send,
    ...(el.warn ? { warn: el.warn } : {}),
  });
  mountModuleMains(createIpcContext(el), [
    { module: startupModuleMain, services: { electron: el, ledger: createStartupLedgerPort(accountant.service), ...(el.pdf ? { pdf: el.pdf } : {}), onReady: (r: StartupReady) => { ready = r; } } },
    { module: accountantModuleMain, services: accountant },
  ]);
  // One store, one write queue, one consent: the agent's calls and the window's are the same code path on the same state.
  const consent = () => ready?.deps.agentConsent?.get() ?? DEFAULT_STARTUP_AGENT_CONSENT;
  let dispatch: ScopedDispatch | null = null;
  const mcp: StartupHostMcp = {
    dispatch: async (tool, input) => {
      if (ready === null) return { ok: false, kind: 'refused', message: STARTUP_AGENTS_OFF_MESSAGE };
      dispatch ??= startupMcpDispatch(ready.store, ready.deps, consent);
      return dispatch(tool, input);
    },
    listTools: () => startupToolsForConsent(consent()),
  };
  return { dispose: () => accountant.service.dispose(), mcp };
}
