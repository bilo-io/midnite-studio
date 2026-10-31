import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureFileUrl,
  CLIPBOARD_HISTORY_MAX_ENTRIES,
  CLIPBOARD_TEXT_MAX_BYTES,
  clipboardImageUrl,
} from '@midnite/studio-shared';

import { createCaptureStore } from './capture-store';
import { createClipboardHistory } from './clipboard-history';
import { createDisplayMediaGate } from './display-media';
import { resolveCaptureFileUrl } from './file-url';
import { readPermission, requestPermission } from './permission';
import { createRecordingWriter, PARTIAL_DIR } from './recording';
import { createSettingsStore } from './settings-store';
import { createShortcutManager } from './shortcut';
import { createRegionState, fullPixelSize, regionPixels } from './stills';
import { fakeElectron, fakeImage, manualTimers, tempDir, webmChunk } from './test-fixtures';

let dir = '';
let cleanup: () => Promise<void> = async () => undefined;
beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
});
afterEach(() => cleanup());

describe('permission', () => {
  it('reads the status, and anything off macOS is unsupported', () => {
    expect(readPermission(fakeElectron({ status: 'granted' }))).toBe('granted');
    expect(readPermission(fakeElectron({ status: 'denied' }))).toBe('denied');
    expect(readPermission(fakeElectron({ status: 'unknown' }))).toBe('not-determined');
    expect(readPermission(fakeElectron({ platform: 'linux', status: 'denied' }))).toBe(
      'unsupported',
    );
  });

  it('asks macOS once, and only while the answer is not in yet — never a prompt loop', async () => {
    const el = fakeElectron({ status: 'not-determined' });
    el.getSources = async (options) => {
      el.sourcesCalls.push({ types: [...options.types], thumbnailSize: options.thumbnailSize });
      el.status = 'granted';
      return [];
    };
    expect(await requestPermission(el)).toBe('granted');
    expect(el.sourcesCalls).toEqual([
      { types: ['screen'], thumbnailSize: { width: 1, height: 1 } },
    ]);

    const denied = fakeElectron({ status: 'denied' });
    expect(await requestPermission(denied)).toBe('denied');
    expect(denied.sourcesCalls).toEqual([]);
  });
});

describe('shortcut', () => {
  it('registers one chord, swaps it, and releases it on dispose', () => {
    const el = fakeElectron();
    const manager = createShortcutManager(el.globalShortcut, () => undefined, { enabled: true });
    expect(manager.state().state).toBe('off');
    expect(manager.apply('CommandOrControl+Shift+2').state).toBe('registered');
    expect([...el.shortcuts.keys()]).toEqual(['CommandOrControl+Shift+2']);
    manager.apply('Alt+Shift+S');
    expect([...el.shortcuts.keys()]).toEqual(['Alt+Shift+S']);
    manager.apply(null);
    expect(el.shortcuts.size).toBe(0);
    manager.apply('Alt+Shift+S');
    manager.dispose();
    expect(el.shortcuts.size).toBe(0);
  });

  it('reports a chord another app holds as a conflict, and a malformed one as invalid', () => {
    const el = fakeElectron();
    el.taken.add('CommandOrControl+Shift+4');
    const manager = createShortcutManager(el.globalShortcut, () => undefined, { enabled: true });
    const conflict = manager.apply('CommandOrControl+Shift+4');
    expect(conflict.state).toBe('conflict');
    expect(conflict.message).toMatch(/already used/);
    expect(manager.apply('Bogus+Chord').state).toBe('invalid');
    expect(el.shortcuts.size).toBe(0);
  });

  it('registers nothing when disabled (a smoke run)', () => {
    const el = fakeElectron();
    const manager = createShortcutManager(el.globalShortcut, () => undefined, { enabled: false });
    expect(manager.apply('CommandOrControl+Shift+2').state).toBe('disabled');
    expect(el.shortcuts.size).toBe(0);
  });
});

