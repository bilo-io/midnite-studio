import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `window-manager.ts` constructs real `BrowserWindow`s, so it is faked the
 * same way `browser-service.test.ts` fakes `WebContentsView` and
 * `pty-subscribers.test.ts` fakes `BrowserWindow` itself — a minimal class
 * with just the surface `createRoleWindow`/`closeAllPopouts` touch.
 */
const { FakeBrowserWindow, fakeApp, fakeShell, fakeScreen } = vi.hoisted(() => {
  class FakeBrowserWindow {
    static nextId = 1;
    id: number;
    destroyed = false;
    minimized = false;
    focused = false;
    onceHandlers = new Map<string, (() => void)[]>();
    onHandlers = new Map<string, (() => void)[]>();
    webContents = { send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn() };
    loadURL = vi.fn(async () => undefined);
    loadFile = vi.fn(async () => undefined);

    constructor(public options: Record<string, unknown>) {
      this.id = FakeBrowserWindow.nextId++;
    }

    once(event: string, handler: () => void): void {
      const list = this.onceHandlers.get(event) ?? [];
      list.push(handler);
      this.onceHandlers.set(event, list);
    }

    on(event: string, handler: () => void): void {
      const list = this.onHandlers.get(event) ?? [];
      list.push(handler);
      this.onHandlers.set(event, list);
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    isMinimized(): boolean {
      return this.minimized;
    }

    restore(): void {
      this.minimized = false;
    }

    focus(): void {
      this.focused = true;
    }

    getPosition(): [number, number] {
      return [0, 0];
    }

    getSize(): [number, number] {
      return [(this.options['width'] as number) ?? 0, (this.options['height'] as number) ?? 0];
    }

    /** Test-only: fires every handler bound to `event`, as Electron would. */
    fire(event: string): void {
      for (const handler of this.onceHandlers.get(event) ?? []) handler();
      for (const handler of this.onHandlers.get(event) ?? []) handler();
    }

    /** Test-only: what `win.close()` does for every fake in this suite. */
    close(): void {
      if (this.destroyed) return;
      this.fire('close');
      this.destroyed = true;
      this.fire('closed');
    }
  }

  const fakeApp = { isPackaged: false, getVersion: () => '0.0.0-test' };
  const fakeShell = { openExternal: vi.fn() };
  const PRIMARY_DISPLAY = { workArea: { x: 0, y: 0, width: 1440, height: 900 } };
  const fakeScreen = { getAllDisplays: vi.fn(() => [PRIMARY_DISPLAY]) };

  return { FakeBrowserWindow, fakeApp, fakeShell, fakeScreen, PRIMARY_DISPLAY };
});

vi.mock('electron', () => ({
  BrowserWindow: FakeBrowserWindow,
  app: fakeApp,
  shell: fakeShell,
  screen: fakeScreen,
}));
vi.mock('./window-chrome', () => ({
  attachWindowChrome: vi.fn(),
  windowFrameless: vi.fn(() => false),
}));
vi.mock('./browser-service', () => ({ reparentBrowserTabs: vi.fn() }));

import {
  boundsWithinAnyDisplay,
  closeAllPopouts,
  closePopoutForRedock,
  configureWindowsStore,
  createRoleWindow,
  listWindows,
  registerMainWindow,
  relayToOtherWindows,
  resolveRole,
  windowForRole,
} from './window-manager';

/*
  One spy behind all four call forms.

  `Logger` became callable-with-levels in Phase 65 Theme A, and
  `bindPopoutRenderProcessGone` now reports through `log.error` — routing every
  level back to the same mock keeps these assertions about the MESSAGE, which is
  what they were ever about, rather than about which method produced it.
*/
const logSpy = vi.fn();
const log = Object.assign(logSpy, { info: logSpy, warn: logSpy, error: logSpy });

describe('window-manager (Phase 55)', () => {
  afterEach(() => {
    closeAllPopouts();
  });

  it('createRoleWindow registers exactly one descriptor, returned by listWindows', () => {
    const win = createRoleWindow('terminal', log);
    const descriptors = listWindows();
    expect(descriptors).toEqual([{ id: win.id, role: 'terminal', repoId: null }]);
  });

  it('a repeat call for a live role focuses the existing window instead of opening a second', () => {
    const first = createRoleWindow('fab', log);
    const second = createRoleWindow('fab', log);
    expect(second).toBe(first);
    expect((second as unknown as InstanceType<typeof FakeBrowserWindow>).focused).toBe(true);
    expect(listWindows().filter((d) => d.role === 'fab')).toHaveLength(1);
  });

  it('a minimized existing window is restored on the repeat call', () => {
    const first = createRoleWindow('repos', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
    first.minimized = true;
    createRoleWindow('repos', log);
    expect(first.minimized).toBe(false);
  });

  it('resolveRole round-trips for a created popout and defaults to main otherwise', () => {
    const win = createRoleWindow('browser', log);
    expect(resolveRole(win)).toBe('browser');
    const stranger = new FakeBrowserWindow({}) as unknown as import('electron').BrowserWindow;
    expect(resolveRole(stranger)).toBe('main');
  });

  it('closing a window removes its descriptor', () => {
    const win = createRoleWindow('terminal', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(windowForRole('terminal')).not.toBeNull();
    win.close();
    expect(windowForRole('terminal')).toBeNull();
    expect(listWindows().some((d) => d.role === 'terminal')).toBe(false);
  });

  it('closeAllPopouts closes every popout but leaves a registered main window', () => {
    const main = new FakeBrowserWindow({}) as unknown as InstanceType<typeof FakeBrowserWindow>;
    registerMainWindow(main as unknown as import('electron').BrowserWindow);
    createRoleWindow('terminal', log);
    createRoleWindow('fab', log);

    closeAllPopouts();

    const roles = listWindows().map((d) => d.role);
    expect(roles).toEqual(['main']);

    // Isolate this test's `main` from the rest of the suite.
    main.close();
    expect(listWindows()).toEqual([]);
  });

  describe('relayToOtherWindows', () => {
    beforeEach(() => {
      FakeBrowserWindow.nextId = 1;
    });

    it('sends to every other window and skips the origin', () => {
      const a = createRoleWindow('terminal', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
      const b = createRoleWindow('fab', log) as unknown as InstanceType<typeof FakeBrowserWindow>;

      relayToOtherWindows(a.id, { hello: 'world' });

      expect(a.webContents.send).not.toHaveBeenCalledWith('mstudio:window:relayed', expect.anything());
      expect(b.webContents.send).toHaveBeenCalledWith('mstudio:window:relayed', { hello: 'world' });
    });

    it('skips a destroyed window rather than throwing', () => {
      const a = createRoleWindow('terminal', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
      const b = createRoleWindow('fab', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
      b.destroyed = true;
      b.webContents.send.mockClear();

      expect(() => relayToOtherWindows(a.id, { hello: 'world' })).not.toThrow();
      expect(b.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('boundsWithinAnyDisplay (Theme G.4)', () => {
    const displays = [
      { workArea: { x: 0, y: 0, width: 1440, height: 900 } },
      { workArea: { x: 1440, y: 0, width: 1920, height: 1080 } },
    ] as unknown as import('electron').Display[];

    it('accepts an origin inside the primary display', () => {
      expect(boundsWithinAnyDisplay({ x: 100, y: 100, width: 400, height: 300 }, displays)).toBe(true);
    });

    it('accepts an origin inside a secondary display', () => {
      expect(boundsWithinAnyDisplay({ x: 1500, y: 50, width: 400, height: 300 }, displays)).toBe(true);
    });

    it('rejects an origin outside every display — the unplugged-monitor case', () => {
      expect(boundsWithinAnyDisplay({ x: 5000, y: 50, width: 400, height: 300 }, displays)).toBe(false);
    });

    it('rejects a negative origin with no display covering it', () => {
      expect(boundsWithinAnyDisplay({ x: -500, y: -500, width: 400, height: 300 }, displays)).toBe(false);
    });
  });

  describe('off-screen saved bounds are discarded (Theme G.4)', () => {
    beforeEach(() => {
      fakeScreen.getAllDisplays.mockReturnValue([
        { workArea: { x: 0, y: 0, width: 1440, height: 900 } },
      ]);
    });

    it('uses saved bounds when they fall on a visible display', async () => {
      const store = {
        load: vi.fn(async () => ({ terminal: { x: 100, y: 100, width: 500, height: 400 } })),
        save: vi.fn(async () => undefined),
      };
      configureWindowsStore(store, await store.load());

      const win = createRoleWindow('terminal', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
      expect(win.options['width']).toBe(500);
      expect(win.options['height']).toBe(400);
      expect(win.options['x']).toBe(100);
      expect(win.options['y']).toBe(100);
    });

    it('falls back to the role default when saved bounds are off every display', async () => {
      const store = {
        load: vi.fn(async () => ({ terminal: { x: 3000, y: 100, width: 500, height: 400 } })),
        save: vi.fn(async () => undefined),
      };
      configureWindowsStore(store, await store.load());

      const win = createRoleWindow('terminal', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
      // DEFAULT_POPOUT_SIZE.terminal, not the discarded off-screen rect.
      expect(win.options['width']).toBe(1100);
      expect(win.options['height']).toBe(640);
      expect(win.options['x']).toBeUndefined();
      expect(win.options['y']).toBeUndefined();
    });
  });

  describe('close-line reason (Theme G.5)', () => {
    it('a plain close (the user\'s own traffic light) logs reason=closed', () => {
      const win = createRoleWindow('terminal', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
      log.mockClear();
      win.close();
      expect(log).toHaveBeenCalledWith(`[window] close role=terminal id=${win.id} reason=closed`);
    });

    it('closePopoutForRedock logs reason=redock', () => {
      const win = createRoleWindow('repos', log);
      log.mockClear();
      closePopoutForRedock(win);
      expect(log).toHaveBeenCalledWith(
        `[window] close role=repos id=${(win as unknown as InstanceType<typeof FakeBrowserWindow>).id} reason=redock`,
      );
    });

    it('a crashed renderer logs reason=crashed on its close line', () => {
      const win = createRoleWindow('fab', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
      log.mockClear();
      const goneHandler = (win.webContents.on.mock.calls as [string, unknown][]).find(
        ([event]) => event === 'render-process-gone',
      )?.[1] as ((event: unknown, details: { reason: string; exitCode: number }) => void) | undefined;
      goneHandler?.(undefined, { reason: 'crashed', exitCode: 1 });

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('[window] render-process-gone role=fab reason=crashed exit=1'),
      );
      expect(log).toHaveBeenCalledWith(`[window] close role=fab id=${win.id} reason=crashed`);
      expect(win.destroyed).toBe(true);
    });

    it('a clean-exit render-process-gone does not close the window', () => {
      const win = createRoleWindow('browser', log) as unknown as InstanceType<typeof FakeBrowserWindow>;
      log.mockClear();
      const goneHandler = (win.webContents.on.mock.calls as [string, unknown][]).find(
        ([event]) => event === 'render-process-gone',
      )?.[1] as ((event: unknown, details: { reason: string; exitCode: number }) => void) | undefined;
      goneHandler?.(undefined, { reason: 'clean-exit', exitCode: 0 });

      expect(win.destroyed).toBe(false);
      expect(log).not.toHaveBeenCalled();
    });
  });
});
