import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { LuBox, LuGrid3X3, LuImage, LuMountain, LuPackagePlus } from 'react-icons/lu';
import { useVirtualizer } from '@tanstack/react-virtual';

import { BottomPanel, EmptyState, EmptyStateButton, FilterInput, Skeleton, useBottomPanel } from '@midnite/studio-frame';

import { GameAssetPicker } from '../../game-asset-picker';
import { arm, endAssetDrag, startAssetDrag, useArmedAsset } from './asset-drag';
import { ASSET_KIND_CHIPS, filterAssets, moveTileFocus, placeableAssets, type BrowserAsset } from './asset-browser-model';
import { createThumbSource, type ThumbSource } from './thumb-source';

export const ASSET_PANEL_ID = 'level.assets';
export const ASSET_PANEL_SIZE = { initial: 180, min: 120, max: 420, defaultCollapsed: true } as const;

const TILE = 96;
const GAP = 6;
const KIND_ICON = { model: LuBox, sprite: LuImage, image: LuImage, tileset: LuGrid3X3, background: LuMountain } as const;

/**
 * An extra tab for the panel (the extension point Theme G's Prefabs tab uses): `render` fills the body, `actions` sit
 * in the header while the tab is open. The built-in tab is `assets`; ids must be unique and not `assets`.
 */
export type AssetBrowserTab = { id: string; label: string; render: () => ReactNode; actions?: ReactNode };

export type AssetBrowserProps = {
  gameId: string;
  /** The manifest's assets; `undefined` while it loads. */
  assets: readonly BrowserAsset[] | undefined;
  /** Test seam: defaults to the real thumbnail source for `gameId`. */
  thumbs?: ThumbSource;
  /** "Import assets" in the empty state. Omitted, the browser opens the game's own asset picker in its body. */
  onImport?: () => void;
  tabs?: readonly AssetBrowserTab[];
  /** The canvas column the panel sits under. */
  children: ReactNode;
};

/** The level canvas column with the Assets panel docked under it (Phase 139 Theme C). */
export function AssetBrowser({ gameId, assets, thumbs, onImport, tabs = [], children }: AssetBrowserProps) {
  const panel = useBottomPanel(ASSET_PANEL_ID, ASSET_PANEL_SIZE);
  const [tab, setTab] = useState<string>('assets');
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<ReadonlySet<string>>(() => new Set(ASSET_KIND_CHIPS));
  const source = useMemo(() => thumbs ?? createThumbSource(gameId), [thumbs, gameId]);
  // The thumbnail cache dies with the panel (an injected source is its owner's to dispose).
  useEffect(() => () => (thumbs ? undefined : source.dispose()), [thumbs, source]);
  const root = useRef<HTMLElement | null>(null);

  const active = tabs.find((t) => t.id === tab);
  const options: [string, string][] = [['assets', 'Assets'], ...tabs.map((t): [string, string] => [t.id, t.label])];
  const toggleKind = (k: string) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (!next.delete(k)) next.add(k);
      return next;
    });

  const header =
    panel.collapsed ? null : (
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" onKeyDown={(e) => e.stopPropagation()}>
        {tabs.length > 0 ? (
          <div role="radiogroup" aria-label="Panel tab" className="flex items-center rounded border border-border p-0.5">
            {options.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tab === id}
                onClick={() => setTab(id)}
                className={`rounded px-1.5 py-0.5 text-[11px] ${tab === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {tab === 'assets' ? (
          <>
            <FilterInput value={query} onChange={setQuery} placeholder="Filter assets" className="w-36 shrink-0" />
            <div role="group" aria-label="Asset kinds" className="flex shrink-0 items-center gap-1">
              {ASSET_KIND_CHIPS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kinds.has(k)}
                  onClick={() => toggleKind(k)}
                  className={`rounded border px-1.5 py-0.5 text-[11px] ${kinds.has(k) ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </>
        ) : (
          active?.actions
        )}
      </div>
    );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="level-asset-browser-column">
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
      <BottomPanel
        id={ASSET_PANEL_ID}
        title="Assets"
        actions={header}
        ariaLabel="Assets"
        testId="level-asset-browser"
        resize={ASSET_PANEL_SIZE}
        bodyClassName="flex min-h-0 flex-1 flex-col"
      >
        <div
          ref={(el) => {
            root.current = el;
          }}
          className="flex min-h-0 flex-1 flex-col outline-none"
          onKeyDown={(e) => {
            if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
              e.preventDefault();
              root.current?.closest('section')?.querySelector<HTMLInputElement>('input[placeholder="Filter assets"]')?.focus();
            }
          }}
        >
          {tab === 'assets' || !active ? (
            <AssetGrid gameId={gameId} assets={assets} query={query} kinds={kinds} source={source} onImport={onImport} />
          ) : (
            active.render()
          )}
        </div>
      </BottomPanel>
    </div>
  );
}

