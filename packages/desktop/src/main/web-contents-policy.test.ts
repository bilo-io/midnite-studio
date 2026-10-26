import { describe, expect, it, vi } from 'vitest';

import {
  applyAppWebContentsPolicy,
  type PolicyEvent,
  type PolicyTarget,
} from './web-contents-policy';

const APP_SESSION = { name: 'default' };

function fakeContents(type: string, session: unknown = APP_SESSION) {
  const listeners = new Map<string, (event: PolicyEvent, url: string) => void>();
  let openHandler: ((d: { url: string }) => { action: 'deny' }) | undefined;
  const wc: PolicyTarget = {
    getType: () => type,
    session,
    on: (event, listener) => void listeners.set(event, listener),
    setWindowOpenHandler: (h) => {
      openHandler = h;
    },
  };
  const navigate = (url: string) => {
    const event = { preventDefault: vi.fn() };
    listeners.get('will-navigate')?.(event, url);
    return event.preventDefault;
  };
  return { wc, listeners, navigate, open: (url: string) => openHandler?.({ url }) };
}

describe('applyAppWebContentsPolicy', () => {
  it('ignores non-window contents (browser tabs have their own policy)', () => {
    const { wc, listeners } = fakeContents('browserView');
    expect(applyAppWebContentsPolicy(wc, APP_SESSION, null, vi.fn())).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it('ignores a WebContentsView on another partition even though Electron reports it as a window', () => {
    // Electron 42: a browser tab's `WebContentsView` contents report `getType() === 'window'`.
    const open = vi.fn();
    const { wc, listeners, navigate } = fakeContents('window', { name: 'persist:browser' });
    expect(applyAppWebContentsPolicy(wc, APP_SESSION, null, open)).toBe(false);
    expect(listeners.size).toBe(0);
    expect(navigate('https://www.google.com/search?q=x')).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('allows the app own file: document', () => {
    const open = vi.fn();
    const { wc, navigate } = fakeContents('window');
    applyAppWebContentsPolicy(wc, APP_SESSION, null, open);
    // app documents (file:) are allowed
    expect(navigate('file:///Applications/App/index.html')).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('prevents a javascript: navigation and never opens it externally', () => {
    const open = vi.fn();
    const { wc, navigate } = fakeContents('window');
    applyAppWebContentsPolicy(wc, APP_SESSION, null, open);
    expect(navigate('javascript:alert(1)')).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('prevents an https: navigation and opens its parsed href externally', () => {
    const open = vi.fn();
    const { wc, navigate } = fakeContents('window');
    applyAppWebContentsPolicy(wc, APP_SESSION, null, open);
    expect(navigate('https://example.com/a b')).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.com/a%20b');
  });

  it('window.open: denies always, opens only parseable http(s)/mailto', () => {
    const open = vi.fn();
    const { wc, open: windowOpen } = fakeContents('window');
    applyAppWebContentsPolicy(wc, APP_SESSION, null, open);
    expect(windowOpen('https://example.com')).toEqual({ action: 'deny' });
    expect(windowOpen('javascript:alert(1)')).toEqual({ action: 'deny' });
    expect(windowOpen('file:///etc/passwd')).toEqual({ action: 'deny' });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.com/');
  });

  it('allows the dev-server origin in dev', () => {
    const { wc, navigate } = fakeContents('window');
    applyAppWebContentsPolicy(wc, APP_SESSION, 'http://localhost:5173', vi.fn());
    expect(navigate('http://localhost:5173/#/graph')).not.toHaveBeenCalled();
  });
});
