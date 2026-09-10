import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateApp,
  destroyAllApps,
  disableApp,
  enableApp,
  reparentAppView,
  resetAppsServiceForTests,
  setAppBounds,
} from './apps-service';

/**
 * `apps-service.ts` is the second file (after `browser-service.ts`) to
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
    setBounds = vi.fn((b: unknown) => {
      this.bounds = b;
    });
  }

  function makeFakeSession() {
    const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    return {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
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

vi.mock('electron', () => ({
  WebContentsView: FakeWebContentsView,
  session: {
    fromPartition: vi.fn((name: string) => {
      const existing = fakeSessions.get(name);
      if (existing) return existing;
      const created = makeFakeSession();
      fakeSessions.set(name, created);
      return created;
    }),
  },
  shell: { openExternal: vi.fn() },
}));

type FakeView = InstanceType<typeof FakeWebContentsView>;

function fakeWindow() {
  const win = {
    isDestroyed: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { getZoomFactor: vi.fn(() => 1) } as unknown,
  };
  return win as unknown as import('electron').BrowserWindow;
}

describe('apps-service lifecycle', () => {
  beforeEach(() => {
    resetAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('enabling an app creates exactly one WebContentsView with its own persist:app-<id> partition', () => {
    const win = fakeWindow();
    enableApp(win, 'spotify');

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
    enableApp(win, 'spotify');
    enableApp(win, 'spotify');

    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
  });

  it('two different apps get two different partitions, never sharing one', () => {
    const win = fakeWindow();
    enableApp(win, 'spotify');
    enableApp(win, 'youtube');

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
    enableApp(win, 'spotify');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    disableApp('spotify');

    expect(win.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalledTimes(1);
  });

  it('disabling an app that was never enabled is a no-op', () => {
    expect(() => disableApp('spotify')).not.toThrow();
  });

  it('a disable -> enable round trip against the same partition preserves session data', () => {
    // The partition is a string key into Electron's own session store, not
    // anything this service owns — disabling never calls
    // clearStorageData/clearCache, so re-enabling resolves the identical
    // `session.fromPartition` object, proving nothing was wiped in between.
    const win = fakeWindow();
    enableApp(win, 'spotify');
    const sessionBeforeDisable = fakeSessions.get('persist:app-spotify');

    disableApp('spotify');
    enableApp(win, 'spotify');
    const sessionAfterReEnable = fakeSessions.get('persist:app-spotify');

    expect(sessionAfterReEnable).toBe(sessionBeforeDisable);
    // The permission handlers are configured once per partition, not once per
    // enable/disable cycle — re-enabling does not re-arm them.
    expect(sessionAfterReEnable?.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
  });

  it('quit (destroyAllApps) tears every tracked app down', () => {
    const win = fakeWindow();
    enableApp(win, 'spotify');
    enableApp(win, 'youtube');

    destroyAllApps();

    expect(win.contentView.removeChildView).toHaveBeenCalledTimes(2);
  });

  it('configures the partition session to deny every permission', () => {
    const win = fakeWindow();
    enableApp(win, 'spotify');

    const appSession = fakeSessions.get('persist:app-spotify');
    expect(appSession?.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(appSession?.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
  });
});

describe('apps-service navigation policy', () => {
  beforeEach(() => {
    resetAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  function createAndGetView(id: 'spotify' | 'google-calendar' | 'youtube' = 'spotify') {
    const win = fakeWindow();
    enableApp(win, id);
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
    const electron = await import('electron');
    const { view } = createAndGetView();
    const handler = (view.webContents.setWindowOpenHandler as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as (details: unknown) => { action: string };

    expect(handler({ url: 'https://opened.example' })).toEqual({ action: 'deny' });
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://opened.example');
  });

  it('does not open externally for a blocked scheme', async () => {
    const electron = await import('electron');
    const { view } = createAndGetView();
    const handler = (view.webContents.setWindowOpenHandler as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as (details: unknown) => { action: string };

    expect(handler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
    expect(electron.shell.openExternal).not.toHaveBeenCalled();
  });
});

describe('apps-service bounds', () => {
  beforeEach(() => {
    resetAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('scales an incoming bounds push by the host window zoom factor', () => {
    const win = fakeWindow();
    enableApp(win, 'spotify');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    (win.webContents as unknown as { getZoomFactor: ReturnType<typeof vi.fn> }).getZoomFactor.mockReturnValue(
      1.5,
    );

    setAppBounds('spotify', { x: 10, y: 20, width: 100, height: 200 });

    expect(view.bounds).toEqual({ x: 15, y: 30, width: 150, height: 300 });
  });

  it('setting bounds for an app that was never enabled is a no-op', () => {
    expect(() => setAppBounds('spotify', { x: 0, y: 0, width: 10, height: 10 })).not.toThrow();
  });
});

describe('apps-service activation (Theme C)', () => {
  beforeEach(() => {
    resetAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('activating an app hides every other enabled app in the SAME window', () => {
    const win = fakeWindow();
    enableApp(win, 'spotify');
    enableApp(win, 'youtube');
    const calls = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls;
    const spotifyView = calls[0]?.[0] as FakeView;
    const youtubeView = calls[1]?.[0] as FakeView;

    activateApp('youtube');

    expect(spotifyView.visible).toBe(false);
    expect(youtubeView.visible).toBe(true);
  });

  it('never touches a same-id app enabled in a DIFFERENT window', () => {
    const mainWin = fakeWindow();
    const popoutWin = fakeWindow();
    enableApp(mainWin, 'spotify');
    enableApp(popoutWin, 'youtube');
    const spotifyView = (mainWin.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    const youtubeView = (popoutWin.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    activateApp('spotify');

    expect(spotifyView.visible).toBe(true);
    // youtube lives in a different window entirely — activating spotify must
    // not reach across windows and hide it.
    expect(youtubeView.visible).toBe(true);
  });

  it('activating an app that was never enabled is a no-op', () => {
    expect(() => activateApp('spotify')).not.toThrow();
  });
});

describe('apps-service reparenting (Theme D)', () => {
  beforeEach(() => {
    resetAppsServiceForTests();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('moves the view to the next window and shows it there by default', () => {
    const main = fakeWindow();
    const popout = fakeWindow();
    enableApp(main, 'spotify');
    const view = (main.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    view.setVisible(false);

    reparentAppView('spotify', popout);

    expect(main.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(popout.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.visible).toBe(true);
  });

  it('honours an explicit visible:false — re-docking must not steal the flyout', () => {
    const main = fakeWindow();
    const popout = fakeWindow();
    enableApp(popout, 'spotify');
    const view = (popout.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    reparentAppView('spotify', main, { visible: false });

    expect(main.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.visible).toBe(false);
  });

  it('a same-window reparent is a no-op move but still applies the requested visibility', () => {
    const win = fakeWindow();
    enableApp(win, 'spotify');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    reparentAppView('spotify', win, { visible: false });

    expect(win.contentView.removeChildView).not.toHaveBeenCalled();
    expect(view.visible).toBe(false);
  });

  it('reparenting an app that was never enabled is a no-op', () => {
    const win = fakeWindow();
    expect(() => reparentAppView('spotify', win)).not.toThrow();
  });
});
