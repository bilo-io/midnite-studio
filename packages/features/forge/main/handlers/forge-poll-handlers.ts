import { CHANNELS, schemas } from '@midnite/studio-shared';
import type { z } from 'zod';

import type { ForgePoller } from '../forge-poller';

/**
 * What a composer gives the poll channels (Phase 113 Theme O): the sending
 * window's identity, which the runtime's plain `send` does not carry, and that
 * window's close. Studio's adapter is `handleSendFromSender` plus
 * `BrowserWindow.once('closed')`; an app with one window passes the same two.
 */
export type ForgePollSubscriptions = {
  /** A one-way channel whose handler learns the sending window's id (null when unknown). */
  sendFromSender<S extends z.ZodTypeAny>(
    channel: string,
    schema: S,
    handler: (payload: z.output<S>, windowId: number | null) => void,
    onInvalid: (issue: string) => void,
  ): void;
  /** Run `fn` once when window `windowId` closes. */
  onWindowClosed(windowId: number, fn: () => void): void;
  warn(message: string): void;
};

/**
 * Phase 84 Theme C — a window registers (and drops) interest in one
 * `{repoId, kind}` forge listing. Sender-resolved, the same distrust
 * `windowReportRepo` applies: a renderer subscribes for itself only, never
 * for another window's id.
 */
export function registerForgePollHandlers(poller: ForgePoller, subs: ForgePollSubscriptions): void {
  // One 'closed' listener per window — a window that subscribes/unsubscribes
  // across many forge views over its lifetime must not accumulate a second one.
  const closedListenerBound = new Set<number>();
  const bindClosedCleanup = (windowId: number): void => {
    if (closedListenerBound.has(windowId)) return;
    closedListenerBound.add(windowId);
    subs.onWindowClosed(windowId, () => {
      closedListenerBound.delete(windowId);
      poller.dropWindow(windowId);
    });
  };

  subs.sendFromSender(
    CHANNELS.forgeSubscribe,
    schemas.ForgeSubscribeRequest,
    ({ repoId, kind }, windowId) => {
      if (windowId === null) return;
      bindClosedCleanup(windowId);
      poller.subscribe(repoId, kind, windowId);
    },
    (issue) => subs.warn(issue),
  );

  subs.sendFromSender(
    CHANNELS.forgeUnsubscribe,
    schemas.ForgeUnsubscribeRequest,
    ({ repoId, kind }, windowId) => {
      if (windowId === null) return;
      poller.unsubscribe(repoId, kind, windowId);
    },
    (issue) => subs.warn(issue),
  );
}
