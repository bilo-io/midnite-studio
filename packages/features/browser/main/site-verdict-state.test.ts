import { siteVerdictLevel, type SiteKnownBad, type SiteVerdict } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createSiteVerdictTracker, RECENT_HOSTS_CAP, type SiteVerdictContext } from './site-verdict-state';

function setup(overrides: Partial<SiteVerdictContext> = {}) {
  const emitted: Array<{ tabId: string; verdict: SiteVerdict }> = [];
  const ctx: SiteVerdictContext = {
    feeds: { match: () => null, reputation: () => 'unavailable' },
    tlsErrorFor: () => undefined,
    isBypassed: () => false,
    emit: (tabId, verdict) => emitted.push({ tabId, verdict }),
    ...overrides,
  };
  const tracker = createSiteVerdictTracker(ctx);
  tracker.bind('t1', 7);
  return { tracker, emitted, last: () => emitted.at(-1)!.verdict };
}

describe('commit', () => {
  it('emits a fresh ok verdict for a clean https page, with no reputation data while feeds are off', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'https://example.com/');
    expect(last()).toMatchObject({ origin: 'https://example.com', tls: 'ok', reputation: 'unavailable' });
    expect(siteVerdictLevel(last())).toBe('ok');
  });

  it('flags xn--pple-43d.com as a lookalike shown in punycode (acceptance)', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'https://xn--pple-43d.com/');
    expect(last().lookalike).toMatchObject({ kind: 'idn-mixed-script', against: 'apple.com' });
    expect(last().displayHost).toBe('xn--pple-43d.com');
  });

  it('records a bypassed TLS failure as danger', () => {
    const { tracker, last } = setup({ tlsErrorFor: () => 'net::ERR_CERT_DATE_INVALID', isBypassed: () => true });
    tracker.commit('t1', 'https://expired.badssl.com/');
    expect(last()).toMatchObject({ tls: 'error', tlsError: 'net::ERR_CERT_DATE_INVALID', bypassed: true });
    expect(siteVerdictLevel(last())).toBe('danger');
  });

  it('carries a feed hit and the checked reputation', () => {
    const hit: SiteKnownBad = { feed: 'openphish', category: 'phishing', match: 'evil.example' };
    const { tracker, last } = setup({ feeds: { match: () => hit, reputation: () => 'checked' } });
    tracker.commit('t1', 'https://evil.example/login');
    expect(last()).toMatchObject({ knownBad: hit, reputation: 'checked' });
  });

  it('remembers a visited host so a later confusable of it is caught', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'https://mybank.example/');
    tracker.commit('t1', 'https://rnybank.example/');
    expect(last().lookalike).toMatchObject({ kind: 'confusable', against: 'mybank.example' });
  });

  it('starts every navigation clean', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'https://example.com/');
    tracker.requestCompleted({ webContentsId: 7, url: 'http://cdn.example/i.png', method: 'GET', resourceType: 'image' });
    expect(last().mixedContent).toBe(true);
    tracker.commit('t1', 'https://example.com/next');
    expect(last().mixedContent).toBe(false);
  });
});

describe('requestCompleted', () => {
  it('flags an http image under https as mixed content (acceptance), once per URL', () => {
    const { tracker, emitted, last } = setup();
    tracker.commit('t1', 'https://example.com/');
    const image = { webContentsId: 7, url: 'http://cdn.example/i.png', method: 'GET', resourceType: 'image' };
    tracker.requestCompleted(image);
    tracker.requestCompleted(image);
    expect(last()).toMatchObject({ mixedContent: true, mixedContentUrls: ['http://cdn.example/i.png'] });
    expect(emitted).toHaveLength(2);
    expect(siteVerdictLevel(last())).toBe('caution');
  });

  it('ignores http subresources on an http page, and loopback ones on https', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'http://example.com/');
    tracker.requestCompleted({ webContentsId: 7, url: 'http://cdn.example/i.png', method: 'GET', resourceType: 'image' });
    expect(last().mixedContent).toBe(false);
    tracker.commit('t1', 'https://example.com/');
    tracker.requestCompleted({ webContentsId: 7, url: 'http://localhost:3000/x.png', method: 'GET', resourceType: 'image' });
    expect(last().mixedContent).toBe(false);
  });

  it('lists a vulnerable script library with its CVEs (acceptance)', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'https://example.com/');
    tracker.requestCompleted({ webContentsId: 7, url: 'https://code.jquery.com/jquery-1.12.4.min.js', method: 'GET', resourceType: 'script' });
    expect(last().vulnerableLibs).toEqual([
      expect.objectContaining({ library: 'jquery', version: '1.12.4', cve: expect.arrayContaining(['CVE-2020-11022']) }),
    ]);
  });

  it('flags a POST to plain http as an insecure form', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'https://example.com/');
    tracker.requestCompleted({ webContentsId: 7, url: 'http://collector.example/submit', method: 'POST', resourceType: 'xhr' });
    expect(last().insecureForm).toBe(true);
  });

  it('ignores requests from an unknown webContents and main-frame loads', () => {
    const emit = vi.fn();
    const { tracker } = setup({ emit });
    tracker.commit('t1', 'https://example.com/');
    emit.mockClear();
    tracker.requestCompleted({ webContentsId: 99, url: 'http://x.example/i.png', method: 'GET', resourceType: 'image' });
    tracker.requestCompleted({ webContentsId: 7, url: 'http://x.example/', method: 'GET', resourceType: 'mainFrame' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('remembers only the newest RECENT_HOSTS_CAP visited hosts, keeps seeded ones, and never a TLS-failed host', () => {
    const { tracker } = setup({ tlsErrorFor: (host) => (host === 'broken.example' ? 'net::ERR_CERT_DATE_INVALID' : undefined) });
    tracker.addKnownHosts(['vault.example']);
    tracker.commit('t1', 'https://broken.example/');
    expect(tracker.knownHosts().has('broken.example')).toBe(false);
    for (let i = 0; i <= RECENT_HOSTS_CAP; i++) tracker.commit('t1', `https://site${i}.example/`);
    expect(tracker.knownHosts().has('site0.example')).toBe(false);
    expect(tracker.knownHosts().has(`site${RECENT_HOSTS_CAP}.example`)).toBe(true);
    expect(tracker.knownHosts().has('vault.example')).toBe(true);
    expect(tracker.knownHosts().has('apple.com')).toBe(true);
  });
});

describe('Theme E / F hooks', () => {
  it('noteTrackerBlocked counts every request and lists each host once', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'https://example.com/');
    tracker.noteTrackerBlocked(7, 'tracker.example');
    tracker.noteTrackerBlocked(7, 'tracker.example');
    expect(last()).toMatchObject({ trackersBlocked: 2, trackerHosts: ['tracker.example'] });
    expect(siteVerdictLevel(last())).toBe('ok');
  });

  it('patch merges and emits; verdictForWebContents reads it back', () => {
    const { tracker, last } = setup();
    tracker.commit('t1', 'https://example.com/');
    tracker.patch('t1', { insecureForm: true });
    expect(last().insecureForm).toBe(true);
    expect(tracker.verdictForWebContents(7)?.insecureForm).toBe(true);
    tracker.forget('t1');
    expect(tracker.verdictForWebContents(7)).toBeUndefined();
  });
});
