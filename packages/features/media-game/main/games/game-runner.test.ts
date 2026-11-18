// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EVENT_CHANNELS, failure, GAMES_MAX_RUNNING, ok } from '@midnite/studio-shared';

import type { GameElectron, GameWindow } from './game-electron';
import {
  createGameRunner,
  GAME_BUILD_DEBOUNCE_MS,
  GAME_RELOAD_DEBOUNCE_MS,
  gameEntryUrl,
  gamePartition,
  isGamePermissionAllowed,
  isGameRequestAllowed,
  isReloadTrigger,
  reloadKind,
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

/** The Electron pieces the runner is handed, over the fakes above — no module is mocked. */
const electron = {
  sessionFromPartition: vi.fn((name: string) => {
    const created = makeFakeSession();
    fakeSessions.set(name, created);
    return created;
  }),
  createView: (options: unknown) => new FakeWebContentsView(options as Record<string, unknown>),
  cancelDownload: (item: { getFilename(): string; cancel(): void }, report: (filename: string) => void) => {
    item.cancel();
    report(item.getFilename());
  },
  fetchFile: vi.fn(),
} as unknown as GameElectron;

type FakeView = InstanceType<typeof FakeWebContentsView>;

function fakeWindow(zoom = 1) {
  return {
    isDestroyed: () => false,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { getZoomFactor: vi.fn(() => zoom) },
  } as unknown as GameWindow;
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
  let send: Mock<(channel: string, payload: unknown) => void>;
  let runner: ReturnType<typeof createGameRunner>;

  beforeEach(() => {
    fakeSessions.clear();
    win = fakeWindow();
    send = vi.fn<(channel: string, payload: unknown) => void>();
    runner = createGameRunner({ getWindow: () => win, electron, log: logger, send });
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

  it('adds midnite-level to the entry URL, with or without determinism (Phase 132 Theme C)', () => {
    expect(gameEntryUrl({ gameId: 'ga', level: 'cave' })).toBe('mstudio-game://ga/index.html?midnite-level=cave');
    expect(gameEntryUrl({ gameId: 'ga', level: 'cave', determinism: { seed: 7, paused: true } })).toBe(
      'mstudio-game://ga/index.html?midnite-deterministic=1&midnite-seed=7&midnite-paused=1&midnite-level=cave',
    );
  });

  it('goto: a stopped game remembers the scene for its next run, once', async () => {
    const answer = await runner.goto('ga', 'cave');
    expect(answer).toEqual({ ok: true, value: { via: 'next-run' } });
    await runner.run(game('ga'));
    expect(viewOf('ga').webContents.loadURL).toHaveBeenCalledWith('mstudio-game://ga/index.html?midnite-level=cave');
    await runner.run(game('ga')); // restarts: the pick was spent
    expect(viewOf('ga').webContents.loadURL).toHaveBeenCalledWith('mstudio-game://ga/index.html');
  });

  it('goto: a running game with the hook is told, a literal true only', async () => {
    await runner.run(game('ga'));
    const wc = viewOf('ga').webContents;
    wc.loadURL.mockClear();
    expect(await runner.goto('ga', 'cave')).toEqual({ ok: true, value: { via: 'hook' } });
    expect(String((wc.executeJavaScript.mock.calls as unknown[][]).at(-1)?.[0])).toContain('m.goto("cave")');
    expect(wc.loadURL).not.toHaveBeenCalled();
  });

  it('goto: no hook (or a page answering anything but true) reloads on the level URL, and later reloads keep it', async () => {
    await runner.run(game('ga', { determinism: { seed: 3, paused: false } }));
    const wc = viewOf('ga').webContents;
    wc.loadURL.mockClear();
    wc.executeJavaScript.mockResolvedValueOnce(false);
    expect(await runner.goto('ga', 'cave')).toEqual({ ok: true, value: { via: 'reload' } });
    expect(wc.loadURL).toHaveBeenCalledWith('mstudio-game://ga/index.html?midnite-deterministic=1&midnite-seed=3&midnite-level=cave');
    wc.executeJavaScript.mockResolvedValueOnce({ polluted: true });
    await runner.goto('ga', 'keep');
    expect(wc.loadURL).toHaveBeenLastCalledWith('mstudio-game://ga/index.html?midnite-deterministic=1&midnite-seed=3&midnite-level=keep');
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
    const detached = createGameRunner({ getWindow: () => null, electron, log: logger, send });
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
    runner = createGameRunner({ getWindow: () => win, electron, log: logger, send });
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
    const code = String((wc.executeJavaScript.mock.calls.at(-1) as unknown[] | undefined)?.[0]);
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
    ['.vite/deps/a.js', false],
    ['.turbo/log', false],
  ])('%s -> %s', (path, expected) => {
    expect(isReloadTrigger(path)).toBe(expected);
  });

  it.each([
    ['dist/index.html', 'dist', false],
    ['dist', 'dist', false],
    ['dist/assets/a.js', './dist/', false],
    ['src/main.ts', 'dist', true],
    ['distinct/a.ts', 'dist', true],
    ['index.html', '.', true],
  ])('%s with build.out %s -> %s (Phase 149 Theme E)', (path, out, expected) => {
    expect(isReloadTrigger(path, out)).toBe(expected);
  });
});

describe('createGameRunner with a build (Phase 149 Theme E)', () => {
  let win: ReturnType<typeof fakeWindow>;
  let send: Mock<(channel: string, payload: unknown) => void>;
  const build = vi.fn(async (..._args: unknown[]): Promise<ReturnType<typeof ok<{ ms: number }>> | ReturnType<typeof failure<{ ms: number }>>> => ok({ ms: 5 }));
  let runner: ReturnType<typeof createGameRunner>;
  const spec = { command: 'vite build', out: 'dist' };
  const viewOf = (gameId: string): FakeView => runner.view(gameId) as unknown as FakeView;

  beforeEach(() => {
    fakeSessions.clear();
    build.mockClear();
    build.mockImplementation(async () => ok({ ms: 5 }));
    win = fakeWindow();
    send = vi.fn<(channel: string, payload: unknown) => void>();
    runner = createGameRunner({ getWindow: () => win, electron, log: logger, send, build: build as never });
  });
  afterEach(() => {
    runner.stopAll();
    vi.clearAllMocks();
  });

  it('serves build.out, not the repo root', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'game-serve-'));
    try {
      await mkdir(join(repo, 'dist'));
      await writeFile(join(repo, 'index.html'), '<html>source</html>');
      await writeFile(join(repo, 'dist', 'index.html'), '<html>built</html>');
      (electron.fetchFile as Mock).mockResolvedValue(new Response('ok'));
      await runner.run(game('ga', { root: repo, build: spec }));
      const session = [...fakeSessions.values()][0]!;
      const handler = session.protocol.handle.mock.calls[0]![1] as (r: Request) => Promise<Response>;
      expect((await handler(new Request('mstudio-game://ga/index.html'))).status).toBe(200);
      expect((electron.fetchFile as Mock).mock.calls[0]![0]).toMatch(/\/dist\/index\.html$/);
      // The sources beside it are outside what is served.
      await writeFile(join(repo, 'secret.txt'), 's');
      expect((await handler(new Request('mstudio-game://ga/secret.txt'))).status).toBe(404);
    } finally {
      runner.stopAll();
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('refuses a build.out that escapes the game', async () => {
    const result = await runner.run(game('ga', { root: '/games/ga', build: { command: 'x', out: '../etc' } }));
    expect(result).toMatchObject({ ok: false, message: 'Build output is outside the game.' });
    expect(build).not.toHaveBeenCalled();
    expect(runner.isRunning('ga')).toBe(false);
  });

  it('builds first, streams lines as source build, then loads', async () => {
    build.mockImplementation(async (...args: unknown[]) => {
      (args[2] as (l: string) => void)('compiling');
      return ok({ ms: 5 });
    });
    await runner.run(game('ga', { root: '/games/ga', build: spec }));
    await vi.waitFor(() => expect(viewOf('ga').webContents.loadURL).toHaveBeenCalledWith('mstudio-game://ga/index.html'));
    expect(build).toHaveBeenCalledWith('/games/ga', spec, expect.any(Function), expect.any(AbortSignal));
    const entries = runner.logs('ga').entries.filter((e) => e.source === 'build');
    expect(entries.map((e) => e.text)).toEqual(['$ vite build', 'compiling', 'Built in 5 ms.']);
  });

  it('a failed build never loads and puts the last lines in the crashed reason', async () => {
    build.mockImplementation(async () => failure('Build failed (exit 1).', 'line a\nline b'));
    await runner.run(game('ga', { root: '/games/ga', build: spec }));
    await vi.waitFor(() => expect(runner.runState('ga')?.state).toBe('crashed'));
    expect(runner.runState('ga')?.reason).toBe('build-failed:Build failed (exit 1).\nline a\nline b');
    expect(viewOf('ga').webContents.loadURL).not.toHaveBeenCalled();
    // Reload after a failure rebuilds; success then loads and clears the error.
    build.mockImplementation(async () => ok({ ms: 1 }));
    expect(runner.reload('ga')).toEqual({ ok: true });
    await vi.waitFor(() => expect(viewOf('ga').webContents.loadURL).toHaveBeenCalledTimes(1));
    expect(runner.runState('ga')?.state).toBe('starting');
  });

  it('a plain reload of a clean build game does not rebuild', async () => {
    await runner.run(game('ga', { root: '/games/ga', build: spec }));
    await vi.waitFor(() => expect(viewOf('ga').webContents.loadURL).toHaveBeenCalled());
    runner.reload('ga');
    expect(build).toHaveBeenCalledTimes(1);
    expect(viewOf('ga').webContents.reloadIgnoringCache).toHaveBeenCalledTimes(1);
  });

  describe('watcher', () => {
    let root: string;
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'game-runner-'));
      await mkdir(join(root, 'src'));
      await mkdir(join(root, 'dist'));
    });
    afterEach(async () => {
      runner.stopAll();
      await rm(root, { recursive: true, force: true });
    });

    it('rebuilds then reloads on a source change, and ignores writes under build.out', async () => {
      await runner.run(game('ga', { root, build: spec }));
      await vi.waitFor(() => expect(viewOf('ga').webContents.loadURL).toHaveBeenCalled());
      // The directories made above may still be reporting; let them settle, then count from zero.
      await new Promise((resolve) => setTimeout(resolve, GAME_BUILD_DEBOUNCE_MS * 3)); // allow-timeout: fs events arrive on their own clock
      await vi.waitFor(() => expect(viewOf('ga').webContents.loadURL).toHaveBeenCalled());
      build.mockClear();

      await writeFile(join(root, 'dist', 'bundle.js'), 'x');
      await new Promise((resolve) => setTimeout(resolve, GAME_BUILD_DEBOUNCE_MS * 2)); // allow-timeout: a negative needs real time to elapse
      expect(build).not.toHaveBeenCalled();

      await writeFile(join(root, 'src', 'main.ts'), 'y');
      await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1), { timeout: 4000 });
      await vi.waitFor(() => expect(viewOf('ga').webContents.reloadIgnoringCache).toHaveBeenCalled());
    });

    it('cancels a build in flight when another source change arrives', async () => {
      const signals: AbortSignal[] = [];
      build.mockImplementation(async (...args: unknown[]) => {
        const signal = args[3] as AbortSignal;
        signals.push(signal);
        if (signals.length === 2) await new Promise((resolve) => signal.addEventListener('abort', resolve));
        return ok({ ms: 1 });
      });
      await runner.run(game('ga', { root, build: spec }));
      await vi.waitFor(() => expect(viewOf('ga').webContents.loadURL).toHaveBeenCalled());
      await writeFile(join(root, 'src', 'a.ts'), '1');
      await vi.waitFor(() => expect(signals).toHaveLength(2), { timeout: 4000 });
      await writeFile(join(root, 'src', 'b.ts'), '2');
      await vi.waitFor(() => expect(signals).toHaveLength(3), { timeout: 4000 });
      expect(signals[1]!.aborted).toBe(true);
    });
  });
});

