import { readFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRecordingContext } from '@midnite/studio-runtime';
import {
  CAPTURE_DEFAULT_SETTINGS,
  CHANNELS,
  EVENT_CHANNELS,
  type CaptureChanged,
  type CaptureItem,
  type CaptureStatus,
} from '@midnite/studio-shared';

import { captureManifest } from '../manifest';
import { createDisplayMediaGate } from './display-media';
import { captureEmitter, captureMain } from './index';
import { createCaptureService, type CaptureServiceDeps } from './service';
import { fakeElectron, manualTimers, tempDir, webmChunk, type FakeElectron } from './test-fixtures';

let dir = '';
let cleanup: () => Promise<void> = async () => undefined;
beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
});
afterEach(() => cleanup());

function make(over: Partial<CaptureServiceDeps> & { el?: FakeElectron } = {}) {
  const el = over.el ?? fakeElectron();
  const events: CaptureChanged[] = [];
  const trashed: string[] = [];
  const timers = manualTimers();
  const gate = createDisplayMediaGate({ isAppOrigin: (o) => o === 'file://' });
  const service = createCaptureService({
    dataDir: dir,
    electron: el,
    defaults: CAPTURE_DEFAULT_SETTINGS,
    emit: (p) => events.push(p),
    trashItem: async (p) => {
      trashed.push(p);
    },
    gate,
    background: { shortcut: true, clipboard: true },
    timers,
    ...over,
  });
  return { el, service, events, trashed, timers, gate };
}

