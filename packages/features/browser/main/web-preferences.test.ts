import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowserElectron, BrowserHostWindow } from './browser-electron';
import { installBrowserMain, type BrowserLog, type BrowserMainDeps } from './browser-main-deps';
import { createBrowserTab, resetBrowserServiceForTests } from './browser-service';
import { enableWebApp, resetWebAppsServiceForTests } from './web-apps-service';

/**
 * Phase 117 Theme A: the `webPreferences` audit for every embedded page — the browser's tabs and
 * the web-app views — the Browser-app counterpart of desktop's `web-preferences.test.ts` for the
 * app windows. Nobody weakens a flag today; this is what keeps it that way. If a phase flips one
 * on purpose, update the table — do not delete it. `preload` is asserted *absent*, not falsy: an
 * embedded page must have no path to `window.midniteStudio`.
 *
 * The two per-view guards ride along: `will-attach-webview` is refused (so a `webviewTag` flip
 * cannot reopen it) and `window.open` answers `deny` for every disposition.
 */
const PINNED = {
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
} as const;

class FakeWebContents {
  handlers = new Map<string, (...args: unknown[]) => void>();
  navigationHistory = { canGoBack: () => false, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn() };
  loadURL = vi.fn(async () => undefined);
  setWindowOpenHandler = vi.fn();
  getZoomFactor = vi.fn(() => 1);
  setZoomFactor = vi.fn();
  isCurrentlyAudible = vi.fn(() => false);
  isDestroyed = () => false;
  removeAllListeners = vi.fn();
  close = vi.fn();
  on(event: string, handler: (...args: unknown[]) => void): this {
    this.handlers.set(event, handler);
    return this;
  }
}

class FakeView {
  webContents = new FakeWebContents();
  constructor(public options: Record<string, unknown>) {}
  setVisible = vi.fn();
  setBounds = vi.fn();
}

function fakeSession() {
  return {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    setSpellCheckerEnabled: vi.fn(),
    on: vi.fn(),
    clearStorageData: vi.fn(async () => undefined),
    clearCache: vi.fn(async () => undefined),
  };
}

function fakeWindow(): BrowserHostWindow {
  return {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { getZoomFactor: () => 1, send: vi.fn() },
    on: vi.fn(),
  } as unknown as BrowserHostWindow;
}

const views: FakeView[] = [];
const electron = {
  createView: vi.fn((options: Record<string, unknown>) => {
    const view = new FakeView(options);
    views.push(view);
    return view;
  }),
  sessionFromPartition: vi.fn(() => fakeSession()),
  onDisplayMetricsChanged: vi.fn(),
  openExternal: vi.fn(async () => undefined),
} as unknown as BrowserElectron;
const log = Object.assign(vi.fn(), { warn: vi.fn(), error: vi.fn() }) as unknown as BrowserLog;

function install(extra: Partial<BrowserMainDeps> = {}): void {
  installBrowserMain({ electron, log, readDiscardSettings: () => ({}), ...extra });
}

function prefsOf(view: FakeView): Record<string, unknown> {
  return view.options['webPreferences'] as Record<string, unknown>;
}

function expectPinned(prefs: Record<string, unknown>, partition: string): void {
  expect(prefs['partition']).toBe(partition);
  expect('preload' in prefs).toBe(false);
  for (const [key, value] of Object.entries(PINNED)) expect(prefs[key], key).toBe(value);
}

function expectGuards(view: FakeView): void {
  // `<webview>` cannot attach, whatever `webviewTag` says.
  const attach = { preventDefault: vi.fn() };
  view.webContents.handlers.get('will-attach-webview')?.(attach);
  expect(attach.preventDefault).toHaveBeenCalledTimes(1);
  // `window.open` never spawns a window, for any disposition.
  const open = view.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as (details: {
    url: string;
    disposition: string;
  }) => { action: string };
  for (const disposition of ['new-window', 'foreground-tab', 'background-tab', 'default']) {
    expect(open({ url: 'https://example.com/popup', disposition })).toEqual({ action: 'deny' });
    expect(open({ url: 'file:///etc/passwd', disposition })).toEqual({ action: 'deny' });
  }
}

describe('embedded page webPreferences (Phase 117 Theme A)', () => {
  beforeEach(() => {
    views.length = 0;
    resetBrowserServiceForTests();
    resetWebAppsServiceForTests();
    install();
  });
  afterEach(() => vi.clearAllMocks());

  it('browser tab: the pinned table on persist:browser, DevTools off unless the composer allows them', () => {
    createBrowserTab(fakeWindow(), 'tab-1', 'https://example.com');
    const view = views[0]!;
    expectPinned(prefsOf(view), 'persist:browser');
    expect(prefsOf(view)['devTools']).toBe(false);
    expectGuards(view);
  });

  it('web app view: the same table on its own persist:app-<id> partition', () => {
    enableWebApp(fakeWindow(), 'spotify');
    const view = views[0]!;
    expectPinned(prefsOf(view), 'persist:app-spotify');
    expect(prefsOf(view)['devTools']).toBe(false);
    expectGuards(view);
  });

  it('devTools follows the composer, and only devTools', () => {
    install({ devToolsAllowed: true });
    createBrowserTab(fakeWindow(), 'tab-1', 'https://example.com');
    enableWebApp(fakeWindow(), 'spotify');
    for (const view of views) {
      expectPinned(prefsOf(view), prefsOf(view)['partition'] as string);
      expect(prefsOf(view)['devTools']).toBe(true);
    }
  });
});