describe('display-media gate', () => {
  const app = (origin: string) => origin === 'file://' || origin === 'http://localhost:5173';
  const mainFrame = { url: 'file:///app/index.html', parent: null };

  it('refuses an unarmed request, answers an armed one once, and expires an unused arm', () => {
    let now = 0;
    const gate = createDisplayMediaGate({ isAppOrigin: app, now: () => now, ttlMs: 1000 });
    const answers: unknown[] = [];
    gate.handleRequest({ frame: mainFrame, videoRequested: true }, (s) => answers.push(s));
    gate.arm({ id: 'screen:1:0', name: 'Built-in' });
    gate.handleRequest({ frame: mainFrame, videoRequested: true }, (s) => answers.push(s));
    gate.handleRequest({ frame: mainFrame, videoRequested: true }, (s) => answers.push(s));
    expect(answers).toEqual([{}, { video: { id: 'screen:1:0', name: 'Built-in' } }, {}]);
    expect(gate.lastStreamed()).toEqual({ id: 'screen:1:0', name: 'Built-in' });

    gate.arm({ id: 'screen:1:0', name: 'Built-in' });
    now = 1001;
    expect(gate.armed()).toBeNull();
  });

  it('answers only the app origin in its main frame', () => {
    const gate = createDisplayMediaGate({ isAppOrigin: app });
    const answers: unknown[] = [];
    gate.arm({ id: 'screen:1:0', name: 'x' });
    gate.handleRequest({ frame: { url: 'https://evil.example/', parent: null } }, (s) =>
      answers.push(s),
    );
    gate.handleRequest({ frame: { url: 'file:///app/index.html', parent: {} } }, (s) =>
      answers.push(s),
    );
    expect(answers).toEqual([{}, {}]);
    expect(gate.armed()).not.toBeNull();
  });

  it('allows the screen permission only while armed, from the app, for video alone', () => {
    const gate = createDisplayMediaGate({ isAppOrigin: app });
    const details = { requestingUrl: 'file:///app/index.html', isMainFrame: true };
    expect(gate.allowsPermission('display-capture', details)).toBe(false);
    gate.arm({ id: 'screen:1:0', name: 'x' });
    expect(gate.allowsPermission('display-capture', details)).toBe(true);
    expect(gate.allowsPermission('media', { ...details, mediaTypes: ['video'] })).toBe(true);
    expect(gate.allowsPermission('media', { ...details, mediaTypes: ['video', 'audio'] })).toBe(
      false,
    );
    expect(gate.allowsPermission('geolocation', details)).toBe(false);
    expect(
      gate.allowsPermission('display-capture', { requestingUrl: 'https://evil.example/' }),
    ).toBe(false);
    expect(gate.allowsPermission('display-capture', { ...details, isMainFrame: false })).toBe(
      false,
    );
  });
});

describe('stills', () => {
  it('asks for the largest display at full pixels', () => {
    expect(fullPixelSize(fakeElectron())).toEqual({ width: 5120, height: 2880 });
  });

  it('turns a fractional region into clamped pixels', () => {
    expect(
      regionPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, { width: 1000, height: 800 }),
    ).toEqual({
      x: 250,
      y: 400,
      width: 500,
      height: 200,
    });
    expect(
      regionPixels({ x: 1, y: 1, width: 0.000001, height: 0.000001 }, { width: 10, height: 10 }),
    ).toEqual({
      x: 9,
      y: 9,
      width: 1,
      height: 1,
    });
  });

  it('keeps one frozen frame in memory, takeable once, until it expires', () => {
    let now = 0;
    const region = createRegionState(() => now);
    const frame = region.freeze(fakeImage(3200, 2000), 'Studio Display');
    expect(frame.preview.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(frame).toMatchObject({ width: 3200, height: 2000, sourceName: 'Studio Display' });
    expect(region.pending()?.pendingId).toBe(frame.pendingId);
    expect(region.take('pend-000000')).toBeNull();
    expect(region.take(frame.pendingId)?.frame.pendingId).toBe(frame.pendingId);
    expect(region.take(frame.pendingId)).toBeNull();
    region.freeze(fakeImage(10, 10), 'x');
    now = 5 * 60_000 + 1;
    expect(region.pending()).toBeNull();
  });
});

