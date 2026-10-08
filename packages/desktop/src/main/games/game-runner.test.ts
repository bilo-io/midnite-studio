import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENT_CHANNELS, GAMES_MAX_RUNNING } from '@midnite/studio-shared';

import {
  createGameRunner,
  gameEntryUrl,
  gamePartition,
  isGamePermissionAllowed,
  isGameRequestAllowed,
  isReloadTrigger,
  type RunnableGame,
} from './game-runner';

const { FakeWebContentsView, fakeSessions, makeFakeSession, behaviour } = vi.hoisted(() => {
  const behaviour = { attachThrows: false };
  type Handler = (...args: unknown[]) => unknown;

  class FakeWebContents {
    destroyed = false;
    handlers = new Map<string, Handler[]>();
    loadURL = vi.fn(async () => undefined);
    setWindowOpenHandler = vi.fn();
    setBackgroundThrottling = vi.fn();
    setAudioMuted = vi.fn();
    reloadIgnoringCache = vi.fn();
    openDevTools = vi.fn();
    closeDevTools = vi.fn();
    isDevToolsOpened = vi.fn(() => false);
    executeJavaScript = vi.fn(async () => true as unknown);
    removeAllListeners = vi.fn(() => this.handlers.clear());
    close = vi.fn(() => {
      this.destroyed = true;
    });
    debuggerHandlers = new Map<string, Handler[]>();
    debugger = {
      attach: vi.fn(() => {
        if (behaviour.attachThrows) throw new Error('Another debugger is already attached');
      }),
      detach: vi.fn(),
      sendCommand: vi.fn(async () => ({})),
      on: vi.fn((event: string, handler: Handler) => {
        this.debuggerHandlers.set(event, [...(this.debuggerHandlers.get(event) ?? []), handler]);
      }),
    };
    on(event: string, handler: Handler): this {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }

  class FakeWebContentsView {
    webContents = new FakeWebContents();
    options: Record<string, unknown>;
    visible = true;
    bounds: unknown = null;
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
    const handlers = new Map<string, Handler[]>();
    const session = {
      handlers,
      protocol: { handle: vi.fn() },
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn() },
      on: vi.fn((event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      }),
    };
    return session;
  }

  const fakeSessions = new Map<string, ReturnType<typeof makeFakeSession>>();
  return { FakeWebContentsView, fakeSessions, makeFakeSession, behaviour };
});

vi.mock('electron', () => ({
  WebContentsView: FakeWebContentsView,
  session: {
    fromPartition: vi.fn((name: string) => {
      const created = makeFakeSession();
      fakeSessions.set(name, created);
      return created;
    }),
  },
  net: { fetch: vi.fn() },
}));

type FakeView = InstanceType<typeof FakeWebContentsView>;

function fakeWindow(zoom = 1) {
  return {
    isDestroyed: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { getZoomFactor: vi.fn(() => zoom) },
  } as unknown as import('electron').BrowserWindow;
}

const game = (id: string, over: Partial<RunnableGame> = {}): RunnableGame => ({
  gameId: id,
  root: '/nonexistent/game-root',
  network: 'off',
  keepSaveData: false,
  ...over,
});

