import { describe, expect, it, vi } from 'vitest';

import {
  createUserAgentController,
  installRequestFilter,
  isThirdParty,
  registrableDomain,
  reduceUserAgent,
  rewriteReferrer,
  DEFAULT_PRIVACY_SETTINGS,
  type RequestFilterSession,
} from './browser-request-filter';
import { parseFilterList } from './filter-list';

describe('pure helpers', () => {
  it('finds the registrable domain', () => {
    expect(registrableDomain('a.b.example.com')).toBe('example.com');
    expect(registrableDomain('a.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('localhost')).toBe('localhost');
    expect(registrableDomain('127.0.0.1')).toBe('127.0.0.1');
  });
  it('decides third-party, never guessing when the page is unknown', () => {
    expect(isThirdParty('https://www.site.com/', 'https://cdn.site.com/a')).toBe(false);
    expect(isThirdParty('https://www.site.com/', 'https://t.other.com/a')).toBe(true);
    expect(isThirdParty(null, 'https://t.other.com/a')).toBe(false);
  });
  it('applies strict-origin-when-cross-origin', () => {
    expect(rewriteReferrer('https://a.com/x?y=1', 'https://a.com/z')).toBe('https://a.com/x?y=1');
    expect(rewriteReferrer('https://a.com/x?y=1', 'https://b.com/z')).toBe('https://a.com/');
    expect(rewriteReferrer('https://a.com/x', 'http://b.com/z')).toBeNull();
  });
  it('reduces the UA to the Chromium major and drops Electron and the app name', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) midnite-browser/1.2.3 Chrome/142.0.7444.52 Electron/42.0.0 Safari/537.36';
    const out = reduceUserAgent(ua);
    expect(out).toContain('Chrome/142.0.0.0');
    expect(out).not.toMatch(/Electron|midnite/);
  });
  it('restores the original UA when the switch goes off', () => {
    let current = 'Mozilla/5.0 Chrome/142.0.7444.52 Electron/42';
    const apply = createUserAgentController({ getUserAgent: () => current, setUserAgent: (u) => (current = u) });
    apply(true);
    expect(current).toContain('Chrome/142.0.0.0');
    apply(false);
    expect(current).toBe('Mozilla/5.0 Chrome/142.0.7444.52 Electron/42');
  });
});

function rig(settings = DEFAULT_PRIVACY_SETTINGS, excepted = false) {
  const handlers: Record<string, (d: never, cb: (r: unknown) => void) => void> = {};
  const session = {
    webRequest: {
      onBeforeRequest: (l: never) => (handlers.before = l),
      onBeforeSendHeaders: (l: never) => (handlers.send = l),
      onHeadersReceived: (l: never) => (handlers.recv = l),
    },
  } as unknown as RequestFilterSession;
  const onBlocked = vi.fn();
  installRequestFilter(session, {
    getSettings: () => settings,
    isExcepted: () => excepted,
    onBlocked,
    loadList: () => parseFilterList('||tracker.test^$third-party'),
  });
  const wc = { getURL: () => 'https://news.test/story' };
  const call = (h: 'before' | 'send' | 'recv', details: object) => {
    let out: unknown;
    handlers[h]!({ webContents: wc, resourceType: 'script', ...details } as never, (r) => (out = r));
    return out as Record<string, unknown>;
  };
  return { call, onBlocked, wc };
}

describe('installRequestFilter', () => {
  it('cancels a third-party tracker and reports it; the request never leaves', () => {
    const { call, onBlocked, wc } = rig();
    expect(call('before', { url: 'https://px.tracker.test/p.js' })).toEqual({ cancel: true });
    expect(onBlocked).toHaveBeenCalledWith(wc, 'tracker.test', 'https://px.tracker.test/p.js');
  });
  it('leaves first-party, main-frame and unlisted traffic alone', () => {
    const { call, onBlocked } = rig();
    expect(call('before', { url: 'https://news.test/a.js' })).toEqual({});
    expect(call('before', { url: 'https://tracker.test/', resourceType: 'mainFrame' })).toEqual({});
    expect(call('before', { url: 'https://fine.test/a.js' })).toEqual({});
    expect(onBlocked).not.toHaveBeenCalled();
  });
  it('does nothing when the switch is off or the site is excepted', () => {
    expect(rig({ ...DEFAULT_PRIVACY_SETTINGS, blockTrackers: false }).call('before', { url: 'https://tracker.test/p.js' })).toEqual({});
    expect(rig(DEFAULT_PRIVACY_SETTINGS, true).call('before', { url: 'https://tracker.test/p.js' })).toEqual({});
  });
  it('strips the outgoing Cookie on third-party requests only', () => {
    const { call } = rig();
    const third = call('send', { url: 'https://other.test/x', requestHeaders: { Cookie: 'a=1', Accept: '*/*' } });
    expect(third.requestHeaders).toEqual({ Accept: '*/*' });
    expect(call('send', { url: 'https://news.test/x', requestHeaders: { Cookie: 'a=1' } })).toEqual({});
  });
  it('trims a cross-site Referer to the origin', () => {
    const { call } = rig();
    const out = call('send', { url: 'https://other.test/x', requestHeaders: { Referer: 'https://news.test/story?id=7' } });
    expect(out.requestHeaders).toEqual({ Referer: 'https://news.test/' });
  });
  it('drops Set-Cookie from third-party responses and keeps first-party ones', () => {
    const { call } = rig();
    expect(call('recv', { url: 'https://other.test/x', responseHeaders: { 'set-cookie': ['a=1'], 'content-type': ['x'] } }).responseHeaders).toEqual({ 'content-type': ['x'] });
    expect(call('recv', { url: 'https://news.test/x', responseHeaders: { 'set-cookie': ['a=1'] } })).toEqual({});
  });
});
