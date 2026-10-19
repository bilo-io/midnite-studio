import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateWebApp,
  destroyAllWebApps,
  disableWebApp,
  discardWebApp,
  enableWebApp,
  isWebAppDiscarded,
  isWebAppDiscardEligible,
  reparentWebAppView,
  resetWebAppsServiceForTests,
  runWebAppsDiscardSweep,
  setWebAppBounds,
} from './web-apps-service';
import type { BrowserElectron, BrowserHostWindow } from './browser-electron';
import { installBrowserMain, type BrowserDiscardSettings, type BrowserLog } from './browser-main-deps';

/**
 * `web-apps-service.ts` is the second file (after `browser-service.ts`) to
 * construct a `WebContentsView`, so this fakes one the identical way
 * `browser-service.test.ts` does.
 */

const { FakeWebContentsView, fakeSessions, makeFakeSession } = vi.hoisted(() => {
  class FakeWebContents {
    destroyed = false;
    handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    loadURL = vi.fn(async () => undefined);
    setWindowOpenHandler = vi.fn();
    getZoomFactor = vi.fn(() => 1);
    on(event: string, handler: (...args: unknown[]) => void): this {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
      return this;
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    removeAllListeners = vi.fn(() => {
      this.handlers.clear();
    });
    close = vi.fn(() => {
      this.destroyed = true;
    });
    isCurrentlyAudible = vi.fn(() => false);
  }

  class FakeWebContentsView {
    webContents = new FakeWebContents();
    visible = true;
    bounds: unknown = null;
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown> = {}) {
      this.options = options;
    }
    setVisible = vi.fn((v: boolean) => {
      this.visible = v;
    });
    isVisible = vi.fn(() => this.visible);
    setBounds = vi.fn((b: unknown) => {
      this.bounds = b;
    });
  }

  function makeFakeSession() {
    const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    return {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      setDisplayMediaRequestHandler: vi.fn(),
      handlers,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      }),
    };
  }

  const fakeSessions = new Map<string, ReturnType<typeof makeFakeSession>>();

  return { FakeWebContents, FakeWebContentsView, fakeSessions, makeFakeSession };
});

// Phase 113 Theme L: the service reaches Electron and the settings mirror through the port its
// composer installs, so the same fakes are installed there rather than through `vi.mock('electron')`.
const electron = {
  createView: vi.fn((options: Record<string, unknown>) => new FakeWebContentsView(options)),
  sessionFromPartition: vi.fn((name: string) => {
    const existing = fakeSessions.get(name);
    if (existing) return existing;
    const created = makeFakeSession();
    fakeSessions.set(name, created);
    return created;
  }),
  onDisplayMetricsChanged: vi.fn(),
  openExternal: vi.fn(async () => undefined),
};
let discardSettings: BrowserDiscardSettings = {};
/** What desktop's `applySettingsSync` used to feed the sweep — only the two fields it reads. */
const applySettingsSync = (next: BrowserDiscardSettings & Record<string, unknown>): void => {
  discardSettings = { browserDiscardMs: next.browserDiscardMs, webAppDiscardIdle: next.webAppDiscardIdle };
};
const resetSettingsMirrorForTests = (): void => {
  discardSettings = {};
};
const log = Object.assign(vi.fn(), { warn: vi.fn(), error: vi.fn() }) as unknown as BrowserLog;
installBrowserMain({ electron: electron as unknown as BrowserElectron, log, readDiscardSettings: () => discardSettings });

type FakeView = InstanceType<typeof FakeWebContentsView>;

function fakeWindow() {
  const win = {
    isDestroyed: () => false,
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { getZoomFactor: vi.fn(() => 1) } as unknown,
  };
  return win as unknown as BrowserHostWindow;
}

