import type { GitOpResult, OllamaSearchResultItem } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

/**
 * Ollama library search (Phase 96 Theme D) — there is no official search API
 * (ollama/ollama#9142), so this scrapes the same server-rendered page a
 * browser gets from `https://ollama.com/search?q=<q>` (local + cloudable
 * results) and `?c=cloud&q=<q>` (cloud-only, via the same `c` capability
 * checkbox the page's own filter chips use). Runs in main only — never the
 * renderer, per the phase doc's own scope guardrail — and results are cached
 * per query for about an hour; a failed fetch serves the stale cache instead
 * of an error wall, with the cache's own age as `updatedAt`.
 *
 * The page markup is htmx-rendered Tailwind, not a documented contract, so
 * this parser is deliberately narrow (one regex per field) and treats "zero
 * rows parsed from a page that isn't ollama.com's own empty state" as a
 * parser bug, not a real empty result — see {@link isGenuinelyEmptyPage}.
 */

const SEARCH_ORIGIN = 'https://ollama.com';
const CACHE_TTL_MS = 60 * 60 * 1000; // ~1 hour
const FETCH_TIMEOUT_MS = 8000;
/** ollama.com serves a different (JS-shell) response to requests with no UA. */
const USER_AGENT =
  'Mozilla/5.0 (compatible; MidniteStudio/1.0; +https://github.com/bilo-io/midnite-studio)';

export type OllamaLibrarySearchScope = 'local' | 'cloud';

export type OllamaLibrarySearchData = {
  items: OllamaSearchResultItem[];
  /** True when this is a cache fallback served after a failed live fetch. */
  stale: boolean;
  /** ISO timestamp of the data actually being served (live fetch, or the cache entry's own fetch time). */
  updatedAt: string;
};

type CacheEntry = { items: OllamaSearchResultItem[]; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(query: string, scope: OllamaLibrarySearchScope): string {
  return `${scope}:${query.trim().toLowerCase()}`;
}

/** Test-only: drops every cached query. Settings ▸ Ollama's own "clear search cache" (Theme C) calls this too. */
export function clearOllamaSearchCache(): void {
  cache.clear();
}

async function fetchSearchHtml(
  query: string,
  scope: OllamaLibrarySearchScope,
  fetchImpl: typeof fetch,
): Promise<string> {
  const params = new URLSearchParams({ q: query });
  if (scope === 'cloud') params.set('c', 'cloud');
  const url = `${SEARCH_ORIGIN}/search?${params.toString()}`;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  deadline.unref?.();
  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ollama.com/search returned ${res.status}.`);
    return await res.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`ollama.com/search timed out after ${FETCH_TIMEOUT_MS} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * ollama.com's own "no matches" state — a `<li>No models found.</li>` row
 * inside the same `<ul role="list">` wrapper a populated page uses, and no
 * `/library/<model>` links anywhere. Distinguishing this from a parse
 * failure is the whole point of the zero-row check in {@link parseSearchHtml}'s
 * caller: a genuinely empty result is `ok: true, items: []`; a non-empty page
 * this parser fails to read anything from is `{kind:'error', code:'parse'}`.
 */
function isGenuinelyEmptyPage(html: string): boolean {
  return html.includes('No models found.') && !html.includes('/library/');
}

const ITEM_RE = /<a href="\/library\/([^"]+)" class="group w-full">([\s\S]*?)<\/a>\n<\/li>/g;
const NAME_RE = /<h2[^>]*>\s*<span[^>]*>([^<]*)<\/span>/;
const DESC_RE = /<p class="max-w-lg break-words text-neutral-800 text-md">([^<]*)<\/p>/;
const CHIP_RE =
  /<span\s+class="inline-flex my-1 items-center rounded-md\s+(\S+)\s[^"]*">([^<]*)<\/span>/g;
