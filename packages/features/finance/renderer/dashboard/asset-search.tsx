import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LuSearch } from 'react-icons/lu';

import type { MarketAsset } from '@midnite/studio-shared';

import { AssetIcon } from './asset-icon';
import { useMarketSearch } from './use-markets';

/**
 * Asset search with an autocomplete dropdown — stocks, ETFs and crypto.
 *
 * A WAI-ARIA combobox: the input owns focus, arrow keys move an
 * `aria-activedescendant` through the listbox, Enter picks, Escape closes.
 * Results are the curated catalogue first, then Nasdaq's equity lookup and
 * CoinGecko's coin search, all merged in main — this component only debounces
 * the keystrokes and renders the answer. With nothing typed it offers the
 * caller's `suggestions` (the watchlist and holdings), so the dropdown is never
 * an empty box.
 */
type Result = MarketAsset & { exchange?: string | undefined };

const KIND_LABEL: Record<MarketAsset['kind'], string> = { crypto: 'Crypto', stock: 'Stock', etf: 'ETF' };

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function AssetSearch({
  onSelect,
  suggestions,
}: {
  onSelect: (asset: MarketAsset) => void;
  suggestions: readonly MarketAsset[];
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const listId = useId();
  const debounced = useDebounced(text, 180);
  const search = useMarketSearch(debounced);

  const results: Result[] = useMemo(() => {
    if (text.trim() === '') return suggestions.slice(0, 8);
    return search.data ?? [];
  }, [text, suggestions, search.data]);

  useEffect(() => setActive(0), [results]);

  /*
    The list is portalled to <body> and positioned from the input's rect: the
    card it belongs to clips its overflow, so an in-flow dropdown would be cut
    off by a short chart card (the same reason `Popover` portals).
  */
  useLayoutEffect(() => {
    if (!open) return;
    const measure = (): void => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ left: rect.left, top: rect.bottom + 4, width: rect.width });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  const pick = (asset: Result): void => {
    onSelect({ symbol: asset.symbol, name: asset.name, kind: asset.kind });
    setText('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const searching = text.trim() !== '' && (search.isFetching || text.trim() !== debounced.trim());

  return (
    <div className="relative w-full max-w-xs">
      <LuSearch aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        role="combobox"
        aria-label="Search stocks and crypto"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].symbol}` : undefined}
        value={text}
        placeholder="Search stocks, ETFs, crypto…"
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (event.key === 'Enter') {
            const choice = results[active];
            if (open && choice) {
              event.preventDefault();
              pick(choice);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
      />

      {open && anchor
        ? createPortal(
        <ul
          id={listId}
          role="listbox"
          aria-label={text.trim() === '' ? 'Suggestions' : 'Search results'}
          style={{ position: 'fixed', left: anchor.left, top: anchor.top, width: Math.max(anchor.width, 260) }}
          className="z-popover max-h-72 overflow-auto rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-xs text-muted-foreground">
              {searching ? 'Searching…' : search.isError ? 'Search is unavailable right now.' : 'No matches.'}
            </li>
          ) : (
            results.map((asset, index) => (
              <li
                key={`${asset.kind}:${asset.symbol}`}
                id={`${listId}-${asset.symbol}`}
                role="option"
                aria-selected={index === active}
                // mousedown, not click: the input's blur closes the list before a click would land.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(asset);
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs ${index === active ? 'bg-accent' : ''}`}
              >
                <AssetIcon symbol={asset.symbol} size={22} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{asset.symbol}</span>
                  <span className="text-muted-foreground"> · {asset.name}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {KIND_LABEL[asset.kind]}
                  {asset.exchange ? ` · ${asset.exchange}` : ''}
                </span>
              </li>
            ))
          )}
        </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
