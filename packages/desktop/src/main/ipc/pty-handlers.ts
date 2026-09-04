import { CHANNELS, SCROLLBACK_BYTES, schemas } from '@midnite/studio-shared';
import { ipcMain, type BrowserWindow } from 'electron';

import { defaultLogger } from '../log';
import {
  createPty,
  fetchScrollbackSnapshot,
  killPty,
  resizePty,
  sessionIdFor,
  writePty,
} from '../pty-service';
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
export function registerPtyHandlers(_getWindow: () => BrowserWindow | null): void {
  handle(
    CHANNELS.ptyCreate,
    schemas.PtyCreateRequest,
    async (req) => {
      return createPty(req);
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  ipcMain.on(CHANNELS.ptyInput, (_event, raw: unknown) => {
    const parsed = schemas.PtyInputRequest.safeParse(raw);
    if (parsed.success) {
      writePty(parsed.data.ptyId, parsed.data.data);
    } else {
      // A malformed payload here is a bug somewhere upstream — logged
      // through the one log seam instead of vanishing (Phase 51 Theme F).
      defaultLogger(`[pty] rejected malformed ptyInput payload: ${parsed.error.message}`);
    }
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
    async ({ ptyId }) => {
      const sessionId = sessionIdFor(ptyId);
      if (!sessionId) return { bytes: new Uint8Array(0) };
      const bytes = await fetchScrollbackSnapshot(sessionId);
      return { bytes: trimScrollback(bytes, SCROLLBACK_BYTES) };
    },
    () => ({ bytes: new Uint8Array(0) }),
  );
}
