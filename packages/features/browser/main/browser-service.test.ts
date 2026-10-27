import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setBrowserSiteSafety, siteVerdicts } from './browser-site-safety';
import { LOGIN_FORM_WORLD_ID } from './login-form-read';
import { HOSTS_SEEN_FILE } from './host-first-seen';
import {
  KNOWN_BAD_ERROR_CODE,
  clearBrowserData,
  originVerdictLevel,
  proceedBrowserSite,
  activateBrowserTab,
  closeBrowserTab,
  createBrowserTab,
  destroyAllBrowserTabs,
  discardBrowserTab,
  getBrowserPermissionStore,
  isTabDiscardEligible,
  listBrowserPermissions,
  ownerWindowForBrowserTab,
  reparentBrowserTabs,
  resetAllBrowserPermissions,
  resetBrowserPermissionStoreForTest,
  resetBrowserServiceForTests,
  resolveBrowserPermission,
  revokeBrowserPermission,
  runBrowserDiscardSweep,
  setBrowserBounds,
  setBrowserDiscardMs,
  setBrowserKeepAwake,
  setBrowserSpellcheck,
  setBrowserZoom,
  toggleBrowserDevTools,
} from './browser-service';
import type { BrowserElectron, BrowserHostWindow } from './browser-electron';
import { installBrowserMain, type BrowserLog } from './browser-main-deps';

/**
 * `browser-service.ts` is the only file that constructs a `WebContentsView`,
 * so testing its lifecycle means faking one. Since Phase 113 Theme L the
 * service reaches Electron only through the port its composer installs
 * (`installBrowserMain`), so the fakes below are installed there instead of
 * through `vi.mock('electron', ...)` — the same fakes, the same assertions.
 */

/**
 * Hoisted: `vi.mock`'s factory below is hoisted above every import AND every
 * top-level `class`/`const`, so anything the factory closes over has to be
 * declared inside `vi.hoisted` too, or it throws "Cannot access before
 * initialization" the moment the mock factory runs.
 */
const { FakeWebContentsView, fakeSessions, makeFakeSession } = vi.hoisted(() => {
  let nextWebContentsId = 1;
  class FakeWebContents {
    id = nextWebContentsId++;
    destroyed = false;
    handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    navigationHistory = {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
    };
    loadURL = vi.fn(async () => undefined);
    reload = vi.fn();
    stop = vi.fn();
    setWindowOpenHandler = vi.fn();
    getZoomFactor = vi.fn(() => 1);
    setZoomFactor = vi.fn();
    findInPage = vi.fn();
    stopFindInPage = vi.fn();
    isCurrentlyAudible = vi.fn(() => false);
    isDevToolsOpened = vi.fn(() => false);
    openDevTools = vi.fn();
    closeDevTools = vi.fn();
    // Phase 117 Theme F: the login-form read. `null` (no answer) unless a test says otherwise.
    executeJavaScriptInIsolatedWorld = vi.fn(async (..._args: unknown[]): Promise<unknown> => null);
    url = '';
    title = '';
    getURL = vi.fn(() => this.url);
    getTitle = vi.fn(() => this.title);
    on(event: string, handler: (...args: unknown[]) => void): this {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
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
      setDevicePermissionHandler: vi.fn(),
      setDisplayMediaRequestHandler: vi.fn(),
      setSpellCheckerEnabled: vi.fn(),
      setCertificateVerifyProc: vi.fn(),
      webRequest: {
        onCompleted: vi.fn(),
        onBeforeRequest: vi.fn(),
        onBeforeSendHeaders: vi.fn(),
        onHeadersReceived: vi.fn(),
      },
      handlers,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      }),
      clearStorageData: vi.fn(async () => undefined),
      clearCache: vi.fn(async () => undefined),
    };
  }

  const fakeSessions = new Map<string, ReturnType<typeof makeFakeSession>>();

  return { FakeWebContents, FakeWebContentsView, fakeSessions, makeFakeSession };
});

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
const log = Object.assign(vi.fn(), { warn: vi.fn(), error: vi.fn() }) as unknown as BrowserLog;
installBrowserMain({ electron: electron as unknown as BrowserElectron, log, readDiscardSettings: () => ({}) });

/** The hoisted class is a value binding, so its instance type needs naming explicitly. */
type FakeView = InstanceType<typeof FakeWebContentsView>;

/** A window's own `enter-full-screen`/`leave-full-screen` handlers, fireable from a test (Theme E). */
function fakeWindow() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const win = {
    isDestroyed: () => false,
    // Phase 84 Theme F's discard sweep reads both — default to "on screen"
    // so every pre-existing test above, which never touches discard, is
    // unaffected.
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: {
      send: vi.fn(),
      isDestroyed: () => false,
      getZoomFactor: vi.fn(() => 1),
    } as unknown,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return win;
    }),
    emit: (event: string) => {
      for (const handler of handlers.get(event) ?? []) handler();
    },
  };
  return win as unknown as BrowserHostWindow & {
    emit: (event: string) => void;
    isVisible: ReturnType<typeof vi.fn>;
    isMinimized: ReturnType<typeof vi.fn>;
  };
}

