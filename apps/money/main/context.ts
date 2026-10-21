import { join } from 'node:path';

import { createAccountsService, createMarketsRuntime, financeMain, startRatesRefresh } from '@midnite/studio-feature-finance/main';
import {
  connectRuntimeVault,
  createIpcContext,
  vaultHostSocketPath,
  type IpcContextElectron,
  type PairingIdentity,
} from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

/** The secret Money reads, and nothing else: the Twelve Data market-data key. */
const MARKET_DATA_KEY = 'finance.twelveData';

/** The electron pieces Money's main needs, injected so registration is testable under bare vitest. */
export type MoneyElectron = IpcContextElectron & {
  /** Money's own userData: the market cache and the portfolio live under `<userData>/finance`. */
  userData: string;
  /**
   * The runtime's data directory, where the runtime host (Studio) serves the vault on a socket.
   * Money holds no cipher: the host decrypts, and the host's grants decide — so Money is denied the
   * market-data key until the user grants it in Vault (docs/APPS.md, "The shared data plane").
   */
  vaultDirectory: string;
  /** Money's pairing key (`pairing.ts`): the host serves nothing to a connection that has not proved it. */
  pairing: () => PairingIdentity | null;
  /** The market transport: the real network in the app, a fixture in tests. */
  fetcher?: Parameters<typeof createMarketsRuntime>[1];
  /** Where a warning goes; dropped when absent. */
  warn?: (message: string) => void;
};

/**
 * Registers every channel Money's renderer can call: the finance feature's, plus `secretsHas`
 * narrowed to the market-data key. **The key is read here, from the runtime vault as `money`, and
 * answers no channel** — when the vault refuses Money (no grant) the stock handlers report a
 * missing key and the renderer's `has` answers false, which the home turns into "grant Money
 * access in Vault". Returns what stops the background rate refresh.
 */
export function registerMoneyHandlers(el: MoneyElectron): () => void {
  const vault = connectRuntimeVault({ socketPath: vaultHostSocketPath(el.vaultDirectory), appId: 'money', identity: el.pairing });
  const financeDirectory = join(el.userData, 'finance');
  const runtime = createMarketsRuntime(financeDirectory, el.fetcher);
  // Brokerage credentials live in the same vault namespace, under `finance.account.*` names no
  // channel can name (`SecretKey` is an enum). Main reads them to sign a request; nothing returns one.
  const accounts = createAccountsService({
    directory: financeDirectory,
    credentials: {
      set: (name, value) => vault.set('secrets', name, value),
      get: (name) => vault.get('secrets', name),
      delete: (name) => vault.delete('secrets', name),
    },
    ...(el.fetcher ? { fetcher: el.fetcher } : {}),
  });
  financeMain.register(createIpcContext(el), {
    runtime,
    accounts,
    twelveDataKey: () => vault.get('secrets', MARKET_DATA_KEY),
    ...(el.fetcher ? { fetcher: el.fetcher } : {}),
    ...(el.warn ? { warn: el.warn } : {}),
  });
  el.ipcMain.handle(CHANNELS.secretsHas, async (_event, raw: unknown) => {
    const parsed = schemas.SecretsHasRequest.safeParse(raw);
    // Only the market-data key is Money's to ask about; any other answers "not set".
    if (!parsed.success || parsed.data.key !== MARKET_DATA_KEY) return { hasKey: false };
    return { hasKey: await vault.has('secrets', MARKET_DATA_KEY) };
  });
  return startRatesRefresh(runtime, el.warn);
}