describe('gameEntryUrl spawn (Phase 140 Theme B)', () => {
  it('adds midnite-spawn for 2 and 3 values, beside the level and determinism params', () => {
    expect(gameEntryUrl({ gameId: 'ga', determinism: null, level: 'cave', spawn: { x: 120, y: 48 } })).toBe(
      'mstudio-game://ga/index.html?midnite-level=cave&midnite-spawn=120%2C48',
    );
    const url = new URL(gameEntryUrl({ gameId: 'ga', determinism: { seed: 7, paused: true }, spawn: { x: 12.5, y: 0, z: -3 } }));
    expect(url.searchParams.get('midnite-spawn')).toBe('12.5,0,-3');
    expect(url.searchParams.get('midnite-seed')).toBe('7');
  });

  it('adds nothing without a spawn', () => {
    expect(gameEntryUrl({ gameId: 'ga', determinism: null, spawn: null })).toBe('mstudio-game://ga/index.html');
  });
});

describe('reloadKind (Phase 140 Theme C)', () => {
  it('is scene when every path is a level, page for anything else or an unknown path', () => {
    expect(reloadKind(['levels/cave.tmj'])).toBe('scene');
    expect(reloadKind(['levels/prefabs/door.prefab.json', 'levels/cave.tmj'])).toBe('scene');
    expect(reloadKind(['src/main.js', 'levels/cave.tmj'])).toBe('page');
    expect(reloadKind([null])).toBe('page');
    expect(reloadKind(['levels\\cave.tmj'])).toBe('scene');
    expect(reloadKind(['levels-extra/a.js'])).toBe('page');
    expect(reloadKind([])).toBe('none');
  });
});