describe('web-apps-service lifecycle', () => {
  beforeEach(() => {
    resetWebAppsServiceForTests();
    resetSettingsMirrorForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('enabling an app creates exactly one WebContentsView with its own persist:app-<id> partition', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');

    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    const webPreferences = view.options['webPreferences'] as Record<string, unknown>;
    expect(webPreferences['partition']).toBe('persist:app-spotify');
    expect(webPreferences['sandbox']).toBe(true);
    expect(webPreferences['contextIsolation']).toBe(true);
    expect(webPreferences['nodeIntegration']).toBe(false);
    expect(webPreferences['preload']).toBeUndefined();
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://open.spotify.com');
    expect(view.setVisible).toHaveBeenCalledWith(true);
  });

  it('is idempotent: enabling the same app twice does not attach a second view', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    enableWebApp(win, 'spotify');

    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
  });

  it('two different apps get two different partitions, never sharing one', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    enableWebApp(win, 'youtube');

    const calls = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls;
    const spotifyView = calls[0]?.[0] as FakeView;
    const youtubeView = calls[1]?.[0] as FakeView;
    expect((spotifyView.options['webPreferences'] as Record<string, unknown>)['partition']).toBe(
      'persist:app-spotify',
    );
    expect((youtubeView.options['webPreferences'] as Record<string, unknown>)['partition']).toBe(
      'persist:app-youtube',
    );
  });

  it('disabling destroys the view and detaches it from the window', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    disableWebApp('spotify');

    expect(win.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalledTimes(1);
  });

  it('disabling an app that was never enabled is a no-op', () => {
    expect(() => disableWebApp('spotify')).not.toThrow();
  });

  it('a disable -> enable round trip against the same partition preserves session data', () => {
    // The partition is a string key into Electron's own session store, not
    // anything this service owns — disabling never calls
    // clearStorageData/clearCache, so re-enabling resolves the identical
    // `session.fromPartition` object, proving nothing was wiped in between.
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    const sessionBeforeDisable = fakeSessions.get('persist:app-spotify');

    disableWebApp('spotify');
    enableWebApp(win, 'spotify');
    const sessionAfterReEnable = fakeSessions.get('persist:app-spotify');

    expect(sessionAfterReEnable).toBe(sessionBeforeDisable);
    // The permission handlers are configured once per partition, not once per
    // enable/disable cycle — re-enabling does not re-arm them.
    expect(sessionAfterReEnable?.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
  });

  it('quit (destroyAllWebApps) tears every tracked app down', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    enableWebApp(win, 'youtube');

    destroyAllWebApps();

    expect(win.contentView.removeChildView).toHaveBeenCalledTimes(2);
  });

  it('configures the partition session to deny every permission', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');

    const appSession = fakeSessions.get('persist:app-spotify');
    expect(appSession?.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(appSession?.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
    expect(appSession?.setDevicePermissionHandler).toHaveBeenCalledTimes(1);
    expect(appSession?.setDisplayMediaRequestHandler).toHaveBeenCalledTimes(1);
  });
});

