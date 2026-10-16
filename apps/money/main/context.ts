import { join } from 'node:path';

import { createMarketsRuntime, financeMain, startRatesRefresh } from '@midnite/studio-feature-finance/main';
import {
  createIpcContext,
  createVaultService,
  type IpcContextElectron,
  type VaultAuthorize,
  type VaultCipher,
} from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

/** The secret Money reads, and nothing else: the Twelve Data market-data key. */
const MARKET_DATA_KEY = 'finance.twelveData';

/** The electron pieces Money's main needs, injected so registration is testable under bare vitest. */
export type MoneyElectron = IpcContextElectron & {
  /** Money's own userData: the market cache and the portfolio live under `<userData>/finance`. */
  userData: string;
  /** The runtime's data directory, where the vault's namespace files live. */
  vaultDirectory: string;
  /** `safeStorage` in the app, a fake in tests — never the real keychain under test. */
  cipher: VaultCipher;
  /** The per-app grants (Vault); absent, the runtime's default applies. */
  authorize?: VaultAuthorize;
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
  const vault = createVaultService({
    directory: el.vaultDirectory,
    cipher: el.cipher,
    ...(el.authorize ? { authorize: el.authorize } : {}),
  }).forApp('money');
  const runtime = createMarketsRuntime(join(el.userData, 'finance'), el.fetcher);
  financeMain.register(createIpcContext(el), {
    runtime,
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