describe('capture store', () => {
  it('names files itself, lists newest first and forgets a file deleted behind its back', async () => {
    let t = new Date(2026, 9, 18, 9, 30, 0);
    const store = createCaptureStore(dir, () => t);
    const a = await store.add({
      id: store.newId(),
      kind: 'screenshot',
      mode: 'screen',
      mime: 'image/png',
      createdAt: 1,
      bytes: new Uint8Array([1]),
    });
    t = new Date(2026, 9, 18, 9, 31, 0);
    const b = await store.add({
      id: store.newId(),
      kind: 'screenshot',
      mode: 'window',
      mime: 'image/png',
      createdAt: 2,
      bytes: new Uint8Array([2, 2]),
    });
    expect(a.fileName).toMatch(/^cap-20261018-093000-[0-9a-f]{8}\.png$/);
    expect((await store.list()).map((c) => c.id)).toEqual([b.id, a.id]);
    expect(b.bytes).toBe(2);
    await rm(store.pathOf(a));
    expect((await store.list()).map((c) => c.id)).toEqual([b.id]);
    expect(await store.get('../../etc/passwd')).toBeNull();
    // A fresh store reads the index back.
    expect((await createCaptureStore(dir).list()).map((c) => c.id)).toEqual([b.id]);
  });
});

describe('settings store', () => {
  it('starts from the composer defaults and keeps a patch', async () => {
    const settings = createSettingsStore(dir, {
      shortcut: null,
      clipboardHistory: false,
      hideWindows: true,
    });
    expect(await settings.read()).toEqual({
      shortcut: null,
      clipboardHistory: false,
      hideWindows: true,
    });
    await settings.write({ clipboardHistory: true });
    const again = createSettingsStore(dir, {
      shortcut: 'Alt+Shift+S',
      clipboardHistory: false,
      hideWindows: true,
    });
    expect(await again.read()).toEqual({
      shortcut: null,
      clipboardHistory: true,
      hideWindows: true,
    });
  });

  it('falls back to defaults on a corrupt file', async () => {
    await writeFile(join(dir, 'settings.json'), '{nope');
    const settings = createSettingsStore(dir, {
      shortcut: null,
      clipboardHistory: false,
      hideWindows: false,
    });
    expect((await settings.read()).hideWindows).toBe(false);
  });
});

