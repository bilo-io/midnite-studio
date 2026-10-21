import { browserMain, type BrowserHostWindow } from '@midnite/studio-feature-browser/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import type { BrowserWindow } from 'electron';

import { asBrowserHostWindow, createStudioBrowserElectron } from '../browser-port';
import { defaultLogger } from '../log';
import { currentSettings } from '../settings-mirror';
import { handle, handleBare, handleFromSender, handleSend, handleSendFromSender } from './handle';

/**
 * Studio's composition of the browser feature's main half (Phase 113 Theme L). The browser and
 * web-apps services, `browser-security.ts` and every `mstudio:browser:*`/`mstudio:web-apps:*` channel
 * live in `@midnite/studio-feature-browser/main`; this file hands it what only Studio has — Electron,
 * the logger, the settings mirror, its windows, and the sender-resolved `handle.ts` helpers the
 * browser's `create`/`setBounds`/`setVisible` always registered through.
 */
export function registerBrowserFeatureHandlers(getMainWindow: () => BrowserWindow | null): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('the browser never trashes')),
  };
  const asHost = (win: BrowserWindow | null): BrowserHostWindow | null => (win ? asBrowserHostWindow(win) : null);
  browserMain.register(ctx, {
    electron: createStudioBrowserElectron(),
    log: defaultLogger,
    readDiscardSettings: () => currentSettings(),
    sender: {
      handleFromSender: (channel, schema, handler, onInvalid) =>
        handleFromSender(channel, schema, (payload, win) => handler(payload, asHost(win)), onInvalid),
      sendFromSender: (channel, schema, handler, onInvalid) =>
        handleSendFromSender(channel, schema, (payload, win) => handler(payload, asHost(win)), onInvalid),
    },
    getMainWindow: () => asHost(getMainWindow()),
  });
}
