import { CHANNELS, schemas } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import type { ForgePoller } from '../forge/forge-poller';
import { defaultLogger } from '../log';
import { handleSendFromSender } from './handle';

// One 'closed' listener per window, mirroring `pty-service.ts`'s
// `closedListenerBound` — a window that subscribes/unsubscribes across many
// forge views over its lifetime must not accumulate a second listener per
// call.
const closedListenerBound = new Set<number>();

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

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

  handleSendFromSender(
    CHANNELS.forgeSubscribe,
    schemas.ForgeSubscribeRequest,
    ({ repoId, kind }, win) => {
      if (!win) return;
      bindClosedCleanup(win);
      poller.subscribe(repoId, kind, win.id);
    },
    warnInvalid,
  );

  handleSendFromSender(
    CHANNELS.forgeUnsubscribe,
    schemas.ForgeUnsubscribeRequest,
    ({ repoId, kind }, win) => {
      if (!win) return;
      poller.unsubscribe(repoId, kind, win.id);
    },
    warnInvalid,
  );
}