describe('recording writer', () => {
  it('writes chunks under .partial and renames the file into place on finish', async () => {
    const store = createCaptureStore(dir);
    const writer = createRecordingWriter(store);
    const begun = await writer.begin('video/webm;codecs=vp9');
    if (!begun.ok) throw new Error('begin failed');
    const id = begun.value.recordingId;
    expect((await writer.chunk(id, webmChunk(64))).ok).toBe(true);
    expect((await writer.chunk(id, new Uint8Array(16))).ok).toBe(true);
    expect(await readdir(join(store.dir, PARTIAL_DIR))).toHaveLength(1);
    const done = await writer.finish(id, 1500, { name: 'Terminal', mode: 'window' });
    if (!done.ok) throw new Error('finish failed');
    expect(done.value).toMatchObject({
      kind: 'recording',
      mode: 'window',
      mime: 'video/webm',
      bytes: 80,
      durationMs: 1500,
      sourceName: 'Terminal',
    });
    expect(await readdir(join(store.dir, PARTIAL_DIR))).toEqual([]);
    expect((await readFile(store.pathOf(done.value))).byteLength).toBe(80);
  });

  it('refuses a first chunk that is not WebM and drops the partial file', async () => {
    const store = createCaptureStore(dir);
    const writer = createRecordingWriter(store);
    const begun = await writer.begin('video/webm');
    if (!begun.ok) throw new Error('begin failed');
    const result = await writer.chunk(
      begun.value.recordingId,
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(result).toMatchObject({ ok: false, message: 'A recording must be WebM.' });
    expect(await readdir(join(store.dir, PARTIAL_DIR))).toEqual([]);
    expect(await store.list()).toEqual([]);
  });

  it('stops a recording at its size cap and at an oversized chunk', async () => {
    const store = createCaptureStore(dir);
    const writer = createRecordingWriter(store, { maxBytes: 100, chunkMaxBytes: 60 });
    const first = await writer.begin('video/webm');
    if (!first.ok) throw new Error('begin failed');
    expect((await writer.chunk(first.value.recordingId, webmChunk(50))).ok).toBe(true);
    expect((await writer.chunk(first.value.recordingId, webmChunk(55))).ok).toBe(false);
    const second = await writer.begin('video/webm');
    if (!second.ok) throw new Error('begin failed');
    expect((await writer.chunk(second.value.recordingId, webmChunk(61))).ok).toBe(false);
    expect(await readdir(join(store.dir, PARTIAL_DIR))).toEqual([]);
  });

  it('allows one recording at a time and cleans up on dispose', async () => {
    const store = createCaptureStore(dir);
    const writer = createRecordingWriter(store);
    expect((await writer.begin('video/webm')).ok).toBe(true);
    expect((await writer.begin('video/webm')).ok).toBe(false);
    await writer.dispose();
    expect(await readdir(join(store.dir, PARTIAL_DIR))).toEqual([]);
  });
});

describe('clipboard history', () => {
  const make = (el = fakeElectron()) => {
    const timers = manualTimers();
    let changes = 0;
    const history = createClipboardHistory({
      dataDir: dir,
      clipboard: el.clip,
      imageFromPng: el.imageFromPng,
      onChanged: () => (changes += 1),
      timers,
    });
    return { el, history, timers, changes: () => changes };
  };

  it('reads nothing until started, and nothing after it stops', async () => {
    const { el, history, timers } = make();
    el.clip.set({ text: 'hello' });
    expect(el.clip.reads).toBe(0);
    expect(timers.live.size).toBe(0);
    history.start();
    expect(timers.live.size).toBe(1);
    history.stop();
    expect(timers.live.size).toBe(0);
    const reads = el.clip.reads;
    timers.fire();
    expect(el.clip.reads).toBe(reads);
  });

  it('keeps what is copied after it starts, not what was already there', async () => {
    const { el, history } = make();
    el.clip.set({ text: 'already here' });
    history.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(await history.tick()).toBe(false);
    el.clip.set({ text: 'copied later' });
    expect(await history.tick()).toBe(true);
    expect((await history.list()).map((e) => (e.kind === 'text' ? e.text : e.id))).toEqual([
      'copied later',
    ]);
    history.stop();
  });

  it('never keeps — or even reads — a concealed, transient or auto-generated entry', async () => {
    const { el, history } = make();
    const readText = vi.spyOn(el.clip, 'readText');
    const availableFormats = vi.spyOn(el.clip, 'availableFormats');
    for (const marker of [
      'org.nspasteboard.ConcealedType',
      'org.nspasteboard.TransientType',
      'org.nspasteboard.AutoGeneratedType',
    ]) {
      el.clip.set({ text: `secret via ${marker}`, markers: [marker] });
      availableFormats.mockClear();
      expect(await history.tick()).toBe(false);
      // Electron 44+ lists formats through `clipboard.read()`, so a `has()` hit stops before it.
      expect(availableFormats).not.toHaveBeenCalled();
      el.clip.set({ text: `secret listed ${marker}`, formats: ['text/plain', marker] });
      expect(await history.tick()).toBe(false);
    }
    expect(await history.list()).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
    expect(readText).not.toHaveBeenCalled();
  });

  it('keeps images as PNG files, skips oversized text and moves a repeat to the top', async () => {
    const { el, history } = make();
    el.clip.set({ image: fakeImage(40, 30, 'pic') });
    expect(await history.tick()).toBe(true);
    el.clip.set({ text: 'x'.repeat(CLIPBOARD_TEXT_MAX_BYTES + 1) });
    expect(await history.tick()).toBe(false);
    el.clip.set({ text: 'one' });
    await history.tick();
    el.clip.set({ text: 'two' });
    await history.tick();
    el.clip.set({ text: 'one' });
    await history.tick();
    const entries = await history.list();
    expect(entries.map((e) => (e.kind === 'text' ? e.text : 'image'))).toEqual([
      'one',
      'two',
      'image',
    ]);
    const image = entries[2]!;
    expect(image).toMatchObject({ kind: 'image', width: 40, height: 30 });
    expect(await readdir(join(dir, 'clipboard'))).toContain(`${image.id}.png`);
  });

  it('evicts the oldest past the entry cap, deleting their files', async () => {
    const { el, history } = make();
    el.clip.set({ image: fakeImage(5, 5, 'first') });
    await history.tick();
    for (let i = 0; i < CLIPBOARD_HISTORY_MAX_ENTRIES; i += 1) {
      el.clip.set({ text: `entry ${i}` });
      await history.tick();
    }
    const entries = await history.list();
    expect(entries).toHaveLength(CLIPBOARD_HISTORY_MAX_ENTRIES);
    expect(entries.every((e) => e.kind === 'text')).toBe(true);
    expect((await readdir(join(dir, 'clipboard'))).filter((f) => f.endsWith('.png'))).toEqual([]);
  });

  it('copies an entry back, deletes one, and clears everything', async () => {
    const { el, history, changes } = make();
    el.clip.set({ text: 'keep me' });
    await history.tick();
    el.clip.set({ image: fakeImage(4, 4) });
    await history.tick();
    const [image, text] = await history.list();
    expect(await history.copy(text!.id)).toEqual({ ok: true });
    expect(await history.copy(image!.id)).toEqual({ ok: true });
    expect(el.clip.written.map((w) => w.kind)).toEqual(['text', 'image']);
    await history.remove(text!.id);
    expect((await history.list()).map((e) => e.id)).toEqual([image!.id]);
    await history.clear();
    expect(await history.list()).toEqual([]);
    expect((await readdir(join(dir, 'clipboard'))).filter((f) => f.endsWith('.png'))).toEqual([]);
    expect(changes()).toBeGreaterThanOrEqual(4);
  });
});

describe('file resolver', () => {
  const dirs = { captures: '/data/captures', clipboard: '/data/clipboard' };

  it('resolves only generated names inside the two directories', () => {
    expect(resolveCaptureFileUrl(dirs, captureFileUrl('cap-20261018-093000-abcdef12.png'))).toBe(
      '/data/captures/cap-20261018-093000-abcdef12.png',
    );
    expect(resolveCaptureFileUrl(dirs, clipboardImageUrl('clip-abcdef'))).toBe(
      '/data/clipboard/clip-abcdef.png',
    );
    for (const bad of [
      'mstudio-file://capture/captures/..%2Fsettings.json',
      'mstudio-file://capture/captures/index.json',
      'mstudio-file://capture/clipboard/history.json',
      'mstudio-file://capture/other/cap-20261018-093000-abcdef12.png',
      'mstudio-file://capture/captures/sub/cap-20261018-093000-abcdef12.png',
      'mstudio-file://library/captures/cap-20261018-093000-abcdef12.png',
      'not a url',
    ])
      expect(resolveCaptureFileUrl(dirs, bad), bad).toBeNull();
  });

  it('serves real files from a store directory', async () => {
    const store = createCaptureStore(dir);
    await mkdir(store.dir, { recursive: true });
    const item = await store.add({
      id: store.newId(),
      kind: 'screenshot',
      mode: 'screen',
      mime: 'image/png',
      createdAt: 1,
      bytes: new Uint8Array([9]),
    });
    expect(
      resolveCaptureFileUrl({ captures: store.dir, clipboard: '' }, captureFileUrl(item.fileName)),
    ).toBe(store.pathOf(item));
  });
});
