import { CHANNELS, SCROLLBACK_BYTES, schemas } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { defaultLogger } from '../log';
import {
  createPty,
  fetchScrollbackSnapshot,
  killPty,
  resizePty,
  sessionIdFor,
  subscribeWindowToPty,
  unsubscribeWindowFromPty,
  writePty,
} from '../pty-service';
import { trimScrollback } from '../terminal-store';
import { handle, handleSend, handleSendFromSender } from './handle';

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

/**
 * Terminal IPC.
 *
 * `create` is an `invoke` because the renderer needs the id (or the failure
 * message) back. Input, resize and kill are one-way `send`s: they are fired on
 * every keystroke and every resize frame, and a round-trip per keystroke would
 * add latency to typing for no benefit — there is nothing to report back.
 */
export function registerPtyHandlers(_getWindow: () => BrowserWindow | null): void {
  handle(
    CHANNELS.ptyCreate,
    schemas.PtyCreateRequest,
    async (req) => {
      return createPty(req);
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  handleSend(
    CHANNELS.ptyInput,
    schemas.PtyInputRequest,
    ({ ptyId, data }) => writePty(ptyId, data),
    warnInvalid,
  );

  handleSend(
    CHANNELS.ptyResize,
    schemas.PtyResizeRequest,
    ({ ptyId, cols, rows }) => resizePty(ptyId, cols, rows),
    warnInvalid,
  );

  handleSend(CHANNELS.ptyKill, schemas.PtyKillRequest, ({ ptyId }) => killPty(ptyId), warnInvalid);

  handle(
    CHANNELS.ptySnapshot,
    schemas.PtySnapshotRequest,
    async ({ ptyId }) => {
      const sessionId = sessionIdFor(ptyId);
      if (!sessionId) return { bytes: new Uint8Array(0) };
      const bytes = await fetchScrollbackSnapshot(sessionId);
      return { bytes: trimScrollback(bytes, SCROLLBACK_BYTES) };
    },
    () => ({ bytes: new Uint8Array(0) }),
  );

  // Sender-resolved (Phase 55): a popout terminal subscribes ITSELF to a
  // ptyId's output, so `ptyData`/`ptyExit` reach every window rendering that
  // session rather than only the main window — see the registry in
  // `pty-service.ts`.
  handleSendFromSender(
    CHANNELS.ptySubscribe,
    schemas.PtySubscribeRequest,
    ({ ptyId }, win) => {
      if (win) subscribeWindowToPty(ptyId, win);
    },
    warnInvalid,
  );

  handleSendFromSender(
    CHANNELS.ptyUnsubscribe,
    schemas.PtyUnsubscribeRequest,
    ({ ptyId }, win) => {
      if (win) unsubscribeWindowFromPty(ptyId, win);
    },
    warnInvalid,
  );
}
