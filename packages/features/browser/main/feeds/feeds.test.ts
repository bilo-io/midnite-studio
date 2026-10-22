import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReputationFeedService, type FeedFetch } from './feed-service';
import { matchFeeds, parseFeed } from './reputation-feeds';

const URLHAUS = `################################################################
# abuse.ch URLhaus Database Dump (CSV - online URLs only)        #
################################################################
http://198.51.100.7/bins/mozi.m
https://github.com/evil-user/payloads/releases/download/v1/loader.exe
http://malware.example/
not a url
`;

describe('parseFeed / matchFeeds', () => {
  const index = parseFeed('urlhaus', URLHAUS);

  it('skips comments and junk', () => {
    expect(index.size).toBe(3);
  });

  it('matches a whole-host entry by exact host, on either scheme', () => {
    expect(matchFeeds([index], 'https://malware.example/anything')).toEqual({ feed: 'urlhaus', category: 'malware', match: 'malware.example' });
    expect(matchFeeds([index], 'https://sub.malware.example/')).toBeNull();
  });

  it('matches a path entry by prefix only — never the whole compromised host', () => {
    expect(matchFeeds([index], 'https://github.com/evil-user/payloads/releases/download/v1/loader.exe')).toMatchObject({ feed: 'urlhaus' });
    expect(matchFeeds([index], 'https://github.com/')).toBeNull();
    expect(matchFeeds([index], 'https://github.com/evil-user')).toBeNull();
  });

  it('labels OpenPhish hits as phishing', () => {
    const phish = parseFeed('openphish', 'https://login-paypa1.example/\n');
    expect(matchFeeds([phish], 'https://login-paypa1.example/signin')).toMatchObject({ feed: 'openphish', category: 'phishing' });
  });
});

describe('createReputationFeedService', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'feeds-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const okFetch = (body: string) => vi.fn<FeedFetch>(async () => ({ ok: true, status: 200, text: async () => body }));

  it('makes no request and reports no reputation data while every feed is off', async () => {
    const fetch = okFetch(URLHAUS);
    const service = createReputationFeedService({ directory: dir, fetch });
    service.setEnabled({ urlhaus: false, openphish: false });
    expect(await service.refresh('urlhaus')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(service.reputation()).toBe('unavailable');
    expect(service.match('http://malware.example/')).toBeNull();
    service.dispose();
  });

  it('pulls an enabled feed, writes it 0600 and matches from it', async () => {
    const fetch = okFetch(URLHAUS);
    const service = createReputationFeedService({ directory: dir, fetch, refreshMs: 1e9 });
    service.setEnabled({ urlhaus: true, openphish: false });
    expect(await service.refresh('urlhaus')).toBe(true);
    expect(fetch).toHaveBeenCalledWith('https://urlhaus.abuse.ch/downloads/text_online/', expect.anything());
    const file = join(dir, 'browser-feeds', 'urlhaus.txt');
    expect(readFileSync(file, 'utf8')).toBe(URLHAUS);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(service.reputation()).toBe('checked');
    expect(service.match('http://malware.example/')).toMatchObject({ feed: 'urlhaus' });
    service.dispose();
  });

  it('loads the last pull from disk on enable, and drops it when switched off', () => {
    mkdirSync(join(dir, 'browser-feeds'), { recursive: true });
    writeFileSync(join(dir, 'browser-feeds', 'urlhaus.txt'), URLHAUS);
    const fetch = okFetch(URLHAUS);
    const service = createReputationFeedService({ directory: dir, fetch, refreshMs: 1e9 });
    service.setEnabled({ urlhaus: true, openphish: false });
    expect(service.match('http://malware.example/')).not.toBeNull();
    service.setEnabled({ urlhaus: false, openphish: false });
    expect(service.match('http://malware.example/')).toBeNull();
    expect(service.reputation()).toBe('unavailable');
    service.dispose();
  });

  it('keeps the previous list when a pull fails', async () => {
    const fetch = vi.fn<FeedFetch>(async () => ({ ok: false, status: 503, text: async () => '' }));
    const log = vi.fn();
    const service = createReputationFeedService({ directory: dir, fetch, log, refreshMs: 1e9 });
    service.setEnabled({ urlhaus: false, openphish: true });
    expect(await service.refresh('openphish')).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('503'));
    expect(service.reputation()).toBe('unavailable');
    service.dispose();
  });
});
