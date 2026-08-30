import { clipboard } from 'electron';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import { handle } from './handle';

/**
 * The system clipboard, write-only.
 *
 * Its own module rather than a member of the remote/shell group: that group is
 * about handing a URL to another program, whereas this writes to shared OS
 * state, and the read side is deliberately absent (see the bridge type).
 *
 * Why main owns this at all: the packaged renderer loads from `file://`, which
 * is not guaranteed to be a secure context, and the Async Clipboard API is
 * gated on one. A copy button that works under the dev server and silently
 * fails in the shipped dmg is the failure mode this avoids — and it would only
 * ever be noticed by a user, since the dev build is where every test runs.
 */
export function registerClipboardHandlers(): void {
  handle(
    CHANNELS.clipboardWriteText,
    schemas.ClipboardWriteTextRequest,
    (req) => {
      try {
        // Synchronous, which is why the schema caps the length: this call
        // blocks the main process, and a multi-megabyte write is a stalled UI.
        clipboard.writeText(req.text);
        return { ok: true };
      } catch (error) {
        // A clipboard the OS refuses (a locked session, a headless CI run) is
        // the user's environment, not a crash — the button simply reports that
        // it did not copy rather than claiming it did.
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    (issue) => ({ ok: false, message: issue }),
  );
}
