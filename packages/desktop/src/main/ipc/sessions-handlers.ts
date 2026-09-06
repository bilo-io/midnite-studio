import { CHANNELS, schemas } from '@midnite/studio-shared';

import {
  nullSessionHistoryStore,
  type SessionHistoryStore,
} from '../session-history-store';
import { handle, handleBare } from './handle';

/**
 * The sessions you closed — read, and unread.
 *
 * Three channels, and no writer: nothing appends here except a session ending,
 * which happens in `terminal-service.ts` where the ending is actually observed.
 * The renderer can only look at the archive and empty it.
 *
 * `diag-handlers.ts` is the crib — a module-level store, a `configure*` setter
 * injected at boot, and a `register*` that wires the channels. Deliberately
 * **not** `terminal-handlers.ts`, which keeps its `configureTerminals` over in
 * `terminal-service.ts`: that split makes sense for a store with a service
 * wrapped around it, and this store has none.
 *
 * Everything resolves. `handle` answers a validation failure with a value
 * rather than a rejection (`handle.ts`), so a malformed request arrives in the
 * renderer as an empty transcript rather than an opaque "Error invoking remote
 * method …" with the real cause gone.
 */

let store: SessionHistoryStore = nullSessionHistoryStore;

/** Injected at boot with a store rooted at `app.getPath('userData')`. */
export function configureSessions(next: SessionHistoryStore): void {
  store = next;
}

export function registerSessionsHandlers(): void {
  handleBare(CHANNELS.sessionsHistory, async () => ({ sessions: await store.list() }));

  handle<typeof schemas.SessionsTranscriptRequest, { bytes: Uint8Array }>(
    CHANNELS.sessionsTranscript,
    schemas.SessionsTranscriptRequest,
    async (req) => ({ bytes: await store.transcript(req.sessionId) }),
    // A record with no readable transcript is a normal outcome — evicted, or
    // never written because the session printed nothing.
    () => ({ bytes: new Uint8Array(0) }),
  );

  handle<typeof schemas.SessionsPurgeRequest, void>(
    CHANNELS.sessionsPurge,
    schemas.SessionsPurgeRequest,
    (req) => store.purge(req.sessionId),
    // Refusing to delete on a payload we could not read is the safe direction:
    // this is the only path that unlinks a transcript.
    () => undefined,
  );
}

/** Reset module state. Tests only. */
export function resetSessionsHandlersForTest(): void {
  store = nullSessionHistoryStore;
}
