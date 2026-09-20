import { CHANNELS, failure, schemas, type GitOpResult } from '@midnite/studio-shared';

import {
  getFinanceHistory,
  getFinanceQuote,
  searchFinanceAssets,
  StockApiKeyMissingError,
} from '../finance/finance-service';
import { handle } from './handle';
import { readTwelveDataKey } from './secrets-handlers';

function financeFailure(err: unknown): GitOpResult<never> {
  if (err instanceof StockApiKeyMissingError) {
    return failure(err.message);
  }
  return failure(err instanceof Error ? err.message : 'finance request failed');
}

export function registerFinanceHandlers(): void {
  handle(CHANNELS.financeSearch, schemas.FinanceSearchRequest, async (req) => {
    try {
      const results = await searchFinanceAssets(req.kind, req.query, await readTwelveDataKey());
      return { ok: true as const, value: results };
    } catch (err) {
      return financeFailure(err);
    }
  }, financeFailure);

  handle(CHANNELS.financeQuote, schemas.FinanceQuoteRequest, async (req) => {
    try {
      const quote = await getFinanceQuote(req.kind, req.symbol, await readTwelveDataKey());
      return { ok: true as const, value: quote };
    } catch (err) {
      return financeFailure(err);
    }
  }, financeFailure);

  handle(CHANNELS.financeHistory, schemas.FinanceHistoryRequest, async (req) => {
    try {
      const history = await getFinanceHistory(req.kind, req.symbol, await readTwelveDataKey());
      return { ok: true as const, value: history };
    } catch (err) {
      return financeFailure(err);
    }
  }, financeFailure);
}