describe('createGameRunner preview and level hot reload (Phase 140 Themes B, C)', () => {
  let runner: ReturnType<typeof createGameRunner>;
  let root: string;
  const viewOf = (gameId: string): FakeView => runner.view(gameId) as unknown as FakeView;

  beforeEach(async () => {
    fakeSessions.clear();
    runner = createGameRunner({ getWindow: () => fakeWindow(), electron, log: logger, send: vi.fn() });
    root = await mkdtemp(join(tmpdir(), 'game-hot-'));
    await mkdir(join(root, 'levels'));
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'levels', 'cave.tmj'), '{}');
    await writeFile(join(root, 'src', 'main.js'), '1');
  });
  afterEach(async () => {
    runner.stopAll();
    vi.clearAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, GAME_RELOAD_DEBOUNCE_MS * 3)); // allow-timeout: fs events arrive on their own clock

  it('a preview run loads the spawn URL and hands the protocol handler an overlay for its scene only', async () => {
    await runner.run(game('ga', { root, level: 'cave', spawn: { x: 1, y: 2 }, preview: { scene: 'cave', json: '{"unsaved":true}' } }));
    expect(viewOf('ga').webContents.loadURL).toHaveBeenCalledWith('mstudio-game://ga/index.html?midnite-level=cave&midnite-spawn=1%2C2');
    const handler = [...fakeSessions.values()][0]!.protocol.handle.mock.calls[0]![1] as (r: Request) => Promise<Response>;
    const res = await handler(new Request('mstudio-game://ga/levels/cave.tmj'));
    expect(await res.text()).toBe('{"unsaved":true}');
    expect((await handler(new Request('mstudio-game://ga/levels/other.tmj'))).status).toBe(404);
  });

  it('clearPreview(scene) only clears a matching scene; stop clears too', async () => {
    await runner.run(game('ga', { root, preview: { scene: 'cave', json: '{"a":1}' } }));
    const handler = [...fakeSessions.values()][0]!.protocol.handle.mock.calls[0]![1] as (r: Request) => Promise<Response>;
    runner.clearPreview('ga', 'other');
    expect(await (await handler(new Request('mstudio-game://ga/levels/cave.tmj'))).text()).toBe('{"a":1}');
    runner.clearPreview('ga', 'cave');
    expect(await (await handler(new Request('mstudio-game://ga/levels/cave.tmj'))).text()).not.toBe('{"a":1}');
  });

  it('refuses a preview over the size cap without starting a view', async () => {
    const big = createGameRunner({
      getWindow: () => fakeWindow(),
      electron,
      log: logger,
      send: vi.fn(),
      overlay: { set: () => false, get: () => null, scene: () => null, clear: () => undefined },
    });
    const result = await big.run(game('gb', { root, preview: { scene: 'cave', json: 'x' } }));
    expect(result.ok).toBe(false);
    expect(big.isRunning('gb')).toBe(false);
  });

  it('a level change restarts the scene through the hook (current scene from getState), not a page reload', async () => {
    await runner.run(game('ga', { root, level: 'main' }));
    await settle();
    const wc = viewOf('ga').webContents;
    wc.executeJavaScript.mockImplementation(async (code: unknown) => (String(code).includes('getState') ? 'cave' : true));
    wc.executeJavaScript.mockClear();
    wc.reloadIgnoringCache.mockClear();
    await writeFile(join(root, 'levels', 'cave.tmj'), '{"x":1}');
    await vi.waitFor(() => expect(String(wc.executeJavaScript.mock.calls.at(-1)?.[0])).toContain('m.goto("cave")'), { timeout: 4000 });
    expect(wc.reloadIgnoringCache).not.toHaveBeenCalled();
  });

  it('falls back to a page reload when the hook call fails', async () => {
    await runner.run(game('ga', { root, level: 'main' }));
    await settle();
    const wc = viewOf('ga').webContents;
    wc.executeJavaScript.mockImplementation(async (code: unknown) => (String(code).includes('getState') ? 'cave' : false));
    wc.reloadIgnoringCache.mockClear();
    await writeFile(join(root, 'levels', 'cave.tmj'), '{"x":2}');
    await vi.waitFor(() => expect(wc.reloadIgnoringCache).toHaveBeenCalled(), { timeout: 4000 });
  });

  it('a code change still reloads the page without asking the hook', async () => {
    await runner.run(game('ga', { root }));
    await settle();
    const wc = viewOf('ga').webContents;
    wc.executeJavaScript.mockClear();
    await writeFile(join(root, 'src', 'main.js'), '2');
    await vi.waitFor(() => expect(wc.reloadIgnoringCache).toHaveBeenCalled(), { timeout: 4000 });
    expect(wc.executeJavaScript).not.toHaveBeenCalled();
  });
});
