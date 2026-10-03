import { createHash } from 'node:crypto';

import type { MarketNewsItem, MarketNewsSource } from '@midnite/studio-shared';

import type { DiskCache } from './disk-cache';
import { getText, isPublicHttpUrl, type Fetcher } from './http';

/**
 * RSS / Atom reading for the news card. A forgiving, dependency-free parser —
 * feeds in the wild are rarely valid XML, and all this needs is a title, a
 * link, a date and a publisher.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x')) return safeFromCodePoint(Number.parseInt(body.slice(2), 16), whole);
    if (body.startsWith('#')) return safeFromCodePoint(Number.parseInt(body.slice(1), 10), whole);
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function safeFromCodePoint(code: number, fallback: string): string {
  try {
    return Number.isFinite(code) ? String.fromCodePoint(code) : fallback;
  } catch {
    return fallback;
  }
}

/** Text content of the first `<tag>`; CDATA is unwrapped, then entities decoded and tags stripped. */
function tagText(block: string, tag: string): string | null {
  // `(?<!/)>` keeps a self-closing `<link href="…"/>` from being read as an opening tag.
  const match = new RegExp(`<${tag}(?:\\s[^>]*?)?(?<!/)>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (!match || match[1] === undefined) return null;
  const raw = match[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
  const body = cdata?.[1] ?? decodeEntities(raw);
  return decodeEntities(body.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() || null;
}

function atomLink(block: string): string | null {
  const alternate = /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i.exec(block);
  const any = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(block);
  const href = alternate?.[1] ?? any?.[1];
  return href ? decodeEntities(href) : null;
}

const hash = (value: string): string => createHash('sha1').update(value).digest('hex').slice(0, 16);

const safeLink = (link: string | null): string | null => {
  if (!link) return null;
  return /^https?:\/\//i.test(link) ? link : null;
};

/** Split "Headline - Publisher", the shape Google News gives every title. */
export function splitPublisher(title: string): { title: string; publisher: string | null } {
  const match = /^(.*\S)\s+[-–—]\s+([^-–—]{2,60})$/.exec(title);
  return match?.[1] && match[2] ? { title: match[1], publisher: match[2].trim() } : { title, publisher: null };
}

export function parseFeed(xml: string, origin: string, fallbackSource: string): MarketNewsItem[] {
  const channelTitle = tagText(xml.split(/<item\b|<entry\b/i)[0] ?? '', 'title') ?? fallbackSource;
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2] ?? '');
  const items: MarketNewsItem[] = [];
  for (const block of blocks) {
    const rawTitle = tagText(block, 'title');
    const link = safeLink(tagText(block, 'link') ?? atomLink(block));
    if (!rawTitle || !link) continue;
    // Only Google News writes "Headline - Publisher"; splitting anywhere else would eat real dashes.
    const { title, publisher } =
      fallbackSource === 'Google News' ? splitPublisher(rawTitle) : { title: rawTitle, publisher: null };
    const dateText = tagText(block, 'pubDate') ?? tagText(block, 'published') ?? tagText(block, 'updated') ?? tagText(block, 'dc:date');
    const parsed = dateText ? Date.parse(dateText) : Number.NaN;
    const summary = tagText(block, 'description') ?? tagText(block, 'summary');
    items.push({
      id: hash(link),
      title,
      link,
      source: tagText(block, 'source') ?? publisher ?? channelTitle,
      publishedAt: Number.isFinite(parsed) ? parsed : null,
      ...(summary && summary !== title ? { summary: summary.slice(0, 280) } : {}),
      origin,
    });
  }
  return items;
}

// --- sources → URLs --------------------------------------------------------------

const googleNewsUrl = (query: string): string =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

export type ResolvedSource = { url: string; origin: string; fallbackSource: string };

export function resolveSource(source: MarketNewsSource): ResolvedSource | null {
  switch (source.kind) {
    case 'feed':
      return isPublicHttpUrl(source.url)
        ? { url: source.url, origin: source.label ?? new URL(source.url).hostname, fallbackSource: source.label ?? new URL(source.url).hostname }
        : null;
    case 'keyword':
      return { url: googleNewsUrl(source.query), origin: source.query, fallbackSource: 'Google News' };
    case 'asset':
      return {
        // The name alone is ambiguous ("Apple"), the ticker alone too ("V"); both together read as the asset.
        url: googleNewsUrl(`${source.name} ${source.symbol} when:7d`),
        origin: source.symbol,
        fallbackSource: 'Google News',
      };
  }
}

export const NEWS_TTL_MS = 10 * 60_000;

export type NewsOutcome = { items: MarketNewsItem[]; stale: boolean; failed: string[] };

export function createNewsService(options: { fetcher: Fetcher; cache: DiskCache; now?: () => number }) {
  const { fetcher, cache } = options;
  const now = options.now ?? Date.now;

  async function loadSource(resolved: ResolvedSource): Promise<{ items: MarketNewsItem[]; stale: boolean } | null> {
    const key = `news.${hash(resolved.url)}`;
    const fresh = await cache.read<MarketNewsItem[]>(key, NEWS_TTL_MS);
    if (fresh) return { items: fresh.value.map((i) => ({ ...i, origin: resolved.origin })), stale: false };
    try {
      const xml = await getText(fetcher, resolved.origin, resolved.url, 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*');
      const items = parseFeed(xml, resolved.origin, resolved.fallbackSource);
      if (items.length === 0) throw new Error('no items');
      await cache.write(key, { fetchedAt: now(), source: resolved.origin, value: items }).catch(() => undefined);
      return { items, stale: false };
    } catch {
      const old = await cache.readAny<MarketNewsItem[]>(key);
      return old ? { items: old.value.map((i) => ({ ...i, origin: resolved.origin })), stale: true } : null;
    }
  }

  async function getNews(sources: readonly MarketNewsSource[], limit: number): Promise<NewsOutcome> {
    const resolved = sources.map((s) => ({ source: s, resolved: resolveSource(s) }));
    const failed: string[] = [];
    let stale = false;
    const all: MarketNewsItem[] = [];

    const queue = resolved.filter((r): r is { source: MarketNewsSource; resolved: ResolvedSource } => {
      if (r.resolved === null) {
        failed.push(r.source.kind === 'feed' ? r.source.url : 'source');
        return false;
      }
      return true;
    });

    let next = 0;
    const lane = async (): Promise<void> => {
      for (;;) {
        const entry = queue[next++];
        if (!entry) return;
        const got = await loadSource(entry.resolved);
        if (!got) failed.push(entry.resolved.origin);
        else {
          stale ||= got.stale;
          all.push(...got.items);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, lane));

    // De-duplicate on link and on normalised title, newest first.
    const seen = new Set<string>();
    const items = all
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .filter((item) => {
        const keys = [item.link, item.title.toLowerCase().replace(/\W+/g, ' ').trim()];
        if (keys.some((k) => seen.has(k))) return false;
        keys.forEach((k) => seen.add(k));
        return true;
      })
      .slice(0, limit);

    return { items, stale, failed };
  }

  return { getNews };
}