describe('browser-service lifecycle', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it('creates a view, attaches it hidden, and loads the url', () => {
    const win = fakeWindow();
    createBrowserTab(win, 'tab-1', 'https://example.com');

    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    expect(view.setVisible).toHaveBeenCalledWith(false);
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://example.com');
  });

  it('is idempotent: creating the same tab id twice does not attach a second view', () => {
    const win = fakeWindow();
    createBrowserTab(win, 'tab-1', 'https://example.com');
    createBrowserTab(win, 'tab-1', 'https://elsewhere.example');

    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
  });

  it('activate shows the target tab and hides every other tracked one', () => {
    const win = fakeWindow();
    createBrowserTab(win, 'a', 'https://a.example');
    createBrowserTab(win, 'b', 'https://b.example');

    activateBrowserTab('b');

    const viewA = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;
    const viewB = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as FakeView;
    expect(viewA.visible).toBe(false);
    expect(viewB.visible).toBe(true);
  });

  it('activate is window-scoped (Phase 55): a tab in another window is untouched', () => {
    const main = fakeWindow();
    const popout = fakeWindow();
    createBrowserTab(main, 'a', 'https://a.example');
    createBrowserTab(popout, 'b', 'https://b.example');

    const viewA = (main.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;
    const viewB = (popout.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;
    viewA.setVisible(true); // simulate 'a' already being the shown tab in main

    // 'b' lives in a different window than 'a' — activating it must not hide
    // 'a', which the old process-wide loop would have done.
    activateBrowserTab('b');

    expect(viewA.visible).toBe(true);
    expect(viewB.visible).toBe(true);
  });

  it('reparentBrowserTabs moves every tracked view to the next window, keeping webContents', () => {
    const main = fakeWindow();
    const popout = fakeWindow();
    createBrowserTab(main, 'a', 'https://a.example');
    createBrowserTab(main, 'b', 'https://b.example');
    const viewA = (main.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;
    const viewB = (main.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as FakeView;

    reparentBrowserTabs(popout);

    expect(main.contentView.removeChildView).toHaveBeenCalledWith(viewA);
    expect(main.contentView.removeChildView).toHaveBeenCalledWith(viewB);
    expect(popout.contentView.addChildView).toHaveBeenCalledWith(viewA);
    expect(popout.contentView.addChildView).toHaveBeenCalledWith(viewB);
    // No reload, no fresh loadURL — the same webContents/view instances moved.
    expect(viewA.webContents.loadURL).toHaveBeenCalledTimes(1);
    expect(viewB.webContents.loadURL).toHaveBeenCalledTimes(1);

    // Activation now resolves against the NEW window: both moved together,
    // so both stay visible-eligible in the popout.
    activateBrowserTab('a');
    expect(viewA.visible).toBe(true);
    expect(viewB.visible).toBe(false);
  });

  it('close destroys the view and detaches it from the window', () => {
    const win = fakeWindow();
    createBrowserTab(win, 'tab-1', 'https://example.com');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    closeBrowserTab('tab-1');

    expect(win.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalledTimes(1);
  });

  it('close drops every per-tab listener before closing the contents (Phase 45 Theme E)', () => {
    const win = fakeWindow();
    createBrowserTab(win, 'tab-1', 'https://example.com');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    expect(view.webContents.handlers.size).toBeGreaterThan(0);

    closeBrowserTab('tab-1');

    expect(view.webContents.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(view.webContents.handlers.size).toBe(0);
  });

  it('closing a tab that was never created is a no-op', () => {
    expect(() => closeBrowserTab('never-existed')).not.toThrow();
  });

  it('quit (destroyAllBrowserTabs) tears every tracked tab down', () => {
    const win = fakeWindow();
    createBrowserTab(win, 'a', 'https://a.example');
    createBrowserTab(win, 'b', 'https://b.example');

    destroyAllBrowserTabs();

    expect(win.contentView.removeChildView).toHaveBeenCalledTimes(2);
  });

  it('configures the persist:browser session to deny every permission, exactly once regardless of tab count', () => {
    const win = fakeWindow();
    createBrowserTab(win, 'a', 'https://a.example');
    createBrowserTab(win, 'b', 'https://b.example');

    const browserSession = fakeSessions.get('persist:browser');
    expect(browserSession?.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(browserSession?.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
    expect(browserSession?.setDevicePermissionHandler).toHaveBeenCalledTimes(1);
    expect(browserSession?.setDisplayMediaRequestHandler).toHaveBeenCalledTimes(1);
  });

  it('gives the view no preload and a sandboxed, partitioned session', () => {
    const win = fakeWindow();
    createBrowserTab(win, 'tab-1', 'https://example.com');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;

    const webPreferences = view.options['webPreferences'] as Record<string, unknown>;
    expect(webPreferences['partition']).toBe('persist:browser');
    expect(webPreferences['sandbox']).toBe(true);
    expect(webPreferences['contextIsolation']).toBe(true);
    expect(webPreferences['nodeIntegration']).toBe(false);
    expect(webPreferences['preload']).toBeUndefined();
    // Phase 91 Theme E audit: the dangerous flags are never set to a weaker value.
    expect(webPreferences['nodeIntegration']).toBe(false);
    expect(webPreferences['contextIsolation']).toBe(true);
    expect([undefined, true]).toContain(webPreferences['webSecurity']);
    for (const flag of ['allowRunningInsecureContent', 'experimentalFeatures', 'webviewTag']) {
      expect([undefined, false]).toContain(webPreferences[flag]);
    }
  });
});

describe('navigation policy (Theme B)', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  function createAndGetView(): { win: ReturnType<typeof fakeWindow>; view: FakeView } {
    const win = fakeWindow();
    createBrowserTab(win, 'tab-1', 'https://example.com');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    return { win, view };
  }

  it('blocks a will-navigate to a non-http(s) scheme and pushes a failed event', () => {
    const { win, view } = createAndGetView();
    const willNavigate = view.webContents.handlers.get('will-navigate')?.[0];
    const details = { url: 'file:///etc/passwd', preventDefault: vi.fn() };

    willNavigate?.(details);

    expect(details.preventDefault).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kind: 'failed', tabId: 'tab-1' }),
    );
  });

  it('lets an http(s) will-navigate proceed', () => {
    const { view } = createAndGetView();
    const willNavigate = view.webContents.handlers.get('will-navigate')?.[0];
    const details = { url: 'https://elsewhere.example', preventDefault: vi.fn() };

    willNavigate?.(details);

    expect(details.preventDefault).not.toHaveBeenCalled();
  });

  it('denies every window-open request, and hands an http(s) one back as "open as new tab"', () => {
    const { win, view } = createAndGetView();
    expect(view.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const handler = (view.webContents.setWindowOpenHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as (
      details: unknown,
    ) => { action: string };

    expect(handler({ url: 'https://opened.example', disposition: 'foreground-tab' })).toEqual({
      action: 'deny',
    });
    expect(win.webContents.send).toHaveBeenCalledWith(expect.any(String), {
      kind: 'open-tab',
      tabId: 'tab-1',
      url: 'https://opened.example',
      foreground: true,
    });
  });

  it('a background-tab disposition (middle-click / Mod+click) opens without activating', () => {
    const { win, view } = createAndGetView();
    const handler = (view.webContents.setWindowOpenHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as (
      details: unknown,
    ) => { action: string };

    expect(handler({ url: 'https://opened.example', disposition: 'background-tab' })).toEqual({
      action: 'deny',
    });
    expect(win.webContents.send).toHaveBeenCalledWith(expect.any(String), {
      kind: 'open-tab',
      tabId: 'tab-1',
      url: 'https://opened.example',
      foreground: false,
    });
  });

  it('a new-window disposition still opens as a tab and activates, same as foreground-tab', () => {
    const { win, view } = createAndGetView();
    const handler = (view.webContents.setWindowOpenHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as (
      details: unknown,
    ) => { action: string };

    expect(handler({ url: 'https://opened.example', disposition: 'new-window' })).toEqual({
      action: 'deny',
    });
    expect(win.webContents.send).toHaveBeenCalledWith(expect.any(String), {
      kind: 'open-tab',
      tabId: 'tab-1',
      url: 'https://opened.example',
      foreground: true,
    });
  });

  it('denies a window-open to a blocked scheme WITHOUT offering to reopen it as a tab', () => {
    const { win, view } = createAndGetView();
    const handler = (view.webContents.setWindowOpenHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as (
      details: unknown,
    ) => { action: string };

    expect(handler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('surfaces did-fail-load on the main frame as a failed event, ignoring ERR_ABORTED', () => {
    const { win, view } = createAndGetView();
    const onFail = view.webContents.handlers.get('did-fail-load')?.[0];

    onFail?.(undefined, -3, 'net::ERR_ABORTED', 'https://example.com', true);
    expect(win.webContents.send).not.toHaveBeenCalled();

    onFail?.(undefined, -105, 'net::ERR_NAME_NOT_RESOLVED', 'https://bad.example', true);
    expect(win.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kind: 'failed', tabId: 'tab-1' }),
    );
  });

  it('surfaces a render-process-gone crash as destroyed, but not a clean exit', () => {
    const { win, view } = createAndGetView();
    const onGone = view.webContents.handlers.get('render-process-gone')?.[0];

    onGone?.(undefined, { reason: 'clean-exit' });
    expect(win.webContents.send).not.toHaveBeenCalled();

    onGone?.(undefined, { reason: 'crashed' });
    expect(win.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { kind: 'destroyed', tabId: 'tab-1', reason: 'crashed' },
    );
  });

  it('surfaces an unresponsive view as tab state too, distinguishable from a crash', () => {
    const { win, view } = createAndGetView();

    view.webContents.handlers.get('unresponsive')?.[0]?.();

    expect(win.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { kind: 'destroyed', tabId: 'tab-1', reason: 'unresponsive' },
    );
  });

  it('refuses DevTools on a view created with devTools:false, and tells the tab why (Phase 117 Theme A)', () => {
    const { win, view } = createAndGetView();
    toggleBrowserDevTools('tab-1');
    expect(view.webContents.openDevTools).not.toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith(expect.any(String), { kind: 'devtools-blocked', tabId: 'tab-1' });
  });

  it('decides DevTools from what the view was created with, not the deps at toggle time (Phase 117 Theme A)', () => {
    const base = { electron: electron as unknown as BrowserElectron, log, readDiscardSettings: () => ({}) };
    installBrowserMain({ ...base, devToolsAllowed: true });
    try {
      const { win, view } = createAndGetView();
      installBrowserMain(base);
      toggleBrowserDevTools('tab-1');
      expect(view.webContents.openDevTools).toHaveBeenCalled();
      expect(win.webContents.send).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ kind: 'devtools-blocked' }));
    } finally {
      installBrowserMain(base);
    }
  });

  it('cancels a download and names the file back to the tab that asked for it', () => {
    const { win, view } = createAndGetView();
    const browserSession = fakeSessions.get('persist:browser');
    const onDownload = browserSession?.handlers.get('will-download')?.[0];
    const item = { getFilename: () => 'ubuntu.iso', cancel: vi.fn() };

    onDownload?.(undefined, item, view.webContents);

    expect(item.cancel).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { kind: 'download-blocked', tabId: 'tab-1', filename: 'ubuntu.iso' },
    );
  });
});

describe('Mod+w / Mod+t owned by hand (before-input-event)', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  /**
   * A page inside the `WebContentsView` is a genuinely separate `webContents`
   * from the host window's own renderer, so the renderer's window-level
   * keydown listener never sees a keystroke aimed at it — this handler is the
   * only thing that can react to Mod+w/Mod+t while a tab has native focus.
   */
  function createAndGetView(): { win: ReturnType<typeof fakeWindow>; view: FakeView } {
    const win = fakeWindow();
    createBrowserTab(win, 'tab-1', 'https://example.com');
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as FakeView;
    return { win, view };
  }

  const mac = (run: () => void) => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    try {
      run();
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  };

  it('sends browser.closeTab for Cmd+W on macOS and swallows the keystroke', () => {
    mac(() => {
      const { win, view } = createAndGetView();
      const onInput = view.webContents.handlers.get('before-input-event')?.[0];
      const event = { preventDefault: vi.fn() };

      onInput?.(event, { type: 'keyDown', key: 'w', meta: true, control: false, alt: false, shift: false });

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledWith(expect.any(String), 'browser.closeTab');
    });
  });

  it('sends browser.newTab for Cmd+T on macOS and swallows the keystroke', () => {
    mac(() => {
      const { win, view } = createAndGetView();
      const onInput = view.webContents.handlers.get('before-input-event')?.[0];
      const event = { preventDefault: vi.fn() };

      onInput?.(event, { type: 'keyDown', key: 't', meta: true, control: false, alt: false, shift: false });

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledWith(expect.any(String), 'browser.newTab');
    });
  });

  it('ignores plain Ctrl+W on macOS — Mod means Cmd there, not Ctrl', () => {
    mac(() => {
      const { view } = createAndGetView();
      const onInput = view.webContents.handlers.get('before-input-event')?.[0];
      const event = { preventDefault: vi.fn() };

      onInput?.(event, { type: 'keyDown', key: 'w', meta: false, control: true, alt: false, shift: false });

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  it('ignores Cmd+Shift+W — an extra modifier means a different chord entirely', () => {
    mac(() => {
      const { view } = createAndGetView();
      const onInput = view.webContents.handlers.get('before-input-event')?.[0];
      const event = { preventDefault: vi.fn() };

      onInput?.(event, { type: 'keyDown', key: 'w', meta: true, control: false, alt: false, shift: true });

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  it('ignores keyUp — only keyDown should fire the command', () => {
    mac(() => {
      const { view } = createAndGetView();
      const onInput = view.webContents.handlers.get('before-input-event')?.[0];
      const event = { preventDefault: vi.fn() };

      onInput?.(event, { type: 'keyUp', key: 'w', meta: true, control: false, alt: false, shift: false });

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});

describe('bounds, zoom and sender scoping (Theme E/G)', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  function createAndGetView(win: ReturnType<typeof fakeWindow>, tabId = 'tab-1'): FakeView {
    createBrowserTab(win, tabId, 'https://example.com');
    return (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;
  }

  it('scales an incoming bounds push by the host window zoom factor', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);
    (win.webContents as unknown as { getZoomFactor: ReturnType<typeof vi.fn> }).getZoomFactor.mockReturnValue(
      1.5,
    );

    setBrowserBounds('tab-1', { x: 10, y: 20, width: 100, height: 200 });

    expect(view.bounds).toEqual({ x: 15, y: 30, width: 150, height: 300 });
  });

  it('re-applies the last bounds on the owning window entering/leaving full screen', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);
    setBrowserBounds('tab-1', { x: 1, y: 2, width: 3, height: 4 });
    view.setBounds.mockClear();

    win.emit('enter-full-screen');
    expect(view.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 3, height: 4 });

    view.setBounds.mockClear();
    win.emit('leave-full-screen');
    expect(view.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('ownerWindowForBrowserTab resolves the tab\'s current window, null for an unknown tab', () => {
    const win = fakeWindow();
    createAndGetView(win);
    expect(ownerWindowForBrowserTab('tab-1')).toBe(win);
    expect(ownerWindowForBrowserTab('never-existed')).toBeNull();
  });

  it('setBrowserZoom sets the tab view webContents zoom factor', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);

    setBrowserZoom('tab-1', 1.25);

    expect(view.webContents.setZoomFactor).toHaveBeenCalledWith(1.25);
  });

  it('pushes a found event carrying the match ordinal (Theme G find count)', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);
    const onFound = view.webContents.handlers.get('found-in-page')?.[0];

    onFound?.(undefined, { requestId: 1, matches: 4, activeMatchOrdinal: 2, finalUpdate: true });

    expect(win.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { kind: 'found', tabId: 'tab-1', matches: 4, activeMatchOrdinal: 2 },
    );
  });
});

describe('isTabDiscardEligible (Phase 84 Theme F)', () => {
  const base = {
    effectiveVisible: false,
    audible: false,
    keepAwake: false,
    hiddenSinceMs: 0,
    now: 700_000,
    discardMs: 600_000,
  };

  it('eligible once hidden at least discardMs', () => {
    expect(isTabDiscardEligible(base)).toBe(true);
  });

  it('not yet eligible before discardMs has elapsed', () => {
    expect(isTabDiscardEligible({ ...base, now: 500_000 })).toBe(false);
  });

  it('never eligible while visible, however long hiddenSinceMs claims', () => {
    expect(isTabDiscardEligible({ ...base, effectiveVisible: true, hiddenSinceMs: 0 })).toBe(false);
  });

  it('never eligible while audible', () => {
    expect(isTabDiscardEligible({ ...base, audible: true })).toBe(false);
  });

  it('never eligible with keepAwake set', () => {
    expect(isTabDiscardEligible({ ...base, keepAwake: true })).toBe(false);
  });

  it('never eligible with discardMs of 0 (discard disabled)', () => {
    expect(isTabDiscardEligible({ ...base, discardMs: 0 })).toBe(false);
  });

  it('not eligible if never marked hidden at all', () => {
    expect(isTabDiscardEligible({ ...base, hiddenSinceMs: undefined })).toBe(false);
  });
});

describe('browser tab discard (Phase 84 Theme F)', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  function createAndGetView(win: ReturnType<typeof fakeWindow>, tabId = 'tab-1'): FakeView {
    createBrowserTab(win, tabId, 'https://example.com');
    return (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;
  }

  it('discardBrowserTab tears the view down and tells the renderer', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);

    discardBrowserTab('tab-1');

    expect(win.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).toHaveBeenCalledWith(expect.any(String), {
      kind: 'discarded',
      tabId: 'tab-1',
    });
  });

  it('discarding an untracked or already-discarded tab is a no-op', () => {
    expect(() => discardBrowserTab('never-existed')).not.toThrow();
  });

  it('re-creating a discarded tab id builds a fresh view — the renderer\'s own reactivation path', () => {
    const win = fakeWindow();
    const firstView = createAndGetView(win);
    discardBrowserTab('tab-1');

    // `use-browser-tabs.ts` calls `browser.create` unconditionally on every
    // activation; `createBrowserTab` treats a tab id it no longer tracks as
    // brand new, so this is the whole recreate path, tested at this layer.
    createBrowserTab(win, 'tab-1', 'https://example.com');
    const calls = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls;
    const secondView = calls[calls.length - 1]?.[0] as FakeView;

    expect(secondView).not.toBe(firstView);
    expect(secondView.webContents.loadURL).toHaveBeenCalledWith('https://example.com');

    activateBrowserTab('tab-1');
    expect(secondView.visible).toBe(true);
  });

  it('the sweep discards a tab hidden long enough, but not one just hidden this same tick', () => {
    const win = fakeWindow();
    createAndGetView(win, 'stale');
    setBrowserDiscardMs(1000);

    runBrowserDiscardSweep(); // 'stale' becomes hidden now (not yet eligible: 0ms elapsed)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);

    createAndGetView(win, 'fresh'); // hidden only as of THIS (mocked) now
    runBrowserDiscardSweep();

    expect(ownerWindowForBrowserTab('stale')).toBeNull(); // aged past the 1000ms threshold
    expect(ownerWindowForBrowserTab('fresh')).toBe(win); // just went hidden — 0ms elapsed
    vi.restoreAllMocks();
  });

  it('the sweep never discards the active tab of a visible window', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);
    activateBrowserTab('tab-1'); // now the visible tab
    setBrowserDiscardMs(1);

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    runBrowserDiscardSweep();

    expect(view.webContents.close).not.toHaveBeenCalled();
    expect(ownerWindowForBrowserTab('tab-1')).toBe(win);
    vi.restoreAllMocks();
  });

  it('the sweep discards the active tab of a MINIMIZED window — hidden means the window too', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);
    activateBrowserTab('tab-1');
    (win.isMinimized as ReturnType<typeof vi.fn>).mockReturnValue(true);
    setBrowserDiscardMs(1);

    runBrowserDiscardSweep(); // records hiddenSince now that the window reads minimized
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    runBrowserDiscardSweep();

    expect(view.webContents.close).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('a keepAwake tab is never discarded by the sweep, however long it sits hidden', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);
    setBrowserKeepAwake('tab-1', true);
    setBrowserDiscardMs(1);

    runBrowserDiscardSweep();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    runBrowserDiscardSweep();

    expect(view.webContents.close).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('an audible tab is never discarded by the sweep', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);
    (view.webContents.isCurrentlyAudible as ReturnType<typeof vi.fn>).mockReturnValue(true);
    setBrowserDiscardMs(1);

    runBrowserDiscardSweep();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    runBrowserDiscardSweep();

    expect(view.webContents.close).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('discardMs of 0 disables the sweep entirely', () => {
    const win = fakeWindow();
    const view = createAndGetView(win);
    setBrowserDiscardMs(0);

    runBrowserDiscardSweep();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000_000);
    runBrowserDiscardSweep();

    expect(view.webContents.close).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('browser-service permissions and settings (Phase 117 Theme B)', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    fakeSessions.clear();
  });
  afterEach(() => vi.clearAllMocks());

  function setupTab(tabId = 'tab-1', url = 'https://example.com') {
    const win = fakeWindow();
    createBrowserTab(win, tabId, url);
    const view = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;
    const sess = fakeSessions.get('persist:browser');
    expect(sess).toBeDefined();
    return { win, view, sess: sess! };
  }

  it('prompts the renderer on ungranted permission request and resolves allow', () => {
    const { win, view, sess } = setupTab('tab-1', 'https://example.com/app');
    const handler = (sess.setPermissionRequestHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(handler).toBeTypeOf('function');

    const callback = vi.fn();
    handler(view.webContents, 'geolocation', callback, { securityOrigin: 'https://example.com' });

    // Verify permission-request event sent to window
    const sendCalls = (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls;
    const promptCall = sendCalls.find(
      ([channel, payload]) => channel === EVENT_CHANNELS.browserEvent && payload?.kind === 'permission-request',
    );
    expect(promptCall).toBeDefined();
    const payload = promptCall![1];
    expect(payload).toMatchObject({
      kind: 'permission-request',
      tabId: 'tab-1',
      origin: 'https://example.com',
      permission: 'geolocation',
      displayName: 'https://example.com',
    });
    expect(payload.requestId).toBeTypeOf('string');

    // Resolve as allow
    resolveBrowserPermission(payload.requestId, 'allow');
    expect(callback).toHaveBeenCalledWith(true);

    // Verify stored
    const records = listBrowserPermissions();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      origin: 'https://example.com',
      permission: 'geolocation',
      value: 'allow',
    });

    // Subsequent request for same origin + permission auto-grants without prompting again
    const callback2 = vi.fn();
    handler(view.webContents, 'geolocation', callback2, { securityOrigin: 'https://example.com' });
    expect(callback2).toHaveBeenCalledWith(true);
  });

  it('resolves deny and remembers decision', () => {
    const { win, view, sess } = setupTab('tab-1', 'https://example.com');
    const handler = (sess.setPermissionRequestHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

    const callback = vi.fn();
    handler(view.webContents, 'camera', callback, {
      securityOrigin: 'https://example.com',
      mediaTypes: ['video'],
    });

    const sendCalls = (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls;
    const promptCall = sendCalls.find(
      ([channel, payload]) => channel === EVENT_CHANNELS.browserEvent && payload?.kind === 'permission-request',
    );
    expect(promptCall).toBeDefined();

    resolveBrowserPermission(promptCall![1].requestId, 'deny');
    expect(callback).toHaveBeenCalledWith(false);

    expect(listBrowserPermissions()).toEqual([
      expect.objectContaining({
        origin: 'https://example.com',
        permission: 'camera',
        value: 'deny',
      }),
    ]);

    // Subsequent request is denied immediately without sending another prompt
    const callback2 = vi.fn();
    handler(view.webContents, 'camera', callback2, {
      securityOrigin: 'https://example.com',
      mediaTypes: ['video'],
    });
    expect(callback2).toHaveBeenCalledWith(false);
  });

  it('resolves dismiss without persisting to store', () => {
    const { win, view, sess } = setupTab('tab-1', 'https://example.com');
    const handler = (sess.setPermissionRequestHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

    const callback = vi.fn();
    handler(view.webContents, 'notifications', callback, { securityOrigin: 'https://example.com' });

    const sendCalls = (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls;
    const promptCall = sendCalls.find(
      ([channel, payload]) => channel === EVENT_CHANNELS.browserEvent && payload?.kind === 'permission-request',
    );
    expect(promptCall).toBeDefined();

    resolveBrowserPermission(promptCall![1].requestId, 'dismiss');
    expect(callback).toHaveBeenCalledWith(false);
    expect(listBrowserPermissions()).toHaveLength(0);
  });

  it('denies and cancels pending requests when tab navigates', () => {
    const { view, sess } = setupTab('tab-1', 'https://example.com');
    const handler = (sess.setPermissionRequestHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

    const callback = vi.fn();
    handler(view.webContents, 'geolocation', callback, { securityOrigin: 'https://example.com' });

    // Navigation triggers cancellation
    view.webContents.emit('did-navigate', {}, 'https://other.example');
    expect(callback).toHaveBeenCalledWith(false);
  });

  it('cancels pending requests when tab is closed or discarded', () => {
    const { view, sess } = setupTab('tab-1', 'https://example.com');
    const handler = (sess.setPermissionRequestHandler as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

    const callback = vi.fn();
    handler(view.webContents, 'geolocation', callback, { securityOrigin: 'https://example.com' });

    closeBrowserTab('tab-1');
    expect(callback).toHaveBeenCalledWith(false);
  });

  it('revokes individual permission and resets all permissions', () => {
    setupTab('tab-1', 'https://example.com');

    const store = getBrowserPermissionStore();
    store.set('https://example.com', 'camera', 'allow');
    store.set('https://example.com', 'geolocation', 'allow');
    store.set('https://other.com', 'microphone', 'deny');

    expect(listBrowserPermissions()).toHaveLength(3);

    revokeBrowserPermission('https://example.com', 'camera');
    const remaining = listBrowserPermissions();
    expect(remaining).toHaveLength(2);
    expect(remaining.some((r) => r.permission === 'camera')).toBe(false);

    resetAllBrowserPermissions();
    expect(listBrowserPermissions()).toHaveLength(0);
  });

  it('setBrowserSpellcheck delegates to partition session', () => {
    setupTab('tab-1', 'https://example.com');
    const sess = fakeSessions.get('persist:browser')!;

    setBrowserSpellcheck(true);
    expect(sess.setSpellCheckerEnabled).toHaveBeenCalledWith(true);

    setBrowserSpellcheck(false);
    expect(sess.setSpellCheckerEnabled).toHaveBeenCalledWith(false);
  });
});

describe('Phase 117 Theme C — site verdicts in the service', () => {
  let dir: string;
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    fakeSessions.clear();
    dir = mkdtempSync(join(tmpdir(), 'browser-c-'));
    mkdirSync(join(dir, 'browser-feeds'));
    writeFileSync(join(dir, 'browser-feeds', 'urlhaus.txt'), 'http://malware.example/\nhttps://shared.example/bad-one\nhttps://shared.example/bad-two\n');
    installBrowserMain({
      electron: electron as unknown as BrowserElectron,
      log,
      readDiscardSettings: () => ({}),
      userDataPath: dir,
      ledgerCipher: {
        isEncryptionAvailable: () => true,
        encryptString: (plain: string) => Buffer.from(plain),
        decryptString: (blob: Buffer) => blob.toString(),
      },
    });
  });
  afterEach(() => {
    resetBrowserServiceForTests();
    rmSync(dir, { recursive: true, force: true });
    installBrowserMain({ electron: electron as unknown as BrowserElectron, log, readDiscardSettings: () => ({}) });
    vi.clearAllMocks();
  });

  const viewOf = (win: BrowserHostWindow, index = 0) =>
    (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[index]?.[0] as FakeView;
  const sent = (win: BrowserHostWindow) =>
    (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1] as { kind: string } & Record<string, unknown>);

  it('installs the certificate verifier and the completed-request observer on persist:browser', () => {
    createBrowserTab(fakeWindow(), 't', 'https://example.com');
    const sess = fakeSessions.get('persist:browser')!;
    expect(sess.setCertificateVerifyProc).toHaveBeenCalledTimes(1);
    expect(sess.webRequest.onCompleted).toHaveBeenCalledTimes(1);
  });

  it('pushes a fresh verdict on every main-frame commit, and records mixed content from onCompleted', () => {
    const win = fakeWindow();
    createBrowserTab(win, 't', 'https://example.com');
    const view = viewOf(win);
    view.webContents.emit('did-navigate', undefined, 'https://example.com/');
    expect(sent(win).at(-1)).toMatchObject({ kind: 'verdict', tabId: 't', verdict: { tls: 'ok', mixedContent: false } });

    const onCompleted = fakeSessions.get('persist:browser')!.webRequest.onCompleted.mock.calls[0]![0] as (d: unknown) => void;
    onCompleted({ url: 'http://cdn.example/a.png', method: 'GET', resourceType: 'image', webContentsId: view.webContents.id });
    expect(sent(win).at(-1)).toMatchObject({ kind: 'verdict', verdict: { mixedContent: true } });
  });

  it('marks a certificate failure as the certificate interstitial, and rejects the certificate', () => {
    const win = fakeWindow();
    createBrowserTab(win, 't', 'https://expired.badssl.com');
    const view = viewOf(win);
    const callback = vi.fn();
    view.webContents.emit('certificate-error', { preventDefault: vi.fn() }, 'https://expired.badssl.com/', 'net::ERR_CERT_DATE_INVALID', {}, callback, true);
    expect(callback).toHaveBeenCalledWith(false);
    view.webContents.emit('did-fail-load', undefined, -201, 'net::ERR_CERT_DATE_INVALID', 'https://expired.badssl.com/', true);
    expect(sent(win)).toContainEqual(
      expect.objectContaining({ kind: 'failed', error: expect.objectContaining({ code: -201, reason: 'certificate' }) }),
    );
  });

  it('proceeds past a certificate interstitial only with the Settings switch on, then trusts that host', () => {
    const win = fakeWindow();
    createBrowserTab(win, 't', 'https://expired.badssl.com');
    const view = viewOf(win);
    const url = 'https://expired.badssl.com/';
    view.webContents.emit('did-fail-load', undefined, -201, 'net::ERR_CERT_DATE_INVALID', url, true);
    view.webContents.loadURL.mockClear();

    proceedBrowserSite('t', url);
    expect(view.webContents.loadURL).not.toHaveBeenCalled();

    setBrowserSiteSafety({ allowProceed: true, feeds: { urlhaus: false, openphish: false } });
    proceedBrowserSite('t', 'https://other.example/');
    expect(view.webContents.loadURL).not.toHaveBeenCalled();
    proceedBrowserSite('t', url);
    expect(view.webContents.loadURL).toHaveBeenCalledWith(url);

    const callback = vi.fn();
    view.webContents.emit('certificate-error', { preventDefault: vi.fn() }, url, 'net::ERR_CERT_DATE_INVALID', {}, callback, true);
    expect(callback).toHaveBeenCalledWith(true);
  });

  it('refuses a known-bad URL before loading it, but only while its feed is on', () => {
    const off = fakeWindow();
    createBrowserTab(off, 'a', 'http://malware.example/');
    expect(viewOf(off).webContents.loadURL).toHaveBeenCalledWith('http://malware.example/');
    viewOf(off).webContents.emit('did-navigate', undefined, 'http://malware.example/');
    expect(sent(off).at(-1)).toMatchObject({ kind: 'verdict', verdict: { reputation: 'unavailable' } });

    setBrowserSiteSafety({ allowProceed: false, feeds: { urlhaus: true, openphish: false } });
    const on = fakeWindow();
    createBrowserTab(on, 'b', 'http://malware.example/payload');
    expect(viewOf(on).webContents.loadURL).not.toHaveBeenCalled();
    expect(sent(on)).toContainEqual(
      expect.objectContaining({
        kind: 'failed',
        error: expect.objectContaining({ code: KNOWN_BAD_ERROR_CODE, reason: 'known-bad', knownBad: expect.objectContaining({ feed: 'urlhaus' }) }),
      }),
    );
    // Nothing navigated, so no verdict is committed for the refused URL — the interstitial speaks for it.
    expect(sent(on).some((event) => event.kind === 'verdict')).toBe(false);
  });

  it('a known-bad bypass lifts that feed entry only — not the host\'s other entries, nor its certificates', () => {
    setBrowserSiteSafety({ allowProceed: true, feeds: { urlhaus: true, openphish: false } });
    const win = fakeWindow();
    createBrowserTab(win, 't', 'https://shared.example/bad-one');
    const view = viewOf(win);
    expect(view.webContents.loadURL).not.toHaveBeenCalled();

    proceedBrowserSite('t', 'https://shared.example/bad-one');
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://shared.example/bad-one');

    const other = { url: 'https://shared.example/bad-two', preventDefault: vi.fn() };
    view.webContents.emit('will-navigate', other);
    expect(other.preventDefault).toHaveBeenCalled();

    const callback = vi.fn();
    view.webContents.emit('certificate-error', { preventDefault: vi.fn() }, 'https://shared.example/', 'net::ERR_CERT_DATE_INVALID', {}, callback, true);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it('turning the proceed switch off revokes every bypass granted this session', () => {
    setBrowserSiteSafety({ allowProceed: true, feeds: { urlhaus: false, openphish: false } });
    const win = fakeWindow();
    createBrowserTab(win, 't', 'https://expired.badssl.com');
    const view = viewOf(win);
    const url = 'https://expired.badssl.com/';
    view.webContents.emit('did-fail-load', undefined, -201, 'net::ERR_CERT_DATE_INVALID', url, true);
    proceedBrowserSite('t', url);

    setBrowserSiteSafety({ allowProceed: false, feeds: { urlhaus: false, openphish: false } });
    const callback = vi.fn();
    view.webContents.emit('certificate-error', { preventDefault: vi.fn() }, url, 'net::ERR_CERT_DATE_INVALID', {}, callback, true);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it('refuses a page-initiated navigation and a redirect to a known-bad URL', () => {
    setBrowserSiteSafety({ allowProceed: false, feeds: { urlhaus: true, openphish: false } });
    const win = fakeWindow();
    createBrowserTab(win, 't', 'https://example.com');
    const view = viewOf(win);
    const nav = { url: 'http://malware.example/x', preventDefault: vi.fn() };
    view.webContents.emit('will-navigate', nav);
    expect(nav.preventDefault).toHaveBeenCalled();
    const redirect = { url: 'http://malware.example/y', preventDefault: vi.fn() };
    view.webContents.emit('will-redirect', redirect);
    expect(redirect.preventDefault).toHaveBeenCalled();
    const subframe = { url: 'http://malware.example/ad', isMainFrame: false, preventDefault: vi.fn() };
    view.webContents.emit('will-redirect', subframe);
    expect(subframe.preventDefault).not.toHaveBeenCalled();
    expect(sent(win).filter((event) => event.kind === 'failed')).toHaveLength(2);
    const fine = { url: 'https://example.org/', preventDefault: vi.fn() };
    view.webContents.emit('will-navigate', fine);
    expect(fine.preventDefault).not.toHaveBeenCalled();
  });

  it('folds Theme E\'s blocked-tracker count into the tab\'s verdict, throttled, and a new page starts at zero', () => {
    vi.useFakeTimers();
    try {
      const win = fakeWindow();
      createBrowserTab(win, 't', 'https://news.example/');
      const view = viewOf(win);
      view.webContents.emit('did-navigate', undefined, 'https://news.example/');
      const onBeforeRequest = fakeSessions.get('persist:browser')!.webRequest.onBeforeRequest.mock.calls[0]![0] as (
        d: unknown,
        cb: (r: { cancel?: boolean }) => void,
      ) => void;
      (view.webContents as unknown as { getURL: () => string }).getURL = () => 'https://news.example/';
      const block = (url: string) =>
        onBeforeRequest({ url, resourceType: 'script', webContents: view.webContents }, () => undefined);
      block('https://www.google-analytics.com/analytics.js');
      block('https://www.google-analytics.com/collect');
      vi.advanceTimersByTime(200);
      expect(sent(win).at(-1)).toMatchObject({ kind: 'verdict', verdict: { trackersBlocked: 2, trackerHosts: ['google-analytics.com'] } });
      expect(sent(win).some((event) => event.kind === 'trackers-blocked')).toBe(false);

      view.webContents.emit('did-navigate', undefined, 'https://news.example/next');
      expect(sent(win).at(-1)).toMatchObject({ kind: 'verdict', verdict: { trackersBlocked: 0, trackerHosts: [] } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers Theme D\'s originVerdict seam from the open tabs\' verdicts', () => {
    const win = fakeWindow();
    createBrowserTab(win, 't', 'https://expired.badssl.com/');
    const view = viewOf(win);
    expect(originVerdictLevel('https://expired.badssl.com')).toBeUndefined();
    view.webContents.emit('did-navigate', undefined, 'https://expired.badssl.com/');
    expect(originVerdictLevel('https://expired.badssl.com')).toBe('safe');
    siteVerdicts().patch('t', { tls: 'error' });
    expect(originVerdictLevel('https://expired.badssl.com')).toBe('danger');
  });
});

describe('Phase 117 Theme F — credential phishing in the service', () => {
  let dir: string;
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    fakeSessions.clear();
    dir = mkdtempSync(join(tmpdir(), 'browser-f-'));
    installBrowserMain({
      electron: electron as unknown as BrowserElectron,
      log,
      readDiscardSettings: () => ({}),
      userDataPath: dir,
      ledgerCipher: {
        isEncryptionAvailable: () => true,
        encryptString: (plain: string) => Buffer.from(plain),
        decryptString: (blob: Buffer) => blob.toString(),
      },
    });
  });
  afterEach(() => {
    resetBrowserServiceForTests();
    rmSync(dir, { recursive: true, force: true });
    installBrowserMain({ electron: electron as unknown as BrowserElectron, log, readDiscardSettings: () => ({}) });
    vi.clearAllMocks();
  });

  const viewOf = (win: BrowserHostWindow) =>
    (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as FakeView;
  const verdicts = (win: BrowserHostWindow) =>
    (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[1] as { kind: string; verdict?: { credentialRisk: unknown; insecureForm: boolean } })
      .filter((event) => event.kind === 'verdict');

  /** A tab that has committed `url` and whose page answers the login-form read with `read`. */
  function pageWith(url: string, read: unknown, title = '') {
    const win = fakeWindow();
    createBrowserTab(win, 't', url);
    const view = viewOf(win);
    view.webContents.url = url;
    view.webContents.title = title;
    view.webContents.executeJavaScriptInIsolatedWorld.mockResolvedValue(read);
    view.webContents.emit('did-navigate', undefined, url);
    return { win, view };
  }

  it('reads the page in its own isolated world on dom-ready, and raises caution for a password on http:', async () => {
    const { win, view } = pageWith('http://members.example/login', { hasPasswordField: true, formActionOrigins: ['http://members.example'] });
    view.webContents.emit('dom-ready');
    await vi.waitFor(() =>
      expect(siteVerdicts().verdict('t')?.credentialRisk).toEqual({ level: 'caution', reasons: [{ rule: 'http-password' }, { rule: 'first-seen' }] }),
    );
    expect(view.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(LOGIN_FORM_WORLD_ID, [expect.objectContaining({ code: expect.any(String) })], false);
    expect(siteVerdicts().verdict('t')?.insecureForm).toBe(true);
    expect(verdicts(win).at(-1)?.verdict?.credentialRisk).toBeTruthy();
  });

  it('"GitHub login on github-login.app" is danger — and Theme D then refuses its downloads', async () => {
    const { view } = pageWith('https://github-login.app/', { hasPasswordField: true, formActionOrigins: [] }, 'GitHub');
    view.webContents.emit('did-stop-loading');
    await vi.waitFor(() => expect(originVerdictLevel('https://github-login.app')).toBe('danger'));
  });

  it('leaves the verdict alone when the page has no password field', async () => {
    const { view } = pageWith('https://news.example/', { hasPasswordField: false, formActionOrigins: [] });
    view.webContents.emit('dom-ready');
    await vi.waitFor(() => expect(view.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(siteVerdicts().verdict('t')?.credentialRisk).toBeNull();
  });

  it('drops a read that lands after the tab committed another page', async () => {
    const { view } = pageWith('http://members.example/login', undefined);
    let answer: (value: unknown) => void = () => {};
    view.webContents.executeJavaScriptInIsolatedWorld.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    view.webContents.emit('dom-ready');
    view.webContents.url = 'https://elsewhere.example/';
    view.webContents.emit('did-navigate', undefined, 'https://elsewhere.example/');
    answer({ hasPasswordField: true, formActionOrigins: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(siteVerdicts().verdict('t')?.origin).toBe('https://elsewhere.example');
    expect(siteVerdicts().verdict('t')?.credentialRisk).toBeNull();
  });

  it("keeps each tab's reads to its own commits — another tab navigating does not drop this one's", async () => {
    const win = fakeWindow();
    createBrowserTab(win, 'a', 'http://members.example/login');
    createBrowserTab(win, 'b', 'https://other.example/');
    const calls = (win.contentView.addChildView as ReturnType<typeof vi.fn>).mock.calls;
    const [a, b] = [calls[0]?.[0] as FakeView, calls[1]?.[0] as FakeView];
    a.webContents.url = 'http://members.example/login';
    a.webContents.emit('did-navigate', undefined, a.webContents.url);
    let answer: (value: unknown) => void = () => {};
    a.webContents.executeJavaScriptInIsolatedWorld.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    a.webContents.emit('dom-ready');
    b.webContents.url = 'https://other.example/next';
    b.webContents.emit('did-navigate', undefined, b.webContents.url);
    answer({ hasPasswordField: true, formActionOrigins: [] });
    await vi.waitFor(() => expect(siteVerdicts().verdict('a')?.credentialRisk?.reasons).toContainEqual({ rule: 'http-password' }));
  });

  it('typing re-reads the page (a password step injected with no navigation), throttled', async () => {
    const { view } = pageWith('https://app.example/', { hasPasswordField: false, formActionOrigins: [] });
    view.webContents.emit('did-stop-loading');
    await vi.waitFor(() => expect(view.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(1));
    view.webContents.executeJavaScriptInIsolatedWorld.mockResolvedValue({ hasPasswordField: true, formActionOrigins: ['https://drop.example.net'] });
    const key = { type: 'keyDown', key: 'a', meta: false, control: false, shift: false, alt: false };
    view.webContents.emit('before-input-event', { preventDefault: vi.fn() }, key);
    view.webContents.emit('before-input-event', { preventDefault: vi.fn() }, key);
    await vi.waitFor(() =>
      expect(siteVerdicts().verdict('t')?.credentialRisk?.reasons).toContainEqual({ rule: 'cross-origin-action', detail: 'https://drop.example.net' }),
    );
    expect(view.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
  });

  it('re-reads on an in-page navigation (a single-page app routing to its sign-in form)', async () => {
    const { view } = pageWith('https://app.example/', { hasPasswordField: false, formActionOrigins: [] });
    view.webContents.executeJavaScriptInIsolatedWorld.mockResolvedValue({ hasPasswordField: true, formActionOrigins: ['https://drop.example.net'] });
    view.webContents.emit('did-navigate-in-page', undefined, 'https://app.example/#/login');
    await vi.waitFor(() =>
      expect(siteVerdicts().verdict('t')?.credentialRisk?.reasons).toContainEqual({ rule: 'cross-origin-action', detail: 'https://drop.example.net' }),
    );
  });

  it('clipboard-read stays denied on a password page — refused with no bar', async () => {
    const { win, view } = pageWith('https://login.example/', { hasPasswordField: true, formActionOrigins: [] });
    view.webContents.emit('dom-ready');
    await vi.waitFor(() => expect(siteVerdicts().verdict('t')?.credentialRisk).not.toBeNull());
    const sess = fakeSessions.get('persist:browser')!;
    const request = sess.setPermissionRequestHandler.mock.calls[0]?.[0] as (...args: unknown[]) => void;
    const check = sess.setPermissionCheckHandler.mock.calls[0]?.[0] as (...args: unknown[]) => boolean;
    const callback = vi.fn();
    request(view.webContents, 'clipboard-read', callback, { securityOrigin: 'https://login.example' });
    expect(callback).toHaveBeenCalledWith(false);
    expect(check(view.webContents, 'clipboard-read', 'https://login.example')).toBe(false);
    const sent = (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls.map((call) => (call[1] as { kind: string }).kind);
    expect(sent).not.toContain('permission-request');
  });

  it('records first-seen hosts as digests, and "clear browsing data" deletes the ledger', async () => {
    pageWith('https://first.example/', null);
    destroyAllBrowserTabs(); // flushes the ledger
    expect(existsSync(join(dir, HOSTS_SEEN_FILE))).toBe(true);
    await clearBrowserData();
    expect(existsSync(join(dir, HOSTS_SEEN_FILE))).toBe(false);
  });
});
