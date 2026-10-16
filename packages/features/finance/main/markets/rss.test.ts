import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDiskCache } from './disk-cache';
import type { Fetcher } from './http';
import { NEWS_TTL_MS, createNewsService, decodeEntities, parseFeed, resolveSource, splitPublisher } from './rss';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example Wire</title>
<item>
  <title><![CDATA[Bitcoin tops $90k &amp; keeps going - CoinDesk]]></title>
  <link>https://example.com/a?x=1&amp;y=2</link>
  <pubDate>Fri, 02 Oct 2026 12:00:00 GMT</pubDate>
  <description><![CDATA[<p>Prices <b>rallied</b> overnight.</p>]]></description>
  <source url="https://coindesk.com">CoinDesk</source>
</item>
<item>
  <title>No link here</title>
</item>
<item>
  <title>Relative link</title>
  <link>/relative</link>
</item>
<item>
  <title>javascript link</title>
  <link>javascript:alert(1)</link>
</item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Wire</title>
<entry><title>Ether &#8211; steady</title><link rel="alternate" href="https://example.com/e"/><updated>2026-10-01T08:00:00Z</updated><summary>Quiet day.</summary></entry>
</feed>`;

describe('parseFeed', () => {
  it('reads RSS items: CDATA, entities, publisher and date', () => {
    const items = parseFeed(RSS, 'BTC', 'Google News');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Bitcoin tops $90k & keeps going',
      link: 'https://example.com/a?x=1&y=2',
      source: 'CoinDesk',
      publishedAt: Date.parse('2026-10-02T12:00:00Z'),
      summary: 'Prices rallied overnight.',
      origin: 'BTC',
    });
  });

  it('drops items with no link, a relative link, or a non-http scheme', () => {
    expect(parseFeed(RSS, 'x', 'Google News').map((i) => i.title)).toEqual(['Bitcoin tops $90k & keeps going']);
  });

  it('reads Atom entries, using the feed title as the publisher', () => {
    const [item] = parseFeed(ATOM, 'ETH', 'fb');
    expect(item).toMatchObject({ title: 'Ether – steady', link: 'https://example.com/e', source: 'Atom Wire', publishedAt: Date.parse('2026-10-01T08:00:00Z') });
  });

  it('does not read a self-closing Atom link as an opening tag', () => {
    const xml = '<feed><title>F</title><entry><title>T</title><link rel="self" href="https://x.example/self"/><link rel="alternate" href="https://x.example/real"/></entry><entry><title>U</title><link href="https://x.example/u"/></entry></feed>';
    expect(parseFeed(xml, 'o', 'f').map((i) => i.link)).toEqual(['https://x.example/real', 'https://x.example/u']);
  });

  it('gives a stable id per link and tolerates garbage', () => {
    expect(parseFeed(RSS, 'a', 'b')[0]?.id).toBe(parseFeed(RSS, 'c', 'd')[0]?.id);
    expect(parseFeed('<html>not a feed</html>', 'a', 'b')).toEqual([]);
    expect(parseFeed('', 'a', 'b')).toEqual([]);
  });

  it('decodes numeric entities and leaves unknown ones', () => {
    expect(decodeEntities('a &#39;b&#39; &#x41; &unknown; &amp;amp;')).toBe("a 'b' A &unknown; &amp;");
    expect(decodeEntities('&#99999999999;')).toBe('&#99999999999;');
  });

  it('leaves dashes alone in feeds that are not Google News', () => {
    expect(parseFeed(RSS, 'x', 'Example')[0]?.title).toBe('Bitcoin tops $90k & keeps going - CoinDesk');
  });

  it('splits a Google News "Headline - Publisher" title', () => {
    expect(splitPublisher('Fed holds rates - Reuters')).toEqual({ title: 'Fed holds rates', publisher: 'Reuters' });
    expect(splitPublisher('No publisher here')).toEqual({ title: 'No publisher here', publisher: null });
  });
});

describe('resolveSource', () => {
  it('turns a keyword and an asset into Google News searches', () => {
    expect(resolveSource({ kind: 'keyword', query: 'rate cut' })?.url).toBe(
      'https://news.google.com/rss/search?q=rate%20cut&hl=en-US&gl=US&ceid=US:en',
    );
    const asset = resolveSource({ kind: 'asset', symbol: 'AAPL', name: 'Apple' });
    expect(decodeURIComponent(asset?.url ?? '')).toContain('Apple AAPL when:7d');
    expect(asset?.origin).toBe('AAPL');
  });

  it('refuses a feed on a private host', () => {
    expect(resolveSource({ kind: 'feed', url: 'http://192.168.0.2/feed' })).toBeNull();
    expect(resolveSource({ kind: 'feed', url: 'https://cointelegraph.com/rss' })?.origin).toBe('cointelegraph.com');
  });
});

describe('news service', () => {
  let dir: string;
  let clock = 1_800_000_000_000;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'news-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const service = (routes: Record<string, string | number>) => {
    const calls: string[] = [];
    const fetcher: Fetcher = async (url) => {
      calls.push(url);
      const hit = Object.entries(routes).find(([k]) => url.includes(k));
      const status = typeof hit?.[1] === 'number' ? hit[1] : hit ? 200 : 404;
      return { ok: status === 200, status, text: async () => (typeof hit?.[1] === 'string' ? hit[1] : '') };
    };
    return { calls, svc: createNewsService({ fetcher, cache: createDiskCache(dir, () => clock), now: () => clock }) };
  };

  it('merges sources newest-first and de-duplicates by link and title', async () => {
    const { svc } = service({ 'a.example': RSS, 'b.example': RSS.replace('12:00', '13:00') });
    const out = await svc.getNews(
      [
        { kind: 'feed', url: 'https://a.example/rss' },
        { kind: 'feed', url: 'https://b.example/rss' },
      ],
      10,
    );
    expect(out.items).toHaveLength(1);
    expect(out.failed).toEqual([]);
  });

  it('caches per source, and serves stale items when a source later fails', async () => {
    const first = service({ 'a.example': RSS });
    await first.svc.getNews([{ kind: 'feed', url: 'https://a.example/rss' }], 10);
    await first.svc.getNews([{ kind: 'feed', url: 'https://a.example/rss' }], 10);
    expect(first.calls).toHaveLength(1);

    clock += NEWS_TTL_MS + 1;
    const down = service({ 'a.example': 503 });
    const out = await down.svc.getNews([{ kind: 'feed', url: 'https://a.example/rss' }], 10);
    expect(out.items).toHaveLength(1);
    expect(out.stale).toBe(true);
  });

  it('names a source that produced nothing instead of failing the lot', async () => {
    const { svc } = service({ 'a.example': RSS });
    const out = await svc.getNews(
      [
        { kind: 'feed', url: 'https://a.example/rss' },
        { kind: 'feed', url: 'https://dead.example/rss' },
        { kind: 'feed', url: 'http://localhost/rss' },
      ],
      10,
    );
    expect(out.items).toHaveLength(1);
    expect(out.failed).toEqual(expect.arrayContaining(['dead.example', 'http://localhost/rss']));
  });

  it('honours the limit', async () => {
    const many = `<rss><channel><title>T</title>${Array.from({ length: 20 }, (_, i) => `<item><title>Story ${i}</title><link>https://x.example/${i}</link></item>`).join('')}</channel></rss>`;
    const { svc } = service({ 'x.example': many });
    expect((await svc.getNews([{ kind: 'feed', url: 'https://x.example/rss' }], 5)).items).toHaveLength(5);
  });
});
