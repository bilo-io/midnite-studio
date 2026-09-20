import { describe, expect, it, vi } from 'vitest';

import {
  appDocumentUrlPatterns,
  buildCsp,
  installCsp,
  type HeadersReceivedDetails,
} from './csp';

describe('buildCsp', () => {
  it('packaged policy blocks broad img https and omits finance hosts after Theme D', () => {
    const csp = buildCsp({ dev: false });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob: mstudio-file: https:");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("worker-src 'self' blob: data:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://api.open-meteo.com');
    expect(csp).toContain('https://geocoding-api.open-meteo.com');
    expect(csp).toContain('https://ipwho.is');
    expect(csp).not.toContain('api.twelvedata.com');
    expect(csp).not.toContain('api.coingecko.com');
  });

  it('dev policy adds Vite HMR script and websocket origins', () => {
    const csp = buildCsp({ dev: true, devServerOrigin: 'http://localhost:5173/' });
    expect(csp).toContain("script-src 'self' 'unsafe-inline' http://localhost:5173");
    expect(csp).toContain('connect-src');
    expect(csp).toContain('http://localhost:5173');
    expect(csp).toContain('ws://localhost:5173');
  });
});

describe('appDocumentUrlPatterns', () => {
  it('includes file documents and the dev-server origin when set', () => {
    expect(appDocumentUrlPatterns(null)).toEqual(['file://*/*']);
    expect(appDocumentUrlPatterns('http://localhost:5273')).toEqual([
      'file://*/*',
      'http://localhost:5273/*',
    ]);
  });
});

describe('installCsp', () => {
  it('sets Content-Security-Policy on main-frame responses only', () => {
    const listeners: ((
      details: HeadersReceivedDetails,
      callback: (response: { responseHeaders?: Record<string, string | string[]> }) => void,
    ) => void)[] = [];
    const session = {
      webRequest: {
        onHeadersReceived: vi.fn((_filter, listener) => listeners.push(listener)),
      },
    };

    installCsp(session, { dev: false, devServerOrigin: null });

    expect(session.webRequest.onHeadersReceived).toHaveBeenCalledWith(
      { urls: ['file://*/*'] },
      expect.any(Function),
    );

    const callback = vi.fn();
    listeners[0]?.(
      {
        url: 'file:///Applications/Midnite%20Studio.app/Contents/Resources/renderer/index.html',
        resourceType: 'mainFrame',
        responseHeaders: { 'content-type': ['text/html'] },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      responseHeaders: expect.objectContaining({
        'Content-Security-Policy': [buildCsp({ dev: false })],
      }),
    });

    callback.mockClear();
    listeners[0]?.(
      {
        url: 'file:///Applications/Midnite%20Studio.app/Contents/Resources/renderer/assets/index.js',
        resourceType: 'script',
        responseHeaders: {},
      },
      callback,
    );
    expect(callback).toHaveBeenCalledWith({ responseHeaders: {} });
  });
});