const PULLS_RE = /<span >([^<]*)<\/span>\s*<span class="hidden sm:flex">&nbsp;Pulls<\/span>/;
const UPDATED_RE = /<span class="flex items-center" title="([^"]*)">/;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function parseOneItem(name: string, block: string): OllamaSearchResultItem | null {
  const nameFromMarkup = NAME_RE.exec(block)?.[1];
  const resolvedName = decodeEntities(nameFromMarkup ?? name);
  if (!resolvedName) return null;

  const description = DESC_RE.exec(block)?.[1];
  const pulls = PULLS_RE.exec(block)?.[1];
  const updatedAt = UPDATED_RE.exec(block)?.[1];

  const capabilities: string[] = [];
  const variants: string[] = [];
  let cloud = false;
  CHIP_RE.lastIndex = 0;
  for (const chipMatch of block.matchAll(CHIP_RE)) {
    const [, chipClass, chipText] = chipMatch;
    const text = decodeEntities(chipText ?? '');
    if (!text) continue;
    if (chipClass?.startsWith('bg-cyan')) {
      cloud = true;
    } else if (chipClass?.startsWith('bg-indigo')) {
      capabilities.push(text);
    } else {
      variants.push(text);
    }
  }

  return {
    name: resolvedName,
    ...(description ? { description: decodeEntities(description) } : {}),
    ...(capabilities.length ? { capabilities } : {}),
    ...(variants.length ? { variants } : {}),
    ...(pulls ? { pulls: decodeEntities(pulls) } : {}),
    ...(updatedAt ? { updatedAt: decodeEntities(updatedAt) } : {}),
    ...(cloud ? { cloud: true } : {}),
  };
}

/** Exported for the unit test — parses a raw search page's HTML into rows, in document order. */
export function parseOllamaSearchHtml(html: string): OllamaSearchResultItem[] {
  const items: OllamaSearchResultItem[] = [];
  ITEM_RE.lastIndex = 0;
  for (const match of html.matchAll(ITEM_RE)) {
    const [, slug, block] = match;
    if (!slug) continue;
    const item = parseOneItem(slug, block ?? '');
    if (item) items.push(item);
  }
  return items;
}

/**
 * Searches ollama.com's library, main-process only. Never throws — every
 * outcome (live results, a stale-cache fallback, or a genuine failure) comes
 * back as a `GitOpResult`, per the phase's "IPC ops never throw" rule.
 */
export async function searchOllamaLibrary(
  query: string,
  scope: OllamaLibrarySearchScope = 'local',
  opts: { fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<GitOpResult<OllamaLibrarySearchData>> {
  const trimmed = query.trim();
  const now = opts.now ?? (() => Date.now());
  if (!trimmed) return ok({ items: [], stale: false, updatedAt: new Date(now()).toISOString() });

  const key = cacheKey(trimmed, scope);
  const cached = cache.get(key);
  if (cached && now() - cached.fetchedAt < CACHE_TTL_MS) {
    return ok({ items: cached.items, stale: false, updatedAt: new Date(cached.fetchedAt).toISOString() });
  }

  const serveStale = (): GitOpResult<OllamaLibrarySearchData> | null => {
    if (!cached) return null;
    return ok({ items: cached.items, stale: true, updatedAt: new Date(cached.fetchedAt).toISOString() });
  };

  try {
    const html = await fetchSearchHtml(trimmed, scope, opts.fetchImpl ?? fetch);
    const items = parseOllamaSearchHtml(html);
    if (items.length === 0 && !isGenuinelyEmptyPage(html)) {
      return serveStale() ?? failure('Could not parse ollama.com search results.', undefined, 'parse');
    }
    const fetchedAt = now();
    cache.set(key, { items, fetchedAt });
    return ok({ items, stale: false, updatedAt: new Date(fetchedAt).toISOString() });
  } catch (error) {
    return (
      serveStale() ?? failure(error instanceof Error ? error.message : String(error))
    );
  }
}
