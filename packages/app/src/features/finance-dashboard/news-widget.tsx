import { useMemo, useState } from 'react';

import { LuAppWindow, LuExternalLink, LuNewspaper, LuPlus, LuRotateCcw, LuSettings2, LuTrash2, LuX } from 'react-icons/lu';

import { catalogueAsset, type MarketNewsSource } from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { Popover } from '../../components/popover';
import { Skeleton } from '../../components/skeleton';
import { openInMidnite, openLinkFromEvent } from '../../services/open-in-midnite';
import { AssetIcon } from './asset-icon';
import { formatAge } from './finance-format';
import { StaleHint } from './finance-parts';
import { MAX_FEEDS, MAX_KEYWORDS, useFinanceUiStore, type NewsConfig } from './finance-ui-store';
import { useKnownAssets, useNews, usePortfolio } from './use-markets';

/**
 * Headlines for what you watch.
 *
 * Fetched and parsed in main (RSS and Google News searches); this card only
 * lists them. The default sources cover the watchlist — one news search per
 * watched asset — plus a few publisher feeds, and the settings popover edits
 * both the feeds and the keywords.
 *
 * Clicking a headline follows the app's one link policy (`openLinkFromEvent`:
 * the stored in-app / system preference, with Mod/Alt-click overrides), and
 * each row also offers explicit buttons for the embedded Midnite browser and the
 * system browser — so neither destination depends on a modifier key.
 */

/** The sources a config resolves to. Exported so the choice of sources is testable on its own. */
export function newsSources(
  config: NewsConfig,
  watched: readonly { symbol: string; name: string }[],
): MarketNewsSource[] {
  const sources: MarketNewsSource[] = [];
  for (const feed of config.feeds) if (feed.enabled) sources.push({ kind: 'feed', url: feed.url, label: feed.label });
  for (const keyword of config.keywords) sources.push({ kind: 'keyword', query: keyword });
  if (config.useWatchlist) {
    for (const asset of watched.slice(0, 12)) sources.push({ kind: 'asset', symbol: asset.symbol, name: asset.name });
  }
  return sources;
}

