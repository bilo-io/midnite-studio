import { join } from 'node:path';

import { defineFeatureMain, type IpcContextElectron } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, schemas, type StartupResult } from '@midnite/studio-shared';

import { openAgentConsent } from './agent-consent';
import type { ContractFilePort } from './contract-files';
import type { CsvPort } from './fleet-export-ops';
import type { InvoicePdfPort } from './invoice-pdf';
import type { StartupLedgerPort } from './ledger-port';
import { handleStartupRequest, type StartupServiceDeps } from './service';
import { openWorkspaceStore, type WorkspaceStore } from './workspace-store';

/** The electron pieces Startup's main needs, injected so registration is testable under bare vitest. */
export type StartupElectron = IpcContextElectron & {
  /** Startup's own userData: the workspace lives under `<userData>/startup`. */
  userData: string;
  /** Where a warning goes; dropped when absent. */
  warn?: (message: string) => void;
} & Partial<ContractFilePort>;

/** What the host hands the Startup module. */
export type StartupMainServices = {
  electron: StartupElectron;
  now?: () => number;
  /** The books, implemented by the host over its ledger service; `null` until one is mounted. */
  ledger?: StartupLedgerPort | null;
  /** Prints an invoice page to PDF and asks where to save it; the host's hidden window and save dialog. */
  pdf?: InvoicePdfPort;
  /**
   * Hands the host the one workspace store and the service deps the IPC handler runs with, once, at registration —
   * so the host's MCP server (Phase 153 Theme C) answers from the same store and write queue as the window, never a
   * second copy of the file.
   */
  onReady?: (ready: { store: Promise<WorkspaceStore>; deps: StartupServiceDeps }) => void;
  /** The CSV save dialog (fleet projection and runway exports). */
  csv?: CsvPort;
};

const invalid = (message: string): StartupResult<never> => ({ ok: false, kind: 'invalid', message });

/**
 * The Startup module's main half, on the feature seam so a host mounts it through `mountModuleMains`: the one
 * `startup` channel over a versioned, atomically written workspace file. The renderer's payload is zod-parsed
 * before a handler sees it; the store opens on the first call, so registration stays synchronous.
 */
export const startupModuleMain = defineFeatureMain<StartupMainServices>({
  feature: 'startup',
  channels: [CHANNELS.startup],
  register(ctx, { electron, now, ledger, pdf, csv, onReady }) {
    const store = openWorkspaceStore({
      dir: join(electron.userData, 'startup'),
      ...(now ? { now } : {}),
      ...(electron.warn ? { warn: electron.warn } : {}),
      onChanged: (revision) => ctx.emit(EVENT_CHANNELS.startupChanged, { revision }),
    });
    const deps: StartupServiceDeps = {
      contractsDir: join(electron.userData, 'startup', 'contracts'),
      agentConsent: openAgentConsent(join(electron.userData, 'startup'), electron.warn),
      ledger: ledger ?? null,
      ...(pdf ? { pdf } : {}),
      ...(csv ? { csv } : {}),
      ...(electron.pickContractFile && electron.openPath ? { files: { pickContractFile: electron.pickContractFile, openPath: electron.openPath } } : {}),
    };
    onReady?.({ store, deps });
    ctx.ipc.handle(
      CHANNELS.startup,
      schemas.StartupOpRequest,
      async (request) => handleStartupRequest(await store, request, deps),
      (issue) => invalid(issue),
    );
  },
});
