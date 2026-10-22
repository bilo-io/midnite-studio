import { describe, expect, it, vi } from 'vitest';

import { applyBrowserSessionPolicy, refuseWebviewAttach, sandboxedPageWebPreferences } from './browser-session-policy';

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
    setPermissionRequestHandler: vi.fn(() => void calls.push('permission-request')),
    setPermissionCheckHandler: vi.fn(() => void calls.push('permission-check')),
    setDevicePermissionHandler: vi.fn(() => void calls.push('device')),
    setDisplayMediaRequestHandler: vi.fn(() => void calls.push('display-media')),
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
