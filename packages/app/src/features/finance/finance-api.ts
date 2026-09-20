import type { GitOpResult } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import type { AssetKind, AssetSearchResult, FinanceQuote, HistoryPoint } from './finance-types';

/**
 * Finance provider calls proxied through main (Phase 76 Theme D). The Twelve
 * Data key never crosses into the renderer; CoinGecko/Twelve Data hosts are
 * not in the renderer's fetch graph.
 */
export class StockApiKeyMissingError extends Error {
  constructor() {
    super('Stocks need a Twelve Data API key — add one below.');
  }
}

function unwrap<T>(result: GitOpResult<T>): T {
  if (!result.ok) {
    const message = result.kind === 'error' ? result.message : 'finance request failed';
    if (message.includes('Twelve Data')) {
      throw new StockApiKeyMissingError();
    }
    throw new Error(message);
  }
  if (!('value' in result)) {
    throw new Error('finance request returned no value');
  }
  return result.value;
}

export async function searchAssets(
  kind: AssetKind,
  query: string,
): Promise<AssetSearchResult[]> {
  const api = bridge();
  if (!api) throw new Error('App bridge unavailable');
  return unwrap(await api.finance.search({ kind, query }));
}

export async function getQuote(kind: AssetKind, symbol: string): Promise<FinanceQuote> {
  const api = bridge();
  if (!api) throw new Error('App bridge unavailable');
  return unwrap(await api.finance.quote({ kind, symbol }));
}

export async function getHistory(
  kind: AssetKind,
  symbol: string,
): Promise<HistoryPoint[]> {
  const api = bridge();
  if (!api) throw new Error('App bridge unavailable');
  return unwrap(await api.finance.history({ kind, symbol }));
}
