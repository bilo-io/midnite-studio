import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateBrowserTab,
  closeBrowserTab,
  createBrowserTab,
  destroyAllBrowserTabs,
  reparentBrowserTabs,
  resetBrowserServiceForTests,
} from './browser-service';

/**
 * `browser-service.ts` is the only file that constructs a `WebContentsView`,
 * so testing its lifecycle means faking one — following the same
 * `vi.mock('electron', ...)` pattern `fs-write-handlers.test.ts` uses for
 * `shell.trashItem`.
 */

/**
 * Hoisted: `vi.mock`'s factory below is hoisted above every import AND every
 * top-level `class`/`const`, so anything the factory closes over has to be
 * declared inside `vi.hoisted` too, or it throws "Cannot access before
 * initialization" the moment the mock factory runs.
 */
const { FakeWebContentsView, fakeSessions, makeFakeSession } = vi.hoisted(() => {
  class FakeWebContents {
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
      clearStorageData: vi.fn(async () => undefined),
      clearCache: vi.fn(async () => undefined),
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

/** The hoisted class is a value binding, so its instance type needs naming explicitly. */
type FakeView = InstanceType<typeof FakeWebContentsView>;

function fakeWindow() {
  return {
    isDestroyed: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { send: vi.fn(), isDestroyed: () => false } as unknown,
  } as unknown as import('electron').BrowserWindow;
}

describe('browser-service lifecycle', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
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
  });
});

describe('navigation policy (Theme B)', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
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

    expect(handler({ url: 'https://opened.example' })).toEqual({ action: 'deny' });
    expect(win.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { kind: 'open-tab', tabId: 'tab-1', url: 'https://opened.example' },
    );
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
