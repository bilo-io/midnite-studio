import { useEffect, useState } from 'react';

import { LuArrowDown, LuArrowUp, LuPlus, LuSettings2, LuTrash2, LuX } from 'react-icons/lu';

import { fmtPct, fmtPrice, historyChange } from './finance-derive';
import { useFinanceHistory, useFinanceQuote, useFinanceSearch } from './finance-queries';
import { FINANCE_WATCHLIST_MAX, useFinanceStore } from './finance-store';
import { Sparkline } from './sparkline';
import { assetKey, type AssetKind, type AssetSearchResult, type FinanceAsset } from './finance-types';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The panel behind the status-bar finance segment — a configurable crypto +
 * stock watchlist, each row showing its own 7-day sparkline. Ported from
 * `~/Dev/midnite`'s `MarketWatchlistWidget`/`MarketAssetWidget`, merged into
 * one row shape: the source split "list of quotes" and "one asset with a
 * chart" into two widgets, but this ask wants both together per ticker.
 */
export function FinancePanel() {
  const assets = useFinanceStore((s) => s.assets);
  const [editing, setEditing] = useState(assets.length === 0);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Watchlist
        </h3>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-label={editing ? 'Done editing' : 'Edit watchlist'}
          aria-pressed={editing}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {editing ? <LuX className="h-3.5 w-3.5" /> : <LuSettings2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {editing ? (
          <WatchlistEditor />
        ) : assets.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No tickers yet — click the gear to add some.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {assets.map((a) => (
              <TickerRow key={assetKey(a)} asset={a} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TickerRow({ asset }: { asset: FinanceAsset }) {
  const apiKey = useFinanceStore((s) => s.twelveDataApiKey);
  const { data: quote, error: quoteError } = useFinanceQuote(asset, apiKey);
  const { data: history } = useFinanceHistory(asset, apiKey);

  const points = history ?? [];
  const { pct, up } = historyChange(points);
  const price = quote?.price ?? points.at(-1)?.c;

  if (quoteError instanceof Error) {
    return (
      <li className="flex items-center justify-between gap-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm">{asset.name}</span>
        <span className="text-xs text-destructive">{quoteError.message}</span>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">{asset.name}</span>
      {price == null ? (
        <span className="text-xs text-muted-foreground">…</span>
      ) : (
        <span className="flex items-baseline gap-1.5 tabular-nums">
          <span className="text-sm">{fmtPrice(price, quote?.currency)}</span>
          <span
            className={`flex w-16 items-center justify-end gap-0.5 text-xs font-medium ${
              up ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
            }`}
          >
            {pct == null ? (
              '—'
            ) : (
              <>
                {up ? <LuArrowUp className="h-3 w-3" aria-hidden /> : <LuArrowDown className="h-3 w-3" aria-hidden />}
                {fmtPct(pct)}
              </>
            )}
          </span>
        </span>
      )}
      <span className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
        <Sparkline points={points} up={up} />
      </span>
    </li>
  );
}

function WatchlistEditor() {
  const assets = useFinanceStore((s) => s.assets);
  const addAsset = useFinanceStore((s) => s.addAsset);
  const removeAsset = useFinanceStore((s) => s.removeAsset);
  const apiKey = useFinanceStore((s) => s.twelveDataApiKey);
  const setApiKey = useFinanceStore((s) => s.setApiKey);

  const [kind, setKind] = useState<AssetKind>('crypto');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const atCap = assets.length >= FINANCE_WATCHLIST_MAX;

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const { data: results, isFetching, error } = useFinanceSearch(kind, debounced, apiKey);

  const onAdd = (r: AssetSearchResult) => {
    addAsset({ kind: r.kind, symbol: r.symbol, name: r.name });
    setQuery('');
  };

  return (
    <div className="space-y-3">
      {assets.length > 0 && (
        <ul className="space-y-1">
          {assets.map((a) => (
            <li key={assetKey(a)} className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{a.kind}</span>
              <button
                type="button"
                onClick={() => removeAsset(assetKey(a))}
                aria-label={`Remove ${a.name}`}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
              >
                <LuTrash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {atCap ? (
        <p className="text-[11px] text-muted-foreground">
          Watchlist is full ({FINANCE_WATCHLIST_MAX} max) — remove one to add another.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center rounded-md border border-border/60 p-0.5 text-xs">
            {(['crypto', 'stock'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setQuery('');
                }}
                aria-pressed={kind === k}
                className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
                  kind === k ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {k === 'crypto' ? 'Crypto' : 'Stocks'}
              </button>
            ))}
          </div>

          {kind === 'stock' && (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Twelve Data API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your Twelve Data API key"
                className="w-full rounded-md border border-border/60 bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </label>
          )}

          {(kind === 'crypto' || apiKey.trim() !== '') && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <LuPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={kind === 'crypto' ? 'Search coins…' : 'Search stocks…'}
                  className="w-full min-w-0 flex-1 rounded-md border border-border/60 bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              {debounced.trim().length >= 2 && (
                <ul className="max-h-40 space-y-0.5 overflow-auto rounded-md border border-border/50 p-1">
                  {isFetching ? (
                    <li className="px-1.5 py-1 text-xs text-muted-foreground">Searching…</li>
                  ) : error instanceof Error ? (
                    <li className="px-1.5 py-1 text-xs text-destructive">{error.message}</li>
                  ) : results && results.length > 0 ? (
                    results.map((r) => (
                      <li key={assetKey(r)}>
                        <button
                          type="button"
                          onClick={() => onAdd(r)}
                          className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          {r.exchange && <span className="shrink-0 text-muted-foreground">{r.exchange}</span>}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-1.5 py-1 text-xs text-muted-foreground">No matches.</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