export function NewsWidget() {
  const { data: portfolio } = usePortfolio();
  const known = useKnownAssets(portfolio);
  const config = useFinanceUiStore((s) => s.news);

  const watched = useMemo(() => {
    const set = new Set(portfolio?.watchlist ?? []);
    return known.filter((asset) => set.has(asset.symbol));
  }, [known, portfolio?.watchlist]);
  const sources = useMemo(() => newsSources(config, watched), [config, watched]);
  const news = useNews(sources);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] text-muted-foreground">
          {sources.length === 0
            ? 'No sources — open settings to add some.'
            : `${config.feeds.filter((f) => f.enabled).length} feeds · ${config.keywords.length} keywords${config.useWatchlist ? ' · watchlist' : ''}`}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <StaleHint stale={news.data?.stale ?? false} fetchedAt={null} what="Some feeds" />
          <NewsSettings />
        </div>
      </div>

      {news.isPending && sources.length > 0 ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState icon={LuNewspaper} title="Nothing to follow" body="Turn on the watchlist, or add a feed or keyword." />
      ) : news.isError ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          News is unavailable — {news.error instanceof Error ? news.error.message : 'try again shortly'}.
        </p>
      ) : (news.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={LuNewspaper}
          title="No headlines"
          body={(news.data?.failed.length ?? 0) > 0 ? `${news.data?.failed.length} source(s) did not answer.` : 'Nothing matched your sources.'}
        />
      ) : (
        <ul aria-label="Market headlines" className="flex flex-col divide-y divide-border/60">
          {news.data?.items.map((item) => (
            <li key={item.id} data-news={item.id} className="group flex items-start gap-2 py-2">
              {catalogueAsset(item.origin) ? (
                <AssetIcon symbol={item.origin} size={22} className="mt-0.5" />
              ) : (
                <span aria-hidden className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <LuNewspaper className="size-3" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={item.link}
                  title={item.link}
                  onClick={(event) => {
                    event.preventDefault();
                    openLinkFromEvent(item.link, event);
                  }}
                  className="line-clamp-2 text-[13px] font-medium leading-snug hover:underline"
                >
                  {item.title}
                </a>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {item.source} · {formatAge(item.publishedAt)}
                  {item.origin !== item.source ? ` · ${item.origin}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <IconButton
                  icon={LuAppWindow}
                  label="Open in Midnite browser"
                  size="sm"
                  onClick={() => openInMidnite(item.link, { target: 'in-app' })}
                />
                <IconButton
                  icon={LuExternalLink}
                  label="Open in system browser"
                  size="sm"
                  onClick={() => openInMidnite(item.link, { target: 'system' })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewsSettings() {
  const config = useFinanceUiStore((s) => s.news);
  const addFeed = useFinanceUiStore((s) => s.addFeed);
  const removeFeed = useFinanceUiStore((s) => s.removeFeed);
  const toggleFeed = useFinanceUiStore((s) => s.toggleFeed);
  const addKeyword = useFinanceUiStore((s) => s.addKeyword);
  const removeKeyword = useFinanceUiStore((s) => s.removeKeyword);
  const setUseWatchlist = useFinanceUiStore((s) => s.setUseWatchlist);
  const resetNews = useFinanceUiStore((s) => s.resetNews);
  const [feedUrl, setFeedUrl] = useState('');
  const [keyword, setKeyword] = useState('');
  const [feedError, setFeedError] = useState<string | null>(null);

  return (
    <Popover
      label="News settings"
      side="bottom"
      align="end"
      panelClassName="w-80"
      triggerClassName="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent"
      trigger={<LuSettings2 aria-hidden className="size-4" />}
    >
      <div className="flex max-h-[26rem] flex-col gap-3 overflow-auto p-3 text-xs">
        <label className="flex items-center justify-between gap-2">
          <span>
            Follow my watchlist
            <span className="block text-[11px] text-muted-foreground">One news search per watched asset.</span>
          </span>
          <input
            type="checkbox"
            checked={config.useWatchlist}
            onChange={(event) => setUseWatchlist(event.target.checked)}
            className="size-4 accent-[hsl(var(--primary))]"
          />
        </label>

        <section aria-label="Feeds" className="flex flex-col gap-1.5">
          <h4 className="font-semibold">Feeds</h4>
          <ul className="flex flex-col gap-1">
            {config.feeds.map((feed) => (
              <li key={feed.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Use ${feed.label}`}
                  checked={feed.enabled}
                  onChange={() => toggleFeed(feed.id)}
                  className="size-3.5 accent-[hsl(var(--primary))]"
                />
                <span className="min-w-0 flex-1 truncate" title={feed.url}>
                  {feed.label}
                </span>
                <IconButton icon={LuTrash2} label={`Remove ${feed.label}`} size="sm" tone="danger" onClick={() => removeFeed(feed.id)} />
              </li>
            ))}
            {config.feeds.length === 0 ? <li className="text-muted-foreground">No feeds.</li> : null}
          </ul>
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (addFeed(feedUrl) === null) {
                setFeedError(
                  config.feeds.length >= MAX_FEEDS
                    ? `At most ${MAX_FEEDS} feeds.`
                    : 'Enter a new http(s) feed address.',
                );
                return;
              }
              setFeedUrl('');
              setFeedError(null);
            }}
          >
            <input
              value={feedUrl}
              onChange={(event) => {
                setFeedUrl(event.target.value);
                setFeedError(null);
              }}
              aria-label="Feed address"
              placeholder="https://example.com/rss"
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" aria-label="Add feed" className="rounded border border-border p-1.5 hover:bg-accent">
              <LuPlus aria-hidden className="size-3.5" />
            </button>
          </form>
          {feedError ? <p role="alert" className="text-destructive">{feedError}</p> : null}
        </section>

        <section aria-label="Keywords" className="flex flex-col gap-1.5">
          <h4 className="font-semibold">Keywords</h4>
          <ul className="flex flex-wrap gap-1">
            {config.keywords.map((k) => (
              <li key={k} className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5">
                {k}
                <button type="button" aria-label={`Remove ${k}`} onClick={() => removeKeyword(k)} className="text-muted-foreground hover:text-foreground">
                  <LuX aria-hidden className="size-3" />
                </button>
              </li>
            ))}
            {config.keywords.length === 0 ? <li className="text-muted-foreground">No keywords.</li> : null}
          </ul>
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (addKeyword(keyword)) setKeyword('');
            }}
          >
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              aria-label="Keyword"
              placeholder={config.keywords.length >= MAX_KEYWORDS ? 'Keyword limit reached' : 'e.g. interest rates'}
              disabled={config.keywords.length >= MAX_KEYWORDS}
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" className="rounded border border-border px-2 py-1 hover:bg-accent">
              Add
            </button>
          </form>
        </section>

        <button
          type="button"
          onClick={resetNews}
          className="flex items-center gap-1 self-start text-muted-foreground hover:text-foreground"
        >
          <LuRotateCcw aria-hidden className="size-3" />
          Reset to defaults
        </button>
      </div>
    </Popover>
  );
}
