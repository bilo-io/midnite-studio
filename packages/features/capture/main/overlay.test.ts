import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRecordingContext } from '@midnite/studio-runtime';
import {
  CAPTURE_DEFAULT_SETTINGS,
  CAPTURE_OVERLAY_ARG,
  CHANNELS,
  type CaptureChanged,
  type GitOpResult,
} from '@midnite/studio-shared';

import { createCaptureStore } from './capture-store';
import { createDisplayMediaGate } from './display-media';
import {
  electronOverlayOpener,
  overlayWindowOptions,
  type CaptureOverlayBrowserWindow,
} from './electron-port';
import { captureMain } from './index';
import {
  createOverlayController,
  newOverlayToken,
  type CaptureOverlayOpener,
  type OverlaySession,
} from './overlay';
import { createCaptureService, type CaptureServiceDeps } from './service';
import { fakeElectron, manualTimers, tempDir, type FakeElectron } from './test-fixtures';

/**
 * The desktop region overlay, open-in-Studio and import — all against fakes. **No real window is ever
 * opened here**: the opener is a recording function and the "BrowserWindow" is a plain object.
 */

let dir = '';
let cleanup: () => Promise<void> = async () => undefined;
beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
});
afterEach(() => cleanup());

const value = <T>(result: GitOpResult<T>): T => {
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result)}`);
  return (result as { value: T }).value;
};

type OpenedOverlay = {
  token: string;
  bounds: { x: number; y: number; width: number; height: number };
  onClosed: () => void;
  closed: number;
};

/** A recording opener: what a composer's real one would open, kept as data. */
function fakeOpener(opts: { refuse?: boolean } = {}) {
  const opened: OpenedOverlay[] = [];
  const opener: CaptureOverlayOpener = ({ token, bounds, onClosed }) => {
    if (opts.refuse) return null;
    const entry: OpenedOverlay = { token, bounds, onClosed, closed: 0 };
    opened.push(entry);
    return {
      close: () => {
        entry.closed += 1;
      },
    };
  };
  return { opener, opened };
}

function make(over: Partial<CaptureServiceDeps> & { el?: FakeElectron } = {}) {
  const el = over.el ?? fakeElectron();
  const events: CaptureChanged[] = [];
  const service = createCaptureService({
    dataDir: join(dir, 'studio'),
    electron: el,
    defaults: CAPTURE_DEFAULT_SETTINGS,
    emit: (p) => events.push(p),
    trashItem: async () => undefined,
    gate: createDisplayMediaGate({ isAppOrigin: (o) => o === 'file://' }),
    background: { shortcut: true, clipboard: true },
    timers: manualTimers(),
    ...over,
  });
  return { el, service, events };
}

describe('overlay controller', () => {
  it('opens one overlay per token, refuses unknown tokens, and reports a dismissal once', () => {
    const { opener, opened } = fakeOpener();
    const dismissed: OverlaySession[] = [];
    let n = 0;
    const ctl = createOverlayController({
      opener,
      onDismissed: (s) => dismissed.push(s),
      token: () => `ovl-${String(++n).padStart(16, '0')}`,
    });
    const bounds = { x: 0, y: 0, width: 100, height: 50 };
    expect(ctl.available).toBe(true);
    expect(ctl.open({ pendingId: 'p1', bounds, origin: 'view' })).toBe(true);
    expect(ctl.pendingId()).toBe('p1');
    expect(ctl.session(opened[0]!.token)?.pendingId).toBe('p1');
    expect(ctl.session('ovl-ffffffffffffffff')).toBeNull();

    // A second overlay dismisses the first.
    expect(ctl.open({ pendingId: 'p2', bounds, origin: 'shortcut' })).toBe(true);
    expect(opened[0]!.closed).toBe(1);
    expect(dismissed.map((s) => s.pendingId)).toEqual(['p1']);
    expect(ctl.session(opened[0]!.token)).toBeNull();

    // Finishing is not a dismissal; the window's own close after it is a no-op.
    expect(ctl.finish(opened[1]!.token)?.origin).toBe('shortcut');
    opened[1]!.onClosed();
    expect(dismissed).toHaveLength(1);
    expect(ctl.pendingId()).toBeNull();
  });

  it('a window that closes by itself (blur, the OS) is a dismissal', () => {
    const { opener, opened } = fakeOpener();
    const dismissed: string[] = [];
    const ctl = createOverlayController({
      opener,
      onDismissed: (s) => dismissed.push(s.pendingId),
    });
    ctl.open({ pendingId: 'p1', bounds: { x: 0, y: 0, width: 10, height: 10 }, origin: 'view' });
    opened[0]!.onClosed();
    expect(dismissed).toEqual(['p1']);
    ctl.dispose();
    expect(dismissed).toEqual(['p1']);
  });

  it('opens nothing without an opener, bounds, or when the opener refuses or throws', () => {
    const noop = () => undefined;
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    expect(
      createOverlayController({ onDismissed: noop }).open({
        pendingId: 'p',
        bounds,
        origin: 'view',
      }),
    ).toBe(false);
    const { opener } = fakeOpener();
    const ctl = createOverlayController({ opener, onDismissed: noop });
    expect(ctl.open({ pendingId: 'p', bounds: undefined, origin: 'view' })).toBe(false);
    expect(ctl.open({ pendingId: 'p', bounds: { ...bounds, width: 0 }, origin: 'view' })).toBe(
      false,
    );
    expect(
      createOverlayController({
        opener: fakeOpener({ refuse: true }).opener,
        onDismissed: noop,
      }).open({
        pendingId: 'p',
        bounds,
        origin: 'view',
      }),
    ).toBe(false);
    const throwing = createOverlayController({
      opener: () => {
        throw new Error('no window');
      },
      onDismissed: noop,
    });
    expect(throwing.open({ pendingId: 'p', bounds, origin: 'view' })).toBe(false);
    expect(throwing.pendingId()).toBeNull();
  });

  it('mints tokens the wire schema accepts', () => {
    const a = newOverlayToken();
    expect(a).toMatch(/^ovl-[0-9a-f]{24}$/);
    expect(newOverlayToken()).not.toBe(a);
  });
});

describe('electron overlay opener', () => {
  it('asks for a frameless, transparent, sandboxed window over the display with only its token', () => {
    const options = overlayWindowOptions({
      bounds: { x: 1512.4, y: 0, width: 2560, height: 1440 },
      token: 'ovl-0123456789abcdef',
      preloadPath: '/app/capture-overlay-preload.js',
      tokenArg: CAPTURE_OVERLAY_ARG,
    });
    expect(options).toMatchObject({
      x: 1512,
      y: 0,
      width: 2560,
      height: 1440,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: '/app/capture-overlay-preload.js',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        additionalArguments: [`${CAPTURE_OVERLAY_ARG}ovl-0123456789abcdef`],
      },
    });
  });

  it('loads the app page, shows on ready, closes on blur and reports its close', async () => {
    const listeners = new Map<string, () => void>();
    const calls: string[] = [];
    let destroyed = false;
    const win: CaptureOverlayBrowserWindow = {
      isDestroyed: () => destroyed,
      close: () => {
        calls.push('close');
        destroyed = true;
        listeners.get('closed')?.();
      },
      show: () => calls.push('show'),
      focus: () => calls.push('focus'),
      setAlwaysOnTop: (flag, level) => calls.push(`top:${flag}:${level}`),
      on: (event, listener) => listeners.set(event, listener),
      once: (event, listener) => listeners.set(event, listener),
      loadFile: async (path) => {
        calls.push(`load:${path}`);
      },
    };
    const created: Record<string, unknown>[] = [];
    let closedReported = 0;
    const open = electronOverlayOpener({
      createWindow: (o) => {
        created.push(o);
        return win;
      },
      htmlPath: '/app/capture-overlay.html',
      preloadPath: '/app/preload.js',
      tokenArg: CAPTURE_OVERLAY_ARG,
    });
    const handle = open({
      token: 'ovl-0123456789abcdef',
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      onClosed: () => {
        closedReported += 1;
      },
    });
    expect(handle).not.toBeNull();
    expect(created).toHaveLength(1);
    await Promise.resolve();
    expect(calls).toEqual(['top:true:screen-saver', 'load:/app/capture-overlay.html']);
    listeners.get('ready-to-show')?.();
    expect(calls.slice(-2)).toEqual(['show', 'focus']);
    listeners.get('blur')?.();
    expect(calls.at(-1)).toBe('close');
    expect(closedReported).toBe(1);
    handle?.close();
    expect(calls.filter((c) => c === 'close')).toHaveLength(1);
  });
});

describe('capture service — the region overlay', () => {
  it('without an opener, Region hands back the in-view frame from the one grab', async () => {
    const { el, service } = make();
    const start = value(await service.regionStart());
    expect(start.surface).toBe('in-view');
    if (start.surface !== 'in-view') return;
    expect(start.frame.sourceName).toBe('Studio Display');
    expect(service.regionPending()?.pendingId).toBe(start.frame.pendingId);
    expect(el.sourcesCalls).toHaveLength(1);
  });

  it('opens the overlay over the display under the pointer and crops the confirmed rect', async () => {
    const { opener, opened } = fakeOpener();
    const { el, service, events } = make({ overlay: opener });
    expect(value(await service.regionStart())).toEqual({ surface: 'overlay' });
    expect(opened).toHaveLength(1);
    expect(opened[0]!.bounds).toEqual({ x: 1512, y: 0, width: 2560, height: 1440 });
    // The overlay owns the frame: the in-view picker does not pick it up.
    expect(service.regionPending()).toBeNull();
    expect(el.focused).toBe(0);

    const { token } = opened[0]!;
    const frame = value(await service.overlayFrame(token));
    expect(frame).toMatchObject({ width: 5120, height: 2880, sourceName: 'Studio Display' });
    expect(frame.image.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect((await service.overlayFrame('ovl-ffffffffffffffff')).ok).toBe(false);
    expect(
      (await service.overlayConfirm('ovl-ffffffffffffffff', { x: 0, y: 0, width: 1, height: 1 }))
        .ok,
    ).toBe(false);

    const item = value(
      await service.overlayConfirm(token, { x: 0.5, y: 0.5, width: 0.25, height: 0.25 }),
    );
    expect(item).toMatchObject({ mode: 'region', width: 1280, height: 720 });
    expect(opened[0]!.closed).toBe(1);
    expect(events).toContainEqual({
      reason: 'overlay',
      overlay: { outcome: 'captured', captureId: item.id },
    });
    // One grab for the whole flow, and the token is spent.
    expect(el.sourcesCalls).toHaveLength(1);
    expect((await service.overlayConfirm(token, { x: 0, y: 0, width: 1, height: 1 })).ok).toBe(
      false,
    );
    expect(el.focused).toBe(0);
  });

  it('cancel and blur both drop the frozen frame and save nothing', async () => {
    const { opener, opened } = fakeOpener();
    const { service, events } = make({ overlay: opener });
    value(await service.regionStart());
    expect(value(service.overlayCancel(opened[0]!.token))).toBeUndefined();
    expect(opened[0]!.closed).toBe(1);
    expect(events.at(-1)).toEqual({ reason: 'overlay', overlay: { outcome: 'cancelled' } });

    value(await service.regionStart());
    opened[1]!.onClosed();
    expect(events.at(-1)).toEqual({ reason: 'overlay', overlay: { outcome: 'cancelled' } });
    expect((await service.overlayFrame(opened[1]!.token)).ok).toBe(false);
    expect(service.regionPending()).toBeNull();
    expect(await service.list()).toEqual([]);
  });

  it('falls back to the in-view picker when the overlay cannot open', async () => {
    const { service } = make({ overlay: fakeOpener({ refuse: true }).opener });
    const start = value(await service.regionStart());
    expect(start.surface).toBe('in-view');
  });

  it('the chord opens the overlay without raising the app, then brings it forward on confirm', async () => {
    const { opener, opened } = fakeOpener();
    const { el, service, events } = make({ overlay: opener });
    await service.onShortcut();
    expect(opened).toHaveLength(1);
    expect(el.focused).toBe(0);
    const item = value(
      await service.overlayConfirm(opened[0]!.token, { x: 0, y: 0, width: 0.5, height: 0.5 }),
    );
    expect(el.focused).toBe(1);
    expect(events.at(-1)).toEqual({ reason: 'shortcut', captureId: item.id });
  });

  it('never opens an overlay without the permission', async () => {
    const { opener, opened } = fakeOpener();
    const { el, service } = make({ overlay: opener, el: fakeElectron({ status: 'denied' }) });
    expect((await service.regionStart()).ok).toBe(false);
    await service.onShortcut();
    expect(opened).toEqual([]);
    expect(el.sourcesCalls).toEqual([]);
  });

  it('closes an open overlay on dispose', async () => {
    const { opener, opened } = fakeOpener();
    const { service } = make({ overlay: opener });
    value(await service.regionStart());
    service.dispose();
    expect(opened[0]!.closed).toBe(1);
  });

  it('answers the overlay channels only for a well-formed token', async () => {
    const ctx = createRecordingContext();
    const { opener, opened } = fakeOpener();
    const { service } = make({ overlay: opener });
    captureMain.register(ctx, { capture: service });
    expect(await ctx.invoke(CHANNELS.captureRegionStart)).toEqual({
      ok: true,
      value: { surface: 'overlay' },
    });
    expect(await ctx.invoke(CHANNELS.captureOverlayFrame, { token: 'nope' })).toMatchObject({
      ok: false,
    });
    expect(
      await ctx.invoke(CHANNELS.captureOverlayConfirm, {
        token: opened[0]!.token,
        rect: { x: 2, y: 0, width: 1, height: 1 },
      }),
    ).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.captureOverlayCancel, { token: opened[0]!.token })).toEqual({
      ok: true,
    });
  });
});

describe('capture service — Midnite Studio', () => {
  it('opens a midnite-studio://capture link it builds itself, only when the composer can', async () => {
    const opened: string[] = [];
    const { service } = make({
      openStudioLink: async (url) => {
        opened.push(url);
      },
    });
    expect((await service.status()).destinations).toEqual(['studio']);
    const item = value(await service.still({ mode: 'screen', sourceId: 'screen:1:0' }));
    value(await service.openInStudio(item.id));
    expect(opened).toEqual([`midnite-studio://capture?id=${item.id}`]);
    expect((await service.openInStudio('cap-20990101-000000-abcdef')).ok).toBe(false);

    const failing = make({
      openStudioLink: async () => {
        throw new Error('no handler');
      },
    });
    const other = value(await failing.service.still({ mode: 'screen', sourceId: 'screen:1:0' }));
    expect(await failing.service.openInStudio(other.id)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/installed/),
    });
    expect((await make().service.openInStudio(item.id)).ok).toBe(false);
  });

  it('imports a capture from Midnite Capture read-only, once', async () => {
    const standalone = make({ dataDir: join(dir, 'standalone') });
    const item = value(await standalone.service.still({ mode: 'screen', sourceId: 'screen:1:0' }));
    const sourceIndex = await readFile(join(dir, 'standalone', 'captures', 'index.json'), 'utf8');

    const studio = make({ importFrom: { dataDir: join(dir, 'standalone') } });
    const imported = value(await studio.service.importFromApp(item.id));
    expect(imported).toMatchObject({ id: item.id, fileName: item.fileName, bytes: item.bytes });
    expect(await studio.service.list()).toHaveLength(1);
    expect(
      (await readFile(studio.service.store.pathOf(imported))).equals(
        await readFile(standalone.service.store.pathOf(item)),
      ),
    ).toBe(true);
    expect(studio.events.at(-1)).toEqual({ reason: 'captures', captureId: item.id });
    // The other app's index is untouched, and a second import is the same capture.
    expect(await readFile(join(dir, 'standalone', 'captures', 'index.json'), 'utf8')).toBe(
      sourceIndex,
    );
    expect(value(await studio.service.importFromApp(item.id)).id).toBe(item.id);
    expect(await studio.service.list()).toHaveLength(1);

    expect((await studio.service.importFromApp('cap-20990101-000000-abcdef')).ok).toBe(false);
    expect((await make().service.importFromApp(item.id)).ok).toBe(false);
  });

  it('refuses an imported index entry whose file name is not the one its id makes', async () => {
    const source = join(dir, 'tampered');
    const store = createCaptureStore(source);
    await mkdir(store.dir, { recursive: true });
    const id = 'cap-20260101-120000-abcdef';
    await writeFile(join(store.dir, 'evil.png'), 'x');
    await writeFile(
      join(store.dir, 'index.json'),
      JSON.stringify({
        version: 1,
        captures: [
          {
            id,
            kind: 'screenshot',
            mode: 'screen',
            mime: 'image/png',
            fileName: 'evil.png',
            createdAt: 1,
            width: 1,
            height: 1,
            bytes: 1,
            sourceName: 'x',
          },
        ],
      }),
    );
    // The store does read the entry — it is the name check that refuses it.
    expect((await store.get(id))?.fileName).toBe('evil.png');
    const studio = make({ importFrom: { dataDir: source } });
    expect(await studio.service.importFromApp(id)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/not one this app can open/),
    });
    expect(await studio.service.list()).toEqual([]);
  });
});
