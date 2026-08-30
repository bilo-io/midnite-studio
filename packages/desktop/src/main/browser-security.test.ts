import { describe, expect, it, vi } from 'vitest';

import { cancelDownload, checkNavigationUrl, denyAllPermissions } from './browser-security';

describe('denyAllPermissions', () => {
  it('registers a request handler that always denies', () => {
    const requestHandlers: ((wc: unknown, permission: string, callback: (g: boolean) => void, details: unknown) => void)[] = [];
    const checkHandlers: ((wc: unknown, permission: string, origin: string) => boolean)[] = [];
    const session = {
      setPermissionRequestHandler: vi.fn((h) => requestHandlers.push(h)),
      setPermissionCheckHandler: vi.fn((h) => checkHandlers.push(h)),
    };

    denyAllPermissions(session);

    expect(session.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(session.setPermissionCheckHandler).toHaveBeenCalledTimes(1);

    const callback = vi.fn();
    requestHandlers[0]?.(undefined, 'camera', callback, undefined);
    requestHandlers[0]?.(undefined, 'clipboard-read', callback, undefined);
    expect(callback).toHaveBeenCalledWith(false);
    expect(callback).toHaveBeenCalledTimes(2);

    expect(checkHandlers[0]?.(undefined, 'geolocation', 'https://example.com')).toBe(false);
    expect(checkHandlers[0]?.(undefined, 'notifications', 'https://example.com')).toBe(false);
  });
});

describe('checkNavigationUrl', () => {
  it('allows http and https', () => {
    expect(checkNavigationUrl('https://example.com').allowed).toBe(true);
    expect(checkNavigationUrl('http://example.com').allowed).toBe(true);
  });

  it('blocks file, javascript, data and custom schemes', () => {
    expect(checkNavigationUrl('file:///etc/passwd')).toEqual({ allowed: false, blockedScheme: 'file:' });
    expect(checkNavigationUrl('javascript:alert(1)')).toEqual({
      allowed: false,
      blockedScheme: 'javascript:',
    });
    expect(checkNavigationUrl('data:text/html,hi')).toEqual({ allowed: false, blockedScheme: 'data:' });
    expect(checkNavigationUrl('mstudio-file://repo/x')).toEqual({
      allowed: false,
      blockedScheme: 'mstudio-file:',
    });
  });

  it('blocks an unparseable URL rather than throwing', () => {
    expect(checkNavigationUrl('not a url').allowed).toBe(false);
  });
});

describe('cancelDownload', () => {
  it('cancels the item and reports its filename', () => {
    const item = { getFilename: () => 'report.pdf', cancel: vi.fn() };
    const notify = vi.fn();

    cancelDownload(item, notify);

    expect(item.cancel).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('report.pdf');
  });
});