const logger = Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('createGameRunner', () => {
  let win: ReturnType<typeof fakeWindow>;
  let send: ReturnType<typeof vi.fn>;
  let runner: ReturnType<typeof createGameRunner>;

  beforeEach(() => {
    fakeSessions.clear();
    win = fakeWindow();
    send = vi.fn();
    runner = createGameRunner({ getWindow: () => win, log: logger, send });
  });
  afterEach(() => {
    runner.stopAll();
    vi.clearAllMocks();
  });

  const viewOf = (gameId: string): FakeView => runner.view(gameId) as unknown as FakeView;

  it('creates a sandboxed view with no preload and the locked-down webPreferences table', async () => {
    const result = await runner.run(game('ga'));
    expect(result.ok).toBe(true);
    const prefs = viewOf('ga').options['webPreferences'] as Record<string, unknown>;
    expect(prefs).toEqual({
      partition: expect.stringMatching(/^game-ga-r[0-9a-f]{8}$/),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      experimentalFeatures: false,
      backgroundThrottling: true,
    });
    expect(prefs).not.toHaveProperty('preload');
    expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
  });

  it('loads index.html, with the deterministic-mode query when the run asks for it (Theme O)', () => {
    expect(gameEntryUrl({ gameId: 'ga' })).toBe('mstudio-game://ga/index.html');
    expect(gameEntryUrl({ gameId: 'ga', determinism: { seed: 7, paused: false } })).toBe(
      'mstudio-game://ga/index.html?midnite-deterministic=1&midnite-seed=7',
    );
    expect(gameEntryUrl({ gameId: 'ga', determinism: { seed: -3, paused: true } })).toBe(
      'mstudio-game://ga/index.html?midnite-deterministic=1&midnite-seed=-3&midnite-paused=1',
    );
  });

  it('uses a fresh in-memory partition per run, and a persistent one with keepSaveData', async () => {
    expect(gamePartition('ga', 'r1', false)).toBe('game-ga-r1');
    expect(gamePartition('ga', 'r1', true)).toBe('persist:game-ga');
    const first = await runner.run(game('ga'));
    const second = await runner.run(game('ga')); // restarts
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.value.runId).not.toBe(second.value.runId);
    const names = [...fakeSessions.keys()];
    expect(names).toHaveLength(2);
    expect(names.every((name) => !name.startsWith('persist:'))).toBe(true);

    await runner.run(game('gb', { keepSaveData: true }));
    expect([...fakeSessions.keys()]).toContain('persist:game-gb');
  });

  it('handles the game scheme on the run session only', async () => {
    await runner.run(game('ga'));
    const [session] = [...fakeSessions.values()];
    expect(session?.protocol.handle).toHaveBeenCalledWith('mstudio-game', expect.any(Function));
  });

  it('cancels non-game requests: https only when the network is on, http never', () => {
    expect(isGameRequestAllowed('mstudio-game://ga/src/main.js', 'off')).toBe(true);
    expect(isGameRequestAllowed('data:image/png;base64,AAAA', 'off')).toBe(true);
    expect(isGameRequestAllowed('blob:mstudio-game://ga/uuid', 'off')).toBe(true);
    expect(isGameRequestAllowed('https://example.com/x', 'off')).toBe(false);
    expect(isGameRequestAllowed('https://example.com/x', 'on')).toBe(true);
    expect(isGameRequestAllowed('http://example.com/x', 'on')).toBe(false);
    expect(isGameRequestAllowed('file:///etc/passwd', 'on')).toBe(false);
    expect(isGameRequestAllowed('ws://localhost:1', 'on')).toBe(false);
    expect(isGameRequestAllowed('not a url', 'on')).toBe(false);
  });

  it('wires onBeforeRequest to that policy', async () => {
    await runner.run(game('ga', { network: 'off' }));
    const session = [...fakeSessions.values()][0]!;
    const hook = session.webRequest.onBeforeRequest.mock.calls[0]![0] as (
      d: { url: string },
      cb: (r: { cancel: boolean }) => void,
    ) => void;
    const cb = vi.fn();
    hook({ url: 'https://x.test/' }, cb);
    hook({ url: 'mstudio-game://ga/index.html' }, cb);
    expect(cb.mock.calls.map((call) => (call[0] as { cancel: boolean }).cancel)).toEqual([true, false]);
  });

  it('allows fullscreen, pointer lock, keyboard lock and device-less media, and denies the rest', async () => {
    for (const permission of ['fullscreen', 'pointerLock', 'keyboardLock']) {
      expect(isGamePermissionAllowed(permission)).toBe(true);
    }
    expect(isGamePermissionAllowed('media', { mediaTypes: [] })).toBe(true);
    expect(isGamePermissionAllowed('media', { mediaTypes: ['video'] })).toBe(false);
    for (const permission of ['geolocation', 'notifications', 'clipboard-read', 'midi', 'camera']) {
      expect(isGamePermissionAllowed(permission)).toBe(false);
    }

    await runner.run(game('ga'));
    const session = [...fakeSessions.values()][0]!;
    const request = session.setPermissionRequestHandler.mock.calls[0]![0] as (
      wc: unknown,
      permission: string,
      cb: (granted: boolean) => void,
      details: unknown,
    ) => void;
    const answers: boolean[] = [];
    request(null, 'fullscreen', (g) => answers.push(g), {});
    request(null, 'geolocation', (g) => answers.push(g), {});
    expect(answers).toEqual([true, false]);
    const deviceHandler = session.setDevicePermissionHandler.mock.calls[0]![0] as () => boolean;
    expect(deviceHandler()).toBe(false);
  });

  it('locks navigation to the game origin and denies window.open', async () => {
    await runner.run(game('ga'));
    const wc = viewOf('ga').webContents;
    const preventDefault = vi.fn();
    wc.emit('will-navigate', { url: 'https://evil.test/', preventDefault });
    wc.emit('will-navigate', { url: 'mstudio-game://ga/other.html', preventDefault });
    wc.emit('will-redirect', { url: 'mstudio-game://gb/index.html', preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    const opener = wc.setWindowOpenHandler.mock.calls[0]![0] as () => { action: string };
    expect(opener()).toEqual({ action: 'deny' });
  });

  it('swallows the DevTools chords', async () => {
    await runner.run(game('ga'));
    const wc = viewOf('ga').webContents;
    const prevented = vi.fn();
    wc.emit('before-input-event', { preventDefault: prevented }, { key: 'F12' });
    wc.emit('before-input-event', { preventDefault: prevented }, { key: 'i', meta: true, alt: true });
    wc.emit('before-input-event', { preventDefault: prevented }, { key: 'w' });
    expect(prevented).toHaveBeenCalledTimes(2);
  });

  it('refuses a fourth concurrent run', async () => {
    for (let i = 0; i < GAMES_MAX_RUNNING; i++) expect((await runner.run(game(`g${i}`))).ok).toBe(true);
    const refused = await runner.run(game('g-extra'));
    expect(refused).toEqual({ ok: false, kind: 'error', message: 'Stop a running game first (3 are running).' });
    // Restarting an already-running game is not a fourth run.
    expect((await runner.run(game('g0'))).ok).toBe(true);
  });

  it('refuses to run with no window', async () => {
    const detached = createGameRunner({ getWindow: () => null, log: logger, send });
    expect((await detached.run(game('ga'))).ok).toBe(false);
  });

  it('captures console output and exceptions, with a seq cursor, and batches them to the renderer', async () => {
    vi.useFakeTimers();
    try {
      await runner.run(game('ga'));
      const wc = viewOf('ga').webContents;
      wc.emit('console-message', {}, 1, 'midnite-ready', 3, 'mstudio-game://ga/src/main.js');
      wc.emit('console-message', {}, 3, 'boom', 9, 'mstudio-game://ga/src/main.js');
      const onDebug = wc.debuggerHandlers.get('message')![0]!;
      onDebug({}, 'Runtime.exceptionThrown', {
        exceptionDetails: { text: 'Uncaught', exception: { description: 'TypeError: x is undefined' }, stackTrace: { callFrames: [{ url: 'mstudio-game://ga/a.js', lineNumber: 4 }] } },
      });

      const { runId, entries } = runner.logs('ga');
      expect(runId).toMatch(/^r/);
      expect(entries.map((e) => [e.seq, e.level, e.text])).toEqual([
        [1, 'log', 'midnite-ready'],
        [2, 'error', 'boom'],
        [3, 'exception', 'TypeError: x is undefined'],
      ]);
      expect(entries[2]).toMatchObject({ source: 'mstudio-game://ga/a.js', line: 4 });
      expect(runner.logs('ga', 2).entries).toHaveLength(1);

      vi.advanceTimersByTime(250);
      const consoleCalls = send.mock.calls.filter((call) => call[0] === EVENT_CHANNELS.gamesConsole);
      expect(consoleCalls).toHaveLength(1);
      expect((consoleCalls[0]![1] as { entries: unknown[] }).entries).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to console-only capture, with one warning, when the debugger cannot attach', async () => {
    behaviour.attachThrows = true;
    try {
      await runner.run(game('ga'));
    } finally {
      behaviour.attachThrows = false;
    }
    const wc = viewOf('ga').webContents;
    wc.emit('console-message', {}, 1, 'still captured', 1, '');
    const { entries } = runner.logs('ga');
    expect(entries.map((e) => e.level)).toEqual(['warn', 'log']);
    expect(entries[0]?.text).toContain('debugger is already attached');
  });

  it('records a crash with its reason and reports the crashed state', async () => {
    await runner.run(game('ga'));
    viewOf('ga').webContents.emit('render-process-gone', {}, { reason: 'oom' });
    const { entries } = runner.logs('ga');
    expect(entries.at(-1)).toMatchObject({ level: 'crash' });
    expect(entries.at(-1)?.text).toContain('oom');
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesRunState, expect.objectContaining({ gameId: 'ga', state: 'crashed', reason: 'oom' }));
  });

  it('reports starting then running, and stopped on stop, which drops the view', async () => {
    await runner.run(game('ga'));
    viewOf('ga').webContents.emit('did-finish-load');
    const wc = viewOf('ga').webContents;
    runner.stop('ga');
    const states = send.mock.calls.filter((call) => call[0] === EVENT_CHANNELS.gamesRunState).map((call) => (call[1] as { state: string }).state);
    expect(states).toEqual(['starting', 'running', 'stopped']);
    expect(wc.close).toHaveBeenCalled();
    expect(win.contentView.removeChildView).toHaveBeenCalled();
    expect(runner.view('ga')).toBeNull();
    expect(runner.isRunning('ga')).toBe(false);
  });

  it('scales bounds by the zoom factor and remembers them across a restart', async () => {
    win = fakeWindow(1.5);
    runner = createGameRunner({ getWindow: () => win, log: logger, send });
    await runner.run(game('ga'));
    runner.setBounds('ga', { x: 10, y: 20, width: 100, height: 50 });
    expect(viewOf('ga').bounds).toEqual({ x: 15, y: 30, width: 150, height: 75 });
    await runner.run(game('ga'));
    expect(viewOf('ga').bounds).toEqual({ x: 15, y: 30, width: 150, height: 75 });
  });

  it('hides and throttles the view when told the tab is hidden', async () => {
    await runner.run(game('ga'));
    runner.setVisible('ga', false);
    expect(viewOf('ga').setVisible).toHaveBeenCalledWith(false);
    expect(viewOf('ga').webContents.setBackgroundThrottling).toHaveBeenCalledWith(true);
  });

  it('drives the toolbar: pause needs the game hook, mute and devtools do not', async () => {
    await runner.run(game('ga'));
    const wc = viewOf('ga').webContents;
    expect((await runner.toolbar('ga', 'pause')).ok).toBe(true);
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesRunState, expect.objectContaining({ state: 'paused' }));

    // A page that answers anything but a literal `true` has no hook.
    wc.executeJavaScript.mockResolvedValueOnce({ polluted: true });
    expect(await runner.toolbar('ga', 'resume')).toEqual({ ok: false, kind: 'error', message: 'This game has no pause hook.' });

    expect((await runner.toolbar('ga', 'mute')).ok).toBe(true);
    expect(wc.setAudioMuted).toHaveBeenCalledWith(true);
    await runner.toolbar('ga', 'devtools');
    expect(wc.openDevTools).toHaveBeenCalledWith({ mode: 'detach' });
    expect((await runner.toolbar('nope', 'pause')).ok).toBe(false);
  });

  it('reads and patches the juice settings through the game hook, and trusts nothing the page answers', async () => {
    const settings = { enabled: true, intensity: 1.5, shake: false, flash: true, particles: true, postfx: true, volume: 0.4, reducedMotion: 'auto' };
    expect(await runner.juice('nope', 'get')).toEqual({ ok: false, kind: 'error', message: 'That game is not running.' });
    await runner.run(game('ga'));
    const wc = viewOf('ga').webContents;

    wc.executeJavaScript.mockResolvedValueOnce(JSON.stringify(settings));
    const read = await runner.juice('ga', 'get');
    // `reducedMotion` is the game's own and is dropped from what we surface.
    expect(read).toEqual({ ok: true, value: { enabled: true, intensity: 1.5, shake: false, flash: true, particles: true, postfx: true, volume: 0.4 } });

    wc.executeJavaScript.mockResolvedValueOnce(JSON.stringify(settings));
    await runner.juice('ga', 'set', { shake: false, volume: 0.4 });
    const code = String(wc.executeJavaScript.mock.calls.at(-1)?.[0]);
    expect(code).toContain('j.set({"shake":false,"volume":0.4})');

    wc.executeJavaScript.mockResolvedValueOnce(null);
    expect((await runner.juice('ga', 'get')).ok).toBe(false);
    wc.executeJavaScript.mockResolvedValueOnce(JSON.stringify({ enabled: 'yes' }));
    expect((await runner.juice('ga', 'get')).ok).toBe(false);
    wc.executeJavaScript.mockRejectedValueOnce(new Error('gone'));
    expect(await runner.juice('ga', 'reset')).toEqual({ ok: false, kind: 'error', message: 'Could not reach the game.' });
  });

  it('reloads a running game and refuses to reload one that is not running', async () => {
    expect(runner.reload('ga').ok).toBe(false);
    await runner.run(game('ga'));
    expect(runner.reload('ga').ok).toBe(true);
    expect(viewOf('ga').webContents.reloadIgnoringCache).toHaveBeenCalled();
  });

  it('pops a live view out to another window and docks it back hidden (Pop out)', async () => {
    await runner.run(game('ga'));
    const view = viewOf('ga');
    const popout = fakeWindow();

    runner.reparent('ga', popout, { visible: true });
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(popout.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.visible).toBe(true);

    runner.reparent('ga', null, { visible: false });
    expect(popout.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(win.contentView.addChildView).toHaveBeenLastCalledWith(view);
    expect(view.visible).toBe(false);
  });

  it('starts a popped-out game in its popout, so Restart stays there', async () => {
    const popout = fakeWindow();
    runner.reparent('ga', popout, { visible: true }); // not running yet: only remembered
    await runner.run(game('ga'));
    expect(popout.contentView.addChildView).toHaveBeenCalledWith(viewOf('ga'));
    expect(win.contentView.addChildView).not.toHaveBeenCalled();
  });

  it('reports the current run state for a fresh renderer, and null once stopped', async () => {
    const result = await runner.run(game('ga'));
    expect(runner.runState('ga')).toEqual({ gameId: 'ga', runId: result.ok ? result.value.runId : '', state: 'starting' });
    runner.stop('ga');
    expect(runner.runState('ga')).toBeNull();
  });
});

describe('isReloadTrigger', () => {
  it.each([
    ['src/main.js', true],
    ['index.html', true],
    ['assets/img/a.png', true],
    [null, true],
    ['.git/index', false],
    ['vendor/phaser/phaser.js', false],
    ['node_modules/x/y.js', false],
    ['playtests/results/run-1.json', false],
    ['playtests/a.json', false],
    ['playtests/baselines/smoke@60.png', false],
    ['playtestsuite.js', true],
  ])('%s -> %s', (path, expected) => {
    expect(isReloadTrigger(path)).toBe(expected);
  });
});
