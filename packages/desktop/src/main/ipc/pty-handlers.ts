import { CHANNELS, SCROLLBACK_BYTES, schemas } from '@midnite/git-shared';
import { ipcMain, type BrowserWindow } from 'electron';

import { createPty, killPty, readScrollback, resizePty, sessionIdFor, writePty } from '../pty-service';
import { trimScrollback } from '../terminal-store';
import { handle } from './handle';

/**
 * Terminal IPC.
 *
 * `create` is an `invoke` because the renderer needs the id (or the failure
 * message) back. Input, resize and kill are one-way `send`s: they are fired on
 * every keystroke and every resize frame, and a round-trip per keystroke would
 * add latency to typing for no benefit — there is nothing to report back.
 */
export function registerPtyHandlers(getWindow: () => BrowserWindow | null): void {
  handle(
    CHANNELS.ptyCreate,
    schemas.PtyCreateRequest,
    (req) => {
      const win = getWindow();
      if (!win) return { ok: false as const, message: 'No window.' };
      return createPty(win, req);
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  ipcMain.on(CHANNELS.ptyInput, (_event, raw: unknown) => {
    const parsed = schemas.PtyInputRequest.safeParse(raw);
    if (parsed.success) writePty(parsed.data.ptyId, parsed.data.data);
  });

  ipcMain.on(CHANNELS.ptyResize, (_event, raw: unknown) => {
    const parsed = schemas.PtyResizeRequest.safeParse(raw);
    if (parsed.success) resizePty(parsed.data.ptyId, parsed.data.cols, parsed.data.rows);
  });

  ipcMain.on(CHANNELS.ptyKill, (_event, raw: unknown) => {
    const parsed = schemas.PtyKillRequest.safeParse(raw);
    if (parsed.success) killPty(parsed.data.ptyId);
  });

  handle(
    CHANNELS.ptySnapshot,
    schemas.PtySnapshotRequest,
    ({ ptyId }) => {
      const sessionId = sessionIdFor(ptyId);
      if (!sessionId) return { bytes: new Uint8Array(0) };
      return { bytes: trimScrollback(readScrollback(sessionId), SCROLLBACK_BYTES) };
    },
    () => ({ bytes: new Uint8Array(0) }),
  );
}
