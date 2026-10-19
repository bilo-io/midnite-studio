import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 91 Theme E: the `webPreferences` audit. Nobody weakens a default today; this is what keeps
 * it that way. The two *app* windows (main, popouts) carry the preload bridge and must stay
 * sandboxed + isolated; the browser feature's views (no preload) are audited beside their own
 * services in `browser-service.test.ts` / `web-apps-service.test.ts`. If a phase flips one of
 * these on purpose (Phase 76 Theme B and `sandbox`), update the table — do not delete it.
 */
const { created } = vi.hoisted(() => ({ created: [] as Array<Record<string, unknown>> }));

vi.mock('electron', () => {
  class FakeBrowserWindow {
    id = created.length + 1;
    webContents = { send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn(), openDevTools: vi.fn() };
    loadURL = vi.fn(async () => undefined);
    loadFile = vi.fn(async () => undefined);
    constructor(options: Record<string, unknown>) {
      created.push(options);
    }
    once = vi.fn();
    on = vi.fn();
    isDestroyed = () => false;
    getPosition = () => [0, 0];
    getSize = () => [0, 0];
  }
  return {
    BrowserWindow: FakeBrowserWindow,
    app: { isPackaged: true, getVersion: () => '0.0.0', getAppPath: () => '/app', dock: undefined },
    shell: { openExternal: vi.fn() },
    screen: { getAllDisplays: () => [] },
  };
});
vi.mock('./window-chrome', () => ({
  attachWindowChrome: vi.fn(),
  windowFrameless: vi.fn(() => false),
  TRAFFIC_LIGHT_POSITION: { x: 16, y: 13 },
}));
vi.mock('./browser-port', () => ({ reparentBrowserTabs: vi.fn(), reparentWebAppView: vi.fn() }));
vi.mock('./capture', () => ({ maybeCapture: vi.fn() }));
vi.mock('./perf-marks', () => ({ bootMark: vi.fn() }));

Object.defineProperty(process, 'resourcesPath', { value: '/res', configurable: true });

import { createWindow } from './window';
import { createRoleWindow } from './window-manager';

const log = Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() });

const SAFE = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  // Never set to a weaker value; absent means Electron's safe default.
  webSecurity: undefined,
  allowRunningInsecureContent: undefined,
  experimentalFeatures: undefined,
  webviewTag: undefined,
} as const;

function expectSafe(prefs: Record<string, unknown>): void {
  for (const [key, expected] of Object.entries(SAFE)) {
    if (expected === undefined) {
      // Either absent or explicitly the safe value — never `true` for the dangerous flags.
      const value = prefs[key];
      if (key === 'webSecurity') expect(value === undefined || value === true).toBe(true);
      else expect(value === undefined || value === false).toBe(true);
    } else {
      expect(prefs[key]).toBe(expected);
    }
  }
}

describe('app window webPreferences', () => {
  beforeEach(() => {
    created.length = 0;
  });

  it('main window: isolated, sandboxed, preload present, DevTools off when packaged', () => {
    createWindow();
    const prefs = created[0]?.['webPreferences'] as Record<string, unknown>;
    expectSafe(prefs);
    expect(prefs['preload']).toEqual(expect.stringContaining('preload.js'));
    expect(prefs['devTools']).toBe(false);
  });

  it('popout window: the same as main', () => {
    createRoleWindow('notes', log);
    const prefs = created[0]?.['webPreferences'] as Record<string, unknown>;
    expectSafe(prefs);
    expect(prefs['preload']).toEqual(expect.stringContaining('preload.js'));
    expect(prefs['devTools']).toBe(false);
  });
});
