import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

const { fakeIpc } = vi.hoisted(() => {
  // `vi.hoisted` runs before imports, so the emitter is built from the CJS builtin.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: Emitter } = require('node:events') as typeof import('node:events');
  return { fakeIpc: new Emitter() };
});

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
