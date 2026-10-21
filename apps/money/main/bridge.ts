import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Money exposes — exactly what the finance feature's renderer
 * calls, and nothing else: `finance.*`, `financeAccounts.*`, `markets.*` and `secrets.has` (a boolean about the
 * market-data key, never its value). Every other bridge namespace is deliberately absent, and so
 * is `secrets.get`/`secrets.set` (`bridge.test.ts` holds the list).
 */
export type MoneyBridge = {
  finance: MidniteStudioBridge['finance'];
  financeAccounts: MidniteStudioBridge['financeAccounts'];
  markets: MidniteStudioBridge['markets'];
  secrets: Pick<MidniteStudioBridge['secrets'], 'has'>;
};

export type { RendererIpc };

export function createMoneyBridge(ipc: RendererIpc): MoneyBridge {
  const { call } = createBridgeSlice(ipc);
  return {
    finance: {
      search: (req) => call(CHANNELS.financeSearch, req),
      quote: (req) => call(CHANNELS.financeQuote, req),
      history: (req) => call(CHANNELS.financeHistory, req),
    },
    financeAccounts: {
      list: () => call(CHANNELS.financeAccountsList),
      test: (req) => call(CHANNELS.financeAccountTest, req),
      add: (req) => call(CHANNELS.financeAccountAdd, req),
      remove: (req) => call(CHANNELS.financeAccountRemove, req),
      snapshots: (req) => call(CHANNELS.financeAccountSnapshots, req),
    },
    markets: {
      series: (req) => call(CHANNELS.marketsSeries, req),
      quotes: (req) => call(CHANNELS.marketsQuotes, req),
      search: (req) => call(CHANNELS.marketsSearch, req),
      rates: () => call(CHANNELS.marketsRates),
      portfolio: () => call(CHANNELS.marketsPortfolioGet),
      apply: (req) => call(CHANNELS.marketsPortfolioApply, req),
      news: (req) => call(CHANNELS.marketsNews, req),
    },
    secrets: { has: (req) => call(CHANNELS.secretsHas, req) },
  };
}
