import { CHANNELS, schemas } from '@midnite/studio-shared';
import { ipcMain, type BrowserWindow } from 'electron';

import type { ForgePoller } from '../forge/forge-poller';
import { resolveWindow } from '../window-manager';

// One 'closed' listener per window, mirroring `pty-service.ts`'s
// `closedListenerBound` — a window that subscribes/unsubscribes across many
// forge views over its lifetime must not accumulate a second listener per
// call.
const closedListenerBound = new Set<number>();

/**
 * Phase 84 Theme C — a window registers (and drops) interest in one
 * `{repoId, kind}` forge listing. Sender-resolved, the same distrust
 * `windowReportRepo` applies: a renderer subscribes for itself only, never
 * for another window's id.
 */
export function registerForgePollHandlers(poller: ForgePoller): void {
  const bindClosedCleanup = (win: BrowserWindow): void => {
    if (closedListenerBound.has(win.id)) return;
    closedListenerBound.add(win.id);
    win.once('closed', () => {
      closedListenerBound.delete(win.id);
      poller.dropWindow(win.id);
    });
  };

  ipcMain.on(CHANNELS.forgeSubscribe, (event, raw: unknown) => {
    const parsed = schemas.ForgeSubscribeRequest.safeParse(raw);
    const win = resolveWindow(event.sender);
    if (!parsed.success || !win) return;
    bindClosedCleanup(win);
    poller.subscribe(parsed.data.repoId, parsed.data.kind, win.id);
  });

  ipcMain.on(CHANNELS.forgeUnsubscribe, (event, raw: unknown) => {
    const parsed = schemas.ForgeUnsubscribeRequest.safeParse(raw);
    const win = resolveWindow(event.sender);
    if (!parsed.success || !win) return;
    poller.unsubscribe(parsed.data.repoId, parsed.data.kind, win.id);
  });
}