const value = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result)}`);
  return result.value;
};

describe('capture service', () => {
  it('starts with clipboard history off, no chord in Studio defaults, and nothing read', async () => {
    const { el, service, timers } = make();
    await service.start();
    const status = await service.status();
    expect(status.settings).toEqual({ shortcut: null, clipboardHistory: false, hideWindows: true });
    expect(status.shortcut.state).toBe('off');
    expect(el.shortcuts.size).toBe(0);
    expect(timers.live.size).toBe(0);
    expect(el.clip.reads).toBe(0);
    expect(el.sourcesCalls).toEqual([]);
  });

  it('takes nothing without the permission, and explains instead of prompting', async () => {
    const { el, service } = make({ el: fakeElectron({ status: 'denied' }) });
    const still = await service.still({ mode: 'screen', sourceId: 'screen:1:0' });
    expect(still).toMatchObject({ ok: false, message: expect.stringMatching(/System Settings/) });
    expect(value(await service.sources('screen'))).toEqual({ permission: 'denied', sources: [] });
    expect((await service.regionBegin()).ok).toBe(false);
    expect((await service.recordingArm('screen:1:0')).ok).toBe(false);
    expect(el.sourcesCalls).toEqual([]);
    expect(await service.list()).toEqual([]);
    await service.openPermissionSettings();
    expect(el.settingsOpened).toBe(1);
  });

  it('takes a full-screen still with its own windows hidden for the moment of the grab', async () => {
    const { el, service, events } = make();
    const item = value(await service.still({ mode: 'screen', sourceId: 'screen:2:0' }));
    expect(item).toMatchObject({ kind: 'screenshot', mode: 'screen', mime: 'image/png', width: 5120, height: 2880, sourceName: 'Studio Display' });
    expect(el.hidden).toBe(1);
    expect(el.restored).toBe(1);
    expect(el.sourcesCalls.at(-1)?.thumbnailSize).toEqual({ width: 5120, height: 2880 });
    expect(events).toContainEqual({ reason: 'captures', captureId: item.id });
    expect((await service.list()).map((c) => c.id)).toEqual([item.id]);
  });

  it('never hides its windows for a window grab, and refuses a mode/source mismatch', async () => {
    const { el, service } = make();
    value(await service.still({ mode: 'window', sourceId: 'window:42:0' }));
    expect(el.hidden).toBe(0);
    expect((await service.still({ mode: 'window', sourceId: 'screen:1:0' })).ok).toBe(false);
    expect((await service.still({ mode: 'screen', sourceId: 'screen:9:0' })).ok).toBe(false);
  });

  it('freezes the screen under the pointer and crops the dragged region from the full frame', async () => {
    const { service } = make();
    const frame = value(await service.regionBegin());
    expect(frame).toMatchObject({ width: 5120, height: 2880, sourceName: 'Studio Display' });
    expect(service.regionPending()?.pendingId).toBe(frame.pendingId);
    const item = value(await service.regionFinish(frame.pendingId, { x: 0.5, y: 0.5, width: 0.25, height: 0.25 }));
    expect(item).toMatchObject({ mode: 'region', width: 1280, height: 720 });
    expect(service.regionPending()).toBeNull();
    expect((await service.regionFinish(frame.pendingId, { x: 0, y: 0, width: 1, height: 1 })).ok).toBe(false);
  });

  it('a cancelled region leaves nothing on disk', async () => {
    const { service } = make();
    const frame = value(await service.regionBegin('screen:1:0'));
    service.regionCancel(frame.pendingId);
    expect(service.regionPending()).toBeNull();
    expect(await service.list()).toEqual([]);
  });

  it('records only a source the user armed and the gate streamed', async () => {
    const { service, gate, events } = make();
    expect((await service.recordingBegin('video/webm')).ok).toBe(false);
    expect((await service.recordingArm('window:99:0')).ok).toBe(false);
    expect((await service.recordingArm('window:42:0')).ok).toBe(true);
    gate.handleRequest({ frame: { url: 'file:///index.html', parent: null } }, () => undefined);
    const { recordingId } = value(await service.recordingBegin('video/webm;codecs=vp9'));
    expect((await service.recordingChunk(recordingId, webmChunk(40))).ok).toBe(true);
    const item = value(await service.recordingFinish(recordingId, 2000));
    expect(item).toMatchObject({ kind: 'recording', mode: 'window', sourceName: 'Terminal', durationMs: 2000, bytes: 40 });
    expect(events).toContainEqual({ reason: 'captures', captureId: item.id });
  });

  it('offers no recording without a gate', async () => {
    const { service } = make({ gate: null });
    expect((await service.status()).canRecord).toBe(false);
    expect((await service.recordingArm('screen:1:0')).ok).toBe(false);
  });

  it('copies a screenshot to the clipboard, reveals it, and trashes it on delete', async () => {
    const { el, service, trashed } = make();
    const item = value(await service.still({ mode: 'screen', sourceId: 'screen:1:0' }));
    expect(await service.copy(item.id)).toEqual({ ok: true });
    expect(el.clip.written).toHaveLength(1);
    await service.reveal(item.id);
    expect(el.revealed).toEqual([service.store.pathOf(item)]);
    expect(await service.remove(item.id)).toEqual({ ok: true });
    expect(trashed).toEqual([service.store.pathOf(item)]);
    expect(await service.list()).toEqual([]);
  });

  it('registers the chord on change, reports a conflict, and releases it on dispose', async () => {
    const { el, service } = make();
    el.taken.add('CommandOrControl+Shift+4');
    const conflict = value(await service.setSettings({ shortcut: 'CommandOrControl+Shift+4' })) as CaptureStatus;
    expect(conflict.shortcut.state).toBe('conflict');
    const ok = value(await service.setSettings({ shortcut: 'CommandOrControl+Shift+2' })) as CaptureStatus;
    expect(ok.shortcut.state).toBe('registered');
    expect([...el.shortcuts.keys()]).toEqual(['CommandOrControl+Shift+2']);
    await service.dispose();
    expect(el.shortcuts.size).toBe(0);
  });

  it('starts and stops the clipboard poller with the setting', async () => {
    const { service, timers } = make();
    await service.setSettings({ clipboardHistory: true });
    expect(timers.live.size).toBe(1);
    expect(service.clipboard.running()).toBe(true);
    await service.setSettings({ clipboardHistory: false });
    expect(timers.live.size).toBe(0);
    expect((await service.clipboardList()).enabled).toBe(false);
  });

  it('in a smoke run takes no chord and never polls, whatever the settings say', async () => {
    const { el, service, timers } = make({ background: { shortcut: false, clipboard: false } });
    await service.setSettings({ shortcut: 'CommandOrControl+Shift+2', clipboardHistory: true });
    await service.start();
    expect(el.shortcuts.size).toBe(0);
    expect(timers.live.size).toBe(0);
    expect((await service.status()).shortcut.state).toBe('disabled');
  });

  it('the shortcut freezes a frame, brings the app forward and hands the picker the frame', async () => {
    const { el, service, events } = make();
    await service.onShortcut();
    expect(el.focused).toBe(1);
    const last = events.at(-1);
    expect(last?.reason).toBe('shortcut');
    expect(last?.region?.sourceName).toBe('Studio Display');
  });

  it('the shortcut without the permission only opens the explanation', async () => {
    const { el, service, events } = make({ el: fakeElectron({ status: 'not-determined' }) });
    await service.onShortcut();
    expect(events.at(-1)).toEqual({ reason: 'shortcut' });
    expect(el.sourcesCalls).toEqual([]);
  });

  it('gives a chat a text attachment naming the file, and imports a screenshot into Creator', async () => {
    const imports: Array<{ repoId: string; project: string; fileName: string; bytes: Uint8Array }> = [];
    const { service } = make({
      destinations: ['chat'],
      creator: {
        importImage: async (req) => {
          imports.push(req);
          return { ok: true, value: { project: req.project, path: req.fileName } };
        },
      },
    });
    expect((await service.status()).destinations).toEqual(['chat', 'creator']);
    const item: CaptureItem = value(await service.still({ mode: 'screen', sourceId: 'screen:1:0' }));
    const attachment = value(await service.attachment(item.id));
    expect(attachment.name).toBe(item.fileName);
    expect(attachment.text).toContain(service.store.pathOf(item));
    const sent = value(await service.sendToCreator(item.id, 'repo-1'));
    expect(sent).toEqual({ project: 'Captures', path: item.fileName });
    expect(imports[0]).toMatchObject({ repoId: 'repo-1', project: 'Captures', fileName: item.fileName });
    expect(Buffer.from(imports[0]!.bytes).equals(await readFile(service.store.pathOf(item)))).toBe(true);
  });

  it('offers no destinations by default (the standalone app)', async () => {
    const { service } = make();
    expect((await service.status()).destinations).toEqual([]);
    const item = value(await service.still({ mode: 'screen', sourceId: 'screen:1:0' }));
    expect((await service.sendToCreator(item.id, 'repo-1')).ok).toBe(false);
  });
});

describe('capture main', () => {
  it('registers exactly the manifest channels, validating payloads first', async () => {
    const ctx = createRecordingContext();
    const { service } = make();
    captureMain.register(ctx, { capture: service });
    expect([...ctx.channels].sort()).toEqual([...captureManifest.ipc].sort());
    expect(await ctx.invoke(CHANNELS.captureStill, { mode: 'screen', sourceId: '../../etc' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.captureDelete, { id: 'index.json' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.captureSettingsSet, { shortcut: 'rm -rf /' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.captureRecordingBegin, { mime: 'image/png' })).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.captureList)).toEqual({ captures: [] });
    expect(await ctx.invoke(CHANNELS.captureRegionPending)).toEqual({ frame: null });
  });

  it('binds its event to the composer emit', () => {
    const sent: unknown[] = [];
    captureEmitter((channel, payload) => sent.push([channel, payload]))({ reason: 'settings' });
    expect(sent).toEqual([[EVENT_CHANNELS.captureChanged, { reason: 'settings' }]]);
  });
});
