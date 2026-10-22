import { describe, expect, it, vi } from 'vitest';

import { applyBrowserSessionPolicy, refuseWebviewAttach, sandboxedPageWebPreferences } from './browser-session-policy';
import { createPermissionGrantStore } from './permission-grant-store';

/**
 * Phase 117 Theme A: the one session policy, exercised against a plain fake that records every
 * call in order — the order is part of the contract (see the module doc), so a rule a later theme
 * adds in the wrong slot fails here rather than in a packaged build.
 */
function recordingSession() {
  const calls: string[] = [];
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    calls,
    handlers,
    setPermissionRequestHandler: vi.fn((_handler: unknown) => void calls.push('permission-request')),
    setPermissionCheckHandler: vi.fn((_handler: unknown) => void calls.push('permission-check')),
    setDevicePermissionHandler: vi.fn((_handler: unknown) => void calls.push('device')),
    setDisplayMediaRequestHandler: vi.fn((_handler: unknown) => void calls.push('display-media')),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      calls.push(`on:${event}`);
      handlers.set(event, handler);
    }),
    setSpellCheckerEnabled: vi.fn((enabled: boolean) => void calls.push(`spellcheck:${String(enabled)}`)),
  };
}

describe('applyBrowserSessionPolicy', () => {
  it('installs every rule, in the pinned order, with spellcheck off', () => {
    const session = recordingSession();
    applyBrowserSessionPolicy(session, { onDownloadRefused: vi.fn() });
    expect(session.calls).toEqual([
      'permission-request',
      'permission-check',
      'device',
      'display-media',
      'on:will-download',
      'spellcheck:false',
    ]);
  });

  it('denies every permission, request and check alike', () => {
    const session = recordingSession();
    applyBrowserSessionPolicy(session, { onDownloadRefused: vi.fn() });
    const request = session.setPermissionRequestHandler.mock.calls[0]?.[0] as unknown as (
      wc: unknown,
      permission: string,
      callback: (granted: boolean) => void,
    ) => void;
    const check = session.setPermissionCheckHandler.mock.calls[0]?.[0] as unknown as (
      wc: unknown,
      permission: string,
      origin: string,
    ) => boolean;
    for (const permission of ['media', 'camera', 'geolocation', 'notifications', 'clipboard-read']) {
      const callback = vi.fn();
      request({}, permission, callback);
      expect(callback).toHaveBeenCalledWith(false);
      expect(check({}, permission, 'https://example.com')).toBe(false);
    }
  });

  it('cancels a download and tells the caller which file, with the contents that asked', () => {
    const session = recordingSession();
    const onDownloadRefused = vi.fn();
    applyBrowserSessionPolicy(session, { onDownloadRefused });
    const item = { getFilename: () => 'ubuntu.iso', cancel: vi.fn() };
    const asker = { id: 'wc-1' };
    session.handlers.get('will-download')?.(undefined, item, asker);
    expect(item.cancel).toHaveBeenCalledTimes(1);
    expect(onDownloadRefused).toHaveBeenCalledWith('ubuntu.iso', asker);
  });

  it('turns spellcheck on only when the composer asks', () => {
    const session = recordingSession();
    applyBrowserSessionPolicy(session, { onDownloadRefused: vi.fn(), spellcheck: true });
    expect(session.setSpellCheckerEnabled).toHaveBeenCalledWith(true);
  });

  describe('PermissionGrantStore integration (Phase 117 Theme B)', () => {
    it('grants immediately when store has allow', () => {
      const session = recordingSession();
      const store = createPermissionGrantStore();
      store.set('https://example.com', 'camera', 'allow');

      applyBrowserSessionPolicy(session, {
        onDownloadRefused: vi.fn(),
        permissionStore: store,
      });

      const request = session.setPermissionRequestHandler.mock.calls[0]?.[0] as unknown as (
        wc: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details: unknown,
      ) => void;
      const callback = vi.fn();
      request({ getURL: () => 'https://example.com' }, 'camera', callback, {});
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('denies immediately when store has deny', () => {
      const session = recordingSession();
      const store = createPermissionGrantStore();
      store.set('https://example.com', 'camera', 'deny');

      const onPermissionRequest = vi.fn();
      applyBrowserSessionPolicy(session, {
        onDownloadRefused: vi.fn(),
        permissionStore: store,
        onPermissionRequest,
      });

      const request = session.setPermissionRequestHandler.mock.calls[0]?.[0] as unknown as (
        wc: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details: unknown,
      ) => void;
      const callback = vi.fn();
      request({ getURL: () => 'https://example.com' }, 'camera', callback, {});
      expect(callback).toHaveBeenCalledWith(false);
      expect(onPermissionRequest).not.toHaveBeenCalled();
    });

    it('denies non-promptable permissions immediately without checking store or prompting', () => {
      const session = recordingSession();
      const store = createPermissionGrantStore();
      const onPermissionRequest = vi.fn();

      applyBrowserSessionPolicy(session, {
        onDownloadRefused: vi.fn(),
        permissionStore: store,
        onPermissionRequest,
      });

      const request = session.setPermissionRequestHandler.mock.calls[0]?.[0] as unknown as (
        wc: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details: unknown,
      ) => void;

      for (const perm of ['clipboard-read', 'display-capture', 'pointerLock', 'midiSysex', 'hid', 'serial', 'usb']) {
        const callback = vi.fn();
        request({ getURL: () => 'https://example.com' }, perm, callback, {});
        expect(callback).toHaveBeenCalledWith(false);
      }
      expect(onPermissionRequest).not.toHaveBeenCalled();
    });

    it('prompts via onPermissionRequest on ask and rate-limits to at most once per min', () => {
      const session = recordingSession();
      const store = createPermissionGrantStore();
      const onPermissionRequest = vi.fn();

      applyBrowserSessionPolicy(session, {
        onDownloadRefused: vi.fn(),
        permissionStore: store,
        onPermissionRequest,
      });

      const request = session.setPermissionRequestHandler.mock.calls[0]?.[0] as unknown as (
        wc: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details: unknown,
      ) => void;

      const cb1 = vi.fn();
      request({ getURL: () => 'https://example.com' }, 'camera', cb1, {});
      expect(onPermissionRequest).toHaveBeenCalledTimes(1);
      expect(onPermissionRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'https://example.com',
          permission: 'camera',
          permissions: ['camera'],
        }),
      );

      // Second request immediately for same origin/permission is rate-limited: callback(false), no prompt
      const cb2 = vi.fn();
      request({ getURL: () => 'https://example.com' }, 'camera', cb2, {});
      expect(cb2).toHaveBeenCalledWith(false);
      expect(onPermissionRequest).toHaveBeenCalledTimes(1);
    });

    it('check handler answers strictly from store only and never prompts', () => {
      const session = recordingSession();
      const store = createPermissionGrantStore();
      store.set('https://example.com', 'geolocation', 'allow');

      applyBrowserSessionPolicy(session, {
        onDownloadRefused: vi.fn(),
        permissionStore: store,
      });

      const check = session.setPermissionCheckHandler.mock.calls[0]?.[0] as unknown as (
        wc: unknown,
        permission: string,
        origin: string,
        details?: unknown,
      ) => boolean;

      expect(check({}, 'geolocation', 'https://example.com')).toBe(true);
      expect(check({}, 'camera', 'https://example.com')).toBe(false);
      expect(check({}, 'clipboard-read', 'https://example.com')).toBe(false);
    });
  });
});