describe('web-apps-service navigation policy', () => {
  beforeEach(() => {
    resetWebAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  function createAndGetView(id: 'spotify' | 'google-calendar' | 'youtube' = 'spotify') {
    const win = fakeWindow();
    enableWebApp(win, id);
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    return { win, view };
  }

  it('blocks a will-navigate to a non-http(s) scheme', () => {
    const { view } = createAndGetView();
    const willNavigate = view.webContents.handlers.get('will-navigate')?.[0];
    const details = { url: 'file:///etc/passwd', preventDefault: vi.fn() };

    willNavigate?.(details);

    expect(details.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('lets an http(s) will-navigate proceed', () => {
    const { view } = createAndGetView();
    const willNavigate = view.webContents.handlers.get('will-navigate')?.[0];
    const details = { url: 'https://elsewhere.example', preventDefault: vi.fn() };

    willNavigate?.(details);

    expect(details.preventDefault).not.toHaveBeenCalled();
  });

  it('denies every window-open request and routes an allowed one to the system browser', async () => {
    const { view } = createAndGetView();
    const handler = (view.webContents.setWindowOpenHandler as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as (details: unknown) => { action: string };

    expect(handler({ url: 'https://opened.example' })).toEqual({ action: 'deny' });
    expect(electron.openExternal).toHaveBeenCalledWith('https://opened.example');
  });

  it('does not open externally for a blocked scheme', async () => {
    const { view } = createAndGetView();
    const handler = (view.webContents.setWindowOpenHandler as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as (details: unknown) => { action: string };

    expect(handler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
    expect(electron.openExternal).not.toHaveBeenCalled();
  });
});

describe('web-apps-service bounds', () => {
  beforeEach(() => {
    resetWebAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('scales an incoming bounds push by the host window zoom factor', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    (win.webContents as unknown as { getZoomFactor: ReturnType<typeof vi.fn> }).getZoomFactor.mockReturnValue(
      1.5,
    );

    setWebAppBounds('spotify', { x: 10, y: 20, width: 100, height: 200 });

    expect(view.bounds).toEqual({ x: 15, y: 30, width: 150, height: 300 });
  });

  it('setting bounds for an app that was never enabled is a no-op', () => {
    expect(() => setWebAppBounds('spotify', { x: 0, y: 0, width: 10, height: 10 })).not.toThrow();
  });
});

describe('web-apps-service activation (Theme C)', () => {
  beforeEach(() => {
    resetWebAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('activating an app hides every other enabled app in the SAME window', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    enableWebApp(win, 'youtube');
    const calls = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls;
    const spotifyView = calls[0]?.[0] as FakeView;
    const youtubeView = calls[1]?.[0] as FakeView;

    activateWebApp(win, 'youtube');

    expect(spotifyView.visible).toBe(false);
    expect(youtubeView.visible).toBe(true);
  });

  it('never touches a same-id app enabled in a DIFFERENT window', () => {
    const mainWin = fakeWindow();
    const popoutWin = fakeWindow();
    enableWebApp(mainWin, 'spotify');
    enableWebApp(popoutWin, 'youtube');
    const spotifyView = (mainWin.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    const youtubeView = (popoutWin.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    activateWebApp(mainWin, 'spotify');

    expect(spotifyView.visible).toBe(true);
    // youtube lives in a different window entirely — activating spotify must
    // not reach across windows and hide it.
    expect(youtubeView.visible).toBe(true);
  });

  it('a null id hides every app tracked against that window', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    enableWebApp(win, 'youtube');
    const calls = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls;
    const spotifyView = calls[0]?.[0] as FakeView;
    const youtubeView = calls[1]?.[0] as FakeView;

    activateWebApp(win, null);

    expect(spotifyView.visible).toBe(false);
    expect(youtubeView.visible).toBe(false);
  });

  it('a null id never touches a different window', () => {
    const mainWin = fakeWindow();
    const popoutWin = fakeWindow();
    enableWebApp(popoutWin, 'youtube');
    const youtubeView = (popoutWin.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    activateWebApp(mainWin, null);

    expect(youtubeView.visible).toBe(true);
  });

  it('activating on a window with no tracked apps is a no-op', () => {
    const win = fakeWindow();
    expect(() => activateWebApp(win, 'spotify')).not.toThrow();
  });
});

describe('web-apps-service reparenting (Theme D)', () => {
  beforeEach(() => {
    resetWebAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('moves the view to the next window and shows it there by default', () => {
    const main = fakeWindow();
    const popout = fakeWindow();
    enableWebApp(main, 'spotify');
    const view = (main.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    view.setVisible(false);

    reparentWebAppView('spotify', popout);

    expect(main.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(popout.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.visible).toBe(true);
  });

  it('honours an explicit visible:false — re-docking must not steal the flyout', () => {
    const main = fakeWindow();
    const popout = fakeWindow();
    enableWebApp(popout, 'spotify');
    const view = (popout.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    reparentWebAppView('spotify', main, { visible: false });

    expect(main.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.visible).toBe(false);
  });

  it('a same-window reparent is a no-op move but still applies the requested visibility', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    reparentWebAppView('spotify', win, { visible: false });

    expect(win.contentView.removeChildView).not.toHaveBeenCalled();
    expect(view.visible).toBe(false);
  });

  it('reparenting an app that was never enabled is a no-op', () => {
    const win = fakeWindow();
    expect(() => reparentWebAppView('spotify', win)).not.toThrow();
  });
});

describe('isWebAppDiscardEligible', () => {
  const base = {
    effectiveVisible: false,
    audible: false,
    discardOptIn: true,
    hiddenSinceMs: 1_000,
    now: 1_000 + 600_000, // exactly 10 min
    discardMs: 600_000,
  };

  it('eligible when opted-in, hidden past threshold, not audible, and not visible', () => {
    expect(isWebAppDiscardEligible(base)).toBe(true);
  });

  it('excluded by default when discardOptIn is false (Phase 84 Theme F.4)', () => {
    expect(isWebAppDiscardEligible({ ...base, discardOptIn: false })).toBe(false);
  });

  it('never discards when effectively visible', () => {
    expect(isWebAppDiscardEligible({ ...base, effectiveVisible: true })).toBe(false);
  });

  it('never discards when audible (e.g. background music playing)', () => {
    expect(isWebAppDiscardEligible({ ...base, audible: true })).toBe(false);
  });

  it('never discards when threshold is 0 (disabled)', () => {
    expect(isWebAppDiscardEligible({ ...base, discardMs: 0 })).toBe(false);
  });

  it('never discards when hidden duration has not yet reached threshold', () => {
    expect(isWebAppDiscardEligible({ ...base, now: base.hiddenSinceMs + 300_000 })).toBe(false);
  });
});

describe('apps idle discard and wake', () => {
  it('discards an idle app past threshold when opted in, and restores it on activate', () => {
    const win = fakeWindow();
    applySettingsSync({
      autoFetchEnabled: true,
      autoFetchIntervalMs: 60_000,
      webAppDiscardIdle: { spotify: true, 'google-calendar': false, youtube: false },
      browserDiscardMs: 100, // 100ms for test
    });

    enableWebApp(win, 'spotify');
    setWebAppBounds('spotify', { x: 10, y: 20, width: 300, height: 400 });

    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;

    // Initially active in flyout
    activateWebApp(win, 'spotify');
    expect(isWebAppDiscarded('spotify')).toBe(false);

    // Close flyout (id: null) -> app becomes hidden
    activateWebApp(win, null);
    expect(view.visible).toBe(false);

    // Advance time past threshold
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 200);

    runWebAppsDiscardSweep();

    // App is now discarded to free memory
    expect(isWebAppDiscarded('spotify')).toBe(true);
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalled();

    // Next time user clicks the rail toggle / activates Spotify
    activateWebApp(win, 'spotify');
    expect(isWebAppDiscarded('spotify')).toBe(false);
    expect(win.contentView.addChildView).toHaveBeenCalledTimes(2);

    const recreatedView = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[1]?.[0] as FakeView;
    expect(recreatedView.visible).toBe(true);
    expect(recreatedView.bounds).toEqual({ x: 10, y: 20, width: 300, height: 400 });
  });

  it('does not discard an app that has NOT opted into idle discard', () => {
    const win = fakeWindow();
    applySettingsSync({
      autoFetchEnabled: true,
      autoFetchIntervalMs: 60_000,
      webAppDiscardIdle: { spotify: false, 'google-calendar': false, youtube: false },
      browserDiscardMs: 100,
    });

    enableWebApp(win, 'spotify');
    activateWebApp(win, null);

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 200);

    runWebAppsDiscardSweep();
    expect(isWebAppDiscarded('spotify')).toBe(false);
  });

  it('discards an app directly via discardWebApp', () => {
    const win = fakeWindow();
    enableWebApp(win, 'spotify');
    expect(isWebAppDiscarded('spotify')).toBe(false);
    discardWebApp('spotify');
    expect(isWebAppDiscarded('spotify')).toBe(true);
  });
});

