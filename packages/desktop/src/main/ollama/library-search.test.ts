import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearOllamaSearchCache, parseOllamaSearchHtml, searchOllamaLibrary } from './library-search';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const LOCAL_HTML = fixture('ollama-search.html');
const CLOUD_HTML = fixture('ollama-search-cloud.html');
const EMPTY_HTML = fixture('ollama-search-empty.html');

// A markup-changed page: still non-empty (no "No models found." literal),
// but the `/library/<slug>` anchors this parser keys off are gone — mimics
// ollama.com changing its search result markup out from under us.
const BROKEN_HTML = LOCAL_HTML.replace(/\/library\//g, '/models/');

describe('parseOllamaSearchHtml', () => {
  it('parses the committed local-search fixture', () => {
    const items = parseOllamaSearchHtml(LOCAL_HTML);
    expect(items.length).toBeGreaterThan(5);

    const llama31 = items.find((item) => item.name === 'llama3.1');
    expect(llama31).toBeDefined();
    expect(llama31?.description).toContain('Llama 3.1 is a new state-of-the-art model');
    expect(llama31?.capabilities).toContain('tools');
    expect(llama31?.variants).toEqual(expect.arrayContaining(['8b', '70b', '405b']));
    expect(llama31?.pulls).toBe('119.8M');
    expect(llama31?.updatedAt).toBe('Nov 30, 2024 10:34 PM UTC');
    expect(llama31?.cloud).toBeUndefined();
  });

  it('parses the committed cloud-filtered fixture, flagging cloud rows', () => {
    const items = parseOllamaSearchHtml(CLOUD_HTML);
    expect(items.length).toBeGreaterThan(0);

    const qwen = items.find((item) => item.name === 'qwen3.5');
    expect(qwen).toBeDefined();
    expect(qwen?.cloud).toBe(true);
    expect(qwen?.capabilities).toEqual(expect.arrayContaining(['vision', 'tools', 'thinking']));
    expect(qwen?.variants).toEqual(
      expect.arrayContaining(['0.8b', '2b', '4b', '9b', '27b', '35b', '122b']),
    );
  });

  it('returns zero rows for ollama.com\'s own "no matches" page', () => {
    expect(parseOllamaSearchHtml(EMPTY_HTML)).toEqual([]);
  });

  it('returns zero rows when the result markup no longer matches (parse regression)', () => {
    expect(parseOllamaSearchHtml(BROKEN_HTML)).toEqual([]);
  });
});

describe('searchOllamaLibrary', () => {
  beforeEach(() => {
    clearOllamaSearchCache();
  });

  it('fetches, parses and caches a local-scope query', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(LOCAL_HTML, { status: 200 }));
    const result = await searchOllamaLibrary('llama', 'local', { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.items.length).toBeGreaterThan(5);
    expect(result.value.stale).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://ollama.com/search?q=llama');

    // Second call within the TTL hits the cache, not the network.
    const cached = await searchOllamaLibrary('llama', 'local', { fetchImpl });
    expect(cached.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('requests the cloud-filtered URL for scope "cloud"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(CLOUD_HTML, { status: 200 }));
    await searchOllamaLibrary('qwen', 'cloud', { fetchImpl });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://ollama.com/search?q=qwen&c=cloud');
  });

  it('returns a genuine empty result without failing, for a real no-match page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(EMPTY_HTML, { status: 200 }));
    const result = await searchOllamaLibrary('zzzznonexistentqueryxyz123', 'local', { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.items).toEqual([]);
  });

  it('returns {ok:false, kind:"error", code:"parse"} for a non-empty page that yields zero rows', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(BROKEN_HTML, { status: 200 }));
    const result = await searchOllamaLibrary('llama', 'local', { fetchImpl });
    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: expect.any(String),
      code: 'parse',
    });
  });

  it('serves the stale cache on a fetch failure after a prior success', async () => {
    const okFetch = vi.fn().mockResolvedValue(new Response(LOCAL_HTML, { status: 200 }));
    let now = 0;
    const first = await searchOllamaLibrary('llama', 'local', { fetchImpl: okFetch, now: () => now });
    expect(first.ok).toBe(true);

    now = 2 * 60 * 60 * 1000; // past the ~1h TTL
    const failingFetch = vi.fn().mockRejectedValue(new Error('network down'));
    const second = await searchOllamaLibrary('llama', 'local', { fetchImpl: failingFetch, now: () => now });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('expected ok');
    expect(second.value.stale).toBe(true);
    expect(second.value.items.length).toBeGreaterThan(5);
  });

  it('serves a stale parse-failure cache too, rather than a raw error, once something has succeeded', async () => {
    const okFetch = vi.fn().mockResolvedValue(new Response(LOCAL_HTML, { status: 200 }));
    let now = 0;
    await searchOllamaLibrary('llama', 'local', { fetchImpl: okFetch, now: () => now });

    now = 2 * 60 * 60 * 1000;
    const brokenFetch = vi.fn().mockResolvedValue(new Response(BROKEN_HTML, { status: 200 }));
    const result = await searchOllamaLibrary('llama', 'local', { fetchImpl: brokenFetch, now: () => now });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.stale).toBe(true);
  });

  it('fails without a cache to fall back to', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connection refused'));
    const result = await searchOllamaLibrary('llama', 'local', { fetchImpl });
    expect(result).toEqual({ ok: false, kind: 'error', message: 'connection refused' });
  });

  it('short-circuits an empty query without a network call', async () => {
    const fetchImpl = vi.fn();
    const result = await searchOllamaLibrary('   ', 'local', { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.items).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