describe('requestGate (Phase 117 Theme G)', () => {
  type Listener = (details: { url: string; resourceType: string; webContents?: unknown }, cb: (r: { cancel?: boolean }) => void) => void;
  function webRequestSession() {
    const before: Listener[] = [];
    const session = {
      ...recordingSession(),
      webRequest: {
        onBeforeRequest: vi.fn((l: Listener) => void before.push(l)),
        onBeforeSendHeaders: vi.fn(),
        onHeadersReceived: vi.fn(),
      },
    };
    return { session, before };
  }
  const filter = (blocked: string[]) => ({
    getSettings: () => ({ blockTrackers: true, blockThirdPartyCookies: false, trimReferrer: false, reduceUserAgent: false }),
    isExcepted: () => false,
    onBlocked: vi.fn(),
    loadList: () => ({ match: ({ url }: { url: string }) => (blocked.some((b) => url.includes(b)) ? 'tracker.example' : null) }) as never,
  });

  it('runs in front of the tracker filter on the one onBeforeRequest listener', () => {
    const { session, before } = webRequestSession();
    applyBrowserSessionPolicy(session, {
      onDownloadRefused: vi.fn(),
      requestFilter: filter(['tracker.example']),
      requestGate: (d) => d.url.startsWith('https://attacker.example'),
    });
    expect(before).toHaveLength(1);
    const page = { getURL: () => 'https://example.com/' };
    const run = (url: string) => {
      const cb = vi.fn();
      before[0]!({ url, resourceType: 'xhr', webContents: page }, cb);
      return cb.mock.calls[0]?.[0];
    };
    expect(run('https://attacker.example/collect')).toEqual({ cancel: true });
    expect(run('https://tracker.example/pixel')).toEqual({ cancel: true });
    expect(run('https://example.com/api')).toEqual({});
  });

  it('installs alone when there is no filter (a partition without tracker rules)', () => {
    const { session, before } = webRequestSession();
    applyBrowserSessionPolicy(session, { onDownloadRefused: vi.fn(), requestGate: () => true });
    expect(before).toHaveLength(1);
    const cb = vi.fn();
    before[0]!({ url: 'https://x.example', resourceType: 'mainFrame' }, cb);
    expect(cb).toHaveBeenCalledWith({ cancel: true });
  });
});

describe('sandboxedPageWebPreferences', () => {
  it('never carries a preload, and names every dangerous flag as its safe value', () => {
    const prefs = sandboxedPageWebPreferences('persist:browser', { devTools: false });
    expect('preload' in prefs).toBe(false);
    expect(prefs).toEqual({
      partition: 'persist:browser',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: '',
      webSecurity: true,
      devTools: false,
    });
  });

  it('follows the composer for devTools and nothing else', () => {
    const dev = sandboxedPageWebPreferences('persist:app-spotify', { devTools: true });
    const packaged = sandboxedPageWebPreferences('persist:app-spotify', { devTools: false });
    expect(dev.devTools).toBe(true);
    expect({ ...dev, devTools: false }).toEqual(packaged);
  });
});

describe('refuseWebviewAttach', () => {
  it('prevents will-attach-webview', () => {
    const handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    refuseWebviewAttach({ on: (event, listener) => void handlers.set(event, listener) });
    const event = { preventDefault: vi.fn() };
    handlers.get('will-attach-webview')?.(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});