function AssetGrid({ gameId, assets, query, kinds, source, onImport }: { gameId: string; assets: readonly BrowserAsset[] | undefined; query: string; kinds: ReadonlySet<string>; source: ThumbSource; onImport?: () => void }) {
  const [picking, setPicking] = useState(false);
  const all = useMemo(() => (assets ? placeableAssets(assets) : null), [assets]);
  const shown = useMemo(() => (all ? filterAssets(all, query, kinds) : []), [all, query, kinds]);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [focus, setFocus] = useState(0);
  const armed = useArmedAsset();

  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 640));
    ro.observe(el);
    setWidth(el.clientWidth || 640);
    return () => ro.disconnect();
  }, [all]);

  const columns = Math.max(1, Math.floor((width + GAP) / (TILE + GAP)));
  const rows = Math.ceil(shown.length / columns);
  const virtual = useVirtualizer({
    count: rows,
    getScrollElement: () => scroller.current,
    estimateSize: () => TILE + GAP,
    overscan: 3,
    initialRect: { width: 640, height: 240 },
  });

  // After an arrow key the focused tile may be scrolled out of the virtual window: bring its row in, then focus it.
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (!pendingFocus.current) return;
    scroller.current?.querySelector<HTMLElement>(`[data-tile-index="${focus}"]`)?.focus();
    pendingFocus.current = false;
  });
  const onTileKey = (e: KeyboardEvent<HTMLElement>, index: number) => {
    const next = moveTileFocus(index, e.key, columns, shown.length);
    if (next === index && e.key.startsWith('Arrow')) return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      pendingFocus.current = true;
      setFocus(next);
      virtual.scrollToIndex(Math.floor(next / columns));
    }
  };

  if (all === null) {
    return (
      <div className="flex flex-wrap gap-1.5 p-2" data-testid="level-assets-loading" aria-busy>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-24" />
        ))}
      </div>
    );
  }
  if (all.length === 0) {
    return picking ? (
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <GameAssetPicker gameId={gameId} onDone={() => setPicking(false)} />
      </div>
    ) : (
      <EmptyState
        icon={LuPackagePlus}
        title="No assets yet"
        body="Import models and images to place them in the level."
        action={<EmptyStateButton icon={LuPackagePlus} label="Import assets" onClick={onImport ?? (() => setPicking(true))} />}
      />
    );
  }
  if (shown.length === 0) return <p className="p-3 text-xs text-muted-foreground">No asset matches the filter.</p>;

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="level-assets-grid" role="grid" aria-label="Assets" aria-rowcount={rows}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((row) => (
          <div key={row.key} role="row" className="absolute left-0 flex gap-1.5" style={{ top: row.start, height: TILE }}>
            {shown.slice(row.index * columns, row.index * columns + columns).map((asset, c) => {
              const index = row.index * columns + c;
              return (
                <Tile
                  key={asset.name}
                  asset={asset}
                  index={index}
                  tabbable={index === focus}
                  armed={armed?.kind === 'asset' && armed.name === asset.name}
                  source={source}
                  onKeyDown={(e) => onTileKey(e, index)}
                  onFocus={() => setFocus(index)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ asset, index, tabbable, armed, source, onKeyDown, onFocus }: { asset: BrowserAsset; index: number; tabbable: boolean; armed: boolean; source: ThumbSource; onKeyDown: (e: KeyboardEvent<HTMLElement>) => void; onFocus: () => void }) {
  const Icon = KIND_ICON[asset.kind as keyof typeof KIND_ICON] ?? LuImage;
  // undefined = still rendering (skeleton), null = no thumbnail (kind icon).
  const [thumb, setThumb] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setThumb(undefined);
    source.get(asset).then(
      (url) => live && setThumb(url),
      () => live && setThumb(null),
    );
    return () => {
      live = false;
    };
  }, [source, asset]);
  const toggleArm = () => arm(armed ? null : { kind: 'asset', name: asset.name, assetKind: asset.kind });
  return (
    <button
      type="button"
      role="gridcell"
      draggable
      data-tile-index={index}
      data-testid="level-asset-tile"
      aria-label={`${asset.name} (${asset.kind})`}
      aria-pressed={armed}
      tabIndex={tabbable ? 0 : -1}
      title={`${asset.name}\n${asset.kind} · ${asset.path}`}
      onDragStart={(e) => startAssetDrag(e.dataTransfer, { kind: 'asset', name: asset.name, assetKind: asset.kind })}
      onDragEnd={endAssetDrag}
      onClick={toggleArm}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          toggleArm();
        } else onKeyDown(e);
      }}
      onFocus={onFocus}
      style={{ width: TILE, height: TILE }}
      className={`flex shrink-0 flex-col items-center gap-1 rounded border p-1 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-primary ${armed ? 'border-primary bg-primary/10' : 'border-border bg-muted/40 hover:bg-accent'}`}
    >
      <span className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded bg-muted">
        {thumb === undefined ? (
          <Skeleton className="h-full w-full" />
        ) : thumb ? (
          <img src={thumb} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
        ) : (
          <Icon aria-hidden className="h-6 w-6 text-muted-foreground" />
        )}
      </span>
      <span className="w-full truncate text-center">{asset.name}</span>
    </button>
  );
}
