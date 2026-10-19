import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

const fakeIpc = await vi.hoisted(async () => new (await import('node:events')).EventEmitter());

vi.mock('electron', () => ({
  app: { isPackaged: false, getVersion: () => '0.0.0' },
  BrowserWindow: class {},
  shell: { openPath: vi.fn() },
  ipcMain: Object.assign(fakeIpc, { handle: vi.fn() }),
}));
vi.mock('electron-updater', () => ({ autoUpdater: new EventEmitter() }));
vi.mock('./browser-port', () => ({}));
vi.mock('./log', () => ({ defaultLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { UPDATER_CHANNELS, registerUpdater } from './update-service';

describe('registerUpdater (Phase 91 Theme F)', () => {
  it('leaves exactly one listener per updater channel, even if called twice', () => {
    registerUpdater(() => null);
    registerUpdater(() => null);
    for (const channel of UPDATER_CHANNELS) {
      expect(fakeIpc.listenerCount(channel)).toBe(1);
    }
  });
});
